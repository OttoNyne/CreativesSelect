# CreativesSelect

[![GitHub Repo](https://img.shields.io/badge/GitHub-CreativesSelect-181717?logo=github)](https://github.com/OttoNyne/CreativesSelect)
[![CI](https://github.com/OttoNyne/CreativesSelect/actions/workflows/ci.yml/badge.svg)](https://github.com/OttoNyne/CreativesSelect/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red)](LICENSE)

A social platform for creatives — customizable profiles, friend connections, testimonials, friends-only direct messages, groups/collabs, on-request AI assistance (writing + image generation) for content creation, and a public **Help wanted** board where creatives post requests and offer to help each other (the `/api/tasks` resource), all behind one login.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system diagram, data model, API reference, and component tree, and [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) for the security audit and penetration-testing writeup.

## Stack

- **Backend**: Node + Express + Mongoose + MongoDB, JWT (httpOnly cookie) auth — lives in a sibling repo, [`first-server`](https://github.com/OttoNyne/first-server)
- **Frontend**: Vite + React + TypeScript, React Router, Tailwind CSS — this repo, `frontend/`

The backend used to be a separate Node + Express + TypeScript + Prisma/SQLite
service in `backend/`. It's since been consolidated into `first-server`
(Express + Mongoose/MongoDB) so the whole app — the original social features
plus a Help wanted board — runs on one backend, one database, one login. The old
`backend/` folder has been removed from this repo.

## First-time setup

```bash
# Backend (separate repo, sibling directory to this one)
git clone https://github.com/OttoNyne/first-server ../first-server
cd ../first-server
npm install
cp .env.example .env   # then fill in MONGODB_URI and JWT_SECRET

# Frontend (from this repo)
cd frontend
npm install
cp .env.example .env
```

## Running the app

From this repo's root (runs both servers, assuming `first-server` is checked
out as a sibling directory — see `package.json`'s `dev` script):

```bash
npm install
npm run dev
```

Backend: http://localhost:5000
Frontend: http://localhost:5173

## Running tests

Automated tests (auth + Help wanted / tasks CRUD) live in the backend repo:

```bash
cd ../first-server
npm test
```

Frontend unit tests (Vitest + Testing Library, API layer mocked) live next to the
code as `*.test.ts(x)` and cover every page and nearly every component:

```bash
cd frontend
npm test
```

Browser end-to-end tests (Playwright — desktop Chrome, desktop Safari's engine and an
iPhone-sized Safari engine, against a real API and database) live in `frontend/e2e`; see
[`frontend/e2e/README.md`](frontend/e2e/README.md) for running them locally:

```bash
cd frontend
npx playwright install chromium webkit   # once
npm run e2e                               # needs the API running on :5000 (see the e2e README)
```

Both repos also run their tests, the browser tests, lint, the type-checked build and
`npm audit` in GitHub Actions on every push and pull request; the frontend deploy waits for
all of them.

## Use it on your phone

CreativesSelect is a web app — open the site in your phone's browser; there's nothing to download.
You can install it to your home screen so it opens full-screen like an app:

- **iPhone/iPad (Safari):** tap Share → **Add to Home Screen**.
- **Android (Chrome):** menu → **Install app** / **Add to Home screen**.

The API is reached through the site's own domain (`/api/...`, proxied by Vercel in
`frontend/vercel.json`), which keeps the login cookie first-party — required on iOS.

## Demo accounts

Create an account via the Sign Up page — there's no seed script for the
Mongo-backed setup yet. Passwords must be at least 8 characters, and you can change your password or delete your account from your profile's edit panel.

## AI features

Content creation includes on-request "Generate with AI" actions. What backs
them depends on the kind:

- **Images** (post images, portfolio pieces, wallpapers) are **really
  generated** from your description by
  [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
  (FLUX.1 schnell) whenever the backend has `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_API_TOKEN` set — see
  `first-server/services/ai/CloudflareAIProvider.js`. Results are stored on
  Cloudinary. Each user is capped at 10 generated images per hour, since the
  free daily allowance is shared by everyone. Without those two variables the
  app falls back to `MockAIProvider`, which only hashes your text into a
  color gradient (it never looks at what you asked for) — fine for local
  development with zero API keys.
- **Text** (captions, bios, blurbs) is really generated too, by Llama 3.1 8B
  on the same Cloudflare account, capped at 30 per user per hour. Without the
  credentials it falls back to canned templates.

Wallpaper selection also has a "Search photos" option that queries
[Openverse](https://openverse.org) for openly-licensed images matching what
you type. This is real search too — it makes a live outbound request and
needs no API key.
