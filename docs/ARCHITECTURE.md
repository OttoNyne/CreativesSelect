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

    DB[("MongoDB Atlas\n18 Mongoose models")]
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
   `cors` (checks the request's Origin against the address(es) in `CLIENT_URL`) → `morgan` +
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

MongoDB via Mongoose. 26 collections. `ObjectId` refs are named `ref` below;
`unique` compound indexes are noted where they exist.

| Model | Fields | Relationships |
|---|---|---|
| **User** | `email` (unique, lowercased), `username` (unique, lowercased), `passwordHash`, `displayName`, `bio`, `avatarUrl`, `wallpaperUrl`, `wallpaperType` (image/video), `wallpaperPosition`, `wallpaperMotion` (none/zoom/drift/pan/pulse — how a picture wallpaper moves), `isPrivate`, `theme` {bgColor, textColor, accentColor, fontFamily, layoutStyle}, `passwordChangedAt` (sessions issued before it are rejected), timestamps | Referenced by nearly every other model as author/owner/participant |
| **Task** | `owner` → User, `title`, `description`, `isPublic` (default false), `done` (= resolved), `priority` (low/medium/high), `dueDate`, timestamps | Belongs to one User; shown in the UI as a "Help wanted" request — private by default, listed on the public board when `isPublic` |
| **Post** | `author` → User, `content`, `imageUrl`, `imageAspect` (original/1:1/4:3/16:9), `imageZoom` (1–3), `imagePosition` ("x% y%"), `isAiText`, `isAiImage`, timestamps | Has many Comments. The three framing fields are how the author shaped, zoomed and placed the picture; they are absent on posts made before framing existed, which are shown as they always were |
| **Comment** | `post` → Post, `author` → User, `content`, timestamps | Belongs to one Post |
| **ProfileComment** | `profileOwner` → User, `author` → User, `content`, timestamps | The profile "guestbook"; distinct from post Comments |
| **Friendship** | `requester` → User, `addressee` → User, `status` (pending/accepted/declined), timestamps | Unique on (requester, addressee); a "friend" = an accepted row in either direction |
| **TopFriend** | `owner` → User, `target` → User, `position`, unique on (owner, target) | Self-curated top-8 list; no consent required from the target |
| **Group** | `name`, `description`, `bannerUrl`, `createdBy` → User, timestamps | Has many GroupMemberships |
| **GroupMembership** | `group` → Group, `user` → User, `role` (member/admin), `joinedAt`, unique on (group, user) | Join table between User and Group |
| **MediaItem** | `owner` → User, `url`, `type` (image/audio/video/embed), `caption`, `isAiImage`, `startSeconds` (video window start), `durationSeconds` (uploaded videos), timestamps | A user's portfolio piece: a picture, an uploaded video (`video`), or a linked video (`embed` for YouTube, `video` for a direct file link) |
| **MediaReaction** | `item` → MediaItem, `user` → User, `value` (+1 like / −1 dislike), unique on (item, user) | One reaction per person per portfolio piece; removed with the piece or the account |
| **UsernameHistory** | `username`, `user` → User, `expireAt` (TTL) | A username someone gave up, reserved for them for 30 days so it can't be instantly taken over |
| **Track** | `owner` → User, `title`, `sourceType` (upload/youtube), `url`, `position`, timestamps | Max 5 per user, enforced in the route, not the schema |
| **StoredAsset** | `owner` → User, `url`, `publicId`, `resourceType` (image/video/raw), `kind` (ai/upload), timestamps | Ledger of every file the server itself stored on Cloudinary (AI images and uploads) and whose it is — the only thing that lets the app delete an asset safely |
| **Notification** | `recipient` → User, `type` (friend_request/friend_accept/comment/profile_comment/group_invite/help_offer/help_accepted/live_started/message), `payload` (Mixed — carries related ids like `actorId`/`friendshipId`), `isRead`, timestamps | Fan-out target for actions elsewhere in the app |
| **Message** | `sender` → User, `recipient` → User, `pair` ("smaller id:larger id" — one key per two people, indexed with `createdAt`), `body` (≤2000 chars), `readAt`, timestamps | A direct message between two friends; one document is both people's copy, so a delete or account deletion removes it for both |
| **GroupMessage** | `group` → Group, `sender` → User, `body` (≤1000 chars), timestamps | A message in a group's chat; only members can read or write; removed with its sender's account or its group |
| **PasswordReset** | `user` → User, `tokenHash` (SHA-256, unique), `expireAt` (TTL, 1 hour) | At most one outstanding "reset my password" link per user; only a hash of the token is stored, so the database never holds a usable link |
| **LiveSession** | `host` → User, `title` (≤80), `status` (live/ended), `lastHeartbeat`, `endedAt`, `expireAt` (TTL, set when it ends) | One voice-only live broadcast. It counts as live only while its host keeps sending heartbeats |
| **LiveListener** | `session` → LiveSession, `user` → User, `lastSeen`, `stage` (listener/requested/invited/speaking — big lives only), `expireAt` (TTL), unique on (session, user) | Someone listening; "active" means they pinged in the last 30 s |
| **LiveSignal** | `session`, `from` → User, `to` → User, `kind` (offer/answer/ice), `data`, `expireAt` (TTL, 5 min) | A WebRTC handshake message passed between two browsers through the API; never contains audio |
| **LiveComment** | `session`, `user` → User, `body` (≤200), `expireAt` (TTL, 24 h) | A live chat message |
| **EmailVerification** | `user` → User, `tokenHash` (SHA-256, unique), `expireAt` (TTL, 24 hours) | One outstanding "confirm your email" link per user; only a hash of the token is stored. Confirming sets `User.emailVerified` |
| **RateLimitHit** | `key`, `at`, `expireAt` (TTL index) | One row per rate-limited action; stored in MongoDB so limits survive restarts and are shared by every server instance, and expired rows delete themselves |
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
| POST | `/register` | public | `{email, username, password, displayName}` (username 3–30 letters/numbers/underscores) → `201 {user}`; `429` after 10 registrations per IP per hour |
| POST | `/login` | public | `{email, password}` → `200 {user}`, sets `token` cookie; only *failed* attempts count — `429` (with `Retry-After`) after 10 per email or 30 per IP in 15 minutes |
| PUT | `/password` | auth | `{currentPassword, newPassword}` → `204`; wrong current password `403` (5 failures / 15 min then `429`); every other session is signed out, this one is re-issued |
| GET | `/reset-available` | public | → `{available}`: whether this site can send email at all (so the page can say so instead of promising a link that can't arrive) |
| POST | `/forgot-password` | public | `{email}` → `200` with the **same** message whether or not the address has an account (the work happens after the reply, so timing doesn't leak it either); `400` for something that isn't an email; `429` after 3 per address or 10 per IP per hour (counted for unknown addresses too); `503` if no mail provider is configured |
| POST | `/reset-password` | public | `{token, newPassword}` → `204`; the token is single-use, expires after an hour and only the newest link works; `400 This reset link is invalid or has expired` otherwise (10 bad tries / 15 min per IP then `429`). Signs out every existing session; does **not** sign anyone in; emails the owner a "your password was changed" notice |
| POST | `/verify-email` | public | `{token}` → `204`, sets the account's `emailVerified`. The token (from the emailed link) is single-use and expires after 24 hours; `400 …invalid or has expired` otherwise (20 bad tries / 15 min per IP then `429`). Needs no sign-in, so the link works on any device |
| POST | `/resend-verification` | auth | → `204`, emails a fresh link (the old one stops working); `400` if already confirmed, `503` if the site can't send email, `502` if sending fails, `429` after 3 an hour |
| POST | `/logout` | public | — → `204`, clears cookie |
| GET | `/me` | auth | → `200 {user}`; your own user object includes `email` and `emailVerified` (neither is ever shown to anyone else) |

### Profiles — `/api/profiles`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/?search=` | auth | Search by username/displayName (regex, case-insensitive) |
| PATCH | `/me` | auth | Update own displayName (1–80 chars, trimmed)/bio (≤1000)/avatar/wallpaper/isPrivate/theme; a replaced avatar/wallpaper the server stored is deleted from Cloudinary if nothing else uses it |
| DELETE | `/me` | auth | `{password}` → `204`. Permanently deletes the account and everything it owns (posts, comments on them, friendships, media, tracks, requests, notifications, reports, stored files); groups it created are handed to another member or removed if empty |
| PUT | `/me/top-friends` | auth | `{usernames: string[]}`, max 8 → `200 {topFriends}` (the saved list, same shape as `GET`). Only accepted friends are kept; anything else is ignored |
| PUT | `/me/username` | auth | `{username}` → `200 {user}` and a re-issued session cookie. 3–30 letters/numbers/underscores (stored lowercase); `409` if taken or reserved for someone else (a name you give up stays yours for 30 days); `429` after 3 changes a day |
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
| GET | `/:id` | One post (where a comment notification lands). Same visibility gate as the feed; a post that is missing, deleted, private or from a blocked author is the same `404 Post not found` |
| POST | `/` | `{content, imageUrl?, imageAspect?, imageZoom?, imagePosition?, isAiText?, isAiImage?}` → `201`. The framing fields are checked (`400` for an unknown shape, a zoom outside 1–3, or a position that isn't `"x% y%"` with each 0–100) and ignored on a post with no picture |
| DELETE | `/:id` | Author only; also deletes the post's AI-generated image from Cloudinary if that user generated it and nothing else still uses it |

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
| GET | `/:id/messages?before=` | **Members only** (`403` if you haven't joined, `404` for no such group): the group's chat, oldest first, 50 per page; people you've blocked or who blocked you are left out |
| POST | `/:id/messages` | Members only. `{body}` (trimmed, 1–1000 chars, text) → `201 {message}`; 60 per user per 10 minutes (`429` + `Retry-After`) |
| DELETE | `/:id/messages/:messageId` | The sender, or an admin of the group; `404` for anyone else, and for a message of a different group |

### Media — `/api/media`
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/upload` | auth | multipart, `?purpose=avatars\|wallpapers\|portfolio\|tracks`, 30MB limit → `413`, streamed to Cloudinary. Portfolio accepts images (≤10 MB on the free plan → `413` with a clear message) **and videos** (mp4/webm/quicktime): the length is measured by the storage provider and a video over **30 seconds** (or of unknown length) is deleted again and refused with `400` |
| POST | `/` | auth | Add a portfolio item by URL. `{type: "image", url}` (https, or an inline AI image) or `{type: "video", url, startSeconds?}` where the link must be **YouTube** (→ `embed`, canonical URL) or a **direct https .mp4/.webm/.mov/.m4v** file (→ `video`, `#fragment` dropped); anything else `400`. Linked videos can't be measured, so they play as a 30-second window from `startSeconds` |
| GET | `/user/:username` | optional | Gated by visibility; each item carries `likes`, `dislikes` and (when signed in) the viewer's `myReaction` |
| PUT | `/:id/reaction` | auth | `{value: 1 \| -1 \| 0}` (like / dislike / clear) → `{likes, dislikes, myReaction}`; one reaction per person; `404` if the item is missing **or the profile isn't visible to you** (private/blocked); 300 per hour |
| DELETE | `/:id` | auth | Owner only; also removes its reactions and, if nothing else uses it, the stored file |

### Messages — `/api/messages` (auth) — direct messages between friends
| Method | Path | Notes |
|---|---|---|
| GET | `/conversations` | One row per **friend**: the latest message and how many of theirs are unread; conversations with messages first (newest on top), then friends you haven't written to. Non-friends never appear |
| GET | `/unread-count` | `{unread}` — drives the nav badge |
| GET | `/with/:username?before=` | The thread with one friend, oldest first, 50 per page (`hasMore`, `before=<message id>` for earlier ones). Opening it marks their messages read. `403` unless you are accepted friends and neither has blocked the other; `404` unknown user; `400` yourself |
| POST | `/with/:username` | `{body}` (trimmed, 1–2000 chars, text only) → `201 {message}`. Same friend/block rules; max 60 per user per 10 minutes (`429` with `Retry-After`) |
| DELETE | `/:id` | Sender only, removes it for both people; `404` for anyone else (never `403`, so ids aren't probeable) |

### Live (voice) — `/api/live` (auth)
The audio never touches this API. A live travels one of two ways, fixed when it starts: **`sfu`** (when LiveKit is configured) — the host sends it once to a media server that fans it out to **50–100 listeners** — or **`mesh`** — straight between browsers over WebRTC, which only carries 8. This API lists rooms, counts listeners, creates media rooms and hands out access tokens, passes the handshake messages for browser-to-browser lives, and carries the live chat.
| Method | Path | Notes |
|---|---|---|
| POST | `/:id/token` | Big lives only (`400` for a browser-to-browser live). A one-hour LiveKit pass for people already in the room: the host's can publish a microphone and listen, everyone else's can only listen — unless they are a guest on stage, whose pass lets them publish a microphone (so a guest who reconnects can still speak); nobody can send data through it. Returns `{url, token}` |
| GET | `/:id/stage` | People in the room only. `{enabled, maxGuests, me, guests}` — who is speaking, and the viewer's own place; the host also gets `requests`, `invited` and `listeners` (up to 100, to pick guests from). A browser-to-browser live answers `{enabled:false}`. Read every ~4 s, from a 2-second server-side cache |
| POST | `/:id/stage/request` | Listener asks to speak (`requested`); at most 20 asks pending at once (`409`) |
| POST | `/:id/stage/invite` | Host only: `{userId}` → `invited`. Up to **9** guests at once, counting invitations not yet answered (`409`); the person must be an active listener (`404`) |
| POST | `/:id/stage/accept` | The invited listener says yes → `speaking`: the media server is told to let this one participant publish a microphone (and only a microphone) without reconnecting. `409` if not invited, or not yet connected to the audio; `503` if the media server fails (they stay invited) |
| POST | `/:id/stage/leave` | Withdraw a request, decline an invitation, or step down (takes the microphone permission away) |
| POST | `/:id/stage/remove` | Host only: `{userId}` — dismiss a request, withdraw an invitation, or send a guest back to listening (microphone permission revoked). Every stage route answers `409` for a browser-to-browser live |
| GET | `/ice` | `{iceServers}` for WebRTC: public STUN by default, or the JSON in `LIVE_ICE_SERVERS` (add a TURN relay there for networks that need one) |
| GET | `/` | `{lives, config}` — `config` is what a live started now would allow (`{mode, maxListeners}`). Who is live right now (a host with no heartbeat for 45 s is treated as ended). Hosts you've blocked or who blocked you are omitted; a private-profile host is shown only to their friends and themselves |
| POST | `/` | `{title}` (1–80 chars) → `201 {live}` (`503` if the media server can't create the room; nothing starts and nobody is notified); one live per person (starting another ends the first); 5 per hour (`429`). Tells the host's accepted friends with a `live_started` notification (host, title, link to the room); those notifications are removed when the live ends, and a failure to send them never stops the live starting |
| GET | `/:id` | The room: title, host, `listenerCount`, `maxListeners` (8, or 50–100 for a big live), `mode`, `isHost`, and how often the room's clients should check in and poll the chat (slower for big rooms). `404` — the same answer — for a missing room or one you may not see |
| POST | `/:id/join` | Become a listener. `409` if it has ended or is full (the room's capacity); `400` for the host; 120 per hour |
| POST | `/:id/heartbeat` | Called every ~10 s by the host (keeps the live alive) and each listener (keeps them counted) → `{status, listenerCount}` |
| POST | `/:id/leave` | Stop listening (also removes their handshake messages) |
| POST | `/:id/end` | Host only; ends the live and deletes its listeners and handshake messages |
| POST / GET | `/:id/signals` | WebRTC handshake (browser-to-browser lives only; `400` for a big live). A listener can send only to the host (and only once joined), the host only to listeners; `kind` offer/answer/ice, ≤20 KB, 600 per 5 min; each person reads only what's addressed to them (`?after=` cursor) |
| GET / POST | `/:id/comments` | Live chat for people in the room (host + joined listeners); ≤200 chars; 20 per minute; blocked users' comments hidden; `409` once ended |
| DELETE | `/:id/comments/:commentId` | The author or the host |

### Notifications — `/api/notifications` (auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | Latest 50, with resolved actor + live friendship status |
| POST | `/read-all` | — |
| POST | `/:id/read` | Scoped to own recipient id |
| POST | `/:id/accept-offer` | Owner of a help request accepts an offer notification → notifies the offerer (`help_accepted`), once; `404` for anyone but the recipient |

### Moderation — mounted at `/api` (auth)
| Method | Path | Notes |
|---|---|---|
| POST | `/users/:username/block` | 400 on self-block; deletes any existing friendship |
| DELETE | `/users/:username/block` | Unblock |
| POST | `/reports` | Validates `targetType` enum + required fields |

### AI — `/api/ai` (auth)
| Method | Path | Notes |
|---|---|---|
| POST | `/text` | `{prompt, kind}` → `{text}`; 400 if prompt missing. Real Llama 3.1 8B via Cloudflare Workers AI when configured (max 30 per user per hour, `429` beyond), canned templates otherwise |
| POST | `/image` | `{prompt, kind}` as JSON → `{url, usedReference}`; 400 if prompt missing. **Any AI picture can start from a reference photo:** send it as a form instead (`prompt`, `kind`, optional `closeness` close/balanced/loose, and a `reference` file — JPEG/PNG/WebP checked by its bytes, ≤4 MB, held in memory only, never fetched from a link) and the picture is made from the photo by a model that takes pictures as input (FLUX.2 klein, square for posts/avatars/portfolio, wide for wallpapers); the same rules as `/wallpaper`. Real Cloudflare Workers AI generation when configured (returns a Cloudinary URL), mock gradient (`data:` URI) otherwise; `429` after 10 per user per hour (real provider only); `503` if the provider is unavailable or its free allowance is spent |
| POST | `/wallpaper` | Multipart: `prompt` (≤500 chars), optional `reference` photo (JPEG/PNG/WebP checked by its bytes, ≤4 MB, held in memory only and never fetched from a link), `closeness` (`close`/`balanced`/`loose`, how closely to follow the photo) → `{url, usedReference}`. From words alone it uses the ordinary image model with wallpaper wording; with a photo it uses a model that takes pictures as input (FLUX.2 klein, `CLOUDFLARE_REFERENCE_MODEL` to change). Stored on Cloudinary and recorded like any generated image; the mock provider answers with a small SVG that differs when a photo is given. `429` after 6 per user per hour (real provider only) |
| POST | `/discard` | `{url}` → `204`. Removes a generated picture the person decided not to use — only one recorded as theirs and not used by a wallpaper, post or anything else, so it can't delete anything else |
| GET | `/images/search?q=` | Live Openverse search, no key required |

### Tracks — `/api/tracks` (auth)
| Method | Path | Notes |
|---|---|---|
| POST | `/` | Max 5 per user; extracts a YouTube video id from a full URL |
| PUT | `/order` | `{ids}` → `{tracks}`. Puts the owner's playlist in a new order. The list must be exactly the owner's own tracks, each once (`400` for a missing, extra, repeated or foreign id, or anything that isn't a list of strings), so a request can neither add, drop nor touch someone else's track. Positions are rewritten in one bulk write |
| DELETE | `/:id` | Owner only; re-numbers remaining positions (so a rearranged order is kept) |

### Help wanted (tasks) — `/api/tasks` (auth) — the full-CRUD user-owned resource plus a public board
| Method | Path | Notes |
|---|---|---|
| GET | `/?done=&sort=&page=&limit=` | Owner-scoped; filter/sort/paginate |
| GET | `/board` | Open (`done=false`), public requests from *other* users, newest first (max 100). Requests from blocked users, and from private-profile users who aren't your friends, are omitted entirely |
| POST | `/:id/offer` | Offer to help on someone's public, open request → notifies the owner (`help_offer`), once per offerer per request, max 20 per user per hour (`429`). Optional `{message}` (≤300 chars) is shown to the owner. `400` on your own request; `404` if it's private/missing/not visible to you |
| GET | `/:id` | Owner-scoped; `404` (not `403`) if not yours |
| POST | `/` | `{title, description?, isPublic?, priority?, dueDate?}` → `201`; only those fields are read from the body; public posts capped at 10 per user per hour (`429`) |
| PUT | `/:id` | Whitelisted fields only (`title`, `description`, `isPublic`, `done`, `priority`, `dueDate`) — `owner` cannot be overwritten via the body |
| DELETE | `/:id` | Owner-scoped |

---

## 5. Deployment

| Layer | Platform | Notes |
|---|---|---|
| Backend (`first-server`) | [Render](https://render.com), free web service tier, via `render.yaml` blueprint | `npm install` / `npm start`; `NODE_ENV=production` committed, `MONGODB_URI`/`JWT_SECRET`/`CLIENT_URL` (one site address, or several separated by commas — the first is used in email links)/`CLOUDINARY_*`/`CLOUDFLARE_*`/`RESEND_API_KEY`/`MAIL_FROM`/`LIVEKIT_*`/`LIVE_MAX_LISTENERS`/`LIVE_ICE_SERVERS`/`REQUIRE_VERIFIED_EMAIL` set as dashboard-only secrets (`sync: false`), never committed |
| Frontend | [Vercel](https://vercel.com) | Auto-detected Vite build; `vercel.json` adds a catch-all rewrite to `index.html` so client-side routes (e.g. `/register`, `/u/:username`) don't 404 on direct navigation. Project settings: **Root Directory = `frontend`**, **Install Command = `npm ci`**; production deploys come **only from CI**: `vercel.json` sets `git.deploymentEnabled: false`, and the `deploy` job in `.github/workflows/ci.yml` builds and ships with the Vercel CLI (secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) only after lint, build, tests and audit pass on `master`. Side effect: no per-PR preview deployments. `vercel.json` also **proxies `/api/*` to the Render API** so cookies are first-party (see the same-origin proxy note below), and the site is an **installable web app** (`manifest.webmanifest`, icons, Apple meta tags) |
| AI image generation | Cloudflare Workers AI (FLUX.1 schnell), free daily allowance | Needs `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`; without them the backend uses the mock provider. Results are re-hosted on Cloudinary |
| Password-reset email | [Resend](https://resend.com) HTTP API | Needs `RESEND_API_KEY` and `MAIL_FROM` (a sender on a domain verified with Resend) as Render settings. Until they're set the site says plainly that reset by email isn't available. Resend without a verified domain only delivers to its owner's own address |
| Live audio (big lives) | [LiveKit](https://livekit.io) media server (free LiveKit Cloud project) | Needs `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` as Render settings; `LIVE_MAX_LISTENERS` (50 by default, up to 100) is optional. Includes the relay servers phones on mobile networks need. Without these the site falls back to the browser-to-browser mode below |
| Live audio (small lives) | WebRTC between browsers; public STUN | Works for most networks. Networks that block direct connections need a TURN relay: put its details in `LIVE_ICE_SERVERS` (a JSON array) on Render, no frontend change needed |
| Database | MongoDB Atlas, free tier | Network Access allow-list set to `0.0.0.0/0` — Render's free tier has no static egress IP, so per-IP allow-listing isn't an option |
| CI | GitHub Actions, both repos | On every push and pull request. Backend: tests against a throwaway MongoDB 7 service container (no secrets, never Atlas) + `npm audit --audit-level=high`. Frontend: `oxlint`, `npm run build` (which runs `tsc -b`, type-checking the tests — the same command Vercel runs), the Vitest suite, and `npm audit`. Dependabot proposes weekly npm and monthly Actions updates, and CI runs on those PRs too. **Deploy gating:** frontend — enforced as above (verified: one push produced exactly one production deploy, from CI). Backend — `render.yaml` sets `autoDeployTrigger: checksPass`, and the Render service's Auto-Deploy setting must be "After CI Checks Pass" for it to take effect. A separate `keep-warm` workflow pings `/api/health` every 10 minutes (public repos run scheduled workflows free) so Render's free tier rarely sleeps; the frontend also pings it on page load. **Browser end-to-end job (both repos):** Playwright drives the built frontend in desktop Chrome, desktop WebKit (Safari's engine) and an iPhone-sized WebKit against a real API and a throwaway MongoDB (110 tests × 3 browsers, 330 runs — three phone-only tests run only on the iPhone project, and the live-audio tests need Chrome's fake microphone so they skip on the two WebKit projects). The frontend repo runs it against the latest API and the API repo against the latest frontend; the frontend deploy waits for it, and a failure uploads the Playwright report, traces, screenshots and the API log |
| Media storage | Cloudinary, free tier | Avatars/wallpapers/portfolio/tracks stream directly here (explained below); nothing is written to the backend's own filesystem |

**Why Cloudinary, not local disk.** Render's free-tier filesystem is
ephemeral — anything written to it is lost on every restart or redeploy.
Early on, uploads used `multer.diskStorage()`, which meant every avatar,
wallpaper, and portfolio image silently vanished the next time the service
redeployed. Uploads now stream directly to Cloudinary via a small custom
`multer` storage engine, and the database stores Cloudinary's returned CDN
URL instead of a local path — see the Security Review for the full incident
and the dependency conflict that complicated the fix.

**Same-origin API proxy, so the login cookie is first-party.** The frontend
(`vercel.app`) and the API (`onrender.com`) are different sites. The first design
used a `SameSite=None; Secure` cookie for that cross-site setup — which works in
Chrome but **not on iOS**: Safari (and every browser on iOS, which all use its
engine) blocks cookies set by a different site than the page even when they're
`SameSite=None`, so login would appear to succeed and then every page would act
signed out. So the frontend now calls `/api/...` on its own domain and
`vercel.json` rewrites `/api/:path*` to the Render API (listed before the SPA
catch-all). The browser only ever talks to one domain; the cookie is host-only
and first-party, and can be `SameSite=Lax` — stricter, and enough because
requests are now same-origin. In production `src/api/base.ts` makes the API base
empty (same origin); in development it's `VITE_API_URL` or
`http://localhost:5000`. Behind the proxy Render sees Vercel's address, so per-IP
rate limits read Vercel's `x-vercel-forwarded-for` (the real client IP) via
`utils/clientIp.js`. Verified live through the proxy: host-only Secure/HttpOnly
cookie, real client IP reaching the limiter, a 10 MB upload and AI image
generation passing, and a full browser sign-up → post → reload → logout flow.
Because Apple gives no iPhone browser an install button, the site shows its own dismissible
"tap Share, then Add to Home Screen" banner to iPhone and iPad visitors who haven't installed it.
Confirmed working on physical iPhones by the project owner (a manual check, not automated),
on top of Safari's documented cookie policy, the first-party test in a desktop browser and
the WebKit/iPhone-sized runs in CI.

**Voice Live: browser-to-browser audio, handshake through polling.** Each listener
opens a WebRTC connection straight to the host. The two browsers exchange their
connection details ("offer", "answer", network candidates) as short-lived messages
through `/api/live/:id/signals`, polled about once a second, rather than over a
WebSocket, because Vercel's rewrite to the API doesn't carry WebSockets. Every
attempt carries a random connection id so late messages from an earlier attempt are
ignored, and a listener whose connection drops retries (up to three times) with a fresh
one. The cost of this design is the host uploads one copy of the audio per listener, so
a browser-to-browser room is capped at **8 listeners**. For 50–100 listeners the same
room can instead run through a media server (an SFU, LiveKit): the host publishes once,
the server fans the audio out, and this API only creates the room, issues one-hour
pass tokens (publish for the host, listen-only for everyone else) and closes the room
with the live. Which way a live travels is decided when it starts, so changing the
settings never disturbs a live in progress; the media-server client library is loaded
only when a big live is opened, so it adds nothing to ordinary pages. In a big room the
clients check in every 20 s and poll the chat every 6 s, and the chat remembers
membership and blocks for a few seconds, to keep database load down. The host's page ends the
live — and so turns the microphone off — when they leave it, close the tab, or stop
sending heartbeats, so a microphone can't stay open out of sight.

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
│       ├── NavBar           (links + MessagesLink unread badge + NotificationBell)
│       ├── InstallBanner    (iPhone/iPad only: how to Add to Home Screen; dismissible, remembered 30 days)
│       ├── VerifyEmailBanner (signed-in people whose email isn't confirmed: reminder with Resend; dismissible for the visit)
│       ├── Routes
│       │   ├── /login       → LoginPage            ("Forgot password?" link)
│       │   ├── /forgot-password → ForgotPasswordPage
│       │   ├── /reset-password  → ResetPasswordPage    (token read from the URL #fragment, then removed from the address bar)
│       │   ├── /verify-email    → VerifyEmailPage      (same fragment handling; confirms the address on load)
│       │   ├── /about, /features, /how-it-works → AboutPage, FeaturesPage, HowItWorksPage (public information pages)
│       │   ├── /register    → RegisterPage
│       │   ├── ProtectedRoute (redirects to /login if !user)
│       │   │   ├── /          → FeedPage        (PostComposer → ImageAdjuster, PostCard[] → FramedImage + PostCommentList)
│       │   │   ├── /friends   → FriendsPage
│       │   │   ├── /posts/:id → PostPage            (one post with its comments open; ?comment=<id> highlights one; where notifications about comments land)
│       │   │   ├── /messages  → MessagesPage (conversation list + open thread; /messages/:username)
│       │   │   ├── /groups    → GroupsPage
│       │   │   ├── /groups/:id→ GroupDetailPage      (GroupChat for members)
│       │   │   ├── /live      → LivePage             (who's live + Go live)
│       │   │   ├── /live/:id  → LiveRoomPage         (host or listener view; LiveChat; HostStage/ListenerStage (useStage polls) for guests on stage; lib/live/host.ts + listener.ts hold the WebRTC logic, sfuHost/sfuListener the media-server one)
│       │   │   ├── /search    → SearchPage
│       │   │   └── /help-wanted → TasksPage: public board + my requests (/tasks redirects here)
│       │   ├── /u/:username → ProfilePage (attachUserIfPresent server-side, not client-gated)
│       │   │   ├── ThemeEditor (warns when a text colour can't be read), ImagePositioner
│       │   │   ├── TopFriendsList
│       │   │   ├── MusicPlayer            (uses usePlayback())
│       │   │   ├── PortfolioGrid
│       │   │   └── ProfileComments
│       │   └── *            → redirect to /
│       └── NowPlayingBar    (renders when PlaybackContext.current is set)
```

**Where API calls live**: each page owns its own data-fetching in a
`useEffect`/`load()` function, calling a matching `api/*.api.ts` module
(`posts.api.ts`, `groups.api.ts`, `friends.api.ts`, `messages.api.ts`, `live.api.ts`, `tasks.api.ts`,
`profiles.api.ts`, `notifications.api.ts`, `ai.api.ts`, `media.api.ts`),
which all wrap the single `api` object in `api/client.ts` — one place that
sets `credentials: "include"` and turns a non-2xx response into a thrown
`ApiError`. No component talks to `fetch` directly except `media.api.ts`'s
`uploadFile`, which needs `FormData` instead of JSON.

**Hosting a live from a phone.** A phone turns the microphone and the page's network connection off when its screen locks or another app takes over, so the host's page asks the browser to keep the screen on while live (`lib/wakeLock.ts`, the Screen Wake Lock API, asked for again each time the page comes back, and quietly skipped where unsupported). `SfuHost` no longer gives up the first time the media connection drops: it starts over by itself with a fresh pass and the same microphone (3 tries, 1.5 s apart and growing, the count resetting after every success; a refusal from the server such as "this live has ended" is not retried), and the page says "Your connection dropped — reconnecting". It also watches the microphone track, and tells the host in words when the phone has paused (screen locked / app switched) or taken the microphone, instead of leaving them broadcasting silence. If a connection dies within about 30 seconds of starting (or the first one can't be made), the host starts over *through the media server's relay* (TURN over an ordinary secure web connection, `iceTransportPolicy: "relay"`) and stays on it for the rest of the live, because that pattern usually means the network blocks the direct audio route. A *Connection details* panel on the host's page (folded away while all is well, open when something is wrong, with a Copy button) lists what the connection did in plain words with times, the phone's own network type, and tells "your phone lost its internet" (browser `offline` event) apart from "the live audio service dropped". Leaving the page still ends the live, as before.

**Rearranging the playlist.** The owner can move each song up or down (buttons, so it works by keyboard and on a phone) or drag it to a new place; the new order shows at once and is saved with one request (`PUT /api/tracks/order`), going back to the old order with a message if saving fails. Moves are held while one is being saved so two can't cross. A screen reader hears "Moved X to position n of m". If the profile's music is what is playing, the queue is re-ordered in place (`PlaybackContext.reorderQueue`), so what plays next follows the new order and the current song carries on without a restart.

**Reference photos for every AI picture.** `ReferencePhotoField` (a photo picker with a thumbnail, remove button and a three-way choice of how closely to follow it) is used by every AI picture maker on the site: the post composer's and portfolio's *Generate* buttons (via a "Start from a photo" option on `GenerateImageButton`) and the wallpaper studio. The browser shrinks the photo to ≤1024 px first (dropping its hidden location data) and sends it with the description as a form; without a photo the request is the same JSON as before.

**Live wallpapers.** In the profile editor the *WallpaperStudio* makes a wallpaper with AI from a description and, optionally, a reference photo (shrunk to ≤1024 px in the browser first, which also drops its hidden location data), with a choice of how closely to follow the photo. The result is a *preview* — shown moving in a small box — and only "Use this wallpaper" changes the profile; a picture that was made but not used is removed from storage. How it moves is a separate setting (`wallpaperMotion`: still, slow zoom, drift, pan, pulse) that can be changed for any picture wallpaper straight away. The motion is drawn by the browser, not baked into the picture: `MovingWallpaper` is a layer fixed behind the page, with the picture drawn 12% larger and slowly transformed by CSS keyframes (transform and filter only, so the compositor keeps it smooth), under the same 55% dark scrim as a still wallpaper so the readability guarantee below still holds. The profile root is its own stacking context (`isolate`) so the layer sits above the page colour but under the content. People whose device asks for reduced motion get the still picture. Video wallpapers play by themselves and have no motion setting.

**Sharing by QR code.** A Share button (the footer and phone menu on every page, a profile's header, a live room's header) opens `ShareDialog`: a QR code, the link with a Copy button, the device's own share sheet where the browser has one, and a Save-as-picture link. The code is made in the browser by the `qrcode` library, loaded only when the window opens (black on white, 2-module border, error correction M, 512 px), and the window is drawn into `document.body` by a portal so a profile's colours can't change it. `lib/share.ts` decides the address: always the real domain on the live site (never the old `*.vercel.app` address, which no longer takes sign-ins), the page's own address on `localhost`. Tests decode the generated image with a QR reader (`jsqr`) and compare it with the intended address, in unit tests and in real browsers.

**Readable on any background.** A profile owner picks a background colour, text colour, accent and optionally a wallpaper, so the white-on-dark styling the pages are written in can land on anything. `theme/contrast.ts` holds the WCAG maths and `theme/applyProfileTheme.ts` turns a saved theme into CSS variables, never using a stored colour as-is: colours are parsed as hex (anything else falls back to the default), and the text and accent are nudged — same hue, as little as needed — until they reach 4.5:1 against what is behind them. A light background sets `data-scheme="light"` on the profile, and `index.css` then swaps Tailwind's `--color-white`/`--color-black` for near-black/white (every `text-white/60`, `border-white/10`, `bg-black/30` flips together), with darker shades for coloured text and saturated buttons keeping their white label. A mid-tone background (a grey, saturated blue, bright yellow), where neither white nor dark text reads once faded, puts the content on a mostly opaque dark or light panel. A wallpaper (image or video) gets a 55% black scrim — enough for white text to pass even over an all-white photo — and darker cards. Accent-coloured buttons use an `--profile-accent-fill` shade chosen so their label passes. Elsewhere the faintest greys were raised, and Tailwind's stock violet/red/sky button shades are set a step deeper in `@theme` so white labels reach 4.5:1.

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

**A pluggable AI provider: real when configured, mock otherwise.**
`services/ai/index.js` picks the provider: `CloudflareAIProvider` when both
Cloudflare credentials are set, `MockAIProvider` otherwise. Every provider
implements the same `generateText` / `generateImage` / `searchImages`
surface, so the routes never know which is active. The mock is kept on
purpose — it lets local development, the test suite and any un-configured
deploy run with zero API keys — but it only hashes the prompt into a
gradient and never interprets it, which is why users reported "AI pictures
don't match what I asked for" until the real provider went in.
`CloudflareAIProvider` extends the mock, replacing `generateText` (Llama 3.1)
and `generateImage` (FLUX.1) while photo search inherits the existing
Openverse behavior.
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

**Three layers of tests, each faking only what it must.**
(1) *Backend* (`first-server`): Vitest + Supertest against a dedicated
`creativeselect_test` database — 343 tests over auth (throttling, CSRF, session
revocation), Tasks and the Help wanted board, friends, direct messages, group chat, password reset, voice live rooms, blocking, reports, groups,
portfolio media (reactions, video uploads and links), profile editing, account
deletion, password change, uploads (including a storage account that refuses them) and stored-asset cleanup (Cloudinary is mocked).
(2) *Frontend units*: Vitest + Testing Library in jsdom — 725 tests with the `api/*`
modules mocked, so they check what the UI does with server responses (errors shown,
buttons disabled, requests sent). Every page and nearly every component is covered:
login, register, forgot/reset password, confirm email (page, reminder banner, profile status), the About/Features/How it works pages and footer, feed, the picture adjuster,  friends, messages, groups, group detail and group chat, the Live page and room, live chat, the WebRTC and media-server host and listener logic (against fake connections), the music player, profile, search, Help wanted,
nav bar, messages link, notification bell, post composer/card/comments, portfolio, music player, top
friends, profile names, testimonials, delete-account, change-password, the AI buttons,
avatar, the auth context and the video helpers. Test files are type-checked by `tsc -b`
as part of the Vercel build, so a type error in a test blocks a deploy.
(3) *Browser end-to-end* (`frontend/e2e`, Playwright): real browsers against the built
frontend, a real API and MongoDB — sign-up/in/out and a session that survives a reload,
posting, profile rename, top friends, password change and account deletion, portfolio
pictures/reactions/video links, friends, groups, private profiles, the Help wanted flow
between two users, direct messages between two friends (unread, reply, delete, live arrival, friends-only), group chat, the whole forgotten-password flow through an emailed link (read from a mail outbox folder the API writes to in testing), and **voice Live between two real browsers** (real WebRTC audio from a fake microphone in Chrome, measured arriving at the listener), plus phone layout (menu, no sideways scrolling, tap targets).
Not covered by automated tests: audio over real networks and between real devices, real email delivery, real Cloudinary uploads (including the 30-second video
check), real AI generation and Openverse search — CI has no keys for them, so those are
checked by scripted and manual runs against production — plus the audio player context,
theme editor and image positioner units.

**Videos: a 30-second limit that's measured where it can be, and clipped where it can't.**
Uploaded videos (mp4/webm/iPhone .mov, ≤30 MB) go to Cloudinary, which reports the length
of the file it has just ingested; the API refuses and deletes anything over 30 seconds
(0.75 s slack) or of unknown length, so the limit can't be bypassed by skipping the
browser's own pre-check (which exists only to fail fast, before a 30 MB upload). Playback
asks Cloudinary for an H.264 MP4 of the file (`f_mp4,vc_h264`) because phones often
produce HEVC that most browsers can't play, plus a first-frame poster. Linked videos are
never downloaded, so they can't be measured: a YouTube link becomes a
`youtube-nocookie.com` embed with `start`/`end` set to a 30-second window, and a direct
file link plays with a `#t=start,end` media fragment plus a player guard that pauses at the
end. The link parser accepts only https YouTube links and direct video files — parsed with
`new URL`, not a regex over the text, so `https://evil.example/?u=youtube.com/watch?v=…`
is refused — so a stored value is always safe to put in an `<iframe>`/`<video>` `src`.

**Usernames are public addresses, so changes are constrained.** Letters, numbers and
underscores only (spaces and slashes used to be accepted at registration and broke
`/u/:username` URLs); unique case-insensitively; 3 changes a day; and the name you give up
is reserved for you for 30 days (`UsernameHistory`, TTL-indexed) so nobody can instantly
take it to impersonate you or capture old links. The session cookie is re-issued because it
carries the username.

**Profile pages ignore answers from requests they've moved past.** After a rename the page
briefly re-requested the *old* address (now a 404); if that 404 arrived after the new
profile had loaded it overwrote it with "unavailable". Found in a real-browser test — the
unit tests had passed because their mocks answered in order. The effect now cancels stale
results, with a regression test that fails without the guard.

**Browser tests run the production topology.** `vite preview` serves the production build
with `/api` proxied to the API — the same same-origin shape Vercel gives in production — so
the login cookie is first-party in the tests exactly as it is live. Running the suite in
WebKit (Safari's engine, desktop and iPhone-sized) is the closest automated check for the
iOS cookie policy that motivated that design: "still signed in after a reload" passes there.
Each test creates uniquely named users and claims its own client IP through
`x-vercel-forwarded-for` (the header the API's per-IP limits already read), so the
registration limit doesn't throttle a big run and tests never depend on each other or on
leftover data — the Help wanted test even has to pick its own request off a shared board.
Locally the suite runs against a throwaway database, never the real one. Writing it also
surfaced real bugs, not only test mistakes (see the security review §5.23).

**Failed background requests must not become unhandled rejections.** The
notification bell polls every 30 seconds and the top-friends list loads on
every profile view; both originally had no `catch`, so an offline blip, a
sleeping free-tier server, or a private profile's `403` surfaced as "Uncaught
(in promise)" console errors. Polls now keep the last known state and retry,
and user-initiated actions (Edit/Save top friends, mark read) show the
server's message or recover. Page titles (`lib/usePageTitle.ts`) update per
route (`Help wanted · CreativesSelect`, `@username · CreativesSelect`), and
the app ships its own favicon, meta description, focus rings and
reduced-motion support.

**Deleting stored files safely: a ledger, not a URL check.** A post's
`imageUrl` (and a portfolio item's, and a group banner's) is client-supplied,
so "delete the Cloudinary asset this points at" would let anyone delete
anyone's file by submitting its URL. Instead, whenever the server itself
stores a file — an AI image or an upload — `StoredAsset` records whose it is.
A file is deleted only if a ledger entry exists **for that user**, and only
when nothing else (another post, avatar/wallpaper, portfolio item, track or
group banner) still references the URL: when a post, portfolio item or track
is deleted, or an avatar/wallpaper is replaced. Account deletion removes every
file in the user's ledger. Deletions purge Cloudinary's CDN cache (found in
live testing: a deleted image kept being served from cache) and never fail
the user's own action — errors are logged and the record is deleted anyway.
Files stored before the ledger existed have no entry and are left alone.

**Abuse protection: one shared limiter, plus an origin check.** All rate
limits (login/registration, AI, the board, password and deletion attempts)
use one MongoDB-backed sliding-window limiter (`utils/rateLimit.js`) instead
of per-process memory, so they survive a restart and hold across instances.
Login counts only failed attempts — per email (stops guessing one account from
many IPs) and per IP (stops one client trying many accounts) — so normal use
never burns the budget; it fails open if the database call itself errors,
rather than locking everyone out. `app.set('trust proxy', 1)` makes `req.ip`
the real client behind Render (and `clientIp()` prefers Vercel's forwarded header when
requests arrive through the frontend proxy). The cookie is `SameSite=Lax` (it was `None` before the same-origin proxy), which already
keeps modern browsers from attaching it to cross-site POSTs; `middleware/csrf.js` still rejects state-changing
requests whose `Origin` header isn't the frontend (`403`). Requests with no
`Origin` (curl, server-to-server) can't be forged from a victim's browser, so
they pass.

**Sessions are revalidated on every request.** A signed JWT stays valid for 7
days on its own, so `requireAuth` also loads the user (one indexed lookup) and
rejects the token if the account no longer exists or the token was issued
before `passwordChangedAt`. Found while building account deletion: a copied
token from a deleted account still passed `requireAuth` and could create
posts under the dead id (reproduced live). A password change now signs out
every other session and re-issues the current one; a database error during the
check is a `500`, not a fake logout.

**Installable web app, not an App Store app.** `public/manifest.webmanifest`,
the `apple-touch-icon` and the `apple-mobile-web-app-*` meta tags make
"Add to Home Screen" (iOS Safari: Share → Add to Home Screen; Android Chrome: menu →
Install app) give the site an icon and a full-screen, browser-chrome-free window.
There is deliberately no service worker: offline caching would risk serving stale
bundles after a deploy for no real benefit to a server-backed social app. A native
App Store build would need a wrapper (e.g. Capacitor), an Apple developer account and
Apple's review for little extra over this. The icons are drawn from the same mark as
the favicon; the maskable variant leaves a safe margin for Android's shapes.

**Uploads fail with a message, not a 500.** Cloudinary's free plan caps images at
10 MB; the API used to surface that as a generic "Internal server error" (found while
testing large uploads through the proxy — it happens with or without the proxy).
`middleware/upload.js` now maps it to `413` with a plain message and any other storage
failure to `502` without leaking internals, and the frontend's `uploadFile` throws an
`ApiError` so the message reaches the user.

**Dynamic import for `app.js` in `server.js`.** The Express app was split
into `app.js` (middleware + routes) and `server.js` (env loading + listen)
so tests could import the app without opening a real port. Static imports
are hoisted above the rest of a file, so a static `import { app }` would
build `app.js`'s `cors()` middleware — which reads `process.env.CLIENT_URL`
once — *before* `loadEnv()` runs. `server.js` uses `await import("./app.js")`
after `loadEnv()` specifically to avoid that ordering bug (found and fixed
this week — see the security review).
