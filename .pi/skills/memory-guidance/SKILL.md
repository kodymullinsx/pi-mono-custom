---
name: memory-guidance
description: Reference guide for the cross-CLI memory and session architecture — two memory trees, PreCompact transcript backup, /endsession retrospective flow, and per-CLI nuances. Use when asked about "how does memory work", "how does endsession work", "memory architecture", "where does memory go", "what is the memory strategy", or when setting up memory in a new context. Not for creating or updating memory content — use memory-creator for that.
---

# Memory & Session Architecture Reference

This skill documents the strategy decided on 2026-03-25, updated 2026-04-29. Read this before re-exploring the codebase or re-deriving the architecture from scratch.

---

## Memory System

### Two Trees (strictly segregated)

| Tree | Path | Scope |
|---|---|---|
| Personal + Projects | `~/Workspace/Memory/` | Side projects, personal context, Pi/OpenClaw/tools |
| Work | `~/work/Memory/` | Schwab IAD, professional context |

**Routing is CWD-based in both Claude and Pi.** Claude uses `domain_memory.py` (`UserPromptSubmit` hook); Pi uses the `domain-memory` extension (`before_agent_start` event). Codex has no hook system — routing is manual there.

- `~/work/...` → semantic route against `~/work/Memory/` with `scope="work"`; on match inject matched `memory.md` followed by the work `_index.md`; on no match or router failure inject the work `_index.md` only
- all other paths → semantic route against `~/Workspace/Memory/` with `scope="personal"`; on match inject matched `memory.md` followed by the projects `_index.md`; on no match or router failure inject the projects `_index.md` only

### Three-Layer Structure

```
[tree]/
  _index.md                    ← Routing index (auto-regenerated on memory.md write in Claude + Pi)
  [domain]/
    memory.md                  ← Briefing ≤60 lines — key facts + current context
    references/
      [topic].md               ← Deep reference, no line limit, no frontmatter
```

### memory.md Format

```markdown
---
domain: [path relative to Memory root]
description: [one-line "when to load" trigger — written for routing accuracy]
last_updated: YYYY-MM-DD
---

# Domain Name

## Key Facts
- [stable, rarely-changing]

## Current Context
- [active right now — updated most often]

## Reference Files
- `references/[topic].md` — description
```

For full authoring guidance, use the `memory-creator` skill.

---

## Session End: /endsession

`/endsession` is a three-phase retrospective skill deployed to all three CLIs:

| CLI | Skill location | Instruction file updated |
|---|---|---|
| Claude | `~/.claude/skills/endsession/SKILL.md` | `CLAUDE.md` |
| Pi | `~/.pi/agent/skills/endsession/SKILL.md` | `AGENTS.md` |
| Codex | `~/.codex/skills/endsession/SKILL.md` | `AGENTS.md` |

**Three phases, always in order:**
1. **Memory update** — scan session for new facts, route to correct tree, propose targeted edits
2. **Skill/feedback capture** — identify correction and validation patterns, propose feedback memory entries or skill updates
3. **Instruction file review** — flag standing rules that emerged, propose targeted insertions

Evidence intake writes nothing by itself. Low-risk domain memory and `_notes.md` updates may be autonomous where the active CLI policy allows them, but promotion into trusted behavior files such as `SKILL.md`, `CLAUDE.md`, or `AGENTS.md` requires explicit approval.

---

## Passive evidence ledgers

Claude and Pi both now have observational memory ledgers. These ledgers capture routing decisions, lexical friction candidates, and compaction-time evidence so `/endsession` has better recall. They do not directly change routed context, router thresholds, compaction behavior, skills, or trusted instructions.

| CLI | Ledger root | Kill switch | Validator/reporting |
|---|---|---|---|
| Claude | `~/.claude/memory/` | `CLAUDE_MEMORY_LEDGER_OFF=1` | `~/.claude/hooks/lib/validate_memory_artifacts.py`, `route_telemetry_report.py` |
| Pi | `~/.pi/agent/memory/` | `PI_MEMORY_LEDGER_OFF=1` | `~/.pi/agent/scripts/validate-pi-memory-artifacts.mjs`, `report-pi-route-telemetry.mjs` |

Promotion policy is the same across both ledgers: captured and candidate records are evidence only. A user or reviewed workflow must decide whether anything becomes stable domain memory, a session note, or a trusted instruction change.

