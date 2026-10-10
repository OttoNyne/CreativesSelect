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
`social` (search, friends, block, groups, private profiles), `messages` (direct messages and group chat), `password-reset` (the emailed link, end to end), `live` (voice rooms, incl. real audio between two Chrome windows, and friends being told when someone goes live), `post-picture` (shape, zoom and placement of a post's picture), `install-banner` (the iPhone-only Add to Home Screen prompt), `email-verification` (the emailed confirmation link, end to end), `info-pages` (About, Features, How it works and the footer), `work` (opening up to work, searching only those open, asking for work and answering, withdrawing), `save-share` (saving a post and a piece to the private list, taking them out, sharing a post with your own words, the original inside, "not available" once the owner goes private, and Arabic), `explore` (a #hashtag as a link, a topic's posts and pieces for anyone, trending, searching a topic, private profiles left out, Explore in the menu, and in Arabic), `follow` (following a public profile, its posts reaching the feed, the person being told, the owner's lists, no Follow button where it doesn't apply, and the page in Arabic), `alt-text` (describing a picture when posting and afterwards, shown to screen readers, in Arabic), `replies` (a reply under its comment, the person answered being told, the notice opening the reply, a reply to a reply, in Arabic), `pinned` (pinning a post and featuring a piece, seen by visitors and taken down again, one at a time, in Arabic), `polls` (asking a poll from the feed, voting once and seeing the results, the form's two-option rule, in Arabic), `process` (adding and ordering the steps behind a piece, a visitor walking through them to the finished piece, in Arabic), `calls` (posting an open call, the person it fits being told, answering with a piece, being chosen with a note, closing, the suggestions, a private owner's call being gone, in Arabic), `reporting` (reporting someone else's post, piece, step, call and answer, and none of it on your own, in Arabic), `projects` (a room opening when someone is chosen, chatting and the checklist between two people, archiving, leaving, removing, a stranger turned away, in Arabic), `scheduled` (scheduling from the feed, the waiting list kept out of everyone's feed, changing and publishing now, taking one back, a post going out by itself when its time comes, in Arabic), `embed` (allowing embedding and copying the code, a real second website framing the card, the card being the same bare page once switched off or private, the profile card, in Arabic), `critique` (asking for feedback from a piece, giving two notes, a third person seeing only the count, the maker reading, thanking and closing, changing and removing notes, a hidden request, in Arabic), `topics` (following a topic, From your topics, the weekly summary setting, the unsubscribe page, in Arabic), `muting` (muting a person from their profile and from the list in settings, muted words as whole words, Explore and the bell, in Arabic), `whole-pictures` (tall and wide feed pictures and wallpapers shown whole, not cut off), `mentions` (typing @ in a post and a comment, choosing from the list with the mouse and keyboard, the link in the text, the person being told and taken to the post, and the list in Arabic), `challenge` (the weekly challenge: the prompt for people who aren't signed in, entering and withdrawing a piece, ordering the gallery by what people loved, a private profile being asked to go public, and the page in Arabic and Spanish), `preview` (the shared profile link's preview page, the visitor's invitation to join, and listing in the sitemap and search engines only by choice), `credits` (crediting a friend on a piece, accepting, declining and removing, and the collaborations on their profile), `languages` (the footer's language box, the page mirrored for Arabic, the server's messages in each language, and every page fitting the screen and readable in Spanish and Arabic), `help-wanted`
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
