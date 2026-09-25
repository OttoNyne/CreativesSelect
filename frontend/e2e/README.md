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
`social` (search, friends, block, groups, private profiles), `help-wanted`
(post, offer, accept) and `mobile` (menu, no sideways scrolling, tap targets).

The frontend is served by `vite preview` on `:4173` with `/api` proxied to the
API on `:5000` — the same same-origin shape as production (Vercel proxies
`/api/*`), which is what makes the login cookie first-party.

## Running locally

1. Start MongoDB and the API from the `first-server` repo, on a **throwaway
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
(including video upload and the 30-second check), real AI generation, and
Openverse photo search. Those are covered by backend tests with the provider
mocked and by scripted live runs against production.
