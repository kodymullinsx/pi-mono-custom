---
name: memory-creator
description: Create, update, and optimize memory domains for the file-based domain memory system. Memory updates are autonomous — no permission required. Use when the user asks to create a new memory domain, update existing memory content, review memory quality, prune stale entries, or optimize memory.md descriptions for better hook-based triggering. Also trigger when the user says "remember this", "add this to memory", "update my memory about X", "create a memory for X", or when a session naturally produces information that should persist in a domain.
---

# Memory Creator

## Quick Reference

**Two memory trees** (strictly segregated):
- Personal + Projects: `~/Workspace/Memory/`
- Work: `~/work/Memory/`

**Three-layer structure:**
```
[domain]/memory.md          ← Briefing (≤60 lines) — current state, key contacts, milestones
[domain]/references/        ← Reference depth — detailed content loaded on demand
[tree]/_index.md            ← Hook-injected routing index (auto-generated; do not edit manually)
```

**Size targets:**
- Namespace overview (e.g. `audit/memory.md`): ~20–30 lines
- Engagement briefing (e.g. `audit/fy26-tplc/memory.md`): ≤60 lines (hard limit: 65)
- Reference files: no line limit; one topic per file

**File reference rule (critical):** Never cite paths outside the memory tree in any memory file. `~/Downloads/`, `~/Work/`, `~/Desktop/`, and all external locations are off-limits — they are fragile and may not exist in future sessions. If an external file is worth referencing, copy it into `references/` and cite the memory-internal path instead.

---

## Procedure 1: Create a New Domain

**When:** user says "create a memory for X", "remember this as a domain", "add a new domain"

**Step 1 — Determine tier**
- Category grouping multiple sub-domains (e.g. `audit/`) → namespace overview
- Single subject with its own briefing → engagement briefing
- Supporting depth for an existing domain → reference file (see Procedure 3)

**Step 2 — Choose path**
Follow the existing tree structure:
- New work audit → `~/work/Memory/audit/[fy-name]/memory.md`
- New personal domain → `~/Workspace/Memory/personal/[topic]/memory.md`
- New project → `~/Workspace/Memory/projects/[project-name]/memory.md`
- Create a sub-namespace when a category will generate multiple independent domains over time

**Step 3 — Write `memory.md`** with this structure:
```markdown
---
domain: [full path relative to Memory root, e.g., work/audit/fy26-tplc]
description: [One-line "when to load" description — see Procedure 5 for guidance]
last_updated: [YYYY-MM-DD]
---

# [Domain Name]

## Key Facts
- [Stable facts — rarely change]

## Current Context
- [What's active right now — updated most often]

## Reference Files
- `references/[file].md` — [one-line description]
```

**Step 4 — Create reference files** if detail is too dense for the briefing (see Procedure 3)

**Step 5 — Update `_index.md`**
The PostToolUse hook auto-regenerates `_index.md` whenever a `memory.md` is written.
If the hook hasn't fired, add the entry manually:
```
- **[domain-path]** — [description matching memory.md frontmatter]
```

**Step 6 — Update namespace overview** if one exists (e.g. `audit/memory.md` when adding a new engagement)

---

## Procedure 2: Update an Existing Domain

**When:** user says "update memory about X", "add this to X memory", new facts emerged in session

**Step 1** — Read the existing `memory.md`

**Step 2** — Identify what changed:
- New stable fact → add to `## Key Facts`
- Shifting context → update `## Current Context`
- Content in `## Current Context` that's now stable → move to `## Key Facts`
- Growing section approaching line limit → move to a reference file (see Procedure 3)
- Stale facts → remove or archive

**Step 3** — Edit content. Prefer targeted edits over rewrites. Update in place, don't append.

**Step 4** — Update `last_updated` in frontmatter to today's date.

**Step 5** — If the `description` changed: the hook will sync `_index.md` automatically on next write. Otherwise verify the _index.md entry still matches.

