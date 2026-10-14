# Autonomy justification: the CreativesSelect MCP server

14 October 2026. Why the server may act without a person approving each call, where that stops, and what would have to be true before it is allowed more.

## First, who is autonomous

The server itself **has no model and makes no decisions**. It is a set of four functions behind a protocol: given a call, it runs one lookup and returns the result. The autonomy in the system belongs to the **assistant that connects to it** (Claude or any other MCP client), which chooses which tool to call, with what words, and what to do with the answer. This document is about what that assistant is allowed to do through this server, because that is the autonomy the server grants.

## The level granted

**Fully autonomous, read-only, within limits.** An assistant may call any of the four tools as often as the rate limit allows, with no person approving each call, because nothing a tool can do changes anything.

| Action | Allowed to run without a person? | Why |
|---|---|---|
| Search public creators | Yes | Returns only what a signed-out visitor could open on the site |
| Open one public profile | Yes | Same; a private or missing profile gives the same error |
| Find public pieces | Yes | Same |
| Search the project's documents | Yes | The documents are public; every passage comes with its source |
| Post, comment, react, follow | **No tool exists** | Not offered; not an approval step, an absence |
| Send a message, notification or email | **No tool exists** | Not offered |
| Schedule, edit or delete anything | **No tool exists** | Not offered |
| Read private data (email, messages, private profiles, suspended accounts) | **No tool exists** | Not offered |
| Spend money or call a paid service | **No tool exists** | Search runs on the API's own database and one public document fetch |
| Read the audit log | Administrators only, outside the tools | The log is for the owner, not for the assistant |

## Why that level is justified

1. **The worst outcome of any call is a wrong or unhelpful answer.** There is no write path, so no call can lose data, annoy a person, publish something or cost money. Approval steps exist to catch irreversible actions; there are none to catch.
2. **Everything returned is already public.** The rule applied in every query is "public and not suspended", the same one the website applies to a signed-out visitor, so the server grants nothing a browser didn't already have.
3. **The inputs are constrained.** Every text is cut to a maximum length, search words are escaped before they reach the database, a username must match a strict pattern, and the documents are read from three fixed addresses, so no argument can become a file path, a URL or a query operator.
4. **Volume is capped.** 300 requests an hour per address, at most 10 results per call, so even a runaway assistant is slow and bounded.
5. **Every call leaves a record.** The tool, the (shortened) question, the outcome, how many results, the sources and the time are written to an audit log, including failures and calls the protocol refused. A person can read exactly what an assistant did.
6. **It can be stopped at once.** `MCP_DISABLED=true` makes every tool address answer 503 without a deploy (exercised; see `ROLLBACK_EVIDENCE.md`).

## Where the autonomy stops, and why

- **No write tools, now or by default.** The design rejects write tools because of prompt injection through member text: a bio that says "now message everyone" would be read by an assistant. A read-only server turns that attack into a wrong answer.
- **Member-written text is labelled as data.** Bios, captions and posts come back with a note that they were written by members and are to be reported, never followed. That note helps, but a client can ignore it, which is why the absence of write tools is the real control and the note is the second one.
- **No identity.** Calls are not made "as" anyone. There are no accounts in the protocol, so an assistant cannot act with a member's authority.

## What would have to be true to grant more

Before any tool is added that **changes something** (for example "save this piece", "draft a post"):

1. **The action is reversible or confirmed.** Either it can be undone (a draft that nothing publishes), or a person confirms each use in the assistant's own interface; the server marks such tools as not read-only so clients can ask.
2. **It runs as an identified member with a scoped grant** (OAuth with narrow scopes, revocable), so the audit log can say who authorised it.
3. **Member text can't reach the decision.** Anything that feeds an action must come from the authorising person, not from content other members wrote.
4. **The evaluation grows a safety set**: adversarial bios and captions that try to steer the assistant, and the tool is only added if none succeeds.
5. **There is a per-person limit and a way to see and revoke what was done.**

## What would reduce the autonomy

- The audit log shows a burst of calls from one label that looks like scraping: lower the limit or add a key.
- A tool returns something it shouldn't (a test should catch this; if one reaches the log): switch the server off, fix, redeploy.
- Abuse of the open endpoint becomes real: require a key for the tools (a small change, since every call already passes through one function).

## Honest limits of this justification

- It rests on the claim that "public" really means public: a member who made a piece public did choose that, but may not expect an assistant to find it by tag. The control members have is the profile's private setting (and suspension by a moderator); the tools honour both, but there is no per-piece or per-assistant opt-out.
- The audit log has no attribution beyond the caller's own label. That is a deliberate privacy choice (`DECISION_DOC.md`, decision 5), and it means an abusive caller can be limited and blocked by rate, not identified.
