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

## 5. Round 2 — post-deployment audit

Everything in §§1–4 was found before the app was deployed. After deploying
`first-server` to Render and the frontend to Vercel, a second, much larger
audit pass was run systematically across every route file, the upload
pipeline, and the frontend's media handling — again, every finding below was
reproduced as a real request against the **live, deployed** production
instance before being fixed, and re-verified live afterward.

### 5.1 Data loss: uploads on an ephemeral filesystem
Render's free tier filesystem is ephemeral — anything written to local disk
is wiped on every restart or redeploy. `middleware/upload.js` used
`multer.diskStorage()`, so every avatar, wallpaper, portfolio image, and
uploaded track vanished the next time the service redeployed or spun down.
**Fix**: uploads now stream directly to Cloudinary via a small custom
`multer` `StorageEngine` (`cloudinary.uploader.upload_stream`), storing the
returned CDN URL instead of a local path. (The mock AI-generated wallpaper
SVG had the same bug — it returned an inline `data:` URI instead of writing
to disk. That mock has since been replaced by real generation whose results
are stored on Cloudinary — see §5.8.)

**A dependency conflict blocked the first deploy of this fix.**
`multer-storage-cloudinary@4.0.0` (the obvious off-the-shelf package) has an
unmaintained peer dependency pinned to `cloudinary@^1.x`. `cloudinary@^2.7.0`
was required to pick up a patched high-severity advisory
([GHSA-g4mf-96x5-5m2c](https://github.com/advisories/GHSA-g4mf-96x5-5m2c),
arbitrary argument injection via an ampersand in a parameter, present in
`cloudinary <2.7.0`) — installing both together only *warned* locally
(against an already-resolved dependency tree) but hard-failed Render's clean
`npm install` with `ERESOLVE`, silently leaving the old, data-losing code
live in production for several deploy attempts. Replaced the package
entirely with a ~15-line custom storage engine calling the same
`cloudinary.uploader.upload_stream` API the package used internally —
removes the conflicting dependency and keeps the patched SDK version.

**A related bug in the frontend surfaced during this fix**: `assetUrl()` in
`api/client.ts` only recognized `http`-prefixed URLs as already-absolute;
every other value got the API origin prepended. The new `data:` URIs for
AI-generated images don't start with `http`, so every AI-generated
avatar/wallpaper/portfolio image would have rendered as a broken image tag.
Fixed by also recognizing `data:` as already-absolute.

### 5.2 Username case-sensitivity (account squatting / impersonation)
`User.username` had a unique index but, unlike `email` (`lowercase: true`),
no case normalization. Reproduced live: registering `CaseTest` and then
`casetest` both succeeded as two separate accounts. On a platform where
usernames are how people find and `@`-recognize each other, this allows
squatting a case-variant of an existing name for impersonation, and was
inconsistent with the already-case-insensitive username search. **Fix**:
added `lowercase: true` to the schema field, matching `email`. Verified
Mongoose applies the same setter to query filters (not just document
writes), so this doesn't break lookups — confirmed live that a
case-mismatched login (`Foo@Example.com` vs. stored `foo@example.com`) has
always worked correctly for the same reason.

### 5.3 NoSQL injection / ReDoS via unescaped search input
Both the user search (`GET /api/profiles?search=`) and group search
(`GET /api/groups?search=`) built a MongoDB `$regex` filter directly from
`req.query.search` with **no escaping** — the raw client input was compiled
as a live regular expression and run against every document in the
collection, not matched as a literal substring. Two concrete problems: (1)
regex metacharacters change matching semantics — confirmed live that
searching `livedem.` matched the user `livedemo` via the `.` wildcard,
before the fix; (2) a crafted pathological pattern (e.g. `(a+)+$`) can
trigger catastrophic backtracking, a real denial-of-service vector against
the database, not just the app process. **Fix**: added
`utils/regex.js#escapeRegex` and applied it at both call sites, so user
input is always matched as a literal string. Re-verified live: `livedem.`
now returns no match, while `livedem` still correctly matches.

### 5.4 Centralized error handling had a gap: Mongoose `ValidationError`
The shared `errorHandler` mapped `CastError`→`400` and `MulterError`→`413`
(round 1), but a required-field failure raised by Mongoose itself —
`ValidationError` — fell through to the generic `500` catch-all. Reproduced
live: `POST /api/groups` with no `name` (a required field) returned
`{"error":"Internal server error"}` at `500`. Because this is fixed once in
the shared handler, it silently hardens every route that relies on schema
validation rather than its own explicit checks. **Fix**: return `400` with
the first validation message (e.g. ``Path `name` is required.``), the same
treatment as the two existing cases.

### 5.5 Unvalidated input shapes crashing specific routes
Four more routes crashed with a generic `500` on plausible (not even
adversarial) malformed input, each reproduced live before being fixed:

- **`POST /api/tracks`**, `sourceType: "youtube"` with no `url` — threw
  inside `extractYouTubeId` (`url.match` on `undefined`). Fixed with an
  explicit string check before use.
- **`GET /api/tasks?sort=title&sort=done`** (a repeated query key, which
  Express's parser turns into an array) — Mongoose's `.sort()` rejects a
  flat array of field names and throws. Fixed by normalizing to a single
  string, taking the first value.
- **`PUT /api/profiles/me/top-friends`**, `{"usernames": "not-an-array"}` or
  `{"usernames": 42}` — a string still has `.slice()` (silently truncating
  instead of failing) but not `.map()`, and a number has neither, so the
  route crashed downstream instead of validating the shape up front. Fixed
  by requiring an actual array and dropping non-string entries.
- **Same route, `{"usernames": ["alice", "alice"]}`** (a duplicate) —
  `TopFriend` has a unique `(owner, target)` index, and the route built one
  document per array entry with no deduplication, so `insertMany` hit a
  duplicate-key error on the second occurrence. Fixed by deduplicating on
  the resolved target id before insert.

### 5.6 Orphaned-data crash: deleting a commented-on post
`DELETE /api/posts/:id` didn't cascade-delete the post's comments. A comment
left behind after its post was deleted became "orphaned" — its `post`
reference pointed at a document that no longer existed. Reproduced live:
create a post, comment on it, delete the post, then try to delete that
comment — `comment.populate("post")` resolves to `null`, and
`comment.post.author` threw a `TypeError`, falling through to a `500`, even
though the comment's own author has every right to remove it. **Fix**: two
changes — cascade-delete a post's comments when the post itself is deleted
(stops new orphans), and a null-safe check in the comment-delete route so
any already-orphaned comment can still be removed by its own author
instead of crashing.

### 5.7 Logout never actually logged anyone out (production)
`POST /api/auth/logout` returned `204`, but the session cookie was never
cleared: a following `GET /api/auth/me` still returned `200`, and reloading
the site left the user signed in. Reproduced live. The auth cookie is set
`SameSite=None; Secure` in production (required for the cross-domain
Render/Vercel split), but the route cleared it with
`res.clearCookie(name, { path: "/" })`, whose `Set-Cookie` header carries
neither attribute — so the browser doesn't treat it as the same cookie and
ignores the deletion. **Fix**: `clearAuthCookie(res)` in `middleware/auth.js`
repeats exactly the `httpOnly` / `sameSite` / `secure` / `path` logic of
`setAuthCookie`, and the route uses it. Verified live: the clearing header
now reads `HttpOnly; Secure; SameSite=None` and `/api/auth/me` returns `401`
afterwards. The frontend's logout also always clears client-side state in a
`finally`, so a failed request can't leave a user stuck signed in.

### 5.8 AI image generation was a mock, and the real one spends shared money
Every "AI" image came from `MockAIProvider`, which hashes the prompt into a
two-color gradient and never interprets it — users correctly reported that
pictures didn't match what they asked for. It is now real generation via
Cloudflare Workers AI (FLUX.1 schnell) whenever `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` are set, falling back to the mock when they aren't.
Moving from free-and-fake to real introduced new concerns, handled up front:

- **Cost/abuse.** Any signed-in user could otherwise burn the whole free
  daily allowance. `/api/ai/image` is capped at 10 per user per hour (in
  memory, real provider only) and prompts are truncated to 500 characters
  before being sent.
- **Secrets.** The token lives only in env vars (`.env`, gitignored, and
  Render's dashboard, `sync: false`); it is sent server-side only and never
  echoed or logged.
- **Information leakage.** Cloudflare's raw error bodies are logged
  server-side and never forwarded. Bad-token and exhausted-allowance cases
  return a generic `503 "temporarily unavailable"` (retrying can't help),
  rate limiting returns `429`.
- **Storage.** Results are re-hosted on Cloudinary and only the CDN URL is
  stored — not multi-megabyte base64 on user/post documents.
- **Earlier wrong turn worth recording.** The first provider tried
  (BazaarLink) was abandoned after a live check showed the model id in its
  docs example (`openai/gpt-5.4-image-2`) differed from what its own
  `/v1/models` listed (`gpt-5.4-image-2`), and the account had no credits;
  verifying against the live API before shipping caught both.

### 5.9 What was checked and found clean this round
`ai.routes.js` (input validation, error masking already correct),
`friends.routes.js` (self-friend/block checks, IDOR-safe accept/decline),
`moderation.routes.js` (self-block already fixed in round 1, bidirectional
block check, enum-validated reports), `media.routes.js` (ownership checks,
visibility gating, no mass assignment), and `notifications.routes.js`
(properly scoped read/read-all, guards against a missing actor).

### 5.10 The Help wanted board: a new place user content becomes public

Turning the private tasks list into a public board added the first
endpoint that lists *other users'* records outside a profile, so it was
designed around the existing visibility rules rather than beside them:

- **Private by default.** `Task.isPublic` defaults to `false`; existing
  tasks stayed private and nothing became public by migration.
- **Same rules as profiles.** `GET /api/tasks/board` omits requests whose
  author blocked you (or you blocked), and those from private-profile users
  who aren't your friends — omitted entirely rather than anonymised, since
  even the request text is the author's content.
- **Owner-only writes unchanged.** Update and delete stay owner-scoped
  (`404` for anyone else). While there, `POST /api/tasks` stopped spreading
  the raw body into `Task.create` and now reads a fixed field list.
- **Rate-limited.** A user can post 10 public requests and send 20 offers per
  hour (`429` beyond that); private requests aren't capped since they reach
  no one else. Verified live: the 11th public post was refused.
- **Offers don't leak existence.** Offering help on a private, resolved,
  missing, blocked or private-profile request all return the same `404`; you
  can't offer on your own request; and repeat offers from one person on one
  request create a single notification.

Covered by backend tests (`tests/board.test.js`); the frontend's handling of
the `429`s is covered by its own tests and verified live with a
second account.

### 5.11 Account emails were exposed to other users

`User.toPublic()` always included the account `email`, and every place a
user is embedded (search results, comment and post authors, friends lists,
notification actors, and later the Help wanted board) serialized through it —
so any logged-in user could read the email of anyone whose profile they
could view. Found while live-testing the board, when an offer notification
returned the offerer's email to the recipient.

**Fix:** `toPublic()` omits `email` by default and `toPublicUser` includes it
only when the viewer is the user themselves (register, login, `/me`).
Verified live: another user's search result has no `email` key while
`/api/auth/me` still returns your own; a regression test covers the board,
profile, search and `/me`. The frontend never read another user's email.

### 5.12 A shared demo password was advertised on the login page

The login page told every visitor "Demo accounts use password `password123`",
and the README repeated that all development accounts used it. On a public
site that is an invitation to try that password against any account, and any
account that actually used it was effectively open. **Fix:** the hint was
removed from the login page and README (verified: the deployed bundle no
longer contains the string). Accounts that were created with that password
should still have it changed — that can't be done by the app, since it never
sees the old value except at login.

## 6. Operational incident: a stale DB hostname caused a production outage

While cleaning up the leftover test accounts noted below, live verification
turned up a real, active production incident, unrelated to any code change:

**What happened.** MongoDB Atlas lets you rename a cluster; doing so gives
it a new SRV hostname while keeping the same underlying data. At some point
this project's cluster was renamed from `cluster0.cljt9gd` to
`creativeselect.q05h4or` — but `MONGODB_URI` on Render was never updated to
match. The app kept working anyway, because a MongoDB driver resolves the
SRV hostname once and then holds its connections; a live, never-restarted
process doesn't need to re-resolve DNS. The old hostname's DNS record was
eventually fully decommissioned (confirmed via an authoritative
DNS-over-HTTPS query against the real `mongodb.net` nameservers — a genuine
`NXDOMAIN`, not a local network issue), and the very next time the Render
process restarted (its free-tier spin-down/wake cycle), `connectDB()` tried
to resolve the now-dead hostname, failed, and — per its own by-design
behavior of logging a connection failure without crashing the server —
left the app **running but with no working database connection at all**.
Every DB-backed request (including login) returned a generic `500`, while
`/api/health` kept reporting healthy, since it doesn't touch the database.

**Fix**: updated `MONGODB_URI` on Render to the current hostname with a
freshly-rotated database-user password (the old one didn't validate against
the renamed cluster resource either). Verified live: `/api/health` and a
real login both recovered immediately after the redeploy.

**Takeaway**: `config/db.js`'s "log and keep running" behavior on a failed
initial connection is reasonable for surviving a transient blip, but it
means a *persistent* misconfiguration (like a stale hostname) fails silent
and slow — the process looks alive on the one health check that doesn't
depend on the database. Worth either alerting on repeated Mongo connection
errors, or making `/api/health` also report DB connectivity.

## 7. Operational incident: every GitHub-triggered frontend deploy was failing

`git push` triggered Vercel builds that failed every time
(`sh: line 1: vite: command not found`, exit 127) for the project's whole
history, and nobody noticed: each manual `vercel --prod --force` redeploy
succeeded and became the production alias, so the live site was always fine —
the manual redeploy was silently masking a broken pipeline. Failed builds
never get promoted, so there was no outage, just an unreliable process.

**Root cause** (it took three wrong theories to find): the repo root held a
stray `package.json` / `package-lock.json` (a `concurrently` dev script
pointing at a nonexistent `../../../first-server` path — never functional)
above `frontend/`. Vercel's git-triggered builds treated the repo root as the
project, installing that unrelated **26-package** lockfile instead of
`frontend/`'s **49** — so no `vite`. Manual CLI deploys ran from inside
`frontend/`, so they never saw it. The tell was the install count matching
the root lockfile exactly even with `npm ci` and a skipped build cache,
which ruled out the cache-corruption theory first assumed.

**Fix**: Vercel project settings — Root Directory = `frontend` and Install
Command = `npm ci` (a `vercel.json` `installCommand` alone was ignored) —
plus deleting the stray root package files and the dead legacy `backend/`
directory (the retired Prisma/SQLite backend). Verified with a plain push and
no manual redeploy: the auto-deploy installed 48/49 packages and went live on
its own.

## 8. Remaining risks / not yet addressed

- **Board limits are per instance, in memory.** Public posts are capped at
  10 per user per hour and help offers at 20, but like the AI caps the
  counters reset on restart and aren't shared across instances. They stop a
  single account flooding the board or another user's notifications, not a
  script that registers many accounts.

- **No rate limiting.** Login, register, and friend-request routes have no
  throttling — a credential-stuffing or spam-request script could hit them
  freely.
- **The AI image cap is per instance, in memory.** It resets on restart
  and wouldn't be shared across multiple servers; fine for one free-tier
  instance, not for scaling out. The free Cloudflare allowance is also
  shared by all users, so heavy use degrades the feature to "temporarily
  unavailable" until it resets. Text generation is still a mock.
- **No automated dependency scanning in CI.** `npm audit` is run manually;
  there's no scheduled/CI check to catch a newly-disclosed vulnerability in
  a dependency after this review (this is exactly how the `cloudinary <2.7.0`
  advisory in §5.1 was found — worth automating).
- **File uploads aren't content-sniffed.** `multer`'s `fileFilter` trusts the
  client-supplied MIME type, not the actual file bytes. Cloudinary itself
  re-derives the real type on ingest, which limits the practical impact, but
  the app-level filter is still trust-the-client.
- **No CSRF token.** The app relies on `SameSite=None`/`Secure` (prod) or
  `SameSite=Lax` (dev) on the auth cookie plus a locked CORS origin rather
  than an explicit CSRF token. Reasonable for this app's current risk
  profile, but worth naming as a conscious trade-off rather than an
  oversight.
- **Two narrow race conditions**, both low-severity and neither crossing a
  privacy/access boundary: (1) `Friendship`'s unique index is directional
  (`requester`+`addressee`), while the app-level duplicate check is
  bidirectional — two users requesting each other in the same instant could
  theoretically create two friendship documents. (2) `Track`'s per-user
  5-track cap is a count-then-create check with no transaction — concurrent
  requests from the same user could exceed the cap by one.
- ~~Test accounts left in the production database from live-reproducing the
  bugs above~~ — cleaned up via a one-off script run directly against
  Atlas (there's still no self-service account-deletion endpoint for a real
  user to do this themselves, which remains a minor gap).