---

## Procedure 3: Create a Reference File

**When:** detail is too dense for memory.md, or a section has grown past the line limit

**Step 1** — Name the file for its topic: `references/[topic].md`
- Good topic stems: `controls-rcm`, `systems`, `issues`
- Avoid generic topic stems like `notes` or `misc`

**Step 2** — Write the file. **No YAML frontmatter.** Reference files are supporting documents, not domain files.

**Step 3** — Add a pointer in the parent `memory.md` under `## Reference Files`:
```
- `references/[topic].md` — [one-line description of what's in it]
```

**Step 4** — If you moved content from `memory.md`, remove that content and replace with the pointer.

**Rule:** One topic per reference file. Multiple small files beat one large one.

### Importing Full Source Documents

**When:** external files (policies, procedures, RCMs, GAU notes, transcripts, manuals) exist on disk or external drives and should be preserved as reference material.

**Principle:** `memory.md` is the summary/navigation layer. Reference files are the **complete source layer**. Do not summarize or condense external documents when importing — store the full content. The memory.md already provides the condensed view; references should enable full look-back without needing the original source.

**Step 1** — Copy the file into `references/` with a descriptive kebab-case name (e.g., `tplc-procedures-full.md`, `sr-11-7-full.md`).

**Step 2** — Add a pointer in the parent `memory.md` under `## Reference Files`.

**Step 3** — If the original is a `.txt` file, rename to `.md` on import for consistency.

**Step 4** — SVGs and other non-text assets are acceptable in `references/`.

**Rule:** Full source files do not count against the memory.md line limit. They have no line limit and no frontmatter.

**Rule — No external path references:** Never reference file paths outside the memory tree in `memory.md`, `_notes.md`, or reference files. Paths like `~/Downloads/`, `~/Work/`, `~/Desktop/`, or any location outside the memory root are brittle — files move, sessions end, Downloads get cleared. If a file at an external path is relevant, copy it into `references/` first, then cite the memory-internal path. This applies to all content: testing plans, workpapers, transcripts, exported documents, screenshots, and any other artifacts.

---

## Procedure 4: Quality Review

**When:** user says "review memory quality", "audit memory", or after a batch update

**Quick structural check (automated):**
```bash
python3 ~/.pi/agent/skills/memory-creator/scripts/check_quality.py
# Or for a specific tree:
python3 ~/.pi/agent/skills/memory-creator/scripts/check_quality.py --root ~/work/Memory
```
Checks: frontmatter completeness, line counts, _index.md sync, orphan reference pointers, non-standard frontmatter in reference files.

**Deep domain review (agent-assisted):**
Launch with instructions from `agents/quality-auditor.md` for content quality review of a specific domain — currency, stability, depth calibration, description accuracy.

**Staleness check:**
```bash
python3 ~/.pi/agent/skills/memory-creator/scripts/check_stale.py --threshold 60
```
Reports domains not updated in >60 days.

**Manual checklist:**
- [ ] All memory.md files ≤60 lines
- [ ] _index.md entries match memory.md frontmatter descriptions
- [ ] Namespace overviews reflect current active/closed state
- [ ] No orphan reference pointers
- [ ] No reference files with YAML frontmatter

---

## Procedure 5: Optimize Description

The `description` frontmatter field determines routing accuracy. The LLM reads it from `_index.md` and decides whether to load the domain. **This is the highest-leverage thing to tune.**

**Rules:**
1. Say *when to load*, not *what it contains*
2. Include natural-language query variants a user would actually write
3. Add exclusion language when domain boundaries are fuzzy ("not about X")
4. Include synonyms — "panel numbers", "lab results", "blood work" all refer to the same thing

**Empirically validated examples** (from paraphrased eval testing — these fixed actual routing failures):

