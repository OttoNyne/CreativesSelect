# CreativesSelect compared with MySpace: what is covered, what is missing, what to improve

Checked on 4 October 2026 against the code in both repositories (routes, models, pages) and against published descriptions of
what MySpace was known for (sources at the end). "Done" means built, tested and live.

## 1. Feature-by-feature

| What MySpace was known for | CreativesSelect today | Verdict |
|---|---|---|
| A profile you design yourself | Colours, fonts, layout style, wallpaper (picture, video, AI-made, with motion), rearrangeable and hideable sections | **Done, in a safer form.** MySpace allowed raw HTML/CSS; this site deliberately offers structured controls instead (see 3.9) |
| Top 8 friends | Top friends (up to 8, chosen by you) | Done. Drag-to-reorder is missing |
| Profile comments from visitors | Testimonials (the guestbook) | Done. No pictures or links in comments |
| Blog | Blog entries (title, paragraphs, friends notified) | Done. **No comments on entries** |
| Bulletins to all friends | Bulletins (friends only, expire in 10 days, unread badge) | Done. Cannot be edited |
| Photos and albums | Portfolio with albums; likes and dislikes | Done. **No comments on pictures** |
| Videos | Portfolio videos, 30-second limit | Partly (the limit is a deliberate storage-cost choice) |
| Music on your page / artist pages | A playlist of up to 5 tracks (upload or YouTube), a now-playing bar, "listening to" line | **Partly.** Few tracks, no play counts, no artist/band page, no "profile song" |
| Mood and "now playing" | Mood and "listening to" (can use what's playing) | Done |
| Groups and forums | Groups with chat, and a board of topics and replies | Done. No reply notifications, no editing |
| Private messages | Direct messages between friends, unread counts | Done. No attachments, no editing |
| Instant messaging / chat | Group chat, voice Live (up to 100 listeners, guests on stage) | Done (more than MySpace had, in audio) |
| "Who's online" | Online now / active today for friends (can be switched off) | Done |
| Who viewed my profile | Opt-in on both sides, shows days not times | Done |
| Events | Scheduled lives with reminders | **Partly.** Only for lives; no general events (place, RSVP, guest list) |
| Classifieds | Help wanted board (requests and offers) | Done |
| Finding people | Search by name and username, browse by tag, newest creatives | Partly (see 3.13) |
| Inviting friends | Invite links and QR codes (limited, revocable) | Done |
| Welcoming new people (Tom as everyone's first friend) | Getting-started checklist on the feed | Partly. No welcome message or default first friend |
| Interests sections (About me, Music, Movies, Books, "Who I'd like to meet") | A bio, a mood line and up to 8 tags | **Missing** |
| Location, age, birthdays | None, on purpose | Missing by choice (privacy); could be opt-in |
| Polls and surveys | None | Missing (low value) |

## 2. Things MySpace never had that this site has

AI pictures, text and live wallpapers; voice Live with a stage; scheduled lives; QR sharing; blocking and reporting; email
confirmation and password reset; mutual-consent profile views; account deletion that removes everything; an installable web
app; automated contrast checks and about 1,950 automated tests (526 backend, 971 frontend, 453 browser runs across three browsers).

## 3. Improvements to make, in the order recommended

### A. Safety and running the site (do these before adding more features)

1. **Reports have nowhere to go.** `POST /api/reports` saves a report, but there is no way to list, read or act on one: no
   admin role, no review screen, no way to hide content or suspend an account. There are now eight kinds of thing that can be
   reported. This is the biggest gap. Needs: an admin role, a review queue, actions (dismiss, remove the content, warn,
   suspend), and a note to the reporter. **Effort: medium.**
2. **Long lists are not paged.** The feed shows the newest 50 posts and stops; a profile's post list has no limit at all
   (`Post.find({ author })` with no `.limit`), so a prolific account makes its profile slower and slower. Notifications stop at 50.
   Needs: "Show more" on the feed, a limit and paging on profile posts, and a way to see older notifications. **Effort: small.**
3. **Most things cannot be edited.** Only blog entries and Help wanted requests can be changed. Posts, comments, bulletins,
   board topics and replies, testimonials and messages can only be deleted and rewritten. Needs: edit with an "(edited)" mark
   and a short edit window for messages. **Effort: small to medium.**
4. **Nothing arrives by email except the confirmation and password-reset links.** Friend requests, messages, live
   reminders, board replies and invitations are visible only if the person opens the site. Needs: opt-in email notifications
   or a digest, with one switch per kind. **Blocker for you:** Resend needs a verified sending domain before it can mail
   anyone other than the owner. **Effort: medium.**
5. **No notification when someone replies.** A reply on a board topic, a testimonial on your profile (this one exists), a
   comment on your blog entry (comments do not exist yet) and a reply to your comment are not announced. **Effort: small.**

### B. What still makes MySpace feel like MySpace

6. **Comments on pictures, videos and blog entries.** Today a piece can only be liked or disliked. Comments are the main way
   people talk on a creative's work. Reuse the post-comment pieces. **Effort: medium.**
7. **Events.** Generalise scheduled lives into events: a title, time, optional place or link, RSVP (going / maybe), a guest
   list for friends, reminders. Live is then one kind of event. **Effort: medium.**
8. **Music that can carry a profile.** Raise the 5-track cap (with a storage plan), count plays, and add a "profile song".
   MySpace auto-played it. Auto-play should not be copied (browsers block it, and it is hostile to people using screen readers
   or on data plans); offer a "play my song" button that opens the page ready to play. A band/artist profile type is a larger
   step. **Effort: medium.**
9. **More ways to make a profile your own, without raw HTML.** Raw HTML and CSS let people attack each other (scripts,
   hidden links, covering the page). A safe middle: layout presets, more theme controls (borders, section styles, fonts), and
   sanitised custom CSS limited to colours, fonts, spacing and backgrounds. **Effort: medium to large.**
10. **"About me" sections:** interests, favourite music, films and books, "who I'd like to meet", plus optional location and
    birthday (off by default, shared with friends only), with friend birthday reminders. **Effort: small to medium.**
11. **Friend features:** mutual friends on a profile, "people you may know", friend groups or lists, drag-to-reorder for Top
    friends, and a welcome message (or an official first friend) for new accounts. **Effort: medium.**
12. **Richer comments:** pictures, GIFs and links in testimonials, with the same safety checks as portfolio pictures. **Effort: small.**
13. **Better search:** it matches only username and display name (and tags through browse). Add search across blog entries,
    groups, board topics and Help wanted, filters, and an order that favours people you share friends with. **Effort: medium.**

### C. Quality and reliability notes from building and testing

14. **Everything updates by polling** (notifications and unread counts every 30–60 seconds, live signals about every second),
    because the host (Vercel) does not carry WebSockets. Fine at this size; at larger scale consider server-sent events or a
    small push service.
15. **Push notifications on phones** do not exist (the site installs as a web app but cannot alert you).
16. **Security extras people expect:** two-factor sign-in, a list of signed-in devices with "sign out this one", sign-in alerts,
    and "download my data". Account deletion already works.
17. **Local browser tests are flaky on this machine** (slow sign-ups reaching the cloud database); CI is clean. Running the
    local tests against a local MongoDB would make them dependable.
18. **Videos are limited to 30 seconds** and pictures to 10 MB by the free storage plan; longer work needs a paid plan or a
    different host.
19. **Languages:** the site is English only; right-to-left and translation are not started.

## 4. Suggested next three

1. The moderation review queue (item 1), because reports are being collected that nobody can act on.
2. Paging and editing (items 2 and 3), small and visible.
3. Comments on pictures and blog entries, with reply notifications (items 5 and 6), the biggest social gap left.

## Sources

- [MySpace Profile: Complete Guide, Features, Customization](https://bicimag.com/myspace-profile/)
- [Myspace Customization: Why Profiles Felt Personal](https://simplysoundadvice.com/myspace-customization-but-better/)
- [MySpace and the Coding Legacy it Left Behind (Codecademy)](https://www.codecademy.com/resources/blog/myspace-and-the-coding-legacy)
- [Did MySpace Kill the Potential for Customization on Social Media? (Tedium)](https://tedium.co/2020/07/14/social-media-customization-failings/)
- [How To: Add Music to your MySpace Page (Digital Trends)](https://www.digitaltrends.com/mobile/how-to-add-music-to-your-myspace-page/)
