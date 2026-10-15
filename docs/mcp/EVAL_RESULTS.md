# search_docs evaluation: results

End-to-end run against the production address (commit 40cc204), through the official MCP client against `https://www.creativesselect.com/api/mcp` on 2026-10-15, through the official MCP client (each call is in the server's audit log). 34 questions from `mcp/eval/golden.json`; the "baseline" column is a naive word-count scorer over the same passages.

| Measure | search_docs | Naive baseline |
|---|---|---|
| Right section in the top 3, direct questions | **19/20** | 13/20 |
| Right section in the top 3, paraphrased questions | **3/8** | 1/8 |
| Right section in the top 3, all in-scope (28) | **22/28** (79%) | 14/28 |
| Right section first, direct questions | 18/20 | — |
| Out-of-scope questions answered with nothing | **5/6** | 0/6 |
| Latency per call, median / 95th percentile (client side, over the internet) | 414 ms / 730 ms | — |

## Every question

| id | kind | question | expected | rank | baseline | top result | ms | audit id |
|---|---|---|---|---|---|---|---|---|
| d01 | direct | How do passkeys work and why can't they be typed into a fake page? | security-review › Passkeys | ✅ 1 | ✅ | Security review › 5.70 Passkeys: a login that can't be typed into a fake page | 589 | `c5f7f27d-87b4-4dda-8406-8636868e7f7b` |
| d02 | direct | How does two-step sign-in protect an account when the password is stolen? | security-review › Two-step sign-in | ✅ 1 | ❌ | Security review › 5.66 Two-step sign-in: a stolen password is no longer enough | 680 | `997e921f-6bb0-4a9d-a3d8-01461cb2f035` |
| d03 | direct | How are direct messages kept private between two people? | security-review › Direct messages | ✅ 1 | ❌ | Security review › 5.25 Direct messages: a new private channel between users | 367 | `b47fb75b-be33-4716-9a9d-df9b78d6238f` |
| d04 | direct | What does the weekly summary email contain and when is it sent? | architecture › weekly summary | ✅ 1 | ✅ | Security review › 5.92 Following topics and the weekly summary email | 601 | `ac39740d-5465-4655-8bd3-beef65bf36f8` |
| d05 | direct | How can a person download their own data? | security-review › Download my data | ✅ 1 | ❌ | Security review › 5.67 Download my data: giving people their own data without handing out anyone else's | 367 | `b95dcff3-4d52-4215-b5ee-ccfca125cd70` |
| d06 | direct | How do open calls work and who can answer one? | architecture › Open calls | ✅ 1 | ✅ | Architecture › Open calls — /api/calls (auth) | 446 | `12e23570-c449-44bf-920b-0db336c0ea22` |
| d07 | direct | Who can see a project room and what happens when someone leaves? | architecture › Project rooms | ✅ 1 | ❌ | Security review › 5.91 Project rooms: a private space made by a choice | 383 | `db825676-056f-4ed7-b7b7-de196be4d646` |
| d08 | direct | Why did a deleted account's sign-in keep working and how was it fixed? | security-review › Sessions weren't revalidated | ❌ miss | ❌ | Security review › 6. Operational incident: a stale DB hostname caused a production outage | 410 | `14261e6f-ade5-4187-a7b8-1d1ec49cfd71` |
| d09 | direct | How is login throttled against password guessing? | security-review › Nothing throttled login | ✅ 1 | ❌ | Security review › 5.14 Nothing throttled login, and the cross-site cookie had no CSRF defense | 391 | `81ab9015-dd55-43b8-8dde-d1d70ed12e48` |
| d10 | direct | How do invite links avoid becoming a way for strangers in? | security-review › Invite links | ✅ 1 | ✅ | Security review › 5.48 Invite links: friends by link, without a leaked link becoming a way in | 578 | `8b2ee2c4-23db-4ea0-aa6e-fe28aedeacbe` |
| d11 | direct | How does the moderation review queue let administrators handle reports? | security-review › moderation review queue | ✅ 1 | ✅ | Security review › 5.50 The moderation review queue: powerful tools that only the right people can reach, with a record | 439 | `05d9f88d-082a-49c7-adb9-5e9b43cc761c` |
| d12 | direct | How are push notifications sent and limited per person? | security-review › Push notifications | ✅ 1 | ✅ | Security review › 5.62 Push notifications: a message the server sends to an address someone else gave it | 423 | `617012e6-2a75-4afd-b5b6-f499de21bfdd` |
| d13 | direct | How does the CSverified badge get earned? | security-review › CSverified | ✅ 1 | ✅ | Security review › 5.60 The CSverified badge: a mark of trust that has to be hard to fake | 368 | `9c9a79b0-7f3e-46e0-bdb2-813c4b0dbfd6` |
| d14 | direct | How does Explore show hashtags without exposing private profiles? | architecture › Hashtags and Explore | ✅ 1 | ✅ | Security review › 5.82 Hashtags and Explore: a public view of public things | 812 | `b3d7137b-fa7c-40b4-a9f6-a2734a9ee40d` |
| d15 | direct | How is search protected against ReDoS and NoSQL injection? | security-review › ReDoS | ✅ 1 | ✅ | Security review › 5.3 NoSQL injection / ReDoS via unescaped search input | 390 | `b7576c4a-880a-4346-991e-681e340bb64c` |
| d16 | direct | Why didn't music play on iPhones? | security-review › Music didn't play on iPhones | ✅ 1 | ✅ | Security review › 5.30 Music didn't play on iPhones | 465 | `5a100de6-1609-4d89-a046-8a2d10e88c8d` |
| d17 | direct | How does opt-in profile views work? | security-review › Opt-in profile views | ✅ 2 | ❌ | Architecture › Link previews and the sitemap — /api/preview (public) | 389 | `bcef6331-aa68-4fda-b059-4e19a661604f` |
| d18 | direct | How does a scheduled post avoid being published twice? | architecture › Scheduled posts | ✅ 1 | ✅ | Security review › 5.94 Scheduled posts: a post that isn't one yet | 423 | `64ac59c4-d6e4-4f4f-84ab-80cdd8f5dc68` |
| d19 | direct | Who may embed a piece on another website? | architecture › Embedding | ✅ 1 | ✅ | Architecture › Embedding — /embed/piece/:id, /embed/profile/:username (public pages of the API) | 510 | `1e8c15a4-8f25-4e54-b98d-12d9ec21c5af` |
| d20 | direct | What does the MCP server offer and what are its tools? | architecture › MCP server | ✅ 1 | ✅ | API README › MCP server | 508 | `a4950fd1-2f10-48ee-b254-7cc0ab1ca0fe` |
| p01 | paraphrase | Could someone pretend to be another person by registering a name that differs only in capital letters? | security-review › Username case-sensitivity | ❌ miss | ❌ | Architecture › 7. Technical Decisions | 521 | `8202ae65-45b4-450d-ad58-0e7a8ffd4f85` |
| p02 | paraphrase | What keeps a stranger from getting into someone's account by trying lots of passwords? | security-review › Nothing throttled login | ❌ miss | ❌ | Architecture › 7. Technical Decisions | 402 | `31f515b2-8f37-47e3-8bb8-0bfed3c4cb99` |
| p03 | paraphrase | How does a person who forgot their password get back in without anyone else taking over the account? | security-review › Forgotten password | ✅ 1 | ❌ | Security review › 5.27 Forgotten password: an account-recovery path that must not become a takeover or an oracle | 397 | `bf98556e-e1e5-43dc-9045-baa4f88d19cc` |
| p04 | paraphrase | How do friends find out that somebody has started broadcasting audio? | security-review › Telling friends when someone goes live | ❌ miss | ❌ | Architecture › 3. Data Model | 413 | `e891aab7-0595-4140-9c4f-d2e5f2a9d6d2` |
| p05 | paraphrase | Can a leaked link let anybody join as a friend? | security-review › Invite links | ✅ 1 | ✅ | Security review › 5.48 Invite links: friends by link, without a leaked link becoming a way in | 395 | `93e0a6aa-9968-42b4-8657-0475366167e1` |
| p06 | paraphrase | Where do the pictures people upload end up, and why not on the server's own disk? | security-review › uploads on an ephemeral filesystem | ✅ 1 | ❌ | Security review › 5.1 Data loss: uploads on an ephemeral filesystem | 407 | `70c1b8ac-b14b-4f3f-80be-47c9924bc3f7` |
| p07 | paraphrase | What did the site do wrong about people leaving for good? | security-review › No way to delete an account | ❌ miss | ❌ | Security review › 5.60 The CSverified badge: a mark of trust that has to be hard to fake | 417 | `7a77c977-f619-41a0-a554-5ec90a80de42` |
| p08 | paraphrase | Is it safe to let other users put pictures into comments on my page? | security-review › Comments on pictures | ❌ miss | ❌ | Security review › 5.56 Richer comments: letting strangers put pictures and links on someone's page | 403 | `c9ddc990-09aa-427d-9f35-f32cd7dde69e` |
| o01 | out of scope | What is the capital of France? | nothing | ✅ empty | ❌ | (nothing) | 502 | `bdafd55d-c5f0-42d1-ae50-339706f69213` |
| o02 | out of scope | How do I bake sourdough bread at home? | nothing | ✅ empty | ❌ | (nothing) | 414 | `d02103d5-ed61-41b2-9dce-7bc62be8d3e2` |
| o03 | out of scope | Who won the 2022 football World Cup? | nothing | ✅ empty | ❌ | (nothing) | 730 | `7634493f-fd63-4b3d-8970-719c07685e79` |
| o04 | out of scope | What is the airspeed velocity of an unladen swallow? | nothing | ✅ empty | ❌ | (nothing) | 386 | `5a8dc7bd-b8ac-49b4-973e-e643bc0f9c75` |
| o05 | out of scope | How many employees work at CreativesSelect? | nothing | ❌ answered (1) | ❌ | Architecture › 7. Technical Decisions | 408 | `7ad533d7-da13-46ef-bd40-26c32515c199` |
| o06 | out of scope | What is the monthly price of a premium subscription? | nothing | ✅ empty | ❌ | (nothing) | 370 | `4ae1bbbf-d773-4144-a236-17b836f5cb91` |
