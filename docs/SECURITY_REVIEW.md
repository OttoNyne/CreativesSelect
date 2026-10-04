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
  polling every few seconds while a thread is open, not by push.
- **Older stored files aren't cleaned up automatically.** Files stored before the
  ledger existed (two AI images) have no ledger entry and are left alone by design.
- **Test coverage has known gaps.** Real Cloudinary uploads (including the 30-second
  video check), real AI generation and Openverse search aren't in the automated browser
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
