# Code Exploration: ast-grep Phase-2 CLI Tool Integration

## Scope

Traced the full implementation surface of the `pi-ast-grep-extension` to identify reuse seams, test patterns, and the minimum touch points for adding three approved Phase-2 CLI-backed tools (`ast_debug_query`, `ast_rule_test`, `ast_project_scan`) without touching Phase-1 behavior. Also inspected the `ast-grep` skill guidance, the `sg` CLI surface, and neighboring Pi extension patterns.

**Traced:**
- `index.ts` — all tool registrations, run functions, shared utilities
- `package.json` — extension entry, dependency declarations, scripts
- `README.md` — Phase-1 contract, tool descriptions
- `integration-review.md` — MEDIUM/LOW findings, reuse candidates, blast radius
- `test/ast-grep.test.mjs` — 10 regression tests covering all Phase-1 paths
- `test/fixtures/sample.ts` — stable 3-match fixture
- `~/.pi/agent/skills/ast-grep/SKILL.md` — tool-order guidance, CLI escape hatch docs
- `sg test --help`, `sg scan --help`, `sg run --help` — CLI flag surface for Phase-2 tools
- `pi-subagent` and `lsp` extension patterns for comparison

**Not traced:** The Pi runtime internals (`ExtensionAPI`, `registerTool`), the NAPI `@ast-grep/napi` library implementation (treated as a black box), or Pi's truncation utilities beyond their use.

---

## Entry Points

### Extension entry

**`index.ts` — `export default function astGrepExtension(pi: ExtensionAPI)`** (line ~350)

This is the single extension entry registered via `package.json`'s `"pi": { "extensions": ["./index.ts"] }`. Called once per Pi session startup. Phase-2 tools must be registered alongside the three existing ones here. Nothing else needs to change.

### Test entry

**`test/ast-grep.test.mjs`** — Node `--test` runner, ESM

```bash
npm test  # runs: node --test test/*.mjs
```

Each exported `run*` function is tested directly (no full Pi runtime). Phase-2 `run*` functions must follow the same pattern for testability without a Pi harness.

---

## Execution Flow

### Phase-1 flow (existing, must not change)

```
pi.registerTool (ast_test)
  → runAstTest(params)
    → resolveLanguage()
    → normalizeMatcher()
    → parse(lang, snippet)
    → root.findAll(config)
    → buildMatchRecord() × N
    → shapeToolResponse()
    → return { content, details }

pi.registerTool (ast_find)
  → runAstFind(params, ctx.cwd)
    → resolveLanguage()
    → normalizeMatcher()
    → params.paths.map(resolveUserPath)
    → findInFiles(lang, { paths, matcher, languageGlobs }, callback)
    → buildMatchRecord() × N
    → shapeToolResponse()
    → return { content, details }

pi.registerTool (ast_rewrite_preview)
  → runAstRewritePreview(params, ctx.cwd)
    → resolveLanguage()
    → normalizeMatcher()
    → resolveUserPath(params.path) or use snippet
    → parse(lang, source)
    → root.findAll(config)
    → interpolateReplacement() × N
    → root.commitEdits()
    → shapeToolResponse()
    → return { content, details }
```

### Phase-2 flow (to add, all CLI-backed)

```
pi.registerTool (ast_debug_query)
  → runAstDebugQuery(params, ctx.cwd)
    → resolveLanguage()
    → build sg run --debug-query command
    → spawn execFile with --color=never
    → parse stdout as CST/tree-sitter output
    → shapeToolResponse()
    → return { content, details }

pi.registerTool (ast_rule_test)
  → runAstRuleTest(params, ctx.cwd)
    → resolve paths (testDir, snapshotDir, config)
    → build sg test command with flags
    → spawn execFile
    → parse stdout (color-stripped text OR JSON if supported)
    → shapeToolResponse()
    → return { content, details }

pi.registerTool (ast_project_scan)
  → runAstProjectScan(params, ctx.cwd)
    → resolve paths, inline rules, globs
    → build sg scan command with flags
    → spawn execFile with --json or --format options
    → parse JSON/SARIF output
    → shapeToolResponse()
    → return { content, details }
```

---

## Architecture Map

### Layers

