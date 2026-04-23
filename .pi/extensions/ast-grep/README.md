# ast-grep Pi extension

This extension keeps two explicit lanes and now treats the ast-grep book as the fidelity target for the behavior it claims to support.

Phase 1 is the NAPI-first lane for fast matcher iteration and structured code search. It stays local and does not hide `sg` fallbacks inside the interactive tools.

Phase 2 is the CLI-backed lane for ast-grep project workflows that depend on `sg`, `sgconfig.yml`, rule tests, injected-language scanning, debug-query inspection, and the richer JSON scan contract.

## Fidelity contract

For supported workflows, the extension now aims to preserve native ast-grep semantics and data rather than collapsing them into a thinner Pi-specific shape. That means phase-1 matcher semantics follow native pattern-object and strictness behavior more closely, while phase-2 project tools preserve labels, captures, replacement data, byte offsets, and structured rule-test failures.

What remains intentionally outside the modeled tool surface is mutation. The extension still does not expose interactive apply flows, `--update-all`, snapshot mutation, or scaffolding commands as normal Pi tools. Those remain a raw CLI escape hatch on purpose.

## Capability matrix

Supported well:
- `ast_test`, `ast_find`, and `ast_rewrite_preview` for built-in NAPI languages
- pattern objects with optional `selector`
- strictness values `cst`, `smart`, `ast`, `relaxed`, `signature`, and `template`
- `ast_debug_query` with `selector`, `strictness`, `pattern`/`ast`/`cst`/`sexp`, and optional `configPath`
- `ast_rule_test` with structured `cases`, `issues`, `notices`, and lossless `rawOutput`
- `ast_project_scan` with preserved scan fields including labels, metavariables, replacement data, metadata, and byte offsets
- CLI-lane injected-language scanning, for example JavaScript embedded in HTML

Supported with an explicit boundary:
- phase-1 interactive matching is limited to the built-in NAPI language surface rather than the full ast-grep CLI language list
- custom languages belong in the CLI lane today, especially when `sgconfig.yml` is required
- `ast_rewrite_preview` is still a narrow preview tool for replacement templates, not a YAML `fix` or rewriter engine

Intentionally omitted:
- interactive apply flows
- `--update-all`
- snapshot mutation
- `sg new`
- first-class Pi tools for mutating rewrite/apply workflows

## Phase 1 tools

`ast_test` runs a matcher against a provided snippet and returns structured matches with 1-based line and column ranges, captures, and transformed metavars when the matcher exposes them. If a simple pattern returns no matches, the tool nudges the agent toward `matcher.context` and, when needed, `matcher.selector`.

`ast_find` runs the same matcher shape across one or more paths relative to `ctx.cwd`. It returns structured file matches, sorts them deterministically, and keeps the phase-1 scope honest by staying independent of `sgconfig.yml`, project rule discovery, and CLI test workflows.

`ast_rewrite_preview` previews replacements on a snippet or a single file without mutating anything. It supports literal replacement text plus `$NAME` placeholders for single captures or transformed metavars. It still does not model YAML `fix`, rewriters, or apply behavior.

Phase 1 uses the built-in NAPI language surface. Canonical values are `javascript`, `typescript`, `tsx`, `html`, and `css`, with friendly aliases like `js`, `jsx`, `ts`, and `htm` accepted where they map to the same parser.

## Phase 2 tools

`ast_debug_query` wraps `sg run --debug-query` for parse inspection. It takes a raw query string, a language, optional `selector`, optional `strictness`, optional `configPath`, and a debug format (`pattern`, `ast`, `cst`, or `sexp`). It still runs against an empty temp directory so the debug view is not polluted by repo matches.

`ast_rule_test` wraps `sg test` in a read-only way. It supports config discovery, optional `configPath`, optional `testDir`, optional `snapshotDir`, rule filtering, `includeOff`, and `skipSnapshotTests`. In addition to `rawOutput`, it now returns structured pass/fail cases, notices, and classified issue blocks like missing snapshots, unexpected matches, and missing expected findings. When `sg test` says `Configuration not found! <rule-id>` for a rule that exists but is `severity: off`, the extension upgrades that notice to `severity_off_excluded` and preserves the raw CLI text separately.

`ast_project_scan` wraps `sg scan` with `sgconfig.yml` discovery and structured JSON parsing. It preserves the useful scan contract instead of reducing it to a thin summary, including labels, metavariable captures, replacement data, metadata, and byte offsets. When `reportStyle` is provided, the tool also captures the human-readable diagnostic scan in that style.

## Matcher shape

The phase-1 tools share the same matcher contract.

For a simple pattern, pass `matcher.pattern`.

For ambiguous or partial snippets, pass `matcher.context`, and add `matcher.selector` when you need to control which node the pattern object extracts. That is also where `matcher.strictness` applies in this extension.

For relational or composite rules, pass `matcher.rule`. You can also add `matcher.constraints`, `matcher.utils`, and `matcher.transform` there.

The code keeps three durable seams on purpose: matcher normalization, result shaping, and the small CLI helper module. There is still no hidden CLI fallback inside the phase-1 tools.

## Output limits

Tool output uses Pi's standard truncation utilities. Results are truncated to 2000 lines or 50KB, whichever is hit first. When truncation happens, the full structured result is written to a temp file and the tool tells the model where to find it.

## Remaining CLI escape hatch

Raw `/opt/homebrew/bin/sg` via `bash` still matters for workflows this extension does not model as tools, especially interactive apply flows, `--update-all`, snapshot mutation, inline project scaffolding, and other mutating or highly bespoke CLI usage.

## Local validation

From the extension root:

```bash
npm install
npm test
```

The project CLI fixtures live under `test/fixtures/project-cli/`, and parser-only captured outputs live under `test/fixtures/cli-output/`.
