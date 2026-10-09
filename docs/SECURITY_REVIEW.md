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
| CORS | Locked to the configured origin(s) (`CLIENT_URL` env var — one address, or several separated by commas) with `credentials: true`, not `*`. |
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

### 5.13 Cleaning up generated images without creating a delete-anyone's-file bug

Generated images used to stay on Cloudinary forever after their post was
deleted. The naive fix — delete the asset a post's `imageUrl` points at — is a
vulnerability: `imageUrl` is client-supplied, so posting someone else's image
URL and deleting the post would destroy their image. **Design:** a
`GeneratedImage` ledger records who generated each stored image, and deletion
happens only for the generating user, only when nothing else references the
URL. Cleanup failures are logged and never block the user's own delete.

Verified by six tests (owner match, other posts, wallpaper reference, another
user's image, unrecorded URLs, Cloudinary failure) and live in production:
deleting a post removed the image from storage, a wallpaper-referenced image
survived, and a second live run caught that Cloudinary's CDN kept serving a
deleted image — fixed by invalidating the cache on delete.

### 5.14 Nothing throttled login, and the cross-site cookie had no CSRF defense

Login, registration, password changes and deletion had no throttling — a script could
guess passwords indefinitely — and the auth cookie was `SameSite=None; Secure` in
production, so a browser attaches it to requests made by *any* website. CORS
doesn't stop a cross-site "simple" request from being sent and acted on.

**Fixes.** (1) Login counts failed attempts per email (10 / 15 min) and per IP (30 /
15 min) and returns `429` with `Retry-After`; registration is capped at 10 per IP per
hour; password changes and account deletion allow 5 wrong passwords per 15 minutes.
(2) `middleware/csrf.js` rejects any state-changing request whose `Origin` isn't the
frontend (`403`); requests with no `Origin` header can't be forged from a victim's
browser and pass. (3) All limits moved from per-process memory to a MongoDB-backed
limiter, so they persist across restarts and hold across instances.

Verified by tests (lock-out after 10 failures, successful logins uncounted, emails
independent, `429` after 10 registrations, evil/`null` origins `403`, real origin
and no-origin allowed, limiter shared between instances) and live: the 11th failed
login returned `429` with `Retry-After: 900`, an untrusted origin got `403`, and
authenticated writes from the real frontend origin still worked.

**Later: more than one site address.** `CLIENT_URL` can now list several addresses (for example the
site's own domain and its original `*.vercel.app` one) so both keep working. Matching stays exact —
scheme, host and port all have to match, so `https://example.com` does not match
`https://www.example.com`, `http://…` or `https://www.example.com.evil.net` — and applies to both
the CSRF check and CORS (which now answers each request against the whole list; an unlisted origin
gets no CORS headers). The first address is the one used for links in emails. Covered by new tests.

### 5.15 Sessions weren't revalidated: a deleted account's token kept working

`requireAuth` only verified the JWT's signature, so a session token stayed valid for
its full 7 days no matter what happened to the account. Found while building account
deletion: replaying a copied token after the account was deleted still passed
`requireAuth` and **created a post under the deleted user's id** (reproduced against
production). It also meant a password change couldn't cut off an attacker's session.

**Fix.** `requireAuth` (and the optional-auth variant) now confirms the user still
exists and that the token was issued after `passwordChangedAt`, which a password
change sets. A real server error during that check is a `500`, not a fake logout. Live
re-test: after a password change the other session got `401` on reads and writes while
the changing session stayed signed in, and a token copied before deletion was refused
and created no data. (The extra cost is one indexed lookup by `_id` per request.)

### 5.16 No way to delete an account or change a password — and two weak accounts

Users couldn't delete their own data or change their password. Auditing the stored
bcrypt hashes in the production database (offline, against the hashes — no login attempts)
found **2 of 4 accounts still using `password123`**, the value the login page used to
advertise (§5.12): the demo account and a leftover test account.

**Fixes.** `PUT /api/auth/password` (current password required; signs out other
sessions) and `DELETE /api/profiles/me` (password required; deletes the account and
everything it owns, hands shared groups to another member, deletes stored files) with UI on
the profile edit panel. Uploads are now recorded in the same ledger as generated
images, so account deletion, post/portfolio/track deletion and avatar/wallpaper
replacement clean up Cloudinary — only for files the ledger says the user owns, since URLs
on posts and portfolio items are client-supplied. A live run confirmed a full lifecycle
against production: upload and AI image recorded, replaced wallpaper deleted, wrong password
refused, deletion removed the user's data and every file while leaving another user's
account untouched. Both weak accounts (the demo and the leftover test account) were then deleted from production, so no account with a known password remains.

### 5.17 Help offers had no reply path

An offer notified the owner but there was no way to respond. Offers can now carry a
note (≤300 chars, validated as text) and the owner can accept an offer from the
notification, which notifies the offerer once. Only the offer's recipient can accept it.

### 5.18 Login would not have worked on iPhones: cross-site cookies

The frontend and API were on different sites, so the session cookie was
`SameSite=None; Secure` and requests were cross-site `fetch`es with credentials. That
works in Chrome, but Safari — and therefore every browser on iOS — blocks cookies set
by a different site than the page it's on (Intelligent Tracking Prevention), even with
`SameSite=None`. On an iPhone, login would appear to succeed and then every page would
behave as signed out. It was missed because earlier mobile checks were a desktop
browser resized to phone width, not real Safari.

**Fix.** The frontend now calls `/api/...` on its own domain and `vercel.json` rewrites
that path to the Render API, so the browser only ever talks to one site and the cookie
is host-only and first-party. That also allowed tightening it to `SameSite=Lax`.
Side effects handled: (1) behind the proxy every request arrives from Vercel's
address, which would have made the per-IP limits (login, registration) apply to the
whole site at once — the limiter now reads Vercel's `x-vercel-forwarded-for` (test:
twelve clients behind one proxy register freely; one client is still capped); (2) the
`Origin` check still works through the proxy; (3) large requests and slow calls still
pass.

Verified live through the proxy: the cookie has no `Domain` (host-only), is `HttpOnly;
Secure`, and is `SameSite=Lax`; the limiter recorded my real public IP; AI image
generation took ~5 s; a 10 MB upload succeeded; the untrusted-origin write was `403`;
and in a real browser, sign-up → post → reload (still signed in) → logout worked with
every API call on the site's own domain. The project owner has since confirmed login and the app working on physical iPhones (manual check).

### 5.19 Oversize images returned a generic 500

Found while testing large uploads through the proxy: an image over Cloudinary's 10 MB
free-plan limit made the upload fail with "Internal server error" (with or without the
proxy — confirmed by hitting the API directly). Users saw a useless message. The upload
layer now turns it into `413` "images can be up to 10 MB" and any other storage failure
into `502` "try again", without leaking provider details; the frontend shows the server's
message. Covered by new upload tests (which also cover the previously untested upload
path: success, ledger recording, audio as a video resource, type filtering).

### 5.20 Portfolio items accepted any URL, and top friends accepted anyone