| Layer | Location | Responsibility |
|---|---|---|
| Tool registration | `index.ts` bottom (~350+) | `pi.registerTool()` calls |
| Run functions | `index.ts` middle (~280–350) | Business logic per tool |
| Matcher normalization | `index.ts` (~100–230) | `normalizeMatcher`, `resolveLanguage`, `collectMetavariableNames` |
| Result shaping | `index.ts` (~230–280) | `shapeToolResponse`, `buildMatchRecord`, `toDisplayRange` |
| Utilities | `index.ts` top (~1–100) | `resolveUserPath`, `compareMatches`, `formatMatcherError` |
| Type exports | `index.ts` middle | `AstTestParams`, `AstFindParams`, `AstRewritePreviewParams`, result interfaces |
| Test harness | `test/ast-grep.test.mjs` | Direct unit tests of `run*` functions |
| Skill guidance | `~/.pi/agent/skills/ast-grep/SKILL.md` | Agent-facing tool ordering, CLI escape hatch |

### Key modules and responsibilities

- **`normalizeMatcher`** — Single function that handles all three matcher shapes (pattern, pattern_object, rule). Any new tool that accepts matchers should reuse this. Phase-2 tools may not accept matchers at all (see below).
- **`shapeToolResponse`** — Truncation, temp-file write, text+details split. All Phase-2 tools should use this.
- **`resolveUserPath`** — `~` expansion, `@` prefix stripping, relative-to-absolute resolution. Reusable for any tool that takes paths.
- **`toDisplayPath`** — Converts absolute path to cwd-relative. Reusable.
- **`compareMatches`** — Deterministic sort: file → line → column → text. Reusable for any match-list output.
- **`formatMatcherError`** — Wraps NAPI errors with optional `noMatchHint`. Reusable for error shaping.
- **`interpolateReplacement`** — `$NAME` capture interpolation. Only used by `ast_rewrite_preview`; not reusable for Phase-2.

### Important abstractions

- **`MatcherInput`** interface — The normalized input contract all Phase-1 matchers share. Phase-2 tools (`ast_debug_query`, `ast_rule_test`, `ast_project_scan`) may not need matchers at all — they operate on YAML rules or inline CLI rules instead.
- **`BaseStructuredResult`** interface — Shared result skeleton used by all three Phase-1 tools. Phase-2 tools should return results compatible with `shapeToolResponse`.
- **`ToolResponseDetails`** interface — The `details` field shape returned by all tools. Phase-2 tools should populate the same shape.
- **TypeBox schemas** — `AstTestParamsSchema`, `AstFindParamsSchema`, `AstRewritePreviewParamsSchema`. Phase-2 tools need their own schemas.

---

## Dependencies and Integrations

| Dependency | Role | Integration point |
|---|---|---|
| `@ast-grep/napi` | Phase-1 NAPI layer | `index.ts` imports: `findInFiles`, `Lang`, `parse`, `NapiConfig`, `Range`, `SgNode` |
| `@sinclair/typebox` | JSON-schema parameter validation | `index.ts` imports: `Type`; all schemas defined with TypeBox |
| `@mariozechner/pi-coding-agent` | Pi runtime types, truncation utils | `index.ts` imports: `ExtensionAPI`, `TruncationResult`, `DEFAULT_MAX_BYTES`, `DEFAULT_MAX_LINES`, `formatSize`, `truncateHead` |
| `/opt/homebrew/bin/sg` | Phase-2 CLI (ast-grep binary) | New tools: `spawn`/`execFile` to invoke `sg test`, `sg scan`, `sg run --debug-query` |
| `node:child_process` | CLI invocation | Phase-2 tools: `execFile`/`spawn` for `sg` subprocess |
| `node:fs/promises` | File I/O for fixtures and temp output | Already used for `readFile`, `writeFile`, `mkdtemp` |
| Pi extension discovery | Package-level `pi.extensions` | `package.json` — no code change needed |

### External binaries and their critical flags

**`sg run --debug-query`** (for `ast_debug_query`):
- `--pattern` / `-p`: the pattern string
- `--lang` / `-l`: language
- `--selector`: optional AST kind selector
- `--debug-query=<format>`: `pattern` or `cst` — prints tree-sitter AST for the pattern
- `--color=never`: suppress ANSI codes in output

