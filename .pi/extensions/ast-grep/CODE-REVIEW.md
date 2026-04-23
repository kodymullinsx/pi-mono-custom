# Code Review: ast-grep Extension Alignment vs Book Concepts

Reviewed files:
- `extensions/ast-grep/index.ts`
- `extensions/ast-grep/cli.ts`
- `extensions/ast-grep/test/ast-grep.test.mjs`
- `extensions/ast-grep/test/ast-grep-cli.test.mjs`
- `extensions/ast-grep/README.md`
- `skills/ast-grep/SKILL.md`

Reference standard: ast-grep book concepts (valid patterns/context selectors, strictness semantics, project config/testing, fixes/rewriters/transforms, labels, JSON output, pipeline use, custom languages/injection, architectural boundaries).

---

## Stage 1: Spec Compliance

The extension's README and SKILL.md describe the two-lane architecture correctly and the README is honest about what it does not cover. There are no spec compliance issues in the sense of implementing the wrong thing — the design intent is coherent. However, several book concepts are entirely absent or structurally under-supported, which reduces robustness and fidelity. These are categorized below as **gaps**.

---

## Stage 2: Code Quality

### Summary

The extension is well-structured for what it covers. Matcher normalization, result shaping, and the CLI layer separation are all sound. Error messages, path resolution, and truncation are handled carefully. However, the surface area is meaningfully narrower than the ast-grep book's full scope in ways that are not just "features I haven't added yet" — some of these gaps create incorrect behavior when users hit them (labels silently dropped), some create fragility (wrong exit code handling), and some represent missing primitives that prevent users from expressing legitimate workflows.

---

## Critical Issues

### 1. Labels are parsed from the CLI but silently dropped from output

**Files**: `cli.ts`, `index.ts`
**Severity**: Medium

The `scan-stream.jsonl` fixture contains `labels` arrays in the JSON output:
```json
"labels":[{"text":"console.log(\"bad\")","range":{"byteOffset":{...},"style":"primary"}]
```

`parseProjectScanStream` in `cli.ts` extracts `file`, `ruleId`, `severity`, `message`, `text`, `range`, `note`, and `metadata` — but never reads `labels`. The `ProjectScanFinding` interface has no `labels` field. The extension silently discards the labels data.

The book describes labels as part of the structured finding output. For an extension that explicitly surfaces structured findings, dropping this field means the result is incomplete. Downstream consumers cannot reconstruct the label information.

**Fix**: Add `labels?: Label[]` to `ProjectScanFinding` and parse it in `parseProjectScanStream`.

---

### 2. Diagnostic output capture unconditionally doubles CLI invocations

**File**: `cli.ts` — `runAstProjectScan`
**Severity**: Medium

When `reportStyle` is provided, the function runs `sg scan` twice:
1. Once with `--json=stream` for structured findings
2. Once with `--report-style=<style>` for human-readable diagnostic output

The second invocation is non-trivial. It re-parses the target files, re-evaluates rules, and re-emits output — only to capture a text representation of the same scan. The diagnostic output is then attached to the result as `diagnosticOutput`, but no flag lets the caller opt out of this second pass if they only want structured findings.

For large repos or slow scans, this effectively doubles execution time.

**Fix**: Separate the diagnostic capture intent from the JSON capture, or make it explicit that diagnostic output requires a second pass (though this may be acceptable given the current description).

---

### 3. Exit code validation is fragile for `runAstDebugQuery`

**File**: `cli.ts` — `runAstDebugQuery`
**Severity**: Low

```typescript
if (![0, 1].includes(result.exitCode) || !output) {
  throw normalizeCliError("ast-grep debug-query failed.", result);
}
```

The `!output` guard conflates two failure modes: bad exit code vs empty output. If ast-grep adds a new exit code or if the output is legitimately empty for some query, the tool will throw even for a valid run. The "pattern not found" case is the expected exit code 1, but the emptiness check makes the condition behave like a catch-all.

**Fix**: Separate the exit code check from the output length check with distinct error messages.

---

## Recommendations

### Pattern / Context Selector Gaps

**4. NAPI `findInFiles` has no `matchDepth` or `maxResults` early-exit**

The `findInFiles` API is used directly in `runAstFind` without any depth or count bounds. The book describes `stopBy` semantics for relational rules, but the NAPI layer doesn't expose this control. For large codebases, the callback can fire thousands of times before the caller can intervene.

