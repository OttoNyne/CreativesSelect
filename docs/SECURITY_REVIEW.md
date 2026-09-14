# Security Review — CreativesSelect / first-server

This covers the capstone rubric's Security Audit, Penetration Testing, and
Security Review Document items together. Every finding below was reproduced
against the running application (not inferred from reading code), and every
fix was re-verified after the change.

---

## 1. What was checked

- Secrets management (env vars, what's committed to git)
- Password storage
- JWT signing, expiration, and verification
- CORS configuration
- Error handling (does anything leak internals to the client?)
- Input validation on write routes
- Ownership enforcement on every user-scoped resource
- Privacy enforcement (the `isPrivate` profile setting) across every route
  that exposes a user's content, not just the profile page itself
- `npm audit` on both the frontend and backend
- Git history, for committed secrets

## 2. Security audit — baseline findings

| Check | Result |
|---|---|
| Hardcoded secrets in source | None. `JWT_SECRET`, `MONGODB_URI` live only in `.env`, which is gitignored from the first commit in both repos (verified via `git log --all --diff-filter=A --name-only \| grep .env` — no hits). |
| Password storage | `bcryptjs`, 12 salt rounds, hashed in a `pre("validate")` hook on the `User` model — plaintext is never persisted, and the plaintext password field isn't even a real schema path (it's a transient virtual). |
| JWT | Signed with `jsonwebtoken`, `expiresIn: "7d"`, stored in an **httpOnly** cookie (`token`) — not exposed to client-side JS, not stored in `localStorage`. |
| CORS | Locked to a single configured origin (`CLIENT_URL` env var) with `credentials: true`, not `*`. |
| Sensitive logging | No request bodies, passwords, or tokens are logged anywhere (`middleware/logger.js` logs only method + path). |
| `npm audit` | `0 vulnerabilities` in both `first-server` and `frontend`. |
| Input validation | `zod` schemas on `/api/auth/register` and `/api/auth/login`. Most other write routes use ad-hoc required-field checks rather than schema validation — noted as a remaining risk below. |

## 3. Penetration testing — five scenarios

### Scenario 1: Missing token
**Attack**: `GET /api/tasks` with no cookie at all.
**Result**: `401 {"error":"Not authenticated"}`. ✅ Correctly refused.

### Scenario 2: Tampered token
**Attack**: `GET /api/tasks` with `Cookie: token=<mangled JWT with an invalid signature>`.
**Result**: `401 {"error":"Invalid or expired session"}`. ✅ Correctly refused —
`jsonwebtoken.verify()` throws on a bad signature, caught by `requireAuth`.

### Scenario 3: Unauthorized data access
This is where the real findings were. Several rounds of live testing surfaced
genuine authorization gaps, all reproduced and fixed:

- **Task ownership hijack.** `PUT /api/tasks/:id` passed the raw request body
  straight into `findOneAndUpdate()`. Sending `{ owner: <another user's id> }`
  in the body silently reassigned the task to that user — confirmed live: the
  task vanished from the original owner's list and appeared in the target's,
  with no consent from either side.
  **Fix**: whitelist only `title`/`done`/`priority`/`dueDate` into the update
  document; `owner` is set once at creation and can never be touched again.

- **Private-profile bypass (four separate routes).** The `isPrivate`
  check (`getProfileForViewer` at the time) only gated the main profile view
  and the tracks list. `GET /profiles/:username/top-friends`,
  `GET /profiles/:username/comments` (+ `POST`), `GET /media/user/:username`,
  and `GET /posts/user/:username` had **no privacy check at all** — a private
  user's portfolio, posts, and guestbook were fully readable by a total
  stranger, or a fully anonymous, unauthenticated caller.
  **Fix**: extracted the check into a shared `utils/visibility.js`
  (`assertVisible`) and applied it to all four routes.

- **Private data leaking through embedded user objects.** Even after the
  fix above, a private user's full `bio`/`wallpaperUrl`/`theme`/`email`
  still leaked through *other* people's data — search results, a group's
  member roster, a post/comment's author, a notification's actor — because
  `toPublicUser()` always returned the full profile regardless of who was
  asking. Reproduced concretely: a total stranger joining a group a private
  user belonged to could read that user's full bio and wallpaper, even
  though visiting their profile directly correctly returned `403`.
  **Fix**: `toPublicUser(user, viewerId)` now returns the full shape only
  for the user themselves or an accepted friend, and
  `User.toPublicRestricted()` (id/username/displayName/avatarUrl/isPrivate
  only) for everyone else. Applied to all 8 call sites across auth,
  profiles, friends, groups, notifications, posts, and comments.