`POST /api/media` stored whatever `url` and `type` the client sent — including `http:`
links, `javascript:` URLs and arbitrary strings that the frontend then put in `<img>` /
`<iframe>` sources. It now accepts only `https` image links (or an inline image from the mock AI
provider) and two video shapes: a YouTube link, or a direct https `.mp4`/`.webm`/`.mov`/`.m4v`
file. Links are parsed as URLs (a video id smuggled into another site's query string is refused),
capped at 2000 characters, and the start time and caption are validated. Similarly
`PUT /me/top-friends` accepted any username, not just friends; it now keeps only accepted friends.
Display name and bio were also unvalidated (a 1 MB display name, or an object) — now trimmed,
length-limited and type-checked. Covered by tests including hostile links.

### 5.21 Top-friends "Couldn't save" error: the server and the UI disagreed

Saving top friends worked on the server but always showed "Couldn't save your top friends": the
route replied `204` with no body while the UI read `{ topFriends }` out of the response, which threw.
(Before error handling was added to that component the same failure was silent and left the editor
stuck open.) The route now returns the saved list, matching the read endpoint, and a regression test
covers the UI path.

### 5.22 Usernames could be taken over the moment they were released

With username changes added, a released name could be claimed instantly — an impersonation and
link-hijacking risk, the same class as §5.2. Released names are reserved for their previous owner
for 30 days, changes are limited to 3 a day, and names are restricted to URL-safe characters.
A real-browser test of the rename flow also caught a race (the profile page re-fetching the old
address and showing "unavailable"), fixed by ignoring stale responses.

### 5.23 Untested paths hid unhandled errors

Writing tests for the pages and components that had none (login, register, group detail, nav bar,
music player, comments, post composer/card, AI buttons, auth context) found small but real
failure-path bugs of the same class as before:

- The music player, post comments and profile testimonials loaded their data with no error
  handling, so a failed load (e.g. a private profile's `403`) became an unhandled rejection and
  left "Loading…" on screen forever. They now show the empty state or the server's message.
- The Log out button let a failed network call escape as an unhandled error (the session was
  still cleared locally, but the browser console filled with errors). It now catches it.
- The sign-up form never told people which usernames are allowed, so a name like `my name!` was
  only rejected by the server (or by the browser after the server rule was tightened). It now
  states the rule and enforces it in the browser.

The browser end-to-end suite (Chrome, Safari's engine and an iPhone-sized Safari engine, run
in CI against a real API and database) additionally guards the flows that unit tests can't see:
session persistence across reloads in WebKit, the rename flow, top friends, two-user flows and
phone layout. The Vitest run fails on unhandled errors, which is how the logout
bug was caught.

### 5.24 Generated pictures silently lost: an over-long caption, and a misleading storage error

"Generated images aren't saving to my portfolio" turned out to be two separate problems.

- **A bug of mine.** The portfolio used the generation prompt as the picture's caption. The API
  caps captions at 200 characters, but prompts can be far longer, so a long prompt made the save
  fail with a 400 and the picture was lost. The portfolio now trims the caption to 200
  characters (regression test with a ~340-character prompt; the server-side limit is unchanged).
- **An external outage that the app described wrongly.** Cloudinary began refusing every
  upload for the account (`401 action is disabled`) while reads kept working and usage was
  about 3% of the free allowance. The app reported this as a generic "try again" (502), which
  invites pointless retries and hides the real cause. Cloudinary's 401/403/420 answers are now
  reported as `503 File storage is temporarily unavailable` (for both uploads and AI images),
  without leaking the provider's message to users, and are logged as `STORAGE UNAVAILABLE` so
  the operator sees it. Other storage failures keep the 502. Covered by new backend tests
  (uploads and the AI provider).

The account-level block itself couldn't be fixed in code; the account owner resolved it with
Cloudinary. After that, a live run against production (throwaway account, deleted afterwards)
generated a picture from a 350-character prompt, saved it to the portfolio with the trimmed
caption, loaded it from the CDN, and account deletion removed both the record and the file.

### 5.25 Direct messages: a new private channel between users

Messaging is the first feature where one user writes something only another user sees, so it was
designed against the same abuse and data-exposure questions as the rest of the app, and the
controls are enforced by the server, not the UI:

- **Friends only.** Sending and reading both require an accepted friendship, so a stranger can't
  reach anyone — there is no unsolicited-message path. A pending request isn't enough, and the
  conversation list only ever contains friends.
- **Blocks and unfriending end it in both directions**: either person blocking the other, or
  unfriending, makes the thread `403` for reading and sending (old messages stay stored but can't be
  fetched).
- **Nothing is readable by a third party.** Every query is scoped to the caller's own pair key; the
  delete route returns `404` for anyone but the sender (not `403`), so message ids can't be probed.
- **Input and abuse limits.** Text only, trimmed, 1–2000 characters, validated as a string; 60 sends
  per user per 10 minutes (`429` + `Retry-After`) so a friend account can't be used to flood someone.
  Bodies are rendered as plain text by React (never as HTML), so a message can't inject markup.
- **Data lifecycle.** Deleting an account deletes every message it sent or received.
- Covered by 12 backend tests (friends-only, blocks, unfriend, sender-only delete, paging, rate limit,
  account deletion, validation, auth on every route), 19 frontend tests, and 4 browser tests that run in
  Chrome, Safari's engine and an iPhone-sized viewport.

Known limits, listed in §8: messages aren't end-to-end encrypted, and there is no "report this message"
button yet.

### 5.26 Group chat: private to members, and a side effect of leaving

Group chat is a second place users write to each other, so it follows the same server-side rules:
reading **and** writing need membership (`403` if you haven't joined, `404` for no such group), so
leaving a group ends access; people you've blocked, or who blocked you, are left out of what you see;
only the sender or a group admin can delete a message (`404` for everyone else, including a message
from a different group, so ids can't be probed); text only, 1–1000 characters, 60 per person per
10 minutes. Groups are open to join by design, so anyone can join and then read the chat — that is
stated in §8, not hidden. Messages are removed with their sender's account and with their group.
Covered by 10 backend, 11 frontend and 1 browser test.

### 5.27 Forgotten password: an account-recovery path that must not become a takeover or an oracle

Password reset by email is where account takeover and "is this person registered?" lookups usually
appear, so it was built against both:

- **No account oracle.** `forgot-password` returns the same `200` and message for a registered
  and an unregistered address, does its work after replying so response time doesn't differ, and the
  rate limits count every address (real or not) so the limit itself reveals nothing. (The sign-up form
  already says when an email is taken; that is a known, separate trade-off.)
- **A token that is worth nothing if the database leaks.** 32 random bytes, stored only as a SHA-256
  hash; single-use; expires in an hour; requesting a new link invalidates the old one; deleted with
  the account. It travels in the URL **fragment** (`#token=…`), which browsers never send to a server
  or in a Referer header, and the page removes it from the address bar after reading it.
- **Resetting does not sign anyone in**, and it signs **every existing session out** (the same
  `passwordChangedAt` mechanism as a password change), so someone holding a stolen session loses it.
  The owner also gets a "your password was changed" email.
- **Abuse limits**: 3 requests per address and 10 per IP per hour; wrong-token guessing is limited to
  10 per 15 minutes per IP (the token is 256 bits, so this is belt and braces).
- **Honest when it can't work.** With no mail provider configured the API answers `503` and the page
  says reset by email isn't set up, instead of promising a link that can never arrive. In production
  the mailer never logs the message (it contains the link) and never throws into the request.
- Inputs are validated as strings (`{"$ne": ""}`-style bodies are rejected).
Covered by 16 + 7 backend tests (including token hashing, expiry, reuse, session revocation, limits,
provider failure), 12 frontend tests and 3 browser tests (one follows the real emailed link).

### 5.28 Voice Live: letting strangers' browsers talk to each other

Live audio is the first feature where one person's microphone is streamed to others, so the design
limits who can do what on the server:

- **Who can see or join.** A live is hidden — and answers `404`, the same as a room that doesn't exist —
  from anyone blocked in either direction; a private-profile host's live is visible only to their
  friends. Blocking a host mid-live cuts the listener off at their next heartbeat.
- **Handshake messages are not a messaging channel.** A listener can send only to the host, and only
  after joining; the host only to people who joined; each person can read only what is addressed to
  them; messages are ≤20 KB, typed (offer/answer/ice), rate-limited and deleted after five minutes.
- **Capacity and abuse limits**: 8 listeners per browser-to-browser room (what the host's upload can carry) or 50–100 through the media server, 5
  lives started per hour, 120 joins per hour, 20 comments per minute, 200-character comments rendered
  as plain text. Only people in the room can read or write the chat; the host or the author can delete
  a comment.
- **The microphone can't stay on out of sight.** Leaving the host's page, closing the tab, or losing
  contact ends the live and stops the microphone; a live with no heartbeat for 45 seconds is ended by
  the server.
- **No audio is stored or relayed by the server.** Audio is end-to-end between the browsers, protected
  by WebRTC's own encryption (DTLS-SRTP); the server never sees it, so it can't record or moderate it.
- Account deletion removes the lives a person hosted and everything in them, and their listening
  and comments elsewhere.
Covered by 24 backend tests, 94 frontend tests (including the handshake and reconnection logic against
a fake peer connection) and 5 browser tests, one of which runs a real host and a real listener in two
Chrome windows and measures sound arriving.

**Big lives (50–100 listeners) through a media server.** The extra moving part is a LiveKit project, so
the server keeps the same discipline: access tokens are minted only by this API, only for people already
in the room (the host, or someone who joined — which already passed the block and private-profile checks),
last one hour, are signed with the project secret that never leaves the server, let only the host publish
(a microphone, nothing else) and let nobody send data through the room. The browser is handed only the
project's public address and its own token. When someone is blocked they are removed from the media room
as well as from our list; ending a live, a silent host or deleting the host's account closes the room.
If the media server can't create the room the live doesn't start (and friends aren't notified); with the
three settings absent the site falls back to browser-to-browser mode. Covered by 27 backend tests (real
token signing checked against the project secret, with the management client mocked) and 37 frontend tests.

### 5.29 Telling friends when someone goes live, and framing a post's picture

Two small additions that each touch user data:

- **"X is live" notifications** go only to the host's *accepted* friends, so they can't be used to
  ping strangers; someone who has unfriended or blocked the host gets nothing (those friendships are
  already gone). The volume is bounded by the existing limit of 5 lives started per hour. The
  notification holds only the host, the title (≤80 chars) and the room id; it is removed when the live
  ends, however it ends (host ends it, starts another, goes silent, or deletes their account), so nobody
  is sent to a dead room. If sending fails the live still starts (the error is logged, not shown).
  There is no per-person "mute these" setting yet (see §8).
- **Picture framing** (shape, zoom, position) is new data on a post, so the server validates it rather
  than trusting the browser: shape from a fixed list, zoom a number from 1 to 3, position exactly
  `"x% y%"` with each 0–100. These values go into CSS, so the strict format is what stops anything else
  (for example `50% 50%; background:url(…)`) from reaching a style. Posts from before the feature carry
  no framing and are shown exactly as they were.
Covered by 7 + 5 backend tests, the picture controls and bell by 30 frontend tests, and 5 browser tests (Chrome,
Safari's engine, iPhone-sized).

### 5.30 Music didn't play on iPhones

Songs added to a profile wouldn't play on iPhones. Reading the player showed several causes that only bite
on iOS (nothing here is a security hole, but it is a feature that silently didn't work):

- **iPhone audio files were refused at upload.** A `.m4a` from Voice Memos or Files arrives labelled
  `audio/x-m4a` (or `audio/m4a`, `audio/aac`; a `.wav` as `audio/x-wav`), but the server's allow-list only
  knew `audio/mp4`/`audio/wav`. The list now includes the iPhone labels; non-audio files and audio sent as a
  picture/portfolio upload are still refused.
- **Songs were started outside the tap.** iPhones only let a page start sound from a tap, and then allow that
  same audio element to play further songs. The player created a new `<audio>` element after the tap; it now
  keeps one element for the whole app and calls `play()` from the tap itself, shows a real play/pause button,
  and says "Tap play to start the music" if the browser still refuses.
- **The YouTube player was a 96×56 pixel box set to autoplay.** YouTube requires an embedded player to be at
  least 200 px tall, an iPhone won't start a video by itself, and without `playsinline` it jumps to
  full-screen. It is now shown at a proper size above the bar with `playsinline`, reports when autoplay is
  blocked ("Tap play to start"), and explains videos that can't be embedded, with a link to watch on YouTube.
- Songs in formats Safari can't play (ogg, opus, webm) are requested from Cloudinary as MP3.

Covered by 37 new frontend tests and 2 backend tests. **Not verified on a physical iPhone from here** (no
browser available to the test tools has iOS's autoplay rules); the owner checks it by hand.

### 5.31 Confirming the email address

Until now anyone could register with an address that wasn't theirs. Sign-up now emails a confirmation link,
built the same way as the password-reset link: 32 random bytes, stored only as a SHA-256 hash, single-use, valid
24 hours, only the newest link works, carried in the URL fragment (never sent to a server or in a Referer) and
removed from the address bar after it's read. Confirming needs no sign-in (it is the email that proves ownership),
guessing is throttled (20 bad tries per 15 minutes per IP), and asking for another link is limited to 3 an hour.
A completed password reset also confirms the address, since that link was emailed to it too.

- **The status is private.** `emailVerified` appears only on your own account object, never in profiles, search or
  any other person's view, the same rule as the address itself.
- **Sign-up never depends on email.** The message is sent after the reply; if the site can't send email or the
  provider fails, the account is still created and the person can ask again later.
- **Optional enforcement.** With `REQUIRE_VERIFIED_EMAIL=true` the two most outward-facing actions — going live and
  posting a public Help wanted request — need a confirmed address (`403` with a clear reason). It is off by
  default, so a visitor who signs up with an address they can't read isn't locked out of the rest of the site.
- Covered by 20 backend tests, 26 frontend tests and 5 browser tests that follow the real emailed link.

### 5.32 Clicking a notification opens what it was about

Notifications now link to the post, message thread, profile or live room they concern. Two server-side points matter:

- **A new `GET /api/posts/:id` goes through the same gate as the feed.** A post that doesn't exist, was deleted, belongs to a private profile the viewer isn't friends with, or is by someone who blocked them (or whom they blocked) all return the identical `404 Post not found`, so the endpoint can't be used to learn that a hidden post exists. The page shows "This post isn't available" instead of the content.
- **Message notifications are coalesced and carry no text.** A `message` notification holds only the sender's id and a count; the message body never leaves the thread. There is at most one unread per sender (a new message replaces it and raises the count), opening the conversation marks it read, and a failure to create it never blocks sending the message. They are removed with the sender's account like the other notification types.

The link target is chosen on the client from ids already in the notification, and every target is an in-app route (no URL taken from the payload), so a notification can't be used to send someone to another site. Covered by 13 backend tests, 31 frontend tests and 6 browser tests.

### 5.33 Text unreadable on light backgrounds, wallpapers and mid-tones

Profile owners choose their own colours and wallpaper, but every page is styled as white text on dark panels, so a light or mid-tone background (or a text colour close to the background) could leave a profile — or a visitor's view of it — unreadable. It also affected the default dark pages: the faintest greys (`text-white/30`, `/40`) and some solid buttons were below the 4.5:1 WCAG AA minimum.

- **Colours are parsed, never trusted.** Theme colours are stored as free-form strings. They now pass through a hex parser and anything else falls back to the default, so a malformed or hostile value can't reach the page's CSS variables.
- **Contrast is enforced on the way out,** so it also covers profiles saved before this change: text and accent colours are nudged to 4.5:1; a light background flips the styling; a mid-tone gets a panel; a wallpaper gets a scrim sized for the worst case (an all-white photo). The theme editor tells the owner when a chosen text colour will be adjusted.
- **An automated check, not just a look.** A browser test drives axe-core's contrast rule over every signed-out and signed-in page, error messages, group chat, search, notifications, the picture adjuster, and eight themed profiles (white, cream with unreadable light text, black with dark text, bright yellow, mid-grey, saturated blue, ...), on Chrome, Safari's engine and an iPhone-sized screen. It first found real failures (the grey text, a violet button at 4.4:1) which are fixed.
- **A phone layout bug surfaced by it:** on a visitor's view of a profile the Add Friend / Report / Block buttons ran off the edge of the screen; the row now wraps.
- **Not covered:** axe cannot measure text over a photograph, so wallpapers rely on the worst-case calculation (unit-tested) plus a visual check rather than a measured one. Browsers older than about 2022 that lack `color-mix` keep the un-flipped faded colours on light profiles.

### 5.34 Guests on stage: letting a listener's microphone into a live

Until now only the host could speak. The host can now bring up to 9 listeners on stage (big lives only), which means an
ordinary listener's browser may publish audio to everyone — so the server keeps the decision, not the browser:

- **The host decides, the guest consents.** A listener can only ask (`requested`, at most 20 asks pending at once). Only the
  host can invite (`invited`), and a person is let through only after they accept their own invitation. Nothing a guest's
  browser sends can grant itself permission: the media server's permission is changed by this API, with the project secret.
- **The permission is as narrow as before.** A guest may publish a microphone — not video or screen — and still cannot
  send data through the room. The server replaces the permission as a whole each time, so a revoke really removes it.
  Stepping down, being removed, blocking, leaving, being disconnected for too long, or the live ending all end it; someone
  who reconnects gets a pass that lets them speak only if the server still has them on stage.
- **Capped and counted by the server.** 9 places at once, counting invitations not yet answered, so a host can't be
  surprised by a tenth voice; people who have gone quiet don't hold a place. Stage routes answer `403` to the wrong role.
- **Everyone can see who is speaking** (so no one is unknowingly heard), but only the host sees who is asking or listening.
- **No audio touches the server;** the stage state is one field on the listener record and is read from a 2-second cache.
- **Limit:** the host can remove a guest but cannot remotely mute their microphone; a guest controls their own mute.
  Guests need the media server — browser-to-browser lives have no stage.
Covered by 19 backend tests (with the media server's permission calls recorded), 34 frontend tests and, against the live site, a real host and
guests speaking with a fake microphone.

### 5.35 Sharing the site with a QR code

A QR code is only a picture of a link, so the risk is where it points. The address is chosen in one place (`lib/share.ts`),
never taken from user input: the real domain on the live site (not the old Vercel address, which no longer takes
sign-ins) or the page's own address in development. Profile and live links carry only an id from the page the person is
already on, URL-encoded. The code is made in the browser (nothing is sent anywhere), and the window is drawn outside
the page so a profile's colours can't hide it. Sharing a live link doesn't bypass anything: the room still checks blocks,
private profiles and sign-in when the person arrives. Tests read the generated code back with a QR decoder.

### 5.36 Live wallpapers made with AI

A reference photo is the first user-supplied *file* that goes to the AI service rather than to storage, and the motion setting
is a new field on every profile, so both are handled on the server:

- **The photo is data, never a link.** It arrives in the request (multipart), is held in memory and sent on; the server never
  fetches a URL the user supplied, so it can't be pointed at internal addresses (no request forgery). It is limited to 4 MB and
  one file, and checked by its own first bytes as JPEG, PNG or WebP — a text file, an SVG with a script, a GIF or an executable
  renamed to `.png` is refused (`400`), whatever its name or declared type.
- **The browser shrinks it first** (≤1024 px JPEG), which keeps phone photos under the limit and drops hidden location and camera
  details before anything leaves the device.
- **The motion is a closed set.** `wallpaperMotion` must be one of five words (`400` otherwise), so nothing a user types can reach
  the page's CSS; the animation itself is fixed CSS in the app. A private profile's wallpaper and motion stay hidden like the rest of it.
- **Cost and abuse:** 6 wallpapers per person per hour on the real AI service (a refused request doesn't use up an allowance), the
  description is capped at 500 characters, and every failure is reported in plain words without the AI provider's raw message.
- **Nothing is applied until chosen, and nothing is left behind.** The result is a preview; a picture that is discarded or never
  used is removed from storage by an endpoint that can only delete what this person generated and nothing else uses.
- **Readability:** the moving picture has the same dark scrim as a still one, and people who ask their device for less motion get a still picture.
- **Limit:** the AI model decides what it will draw from a description or photo; there is no content filter of our own beyond the
  service's, so a profile owner could generate something unwelcome (reports and blocking apply as for any profile content).
Covered by 28 backend tests (the real-provider path with the network and storage stubbed), 41 frontend tests and 24 browser runs.

### 5.37 Rearranging the playlist, and reference photos for every AI picture

- **Reordering can't be used to touch anything but your own playlist.** `PUT /api/tracks/order` takes a list of ids and accepts it only if
  it is *exactly* the caller's own tracks, each once; a missing, extra, repeated, foreign or non-string id (or an object such as
  `{"$ne": ""}`) is a `400` and nothing moves. Updates are also filtered by owner, and it needs a sign-in. A private profile's
  playlist stays hidden from strangers in its new order too. (Playlists had no route tests before; adding, listing and deleting are now covered.)
- **One rule for reference photos, everywhere.** The photo check from the wallpaper work — in the request, in memory only, never a link the
  server fetches, 4 MB, one file, JPEG/PNG/WebP by its first bytes, a closed set of three "how closely" words — now lives in one function used
  by both `/image` and `/wallpaper`, so every AI picture maker has the same protections and a new one can't forget them. The plain JSON request is unchanged.
- **Cost:** a photo-based picture counts against the same 10 per hour as any other AI picture (6 for wallpapers); refused requests don't use up an allowance.
- **Moving songs while one plays** changes only the order of what comes next; it can't start, stop or swap what is playing.
Covered by 21 backend tests, 22 frontend tests and 30 browser runs.

### 5.38 Hosting a live from a phone

A report that going live from an Android phone dropped the connection led to hardening the host's side for how phones behave.
A short loss of network was reproduced with an Android-style Chrome against the live site (4 s and 12 s offline) and the live survived,
so the changes target what real phones add: the screen locking, the microphone being paused or taken by the system, and the
host connection giving up for good after a single drop.

- **The host reconnects itself** (3 tries, pass minted fresh by the API each time, so the same access rules apply: a refused or
  ended live is not retried), and says so, instead of ending in "end this live and start a new one".
- **A network that blocks the direct audio route** (some mobile carriers and office Wi-Fi) is handled by a connection that dies within moments of starting being retried through the media server's relay. The pass is still minted by the API with the same rights; only the route differs, and it carries the same encrypted audio. The *Connection details* the host can copy hold only times, connection states and the phone's network type and browser name, nothing about other people.
- **The microphone can't be silently dead:** if the phone pauses or takes it, the host is told in words.
- **The screen is kept on while live** (where the browser allows). This does not change the rule that the microphone can't stay on out
  of sight: leaving the page, closing the tab or losing contact for 45 s still ends the live.
- **Not covered:** a phone's own Wi-Fi or mobile-data switching, battery savers, and apps that take the microphone are outside the page's
  control; the page explains what it sees. A host who locks the screen or switches app for longer than 45 s will still find the live ended.
Covered by 36 frontend tests and 9 browser runs.

### 5.39 Planning a live ahead, with reminders

A host can schedule a live and people can ask to be reminded. The risks were spam, leaking who is planning what, and reminders that
repeat or arrive for something that no longer exists.

- **Who can plan:** only a verified email, 5 upcoming plans per host, 10 a hour, a start 5 minutes to 30 days ahead, a title of at most 80
  characters shown as plain text. Only accepted friends are told; nobody else is sent anything on creation.
- **Who can see a plan:** the same rules as a live — hosts you blocked (or who blocked you) are omitted, and a private-profile host's plans are
  seen only by friends and themselves. A plan you can't see is `404` to remind yourself about, the same answer as a missing one.
- **Only the host can cancel**, and cancelling (or the account being deleted) removes the plan, its notifications and the person's reminder entries.
- **Reminders are sent once.** The plan is claimed with a single atomic update, so the 60-second timer, a page load and a second server can't
  each send one. A plan more than 2 hours past its time is not reminded (an outage doesn't produce a flood of stale reminders).
  Plans expire on their own 2 days after the start.
- **Starting a live from a plan** only works for the host's own plan (the id is checked against the host); it can't be used to mark someone else's plan started.
- **Not covered:** a reminder is an in-app notification, not an email or push message, so it reaches people only when they next have the site open.

Covered by 22 backend tests, 4 frontend test files (calendar wording, form, list, Live page, notification bell and links) and 5 browser runs.

### 5.40 Mood, "listening to", tags and discovering people

Profiles gained a short mood line, a "listening to" line and up to 8 tags, and the search page gained a browse-by-tag list and the newest
creatives. This adds free text that other people read and a new way to list accounts, so the risks were markup/invisible-character
tricks, listing people who chose to be private, and the tag list becoming a way to enumerate accounts.

- **Text is shown as text.** The lines are plain React text (no markup is ever rendered) and the server also strips control and invisible
  characters (zero-width and direction-override characters that can disguise text), so a mood can't be made to look like something else. Over-length or invalid input is `400`, not silently cut.
- **Tags are normalised the same way in the browser and on the server** (lower case, 2–24 letters/numbers/spaces/hyphens, a letter or number first, no duplicates, at most 8). The tag
  link in an address is checked again before it's used, so `/search?tag=<script>` is ignored.
- **Private profiles are never listed.** Discover and the popular-tags counts include public profiles only, and a private profile's mood and tags are not returned to people who can't see the profile.
  Blocks work both ways (no one you blocked, or who blocked you, appears), and you are never listed to yourself.
- **Not an enumeration list:** the list is paged (20 a page, 50 pages at most) and shows only what a public profile already shows; a signed-in session is required.
- **Reserved addresses:** `discover` and `tags` can't be taken as usernames, so they can never shadow the new routes.
- **Not covered:** tags and moods are not moderated for content, only for form (the report button on a profile is the way to flag one).

Covered by 22 backend tests, and frontend tests for the tag rules, the editor, the profile display, the discover page and 3 browser runs.

### 5.41 Blog entries: long text from users, with the same privacy as their profile

Blog entries are the first long free text on the site (up to 10,000 characters), readable by other people, and announced to friends.

- **Reading follows the profile.** The list uses the same gate as the rest of a profile (private → friends only, blocked either way → refused),
  and a single entry whose author you can't see answers `404`, the same as a missing one or a malformed id, so the answer doesn't reveal which entries exist.
  Only signed-in people can read; the profile page doesn't even ask when you're signed out.
- **Only the author can change or delete.** The route finds the entry by id *and* author, so anyone else gets `404` and nothing changes; the author is set from the session, never from the body
  (a request that sends `author` or `createdAt` has them ignored — tested).
- **Text is shown as text.** The browser draws title and body as plain text (the paragraphs are plain elements; markup in an entry is displayed as typed, tested in unit and browser tests), and the server removes
  control and zero-width/direction-override characters, normalises line breaks and allows at most one blank line in a row. Over-long input is `400`, never silently cut.
- **Volume is bounded:** a verified email (when the operator requires it), 10 writes an hour, 200 entries per author, 10 per page; lists carry only an excerpt, so a long entry isn't sent 10 times over.
- **Reportable:** entries are a report target (`blogEntry`); a report, the entry, and the friends' announcement all go with the author's account, and deleting an entry removes the announcements.
- **Not covered:** there are no comments on entries yet; entries aren't moderated for content (reports are the route), and a friend who has already read an entry can have kept a copy.

Covered by 18 backend tests, frontend tests for the list, the entry page, the editor, the notification and the date, and 3 browser flows (write → friend notified → edit → delete; validation; a private profile's entry).

### 5.42 Rearranging and hiding profile sections

The owner can put the parts of their profile (top friends, music, portfolio, blog, testimonials) in any order and hide any of them from visitors.

- **Strict input:** `sectionOrder` must be every known section exactly once and `hiddenSections` only known names, each once; anything else (a short list, a duplicate, an unknown name, a non-list, an injection-style object) is `400` and nothing in the request is saved. Only the owner's own profile can be changed (`PATCH /me`, by session).
- **Stored loosely, read strictly:** an older profile with nothing saved, or a saved order from before a section was added, is completed on read, so a new section appears in its usual place instead of vanishing.
- **Hiding is presentation, not privacy.** A hidden section is not drawn for visitors, but the data behind it (for example the portfolio or blog endpoints) is governed by the profile's privacy and block rules, exactly as before; to keep content from people, make the profile private or delete it. The editor says "Hidden from visitors" rather than "private" for this reason.
- **Private profiles:** the arrangement is part of the profile and is not returned to someone who can't see the profile.
- **Accessible controls:** up / down / hide buttons with names ("Move Music up"), not drag-only, so keyboard, screen-reader and phone users can arrange sections; changes save straight away and an error is shown if one can't be saved.

Covered by 12 backend tests, frontend tests for the helpers, the frame and the profile page, and 3 browser runs (incl. a phone-width layout).

### 5.43 Bulletins: broadcasting to friends without becoming a spam channel

A bulletin is a short message to every friend at once. The risks were spam, readers who shouldn't see it, and stale content.

- **Friends only, decided when read.** A bulletin is returned only to its author and to people who are accepted friends *now* (and not blocked either way), regardless of whether the author's profile is public. Unfriending or blocking takes the board away immediately; a pending request shows nothing.
- **Bounded:** verified email (when required), 5 a day, 10 up at once, 500 characters of plain text (cleaned of hidden characters), 50 on the board; each bulletin expires after 10 days through a database TTL, and the board also filters on the expiry so a late clean-up never shows an old one.
- **No notification fan-out.** Friends see a count on the feed instead of one notification per friend, so a busy poster can't flood anyone's notification list; the "seen" time is private (never in any profile response).
- **Author-only removal** (found by id *and* author, otherwise the same `404` as a missing one); the author, dates and expiry come from the server, never from the request body (tested with a forged `author`/`expireAt`).
- **Reportable** (`bulletin` is a report target); bulletins and their reports go with the account.
- **Shown as text:** markup in a bulletin is displayed as typed (unit and browser tested).
- **Not covered:** a friend can still copy a bulletin before it expires, and bulletins are not moderated for content beyond reports.

Covered by 15 backend tests, frontend tests for the board, the feed strip and the date wording, and 3 browser flows (post → friend sees a badge → badge clears → stranger sees nothing → take down).

### 5.44 "Online now" and "last active": presence without surveillance

Showing when someone is around is useful and is also behavioural data (it reveals routines). It was built so that it is visible to as few people as possible, in as little detail as possible, and can be switched off.

- **Friends only, decided when read.** Activity is added to a person's profile, the friends list and the conversations only for an accepted friend of someone who allows it. Strangers, pending requests, signed-out visitors, search/discover results, and anyone blocked either way get nothing (all tested), and a private profile stays private as before.
- **Coarse on purpose.** The server turns the stored time into one of three words, "online now" (5 minutes), "active today" or "active this week", and sends only that; the exact time is never in any response (tested on the raw response text and in the browser), so it can't be used to infer when someone sleeps. Beyond a week there is nothing to show.
- **Can be turned off, and turning it off forgets.** `showActivity` is a profile switch (on by default, for friends only — the default is a one-line change if a stricter one is wanted). Switching it off clears the stored time immediately, stops further recording (the ping becomes a no-op), and the page stops pinging. The setting itself is visible only to its owner; `showActivity` must be a real boolean (anything else is `400` and changes nothing).
- **Only while the page is open and visible.** The check-in comes from the page, not from background requests, and a hidden tab doesn't send it, so "online" means someone is actually looking at the site.
- **Cheap to serve and hard to abuse.** The ping is one conditional update, at most one write a minute per person whatever the number of calls, and requires a session.
- **Accessible:** the status is words ("Online now"), with the dot as decoration only.
- **Not covered:** a friend can watch the page and notice when someone appears online; there is no way to appear online to some friends and not others.

Covered by 14 backend tests, frontend tests for the badge, the check-in timing (hidden tab, off switch, failures) and the three places it appears, and 2 browser flows.

### 5.45 Opt-in profile views: "who looked at my profile" only by mutual consent

Telling people who has looked at their profile is the most privacy-sensitive feature on the site: it records what individuals do. It is therefore opt-in on both sides, off by default, minimal, and deletable.

- **Mutual consent.** A visit is recorded only if the visitor has turned profile views on **and** the profile's owner has it on at that moment, and the owner is shown only visitors who still have it on. You can't watch others without being watchable. Nothing at all is recorded about anyone who hasn't opted in, and turning it on later never reveals visits from before (tested).
- **Recording reveals nothing.** The recording call answers `204` in every case (feature off for either side, profile private or blocked, profile missing, own profile, rate limit), so it can't be used as an oracle for whether someone has the feature on, whether a profile exists, or whether you may see it.
- **Only what you could already see.** No visit is recorded for a profile the visitor can't open (private and not a friend, or blocked either way), and an owner never sees a visitor they have blocked.
- **Coarse and short-lived.** The list shows a calendar day (UTC), never a time (tested on the raw response), one entry per person; a second look within 30 minutes isn't a new visit; entries expire after 30 days through a TTL, and the list also filters on the expiry; at most 50 are shown.
- **Off means gone.** Turning the setting off deletes every visit to you and every visit you made (only after the whole request has been accepted, so a refused request never deletes anything); each party's account deletion removes both kinds. The setting is visible only to its owner and must be a real boolean.
- **Bounded:** 300 recordings an hour per person, one row per pair.
- **Not covered:** an owner who sees one visitor knows that person has it on and visited; a visitor can't tell whether the owner had it on (by design, the visit simply may not be shown).

Covered by 20 backend tests, frontend tests for the card, the day wording and the recording rules on the profile page, and 3 browser flows.

### 5.46 Portfolio albums: grouping pieces without opening a way into someone else's

Albums group a person's portfolio pieces under names. The risks were putting a piece in the wrong person's album (or moving someone else's piece), seeing a private profile's albums, and unbounded growth.

- **Ownership on both sides.** Moving a piece finds it by id *and* owner, and the target album must also exist *and* belong to the same owner; otherwise it is the same `404` as a missing one (tested with another person's piece, another person's album, malformed ids, objects and arrays). The route changes only the album field: a request that also sends a `url`, `owner` or `caption` is ignored for those (tested). Renaming and deleting find the album by id and owner.
- **Same visibility as the portfolio.** Albums are listed through the profile gate: a private profile's albums are `403` to strangers and signed-out visitors, visible to friends, and refused between blocked people; albums themselves are public on a public profile, as the pictures are.
- **Deleting is safe.** Deleting an album only clears the pointer on that owner's pieces; no picture, stored file or reaction is touched. Deleting a piece needs no album clean-up because the count is computed from the pieces; deleting an account removes its albums.
- **Bounded and clean:** names are cleaned of hidden characters, at most 60 characters, unique per person ignoring case (the comparison escapes regular-expression characters, so a name like `mur.als` is a name, not a pattern), 12 albums per person.
- **Route order matters:** albums are mounted before the sign-in-for-everything moderation router so that a visitor who isn't signed in can browse them, the same as the portfolio (a test caught the first draft getting this wrong).
- **Not covered:** albums have no separate privacy setting; they are as visible as the profile.

Covered by 14 backend tests, frontend tests for the album bar, the filtering and the per-piece menu, and 3 browser flows.

### 5.47 Group boards: lasting discussion, with the same membership rule as the chat

A board gives each group lasting topics with replies. It is the first group content that stays around, so the rules for who can read it, who can remove it and what it costs to abuse it matter more than for the chat.

- **Members only, for reading and writing, checked on every route.** A non-member gets `403` (the group exists) or `404` (it doesn't, or the id is malformed) and cannot read, post, reply, delete or pin; leaving a group ends access immediately (tested). Groups themselves are open to join by design, so this is the same trust boundary as the group chat.
- **A topic belongs to exactly one group.** Every topic and reply lookup includes the group from the address, so an id from one group used under another is a plain `404`, and an admin of one group has no power in another (both tested).
- **Moderation matches the chat.** The author, or a group admin, can remove a topic (with its replies) or a reply; anyone else gets `404`. Only an admin can pin (`403` otherwise), at most 3 per group so pinning can't bury the board.
- **The server owns the facts.** Author, group, pin state, reply count and dates are set from the session and the address; a body that sends `author`, `group`, `pinned`, `replyCount` or `lastActivityAt` has them ignored (tested).
- **Text is shown as text.** Title, topic and replies are cleaned of hidden characters on the server (over-length is `400`, never cut) and drawn as plain text, so markup is displayed as typed (unit and browser tested).
- **Blocking is honoured both ways.** Topics and replies by someone you've blocked, or who blocked you, are left out, and you can't open or reply to a blocked person's topic.
- **Bounded:** 10 topics an hour and 30 replies per 10 minutes per person, 20 topics and 50 replies a page.
- **Cleaned up with accounts and groups.** Deleting an account removes its topics (with all replies in them, including other people's) and its replies elsewhere, then recounts those topics' replies; an empty group deleted with its last member takes its board with it. Trade-off, stated plainly: other people's replies disappear when the person who started their topic deletes their account.
- **Reportable:** topics and replies are report targets (`groupTopic`, `groupReply`) with a Report button on anyone else's post, and reports about a person's board posts go with their account.
- **Not covered:** there is no editing of a topic or reply, and no notification of replies yet.

Covered by 22 backend tests, frontend tests for the board, topic view and the group page, and 3 browser flows.

### 5.48 Invite links: friends by link, without a leaked link becoming a way in

An invite link makes whoever signs up through it the inviter's friend immediately, with no request to accept. That is convenient and dangerous: a friend can see a private profile, so a link that leaks (posted publicly, forwarded widely) could hand strangers access to someone's private content. The design limits what a leaked link can do.

- **Short-lived, capped and revocable.** A link expires after 7 days, works for at most 10 sign-ups, and its owner can switch it off at any time; at most 3 usable links per person and 10 new links a day (and a verified email where the operator requires it). The worst case of a fully leaked link is 10 new friends in a week, and the owner can see every one of them.
- **The cap can't be beaten by speed.** A use is counted and checked in one atomic update (unexpired, not switched off, uses below the cap), so ten simultaneous sign-ups on a link with two places let in exactly two (tested with four at once).
- **The owner sees and is told.** Each joiner is listed under the link (with the day they joined) and the inviter gets an `invite_joined` notification with the new person; the Friends page's Unfriend works as for any friend, and switching a link off keeps nobody out who is already in (so it is explicit that existing friends stay).
- **Unguessable and not an oracle.** The code is 96 random bits (12 random bytes, URL-safe). The public preview returns only the inviter's name, address and picture, never an id, email or privacy setting, answers every kind of invalid link identically (tested: wrong, malformed, too long, expired, switched off, full) and is limited to 60 lookups an hour per client address, so codes can't be enumerated and the endpoint can't be used to learn who has links.
- **A bad code never blocks sign-up and never leaks.** Registration with an unusable code creates the account normally with no friendship and no mention of why; a code over 64 characters is a `400` like any other bad input.
- **Stored as is, on purpose.** Unlike password-reset and email-confirmation tokens (which are stored only as hashes because they grant access to an account), an invite code is stored in the clear so its owner can see and share the link again; it grants only a friendship, and only within the limits above. This is a deliberate trade-off.
- **Cleanup.** Deleting an account deletes its links and removes the person from other links' lists of who joined; the notifications they caused go with them.
- **Not covered:** an invitee becomes a friend without an explicit acceptance (that is the feature); anyone holding a link within its week can use it, so people should share it only with those they mean to.

Covered by 14 backend tests, frontend tests for the panel, the sign-up page and the notification, and 3 browser flows.

### 5.49 The getting-started checklist: a nudge that can't be gamed and doesn't track anyone

The welcome flow guides new accounts through confirming their email, adding a picture and bio, a first portfolio piece, a first friend and a first post. The risks were a client being able to fake progress (for example to skip email confirmation), exposing activity data, and nagging people who didn't ask.

- **Derived, not stored.** Each step is computed on the server from the person's own data at the moment of asking (email confirmed, a picture, a non-blank bio, a portfolio piece, an accepted friendship, a post), so nothing a client sends can mark one done, and the checklist can't disagree with the account (tested step by step, including that a blank bio and a pending friend request don't count and that a friendship counts in either direction).
- **Cosmetic only.** The checklist never gates a feature: completing or skipping it changes nothing about what the person can do, so it can't be used to bypass the email-confirmation requirement where the operator turns that on.
- **Only the person's own data.** The endpoint reads only the signed-in account's own state and returns six booleans plus whether to show it; it takes no user id, so it can't be pointed at someone else (tested: two accounts' checklists are independent).
- **One thing is remembered, and it is private.** Hiding it saves a single timestamp on the account, idempotent, never returned by any profile or other response (tested).
- **Doesn't nag.** It is shown only to accounts at most 14 days old, so people who joined long before it existed never see it, and it disappears by itself when every step is done or when hidden.
- **Failure is quiet.** If the checklist can't be loaded the feed shows nothing extra instead of an error.
- **Accessible:** progress is a labelled progress bar and "n of 6 done"; a finished step says "done" in words for screen readers, not only a tick colour; each step is a real link or button.
- **Not covered:** the checklist cannot be brought back after it is hidden (only the underlying steps remain available from the profile).

Covered by 10 backend tests, frontend tests for the card, the feed and the profile's edit link, and 3 browser flows.

### 5.50 The moderation review queue: powerful tools that only the right people can reach, with a record

Reports had been collected for a while with no way to read or act on them. Giving moderators the power to delete content and suspend accounts is the most dangerous thing added to the site, so the risks were: someone gaining moderator access, a moderator abusing or fumbling that power, reports being used to attack people, and the tools giving away that they exist.

- **Who is a moderator is configuration, not data.** Only addresses listed in the server's `ADMIN_EMAILS` setting, and only when that address is **confirmed** on the account. Nothing a member can do (a profile field, a username, a sign-up form) can make them one; registering with a moderator's address doesn't help because the confirmation link goes to the real owner's inbox. The check runs against the database on every request, so removing an address, or a moderator's address ceasing to be confirmed, ends access immediately (tested). Where nobody is listed there are no moderators.
- **The tools don't announce themselves.** Every admin route answers `404` to a signed-in non-moderator, the same as a path that doesn't exist (tested for each route), the Moderation link appears only for moderators, and the screen itself says "There's nothing here" to anyone else.
- **Decisions are explicit and recorded.** A moderator chooses dismiss, remove, suspend, or remove and suspend, with an optional note; every decision (and every lifted suspension) is written to a record showing who decided, what kind of thing, about whom, and the note, but never the removed content. Moderators can't suspend themselves or another administrator, an account can't be "removed" this way, and a refused decision changes nothing (tested: open reports stay open).
- **Reports are checked and can't flood the queue.** The thing must exist, you can't report yourself, the reason is cleaned and capped at 500 characters, repeat reports of the same thing while it waits collapse into one, and a person can make 30 an hour. Reports are grouped by target so five people reporting one post is one case, and a later report about something already handled starts a new case.
- **Content is shown as text.** The review screen draws the reported text as plain text, cut at 600 characters, so reported markup can't act against the moderator (unit and browser tested).
- **Suspension is thorough but not destructive.** A suspended account can't sign in (said only after a correct password, so it doesn't reveal which accounts are suspended), its sessions stop working, its profile and everything reached through it is not found by others, and it is left out of search, discovery and tag counts; nothing is deleted, and a moderator can lift it. Removing content is a separate, explicit choice.
- **Everyone concerned is told, minimally.** Each reporter gets one thank-you that says only whether action was taken; the author of removed content is told what kind of thing was removed. Neither learns who reported, who decided, or the note.
- **Accounts leaving:** deleting an account removes the reports about it and about its content; the decision record keeps only identifiers and the moderator's own note.
- **Not covered:** suspension is indefinite until lifted (no timed suspensions or appeals), suspended people's existing content in other people's feeds is hidden only through their profile (a moderator removes specific content when it matters), there is no second-moderator review, and the person reported isn't given a chance to respond. The suspension and "removed" messages don't explain the rule that was broken beyond what the moderator writes in their private note.

Covered by 28 backend tests, frontend tests for the screen, the link and the notifications, and 3 browser flows (including a moderator reviewing, deciding and the author being suspended, signed out and let back in).

### 5.51 Paging and editing: lists that can't be used to hammer the server, and changes that can't be used to rewrite history

Two ordinary conveniences open real risks: long lists (a request that returns everything can be made to cost a lot) and editing (a way to change what other people already saw, or to sneak in what the first check would have refused).

- **Every long list is paged, and the page size is the server's choice.** The feed, a profile's posts, comments, testimonials, notifications, groups and group members each return a fixed page (20, 20, 20, 20, 30, 20 and 50) plus whether there is more; the client cannot ask for a bigger page. Cursor lists ask for "older than this id", so a request costs the same on the hundredth page as on the first and nothing is skipped or repeated when new items arrive; anything that isn't a valid id is ignored rather than passed to the database (tested with a cursor that isn't an id). Group lists use page numbers, capped. A portfolio is limited to 200 pieces on both ways of adding one.
- **Only the author can change something, and a stranger can't tell it exists.** Every edit route answers `404` for anyone else, the same as for something that isn't there. A group's admin may delete a topic or reply but not reword it, and the author of a post cannot reword other people's comments on it (tested for each kind).
- **Edits go through the same checks as the first writing.** Hidden characters removed, empty and over-long refused, nothing silently cut. Posts, comments and testimonials gained limits they did not have before (5000, 1000 and 1000 characters) and rate limits on writing them (20, 40 and 20 per 10 minutes), which also close a gap where a very long or very frequent post was accepted. Editing itself is limited to 60 changes an hour per person, so editing can't be used to flood.
- **Only the words change.** The author, date, picture, group, reply count and expiry come from the stored record, never from the edit request (tested for a post's picture and a bulletin's expiry). Editing a bulletin does not extend its ten days.
- **Changes are visible, not silent.** A changed post, comment, testimonial, bulletin, topic, reply or message carries an "(edited)" mark (the day in its tooltip), so a reader can tell that what they are reading was changed after it was first posted. A moderator reviewing a report is told when the reported text was changed after it was written, so a report about the old words can't be answered by quietly swapping them.
- **Direct messages can be changed for only 15 minutes.** A message is a conversation: after a quarter of an hour the other person has read it and may have answered, so the server refuses (`403`, `edit_window_over`) and the screen stops offering Edit (tested at the boundary; the server is the real check).
- **Notifications keep older pages across a refresh.** The bell refreshes every 30 seconds; it merges the newest page with older pages already loaded rather than throwing them away, using the ids' time order.
- **Not covered:** there is no history of earlier versions (a moderator sees the current text and the "edited" flag only), the "(edited)" mark does not say what changed, and an edit does not notify anyone.

Covered by 29 backend tests (including the moderator's view), 27 frontend tests across the editing box, every list and every kind of edit, and 4 browser flows (a post, a comment and a message changed and still marked after a reload and for the other person, and the feed paging past twenty posts) on all three browsers.

### 5.52 Comments on pictures: letting strangers write on someone's page

A comment box on a portfolio piece lets people the owner may not know put words on the owner's page. The risks were: reaching a piece you shouldn't see, filling someone's page with abuse they couldn't remove, flooding, and comments left behind when things were deleted.

- **A piece can be commented on only by people who can see it.** Reading and writing both go through the same visibility check as the portfolio itself, so a private profile, a block in either direction or a suspended account makes the piece "not found", the same 404 as a piece that never existed, and says nothing about whether it does (tested for strangers, signed-out visitors, blocks both ways and suspension). Comments by people you have blocked, or who blocked you, are left out of what you see.
- **The owner is in charge of their own page.** The owner of a piece can take down any comment on it; the author can take down, or change, their own. Nobody else can: not another visitor, and not even the owner can reword a visitor's words (they can only delete them), so a comment is never put in someone's mouth. Editing marks the comment "(edited)".
- **The same checks as every other piece of writing.** Hidden characters removed, empty and over-long (1000 characters) refused, nothing silently cut, and the author, date and piece come from the session and the address, never the request. Commenting is limited to 40 per 10 minutes per person and changing to the shared 60 an hour.
- **Abuse can be reported and reviewed.** A comment can be reported like any other content: it appears in the moderation queue with the text, who wrote it and a link that opens the piece with that comment marked, and a moderator can remove it (the author is told what kind of thing was removed) or suspend the account, as for other content.
- **Only the owner is told.** One notification per comment, to the owner, naming who and which piece, and none for your own comments on your own piece. The notification opens the owner's portfolio on that piece with the comment highlighted; the screen draws the comment as text.
- **Nothing is left behind.** Deleting a piece deletes its comments; deleting an account deletes the comments it wrote and everyone's comments on its pieces, and the reports about them (tested, including the reports).
- **Not covered:** no replies in a thread (a comment is not notified to the people who commented before), no pictures or links in comments, no way to switch comments off for a piece, and the moderator sees only the current text.

Covered by 18 backend tests, 19 frontend tests for the shared thread, the portfolio, the notification and the requests, and 2 browser flows (a visitor comments and changes a comment, the owner is told, lands on it and takes it down, and a stranger refused on a private profile) on all three browsers.

### 5.53 Events: organising people, and telling them, without being a way to spam or to leak

An event lets a person ask others to turn up somewhere, tells their friends, and keeps a guest list. The risks were: events (and who is going) being visible to people they weren't meant for, an event being used to message people, links that lead somewhere dangerous, and a host's changes being used to pester guests.

- **Visibility is decided in one place.** Every read and write goes through one check: the host's own events, otherwise the host must not be suspended or blocked either way, a friends-only event needs a friend, and a public event needs the host's profile not to be private (or a friend). An event that can't be seen is the same 404 as one that doesn't exist, in the list, by address, for the guest list, the calendar file and answering (tested for strangers, a private profile, blocks both ways and suspension). People you have blocked, and suspended accounts, are left out of the guest list.
- **Nobody can be messaged by an event.** A new event notifies only the host's accepted friends, once. Guests are told only about what they chose to answer: a change of time, place or link (one note that replaces an earlier unread one), a cancellation, and one reminder an hour before. A change to the words is silent. Hosts are limited to 10 events planned at once and 10 new ones an hour, and to the shared 60 edits an hour, and people the host has blocked are not reminded.
- **Links are only web addresses.** An online link must be https, with no name or password in it, a real-looking host name, and at most 300 characters (tested with javascript:, data:, http:, embedded passwords and an address that isn't one). It is shown as plain text and opens in a new tab with noopener and nofollow, with a note that it goes to another site. An in-person event stores no link and an online one no place.
- **Everything is text, checked like other writing.** Hidden characters removed, over-long refused rather than cut, times validated (5 minutes to 90 days ahead, an end after the start, at most 3 days long), and the host, answers, reminder state and counts come from the session and the stored record, never the request (tested by sending them). Descriptions are drawn as plain text.
- **Answering is the guest's own choice and can be taken back.** One answer per person per event (a unique index), no answering your own event or one that is over, 120 answers an hour. The host sees who answered; guests see the others who answered, as with any guest list, and can leave the list by taking the answer back.
- **The calendar file can't be turned against the person who opens it.** Text is escaped (backslash, semicolon, comma, line breaks), long lines are folded without splitting a character, and the file has a fixed name and type, so an event title can't add lines or fields to it (tested with each of those characters).
- **Reports and removal.** An event can be reported like anything else; a moderator sees the title, details, place or link and a link to the event, and removing it takes the event, the answers and the notifications it sent.
- **Nothing is left behind.** Cancelling takes back what the event sent; deleting an account deletes its events with their answers and the answers it gave elsewhere, and the reports about its events (tested).
- **Not covered:** no repeating events, no capacity limit or waiting list, no comments on an event, no way to invite a specific person who isn't a friend, no email reminders, and the guest list shows names to everyone who can see the event.

Covered by 30 backend tests, 38 frontend tests for the form, answering, the list, the event page and the notifications, and 2 browser flows (plan, be told, answer, change the place, cancel; and a friends-only event hidden from a stranger with its calendar file) on all three browsers.

### 5.54 Richer music: bigger playlists without bigger bills, play counts that can't be inflated, and a profile song that never ambushes anyone

The playlist grew from five tracks to twenty, gained artists, a profile song and play counts. The risks were: storage cost (uploaded songs are files we pay for), a counter that anyone could inflate or use to watch people, unchecked input (the track route had accepted any title and any address as an "uploaded" song), and the old MySpace problem of music that starts by itself.

- **A storage plan, not just a bigger number.** The 20-track list holds at most 5 uploaded songs; the other 15 can only be YouTube links, which cost nothing to keep. The two limits are checked separately and the error says which one was hit (tested at both).
- **An uploaded song has to be one we stored for you.** Adding an "uploaded" track used to accept any address. It now has to be a file recorded as uploaded by the same person and as audio: an arbitrary web address, someone else's file, and a picture of your own are all refused (tested). That also means a track can no longer be used to point at someone else's stored file or at a site that tracks listeners.
- **Text is checked like the rest.** Title (100) and artist (80) are cleaned of hidden characters and refused rather than cut; a title can't be emptied; a malformed track id is a 404 instead of a server error; the owner, address, position, play count and profile-song mark come from the stored record, never the request (tested by sending them).
- **Plays count once a day per listener per song.** A listener's play is recorded for a day (a unique record that the database removes by itself); a second play in that day, or five at the same instant, changes nothing (tested, including the race on the unique record). The owner's own plays are never counted. The site only reports a play after the listener has stayed on a song for ten seconds, so skipping past doesn't count, and the server limits a person to 300 reports an hour.
- **Plays follow who may see the song.** Reporting a play needs a sign-in and the same visibility as the profile, so a private profile, a block either way or a suspended account is the same 404 as a song that isn't there (tested). Only the total is kept; the response and the track never say who listened, and the day's records go when the song or the listener's account does (tested).
- **A profile song is a mark, not an autoplay.** One song per person can be marked (setting another moves the mark, in one request, tested), and the profile shows a "Play profile song" button and a badge. Nothing plays until someone presses play, so music never starts by itself on a visit. Only the owner can mark songs, and a visitor sees no editing controls (tested).
- **Not covered:** a play is counted from the listener's report, so a determined person with many accounts can still add to a count (the daily limit and ten-second rule make it slow, not impossible); counts include only plays by signed-in people; there is no list of who listened; and the cap checks are made just before adding, so two adds at the same instant could briefly exceed a limit by one.

Covered by 17 backend tests, 17 frontend tests for the player, the play counter and the requests, and 2 browser flows (naming a song, picking the profile song, a visitor playing it and being counted, the owner's own listening not counting; and a full 20-track playlist) on all three browsers.

### 5.55 About me: personal details that people share on purpose, and only with the people they choose

An About me section asks for the kind of thing people are rightly careful with: where they live and when they were born. The risks were: details shown to people who were never meant to see them, an age or a full birthday that identifies a person (and a child), notes that could be used to pester, and long text that could carry anything.

- **Sharing is a choice, and the default shares nothing.** Every field starts empty. A place is shown to friends only unless the owner picks everyone (tested for friends, strangers and signed-out visitors, and the setting is only sent to the owner). A birthday exists only if the owner turns it on; turning it off deletes it rather than hiding it (tested).
- **No year, no age.** A birthday is a month and a day and nothing else: a year sent with it is ignored and isn't stored (tested), and nothing on the site shows an age. Only the owner and the owner's friends can see the day, and unfriending takes it away (tested). Impossible days (30 February, 31 April, month 13, text, lists) are refused, and 29 February is allowed.
- **Reading follows the profile.** The answers are shown to anyone who can see the profile; a private profile, a block either way and a suspended account give a stranger nothing (tested, signed in and not). They are served from their own address, not with every user in a list, so searching or listing people never carries anyone's answers, place or birthday.
- **Birthday notes can't be used to pester.** One note per friend, once a year, only to accepted friends, never to anyone blocked either way or from a suspended account, and not again when the birthday is cleared and set again the same year (tested, including 29 February). A person can't make friends get more than one a year, and the owner is never sent one for themselves.
- **Everything is plain text, checked like other writing.** Hidden characters removed, over-long (300 characters, 60 for the place) refused rather than cut, non-text refused, and the profile owner, not the request, decides whose answers are changed (tested by sending someone else's name). It is drawn as text, never markup (unit tested with a tag in the text). Changing it counts against the 60 edits an hour.
- **Moderators see it.** A report about an account shows the bio, the answers and the place, so what is reported is what is on the page.
- **It goes with the account.** The answers are part of the account record, so deleting the account deletes them, and the birthday notes it sent are removed (tested).
- **A section like the others.** About me is one of the profile's sections and can be moved or hidden; it is first for new profiles and last for people who had already arranged theirs. To visitors an empty one doesn't show at all.
- **Not covered:** the day of a birthday is the UTC day, so it can be a few hours off for people far from UTC; the place is free text and isn't checked against anything; and people who can see the birthday (friends) can of course remember it.

Covered by 19 backend tests, 15 frontend tests for the section, its form, the requests and the notification, and 2 browser flows (filling it in and what a friend and a stranger see, taking the birthday back, and a private profile) on all three browsers.

### 5.56 Richer comments: letting strangers put pictures and links on someone's page

Comments can now carry a picture or GIF and web addresses. That gives strangers a way to put an image in front of a page's owner and visitors, and a way to point them somewhere else, which is exactly how comment spam, tracking and harassment work. The design is to allow as little as makes the feature useful.

- **A picture has to be a file this site stored.** A comment never takes an address the sender typed: no hot-linked images, so no tracking pixels that tell a stranger's server who looked, no pictures that change after they were reported, and nothing from a server we don't control. The picture is uploaded first, to this site's own storage, from the file the person chose; the comment names it, and the server accepts it only if it is a file recorded as uploaded by the same person and as an image (tested with another site's address, an http address, a data address, someone else's upload, a video and an AI image).
- **What can be uploaded.** PNG, JPEG, WebP and GIF only (SVG, which can carry script, and video are refused), up to 5 MB, and 20 pictures an hour per person; a file over the limit or over the allowance is removed from storage again at once (tested). A picture is shown as an image with a fixed description and opens full size in a new tab; it is never embedded as anything else.
- **Links are text first.** Web addresses are found in the text and drawn as links by the page itself (never as markup from the sender), at most three to a comment, only http and https, and never an address with a name and password in it (the "paypal.com@evil.example.com" trick stays as plain text; unit and browser tested). A link shows the address it goes to, shortened if long, with the whole address in its title, and opens in a new tab with noopener, noreferrer, nofollow and ugc.
- **Taking it back.** The author can take a picture off their comment, keeping the words, but cannot swap in a different picture, because a new picture is a new thing for people to look at and that is a new comment (tested). A comment with neither words nor a picture is refused, and one can't be edited into that.
- **Storage doesn't leak.** A picture added and then not posted is removed when the person clicks Remove; deleting the comment, the post, the piece or the account removes the picture too, including other people's pictures in what went with an account, and a picture two comments share stays until both are gone (tested for each path, and for a moderator's removal).
- **Moderators see it.** A report shows the picture's address and words, and removing the comment removes the picture.
- **The usual limits still apply** to the comment itself: 1000 characters, the rate limits on writing (40 per 10 minutes on posts and pieces, 20 on testimonials), the 60 edits an hour, and who may see what.
- **Not covered:** there is no automatic check of what a picture shows (reports and moderators are the check), a link can lead anywhere on the web and nofollow only tells search engines, an abandoned upload (a person closes the page after choosing a picture) stays in their storage until they delete the account, and GIFs play without a pause control.

Covered by 24 backend tests, 33 frontend tests for the link finder, the picture and the picker, the three kinds of comment and the requests, and 3 browser flows (links, the link limit, refusal of other addresses) on all three browsers. A real upload isn't exercised in the browser tests, because the test servers have no storage account (the upload path is covered by the backend tests with a fake storage service).

### 5.57 Comments on blog entries: another way for strangers to write on someone's page

Blog entries are long, public writing, so they draw comments. Comments there are the same kind of risk as comments on pictures and posts (abuse the author can't remove, reaching writing you shouldn't see, flooding, files left behind), and they go through the same single check as every other comment.

- **Only people who can read the entry can read or write on it.** Both go through the entry's own gate, so a private profile, a block in either direction or a suspended author gives the same 404 as an entry that doesn't exist (tested for strangers, blocks both ways and suspension). Comments by people you have blocked, or who blocked you, are left out of what you see. Like the rest of the blog, everything needs a sign-in.
- **The author is in charge of their page.** The author of an entry can take down any comment on it; the commenter can change or delete their own. Nobody else can: not another reader, and not even the author can reword someone else's words (tested), so a comment is never put in a person's mouth.
- **Same checks as every comment.** Hidden characters removed, empty and over-long (1000 characters) refused, nothing cut, at most three web addresses, one picture that must be a file the same person uploaded here and never an address they typed (see 5.56), the author and entry taken from the session and the address and never the request (tested by sending them), 40 comments per 10 minutes and 60 edits an hour.
- **Only the author is told.** One note per comment, to the entry's author, naming who, which entry and which comment, never for their own comments. It opens the entry with the comment highlighted.
- **Reports and moderators.** A comment can be reported; the moderator sees the words, any picture and a link that opens the entry at that comment; removing it removes the picture from storage. A moderator who removes an entry removes its comments and their pictures with it.
- **Nothing is left behind.** Deleting an entry deletes its comments, their pictures and the notes about them; deleting an account deletes the comments it wrote and everyone's comments on its entries, releases other people's pictures in them, and removes the reports about them (tested).
- **Not covered:** comments are flat (a reply is another comment, so there is no threading and no note to the person you reply to), an author can't switch comments off for one entry, and a comment can't be pinned.

Covered by 19 backend tests, 12 frontend tests for the comments, the entry page, the notification and the requests, and 2 browser flows (a reader comments with a link and changes it, the author is told, lands on it and takes it down; and a private profile's entries refused to a stranger) on all three browsers.

### 5.58 Mutual friends and people you may know: what the friendship graph gives away

Showing "friends you share" and suggesting friends of friends makes the web of who knows whom visible. That is useful, and it is also exactly the information people are careful with, so the design is to show only what each person could already see, and to let people opt out.

- **Only what you could already see.** A mutual friend is someone who is a friend of both of you, so the list only ever contains your own friends: it tells you which of your friends also know this person, and nothing about anyone you aren't already connected to. A suggestion is a friend of one of your friends, shown with the friends you share (up to three).
- **People can opt out, and it is complete.** A person who switches off "Show who I know to friends of friends" is never named as a mutual friend, never suggested to anyone, and their friends are never suggested through them, and their own mutual-friends list is empty (tested for each of those, both as the connector and as the person looked at). It is on by default and only the owner can see or change it (other people's views of a profile don't carry it).
- **Profiles keep their own rules.** The mutual-friends list follows the profile's visibility (a private profile or a block gives a stranger a 403, a suspended account a 404, signed-out visitors nothing). Suggestions leave out private profiles, suspended accounts, anyone blocked either way, and anyone you already have any friendship with (accepted, pending either way, or declined), so a suggestion can never be used to find someone who blocked you or to re-ask someone who declined.
- **Dismissing is permanent and private.** "Not interested" is remembered per person (at most 500, so it can't be used to store data), is not visible to the person dismissed, and is removed with either account (tested).
- **Bounded work.** Suggestions look through at most 300 of a person's friends and 6000 friendships among them and return at most 12; mutual lists show at most 8 names with the full count, so a very connected account can't make the server do unlimited work.
- **Friend requests carry context, not a list.** A request shows how many friends the person asking shares with you, not who, and nothing at all if they keep connections private.
- **Not covered:** a person's friends are still visible to those friends through their own lists and Top Friends, and "friends of friends" can't be narrowed (it is one switch, not a list of people). Friend groups and an official first friend are not part of this.

Covered by 19 backend tests, 15 frontend tests for the mutual friends, the suggestions, the friend requests, the profile switch and the top-friends order, and 2 browser flows (mutual friends, suggestions, dismissing and the switch; and putting top friends in order) on all three browsers.

### 5.59 Search: finding things without finding what you shouldn't

Search is a second way into every part of the site, so it has to follow exactly the rules of each part: a search that was even slightly more generous than browsing would be a way around the privacy settings.

- **The same gate as the page it comes from.** People: a private profile can be found by its name (so it can be asked to be a friend) but its tags and bio never match for anyone who isn't a friend, so searching for a word can't reveal that a private profile mentions it (tested, with and without a tag filter). Blog entries follow the entry's own rule (a private author's are for friends and themselves; a blocked or suspended author's are gone). Group topics are only searched in groups you have joined and leave out anyone you blocked. Help wanted follows the board (open, public, not your own, private owners for friends only). Blocks count in both directions everywhere, and suspended accounts never appear.
- **The older name search was tightened too.** `GET /api/profiles?search=` used to list people who had blocked you or whom you had blocked; it now leaves them out like everything else.
- **Plain text, never a pattern.** Each word is escaped before it reaches the database, so `.*` or a pathological pattern such as `(a+)+$` is just text and can't match everything or make the database work forever (tested). The page also draws results as text and marks matches without using markup (tested with a markup-looking result).
- **Bounded work.** At most five words, forty characters each, 300 in all; at least two letters; 200 candidates are looked through and 100 results ever shown (five pages of twenty); every query is stopped after five seconds; and a person can search 60 times a minute. The database scan for text is the same kind the older search used; at this size that is fine, and a text index would be the next step if the site grew.
- **Ranking uses only what a person has agreed to show.** Friends and friends in common raise someone in the list, using the same rule as everywhere else: a person who has turned off "Show who I know to friends of friends" has no friends in common counted, through them or for them (tested, both ways). The count of friends in common is now found with one query for the whole page of results instead of one per person.
- **Nothing is kept by the app.** Searches are not saved against a person or shown to anyone, and the question lives in the address of the person's own browser (so it can be reloaded or gone back to). One honest limit: the server's ordinary request log records each request's address, which includes the words searched for, as it does for every other request; it holds no more than that and is not shown to users.
- **Not covered:** comments, replies and messages are not searched (messages are private, and the rest are not worth the extra exposure), and there is no spelling tolerance or "did you mean".

Covered by 28 backend tests (the question and how it is read, each kind and every rule above, ranking, filters, paging and the rate limit), 18 frontend tests (the page, each kind of result, marking matches and the request), and 3 browser flows (every kind, going back to a search, friends in common, the filters, a private profile, and a search with nothing found) on all three browsers.

### 5.60 The CSverified badge: a mark of trust that has to be hard to fake

A verified badge tells strangers "this one is real", so the risk is not only that it is wrongly given but that it is wrongly *obtained*. The design keeps the two routes narrow and honest about what they prove.

- **Only two ways, neither open to the person.** An administrator gives it (the same administrator rule as moderation: listed in `ADMIN_EMAILS` and with the email address confirmed; everyone else gets `404`, and signed-out callers `401`), or the server works it out itself. Nothing in a profile edit or at sign-up can set it: the fields are not accepted from a request (tested for both) and the only value ever sent to anyone is the single `csVerified` true or false.
- **Every administrator action is on the record.** Giving and removing are written to the same moderation record as other decisions (who, whom, when), giving it again changes nothing and adds no second entry (done with one atomic update, so two administrators at once can't both give it), and a suspended account can't be given it.
- **"1,000 active friends" is a deterrent, not proof.** Only accepted friendships count (a request that was never accepted adds nothing), and only friends whose account is not suspended, whose email is confirmed and who were seen in the last 30 days (the edges tested). Making a thousand real-looking accounts would mean a thousand confirmed emails, each created within the sign-up limit of ten an hour from one internet address, each accepting a request and staying active, and suspending a bad actor's account removes it from everyone's count. It is still possible for a determined person with a lot of time, which is why an administrator can suspend any account and the badge is not a guarantee of good behaviour.
- **It doesn't pry.** People who have chosen not to share when they are active are, by design, never counted as active, and the app doesn't keep a second hidden record to count them with: the privacy choice wins over the badge.
- **No flicker, no double announcements.** The earned badge is kept until the number falls below 900 (earned at 1,000), losing it is not announced, earning it is told once even if the check runs twice at once (one atomic update; tested with three at the same moment), and it can be earned again later. The check looks only at people with 900 or more friends and people who hold an earned badge, and runs at most once every six hours, so it can't be used to make the server do unlimited work.
- **Two badges, two lifetimes.** An administrator's badge and an earned one are separate: removing the administrator's leaves an earned one, and losing the earned one leaves the administrator's (tested both ways). A person who already shows the badge isn't told again when they get it the second way.
- **Public by nature.** Being verified is shown even on the restricted card of a private profile, because it is meant to be seen; it reveals nothing else about the profile.
- **Not covered:** a badge cannot be withheld from someone who has earned it other than by suspending the account; there is no appeal process or public explanation of why a particular person has it; and the badge does not check anyone's real-world identity.

Covered by 11 backend tests (the administrator routes and who may use them, the record, giving and removing, the list and its paging, nothing a person can set themselves, counting active friends at its edges, earning, keeping and losing, the two badges kept apart, the timed check and its limits, and the one-announcement guarantee), 15 frontend tests (the badge, the moderation view, the note, the profile and the search result) and 1 browser flow (an administrator gives the badge, it shows on the profile and in search, the person is told, then it is taken away and recorded) on all three browsers.

### 5.61 Captions on photos: words from the owner, shown to everyone

A caption is text the owner puts on their own page and everyone who can see that page reads, so the questions are what it can contain, who can change it and who can see it.

- **Only the owner, only the words.** Changing a caption is part of the owner-only edit of a piece (anyone else gets `404`, signed-out callers `401`), and the edit can touch nothing but the caption and the album: the address, type, owner and AI mark cannot be changed through it even if sent (tested). If the album part of an edit fails, the caption is not changed either.
- **One checker for every way in.** Adding by link, uploading with a caption and editing all go through one function, so they cannot disagree: one line, hidden and control characters removed, at most 200 characters counted as people see them (so a row of emoji isn't cut short or let through long), and a caption that isn't text, or is too long, is refused with the reason. A caption sent with an upload that can't be kept refuses the whole upload and takes the stored file out again, leaving no record (tested), so a bad caption can't be used to leave files behind.
- **Plain text, never markup or links.** The page draws a caption as text, so a caption such as `<b>x</b>` or `<img onerror=…>` shows as those characters and does nothing, and a web address in it is not made into a link, so a caption can't be used to put a clickable link where the site's own link rules (for comments) don't apply.
- **Seen by exactly the people who see the piece.** Captions are part of the portfolio, so they follow the profile's rules: a private profile's are for friends and the owner, and blocked people get nothing (tested). They are also the picture's description (`alt`) for screen readers.
- **Not covered:** captions are not checked for what they say (as with a post or a bio, that is for reports and moderators), they are not searched, and the owner is trusted to describe their own picture truthfully.

Covered by 16 backend tests (what a caption can be, adding, uploading, editing, who may and who sees), 15 frontend tests (writing one before adding, adding, changing, taking off, the reasons shown, and what a visitor sees) and 3 browser flows on all three browsers.

### 5.62 Push notifications: a message the server sends to an address someone else gave it

Push is unusual because the server makes outgoing requests to an address supplied by a visitor, and then puts a message on someone's lock screen. Both are risks.

- **The address can't be anywhere the sender likes.** A device tells the server where to send its notifications, and the server will make a request there. Left open, that would let anyone make this server send requests to any web address, including internal ones (server-side request forgery). So an address is accepted only if it is https, on the usual port, with no name or password in it, and on a known browser push service (Chrome and other Chromium browsers, Firefox, Safari and iPhones, Windows); look-alikes such as `fcm.googleapis.com.evil.example`, `evil.fcm.googleapis.com`, a bare `push.apple.com`, other ports, IP addresses (including `127.0.0.1`, `::1` and the cloud metadata address) and non-https schemes are all refused (tested one by one). The keys are checked for shape and size, and a person's devices are capped at ten.
- **Only the owner's devices, and a device belongs to its latest user.** Signing a device up, turning it off and the switches are all for the signed-in person's own account. If two people use one browser, the person who signed in last owns the device (tested), and logging out turns the device off for that account first, so the next person on a shared computer never gets the previous person's notifications. Deleting an account removes its devices.
- **What shows on a lock screen is minimal.** A push says who and what ("Zoe sent you 2 messages") and the page to open, never what was written (tested: message words, comment words and entry titles never appear). Names are shortened. The page opened is always a path on this site: the worker ignores any other address, including `https://…`, `//host` and `javascript:` (tested).
- **No spam, and no way around the switches.** Each of six kinds can be switched off, a suspended account gets nothing, and no more than 30 go to one person an hour (the bell still shows everything). A test message is limited to five an hour and goes only to your own devices, and signing up devices is limited to 20 an hour.
- **It never breaks anything else.** Sending happens after the notification is made and never waits for or fails it (tested with a sender that errors), a device the browser says is gone is forgotten, and without the three keys nothing is sent and the site says so.
- **The worker can't serve an old site.** It caches nothing and answers no requests (tested), so this does not bring back the stale-copy problem that was the reason for having no service worker before.
- **Secrets.** The private key is only ever in Render's settings; nothing in the repository or the page contains it. The test run here used throwaway keys that were never saved.
- **Not covered:** the push services themselves (Google, Mozilla, Apple, Microsoft) can see that a notification was sent to a device and its size, though not its words, which are encrypted for the browser; and a person who loses control of their device can still see notifications that arrive there until they sign out or turn it off.

Covered by 26 backend tests (what an address may be, signing up, the limits, devices and who owns them, the switches, the test message, when a push is and isn't sent, what it says, forgetting dead devices, and surviving failures), 43 frontend tests (the worker's behaviour, the browser helpers, every state of the settings, and logging out) and 4 browser checks on all three browsers. A real subscription needs a browser maker's push service, which an automated browser doesn't have (the settings were exercised up to that step, and show a clear message when the browser can't finish), so that last step is checked by hand on a real phone once the keys are set.

### 5.63 Emoji reactions: a small way to write on someone else's work

A reaction is something a visitor adds to a post or a picture that the owner didn't write, so the questions are what it can be, who may do it, and whether it can be used to pester anyone.

- **Only six things it can be.** The server accepts one of six fixed names (or null to take it away) and nothing else (tested with numbers, text, the emoji themselves, objects and the old like/dislike form). Free text or arbitrary emoji are never stored, so nothing offensive or oversized can be attached to someone's work this way, and counts can't be skewed by variants.
- **The same gate as the thing itself.** To react to a post you must be allowed to see its author's profile, and to a picture the profile it is on: a private profile's are for friends, and a blocked person gets the same 404 as for something that doesn't exist, so a reaction can't be used to find out that a private post exists (tested). A signed-out visitor sees the counts and can't react.
- **One each, and no way to inflate a count.** A reaction is one row per person per thing (a unique index, with a retry for two requests at once), so repeating or switching never adds to the total, and a person can't react to the same post twice under one account. Taking it away removes it. Reactions on a thing, and the notes about them, go when the thing goes (the owner deleting it, a moderator removing it, or either account being deleted).
- **Hard to use for pestering.** The owner is told once for each person and thing, and only for the first reaction: changing it, taking it away or putting it back doesn't send another note (tested), and a person's own reaction to their own post never does. The note says who and what, and on a lock screen shows only that ("Zoe reacted 🔥 to your post"), never the post. All reacting shares one limit of 300 an hour, the owner can turn off the push for comments and reactions, and the bell still holds them.
- **No dislike.** The old like/dislike on pictures became these. Likes were carried over as 👍 when the server started (safe to run twice, or from two servers at once; tested), and dislikes were dropped on purpose: there's no emoji for them, and showing "who disliked my work" is the kind of thing this change is meant to avoid.
- **Not covered:** the page shows how many of each, not who (people can see only their own reaction); and reactions aren't searched or reported separately (a post can still be reported as a whole).

Covered by 17 backend tests (the six, what is refused, pictures and posts, who can see and react, one each, being removed with the thing, the single note and the push, the limit, and carrying the old likes over), 24 frontend tests (the bar, the post, the picture, the notification and its target) and 3 browser flows on all three browsers (a picture, a post with a friend, and a notification that opens the post).

### 5.64 Profile styles: letting people change how a page looks without letting them break it

Letting people restyle their own page is the feature that made profile sites feel personal, and also the one that let people attack each other: raw HTML and CSS can hide links, cover other people's buttons, run scripts or load things from elsewhere. The design here is to give a lot of choice and no free text at all.

- **Only fixed choices, checked on the server.** Every setting is one of a fixed list (card style, corners, spacing, headings, picture shape, width), one of ten listed fonts, or a six-digit hex colour. Anything else is refused with a reason (`400`): other colour formats (`red`, `rgb()`, three-digit, with trailing text), fonts that aren't on the list (including ones carrying CSS), values with the wrong case, non-text values, and any setting name that doesn't exist (so there is no `customCss` field to slip something into). Tested one by one, including strings made to inject style rules. A request with any bad part changes nothing at all, not even the other fields sent with it.
- **A saved value can never become markup or a style rule.** The page turns each saved value into one of a handful of fixed attribute values (anything not on the list falls back to the usual one; tested with a value made to break out of the attribute), and the looks are written once, in the site's own stylesheet. Fonts are only system fonts already on a person's device, so nothing is loaded from another site and a profile can't be used to make visitors' browsers contact anyone.
- **Nothing can be hidden or covered.** Because the styles only change colours, borders, corners, spacing, heading appearance, picture shape and width of the page's own boxes, they can't hide a Report or Block button, move one over another, overlay the page, or make text vanish. The width is capped, and a wide, roomy page was tested to fit a phone without sideways scrolling.
- **Text stays readable on every style.** The existing guarantee (text is nudged to a readable shade on any colour or wallpaper) is kept, and every box style (outline, glass, flat) was run through the automated contrast check on a white, a middling and a dark background and on a wallpaper, on all three browsers, for both visitors and the owner editing. That testing found a real failure: a first glass style lightened dark pages and dropped accent-coloured text below the readable limit; it now tints the same way the usual boxes do, and on a wallpaper every box keeps a dark tint.
- **Seen exactly by whoever sees the profile.** The styles are part of the profile, so a private profile's are kept back from strangers (tested), and the feed takes only the background and none of the styles. People who saved a theme before these settings existed are unaffected; their saved values are still accepted, and the old four fonts are exactly as before.
- **Not covered:** there is deliberately no custom CSS, custom HTML or uploaded stylesheet; people who want unusual layouts can't have them. Someone can still choose an ugly combination of colours (the readability guarantee covers whether text can be read, not taste).

Covered by 16 backend tests (every choice and every refusal, saving, partial changes, taking a setting away, old settings, atomicity, who sees it), 25 frontend tests (the choices and presets, every control, the page carrying the choices, the width, saving every setting, and a check that every choice has a rule in the stylesheet) and 6 browser flows plus 12 contrast checks on all three browsers.

### 5.65 Where you're signed in: seeing every device, and ending any of them

Until now a sign-in was a signed cookie that stayed valid for seven days wherever it was. The only ways to end it were to log out in that very browser or to change the password, so a phone left signed in at a friend's, or a cookie someone had copied, could not be ended on its own. This adds the list that most sites have.

- **Every sign-in has a row, and the cookie points to it.** The row holds a plain label ("Chrome on Windows"), when it started and when it was last used, and nothing else: not the address it came from and not the browser's own text. The label is picked from fixed lists of browser and system names, so nothing a browser sends can appear on a page (tested with script text, a hundred thousand characters and an array). A token works only while its row exists, so ending a sign-in from the list, logging out, or changing the password stops that device on its very next request (tested for each, including a cookie copied before logging out). Before this, logging out only cleared the browser's own copy.
- **Only your own list, and it can't be used to reach anyone else's.** Someone else's sign-in, one already ended and a malformed id all get the same 404, so nothing can be learned about other people's sessions (tested one by one, with the other person still signed in afterwards). A token naming a row that belongs to someone else, or a made-up one, is refused (tested). The list is not part of the public profile or of `/me`.
- **You can't lock yourself out by mistake, or be tricked into it.** The device in use can't be ended from the list (it is told to use Log out), "sign out everywhere else" keeps this device, and changing the password both ends every other sign-in and keeps (and lists) the one that made the change. Ending sign-ins is limited to 30 an hour, so a script with a stolen cookie can't churn them, and looking at the list never counts.
- **Old sign-ins aren't stranded.** Cookies issued before this have no row, so there is nothing to end one by one. They keep working until they expire (so nobody is signed out by the update), get a row the first time their owner opens the list, and are ended by "sign out everywhere else" (tested, including when the one using it is itself an old one).
- **Bounded.** At most 20 per person (past that the least recently used go first, tested), each row removes itself after seven days like the cookie (a database index, tested), "last used" is written at most every ten minutes so ordinary requests write nothing (tested), and deleting an account removes its rows.
- **Not covered:** two-step sign-in and an email when a new device signs in are now available (see 5.66 and 5.68); the list does not show where a device is, because no address is kept on purpose; and someone who has the password can sign in again after being signed out (changing the password is what stops that, which the page says).

Covered by 32 backend tests (the labels, every way a sign-in can start and end, the limits, other people's, old cookies), 12 frontend tests (the list, one and all, errors, a device already gone, the wording, one at a time, the time words) and 5 browser flows with two devices plus 2 contrast checks on all three browsers.

### 5.66 Two-step sign-in: a stolen password is no longer enough

A password is the only thing between an attacker and an account, and passwords are reused, guessed and leaked. Two-step sign-in adds a code that only the person's phone can make. It is optional, because most people on a small site won't want it, and built so that turning it on can't lock someone out by accident.

- **The code is the standard one.** A 6-digit code that changes every 30 seconds, from any authenticator app (RFC 6238), written with Node's own crypto instead of a library, and checked against the RFC's published test values and against random mistakes (digits only, no spaces inside, nothing but text). It is accepted for the current step and one on either side, so a phone clock that is a little off still works, and every step is compared whatever the answer, so how long it takes shows nothing.
- **No sign-in until the code is given.** A right password for such an account sets no cookie; it returns a five-minute signed note that only the second step accepts. The note can't be used as a sign-in cookie (it has no account id and the sign-in check refuses anything signed for a purpose; tested by putting it in the cookie), can't be forged or reused after it expires, stops working if the password changes before the code is given, doesn't work for a suspended account, and can't be used for another person's (all tested). A wrong password looks exactly the same whether or not the account has it on, so it can't be used to find out who has. Resetting a forgotten password by email doesn't skip it.
- **A code works once.** The newest step used is recorded in the same database step that accepts the code, so the same code (or an earlier one) is refused afterwards and two requests carrying the same code can't both succeed (tested with both at once). Without that, someone watching a person type the code could use it again within the half minute.
- **Guessing is limited.** Five wrong codes in 15 minutes for one person stop further tries for them, even with the right one, and 30 from one address stop that address (so many addresses can't be spread across one account, and one address can't be spread across many). The password asked for when turning it on or off is limited like every other place a password is asked for.
- **The secret is kept readable only to the server, and codes aren't kept at all.** The secret has to be read back to check codes, so it is stored sealed (AES-256-GCM, a key derived from the site's own secret; anything altered fails to open, tested), which means a copy of the database alone can't make codes. The eight recovery codes (50 random bits each, no look-alike characters) are only stored as hashes and shown once; each works once, however carelessly typed, and getting new ones cancels the old. None of it appears in the profile or in `/me` (tested).
- **It can't lock someone out by a mistake in setup.** It isn't on until the first code from the app matches, a new setup key replaces any waiting one, and the recovery codes are shown (with copy and download, and a box to say they're saved) before the person can finish. The page warns when only two or fewer are left. Turning it off or getting new codes needs the password and a code, and the owner is emailed when it is turned on or off, so someone who gets into a signed-in session can't quietly weaken the account.
- **Not covered, on purpose:** there is no recovery by email, because anyone who controls the inbox could then walk around the second step; someone who loses both the phone and the recovery codes can't sign in (the site's team could clear it by hand in the database, which is not offered as a feature). Codes can be phished, as with any one-time code; passkeys (5.70) are the answer to that. It isn't required for anyone (the email about sign-ins from a new browser, 5.68, is on by default).

Covered by 55 backend tests (the code maker against the RFC's values, the sealed secret, setup, every way a login can go right or wrong, replay and races, limits, the note, turning it off, new codes, and what is never shown), 29 frontend tests (every step of the settings, copy and download, the login code step and its errors, wording), and 6 browser flows (playing the part of the phone with its own code maker) plus 3 contrast checks on all three browsers. The contrast checks found a timing problem in the test, not the page: a button was being measured mid-fade.

### 5.67 Download my data: giving people their own data without handing out anyone else's

People should be able to take a copy of what they put on the site. The risk in building it is the opposite of most features: the more complete the file, the more likely it is to include something that isn't the person's to take (other people's messages, anything that guards the account) or to be taken by someone who is not the person.

- **Only the owner, and only with the password.** The file holds the email address and private messages the person sent, so, like deleting the account, it asks for the password again: a stolen session or a borrowed phone left signed in can't take it. Wrong passwords are counted (5 in 15 minutes, then 429), a password that isn't text (an object meant to confuse the database) or is absurdly long is refused, and it is limited to 3 downloads an hour so it can't be used to keep the server busy; a wrong password never uses one up (tested). The file is for the signed-in account only, whatever other data exists (tested with two people who each have data).
- **A list of what is included, not a copy of what is stored.** Each section names its fields; nothing is copied as a whole record, so a field added to a model later isn't exported until someone decides it should be. That is what keeps the password hash, the two-step secret and recovery codes, sign-ins, push device addresses, invite codes, suspension notes, reports and the site's own records out (tested by searching the whole file for each).
- **Other people's words stay theirs.** Messages and comments written to or about the person, testimonials left on their profile, other people's posts they commented on: none of that is included, because the person didn't write it and the other person didn't agree to it (tested with a second person who wrote on every part of the first person's page, searching the file for each of their sentences). What the person wrote to others is included, with the other person's username only, never their email or id; if that person has since left the site the name is empty rather than the id (tested).
- **A file, not a page.** It is sent as an attachment with no-store caching, so a browser, a shared computer or anything in between doesn't keep a copy, and the name shown to the browser is cleaned so it can only be a file name (tested with a name made to look like a folder path). The password is cleared from the page once it has been used.
- **Bounded.** No section goes past 5000 rows; past that it stops and the file lists which sections were cut (tested), so one very old account can't make a response that is too large to build.
- **Not covered:** the file is JSON, which suits keeping and moving data but isn't a polished archive: pictures and recordings appear as their web addresses rather than the files themselves; likes and reactions other people left on the person's things, and who viewed their profile, are not included; and the file is not encrypted, so keeping it safe is up to the person (the page says so).

Covered by 11 backend tests (the password and limits, the headers, every section, what is left out, other people as usernames only, one person's own, an empty account, the section limit), 10 frontend tests (the screen and its messages, saving under the server's name, errors, one request at a time, the file-saving helper and the name cleaning) and 3 browser flows (a real download opened and read back) plus 2 contrast checks on all three browsers.

### 5.68 Emails about sign-ins from somewhere new: telling the owner when someone else gets in

The devices list and two-step sign-in help someone who is looking. Most people are not looking: a stranger who has the password can sign in, read, and sign out again, and the owner finds out only by chance. An email at the moment of a sign-in from a browser the person hasn't used before closes that gap.

- **Recognising a browser without tracking one.** A browser that signs in gets a long-lived random id in an HttpOnly cookie (128 bits, SameSite Lax, a year). The server stores only a hash of that id made together with the person's own id, so the same browser used for two accounts can't be linked from the database (tested), and no address, location or browser text is kept at all. The cookie alone gives no access to anything: with it nobody can sign in, and a made-up, damaged or someone else's value is just a browser that is new to this account (tested with junk, an oversized value and another account's id), and is replaced with a proper one. At most 20 browsers are remembered per person.
- **Only when it means something.** The email is sent when a correct password (or, with two-step sign-in on, the correct code) signs in from an unknown browser, never at the password step of a two-step sign-in, never on a wrong password (tested, and nothing is recorded), never on sign-up or a password change, and once per browser. It says which kind of device and when, what to do if it wasn't them (change the password, which signs every other device out, and turn on two-step sign-in) and how to turn the emails off; it holds no link, no password and no address (tested), so it can't be used as a phishing template either.
- **Quiet for the people it would only annoy.** Accounts that predate this have no browsers recorded, so their first sign-in is recorded without an email; otherwise every existing person would be warned about the browser they use every day. No more than five a hour go to one person however many new browsers appear (tested), a sign-in never waits for the mail or fails when the mail service is down (tested), and the owner can switch the emails off in the settings (the browsers are still recorded, so switching them on later doesn't warn about old ones; tested). The switch takes only true or false, needs a sign-in, and is the person's own.
- **Not covered:** the email reaches whoever controls the inbox, so someone who has both the password and the email account sees it too (two-step sign-in and a different email password are the answer); a person who clears their cookies is told about their own browser (correct, and harmless); the list in the settings does not show where a device is; and the warning is after the fact: it tells the owner a sign-in happened, it doesn't stop it (two-step sign-in does).

Covered by 19 backend tests (the cookie and what is stored, every case where it is and isn't sent, the limits, mail failure, two-step sign-in, junk cookies, the switch), 5 frontend tests (the switch on the settings panel: shown, turned off and on, a failed save, kept through other changes) and 3 browser flows (a real new browser causing a real email, read back from the mailbox; the switch persisting; the endpoint's limits) on all three browsers.

### 5.69 Changing the email address: the quiet way to take an account

Until now the email an account was signed up with could never be changed: a typo, or an inbox that was lost, meant a stranded account. Adding the change is easy; doing it without opening a new way to take accounts is the point, because the email is where password-reset links go. Whoever controls the email can, in effect, become the owner.

- **Three steps, two inboxes.** The signed-in person gives the new address and their password; a link goes to the new address (so a typo, or an address that isn't theirs, can't be adopted) and a notice to the old one. Nothing changes until the link in the new inbox is opened, within an hour. Only then does the account's email change, and it counts as confirmed because opening that link proved it. A stolen session alone can't start it: the password is asked for again (wrong ones are counted, 5 in 15 minutes then 429, and don't use up the 3 requests an hour), and with two-step sign-in on a code from the app or a recovery code is asked for too, with its own limit (tested, including a recovery code being used up).
- **The old inbox is told twice, and can undo it.** When it is requested, the old address gets a notice that names the new one only as a mask ("n**@e******.com"), so it can't be used to learn an address. When the change is made, the old address gets a link that puts everything back for seven days. It is the answer to the case this feature creates: someone with a stolen session and the password moves the email to their own, and the owner, who can no longer use "forgot password", would otherwise be locked out for good. The undo link restores the old address, ends every sign-in (so the intruder is out too), and cancels any password reset already requested to the new address (tested); the owner is told to choose a new password.
- **The links are single-purpose and single-use.** Each is 256 random bits, carried in the URL fragment (never sent to a server or in a Referer), stored only as a hash, and works once. The link to the new address can't be used to undo, and the undo link can't be used to make a change (tested); old, forged, malformed or already used links all get the same answer, wrong tries are counted per address (20 in 15 minutes), and a new request replaces the last, whose link then stops working.
- **Races and surprises are handled.** The change applies only if the account's email is still the one it was requested from; if someone else signed up with the new address in the meantime it is refused (409) and nothing changes, and the database's unique index is the final word; an undo for an address that someone else has since taken says so rather than producing two accounts with one address; a suspended account can't be changed (all tested). Account deletion removes any change in progress.
- **Not covered:** someone who has the password, a live session and (if used) the second step can still move the address, and the old inbox's owner has a week to notice, which depends on them reading the email; two-step sign-in is not touched by the undo link on purpose (so it can't be a way round it), which means someone who got in and turned on two-step sign-in with their own phone would also have to be dealt with by the site's team; and the notice emails reach whoever controls the old inbox.

Covered by 28 backend tests (asking, every refusal, the limits, two-step sign-in, confirming, every way a link can be wrong, races, undoing, what is never shown), 21 frontend tests (the form and its code step, the two pages and their failures, the wording) and 4 browser flows (a real change through a real email, an undo that signs the other device out, refusals, the links as a stranger would try them) plus 3 contrast checks on all three browsers.

### 5.70 Passkeys: a login that can't be typed into a fake page

Passwords are reused and guessed, and even a one-time code can be talked out of someone by a fake login page. A passkey can't: the key lives on the person's device, the browser will only offer it to the site it was made for, and the device asks for the person's fingerprint, face or PIN before using it. There is nothing to type, so there is nothing to phish.

- **The checking is done by a library, and tested for real.** The server uses `@simplewebauthn/server` (the browser uses `@simplewebauthn/browser`) rather than parsing keys and signatures itself, and the tests don't just mock it: a software authenticator makes real key pairs and signs real challenges, so the challenge, the address the page was at, the domain, the "person was checked" flag, the sign counter and the signature are all verified against it. Both packages audit clean.
- **A key that needs the person, and only the public half is kept.** Registration demands a key that checks the person (`userVerification: required`) and can be found again from the site alone (a discoverable key), with no attestation (the site doesn't ask what make of device it is). A device that won't check the person can neither make nor use a passkey (tested). The database holds the public key, a name, a counter and when it was last used; nothing in it can sign in as the person (tested, including that none of it appears in the profile or in `/me`).
- **Challenges are single-use and tied to what they are for.** Each is 5 minutes, claimed in one database step, so the same answer can't be replayed, a challenge for adding a key can't be used to sign in (or the reverse), another person's challenge can't be used to add one for you, and an old one is refused (all tested). Signing in names no one in advance: the device offers whichever key it holds, and the answer must also say it was made for the same account as the key (tested with another account's id).
- **A copied key is noticed.** The device's counter must go up on every use; one that stands still or goes backwards (what a cloned key does) is refused and doesn't move the stored counter (tested). The counter is moved on in the same step that checks it, so one answer can't be used twice at once.
- **Not a back door.** A passkey can outlive a password change, so adding one asks for the password again (and a code, with two-step sign-in) with their own limits, the owner is emailed when one is added or removed, no more than 10 are allowed, and the two places that exist to take an account back remove them all: resetting a forgotten password by email and undoing an email change (both tested, and the reset email says so). Changing the password on purpose, while signed in, keeps them. Deleting the account removes them.
- **Guessing and probing are limited.** Options for signing in are limited per address (60 in 15 minutes), failures per address (20 in 15 minutes, then 429), and every failure gets the same answer, so it can't be used to find out which keys exist. A suspended account is told so only after a real passkey answered, so that can't be used to find out which accounts are suspended. A sign-in from a browser not seen before emails the owner, like a password sign-in.
- **It counts as both factors, on purpose.** A passkey sign-in skips the password and the two-step code, because the device has already proved something the person has and checked who they are. That means an attacker who holds a registered device and can pass its check gets in without the code; the same is true of anyone who can unlock that phone. Two-step sign-in still protects the password path.
- **Only on the main address.** A passkey belongs to one domain. On any other address of the site (such as the original `*.vercel.app` one) the page says passkeys work on the main address only, and the server refuses the request with that reason rather than failing obscurely (tested).
- **Not covered:** the browser tests can only drive a device in Chromium (its virtual authenticator); the other two browsers run the checks that need no device, and the flow on real phones is for a person to try. Someone who gets into an already signed-in session and knows the password can still add a passkey (the owner is emailed, and resetting the password or undoing an email change removes it); and a passkey kept in a password manager is as safe as that account.

Covered by 46 backend tests (adding, every refusal, managing, signing in, every way an answer can be wrong, taking an account back, what is never shown), 39 frontend tests (the settings panel and its steps, the login button, the browser-library wrapper and its error wording, the API calls) and 7 browser flows with a virtual device (add, sign in with it alone, both factors, password and code needed, rename and remove, a device that won't check the person, the endpoints) plus 3 contrast checks.

### 5.71 Live updates: a connection that stays open, without becoming a way to listen in

Notifications and messages used to appear at the next poll, up to half a minute later. A page that is told the moment something happens feels like a different site, but it means the server holds a connection open for every page that is open, and sends things to people without being asked. Both are new things to get wrong.

- **Only hints go down it.** The stream carries the kind of thing that happened ("a notification", "a message") and, for a message, the username of the person the chat was with. It never carries a message, a notification's contents or anything else (tested by searching everything sent for the words of a private message). The page then asks the ordinary endpoints for the real thing, and those apply every check they always did (friends, blocks, private profiles), so the stream adds no new way to read anything.
- **Only the person's own.** A hint goes to the pages of the person it is for and no one else (tested with two people, including that someone else's notification sends nothing to the other person's stream). It needs a sign-in (401 without one, tested with a forged cookie too).
- **A sign-out ends it.** An open connection would otherwise go on receiving hints after the person had signed that device out. The sign-in each connection was opened with is checked again every minute, so signing a device out from the list, logging out, a password change, a suspension or deleting the account closes the stream (each tested), while the person's other devices keep theirs. The check treats a problem on our side (the database being down) as "still valid" so it can't look like a mass sign-out.
- **It can't be used to exhaust the server.** At most 5 connections per person (the newest are kept), at most 1000 in all (a polite 503 with Retry-After beyond that), at most 90 opens per person per 15 minutes (a page stuck reconnecting can't hammer the server, tested), each connection is closed after 5 minutes and the page reconnects, dead ones are removed when a write fails or the page goes away (tested), and one shared timer does the keep-alives instead of one per connection.
- **It fails back to the old behaviour.** The page's own polling continues at its old pace whenever the connection is not up, and slows to a safety net only while it is (tested for both, and in the browser with the connection blocked, where a message still arrives by polling). The headers tell proxies to pass each event on as it is written. The server keeps connections in its own memory, which suits one server: if the site were ever run on several, a hint made on one wouldn't reach pages connected to another, and those pages would be caught by the slower timer.
- **Not covered:** this is a hint to look again, not a guarantee of delivery (a hint sent while the connection is down is not queued; the reload when it comes back is what catches up); the voice lives and the group chat still poll on their own timers; and typing indicators and read receipts are not part of it.

Covered by 20 backend tests (the stream and its headers, every kind of hint and who gets it, edits and deletes, what is never sent, the limits, the keep-alive and the five-minute end, and each way a sign-in can stop counting) on a real HTTP server, 16 frontend tests (the connection manager and the refresh hook: one shared connection, retries, reconnects, fast and slow timers, no EventSource) and 5 browser flows on all three browsers (a message, an edit and a deletion appearing in an open chat, the list, the bell, the polling fallback with the stream blocked, and the stream's own access rules).

### 5.72 Typing indicators and read receipts: showing what you're doing only if both people want it

"Seen" and "is typing…" tell someone what you are doing right now. For a friend that is welcome; for someone who doesn't want to be pressured to answer, it is a small loss of privacy. "Seen" already existed and could not be turned off. Adding typing without fixing that would have made it worse, so both now follow one setting, and the question the design has to answer is who decides.

- **Both people decide.** The setting (`chatStatus`, on by default, in the privacy settings) is shared: if either person has it off, neither shows these to the other and neither sees them, which is the usual way chat apps handle it and means turning it off isn't a way to watch others unseen. Because the answer is the same in both cases, the other person can't tell which of the two switched it off (tested both ways).
- **The server decides, not the page.** The read time is withheld by the server unless both have it on, and is never sent to the person who received the message at all (tested). The typing ping always gets the same quiet answer (`204`) whether or not it went anywhere, so it can't be used to find out the other person's setting, and an unfriended or blocked person can't send it (tested). Turning it off also stops the "Seen" hint going to the sender's open chat (tested), so nothing leaks through the live connection either.
- **Nothing is stored.** A typing ping makes no record: it is a live hint to the other person's open pages and is gone. Pings faster than one a second are ignored, the page sends at most one every three seconds and only for a non-empty box, and the receiving page only shows it if it names the friend whose chat is open and removes it after six seconds or when their message arrives.
- **The unread counts don't depend on it.** Opening a chat still marks their messages read and clears the notification whatever the setting is (tested), so turning receipts off doesn't leave a permanent unread badge.
- **Not covered:** the setting is for all friends at once, not per friend; "Seen" shows that the chat was opened, not that a particular message was read; a friend who is blocked or removed stops seeing everything immediately, but one who was already looking at an old "Seen" keeps seeing what was shown.

Covered by 17 backend tests (the setting and what it accepts, when the read time is and isn't sent, the live hint, every case of typing: friends only, blocks, either person off, rate, nothing kept), 12 frontend tests (the typing line, its timing and the pings' pace, Seen, the setting's checkbox) and 4 browser flows on all three browsers (typing appearing and fading in a friend's open chat, Seen appearing without a reload, the setting switched off and remembered with neither shown, and the endpoint's rules).

### 5.73 Longer videos: more room without letting a big file hurt the server

Portfolio videos could be 30 seconds and 30 MB, which a phone's own recording of 30 seconds in good quality could already exceed. The limit is now one minute and 100 MB for video. A bigger limit is also a bigger thing to abuse, so the size is no longer one number for everything.

- **Per kind of file, and counted as it arrives.** Video may be up to 100 MB (the storage plan's own per-file limit); pictures, audio and everything else keep 30 MB (and the plan's 10 MB for pictures). The size is counted as the bytes arrive, so a file over its limit is cut off at once, the upload to storage is abandoned and the rest of the request is read and dropped: it never fills the server's memory (the free server has little) or the storage. Tested at each limit, for every purpose (profile pictures, wallpapers, tracks, comment pictures), exactly at the limit, and that the next upload works after one was cut off.
- **The length is still checked where it can be measured.** The storage provider reports the length of the file it has just stored; the API refuses and deletes anything over 60 seconds or of unknown length, so skipping the page's own pre-check changes nothing. Linked videos can't be measured, so they play as a one-minute window (YouTube links get start and end set, direct links a media fragment and a player guard).
- **One number on each side.** The length and size are constants on the server and the page (and the page's pre-check and its explanation use the same constants), so they can't drift apart; the tests that assumed 30 seconds were updated to the new numbers rather than loosened.
- **Not covered:** a high-quality full minute from a phone can be over 100 MB and is refused with advice to lower the quality or trim it; and the larger limit uses the free storage allowance faster, which is a cost question for the site's owner, not a code one. Uploads still go through the server (streamed, not held in memory); going straight from the browser to storage would be needed for much longer videos.

Covered by 6 new backend tests (the two limits, the message for video, every purpose, exactly at the limit, recovery after a cut-off file) and the video tests updated to a minute on the server and the page.

### 5.74 Faster tests, without making passwords any weaker

The backend tests took 40 to 70 minutes on a slow day because they talked to a shared cloud database, and most of the rest was password hashing (the site hashes at a deliberately slow cost of 12, and the tests sign up hundreds of people). Both are fixed for tests only.

- **A local database for test runs.** `npm run test:local` runs the whole backend suite against a MongoDB on the same computer (the package `mongodb-memory-server`, a development dependency only, which downloads the database program once, about 590 MB, into the user's cache folder), and `npm run e2e-api` starts the API for the browser tests the same way. CI already uses its own database container, so nothing changes there. The full suite went from 40 to 70 minutes to about 3.5 minutes.
- **Cheaper hashing in tests, never anywhere else.** `BCRYPT_COST` (4 to 12) lowers the hashing cost, and the tests set it to 4. It is ignored when `NODE_ENV` is `production` and anything outside the range falls back to 12, so a stray setting can't weaken real passwords (tested: production always gives cost 12 whatever is set; the hashes tests make really do start with the low cost and the real ones with 12; and the running tests are confirmed to use the low one).
- **Not covered:** the browser tests still need a lot of memory (three browsers and a database); on a computer with 6 GB of memory a full local run was too slow to be practical, so CI (three parallel jobs) is where the whole browser suite runs, and local runs are for single specs.

### 5.75 Languages: text that can't become markup, and what the translations never touch

Adding Spanish and Arabic (right to left) touches every screen, so the review looked at what it could open up.

- **Translated text is only ever text.** A sentence with a link or bold words in it (`tRich`) is split into pieces and put back together as React elements; a tag or `{name}` with nothing to fill it is shown as plain text, and nothing is ever inserted as HTML. So a mistake in a translation (or one made on purpose) can break a sentence but can't put a script or a link on the page. The language itself is checked against a fixed list (`detectLanguage`, `setLanguage`) so a stored value such as `<script>` falls back to English, and the catalog file that loads is chosen from that list, never built from the stored text (tested).
- **What people write is never translated or reordered by the site.** Posts, comments, messages and names are shown as they were written; the page only decides which way they read (`dir="auto"`), and usernames are isolated (`<bdi>`) so a right-to-left page can't swap the `@` and the name around into something that reads as another person.
- **The server's messages stay the server's.** The page translates an error only by looking up the server's exact English text (or its shape, for ones with a number), and shows anything it doesn't recognise as it came, so a new server message is never lost or garbled. The server still decides what happens; the language is never sent to it and changes no permission or limit.
- **Mirroring can't hide a control.** Layout uses start/end instead of left/right, and a test fails the build if a physical left/right form is written, so a button can't be pushed off screen in Arabic. Browser tests open every page in Spanish and Arabic and check nothing scrolls sideways and every colour is still readable.
- **Emails are in the person's language, and only the account decides it.** The language is stored on the account (a fixed list; anything else is refused, tested with objects and made-up codes) and set from the page at sign-up and when it differs; the text of every email is composed on the server (`utils/emailText.js`), links and names are put in as values and never built from the language, and a reset email's language comes from the stored account, not from the request (tested: asking for a reset with another language in the request changes nothing). The same holds for phone notifications, worded in the recipient's language and never the sender's (tested), and for AI-written text, whose language is read from the account and not from the request (tested: a request that names another language is ignored).
- **Not covered:** a name or number the server puts inside a sentence (a person's name, a device, a time) is shown as the server wrote it, and the field names inside the data-export file stay English on purpose (it is also read by programs).

### 5.76 Credits: putting two people's names on one piece of work

Letting people say who worked on a piece adds a claim about someone else, so the review asked how it could be abused.

- **Nobody can name someone without their yes.** A credit starts as a request that only the owner and the person asked can see; it shows on the piece and as a collaboration only after the person accepts, so a name can't be put on work, or work on a profile, by one person alone (tested: strangers, the owner and others can't accept for them; waiting credits are not visible to anyone else).
- **Only friends, and not through a block.** The server refuses anyone who isn't a friend, anyone blocked either way, and yourself; a suspended person is never shown; a block after the fact hides the credit from the person who blocked (tested).
- **Visibility follows the profile.** A collaboration is listed only if the owner's profile is visible to the viewer, so a private profile's pieces don't leak through someone else's page (tested, including a block).
- **Limits.** One credit per person per piece, ten per piece, forty requests an hour per person; roles are one line of plain text up to 40 characters, drawn as text, never markup (tested).
- **Tidy when things go.** Deleting a piece or either person's account removes the credits and the pending notices about them; the data download lists the credits you gave and the ones you accepted.
- **Not covered:** a credit can't be reported on its own (a role is plain text and the owner of the piece can remove it, the person credited can leave it); and credits don't yet count toward search.

### 5.77 Open to work: letting strangers write to someone who asked for it

Requests for work let people who aren't friends reach someone, so the review looked at how that could be used to pester or to find people out.

- **Only when the person said yes.** The server refuses a request unless the person has switched "open to work" on, and gives the same "That person isn't taking requests" for everyone it can't be sent to: nobody found, suspended, not open, a private profile the sender can't see, or a block either way (tested), so none of those can be told apart.
- **Limits on volume.** Five requests a day per sender, two waiting to the same person, thirty waiting in total with one person, and answers are limited per hour (tested).
- **No money, no promises.** Nothing is paid, held or agreed on the site, and the form says so; the budget is free text of up to 40 characters that only informs the other person.
- **Plain text only.** Titles, details, budgets, notes and replies are cleaned of hidden characters, length-checked, and drawn as text, never markup; the deadline must be a real day within two years (tested).
- **Blocks and suspensions hide requests.** A person's inbox leaves out people blocked in either direction and suspended accounts (tested); answering or withdrawing is limited to the right person and the right state, with a clear message otherwise (tested).
- **Tidy.** Waiting notifications are cleared when a request is answered or withdrawn; a person's requests go with their account; the data download lists what they sent, their answers and their open-to-work settings.
- **Not covered:** a request can't be reported on its own yet (a person can block the sender, or switch open to work off, which stops new ones), and the budget isn't checked against any real figure.

### 5.78 Shareable profiles: previews and search engines

A link preview is a public page made from someone's profile, so the review asked what it could give away and what it could be used for.

- **Only what a visitor could already see.** The preview has a public profile's name, bio, tags, offers and picture, nothing else. A private profile, a suspended one, a missing one and a name that couldn't be a username all get the identical bare page and a `200`, so the preview can't be used to find out which accounts exist or are private (tested).
- **Nothing can break out of the page.** Every value is escaped for text and for attributes, the picture must be an `https` address, the description is cut to 200 whole characters, and the page's own policy (`default-src 'none'`) lets it load nothing at all (tested with markup in the bio and in the picture address). The policy also leaves out `upgrade-insecure-requests`, which in Safari had stopped the redirect to the profile on a plain-http developer machine; the browser tests caught it.
- **Search engines only by choice.** Profiles are kept out of search engines (`noindex` in the page and header, and in the profile page's own tag) unless the owner switches listing on, and the sitemap names only those, never a private or suspended one (tested). Switching it off takes the profile out of the sitemap at once; a search engine's own copy follows its own schedule.
- **Cost kept in check.** 600 previews an hour per address and a sitemap capped at 5000 profiles, with short caching, so the page can't be used to load the database.
- **A public list, deliberately.** A public profile's blog list can now be read without signing in (it already could for portfolio pieces); a private profile's list still asks for a friend (tested). Nothing was loosened for posts, comments or messages.
- **Not covered:** a profile's picture is shown by its own address, so the preview can only be as safe as the picture host; the preview isn't translated beyond the one sentence (the bio is the person's own words).

### 5.79 The weekly challenge: a public gallery of people's work

The gallery can be read without signing in, so the review looked at who can be put in it and what it costs.

- **Only your own pieces, only by choice.** An entry names a piece the signed-in person owns (another person's piece, or one that doesn't exist, is refused with the same answer), one entry per person per week, and a repeat is refused rather than replacing it (tested).
- **Public profiles only.** The gallery is open to everyone, so a private profile can't enter, and if an owner goes private afterwards their entries drop out of the gallery at once. Suspended people and people the viewer has blocked, or been blocked by, are left out for that viewer, and so is an entry whose piece has been deleted (tested).
- **Nothing new to leak.** The gallery returns what a profile already shows publicly (the piece, its caption and reactions, and the owner's name, username and picture), never an email or anything private (tested). Reactions use the existing, rate-limited reaction route.
- **Inputs checked.** The week in the address must be a real ISO week of a year from 2020 to 2100 and not in the future, `sort`, `page` and `limit` are clamped, and the language must be one of the three or it is English (tested). Entering and withdrawing are limited to 30 an hour per person, and at most 500 entries of a week are read to build a page, so a busy week can't be used to load the database.
- **Tidy.** Deleting a piece or an account removes the entries, and the data download lists them (tested).
- **Not covered:** an entry can't be reported on its own (the piece itself can be reported through its owner's profile), and "most loved" counts every kind of reaction equally.

### 5.80 @mentions: naming people in what you write

A mention puts someone's name in front of that person, so the review asked how it could be used to reach people who don't want to be reached or to show them what they shouldn't see.

- **Only what they could already open.** Each place that sends a notice says who may see the writing (a profile's visibility rules, friends for bulletins, an event's rules, group membership) and a named person who fails that test is not told, so naming someone in a private profile's post, a friends-only bulletin or a group they aren't in tells them nothing (tested for posts on a private profile, bulletins, groups and comments).
- **Blocks hold.** Someone who blocked the writer, or whom the writer blocked, is never notified and never appears in the list while typing; suspended people are left out of both (tested).
- **Not a spam tool.** At most 5 names count in one piece of writing, 60 notified people an hour per writer, and an edit only tells the names it adds (so editing the same comment again and again tells nobody twice); naming yourself, a name that doesn't exist, or something inside an email address does nothing (tested).
- **The destination can't be turned against the reader.** The notice carries an address inside the site, written by the server from ids it holds, never from the text, and it is checked again before it is followed on the page and before a phone notification is sent: anything not starting with one `/`, or containing a backslash, is ignored (tested, including `//evil.example`, `javascript:` and full web addresses).
- **Text, not markup.** A mention is drawn as a link built from the matched username only (letters, numbers and underscores, 3–30), the rest of the text stays text, so a post can't use it to inject a link or markup (tested).
- **The list while typing** follows the same rules as search: no private strangers, blocked or suspended people, nothing about the viewer's own account, a rate limit of 900 requests an hour, and nothing for a query that isn't a plausible username (tested).
- **A failure never costs the writer.** Delivering notices happens after the writing is saved and swallows its own errors, so a mention can't make a post fail (tested).
- **Not covered:** a notification can't be switched off for mentions alone (it follows the "comments" phone switch and the bell), mentions in a private message to someone else are only links, and renaming a user does not update old mentions of the previous name.

### 5.81 Following: seeing someone's posts without their yes

Following lets one person see another's posts without a friendship, so the review looked at what that could expose and how it could be used to pester.

- **Public only, and checked at read time.** Only a public profile can be followed (a private one gets the same "That profile can't be followed" as a missing, suspended or blocking one, so none can be told apart), and the feed keeps only followed authors who are public, not suspended and not blocked when it is read. A profile that goes private, or a block, takes its posts out of every follower's feed at once (tested), and the follow comes back to life if it is made public again.
- **Nothing private is shown.** The lists of followers and followed are the owner's own only; other people see counts, which are shown only where the whole profile is shown (tested).
- **Not a way to pester.** Following needs no yes but cannot be used to ping someone repeatedly: a person is notified at most once a week by the same follower (tested with unfollow and follow again), 60 follows an hour, 1000 followed in all.
- **Blocks hold.** Blocking ends the follow in both directions and prevents a new one (tested). Deleting an account removes its follows, and the data download lists whom you follow.
- **Not covered:** followers can't be removed one by one (blocking is the way), and there is no setting to hide the follower count.

### 5.82 Hashtags and Explore: a public view of public things

Explore shows posts to people who aren't signed in, so the review asked whether it could show anything a profile would not.

- **Same rules as a profile.** Only posts and pieces of people with public profiles who aren't suspended, and not blocked either way with the viewer, appear (tested with private, suspended and blocked authors, for posts and pieces). A person who goes private disappears from Explore and from trending at once, because both are read live.
- **Tags come from the words, never from the request.** The server works them out from the content (and re-works them on every edit), so a tag can't be attached to something that doesn't contain it; the tag asked for is checked as a plain word before it is used (tested with markup and spaces), and an invalid one is a 400.
- **Trending can't be pushed around by one person.** A tag counts once per person, only public unsuspended people are counted, only the last week and the most recent 3000 items are looked at, and the answer is cached for five minutes.
- **Cost.** Both routes are rate-limited (300 an hour per person or address), a page scans at most 180 candidates, and the tag lookup uses an index.
- **Search engines.** The page asks to be left out (`noindex`), so showing public posts here doesn't make people searchable who didn't opt in.
- **Not covered:** a hashtag can't be reported on its own (the post can), and a tag can't be hidden from Explore without making the profile private.

### 5.83 Saving and sharing: what a copy of someone's post could expose

Sharing someone's post puts it in front of the sharer's audience, and a saved list holds posts after their owner may have changed their mind, so the review asked what each could keep showing.

- **A share holds a reference, never a copy.** The original is read and checked against the viewer every time a share is drawn: if its author is private, suspended, blocked either way with the viewer, or the post was deleted, the share shows only "not available" and none of its words (tested for each case, including that the original's text is absent from the response).
- **Only public posts can be shared.** A post of a private profile, a suspended or blocking person, or one that can't be found all get the same `404`; your own post is refused; sharing is once per person per post, 30 an hour; the words are checked like a post's and notify mentions only to people who could see them.
- **No chains.** Sharing a share shares the original, so a post can't be passed along in a way that hides where it came from.
- **Saved lists are private and re-checked.** Only the owner can read a list; nothing is saved that the person couldn't open, and a listed item disappears while its owner is private, suspended or blocked and returns if that ends (tested). A list is capped at 2000 and saving is rate-limited.
- **Tidy.** Saves go with the post, the piece or either account, a deleted share removes its notice, and the data download lists saved items and which posts are shares.
- **Not covered:** a share can't be reported on its own (the sharer's words and the original can be reported as the posts they are), and the original's author can't stop their public post being shared (they can go private, or block the sharer).

### 5.84 Picture descriptions and replies: two more places to write

**Threats.** A description is text that ends up in an HTML attribute and in other people's screen readers; a reply names a parent comment, so a crafted id could tie a comment to a thread it doesn't belong in, or notify someone who has blocked the writer.

**What stops it.**
- **A description is plain text.** One line, cleaned of hidden characters, up to 300 characters, only on a post that has a picture; React writes it as an attribute value, never as markup, and `PATCH` lets only the author change it (`404` otherwise).
- **A reply's parent is checked, not trusted.** The parent must be a comment on the same post, piece or entry (otherwise `400`) and is flattened to one level on the server, so nobody can build deep or cross-thread chains. The notice to the person answered is skipped when they have blocked the writer or the writer answers themselves, and a comment taken down takes its replies and their notices with it.
- **Not covered:** a description is the author's word and nothing checks that it matches the picture (a picture made with AI starts with its prompt, which the author may edit).

### 5.85 Pinned post and featured piece: choosing what comes first

**Threats.** Pinning someone else's post to your own profile (to show it where it doesn't belong or to learn whether it exists), or a pointer that outlives the thing it points to.

**What stops it.**
- **Only your own things.** Pinning or featuring takes an id and answers the same `404` for a post or piece that doesn't exist and one that is someone else's; the pointer is stored on the user, so there is exactly one of each and no id from the request is ever written to another person's record.
- **Shown only where the profile is.** The pinned post is added to `GET /profiles/:username` only where the whole profile is shown (not for a private profile to a stranger, which is refused before it), and it is read again from the post each time, so an edit or a deletion shows at once; deleting the post or piece clears the pointer.
- Covered by 7 backend tests, 13 frontend tests and 4 browser flows on all three browsers.

### 5.86 Polls: counting votes without trusting the page

**Threats.** Voting twice, voting after a poll closes, voting in a poll you can't see, flooding a poll, and an oversized or malformed poll.

**What stops it.**
- **One final vote each.** A unique index on (post, person) decides it, so two taps at once can't both count and the second gets `409`; there is no way to change a vote.
- **The server decides when it closes** (`endsAt` is set by the server from 1, 3 or 7 days; a client can't send a date), and votes after that are `400`.
- **The same visibility rule as the post:** a post the person can't see (private profile, a block either way) answers `404 Poll not found`, like a poll that doesn't exist. 120 votes an hour per person.
- **Checked on the way in:** two to four different options, one line each, up to 60 characters, cleaned of hidden characters; options are stored as text and shown as text. Votes are removed with the post and with either account. Covered by 15 backend tests, 10 frontend tests and 3 browser flows on all three browsers.
- **Not covered:** a person with several accounts can vote several times (the same as for reactions); results are visible to everyone before voting ends.

### 5.87 Muting: hiding without telling, and not leaking the list

**Threats.** Someone learning they were muted (or what a person muted), a muted word list used to attack the server (very long patterns, regex injection), and muted people still reaching the person by push.

**What stops it.**
- **Private to the person.** The lists are read and written only through their own session (`/api/mutes` needs sign-in and only ever uses the signed-in person's id); nothing about a mute appears on the other person's side, in any profile or in any notice, and `iMute` is added only to the response of the person who muted. Muted words are never in a profile or in `/auth/me`.
- **Words can't become patterns.** Each word is cleaned to one line of up to 40 characters, at most 30 are kept, and every one is escaped before it is joined into the single test the feed uses, so a word such as `(a+)+$` is matched as typed and can't slow the server down.
- **Muted people really are quiet.** Their posts are excluded in the feed query and in Explore, their notices are left out of the list, and push delivery skips anyone who muted the person the note is about.
- Covered by 22 backend tests (including the push check and whole-word matching in other alphabets), 10 frontend tests and 4 browser flows on all three browsers.

### 5.88 Process timelines: more writing and pictures on a portfolio piece

**Threats.** Adding steps to someone else's piece, using someone else's uploaded picture (or any address) as a step's picture, steps on a piece the visitor shouldn't see, and a long list used to fill storage.

**What stops it.**
- **Only the owner writes.** Adding, changing, ordering and deleting all answer the same `404` for anyone else's piece or step as for a missing one, so a stranger can't tell which exist.
- **Pictures are never typed addresses.** A step's picture must be one the person uploaded themselves (checked against the stored-files ledger, the same check as a comment's picture), can be taken off but not swapped, and is deleted with the step, the piece or the account unless something else still shows it.
- **Seen only where the piece is.** Reading the steps goes through the same visibility check as the piece (a private profile or a block answers `404`), and 12 steps of at most 500 characters, 60 an hour, bound what one piece can hold.
- Covered by 16 backend tests, 15 frontend tests and 3 browser flows on all three browsers. **Not covered:** a real upload isn't exercised in the browser tests (the test servers have no storage account); the upload path is covered by the backend tests with a fake storage service.

### 5.89 Open calls: a public board that tells people

**Threats.** Using a call to notify or harass many people, applying with someone else's work, seeing a call (or who answered it) one may not, and spam on the board.

**What stops it.**
- **Telling people is capped and targeted.** A new call notifies at most 20 people, only those who said they are open to work and whose own offers or tags match what it looks for, never someone blocked either way, a private stranger, or anyone who muted the owner; an owner can have 5 open calls and post 10 a day.
- **Applications carry only your own work.** The piece must be one of the applicant's own (`400` otherwise), there is one answer per person (a unique index, so two taps can't make two), at most 100 per call, 20 a day per person; the owner answers each once, and the applicant sees only the short note the owner chose to write.
- **Same visibility as the owner's profile.** A call, its answers and its suggestions answer the same `404` as a missing one where the owner can't be seen; the list of who answered and the suggestions are the owner's alone, and people blocked either way are left out of both.
- **Text is text.** Titles, details, terms, notes and replies are cleaned and length-checked, roles are tags with the profile tag rules, and everything is shown as text.
- Covered by 31 backend tests (including the notification caps and visibility cases), 29 frontend tests and 4 browser flows on all three browsers. **Not covered:** nothing stops a person with several accounts from answering a call several times, and matching trusts what people say they offer.

### 5.90 Reporting more kinds of things

**Threats.** Content that could be harmful but couldn't be reported (a portfolio piece, a step, an open call, an answer to a call, a poll, a share), and a removal by a moderator that left parts behind.

**What stops it.**
- **Everything a person can see or be sent can be reported.** Posts (including polls and shares), portfolio pieces, steps, calls, answers and room messages each have a Report button for someone who isn't their owner, a reason box (at most 500 characters), and a reply that says a moderator will look. The existing limits hold: the thing must exist, reporting it twice while it waits is one report, 30 an hour.
- **A moderator sees what the reporter saw.** A post's preview carries its poll options and the words of the post it shares; the others carry their words, picture and a link.
- **Removal is the owner's deletion.** One shared cleanup (`services/removal.js`) removes a post, piece, call, step or answer with its comments and their pictures, reactions, saves, votes, pins, steps and notices, for the owner and for a moderator alike (tested: a removed post leaves no vote, save or pin). The author is told, and the reporters thanked, without details.
- Covered by 7 backend tests, 8 frontend tests and 3 browser flows on all three browsers. **Not covered:** a reporter isn't told what was decided beyond a thank-you, and there is no appeal for the person whose content was removed.

### 5.91 Project rooms: a private space made by a choice

**Threats.** Reading or writing in a room one isn't in, using the chat to reach people who have blocked you, a picture that isn't the person's own, flooding the chat or the bell, and a room that holds data after people leave.

**What stops it.**
- **Members only, with one answer.** Every route (read, write, checklist, leave) answers the same 404 for someone outside the room as for a missing one, so a stranger can't tell which rooms exist; a room is created only by the server, when the call's owner chooses someone, never from a request that names members (tested for applicants who weren't chosen and for strangers).
- **Blocks hold.** Messages from someone blocked either way are left out of the chat, and nobody is notified across a block.
- **Pictures are the writer's own,** checked against the stored-files ledger exactly as for a comment, and deleted with the message, the room or the account.
- **Cost.** 60 messages per 10 minutes, 40 checklist lines, 8 people a room, one notice per room while unread (counting up, so a busy chat can't flood anyone's bell), and live hints carrying only the room's id.
- **Tidy and reportable.** The owner can archive (read-only), remove people or delete everything; a member can leave; deleting an account removes the rooms it owns and its words in the others, and the data download lists rooms and one's own messages. A member can report a message; a stranger can't (they get the answer for a missing one).
- Covered by 20 backend tests, 18 frontend tests and 4 browser flows on all three browsers. **Not covered:** a moderator who handles a report can read the reported message (that is the point of a report), and what a member wrote stays when they leave, as a record of the project.

### 5.92 Following topics and the weekly summary email

**Threats.** A person's followed topics or summary setting being exposed, an email that leaks what someone wrote, mail sent to people who didn't ask or sent twice, a forged unsubscribe link or one that unsubscribes someone else, and a public run endpoint being abused.

**What stops it.**
- **Private to the person.** Followed topics and the summary setting are read and written only through the person's own session and appear in no profile; a followed tag is checked as a plain word before it is stored (30 at most).
- **The email says counts and titles, never words** (tested: a comment's text, a call's details and a post's text are absent), only to confirmed addresses, only for people who turned it on, never to suspended accounts, in the person's own language, and nothing is sent when there is nothing to say.
- **Once a week, even if the schedule fires twice.** Each person is claimed with one database update before anything is built, so overlapping runs can't send two (tested), a run does at most 25, and the run endpoint ignores calls less than five minutes apart. Anyone can call it, because asking cannot make anyone due earlier.
- **Unsubscribing is signed.** The link carries a token the site signed for that person and purpose; a forged, expired, wrong-purpose or missing token all get the same 400 and change nothing (tested, including a sign-in token), the token sits in the address fragment so it isn't sent to any server or leaked in a Referer, and tries are limited per address.
- Covered by 19 backend tests, 11 frontend tests and 4 browser flows on all three browsers. **Not covered:** the email is plain text through the mail provider, so its delivery and spam handling are the provider's; the schedule depends on the keep-warm check running (it re-enables itself with any commit).


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

- **No on-demand "sign out everywhere".** Sessions are 7-day JWTs. They are now
  revoked automatically by a password change or account deletion (§5.15), but a
  user can't revoke them on demand without changing their password.
- **Rate limits are per account/IP.** They are durable and shared now (MongoDB),
  but a script spreading attempts across many IPs and many accounts is only
  slowed, not stopped (registration: 10 per IP per hour). The limiter also fails
  open if its own database call errors.
- **CSRF relies on `SameSite=Lax` plus an `Origin` check, not tokens.** Browsers
  always send `Origin` on cross-site state-changing requests, so this is effective,
  but a request with no `Origin` header is allowed (non-browser clients only).
- **Per-IP limits trust `x-vercel-forwarded-for`.** Behind the frontend proxy it's the
  only way to see the real client, and Vercel overwrites it — but someone calling the API
  directly can send it themselves, so per-IP limits are best-effort against a deliberate
  attacker. The strong limits (per email for login, per user elsewhere) don't use it.
- **The frontend now depends on Vercel's proxy for every API call.** It adds a hop of
  latency and, if Vercel's rewrite layer has trouble, the whole app does even when the API
  is up. Request size and duration were checked (10 MB upload, ~5 s AI call), but very
  long-running requests would need re-checking.
- **iOS is checked by hand, not automatically.** The first-party cookie design follows
  Safari's documented policy, is exercised in CI by WebKit and iPhone-sized runs, and was
  confirmed on physical iPhones by the owner; there is no automated real-device test.
- **The free Cloudflare AI allowance is shared by all users**, so heavy use
  degrades image/text generation to "temporarily unavailable" until it resets.
- **Backend deploy gating lives in a dashboard setting.** Both repos run tests and
  `npm audit --audit-level=high` in GitHub Actions on every push and PR, and
  Dependabot opens weekly update PRs. The frontend deploys only from a green CI run
  (Vercel's git deploys are disabled — verified). The backend has
  `autoDeployTrigger: checksPass` in `render.yaml`, which only takes effect if
  the Render service's Auto-Deploy is set to "After CI Checks Pass" in the dashboard. The
  owner has confirmed it is set that way; because it isn't in code, it can be changed without a trace in the repo.
- **The frontend deploy depends on a CI token.** Production deploys use a Vercel API
  token stored as a GitHub Actions secret; if it expires or is revoked, frontend
  deploys pause until it's replaced.
- **The keep-warm ping depends on GitHub's scheduler.** Scheduled workflows can run a
  few minutes late and GitHub pauses them after 60 days without repo activity
  (any commit resumes them); the free-tier cold start (~50 s) returns if it stops.
- **File uploads aren't content-sniffed.** `multer`'s `fileFilter` trusts the
  client-supplied MIME type; Cloudinary re-derives the real type on ingest, which
  limits the practical impact.
- **File storage is a single provider.** Uploads and generated images all depend on one
  Cloudinary account. When it refused uploads (§5.24) the app degraded cleanly to a clear
  "temporarily unavailable" message, but nothing worked until the account owner resolved it
  with Cloudinary. There is no second storage provider or upload queue.
- **Email confirmation is a reminder, not a gate, unless switched on.** Accounts created before this feature, and new ones, start unconfirmed and can still use almost everything; only going live and public requests are held back, and only when `REQUIRE_VERIFIED_EMAIL=true`. Whether a confirmation email arrives depends on the email provider (see the password-reset risk).
- **Live notifications can't be switched off.** Every accepted friend is told each time you go live (at most 5 times an hour), and there is no setting to mute a friend's lives short of unfriending them.
- **Live audio can't be moderated.** The server never hears the audio (browser-to-browser, or relayed by
  the media server), so it cannot record or filter it; moderation is limited to blocking, deleting
  comments, and the host ending the live (there is no "report this live" yet).
- **Big lives depend on a LiveKit project and a small database.** Without LiveKit configured, lives fall
  back to browser-to-browser audio, capped at 8 listeners, where some networks need a TURN relay
  (`LIVE_ICE_SERVERS`). LiveKit's free plan has its own ceiling on concurrent participants across the
  whole project, so several large lives at once can exhaust it. A full room of 100 also asks a lot of the
  free database tier (roughly 70 operations a second from check-ins and chat polling, against a free-tier
  ceiling around 100), so the first thing to feel it would be slower chat. Live audio has been tested
  between real Chrome windows; phones are tested by the owner, not automatically.
- **Password reset depends on one email provider.** Reset by email is configured through Resend and the
  owner confirmed the whole flow on the live site (email received, link used, new password worked). It
  depends on that provider and sender staying valid: if the key is revoked or the sender stops being
  accepted, the site can't send links, and the owner would have to restore it. (If the sender is Resend's
  shared test address, only the owner's own address receives mail; a verified domain is needed for other
  users.) Delivery failures are logged for the operator but invisible to the person asking.
- **Group chat is readable by anyone who joins the group**, because groups are open by design.
- **Messages are private from other users, not from the operator.** They are stored as plain text in
  MongoDB (encrypted at rest by the database host, not end-to-end), and there is no way to report a
  message or block from inside a conversation (blocking works from the profile). Messages arrive by
  a live connection (hints only, 5.71) with polling as the fallback, and by push notification when the site is closed.
- **Older stored files aren't cleaned up automatically.** Files stored before the
  ledger existed (two AI images) have no ledger entry and are left alone by design.
- **Test coverage has known gaps.** Real Cloudinary uploads (including the video
  length check), real AI generation and Openverse search aren't in the automated browser
  tests because CI has no keys for them (they're covered by mocked backend tests plus
  scripted and manual runs against production). The audio player context, theme editor and
  image positioner have no unit tests, and there is no automated real-device
  test (iPhones were checked by hand; WebKit in CI is the automated stand-in).
- **Linked videos are other people's content.** A YouTube or direct-file link is
  embedded, not copied: the owner of that video can change or remove it after it's added,
  and the 30-second limit for links is a playback window, not a measured length.
  (Uploaded videos are measured and enforced server-side.)
- **Reactions are open to anyone who can see a profile.** Signed-in visitors can like or
  dislike any visible portfolio piece (300 per hour each); there's no way for an owner
  to hide the counts or disable reactions, and dislikes are visible to everyone.
- **A username change breaks old links.** Old `/u/oldname` addresses stop working
  (there's no redirect) and the old name is only reserved for 30 days.
- **Two narrow race conditions**, both low-severity and neither crossing a
  privacy/access boundary: (1) `Friendship`'s unique index is directional
  (`requester`+`addressee`) while the app-level duplicate check is bidirectional —
  two users requesting each other in the same instant could theoretically create two
  friendship documents. (2) `Track`'s per-user 5-track cap is a count-then-create
  check with no transaction — concurrent requests could exceed it by one.
