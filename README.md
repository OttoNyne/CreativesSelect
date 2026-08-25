# CreativesSelect

[![GitHub Repo](https://img.shields.io/badge/GitHub-CreativesSelect-181717?logo=github)](https://github.com/OttoNyne/CreativesSelect)

A social platform for creatives — customizable profiles, friend connections, testimonials, groups/collabs, and on-request AI assistance (writing + image generation) for content creation.

## Stack
- **Backend**: Node + Express + TypeScript, Prisma + SQLite, JWT (httpOnly cookie) auth
- **Frontend**: Vite + React + TypeScript, React Router, Tailwind CSS

## First-time setup

```bash
# Backend
cd backend
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run seed

# Frontend (new terminal, from repo root)
cd frontend
npm install
cp .env.example .env
```

## Running the app

From the repo root (runs both servers):

```bash
npm install
npm run dev
```

Backend: http://localhost:4000
Frontend: http://localhost:5173

## Demo accounts

After seeding, log in with any of the seeded users (see `backend/prisma/seed.ts` for the list) — all use the password `password123`.

## AI features

Content creation (post captions, bios, avatar/banner images) includes on-request "Generate with AI" actions. These are currently backed by a mock provider (`backend/src/services/ai/MockAIProvider.ts`) so the app runs with zero API keys. To wire up a real provider, implement `ClaudeAIProvider.ts` and set `AI_PROVIDER=real` in `backend/.env`.
