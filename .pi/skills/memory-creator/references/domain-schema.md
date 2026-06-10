# Domain Memory Schema

## memory.md Format

```yaml
---
domain: [string]          # Path relative to Memory root (e.g., "personal/health", "work/audit")
description: [string]     # One-line description for index matching (max ~200 chars)
last_updated: [YYYY-MM-DD]
---
```

### Required Sections
- **Key Facts** — stable, curated information
- **Current Context** — what's active/relevant now (most frequently updated section)

### Optional Sections
- **Reference Files** — pointers to references/ directory
- **History** — brief timeline of major changes (prefer reference files for detailed history)

## _index.md Format

```markdown
# Memory Domains — [Scope]

## [Category]
- **[domain-path]** — [one-line description matching memory.md frontmatter]
```

Each entry should be specific enough for a model to decide relevance from one line.

## Directory Structure

```
[Memory Root]/
├── _index.md
├── [domain]/
│   ├── memory.md
│   └── references/
│       ├── [topic].md
│       └── [data].json
└── [domain]/[subdomain]/
    ├── memory.md
    └── references/
```

## Reference File Types

| Type | Description | Example |
|------|-------------|---------|
| Extracted detail | Content moved from memory.md when it outgrew the line limit | `controls-rcm.md` |
| Full source document | Complete external file imported for look-back | `tplc-procedures-full.md`, `sr-11-7-full.md` |
| Meeting notes | GAU notes, agendas, transcripts | `gau-contracting-notes.md` |
| Data artifacts | SVGs, flow diagrams | `risk-reporting-data-flow.svg` |

Reference files have **no frontmatter** and **no line limit**. One topic per file.

## Injection Scope

| CWD | Index Injected |
|---|---|
| ~/work/* | ~/work/Memory/_index.md |
| ~/projects/* | ~/projects/Memory/_index.md |
| ~ (other) | ~/projects/Memory/_index.md |

Work and personal memory are strictly segregated. No cross-injection.
