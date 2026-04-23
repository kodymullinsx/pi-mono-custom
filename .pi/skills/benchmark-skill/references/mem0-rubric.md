# mem0 Benchmark Rubric

Use this when validating mem0 changes, overnight audit results, or before/after behavior across Claude, Gemini, Codex, Pi, and OpenClaw.

This rubric exists because mem0 failures are often **path-specific**:
- daemon health can be green while a CLI-specific adapter is wrong
- long-term retrieval can work while session-scoped retrieval fails
- spool throughput can look healthy while semantic correctness degrades
- code inspection can suggest a contract is correct while the runtime path is never exercised

The goal is to distinguish:
- `healthy`
- `degraded but functioning`
- `hard failure`

## Core principle

Every benchmark claim must be backed by the right kind of evidence.

Use this mapping:

| Claim | Minimum evidence |
|---|---|
| Daemon is healthy | live `/health`, live `/search`, live `/search-split`, PID/log stability |
| Daemon-first contract holds | runtime exercise or adapter logs proving daemon path was used |
| success-empty contract holds | a live degraded/empty daemon response that does **not** trigger inline fallback |
| Spool pipeline is active | new spool file, processed.db growth, archive move, no stuck backlog |
| Write path is correct | processed file **plus** schema/sample validation of the resulting writes |
| Dedup is correct | duplicate fixture with known expected outcome, not just “0 new points” |
| OpenClaw is healthy | `stats`, `search`, and at least one real `openclaw agent` turn with clean logs |
| Session-scoped memory works | live path using `run_id` / session key, not just user-scoped search |

## What has been shown to be effective

### 1. Separate liveness from correctness

This was effective:
- measuring daemon/process uptime, health endpoints, and queue movement
- separately inspecting semantic correctness, payload schema, and log errors

This was not enough:
- “processed to completion”
- “points increased”
- “no backlog”

Those prove liveness. They do **not** prove dedup, conflict handling, or recall quality.

### 2. Test the exact path that failed historically

This was effective:
- reproducing OpenClaw recall/capture below the UI layer with the same `run_id`
- checking Qdrant directly with the same filter that the plugin emitted

This matters because:
- manual `openclaw mem0 search` uses user-scoped search and can pass
- auto-recall / auto-capture use session-scoped `run_id` filters and can still fail

### 3. Use direct infrastructure errors when possible

This was effective:
- reproducing the OpenClaw error directly against Qdrant and getting the real server message:
  `Index required but not found for "run_id"`

This is better than:
- relying on a top-level `Error: Bad Request`
- inferring cause from timing alone

### 4. Validate samples are representative

This was effective:
- explicit `order_by=created_at DESC` when claiming “newest points”
- showing the timestamp, source, and key payload fields for the sampled writes

This failed:
- labeling a sample “newest” when the shown timestamps were not actually the newest writes

### 5. Avoid tautological recall tests

Weak test:
- query contains the exact answer phrase or the exact audit wording

Better test:
- use a paraphrase
- use a task-shaped query
- use a short developer-style prompt
- verify the retrieved memory is relevant and not just keyword-overlapping

## Anti-patterns to avoid

### Source inspection presented as runtime proof

Bad:
- “contract confirmed” because the code path looks correct

Better:
- force or simulate the runtime condition and observe behavior

### Throughput presented as semantic correctness

Bad:
- “all invariants clean” while conflict timeouts are falling back to `keep_both`

Better:
- call out that liveness is healthy but dedup correctness is degraded until proven otherwise

### Search-only OpenClaw validation

Bad:
- `openclaw mem0 search` passes, therefore OpenClaw is fully healthy

Better:
- `stats`
- `search`
- one real `openclaw agent` turn
- fresh gateway log slice with no recall/capture failures

### Inferring idempotency from “0 points added”

Bad:
- file processed, 0 new points, therefore exact-hash dedup confirmed

Better:
- use a known duplicate fixture
- verify no new points
- verify no embed/conflict/upsert error path was taken

## 15-minute rubric

Use this for fast confirmation after a fix.

### A. Daemon

- `GET /health`
- one `POST /search`
- one `POST /search-split`
- record HTTP status, `ok`, count, tier, and internal latency

Pass:
- all endpoints respond
- no crash/restart evidence
- response shape sane

### B. Spool/write path

- newest `processed.db` rows
- current spool pending count
- recent `~/.memory/daemon.log` slice

Pass:
- processed row growth or at least no stuck queue
- no new hard parse/init/write errors

Flag as degraded:
- recurring conflict timeouts

### C. Qdrant schema/invariants

- payload schema snapshot
- one direct “newest active points” query with `created_at DESC`
- orphan count
- legacy field count if relevant

Pass:
- expected indexes present
- newest sampled points are actually recent
- no unexpected schema regressions

### D. OpenClaw

- `openclaw mem0 stats`
- one `openclaw mem0 search`
- one real `openclaw agent` turn
- tail fresh `gateway.err.log`

Pass:
- no new `recall failed`, `capture failed`, `Bad Request`, `Forbidden`, `better-sqlite3`

### E. Path-specific regression checks

Use when the recent bug was path-specific:
- session-scoped `run_id`
- agent-scoped `agent_id`
- success-empty
- static/dynamic split

Never assume the long-term path covers the session path.

## Overnight rubric

Use this when validating stability across many hours.

### Required checkpoints

At each checkpoint capture:
- search daemon PID and health
- hub daemon PID and uptime
- processed.db row count
- Qdrant point counts
- active/inactive/orphan counts
- recent spool file processed
- OpenClaw stats/search or agent result
- fresh error log slice

### Required trend analysis

Track:
- PID stability
- processed row growth
- point growth
- repeated error classes
- recurring degraded states

### Required caution language

Use:
- “consistent with”
- “not proven”
- “smoke-tested”
- “runtime-validated”

Avoid:
- “confirmed”
- “resolved”
- “all invariants clean”

unless the evidence actually matches the claim.

## Suggested scoring

Use a flat rubric, not one blended score.

| Category | Status |
|---|---|
| Daemon health | pass / degraded / fail |
| Retrieval correctness | pass / degraded / fail |
| Write-path liveness | pass / degraded / fail |
| Write-path semantic correctness | pass / degraded / fail |
| Qdrant schema/index integrity | pass / degraded / fail |
| OpenClaw long-term path | pass / degraded / fail |
| OpenClaw session path | pass / degraded / fail |

Overall status rule:
- any `fail` in a user-facing path -> overall `FAILED`
- no `fail`, at least one correctness-impacting `degraded` -> overall `DEGRADED`
- all pass -> overall `HEALTHY`

## mem0-specific checks that should be standard

- daemon-first vs inline fallback
- success-empty semantics
- static vs dynamic split
- exact newest-write sampling
- conflict timeout monitoring
- orphan stability
- payload index presence for any filtered field used by adapters
  examples: `user_id`, `run_id`, `agent_id`, `context_tags`, `active`, `is_static`

## Recommended language for reports

Prefer:
- “OpenClaw long-term search passed, but session-scoped recall was not yet validated”
- “Spool pipeline is live; semantic dedup remains degraded because conflict timeouts fall back to keep_both”
- “The sample shown is not sufficient to prove newest-write correctness”

Avoid:
- “All layers nominal”
- “No regression detected”

unless each critical path was actually exercised.