- **Anonymous access to comments on a private post.**
  `GET`/`POST /posts/:postId/comments` had no visibility check tied to the
  post author at all — a stranger, or an anonymous caller, could read *and
  post* comments on a private user's post just by knowing the post id. A
  related routing-order bug made this worse: `postsRouter`'s blanket
  `requireAuth` was registered before `commentsRouter`, so an anonymous GET
  (meant to be public) was rejected with the wrong `401` before ever
  reaching the comments route's own logic.
  **Fix**: applied `assertVisible` to both comment routes, and reordered
  the router mounts in `app.js` so the more specific `commentsRouter` runs
  first.

- **Self-block lockout.** Nothing stopped `POST /users/:username/block`
  from targeting yourself. Since the block-check doesn't special-case
  blocker === blocked, a self-block **locked a real account out of its own
  profile, tracks, comments, and posts** entirely — reproduced live.
  **Fix**: reject self-block with `400`.

### Scenario 4: Injection / invalid input
- **AI routes leaking internals.** `POST /api/ai/image` with no `prompt`
  crashed inside Node's crypto internals and returned the raw exception —
  `"The 'data' argument must be of type string... Received undefined"` —
  verbatim to the client. Every other route in the app masks unexpected
  errors behind a generic message; AI routes forwarded `err.message`
  unconditionally.
  **Fix**: only errors deliberately thrown with a `.status` (e.g. Openverse
  being down) are shown verbatim; everything else logs server-side and
  returns a generic `500`. Added an explicit `prompt is required` `400` so
  the common case doesn't even reach the provider.
- **`POST /reports` with a bad `targetType`** threw an unhandled Mongoose
  validation error → `500`. **Fix**: validate `targetType` against the
  model's enum and require `targetId`/`reason`, returning `400`.
- **Malformed MongoDB ids across every `:id` route** (groups, tasks, tracks,
  friends, media, posts, comments, profiles) threw an uncaught `CastError`,
  masked as a generic `500` by the shared handler — not a leak, but the
  wrong status code for a client mistake. **Fix**: the shared error handler
  now returns `400` specifically for `CastError`, fixed once for every route
  in the app; verified a valid-but-nonexistent id still correctly `404`s.

### Scenario 5: Oversized upload
**Attack**: `POST /api/media/upload` with a 31MB file against the
configured 30MB `multer` limit.
**Before the fix**: `500 {"error":"Internal server error"}` — Multer's
own rejection fell through to the generic handler.
**After the fix**: `413 {"error":"File exceeds the 30MB upload limit"}`.
Verified a normal small upload is unaffected.

## 4. Fixes applied (summary, chronological)

1. Task ownership mass-assignment → field whitelist
2. Private-profile bypass on top friends / comments / media / posts →
   centralized `assertVisible`
3. Private data leaking via embedded user objects everywhere → viewer-aware
   `toPublicUser`
4. Anonymous access to private post comments + a routing-order bug →
   `assertVisible` on comment routes + router reorder
5. Self-block lockout → reject self-block
6. AI routes leaking internal error text → generic error + input validation
7. `/reports` crashing on bad input → input validation
8. Malformed ObjectIds returning `500` everywhere → centralized `400` for
   `CastError`
9. Oversized uploads returning `500` → centralized `413` for `MulterError`
10. CORS silently locked to the wrong origin after an `app.js`/`server.js`
    refactor, because a static import evaluated `cors()` (reading
    `process.env.CLIENT_URL`) before `loadEnv()` had populated it — fixed
    with a dynamic import, verified against a live preflight request

Every fix above was reproduced as a real HTTP request against the running
server before the fix, and re-verified (both the attack now failing, and
the legitimate case still working) after it.

## 5. Remaining risks / not yet addressed

- **Input validation coverage.** `zod` is only used on the auth routes.
  Other write routes (posts, groups, tracks, media, comments) validate
  required fields ad hoc but don't enforce types, lengths, or formats as
  strictly. Low risk today (Mongoose's own schema validation is a backstop),
  but worth tightening.
- **No rate limiting.** Login, register, and friend-request routes have no
  throttling — a credential-stuffing or spam-request script could hit them
  freely.
- **No automated dependency scanning in CI.** `npm audit` was run manually;
  there's no scheduled/CI check to catch a newly-disclosed vulnerability in
  a dependency after this review.
- **File uploads aren't content-sniffed.** `multer`'s `fileFilter` trusts the
  client-supplied MIME type, not the actual file bytes — a client could
  label arbitrary content as `image/png`. Filenames are UUID-randomized on
  write, which limits (but doesn't eliminate) the impact.
- **No CSRF token.** The app relies on `SameSite=Lax` on the auth cookie plus
  a locked CORS origin rather than an explicit CSRF token. Reasonable for
  this app's current risk profile, but worth naming as a conscious trade-off
  rather than an oversight.