**Severity**: Low (mitigated by `ast_project_scan`'s `maxResults`)

---

**5. No `kind` shortcut in matcher schema — only `pattern`, `context`, `selector`, `rule`**

The rule_reference documents `kind` as a first-class atomic rule (matching by tree-sitter node kind like `call_expression`). The extension's `MatcherSchema` does not expose `kind` directly. A user must go through `matcher.rule` with `kind: call_expression`.

This is deliberate and arguably correct (keeps the surface minimal), but the book presents `kind` as a primary construct, not just a rule-object field. Agents reading the rule_reference may expect a `matcher.kind` shortcut.

**Fix (optional)**: Document that `matcher.rule` with `kind` is the intended path for kind-based matching.

---

**6. No `regex` shortcut in matcher schema**

Similarly, `regex` is a first-class atomic rule in the book. Not exposed.

---

### Strictness Semantics

**7. Strictness is only accepted for `context` + `selector` mode, not for top-level patterns**

`normalizeStrictness` is called only in the `if (context)` branch in `normalizeMatcher`. If a user passes `strictness` with a `pattern`, it gets silently ignored or the normalization throws. This behavior is correct — `strictness` only applies to parsed pattern objects — but the error message if `strictness` is passed with `pattern` alone is unclear.

**Severity**: Low (correct but undocumented edge)

---

**8. No test coverage for all five strictness values**

`STRICTNESS_VALUES = ["cst", "smart", "ast", "relaxed", "signature"]` is defined but only `"smart"` is tested in `ast-grep.test.mjs`. The other four have no regression coverage.

---

### Project Config / Testing

**9. `sg new` scaffolding is never exposed**

The book describes `sg new` for creating project structure, rules, and tests. The README correctly lists this as an escape-hatch CLI workflow, but there is no `ast_scaffold` or similar tool. For a user who wants to bootstrap a new ast-grep project from scratch via the agent, they must know to drop to raw `bash` with `sg new`.

**Fix (optional)**: Document explicitly in SKILL.md that `sg new` requires raw bash.

---

**10. No utility rule discovery or `matches` support via NAPI**

The book documents `matches: utility-rule-id` for composite rules that reference utility rules. The extension handles `matcher.utils` in the rule object but only as an object-pass-through. There is no tool that discovers what utility rules are available in a project.

---

**11. Rule tests do not expose per-rule detail beyond pass/fail summary**

`parseRuleTestSummary` parses a count-based summary from ANSI-stripped output. If a rule test fails, the extension returns `summary.failedCount: 1` but does not surface which rule failed, the specific assertion mismatch, or the diff. This is partially acceptable given the "read-only" constraint, but `rawOutput` is included so callers can inspect it — however, `rawOutput` is not part of the tool's structured result, only added in `runAstRuleTest`'s return value.

**Fix**: Ensure `rawOutput` is always included in the result for inspection.

---

### Fixes / Rewriters / Transforms

**12. YAML `fix` field is never modeled**

The book describes `fix` as a first-class rule field in the sgconfig.yml schema (separate from `rule`). A rule can have both a `rule` (for matching) and a `fix` (for structured rewrite). The extension's `ast_rewrite_preview` does text interpolation only — it does not parse or apply YAML `fix` blocks.

For users who have defined `fix` in their rule files, `ast_project_scan` can report findings but `ast_rewrite_preview` cannot preview the fix because it doesn't know about it.

**Fix**: Optionally detect `fix` in project rules and surface it in scan results (if `sg scan` exposes it in JSON).

---

**13. Multi-file rewrite via `sg scan --update-all` is not exposed**

`--update-all` is a CLI-only flag that applies rewrites across all matched files. The extension intentionally avoids mutations and correctly documents this as CLI-only. However, there is no preview tool that shows what `--update-all` would produce.

---

**14. `$$$MULTI_META_VARIABLE` in `replace` is documented as unsupported but the error is misleading**

`interpolateReplacement` explicitly blocks `$$$NAME` with:
```
replacement does not support $$$NAME placeholders in phase 1.
```

The error message says "phase 1" which is Pi-specific terminology not found in the ast-grep book. An agent reading the error may not know what "phase 1" means or how to work around it. The underlying constraint (multi-node capture in replacement) is a known ast-grep limitation, but the framing should be book-consistent.

**Fix**: Change error to say "ast-grep does not support $$$NAME replacement placeholders in rewriters."

---

### Labels

**15. Labels parsed but never exposed — see Critical Issue #1**

Duplicate reference: this is the highest-priority gap.

---

### JSON Output

**16. `parseJsonStream` assumes line-delimited JSONL or a single top-level array**

The `parseJsonStream` implementation in `cli.ts` handles both formats correctly:
```typescript
if (trimmed.startsWith("[")) {
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected ast-grep scan JSON output to be an array.");
  }
  return parsed;
}
return trimmed.split(/\r?\n/).filter(...).map(line => JSON.parse(line));
```

This is correct and handles both `sg scan --json` (array) and `sg scan --json=stream` (NDJSON) formats. No gap here — this is an example of good design.

---

### Pipeline Use

**17. No pipeline or multi-step composition tools**

The book describes pipelines as a workflow concept (test matcher → test rule → apply fix → verify). The extension's six tools are independent; there is no composition primitive that chains them or passes outputs from one as inputs to the next.

This is reasonable for the tool model, but the SKILL.md workflow (Step 3 → Step 4 → Step 5 → Step 6) is described as a sequence that the agent must orchestrate manually. No tool captures the "pipeline" concept.

---

### Custom Languages / Injection

**18. Custom language support and tree-sitter injection are never mentioned**

The book covers:
- Adding custom language parsers via tree-sitter grammars
- Configuring `sgconfig.yml` with language settings

The extension hardcodes `SUPPORTED_LANGUAGE_HELP = "javascript, jsx, typescript, tsx, html, css"`. There is no tool or guidance for users who want to add a language (e.g., Python, Rust, Go).

`LANGUAGE_ALIASES` maps only six languages. A user with a Python project cannot use the extension.

**Fix**: Either expand the supported language list or document the limitation clearly in the SKILL.md. If custom language support is out of scope, this should be stated explicitly.

---

### Architectural Boundaries

**19. Phase 1 tools correctly avoid sgconfig.yml — no gap**

The README's claim that "phase 1 is not sgconfig-aware" is upheld by `runAstTest` and `runAstFind` — neither calls `resolveProjectContext` or spawns the CLI. This is a strength.

---

**20. CLI path normalization assumes executionCwd is the project root**

In `runAstRuleTest` and `runAstProjectScan`, the function resolves `configPath` and then sets `executionCwd = path.dirname(resolvedConfigPath)`. This is correct when sgconfig.yml lives at the project root. However, if a user places `sgconfig.yml` in a subdirectory (which the book does not forbid), `executionCwd` would be the subdirectory, and paths passed to `sg scan` would resolve relative to the wrong root.

**Severity**: Low (counter to the book's recommended layout, but worth noting)

---

## Positive Observations

1. **Two-lane separation is architecturally sound** — NAPI-first for speed and independence, CLI-backed for project workflows. The README is honest about what each lane does and does not cover.

2. **Result truncation and temp file fallbacks** are correctly implemented. The pattern of writing full output to a temp file and pointing the model to it is good.

3. **`noMatchHint` behavior** is a strong UX pattern — when a simple pattern returns zero matches, the tool nudges toward `matcher.context` + `matcher.selector`. This should reduce agent confusion on ambiguous snippets.

4. **`languageGlobs` for ast_find** is a good feature that many users will need. It is correctly implemented.

5. **`findMetavariables` for capture name inference** is well done — the extension can report what captures a matcher will produce without running it.

6. **Path resolution with `@`, `~`, and relative path support** is comprehensive and correct.

7. **Error framing in `formatMatcherError`** prepends the hint to the error message, which is the right UX choice.

8. **`stripAnsi` and ANSI color stripping** for rule test output parsing is correct and handles colored output.

9. **Test coverage** is reasonable for the covered surface — match/no-match, transforms, captures, truncation, path resolution, CLI exit codes, and severity overrides are all tested.

---

## Action Items

### Before merging (must fix)
1. **Parse and surface `labels` in `ProjectScanFinding`** — currently dropped silently, represents data loss on every scan
2. **Ensure `rawOutput` is always included in `AstRuleTestResult`** — already done in `runAstRuleTest` but verify it survives `shapeToolResponse`

### Nice to have (recommended)
3. **Expand language support** — at minimum document that Python/Go/Rust are unsupported
4. **Add test coverage for all five strictness values** — regression risk for `cst`, `ast`, `relaxed`, `signature`
5. **Fix `runAstDebugQuery` exit code check** to be explicit about exit code 1 vs empty output
6. **Document `matcher.rule.kind` as the path for kind-based matching** — align with rule_reference
7. **Reframe `$$$NAME` error message** to use book-consistent terminology

### Known out-of-scope (document in README)
8. YAML `fix` blocks, `--update-all`, `sg new` scaffolding — currently correctly listed as CLI escape hatches
9. Multi-file rewrite preview
10. Pipeline composition primitives
11. Custom language / tree-sitter grammar injection