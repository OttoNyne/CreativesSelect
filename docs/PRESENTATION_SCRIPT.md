# Presentation Script — CreativesSelect

A timed outline for the ~10-minute recorded presentation. This is a script
to read from or adapt, not a transcript of a recording — the actual
screen-recording with your own voice is something only you can do; this is
here so you don't have to write it cold.

**Target: 9–10 minutes total.** Practice it once before recording — it's
easy to run long on the demo section.

---

## 0:00–1:30 — Value proposition (~1.5 min)

> "CreativesSelect is a social platform for creatives — think of it as a
> place where an artist, musician, or writer can build a profile that
> actually looks like *their* work, not a template. You pick your own
> colors, upload a wallpaper, build a portfolio grid, and get an AI assist
> when you want help writing a caption or generating an image.
>
> Alongside that, there's a public Help wanted board — because creatives constantly
> need a hand, and most social apps make you ask in a separate group chat. Here it's one
> login, one account, for both.
>
> The people this is for: creatives who want more self-expression than a
> generic feed gives them, without losing the normal social features —
> friends, groups for collabs, comments, notifications."

*(Show the login screen, then a profile page with a custom wallpaper/theme
as you say this — let the visual back you up.)*

## 1:30–5:30 — Live demo (~4 min)

Walk through one coherent user journey. Suggested path (adjust to what's
actually working smoothly on your machine at recording time):

1. **Sign up** a new account — point out the password field, mention it's
   hashed with bcrypt server-side (you don't need to show the hash, just say it).
2. **Land on the Feed**, write a post, optionally hit "Generate with AI" for
   the caption — show the AI-assisted badge that appears on the post.
3. **Go to Help wanted** — this is the full-CRUD resource (the tasks API
   underneath). Post a request, tick "Only me" on another to show it stays
   off the board, mark one resolved, delete one. Then show another user's
   request on the board and hit **Offer help** — they get a notification.
   Narrate: *"anyone can see public requests, but only the owner can edit
   or delete them, and that's enforced on the server, not just hidden in
   the UI."*
4. **Go to a profile, toggle Private on** (your own, in Edit Profile) —
   then, in a second browser tab or incognito window, show that a stranger
   visiting that profile gets "This profile is unavailable or private"
   instead of your content. This is the single most demo-able piece of the
   week's security work — use it.
5. **Groups**: create one, join/leave, show the member list.

*(Keep narration tight — say what you're clicking and why it matters, not
just "and now I'll click here.")*

## 5:30–8:00 — Architecture overview (~2.5 min)

> "Under the hood: React and Vite on the frontend, Express and MongoDB on
> the backend — one backend for the whole app, one login. Auth is a JWT in
> an httpOnly cookie, not stored in localStorage, so client-side script
> injection can't steal it.
>
> Every user-owned resource — Help wanted, posts, profile content — is scoped by
> owner on every query, not just filtered in the UI. That distinction
> mattered: I actually found and fixed a bug this week where a task could
> be reassigned to someone else's account by tampering with a request body,
> and separately, a set of routes that let a stranger read a private user's
> posts and portfolio without ever passing the profile's own privacy check.
> Both are fixed and covered in the security review doc, with the actual
> before/after requests."

*(Optionally show the system diagram from ARCHITECTURE.md on screen for a
few seconds while you say this — a picture here does real work.)*

## 8:00–9:30 — What's next (~1.5 min)

> "CI already runs the tests — 112 backend, 217 frontend unit and 102 browser — plus lint, the type-
> checked build and a dependency audit on every push, and the frontend only
> deploys when CI is green. If I kept building: the same for the backend
> everywhere, role-based
> access for group admins, and stronger input validation across the write
> routes — right now it's mostly on the auth routes. Login,
> signup, password changes and account deletion are already throttled and
> CSRF-protected, so next I'd add an on-demand "sign out everywhere" and
> browser-level end-to-end tests."

*(Pick 2–3 honestly, not a laundry list — the rubric wants a specific,
credible next-steps list, not padding.)*

## 9:30–10:00 — Close (~30 sec)

> "That's CreativesSelect — thanks for watching."

---

## Recording checklist

- [ ] Close unrelated browser tabs/notifications before recording
- [ ] Have a second account (or incognito window) ready for the privacy demo
- [ ] Confirm both servers are actually running before you hit record
- [ ] Time yourself once, unrecorded, first
- [ ] Stop at or before 10:00 — the rubric explicitly caps it
