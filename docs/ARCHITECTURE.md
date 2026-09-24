# Architecture — CreativesSelect

This document covers the capstone rubric's Architecture & Planning items (value
statement, system diagram, data model, API design, component tree) and the
Code Understanding item (technical decisions with reasoning), in one place
since they all describe the same system.

---

## 1. Value Statement

**CreativesSelect** is a social platform for creatives — a place to build a
customizable profile (theme colors, wallpaper, portfolio), connect with
friends, join groups for collabs, share posts with optional AI-assisted
writing and images, and leave testimonials on each other's profiles.
Alongside that, it includes a **Help wanted** board (the tasks resource) where creatives post requests for help, browse each other's, and offer to help, behind the same login.

**Target users**: hobbyist and professional creatives (artists, musicians,
writers) who want a space that lets them express a personal aesthetic —
something generic social networks intentionally suppress in favor of a
uniform feed — while still getting the standard social features (friends,
groups, posts, comments).

**Problem solved**: general-purpose social platforms don't let users
customize how their own profile looks, and don't combine creative networking
with a lightweight personal productivity tool in one account. CreativesSelect
does both: one login, one identity, expressive profile + community + a place
to track your own to-dos.

**Value created**: a single account that covers creative self-expression
(profile theme/wallpaper/portfolio), community (friends, groups, comments,
notifications), AI-assisted content creation, and personal organization
(Help wanted) — without needing four different apps.

---

## 2. System Diagram

```mermaid
flowchart LR
    subgraph Browser["Browser (React + Vite, :5173)"]
        UI["Pages & Components"]
        APIClient["api/*.ts — fetch wrapper\ncredentials: 'include'"]
    end

    subgraph Server["Express API — first-server (:5000)"]
        MW["helmet → cors → morgan\n→ requestTimer → express.json\n→ cookieParser"]
        Routes["11 route modules\n/api/auth, /api/profiles, /api/posts,\n/api/friends, /api/groups, /api/media,\n/api/notifications, /api/ai,\n/api/tracks, /api/tasks, /api (comments+moderation)"]
        Auth["requireAuth / attachUserIfPresent\n(reads + verifies JWT from the\nhttpOnly 'token' cookie)"]
        ErrH["errorHandler\n(CastError→400, ValidationError→400,\nMulterError→413, everything else→generic 500)"]
    end

    DB[("MongoDB Atlas\n13 Mongoose models")]
    Cloudinary[("Cloudinary\navatars, wallpapers,\nportfolio, tracks,\nAI-generated images")]
    Openverse["Openverse API\n(external, keyless image search)"]
    CFAI["Cloudflare Workers AI\n(FLUX.1 schnell image generation)"]

    UI --> APIClient
    APIClient -- "fetch, cookie sent automatically" --> MW
    MW --> Auth --> Routes
    Routes --> DB
    Routes --> Cloudinary
    Routes --> Openverse
    Routes --> CFAI
    Routes -.-> ErrH
    Routes -- "JSON response" --> APIClient
    APIClient --> UI
```

**Tracing one request** — e.g. loading the Feed page:

1. `FeedPage` mounts, calls `postsApi.feed()`.
2. That calls `api.get("/posts/feed")` in `api/client.ts`, which does
   `fetch("http://localhost:5000/api/posts/feed", { credentials: "include" })`
   — the browser automatically attaches the `token` cookie.
3. Express's middleware chain runs in order: `helmet` (security headers) →
   `cors` (checks the request's Origin against `CLIENT_URL`) → `morgan` +
   `requestTimer` (logging) → `express.json()` (body parsing) →
   `cookieParser()` (splits the cookie header).
4. `postsRouter` is mounted with `postsRouter.use(requireAuth)` — this reads
   `req.cookies.token`, verifies it with `jsonwebtoken` against `JWT_SECRET`,
   and sets `req.user = { id, username }`, or responds `401` if missing/invalid.
5. The route handler queries `Friendship` for the caller's accepted friends,
   then `Post.find({ author: { $in: [self, ...friends] } })`, populates each
   post's `author`, and serializes each through `toPublicUser` (viewer-aware —
   see §7) before responding as JSON.
6. The response flows back through `api/client.ts`, which throws an
   `ApiError` on a non-2xx status; `FeedPage` sets its `status` state to
   `"ready"`, `"error"`, or renders the posts.

---

## 3. Data Model

MongoDB via Mongoose. 13 collections. `ObjectId` refs are named `ref` below;
`unique` compound indexes are noted where they exist.