## Context Preservation at Compaction

### What fires automatically in Claude

`~/.claude/hooks/backups/pre_compact_backup.sh` runs on every `PreCompact` event (manual or auto). It:
1. Reads `transcript_path` from the hook's stdin JSON
2. Copies the raw JSONL transcript to `~/.claude/transcripts/<timestamp>_<session>.jsonl`

These backups are **safety nets only** — not automatically processed.

### What fires automatically in Pi

The `memory-ledger` extension watches Pi compaction events without replacing Pi's native compaction. On `session_before_compact`, it writes a packet under `~/.pi/agent/memory/capture/compaction/<session>/compact-NNN.md` plus a sibling `.events.jsonl` file. On `session_compact`, it appends a ledger event linking the packet sequence to the saved compaction entry when available. The hook returns `undefined`, never `cancel`, `summary`, or a replacement compaction object.

### Transcript JSONL format

Each line is an event. Relevant types:

| type | content |
|---|---|
| `user` | `message.content` = user's text |
| `assistant` | `message.content` = array of blocks: `text`, `tool_use`, `thinking` |
| `progress`, `file-history-snapshot` | noise — discard |

A clean dialogue-only view strips `tool_use` and `thinking` blocks from assistant messages and drops all non-user/assistant event types.

### Why /endsession beats automated extraction

The routing problem: a transcript from a session touching both work and personal projects has no clean signal for which memory domain each exchange belongs to. `/endsession` runs in-session where CWD is authoritative. Automated post-compaction synthesis cannot reliably route.

---

## Per-CLI Nuances

### Claude (`~/.claude/`)
- Skills: `~/.claude/skills/<name>/SKILL.md`
- Instruction file: `CLAUDE.md` (project-level) + `~/.claude/` (global)
- Hook system: full (`PreCompact`, `UserPromptSubmit`, `PostToolUse`, etc.)
- Memory routing: automatic via `domain_memory.py` hook with the shared scoped router contract above
- `_index.md` auto-regenerated: yes, via `memory_index_regen.py` on `PostToolUse`

### Pi (`~/.pi/`)
- Skills: `~/.pi/agent/skills/<name>/SKILL.md`
- Instruction file: `~/.pi/agent/AGENTS.md` (global), `AGENTS.md` in repo root (project)
- Hook system: extensions in `~/.pi/agent/extensions/` (TypeScript directories, each with `index.ts` + `package.json`)
- Memory routing: **automatic** via `domain-memory` extension (`before_agent_start` event)
  - CWD routing: `~/work/` → work tree with `scope="work"`; all else → personal+projects tree with `scope="personal"`
  - Shared behavior with Claude: queries embedding server at `http://127.0.0.1:18432/route`; on confident match injects the matched `memory.md` followed by that tree's `_index.md`; on router failure or no match injects that tree's `_index.md` only
  - Passive route telemetry: the same decision is appended as `route_event` under `~/.pi/agent/memory/events/` without changing routing behavior
- `_index.md` auto-regenerated: **yes** — via `domain-memory` extension `tool_result` hook on `write`/`edit` tool results targeting `memory.md` paths
- Task tracking: `todo` tool (file-based, `.pi/todos/`)
- No native plan mode or background jobs
- Pi extension API key events: `before_agent_start` (can return `{systemPrompt}` to inject per-turn), `input` (ledger observes and returns continue), `session_before_compact`, `session_compact`, `tool_result`, `tool_call`, `session_start`, `turn_end`, `session_shutdown`

### Codex (`~/.codex/`)
- Skills: `~/.codex/skills/<name>/SKILL.md`
- Instruction file: `~/.codex/AGENTS.md` (global), `AGENTS.md` in repo root (project)
- Hook system: none
- Memory routing: manual
- `_index.md` auto-regenerated: no
- Note: `~/.codex/AGENTS.md` contains stale MEM0 references — treat as deprecated

---

## Deprecated / Archived

- **mem0 / Qdrant**: fully archived to `~/Workspace/.archive/mem0-archived/`. Do not reference or use.
- **together** skill: deleted from all CLIs on 2026-03-25. DeepInfra is the preferred inference provider.
- **OpenClaw "OpenCAW"**: name is deprecated. Always use "OpenClaw".
