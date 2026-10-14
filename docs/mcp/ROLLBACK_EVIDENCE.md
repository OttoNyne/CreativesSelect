# Rollback evidence: the CreativesSelect MCP server

How the MCP server can be switched off or removed, and what was actually done to prove it, on 14 October 2026. Everything marked **done** was run and its output is quoted; everything marked **not exercised** is stated as such.

The MCP server is two commits in the API repository (`first-server`): `a79dbae` (the server, its tools and audit log) and `40d393f` (better scoring, the off switch and the evaluation harness). It adds one router (`/api/mcp`), one collection (`McpAuditEntry`) and one dependency (`@modelcontextprotocol/sdk`). It changes no existing route, model or collection.

## What could go wrong, and the way back for each

| What goes wrong | Fastest way back | Takes effect | Status |
|---|---|---|---|
| The tools return something they shouldn't, or are being abused | **Off switch**: set `MCP_DISABLED=true` on the server | When the service restarts with the variable (no code change, no deploy) | **Done** (locally) |
| A bug in the new code affects the rest of the API | **Revert the two commits** and let CI deploy | One CI run, about 17 minutes | **Done** (in a scratch copy, tests run) |
| A bad deploy that CI didn't catch | Render's "roll back to the previous deploy" | Minutes | Not exercised (a dashboard action; nothing needed it) |
| The audit collection grows or misbehaves | Entries delete themselves after 180 days; the collection can be dropped | Immediate | Reasoned, not exercised |

## 1. The off switch: done

`routes/mcp.routes.js` begins with a check: when the environment variable `MCP_DISABLED` is `true`, every tool address answers `503` and does nothing else. The audit log stays readable by an administrator, and the rest of the API is not touched.

Run: the API started locally with `MCP_DISABLED=true`.

```
GET  /api/mcp                 -> 503
POST /api/mcp (tools/list)    -> 503  {"jsonrpc":"2.0","error":{"code":-32000,"message":"The MCP server is switched off"},"id":null}
GET  /api/health              -> 200
GET  /api/preview/sitemap.xml -> 200
GET  /api/explore             -> 200
```

Also covered by an automated test (`tests/mcp.test.js`, "the off switch"): with the variable set, `tools/list` and a tool call both answer 503, nothing is written to the audit log, `/api/health` still answers 200, and the audit address still asks for an administrator; with the variable removed the server answers again.

**What this does not prove:** that flipping the variable in the hosting dashboard works. The server reads the variable on every request, so a restart with it set is enough, but that dashboard step was not performed in production.

## 2. Reverting the code: done

In a scratch copy of the repository at the current head, both commits were reverted:

```
$ git revert --no-edit 40d393f a79dbae
[… no conflicts …]
 delete mode 100644 routes/mcp.routes.js
 delete mode 100644 scripts/export-mcp-audit.mjs
 delete mode 100644 scripts/mcp-demo.mjs
 delete mode 100644 tests/mcp.test.js
 14 files changed, 1575 deletions(-)
```

Then the whole backend test suite was run in that copy:

```
 Test Files  90 passed (90)
      Tests  1510 passed (1510)
```

1510 is exactly the number of tests the suite had before the MCP server existed, so the revert leaves the API as it was. With the revert applied, the application loads, and:

```
GET /api/mcp    -> 401 {"error":"Not authenticated"}     (the address no longer exists as a tool address)
```

That is the answer the same address gave on the live site before the server was deployed.

One thing the exercise taught: the first attempt at the full suite in the scratch copy showed events tests failing with `secretOrPrivateKey must have a value`. That was the scratch copy lacking the local `.env` (the signing secret), not the revert; with the `.env` copied in, all 1510 passed. A real rollback is done by CI from the repository, which supplies its own settings.

## 3. Platform rollback: not exercised

The API is deployed by Render after CI passes (`autoDeployTrigger: checksPass`) and the website by Vercel. Both keep previous deploys that can be restored from their dashboards. This was not done, because nothing required it, and a rollback of the API would also undo any other change deployed after the MCP server.

## 4. Data

- The audit log is a **new** collection (`McpAuditEntry`). No existing collection or field was changed for the MCP server, so there is nothing to migrate back.
- Entries expire by themselves 180 days after they are written (a TTL index). After a revert the collection simply stops being written to and ages out; dropping it harms nothing.
- The log holds no address, account or email (see `docs/mcp/DECISION_DOC.md`, decision 5), so leaving it behind keeps nothing that would need to be erased.

## What a rollback does not undo
- Entries already in the audit log (harmless, and they expire).
- The documents in `docs/` and the published copies of the repository history.
- Anything an assistant has already done with the answers it received: the tools return public information only, so there is nothing to take back from the site itself.

## How to repeat it
```bash
# the off switch, locally
MCP_DISABLED=true npm run e2e-api      # then: curl -i localhost:5000/api/mcp   (503)

# the revert, in a scratch copy
git worktree add ../rollback-check HEAD
cd ../rollback-check && git revert --no-edit 40d393f a79dbae
cp ../first-server/.env .env && npm ci && npm run test:local
```
