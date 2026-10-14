# Evaluation report: the MCP server's documentation search

14 October 2026. What was measured, the **baseline number**, what changed, and how far the numbers can be trusted.

## The number

> **Baseline: 21 of 28 in-scope questions (75%) get the right section in the top three results, and 2 of 6 out-of-scope questions are correctly answered with nothing.**

After one round of changes that was decided before the second run (BM25 scoring and a coverage rule): **22 of 28 (79%)** and **5 of 6**. A deliberately naive word-count search over the same passages scores **14 of 28 (50%)** and **0 of 6**.

The 95% interval on 22 of 28 is roughly **60% to 90%** (Wilson): 28 questions is a small set, so the difference between 75% and 79% is one question and is not evidence of an improvement by itself. The difference from the naive search (50%, interval roughly 33% to 67%) and the change in out-of-scope handling (2 of 6 to 5 of 6) are the findings that stand.

## What is measured

The server has four tools. Three are plain database lookups whose correctness is a matter of rules (public only, no email, same error for private and missing), which are covered by automated tests (15 tests in `tests/mcp.test.js`). The fourth, `search_docs`, *ranks* passages of the project's documents for a question, and ranking quality is something tests can't settle, so that is what this report evaluates.

**Corpus.** 174 sections cut from three documents: the architecture notes (54 sections), the security review (110) and the API README (10), about 400 KB.

**Questions.** 34, in `mcp/eval/golden.json`:

| Kind | Count | What it tests | Pass means |
|---|---|---|---|
| direct | 20 | The question uses the documents' own words | The section that answers it is in the top 3 |
| paraphrase | 8 | The question says the same thing in other words | Same |
| out of scope | 6 | The documents don't cover it (capital cities, bread, football…) | The tool returns **nothing** |

A question passes if any of the top three passages is in the named document and its heading contains the named words. Seven questions that are written up in both documents list the second document's section as acceptable too (the `alt` entries).

**Measures.** *hit@3*: the right section is among the first three results. *hit@1*: it is the first. *abstention*: an out-of-scope question returns an empty list. Latency is the time the client waited for each call.

**Baselines.** The "naive" search counts how many of the question's own words (no stop words, no stemming, no weighting) appear in a section and returns the top three. It uses the same sections as the real search, so the difference is only the scoring.

## Results

All three scored on the same 34 questions and the same passages (`mcp/eval/` and `scripts/mcp-eval.mjs`):

| | Naive word count | **Baseline v0** (commit `a79dbae`) | v1 (commit `40d393f`) |
|---|---|---|---|
| Direct, right section in top 3 | 13 / 20 | **19 / 20** | 19 / 20 |
| Direct, right section first | — | 18 / 20 | 18 / 20 |
| Paraphrased, in top 3 | 1 / 8 | **2 / 8** | 3 / 8 |
| **All in-scope, in top 3** | 14 / 28 (50%) | **21 / 28 (75%)** | **22 / 28 (79%)** |
| Out of scope, answered with nothing | 0 / 6 | **2 / 6** | **5 / 6** |

v0 scored sections by how rare each question word is across the documents, with light stemming, and returned a section when it held at least 40% of the question's words. v1 changed two things:

1. **BM25 with length normalisation.** v0 kept returning one very long section ("7. Technical Decisions") for questions it knew nothing about, simply because a long section contains many words. BM25 stops long sections winning by length.
2. **A coverage rule.** A section is returned only if the words it holds make up at least half of the *weight* of the whole question (a missing rare word counts heavily). This is what turned out-of-scope answers from 2 of 6 correct to 5 of 6.

The end-to-end run, through the server with the official MCP client and every call written to its audit log, is in `EVAL_RESULTS.md` (per-question table with audit ids) and `eval-results.json`. **It was made against a local instance of the same code (commit `40cc204`), not the production address**, because the production deploy had not happened when this was written; it gave the same 22 of 28 and 5 of 6, with a median of 25 ms and a 95th percentile of 45 ms per call. The production run replaces it as soon as the deploy lands.

## What still fails (v1)

Six of the 28 in-scope questions miss:

| Question | What came back first | Why |
|---|---|---|
| d08 "Why did a deleted account's sign-in keep working and how was it fixed?" | An unrelated incident write-up | A real miss that is **not explained**: the right section's heading shares "deleted", "account" and "working" with the question, yet the incident write-up scored higher. I have not worked out why, and I have not tuned anything to fix it |
| p01 "…a name that differs only in capital letters?" | "7. Technical Decisions" | Paraphrase: the section says "case-sensitivity" and "squatting" |
| p02 "…getting into someone's account by trying lots of passwords?" | "7. Technical Decisions" | Paraphrase: the section says "throttled login" |
| p04 "…somebody has started broadcasting audio?" | "3. Data Model" | Paraphrase: the section says "goes live" |
| p07 "What did the site do wrong about people leaving for good?" | The CSverified badge | Paraphrase: the section says "delete an account" |
| p08 "Is it safe to let other users put pictures into comments on my page?" | "Richer comments: letting strangers put pictures and links on someone's page" | **Arguably a correct answer**: the label I wrote ("Comments on pictures") is a different section about a neighbouring topic. It is counted as a miss because labels were fixed before the first run |

Five of the six are the same failure: the question and the section share meaning but not words. That is the limit of keyword search, and it is the case an embedding model is built for (`DECISION_DOC.md`, decision 6). One out-of-scope question still gets an answer: "How many employees work at CreativesSelect?" returns "7. Technical Decisions" probably because "CreativesSelect" and "work" are in nearly every section and "employees" is the only word that appears nowhere, which leaves just enough weight to pass the coverage rule.

## How far to trust this

- **The author wrote the documents, the questions and the labels.** The questions were written before the first run, but by someone who had read the documents, so they are likely easier than a stranger's would be. A real user's questions will include ones no section answers and ones that mean something different from what a section says.
- **34 questions is small.** See the interval above; one question is 3.5 points.
- **The labels were adjusted once, openly.** After the first run, seven questions answered by two documents had the second one accepted; no wrong answer was relabelled right (d08 and the paraphrase misses stand). The numbers above use the corrected labels for every column, including the baseline, so they are comparable.
- **It measures retrieval, not answers.** The server returns passages; the assistant that uses them writes the answer, and its wording, faithfulness and use of the citation are not measured here.
- **The documents change.** They are read live from GitHub, so a rerun after the documents change can move the numbers by a question or two (the architecture notes grew by the MCP section during this work).
- **Latency was measured on the same machine as the server** (a local instance), with no load, so it says nothing about production, where the first call after the free tier sleeps takes much longer.

## How to repeat it

```bash
# end to end, through the live server with the official client (writes audit-log entries)
node scripts/mcp-eval.mjs https://www.creativesselect.com/api/mcp --markdown EVAL_RESULTS.md --json eval-results.json

# compare scorers on the same passages without a server (any module exporting searchDocs)
node scripts/mcp-eval.mjs --engine mcp/knowledge.js
```

Add questions to `mcp/eval/golden.json` (a question, the document and the heading words that answer it); out-of-scope questions have no `source`.

## What would count as an improvement
- A paraphrase hit@3 above 5 of 8 on questions not used to tune anything, together with out-of-scope abstention staying at 5 of 6 or better.
- A larger set, ideally questions collected from real use (the audit log keeps the questions people ask).
- A held-out half: tune on one half of the questions, report on the other.
