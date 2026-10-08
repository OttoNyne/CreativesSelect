# Browser end-to-end tests

Real browsers drive the **built** frontend against a **real API and MongoDB**.
Nothing is mocked (the AI provider uses its built-in mock when no AI keys are
set, which keeps the tests free and deterministic). They complement the unit
tests in `src/`, which mock the API and run in jsdom.

## What runs

Three Playwright projects, so every test runs on each engine:

| Project | Browser |
|---|---|
| `chromium` | desktop Chrome |
| `webkit` | desktop Safari's engine — the strictest about cookies |
| `iphone` | iPhone 13 (WebKit, touch, small screen); also runs `mobile.spec.ts` |

Specs: `auth` (sign up/in/out, session survives a reload, titles, install
manifest), `feed`, `profile` (rename, bio, privacy, top friends, password,
delete account), `portfolio` (pictures, likes/dislikes, video links, remove),
`social` (search, friends, block, groups, private profiles), `messages` (direct messages and group chat), `password-reset` (the emailed link, end to end), `live` (voice rooms, incl. real audio between two Chrome windows, and friends being told when someone goes live), `post-picture` (shape, zoom and placement of a post's picture), `install-banner` (the iPhone-only Add to Home Screen prompt), `email-verification` (the emailed confirmation link, end to end), `info-pages` (About, Features, How it works and the footer), `work` (opening up to work, searching only those open, asking for work and answering, withdrawing), `preview` (the shared profile link's preview page, the visitor's invitation to join, and listing in the sitemap and search engines only by choice), `credits` (crediting a friend on a piece, accepting, declining and removing, and the collaborations on their profile), `languages` (the footer's language box, the page mirrored for Arabic, the server's messages in each language, and every page fitting the screen and readable in Spanish and Arabic), `help-wanted`
(post, offer, accept) and `mobile` (menu, no sideways scrolling, tap targets).

The frontend is served by `vite preview` on `:4173` with `/api` proxied to the
API on `:5000` — the same same-origin shape as production (Vercel proxies
`/api/*`), which is what makes the login cookie first-party.

## Running locally

1. Easiest: from the `first-server` repo run `npm run e2e-api`. It starts a MongoDB of its own
   on your computer and the API on `:5000` with everything below already set, and prints the
   `MAIL_OUTBOX_DIR` to use. (A full run needs a lot of memory: three browsers plus a database.
   On a small computer run single specs, as below, and let CI run the whole suite.)

   Or by hand: start MongoDB and the API from the `first-server` repo, on a **throwaway
   database** (never your real one):

   ```bash
   MONGODB_URI=mongodb://localhost:27017/creativeselect_e2e \
   JWT_SECRET=e2e-only-secret CLIENT_URL=http://localhost:4173 PORT=5000 \
   CLOUDFLARE_ACCOUNT_ID= CLOUDFLARE_API_TOKEN= \
   node server.js
   ```

2. In `frontend/`:

   ```bash
   npm ci
   npx playwright install chromium webkit    # once
   npm run e2e                                # everything
   npm run e2e:chromium                       # just Chrome (fastest)
   npx playwright test --project=iphone -g "menu"   # one project / one test
   npx playwright show-report                 # after a run
   ```

**Two extras the newer specs use.** Emails: the API writes them to files instead of sending them
when `MAIL_OUTBOX_DIR` is set (ignored in production), and the password-reset test reads the link
from there — start the API with it (CI does) and run Playwright with the same value, e.g.
`MAIL_OUTBOX_DIR=/tmp/mail` for both. Without it that one test is skipped. The moderation tests need the same folder, **and** an API started with `ADMIN_EMAILS=mod-chromium@example.com,mod-webkit@example.com,mod-iphone@example.com` (CI does): each browser project signs up as its own moderator with one of those addresses and confirms it from the emailed link. Voice: the Chrome project
starts with a fake microphone (it plays a test tone), so the live-audio test can run for real; WebKit
can't fake a microphone, and Playwright's WebKit build has no WebRTC at all, so there those tests check
the page's "this browser can't play live audio" message instead.

Playwright builds and serves the frontend itself. Each test creates its own
uniquely named users, and claims its own client IP (`x-vercel-forwarded-for`)
so the API's per-IP registration limit doesn't stop a large run; leftover test
users are harmless in a throwaway database.

## In CI

`.github/workflows/ci.yml` runs this in both repos: the frontend repo runs it
against the latest API, the API repo against the latest frontend. The frontend
deploy waits for it, and a failed run uploads the Playwright report, traces and
screenshots plus the API log as the `e2e-failure` artifact.

## Not covered here

Anything that needs external services CI doesn't have: real Cloudinary uploads
(including video upload and the length check), real AI generation, and
Openverse photo search. Those are covered by backend tests with the provider
mocked and by scripted live runs against production.
