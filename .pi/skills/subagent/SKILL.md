---
name: subagent
description: "Spawn isolated sub-agents with dedicated models and tools. Use this whenever work should be delegated to specialized agents, especially for research handoffs, independent review passes, parallel quality sweeps, or any workflow that benefits from isolated context and explicit agent roles. Modes: spawn (fresh context), fork (current session context snapshot)."
compatibility: Requires the local `@mjakl/pi-subagent` extension at `~/.pi/agent/extensions/pi-subagent/` plus the curated agents in `~/.pi/agent/agents/`.
---

# Subagent — Multi-Agent Workflows

Reference this skill when you need to delegate work with the `subagent` tool.

This skill is environment-specific:
- It documents the local `@mjakl/pi-subagent` extension.
- It reflects this machine's actual agent roster and default model assignments.
- It should match the live tool shape, not stale `pi-subagents` docs.

## Zero-Ambiguity Execution Policy

Follow this order exactly:

1. **Callable `subagent` tool in the current harness** → use it
2. **Tool not callable here** → stop and return blocked with actionable guidance

Do not invent slash-command, nested RPC, print-mode, or log-polling workarounds for mandatory review.

### Decision tree
1. Check the callable tool list for `subagent`.
2. If `subagent` is callable, use the tool schema directly.
3. If `subagent` is not callable, verify the local extension via:
   - `~/.pi/agent/extensions/pi-subagent/`
   - `~/.pi/agent/extensions/pi-subagent/package.json`
4. If the extension is present but the tool is still unavailable in this harness, fail closed.

## Reality Check for This Machine

Local extension source:
- `/Users/kodymullins/.pi/agent/extensions/pi-subagent`

Verification sources:
- `~/.pi/agent/extensions/pi-subagent/`
- `~/.pi/agent/extensions/pi-subagent/package.json`

What this means:
- the package registers a `subagent` tool
- it supports only **single** and **parallel** calls
- it uses a top-level `mode` field with `spawn` or `fork`
- it does **not** provide `/run`, `/parallel`, `/chain`, or `subagent_status`

## System Prompt Injection

`@mjakl/pi-subagent` auto-discovers agent markdown files and injects their `name` and `description` into the system prompt on every `before_agent_start` event. That gives the main agent awareness of available subagents without needing separate slash commands or chain metadata.

Discovery sources:
- user agents: `~/.pi/agent/agents/*.md`
- project agents: `.pi/agents/*.md`

Resolution priority:
- project agents override user agents on name collision

Project-local agents require confirmation by default. The tool exposes `confirmProjectAgents` if you need to bypass that in a trusted repo.

## Quick Start

### Single — `spawn` (fresh context, default)
```json
{
  "agent": "code-reviewer",
  "task": "Review the current implementation for correctness.",
  "mode": "spawn"
}
```

### Single — `fork` (inherits current session context)
```json
{
  "agent": "integration-reviewer",
  "task": "Review this change for reuse gaps and partial rollout risk.",
  "mode": "fork"
}
```

### Parallel
```json
{
  "tasks": [
    {
      "agent": "code-simplifier",
      "task": "Review the current implementation for unnecessary complexity."
    },
    {
      "agent": "validation-reviewer",
      "task": "Audit whether the validation evidence is strong enough."
    }
  ],
  "mode": "fork"
}
```

## Actual Tool Shape

Supported call patterns:

### Single
```json
{
  "agent": "agent-name",
  "task": "Your task description",
  "mode": "spawn",
  "cwd": "/path/to/project"
}
```

### Parallel
```json
{
  "tasks": [
    { "agent": "agent-a", "task": "Task A" },
    { "agent": "agent-b", "task": "Task B" }
  ],
  "mode": "fork",
  "confirmProjectAgents": true
}
```

Important details:
- `mode` is **top-level**, not per task
- `mode` defaults to `spawn`
- `tasks` and `agent`/`task` are mutually exclusive
- results return inline in the tool response
- there is no `chain`, `output`, `async`, or `agentScope` parameter

## Delegation Modes

### `spawn`
Fresh context. Best for isolated, reproducible work.

Use it for:
- research handoffs
- one-off audits
- tightly scoped implementation tasks

### `fork`
Current session snapshot plus the task string.

Use it for:
- review of the current session's implementation
- follow-up work that depends on prior reads or decisions
- validation passes that need the gathered evidence

## Delegation Guards

The installed package enforces runtime safeguards:
- depth guard: `--subagent-max-depth` / `PI_SUBAGENT_MAX_DEPTH` (default `3`)
- cycle prevention: `--subagent-prevent-cycles` / `PI_SUBAGENT_PREVENT_CYCLES` (default `true`)

Do not design workflows that depend on recursive chains beyond those limits.

## Model Assignment Strategy for This Machine

Use full model IDs from `~/.pi/agent/settings.json -> enabledModels`.

Current defaults:
- `novita/minimax/minimax-m2.7` — default coding/general agent model
- `deepinfra/zai-org/GLM-5` — validation and silent-failure review
- `deepinfra/Qwen/Qwen3.5-397B-A17B` — reserved for special cases, not the default reviewer split

For independent review, preserve model-family diversity where possible.

## Available Agents

### Core build / implementation agents