| Model | Fields | Relationships |
|---|---|---|
| **User** | `email` (unique, lowercased), `username` (unique, lowercased), `passwordHash`, `displayName`, `bio`, `avatarUrl`, `wallpaperUrl`, `wallpaperType` (image/video), `wallpaperPosition`, `isPrivate`, `theme` {bgColor, textColor, accentColor, fontFamily, layoutStyle}, timestamps | Referenced by nearly every other model as author/owner/participant |
| **Task** | `owner` → User, `title`, `description`, `isPublic` (default false), `done` (= resolved), `priority` (low/medium/high), `dueDate`, timestamps | Belongs to one User; shown in the UI as a "Help wanted" request — private by default, listed on the public board when `isPublic` |
| **Post** | `author` → User, `content`, `imageUrl`, `isAiText`, `isAiImage`, timestamps | Has many Comments |
| **Comment** | `post` → Post, `author` → User, `content`, timestamps | Belongs to one Post |
| **ProfileComment** | `profileOwner` → User, `author` → User, `content`, timestamps | The profile "guestbook"; distinct from post Comments |
| **Friendship** | `requester` → User, `addressee` → User, `status` (pending/accepted/declined), timestamps | Unique on (requester, addressee); a "friend" = an accepted row in either direction |
| **TopFriend** | `owner` → User, `target` → User, `position`, unique on (owner, target) | Self-curated top-8 list; no consent required from the target |
| **Group** | `name`, `description`, `bannerUrl`, `createdBy` → User, timestamps | Has many GroupMemberships |
| **GroupMembership** | `group` → Group, `user` → User, `role` (member/admin), `joinedAt`, unique on (group, user) | Join table between User and Group |
| **MediaItem** | `owner` → User, `url`, `type` (image/audio/video/embed), `caption`, `isAiImage`, timestamps | A user's portfolio piece |
| **Track** | `owner` → User, `title`, `sourceType` (upload/youtube), `url`, `position`, timestamps | Max 5 per user, enforced in the route, not the schema |
| **Notification** | `recipient` → User, `type` (friend_request/friend_accept/comment/profile_comment/group_invite/help_offer), `payload` (Mixed — carries related ids like `actorId`/`friendshipId`), `isRead`, timestamps | Fan-out target for actions elsewhere in the app |
| **Block** | `blocker` → User, `blocked` → User, unique on (blocker, blocked), timestamps | Gates visibility everywhere (see §7) |
| **Report** | `reporter` → User, `targetType` (user/post/comment/profileComment), `targetId`, `reason`, `status` (open/reviewed/dismissed), timestamps | Moderation queue; no reviewer UI built yet |

**User-ownership scoping**: every resource that belongs to one user carries an
explicit `owner`/`author` ObjectId, and every route that reads or writes it
filters by `{ ..., owner: req.user.id }` (or the equivalent) — never by the
resource's own `_id` alone. This is what stops one user from touching
another's data (see the Help wanted / tasks mass-assignment fix in the security review).

---

## 4. API Reference

All routes are mounted under `/api`. Auth column: **public** (no auth),
**optional** (`attachUserIfPresent` — works logged out, but personalizes/gates
if logged in), **auth** (`requireAuth` — `401` without a valid session cookie).

### Auth — `/api/auth`
| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/register` | public | `{email, username, password, displayName}` → `201 {user}` |
| POST | `/login` | public | `{email, password}` → `200 {user}`, sets `token` cookie |
| POST | `/logout` | public | — → `204`, clears cookie |
| GET | `/me` | auth | → `200 {user}` |

### Profiles — `/api/profiles`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/?search=` | auth | Search by username/displayName (regex, case-insensitive) |
| PATCH | `/me` | auth | Update own displayName/bio/avatar/wallpaper/isPrivate/theme |
| PUT | `/me/top-friends` | auth | `{usernames: string[]}`, max 8 |
| DELETE | `/comments/:commentId` | auth | Author or profile owner only |
| GET | `/:username` | optional | `403` if private and viewer isn't owner/friend/unblocked |
| GET | `/:username/top-friends` | optional | Same visibility gate |
| GET | `/:username/comments` | optional | Same visibility gate |
| POST | `/:username/comments` | auth | Same visibility gate; fires a `profile_comment` notification |
| GET | `/:username/tracks` | optional | Same visibility gate |

