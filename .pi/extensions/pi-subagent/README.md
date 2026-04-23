# Pi Subagent

**Delegate tasks to specialized subagents with configurable context modes (`spawn` / `fork`).**

There are many subagent extensions for pi, this one is mine.

## Why Pi Subagent

**Specialization** — Use tailored agents for specific tasks like refactoring, documentation, or research.

**Context Control** — Choose `spawn` (fresh context) or `fork` (inherit current session context), depending on the task.

**Parallel Execution** — Run multiple agents at once.

**A Simpler Fork** — This extension intentionally trims features from other implementations (like chaining and scope selectors) to keep the surface area small and predictable. If you want the minimal, “just delegate” experience, this is it.

## Install

### Option 1: Install from npm (recommended)

```bash
pi install npm:@mjakl/pi-subagent
```

### Option 2: Install via git

```bash
pi install git:github.com/mjakl/pi-subagent
```

### Option 3: Manual Installation

Clone this repository to your Pi extensions directory:

```bash
cd ~/.pi/agent/extensions
git clone https://github.com/mjakl/pi-subagent.git
cd pi-subagent
npm install
```

## Configuration

### Delegation Guards (Depth + Cycle Prevention)

By default, this extension enforces two runtime guards:

1. **Depth guard** (`--subagent-max-depth`, default `3`)
   - Main agent starts at depth `0`
   - Delegation is allowed while `currentDepth < maxDepth`
   - With default depth `3`: depth `0`, `1`, and `2` can delegate; depth `3` cannot
2. **Cycle guard** (`--subagent-prevent-cycles`, default `true`)
   - Blocks delegating to any agent name already present in the current delegation stack
   - Prevents self-recursion (`writer -> writer`) and loops (`planner -> reviewer -> planner`)

You can configure depth with either:

- CLI flag: `--subagent-max-depth <n>`
- Environment variable: `PI_SUBAGENT_MAX_DEPTH=<n>`

`n` must be a non-negative integer.

You can configure cycle prevention with either:

- CLI flag: `--subagent-prevent-cycles` / `--no-subagent-prevent-cycles`
- Environment variable: `PI_SUBAGENT_PREVENT_CYCLES=true|false`

Internal env vars managed by the extension and propagated to child processes:

- `PI_SUBAGENT_DEPTH`
- `PI_SUBAGENT_MAX_DEPTH`
- `PI_SUBAGENT_STACK` (JSON array of ancestor agent names, e.g. `["scout","planner"]`)
- `PI_SUBAGENT_PREVENT_CYCLES`
- `PI_SUBAGENT_ROLE`
- `PI_MONITOR_OWNER_SESSION_ID`
- `PI_MONITOR_OWNER_SESSION_FILE`
- `PI_MONITOR_OWNER_CWD`

Recommended extension-integration note:

If another extension needs to detect whether it is running inside a delegated subagent process, check `PI_SUBAGENT_DEPTH`. Treat `PI_SUBAGENT_DEPTH > 0` as "this pi process is a subagent". This is the recommended way to suppress parent-only behavior such as bells, desktop notifications, or other attention-grabbing signals.

Examples:

```bash
# Default behavior: depth 3 + cycle prevention enabled
pi

# Restrict to one nested level (main -> child -> grandchild)
pi --subagent-max-depth 2

# Disable subagent delegation entirely
pi --subagent-max-depth 0

# Allow depth 3 but disable cycle prevention (not recommended)
pi --subagent-max-depth 3 --no-subagent-prevent-cycles
```

### Context Mode (`spawn` vs `fork`)

`subagent` supports a top-level `mode` switch:

- `spawn` (default) — Child receives only the task string (`Task: ...`). Best for isolated, reproducible work; typically lower token/cost and less context leakage.
- `fork` — Child receives a forked snapshot of the current session context **plus** the task string. Best for follow-up work that depends on prior context; typically higher token/cost and may include sensitive context.

Quick rule of thumb:

- Start with `spawn` for one-off tasks.
- Use `fork` when the delegated task depends on the current session's prior discussion, reads, or decisions.

Examples:

```json
{ "agent": "writer", "task": "Document the API", "mode": "spawn" }
```

```json
{ "agent": "review", "task": "Double-check this migration", "mode": "fork" }
```

If omitted, mode defaults to `spawn`.

### Role Model (`worker` vs `coordinator`)

`pi-subagent` now distinguishes between two child roles:

- `worker` — executes the assigned task directly. The `subagent` tool is not registered in worker sessions.
- `coordinator` — may delegate further work, but only within the existing depth and cycle guards.

Role defaults are intentionally asymmetric:

- Root/current sessions default to `coordinator`
- Delegated child sessions default to `worker`

You can set a default role in agent frontmatter, or override it per call with `role`.

Role precedence is:

1. Per-task `role` (parallel mode only)
2. Top-level call `role`
3. Agent frontmatter `role`
4. Delegated-child default: `worker`

Examples:

```json
{ "agent": "researcher", "task": "Summarize these files", "role": "worker" }
```

```json
{ "agent": "planner", "task": "Continue coordinating this investigation", "mode": "fork", "role": "coordinator" }
```

Important notes:

- Roles are execution semantics inside `pi-subagent`, not a hard security boundary.
- Use `coordinator` intentionally, usually together with `fork` for genuine handoff work.
- Existing recursive delegators may need explicit `role: coordinator` after upgrading.

### Subagent Definitions

Subagents are defined as Markdown files with YAML frontmatter.

**User Agents:** `~/.pi/agent/agents/*.md` by default, or `$PI_CODING_AGENT_DIR/agents/*.md` when `PI_CODING_AGENT_DIR` is set
**Project Agents:** `.pi/agents/*.md`

`PI_CODING_AGENT_DIR` follows Pi's config-dir override semantics: when it is set, the extension uses `$PI_CODING_AGENT_DIR/agents` as the user/global agent directory instead of `~/.pi/agent/agents`. Project agents are still loaded in addition to the active user/global directory, and project agents win on name conflicts. When project agents are requested, Pi will prompt for confirmation before running them.

Example agent (`~/.pi/agent/agents/writer.md`):

```markdown
---
name: writer
description: Expert technical writer and editor
role: worker
model: anthropic/claude-3-5-sonnet
tools: read, write
---

You are an expert technical writer. Your task is to improve the clarity and conciseness of the provided text.
```

Note: this repository includes a sample agent in `agents/oracle.md` for reference.

### Frontmatter Fields

| Field         | Required | Default                          | Description                                                                                                                                                                |
| ------------- | -------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Yes      | —                                | Agent identifier used in tool calls (must match exactly)                                                                                                                   |
| `description` | Yes      | —                                | What the agent does (shown to the main agent)                                                                                                                              |
| `role`        | No       | Delegated child default: `worker` | Sets the agent's default delegated role (`worker` or `coordinator`). Call-time overrides still win.                                                                        |
| `model`       | No       | Uses the default pi model        | Overrides the model for this agent. You can include a provider prefix (e.g. `anthropic/claude-3-5-sonnet` or `openrouter/claude-3.5-sonnet`) to force a specific provider. |
| `thinking`    | No       | Uses Pi's default thinking level | Sets the thinking level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`). Equivalent to `--thinking`.                                                                  |
| `tools`       | No       | `read,bash,edit,write`           | Comma-separated list of **built-in** tools to enable for this agent. On Pi 0.68+, `pi-subagent` preserves the caller's active non-builtin tools alongside this allowlist unless tools are fully disabled. |

Notes:

- `model` accepts `provider/model` syntax — this is a Pi feature. Use it when multiple providers offer the same model ID.
- `thinking` uses the same values as Pi's `--thinking` flag; it's recommended to set it explicitly since thinking support varies by model.
- `role` controls whether the delegated child defaults to direct execution (`worker`) or can further delegate (`coordinator`).
- `tools` only controls built-in tools. On Pi 0.68+, `pi-subagent` automatically keeps the caller's active non-builtin tools available when it emits `--tools`, so extension/custom tools like `lsp` do not disappear just because an agent file says `tools: read`.
- Worker children do not inherit the `subagent` tool, even when the parent session has it active. Coordinator children can.
- Inherited `--no-tools` remains authoritative and disables all child tools.
- The Markdown body below the frontmatter becomes the agent's system prompt and is **appended** to Pi's default system prompt (it does **not** replace it).

### Writing a Good Agent File

- **Description matters** — the main agent uses the `description` to decide which subagent to call, so be specific about what the agent is good at.
- **Tool scope is optional but helpful** — reducing tools can keep the agent focused, but you can leave defaults if unsure.
- **Model + thinking is the power combo** — selecting the right model and thinking level is often the biggest quality boost.

### Available Built-in Tools

Available Tools (default: `read`, `bash`, `edit`, `write`):

- `read` — Read file contents
- `bash` — Execute bash commands
- `edit` — Edit files with find/replace
- `write` — Write files (creates/overwrites)
- `grep` — Search file contents (read-only, off by default)
- `find` — Find files by glob pattern (read-only, off by default)
- `ls` — List directory contents (read-only, off by default)