| Agent | Purpose | Default Model |
|-------|---------|---------------|
| `backend-developer` | APIs, microservices, server-side systems | MiniMax M2.7 |
| `frontend-developer` | React/Vue/Angular/frontend work | MiniMax M2.7 |
| `data-engineer` | ETL, data pipelines, DB optimization | MiniMax M2.7 |
| `devops-engineer` | CI/CD, infra, deployment | MiniMax M2.7 |
| `refactoring-specialist` | Structural code improvements | MiniMax M2.7 |
| `debugger` | Bug diagnosis and fixes | MiniMax M2.7 |

### Research / analysis agents

| Agent | Purpose | Default Model |
|-------|---------|---------------|
| `researcher` | Thorough web research with synthesis | MiniMax M2.7 |
| `researcher-premium` | Higher-cost research second opinion | MiniMax M2.7 |
| `code-explorer` | Trace existing feature behavior and callsites | MiniMax M2.7 |
| `code-architect` | Turn findings into an implementation blueprint | MiniMax M2.7 |
| `type-design-analyzer` | Review types and data-model invariants | MiniMax M2.7 |
| `comment-analyzer` | Review comments for accuracy and value | MiniMax M2.7 |
| `skill-reviewer` | Review skills for trigger quality and structure | MiniMax M2.7 |
| `scout` | Fast codebase recon and context compression | MiniMax M2.7 |
| `scope-auditor` | Scope control and plan-vs-implementation checks | GPT-5.4 |

### Review / quality agents

| Agent | Purpose | Default Model |
|-------|---------|---------------|
| `code-reviewer` | Code reviews | MiniMax M2.7 |
| `code-simplifier` | Simplify code without changing behavior | MiniMax M2.7 |
| `integration-reviewer` | Find reuse gaps, integration misses, and partial migrations | MiniMax M2.7 |
| `pr-test-analyzer` | Review for missing or brittle tests | MiniMax M2.7 |
| `security-reviewer` | Security and vulnerability analysis | MiniMax M2.7 |
| `validation-reviewer` | Audit proof strength and validation quality | GLM-5 |
| `silent-failure-hunter` | Audit silent failures and weak error handling | GLM-5 |

The package also includes package-local agents such as `oracle`, but the curated user agents above are the default choice in this environment.

## Suggested Workflows

### Research → design
```json
{ "agent": "code-explorer", "task": "Trace the existing implementation for this change.", "mode": "spawn" }
```

Then:
```json
{ "agent": "code-architect", "task": "Convert the exploration findings into an implementation blueprint.", "mode": "spawn" }
```

### Independent review sweep
```json
{
  "tasks": [
    {
      "agent": "code-simplifier",
      "task": "Review the current implementation for unnecessary complexity, speculative abstraction, and simplifications that preserve behavior."
    },
    {
      "agent": "integration-reviewer",
      "task": "Review the current implementation for missed reuse, integration gaps, partial rollouts, and contract drift."
    },
    {
      "agent": "validation-reviewer",
      "task": "Audit whether the current implementation is actually proven by the validation evidence gathered so far."
    }
  ],
  "mode": "fork"
}
```

## Common Options

| Option | Purpose |
|--------|---------|
| `agent` | Agent name for a single run |
| `task` | Task text for a single run |
| `tasks` | Parallel task array |
| `mode` | `spawn` or `fork` |
| `cwd` | Working directory for a single run, or per-task inside `tasks[]` |
| `confirmProjectAgents` | Require confirmation for project-local agents |

## Implement Skill Pairing

When the active workflow is `implement`, the default split is:
1. research/design with `code-explorer` or `code-architect` in `spawn`
2. implementation in the primary session or a tightly scoped builder agent
3. independent review with `code-simplifier`, `integration-reviewer`, and `validation-reviewer` in `fork`
4. rerun proof before calling the work complete

### Mandatory review recipe

Use the direct tool with a top-level `mode`:

```json
{
  "tasks": [
    {
      "agent": "code-simplifier",
      "task": "Review <FILES>. Focus only on unnecessary complexity, speculative abstraction, redundant logic, or simplifications that preserve behavior. Do not edit. Return concrete findings with severity and file references, or 'no issues'."
    },
    {
      "agent": "integration-reviewer",
      "task": "Review <FILES>. Focus on missed reuse, integration gaps, partial rollouts, duplicate logic, and contract drift. Do not edit. Return concrete findings with severity and file references, or 'no issues'."
    },
    {
      "agent": "validation-reviewer",
      "task": "Audit <FILES> and the validation evidence. Focus on proof strength, regression gaps, fallback behavior, silent failure risk, and whether the change is actually demonstrated. Do not edit. Return concrete findings with severity and file references, or 'no issues'."
    }
  ],
  "mode": "fork"
}
```

Results return inline. Capture them explicitly in the parent session; there is no `output` parameter.

## Troubleshooting

### The tool is unavailable here
- Check the callable tool list first
- Verify the local extension exists at `~/.pi/agent/extensions/pi-subagent/`
- Run `pi list`
- For this machine, `~/.pi/agent/settings.json -> packages` is not authoritative because the extension is auto-discovered from `extensions/`
- If the extension is present but this harness still does not expose `subagent`, treat that as a harness-exposure difference and fail closed for required review

### Agent seems missing
- Check `~/.pi/agent/agents/*.md`
- Check `.pi/agents/*.md`
- Confirm the frontmatter has `name` and `description`

### Model not found
- Use the full exact model ID from `~/.pi/agent/settings.json`
- Do not rely on shorthand names

### Project agent prompts for confirmation
- That is expected
- Re-run with `confirmProjectAgents: false` only for a trusted repository

## Run History

Delegated runs are logged to:
```text
~/.pi/agent/run-history.jsonl
```