**`sg test`** (for `ast_rule_test`):
- `-t, --test-dir`: test YAML directories
- `--snapshot-dir`: snapshot directory name (default `__snapshots__`)
- `--skip-snapshot-tests`: validate without checking output
- `-U, --update-all`: update all changed snapshots
- `-f, --filter`: regex filter on rule IDs
- `-c, --config`: `sgconfig.yml` path
- `--include-off`: include severity:off rules
- `--color=never`: suppress color codes

**`sg scan`** (for `ast_project_scan`):
- `--rule` / `-r`: single rule file path
- `--inline-rules`: inline rule YAML (separated by `---`)
- `--format`: `github` or `sarif` for structured output
- `--json[=<style>]`: `pretty`, `stream`, `compact`
- `--report-style`: `rich`, `medium`, `short`
- `--include-metadata`: include rule metadata (requires `--json`)
- `--filter`: regex on rule IDs
- `-c, --config`: `sgconfig.yml` path
- `--error`, `--warning`, `--info`, `--off`: severity overrides
- `--no-ignore`: `hidden`, `dot`, `exclude`, `global`, `parent`, `vcs`
- `--globs`: include/exclude patterns
- `--files-with-matches`: paths only mode
- `--max-results`: limit
- `--color=never`: suppress color codes
- `[PATHS]...`: positional paths (default `.`)

---

## Essential Files

1. **`index.ts`** — The only code file. All additions go here: new run functions, new schemas, new tool registrations. Start from the bottom (`astGrepExtension`) for registrations, middle for run functions, top for shared utilities.
2. **`test/ast-grep.test.mjs`** — Mirror existing test patterns: direct unit tests of `run*` functions, `withTempDir` helper for file I/O tests, fixture-based integration tests. Add parallel test blocks for each Phase-2 tool.
3. **`package.json`** — No changes needed for Phase-2 (tool names are new, no new dependencies).
4. **`README.md`** — Update "Phase 1 intentionally stays away" to reference Phase-2 tools. No structural changes needed.
5. **`~/.pi/agent/skills/ast-grep/SKILL.md`** — Update "CLI escape hatch" section to reclassify `sg test`, `sg scan`, and `sg run --debug-query` from escape-hatch to first-class tools. Tool-order guidance should reference Phase-2 tools. Rule authoring content remains valid.

---

## Observations

### Strengths

- **Clean two-seam architecture**: Matcher normalization and result shaping are the only durable seams. Phase-2 tools can reuse result shaping but bypass matcher normalization entirely (CLI takes YAML/inline rules).
- **Testability without Pi runtime**: All `run*` functions are pure-ish (no Pi runtime needed), enabling direct unit tests. `withTempDir` and `fixtureRoot` patterns are already established.
- **Extension discovery is standard**: `package.json` uses the correct `pi.extensions` entry, matching all other extensions.
- **`sg` is already documented as the CLI escape hatch**: The skill already says "raw `/opt/homebrew/bin/sg` via `bash`" for `sgconfig`, `ast-grep test`, `scan`, and apply workflows. Phase-2 just gives these first-class tool wrappers.

### Likely touch points

| Location | What changes |
|---|---|
| `index.ts` top — imports | Add `execFile`/`spawn` from `node:child_process`; possibly `extract` for color stripping |
| `index.ts` — after existing interfaces | Add `AstDebugQueryParams`, `AstRuleTestParams`, `AstProjectScanParams` interfaces |
| `index.ts` — TypeBox schemas | Add `AstDebugQueryParamsSchema`, `AstRuleTestParamsSchema`, `AstProjectScanParamsSchema` |
| `index.ts` — run functions block | Add `runAstDebugQuery`, `runAstRuleTest`, `runAstProjectScan` |
| `index.ts` — `astGrepExtension` | Add three more `pi.registerTool()` calls |
| `test/ast-grep.test.mjs` imports | Add imports for new run functions |
| `test/ast-grep.test.mjs` | Add test blocks for each Phase-2 tool (see test patterns below) |
| `README.md` | Add Phase-2 section; update Phase-1 scope statement |
| `SKILL.md` | Reclassify `sg test`/`sg scan`/`sg run --debug-query` from escape hatch to first-class; update tool order |