### Posts — `/api/posts` (entire router requires auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/feed` | Self + accepted friends' posts, newest first, limit 50 |
| GET | `/user/:username` | Gated by the same visibility check as profiles |
| POST | `/` | `{content, imageUrl?, isAiText?, isAiImage?}` → `201` |
| DELETE | `/:id` | Author only |

### Comments on posts — mounted at `/api`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/posts/:postId/comments` | optional | Gated by the post author's visibility |
| POST | `/posts/:postId/comments` | auth | Same gate; notifies the post author |
| DELETE | `/comments/:id` | auth | Comment author or post author |

### Friends — `/api/friends` (auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | Accepted friends |
| GET | `/requests` | Incoming pending requests |
| POST | `/request/:username` | 400 self, 403 blocked, 409 duplicate |
| POST | `/accept/:requestId` | Only the addressee can accept |
| POST | `/decline/:requestId` | Only the addressee can decline |
| DELETE | `/:friendId` | Removes an accepted friendship either direction |

### Groups — `/api/groups` (auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/?search=` | All groups; no group-level privacy exists by design |
| POST | `/` | Creator auto-joins as `admin` |
| GET | `/:id` | — |
| POST | `/:id/join` | 409 if already a member |
| POST | `/:id/leave` | — |
| GET | `/:id/members` | Viewer-aware user serialization (see §7) |

