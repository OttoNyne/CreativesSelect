# search_docs evaluation: results

End-to-end run on a local instance of the same code (commit 40cc204), through the official MCP client; the production deploy is still pending against `http://localhost:5000/api/mcp` on 2026-10-14, through the official MCP client (each call is in the server's audit log). 34 questions from `mcp/eval/golden.json`; the "baseline" column is a naive word-count scorer over the same passages.

| Measure | search_docs | Naive baseline |
|---|---|---|
| Right section in the top 3, direct questions | **19/20** | 13/20 |
| Right section in the top 3, paraphrased questions | **3/8** | 1/8 |
| Right section in the top 3, all in-scope (28) | **22/28** (79%) | 14/28 |
| Right section first, direct questions | 18/20 | — |
| Out-of-scope questions answered with nothing | **5/6** | 0/6 |
| Latency per call, median / 95th percentile (client side, over the internet) | 25 ms / 45 ms | — |

## Every question

| id | kind | question | expected | rank | baseline | top result | ms | audit id |
|---|---|---|---|---|---|---|---|---|
| d01 | direct | How do passkeys work and why can't they be typed into a fake page? | security-review › Passkeys | ✅ 1 | ✅ | Security review › 5.70 Passkeys: a login that can't be typed into a fake page | 305 | `03c91c78-38cb-438b-b9df-2341357fe563` |
| d02 | direct | How does two-step sign-in protect an account when the password is stolen? | security-review › Two-step sign-in | ✅ 1 | ❌ | Security review › 5.66 Two-step sign-in: a stolen password is no longer enough | 45 | `23f2df49-71e6-4c8b-a1be-d909e9038d70` |
| d03 | direct | How are direct messages kept private between two people? | security-review › Direct messages | ✅ 1 | ❌ | Security review › 5.25 Direct messages: a new private channel between users | 28 | `220e4843-da41-45d1-9b4f-77bd7d0c9bea` |
| d04 | direct | What does the weekly summary email contain and when is it sent? | architecture › weekly summary | ✅ 1 | ✅ | Security review › 5.92 Following topics and the weekly summary email | 35 | `e8a6aceb-a4f5-4da2-a2af-03b88b7180cb` |
| d05 | direct | How can a person download their own data? | security-review › Download my data | ✅ 1 | ❌ | Security review › 5.67 Download my data: giving people their own data without handing out anyone else's | 21 | `a97efe4a-0832-4b15-ba03-01ddd82c7814` |
| d06 | direct | How do open calls work and who can answer one? | architecture › Open calls | ✅ 1 | ✅ | Architecture › Open calls — /api/calls (auth) | 27 | `bae7faea-017c-4c96-abbf-45dbcefb5415` |
| d07 | direct | Who can see a project room and what happens when someone leaves? | architecture › Project rooms | ✅ 1 | ❌ | Security review › 5.91 Project rooms: a private space made by a choice | 37 | `9ac4c71f-a47e-4701-a210-ca63d118f4ab` |
| d08 | direct | Why did a deleted account's sign-in keep working and how was it fixed? | security-review › Sessions weren't revalidated | ❌ miss | ❌ | Security review › 6. Operational incident: a stale DB hostname caused a production outage | 37 | `9f2fd19c-d74a-46e6-808d-ad8015d76dfb` |
| d09 | direct | How is login throttled against password guessing? | security-review › Nothing throttled login | ✅ 1 | ❌ | Security review › 5.14 Nothing throttled login, and the cross-site cookie had no CSRF defense | 23 | `bb0ff9b2-9436-444d-9d60-ea53fffb2a1c` |
| d10 | direct | How do invite links avoid becoming a way for strangers in? | security-review › Invite links | ✅ 1 | ✅ | Security review › 5.48 Invite links: friends by link, without a leaked link becoming a way in | 20 | `b33488b0-ddf7-4138-8442-22f0b4679d3c` |
| d11 | direct | How does the moderation review queue let administrators handle reports? | security-review › moderation review queue | ✅ 1 | ✅ | Security review › 5.50 The moderation review queue: powerful tools that only the right people can reach, with a record | 18 | `7f61d998-02f2-416e-a5f5-1a476a7498c6` |
| d12 | direct | How are push notifications sent and limited per person? | security-review › Push notifications | ✅ 1 | ✅ | Security review › 5.62 Push notifications: a message the server sends to an address someone else gave it | 29 | `886ac010-0d85-4395-ac66-dad3c0c2641d` |
| d13 | direct | How does the CSverified badge get earned? | security-review › CSverified | ✅ 1 | ✅ | Security review › 5.60 The CSverified badge: a mark of trust that has to be hard to fake | 27 | `79565117-bf7a-4c75-9253-7306ba943c66` |
| d14 | direct | How does Explore show hashtags without exposing private profiles? | architecture › Hashtags and Explore | ✅ 1 | ✅ | Security review › 5.82 Hashtags and Explore: a public view of public things | 30 | `afae4c4a-c9e7-46d6-ac3d-7a9cfb52e4eb` |
| d15 | direct | How is search protected against ReDoS and NoSQL injection? | security-review › ReDoS | ✅ 1 | ✅ | Security review › 5.3 NoSQL injection / ReDoS via unescaped search input | 27 | `b7dd7aa1-3b1a-491c-99d8-5382224db29b` |
| d16 | direct | Why didn't music play on iPhones? | security-review › Music didn't play on iPhones | ✅ 1 | ✅ | Security review › 5.30 Music didn't play on iPhones | 23 | `2dcec720-9ef3-4d48-9970-1852c189eade` |
| d17 | direct | How does opt-in profile views work? | security-review › Opt-in profile views | ✅ 2 | ❌ | Architecture › Link previews and the sitemap — /api/preview (public) | 28 | `fa312c25-88be-45ec-9cd0-b13b4104c9c3` |
| d18 | direct | How does a scheduled post avoid being published twice? | architecture › Scheduled posts | ✅ 1 | ✅ | Security review › 5.94 Scheduled posts: a post that isn't one yet | 19 | `5223856b-8acb-4fb9-ba7b-e88363bedf16` |
| d19 | direct | Who may embed a piece on another website? | architecture › Embedding | ✅ 1 | ✅ | Architecture › Embedding — /embed/piece/:id, /embed/profile/:username (public pages of the API) | 16 | `26529f0d-589e-4168-afb0-03e1bb14abd4` |
| d20 | direct | What does the MCP server offer and what are its tools? | architecture › MCP server | ✅ 1 | ✅ | API README › MCP server | 19 | `11401543-ea1d-4a5e-96cd-b0e338d1eb12` |
| p01 | paraphrase | Could someone pretend to be another person by registering a name that differs only in capital letters? | security-review › Username case-sensitivity | ❌ miss | ❌ | Architecture › 7. Technical Decisions | 20 | `62330ea8-9048-46da-a478-2085759a755f` |
| p02 | paraphrase | What keeps a stranger from getting into someone's account by trying lots of passwords? | security-review › Nothing throttled login | ❌ miss | ❌ | Architecture › 7. Technical Decisions | 25 | `59e751eb-7713-419a-a9a9-aedf69198011` |
| p03 | paraphrase | How does a person who forgot their password get back in without anyone else taking over the account? | security-review › Forgotten password | ✅ 1 | ❌ | Security review › 5.27 Forgotten password: an account-recovery path that must not become a takeover or an oracle | 21 | `f17fe0e7-7e09-415f-ba71-816169fae2c5` |
| p04 | paraphrase | How do friends find out that somebody has started broadcasting audio? | security-review › Telling friends when someone goes live | ❌ miss | ❌ | Architecture › 3. Data Model | 28 | `a8178ca0-c0c7-4c4c-b9aa-f0881d39308c` |
| p05 | paraphrase | Can a leaked link let anybody join as a friend? | security-review › Invite links | ✅ 1 | ✅ | Security review › 5.48 Invite links: friends by link, without a leaked link becoming a way in | 15 | `57cad015-a520-4ea9-9551-48d740faef19` |
| p06 | paraphrase | Where do the pictures people upload end up, and why not on the server's own disk? | security-review › uploads on an ephemeral filesystem | ✅ 1 | ❌ | Security review › 5.1 Data loss: uploads on an ephemeral filesystem | 22 | `deee8e7e-595d-4d40-b2ca-ab8ca10fb0ae` |
| p07 | paraphrase | What did the site do wrong about people leaving for good? | security-review › No way to delete an account | ❌ miss | ❌ | Security review › 5.60 The CSverified badge: a mark of trust that has to be hard to fake | 37 | `4d21c3ba-f0c9-4a8e-9c8c-b05b12e855d0` |
| p08 | paraphrase | Is it safe to let other users put pictures into comments on my page? | security-review › Comments on pictures | ❌ miss | ❌ | Security review › 5.56 Richer comments: letting strangers put pictures and links on someone's page | 21 | `28a9a839-a5d9-4787-ae03-67f1084f3b52` |
| o01 | out of scope | What is the capital of France? | nothing | ✅ empty | ❌ | (nothing) | 15 | `5c20bfdc-02a9-46d1-81d1-5d2cb5e0c3fa` |
| o02 | out of scope | How do I bake sourdough bread at home? | nothing | ✅ empty | ❌ | (nothing) | 20 | `c103027b-719c-4ff3-b399-98080bcc78fb` |
| o03 | out of scope | Who won the 2022 football World Cup? | nothing | ✅ empty | ❌ | (nothing) | 30 | `6d23f3df-6a27-49f7-94b3-acc6ce82d455` |
| o04 | out of scope | What is the airspeed velocity of an unladen swallow? | nothing | ✅ empty | ❌ | (nothing) | 31 | `5664f036-3a1e-46cc-9f63-df07650e7c98` |
| o05 | out of scope | How many employees work at CreativesSelect? | nothing | ❌ answered (1) | ❌ | Architecture › 7. Technical Decisions | 23 | `f1fb0976-c04d-44b7-9b84-ca3672225eac` |
| o06 | out of scope | What is the monthly price of a premium subscription? | nothing | ✅ empty | ❌ | (nothing) | 15 | `2a3de633-209b-4bf0-9f26-952d72bc75d7` |