Tip: for a read-only tool selection, use `read,find,ls,grep`. As soon as you include `edit`, `write`, or `bash`, the agent can practically go wild.

## How Communication Works

### The Isolation Model

Each subagent always runs in a **separate `pi` process**:

- ❌ No shared memory/state with the parent process
- ❌ No visibility into sibling subagents
- ✅ Its own model/tool/runtime loop
- ✅ Started with `PI_OFFLINE=1` to skip startup network operations and reduce spawn latency
- ✅ Inherits relevant parent CLI configuration such as extensions, provider/theme/skill flags, resolves inherited relative resource paths against the parent cwd, reuses parent `--model` / `--thinking` values, and merges parent or agent built-in `--tools` allowlists with the caller's active non-builtin tools when needed

What it can see depends on `mode`:

- `spawn` (default)
  - ✅ Receives: subagent system prompt + `Task: ...`
  - ❌ Does **not** receive parent session history
- `fork`
  - ✅ Receives: forked snapshot of current parent session context + `Task: ...`

What it can do depends on `role`:

- `worker`
  - ✅ Executes the assigned task directly
  - ❌ Does **not** get the `subagent` tool
- `coordinator`
  - ✅ Can delegate further work, subject to the same depth and cycle guards

### What Gets Sent to Subagents

#### `spawn` mode (default)

`subagent({ agent: "writer", task: "Document the API" })` sends:

```
[System Prompt from ~/.pi/agent/agents/writer.md]

User: Task: Document the API
```

No parent conversation history is included. In `spawn`, include all required context in `task`.

#### `fork` mode

`subagent({ agent: "writer", task: "Document the API", mode: "fork" })` sends:

```
[Forked snapshot of current session context]
[System Prompt from ~/.pi/agent/agents/writer.md]

User: Task: Document the API
```

Note: `fork` copies session context, not transient runtime-only prompt mutations from the parent process.

### What Comes Back to the Main Agent

| Data                        | Main Agent Sees          | TUI Shows              |
| --------------------------- | ------------------------ | ---------------------- |
| Final text output           | ✅ Yes — full, unbounded | ✅ Yes                 |
| Tool calls made by subagent | ❌ No                    | ✅ Yes (expanded view) |
| Token usage / cost          | ❌ No                    | ✅ Yes                 |
| Reasoning/thinking steps    | ❌ No                    | ❌ No                  |
| Error messages              | ✅ Yes (on failure)      | ✅ Yes                 |

**Key point:** The main agent receives **only the final assistant text** from each subagent. Not the tool calls, not the reasoning, not the intermediate steps. This prevents context pollution while still giving you the results.

### Parallel Mode Behavior

When running multiple agents in parallel:

- All subagents start simultaneously (up to 4 concurrent)
- The top-level `mode` applies to all tasks in that call
- A top-level `role` applies to tasks unless a specific task overrides it
- Main agent receives a combined result after all finish:

```
Parallel: 3/3 succeeded

[writer] completed: Full output text here...
[tester] completed: Full output text here...
[reviewer] completed: Full output text here...
```

## Features

- **Auto-Discovery** — Agents are found at startup and their descriptions are injected into the main agent's system prompt.
- **Context Mode Switch** — `spawn` (fresh context) and `fork` (session snapshot + task) per call.
- **Role-Aware Delegation** — Delegated children default to `worker`; explicit `coordinator` handoff is supported when you need nested delegation.
- **Depth + Cycle Guards** — Depth limiting and ancestry-cycle checks prevent runaway recursive delegation by default.
- **Monitor Owner Propagation** — Durable monitor owner env vars are preserved across subagent boundaries so child-created monitors can resolve back to the root session.
- **Streaming Updates** — Watch subagent progress in real-time as tool calls and outputs stream in.
- **Rich TUI Rendering** — Collapsed/expanded views with usage stats, tool call previews, and markdown output.
- **Security Confirmation** — Project-local agents require explicit user approval before execution.

## Project Structure

```
index.ts       — Extension entry point: lifecycle hooks, tool registration, mode orchestration
agents.ts      — Agent discovery: reads and parses .md files from the active Pi config dir and project directories
runner-cli.js  — Parent CLI inheritance: parses and normalizes flags forwarded to child processes
runner.ts      — Process runner: starts `pi` subprocesses in spawn/fork context modes and streams JSON events
render.ts      — TUI rendering: renderCall and renderResult for the subagent tool
types.ts       — Shared types and pure helper functions
```

## Attribution

Inspired by implementations from [vaayne/agent-kit](https://github.com/vaayne/agent-kit) and [mariozechner/pi-mono](https://github.com/badlogic/pi-mono).

## License

MIT