### Media — `/api/media`
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/upload` | auth | multipart, `?purpose=avatars\|wallpapers\|portfolio\|tracks`, 30MB limit → `413` over, streamed to Cloudinary |
| POST | `/` | auth | Create a MediaItem from a URL (AI-generated / search result) |
| GET | `/user/:username` | optional | Gated by visibility |
| DELETE | `/:id` | auth | Owner only |

### Notifications — `/api/notifications` (auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | Latest 50, with resolved actor + live friendship status |
| POST | `/read-all` | — |
| POST | `/:id/read` | Scoped to own recipient id |

### Moderation — mounted at `/api` (auth)
| Method | Path | Notes |
|---|---|---|
| POST | `/users/:username/block` | 400 on self-block; deletes any existing friendship |
| DELETE | `/users/:username/block` | Unblock |
| POST | `/reports` | Validates `targetType` enum + required fields |

### AI — `/api/ai` (auth)
| Method | Path | Notes |
|---|---|---|
| POST | `/text` | `{prompt, kind}` → `{text}`; 400 if prompt missing. Still the mock provider |
| POST | `/image` | `{prompt, kind, live?}` → `{url}`; 400 if prompt missing. Real Cloudflare Workers AI generation when configured (returns a Cloudinary URL), mock gradient (`data:` URI) otherwise; `429` after 10 per user per hour (real provider only); `503` if the provider is unavailable or its free allowance is spent |
| GET | `/images/search?q=` | Live Openverse search, no key required |

### Tracks — `/api/tracks` (auth)
| Method | Path | Notes |
|---|---|---|
| POST | `/` | Max 5 per user; extracts a YouTube video id from a full URL |
| DELETE | `/:id` | Owner only; re-numbers remaining positions |

### Help wanted (tasks) — `/api/tasks` (auth) — the full-CRUD user-owned resource plus a public board
| Method | Path | Notes |
|---|---|---|
| GET | `/?done=&sort=&page=&limit=` | Owner-scoped; filter/sort/paginate |
| GET | `/board` | Open (`done=false`), public requests from *other* users, newest first (max 100). Requests from blocked users, and from private-profile users who aren't your friends, are omitted entirely |
| POST | `/:id/offer` | Offer to help on someone's public, open request → notifies the owner (`help_offer`), once per offerer per request, max 20 per user per hour (`429`). `400` on your own request; `404` if it's private/missing/not visible to you |
| GET | `/:id` | Owner-scoped; `404` (not `403`) if not yours |
| POST | `/` | `{title, description?, isPublic?, priority?, dueDate?}` → `201`; only those fields are read from the body; public posts capped at 10 per user per hour (`429`) |
| PUT | `/:id` | Whitelisted fields only (`title`, `description`, `isPublic`, `done`, `priority`, `dueDate`) — `owner` cannot be overwritten via the body |
| DELETE | `/:id` | Owner-scoped |

---

## 5. Deployment

| Layer | Platform | Notes |
|---|---|---|
| Backend (`first-server`) | [Render](https://render.com), free web service tier, via `render.yaml` blueprint | `npm install` / `npm start`; `NODE_ENV=production` committed, `MONGODB_URI`/`JWT_SECRET`/`CLIENT_URL`/`CLOUDINARY_*`/`CLOUDFLARE_*` set as dashboard-only secrets (`sync: false`), never committed |
| Frontend | [Vercel](https://vercel.com) | Auto-detected Vite build; `vercel.json` adds a catch-all rewrite to `index.html` so client-side routes (e.g. `/register`, `/u/:username`) don't 404 on direct navigation. Project settings: **Root Directory = `frontend`**, **Install Command = `npm ci`**; every `git push` auto-deploys |
| AI image generation | Cloudflare Workers AI (FLUX.1 schnell), free daily allowance | Needs `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`; without them the backend uses the mock provider. Results are re-hosted on Cloudinary |
| Database | MongoDB Atlas, free tier | Network Access allow-list set to `0.0.0.0/0` — Render's free tier has no static egress IP, so per-IP allow-listing isn't an option |
| Media storage | Cloudinary, free tier | Avatars/wallpapers/portfolio/tracks stream directly here (explained below); nothing is written to the backend's own filesystem |

**Why Cloudinary, not local disk.** Render's free-tier filesystem is
ephemeral — anything written to it is lost on every restart or redeploy.
Early on, uploads used `multer.diskStorage()`, which meant every avatar,
wallpaper, and portfolio image silently vanished the next time the service
redeployed. Uploads now stream directly to Cloudinary via a small custom
`multer` storage engine, and the database stores Cloudinary's returned CDN
URL instead of a local path — see the Security Review for the full incident
and the dependency conflict that complicated the fix.

**Cross-domain auth cookie.** The backend and frontend are deployed to
different domains (`onrender.com` / `vercel.app`), not different ports on
the same domain like in local dev. `setAuthCookie` (`middleware/auth.js`)
switches `sameSite`/`secure` based on `NODE_ENV`: `lax`/non-secure in dev
(same registrable domain, cookie already flows), `none`/`secure` in
production (a cross-site fetch only carries a cookie that's explicitly
`SameSite=None; Secure`, which itself requires HTTPS — true on both
platforms). Getting this wrong doesn't error visibly — login "succeeds" but
no protected route ever sees the cookie — so it was verified with a live
`Set-Cookie` header inspection after deploying, not just read from code.

**Known limitation**: Render's free tier spins down after inactivity, so the
first request after idle time is slow (cold start, tens of seconds) —
disclosed to the user, not fixed, since it's a paid-tier upgrade, not a code
change.

---

## 6. Component Tree

```
App
├── AuthProvider            (fetches /api/auth/me once; exposes {user, isLoading, setUser})
│   └── PlaybackProvider     (global "now playing" state — survives navigation)
│       ├── NavBar           (links + NotificationBell)
│       ├── Routes
│       │   ├── /login       → LoginPage
│       │   ├── /register    → RegisterPage
│       │   ├── ProtectedRoute (redirects to /login if !user)
│       │   │   ├── /          → FeedPage        (PostComposer, PostCard[] → PostCommentList)
│       │   │   ├── /friends   → FriendsPage
│       │   │   ├── /groups    → GroupsPage
│       │   │   ├── /groups/:id→ GroupDetailPage
│       │   │   ├── /search    → SearchPage
│       │   │   └── /help-wanted → TasksPage: public board + my requests (/tasks redirects here)
│       │   ├── /u/:username → ProfilePage (attachUserIfPresent server-side, not client-gated)
│       │   │   ├── ThemeEditor, ImagePositioner
│       │   │   ├── TopFriendsList
│       │   │   ├── MusicPlayer            (uses usePlayback())
│       │   │   ├── PortfolioGrid
│       │   │   └── ProfileComments
│       │   └── *            → redirect to /
│       └── NowPlayingBar    (renders when PlaybackContext.current is set)
```

**Where API calls live**: each page owns its own data-fetching in a
`useEffect`/`load()` function, calling a matching `api/*.api.ts` module
(`posts.api.ts`, `groups.api.ts`, `friends.api.ts`, `tasks.api.ts`,
`profiles.api.ts`, `notifications.api.ts`, `ai.api.ts`, `media.api.ts`),
which all wrap the single `api` object in `api/client.ts` — one place that
sets `credentials: "include"` and turns a non-2xx response into a thrown
`ApiError`. No component talks to `fetch` directly except `media.api.ts`'s
`uploadFile`, which needs `FormData` instead of JSON.

---

## 7. Technical Decisions

**Cookie-based JWT, not an Authorization header.** The token is signed with
`jsonwebtoken` and stored in an httpOnly cookie named `token` (`middleware/auth.js`),
not sent back to the client as a string the frontend has to store. This means
XSS can't read the token out of `localStorage`, and the frontend never
touches it directly — `credentials: "include"` on every `fetch` call is the
entire client-side auth story.

**Why MongoDB/Mongoose over a relational DB.** The original prototype used
Prisma + SQLite; the project was consolidated onto a single Express +
Mongoose backend (`first-server`) so the whole app — the original social
features and the Help wanted list — runs on one server, one database, one login,
instead of two separate backends with two separate auth systems.

**Centralized visibility check (`utils/visibility.js`).** Early on, the
profile page's own `isPrivate`/block check existed, but every *other* route
that also exposed a user's content (their posts, their portfolio, comments on
their posts, their top-friends list) had its own copy — or no copy at all.
`assertVisible(user, viewerId)` is now the single function every one of those
routes calls, so "is this private, and is the viewer blocked or a stranger"
is answered the same way everywhere, instead of being reimplemented (and
sometimes forgotten) per route.

**Viewer-aware serialization (`toPublicUser(user, viewerId)`).** A private
user's `bio`/`wallpaperUrl`/`theme`/`email` shouldn't be visible to a
stranger just because that user showed up embedded somewhere else — a
group roster, a comment's author, a notification's actor. `toPublicUser`
takes the current viewer's id and returns either the full profile shape or
`User.toPublicRestricted()` (identity fields only), based on whether the
viewer is the user themselves or an accepted friend.

**`Task.owner` is never taken from the request body.** `PUT /tasks/:id`
whitelists exactly `title`/`done`/`priority`/`dueDate` into the update
document — `owner` is set once, at creation, from the authenticated
session, and can't be reassigned through the update body even by the task's
own current owner.

**A pluggable AI provider, real for images, mock everywhere else.**
`services/ai/index.js` picks the provider: `CloudflareAIProvider` when both
Cloudflare credentials are set, `MockAIProvider` otherwise. Every provider
implements the same `generateText` / `generateImage` / `searchImages`
surface, so the routes never know which is active. The mock is kept on
purpose — it lets local development, the test suite and any un-configured
deploy run with zero API keys — but it only hashes the prompt into a
gradient and never interprets it, which is why users reported "AI pictures
don't match what I asked for" until the real provider went in.
`CloudflareAIProvider` extends the mock, so text generation and photo
search inherit the existing behavior and only `generateImage` is replaced.
Generated images are uploaded to Cloudinary and the CDN URL is stored,
rather than storing multi-megabyte base64 on a user or post document. Since
the free daily allowance is shared by every user, `/api/ai/image` is capped
at 10 per user per hour while the real provider is active; provider errors
are logged server-side and never forwarded to clients, and account-level
failures (bad token, exhausted allowance) surface as "temporarily
unavailable" instead of "try again", since retrying can't fix them.

**A custom Cloudinary storage engine, not the off-the-shelf package.**
`multer-storage-cloudinary` is the obvious choice for wiring `multer` to
Cloudinary, but its latest release pins a peer dependency on
`cloudinary@^1.x` — incompatible with the `cloudinary@^2.7.0` needed for a
patched security advisory (see the Security Review, §5.1). Rather than
accept the vulnerable SDK version just to keep the convenience package, a
~15-line custom `StorageEngine` calls `cloudinary.uploader.upload_stream`
directly — the same call the package made internally — removing the
conflicting dependency entirely.

**Centralized error handling grew by one case.** `errorHandler.js` started
by mapping `CastError`→`400`. A Mongoose `ValidationError` (a required field
missing, an invalid enum value) got the same generic `500` as a genuine
server bug until a second pass added a `ValidationError`→`400` case too —
fixed once, in the one place every route's errors already flow through,
rather than adding input validation to each route individually.

**Dynamic import for `app.js` in `server.js`.** The Express app was split
into `app.js` (middleware + routes) and `server.js` (env loading + listen)
so tests could import the app without opening a real port. Static imports
are hoisted above the rest of a file, so a static `import { app }` would
build `app.js`'s `cors()` middleware — which reads `process.env.CLIENT_URL`
once — *before* `loadEnv()` runs. `server.js` uses `await import("./app.js")`
after `loadEnv()` specifically to avoid that ordering bug (found and fixed
this week — see the security review).
