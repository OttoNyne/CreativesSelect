# Value memo: the CreativesSelect MCP server

14 October 2026. What this is worth, with one number I will stand behind, and what else could explain it.

## The claim

> **For questions about how CreativesSelect is built and secured, the MCP server's `search_docs` tool returns the section that answers it in its top three results 79% of the time (22 of 28 questions), against 50% (14 of 28) for a plain word-count search over the same text, and returns nothing for 5 of 6 questions the documents don't cover. A call took a median of 414 ms (95th percentile 730 ms) over the internet against the production address, and costs nothing extra to run.**

That is a statement about the *search*. It is the only number in this memo that was measured, and the measurement is in `EVAL_REPORT.md`.

## What it is for

An AI assistant (or a reviewer using one) can ask "how are scheduled posts published exactly once?" and be handed the section of the security review that says so, with a link to cite, instead of reading about 400 KB of documents. It can also look up public creators and pieces. Nobody is using it yet apart from the tests and the evaluation runs, so there is no usage data and **no realised value to report: this memo is about what the measured quality would be worth, not what it has been worth.**

## What it costs

| Cost | Amount | Basis |
|---|---|---|
| Running it | **$0 extra** | It runs inside the existing API on the free tier; no new service, no model calls, no paid search |
| Building it | Roughly one working session for the server, its tests and this evaluation | My own time |
| Keeping it | The evaluation has to be rerun when the documents change a lot; the audit log needs an occasional look | Small, not measured |
| Risk | A new public, unauthenticated endpoint | Read-only, public data only, rate-limited, logged, with an off switch (`AUTONOMY_JUSTIFICATION.md`, `ROLLBACK_EVIDENCE.md`) |

## What the number is worth (an estimate, not a measurement)

If a person or assistant would otherwise find the answer by searching the documents by hand, a lookup that finds the right section in the top three saves the searching. I have **not** timed anyone doing it by hand, so the saving below is an assumption you should replace with a measurement:

| Assumption | Value used | Result |
|---|---|---|
| Lookups per month | 20 | |
| Minutes to find a section by hand | 4 | |
| Share found in the top three | 79% (measured) | ≈ **63 minutes a month** |
| Compared with a plain word-count search at 50% | 4 minutes × 20 × (79% − 50%) | ≈ **23 minutes a month** more than the naive search finds |

At those assumptions this is worth about an hour a month. That is small, and it is honest to say so: this is a capstone-sized tool, and its value is in showing the pattern works, being checkable, and giving assistants a safe way into the site's public information, not in a large time saving.

## What else could explain the number besides the AI

The first thing to say is that **there is no AI in the search**. The server is keyword search with scoring; the "AI" is whatever assistant calls it. So the number is not evidence that AI helps. The things that could be producing 79%:

1. **The documents are well structured, and I wrote them.** Every section has a descriptive heading that uses the words someone would ask with ("Passkeys: a login that can't be typed into a fake page"). A messier set of documents would score lower with the same code.
2. **I wrote the questions too.** They were fixed before the first run, but by someone who had read the documents. A stranger's questions are likely harder. The paraphrase set, which I wrote to be hard, scores 3 of 8 (38%): that is the better guide to what an unfamiliar person would experience.
3. **The corpus is small.** The top three of 174 sections is a generous test; at 10,000 sections the same search would do worse.
4. **A simple search already gets most of the way.** The naive word count gets 50%. About two thirds of the hits (14 of 22) would be there without any of the work. What the design adds is the other 8 questions and, more importantly, knowing when not to answer (0 of 6 out-of-scope questions abstained correctly with the naive search, 5 of 6 with this one).
5. **Top three is not "answered".** Finding the section is not the same as the assistant using it correctly, and that part is not measured.
6. **Twenty-eight is a small number.** The 95% interval on 22 of 28 runs from about 60% to 90%.
7. **I relabelled seven questions once.** They have two correct sections across the two documents; I accepted both after seeing the first run, and disclosed it. Under the original single labels v0 scored 20 of 28 and v1 20 of 28.
8. **It may be the novelty of an easy test.** Nothing here compares with another system (an embedding search, another vendor's tool); the only comparison is a deliberately weak baseline.

## What would make me trust the value more
- Questions from real use (the audit log keeps what was asked) rather than ones I wrote.
- Someone else's questions: five colleagues writing ten each.
- A timed manual lookup to replace the 4-minute assumption.
- A comparison with the embedding search the decision record rejected, run on the same questions.

## Recommendation
Keep the server. It is nearly free to run, it is safe by construction, and it produces a checkable record. Do not claim it saves meaningful time until the manual lookup is timed and real questions are logged.
