# CreativesSelect

[![GitHub Repo](https://img.shields.io/badge/GitHub-CreativesSelect-181717?logo=github)](https://github.com/OttoNyne/CreativesSelect)
[![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red)](LICENSE)

A social platform for creatives — customizable profiles, friend connections, testimonials, groups/collabs, on-request AI assistance (writing + image generation) for content creation, and a personal Tasks tool, all behind one login.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system diagram, data model, API reference, and component tree, and [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) for the security audit and penetration-testing writeup.

## Stack

- **Backend**: Node + Express + Mongoose + MongoDB, JWT (httpOnly cookie) auth — lives in a sibling repo, [`first-server`](https://github.com/OttoNyne/first-server)
- **Frontend**: Vite + React + TypeScript, React Router, Tailwind CSS — this repo, `frontend/`

The backend used to be a separate Node + Express + TypeScript + Prisma/SQLite
service in `backend/`. It's since been consolidated into `first-server`
(Express + Mongoose/MongoDB) so the whole app — the original social features
plus a Tasks tool — runs on one backend, one database, one login. The old
`backend/` folder is no longer used and isn't part of the running app.

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

Automated tests (auth + Tasks CRUD) live in the backend repo:

```bash
cd ../first-server
npm test
```

## Demo accounts

Create an account via the Sign Up page — there's no seed script for the
Mongo-backed setup yet. All accounts created during development use the
password `password123` by convention, but that's just a habit, not a
requirement.

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
- **Text** (captions, bios) is still the mock provider; only images are real.
  The wallpaper "Live (animated)" option only affects the mock's gradients —
  a real generated image can't animate.

Wallpaper selection also has a "Search photos" option that queries
[Openverse](https://openverse.org) for openly-licensed images matching what
you type. This is real search too — it makes a live outbound request and
needs no API key.