| Failure | Root Cause | Fix Applied |
|---------|-----------|-------------|
| "What's my typical daily rhythm?" → routed to `personal/hobbies` | `personal` didn't mention "rhythm" | Added "typical daily rhythm, usual daily pattern" to `personal` |
| Same query misrouted | `personal/hobbies` claimed daily routine territory | Added "not general daily routine or typical daily rhythm" exclusion |
| "How are my recent panel numbers looking?" → routed to `projects` | `personal/health` lacked "panel" variants | Added "how do my panel numbers look, recent panel numbers" |
| "/loop extension status?" → went to `projects` (wrong) | `projects` had "status" language; `pi-agent` lacked "/loop" | Removed "status" from `projects`; added "/loop extension" to `pi-agent` |
| "What's Kody working on?" → over-broad match | `projects` overlapped with individual project domains | Narrowed to "high-level inventory"; added "for individual project details, load the specific domain" |

**Pattern:** Descriptions fail on paraphrased queries. Keyword-dense descriptions fail on semantic variants. Fix by adding the *synonym* or *exclusion* that targets the specific failure.

**Weak vs. strong examples:**
```
WEAK:   "Personal hobbies and recreation — hot yoga, exercise, interests."
STRONG: "Personal physical exercise and recreation — hot yoga, fitness, workout routines.
         Use when discussing exercise habits, scheduling around yoga. Not about general
         daily routine, typical daily rhythm, or work schedule."

WEAK:   "Active side projects overview."
STRONG: "High-level inventory of all active side projects. For individual project details,
         load the specific project domain instead."
```

---

## Procedure 6: Write Session Notes to `_notes.md`

**When:** Content is session-specific, in-progress, or not yet stable enough for `memory.md` — but worth preserving for Dream's weekly review cycle.

**Step 1** — Identify the target domain (same routing as Procedure 2).

**Step 2** — Append to `[domain]/_notes.md`. Create if it doesn't exist.

**Step 3** — Format with a date-stamped block:
```markdown
<!-- YYYY-MM-DD session note -->
- [observation or context fragment]
```

**Rule:** `_notes.md` is append-only. Never edit or remove existing entries — Dream handles cleanup after promotion. No frontmatter. No size limit.

**When to use vs. `memory.md`:**
- `memory.md` → confirmed stable facts unlikely to change before next Dream cycle
- `_notes.md` → working context, in-progress state, or observations that benefit from Dream's verification before promotion

Dream's `review-domain` reads `_notes.md` alongside `memory.md` and synthesizes relevant content into the domain update. After a successful update, Dream clears `_notes.md` automatically.

---

## Lifecycle Management

**Active** — domain in `_index.md`, loaded on demand.

**Completed** — remove from `_index.md` and the namespace overview. Keep files in place for historical reference; they won't be auto-suggested but remain readable.

**Archive** — if files are no longer relevant historically, move to a `historical/` subdirectory.

Do not delete completed engagement files — they are useful as prior-year references.

---

## End-of-Session Memory Check

At natural stopping points, autonomously evaluate and apply updates:

1. Did this session produce new facts about the user, a project, or an engagement?
2. Does the content belong in a `memory.md` briefing, a `references/` file, or a `_notes.md` session note?
3. Does anything in an existing `memory.md` need updating or pruning?
4. Does `_index.md` still reflect current state? (Hook handles this automatically for `memory.md` writes.)

Use `_notes.md` for content that is real but session-specific or in-progress (see Procedure 6). Dream sweeps these during its weekly cycle.

**Apply updates directly** — memory is Pi's persistent context. No permission required. Only mention changes in the session if they're relevant to answering the user's question.

---

## Bundled Resources

- `references/domain-schema.md` — schema reference for memory.md and _index.md formats
- `scripts/check_quality.py` — structural quality validator (run after bulk changes)
- `scripts/check_stale.py` — staleness checker (reports domains >N days since last_updated)
- `agents/quality-auditor.md` — deep quality review agent for a specific domain