### Test patterns for Phase-2 tools

**`ast_debug_query`**:
- Test pattern parse success with `--debug-query=pattern`
- Test CST output with `--debug-query=cst`
- Test language resolution
- Test CLI error propagation (invalid pattern syntax)
- No file I/O needed; fixture-based if real code snippets are needed

**`ast_rule_test`**:
- Test on `test/fixtures` directory with a real `sgconfig.yml` + rule file in fixtures
- Test `--filter` flag
- Test `--skip-snapshot-tests`
- Test `--update-all` behavior (may need snapshot fixtures)
- Test error propagation from CLI failures
- May need a `test/rules/` subdirectory in fixtures with a real rule YAML

**`ast_project_scan`**:
- Test on `test/fixtures` directory with inline `--inline-rules`
- Test `--format=github` and `--json` output parsing
- Test `--files-with-matches`
- Test `--max-results`
- Test `--filter` regex on rule IDs
- Test `paths` resolution with `resolveUserPath`

### Gotchas

1. **`sg` output color codes**: `sg test` and other commands print ANSI color codes by default (auto-detected from TTY). Must pass `--color=never` to get clean text for parsing. This is a common mistake — the current skill examples don't include this flag.

2. **`sg test` does not have a `--json` output format** (verified from `--help`): The test command only outputs text. `ast_rule_test` must parse text output and color-strip it. Consider using `strip-ansi` or a manual regex. `sg scan` does have `--json` and `--format` options — parse those for structured results.

3. **`sg scan --json` output shape**: The JSON output is an array of match objects. Need to inspect the actual schema to map it to `MatchRecord`-compatible output. The `--json=stream` style may be easier to parse incrementally.

4. **`sg scan --inline-rules` separator**: Multiple inline rules are separated by `---` on its own line. `runAstProjectScan` needs to accept an array of rule YAML strings and join them.

5. **`sg scan --stdin`**: The CLI supports `--stdin` for piping code. This doesn't map cleanly to the tool's path-based paradigm. If needed, consider a separate `snippet` parameter for `ast_project_scan` that pipes to `--stdin`.

6. **Phase-1 `ast_find` is NOT the same as `sg scan`**: They must coexist as separate tools. `ast_find` uses NAPI with the same matcher contract. `sg scan` uses `sgconfig.yml` discovery and YAML rules. Conflating them would break the Phase-1 contract.

7. **`sgconfig.yml` discovery**: `sg scan` and `sg test` auto-discover `sgconfig.yml` in the project root. `runAstRuleTest` and `runAstProjectScan` should accept an optional `--config` override but default to the CLI's default discovery behavior.

8. **`resolveUserPath` does not exist in isolation**: It's an exported function used by tests. Phase-2 tools should reuse it rather than reimplementing path resolution.

9. **`shapeToolResponse` expects `BaseStructuredResult`-compatible objects**: The Phase-2 tools' run functions should return objects with at least `tool`, `language`, `matched`, `matchCount`, `matches` fields so `shapeToolResponse` can truncate them. For tools that don't produce matches (like `sg test`), adapt the output format accordingly.

10. **`ast_rewrite_preview` non-mutation invariant must not change**: The `index.ts` comment "No `withFileMutationQueue` needed because ast_rewrite_preview reads from the file system but does not write" stays true. Phase-2 tools that invoke `sg scan --update-all` or `sg test --update-all` DO write files — they should be clearly documented as mutating tools with a warning.

11. **No new npm dependencies for Phase-2**: All Phase-2 tools use the existing `sg` binary and Node.js built-ins. No new packages needed.

12. **`test/fixtures` may need subdirectories**: If `sg test` needs rule files and snapshot directories, those need to exist under `test/fixtures/`. The extension currently only has `sample.ts`. Adding a `test/fixtures/rules/` directory is low-cost.

13. **`npm test` runs `node --test test/*.mjs`**: The glob `test/*.mjs` means any new test files matching this pattern will auto-run. No `package.json` change needed.

14. **Worker availability**: Phase-2 tools use `execFile`/`spawn` via `bash` equivalent — they will work in worker sessions the same way the existing tools do. No special worker guards needed.
