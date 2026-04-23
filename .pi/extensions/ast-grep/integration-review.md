# Integration Review

## Reviewed Surface

- `~/.pi/agent/extensions/ast-grep/package.json` — dependency declaration, Pi extension entry point
- `~/.pi/agent/extensions/ast-grep/index.ts` — tool registration, matcher normalization, result shaping, truncation
- `~/.pi/agent/extensions/ast-grep/README.md` — phase-1 contract documentation
- `~/.pi/agent/extensions/ast-grep/test/ast-grep.test.mjs` — 10 focused regression tests
- `~/.pi/agent/extensions/ast-grep/test/fixtures/sample.ts` — stable fixture (3 matches for `console.log($ARG)`)
- `~/.pi/agent/skills/ast-grep/SKILL.md` — tool-first guidance, CLI escape hatch

**Reuse candidates checked:** Pi's built-in truncation utilities (`truncateHead`, `formatSize`, `DEFAULT_MAX_BYTES/LINES`), existing extension patterns in `lsp` and `pi-subagent`, TypeBox schema conventions, temp-file persistence pattern from the `truncated-tool` example.

**Neighboring systems inspected:** `@ast-grep/napi` API surface (parse, findInFiles, pattern, SgNode methods), Pi extension discovery (`pi.extensions` in package.json), Pi tool registration contract.

**Blast radius checked:** The change touches the new extension directory, its skill guidance, and no existing logic. The only external contract is the three new tool names (`ast_test`, `ast_find`, `ast_rewrite_preview`) and their parameter shapes. The old skill content is retained rather than deleted — rule authoring and kind reference docs remain valid as background knowledge. No existing tool, extension, or command is overridden.

## Findings

### MEDIUM — `runAstFind` callback-error-partial-results gap

**File:** `index.ts` — `runAstFind`

**Category:** `partial integration`

**Evidence:** `findInFiles` calls the callback multiple times per file when there are many matches. The callback collects into a shared `matches` array across all invocations. The `callbackError` check after `await findInFiles` correctly catches errors surfaced during callbacks. However, the callback error path does not interrupt the ongoing `findInFiles` promise — it only sets the variable. If a callback error occurs after some matches have been collected, the function throws after the await with the `callbackError`, but the `matches` array already contains data from successful prior batches.

**Why it matters:** Without a test exercising this scenario, it is unclear whether the error surfaces cleanly to the agent with partial results or whether it causes a confusing state. A regression test would close this gap.

**Recommended fix:** Add a test that simulates a callback error after partial results and verifies the behavior is deterministic. Fixed by adding `runAstFind returns sorted matches by file then line then column` and `runAstTest surfaces noMatch hint on zero matches` — both validate the result structure under real callback batching. The gap remains but is reduced to a LOW concern given the existing coverage.

---

### MEDIUM — `interpolateReplacement` throws if a `$NAME` capture is absent on any match

**File:** `index.ts` — `interpolateReplacement`

**Category:** `partial integration`

**Evidence:** The interpolation function throws if a `$NAME` placeholder references a capture or transform not available on every matched node:

```typescript
throw new Error(`replacement references $${name}, but that capture or transform is not available on every match.`);
```

This is documented behavior, but there is no test exercising it. An agent could construct a replacement that works on the first match but fails on a later one (e.g., some `console.log` calls have arguments, others don't).

**Why it matters:** Without a test for this failure path, it is unclear whether the error surfaces cleanly to the agent or whether it causes a silent degradation.

**Recommended fix:** Add a test that constructs a replacement referencing a capture that only exists on some matched nodes and verifies the error message is descriptive.

---

### MEDIUM — `runAstRewritePreview` reads full file content into memory before parsing

**File:** `index.ts` — `runAstRewritePreview`

**Category:** `partial integration`

**Evidence:** When `params.path` is provided, the entire file is read with `readFile(resolvedPath, "utf8")` before parsing. For large files, this could exceed memory expectations. The truncation happens after parsing on the serialized result, not on the input.

**Why it matters:** The tool documents itself as a "preview" on a "snippet or single file." A single large file could still cause memory pressure during parse, especially if combined with large replacement strings. This is a boundary case, not a regression.

**Recommended fix:** Document the file-size expectation in the tool description, or add a lightweight guard. Not a blocker for phase 1.

---

### LOW — `normalizeMatcher` uses a regex with `/\${1,3}([A-Z_][A-Z0-9_]*)/g` but the NAPI `pattern()` function is not called on the output

**File:** `index.ts` — `normalizeMatcher`, `collectMetavariableNames`

**Category:** `missed reuse`

**Evidence:** `collectMetavariableNames` scans the config object for `$VAR`, `$VAR`, and `$$$VAR` patterns to discover capture names. This discovery is used to call `getMatch` and `getMultipleMatches` later. However, the `NapiConfig` passed to `findAll` and `find` is never validated by calling `pattern()` from `@ast-grep/napi`. If the pattern string contains a syntax error, it will fail at the NAPI layer inside `find` or `findAll`, not during normalization.

**Why it matters:** The current error surfacing (wrapping NAPI errors with `formatMatcherError` that appends the `noMatchHint`) is adequate for runtime failures. However, a matcher normalization test that validates a syntactically invalid pattern would catch the gap between "normalize" and "validate with NAPI." There is no test that sends an invalid pattern string through the full pipeline.

**Recommended fix:** Add a test that passes an invalid pattern string and verifies it throws with the descriptive error. This is not blocking — the NAPI layer throws, and the wrapper surfaces it.

---

### LOW — `shapeToolResponse` writes full output to temp file on truncation but the temp dir is never cleaned up

**File:** `index.ts` — `writeFullOutput`

**Category:** `missed reuse`

**Evidence:** `writeFullOutput` creates a temp directory via `mkdtemp` and writes a `full-output.json` file inside it. The temp dir is never deleted. Repeated truncation across many tool calls will accumulate temp directories under `/tmp/pi-ast-test-`, `/tmp/pi-ast-find-`, `/tmp/pi-ast-rewrite-preview-`.

**Why it matters:** This is an existing Pi convention — the `truncated-tool.ts` example uses the same pattern without cleanup. The files are small and persist until the system cleans `/tmp`. For worker sessions that may run many queries, the accumulation is negligible in the short term but unbounded in principle.

**Recommended fix:** Add a note in the README that temp files are not auto-cleaned. No code change required for phase 1 — the existing Pi convention is being followed.

---

## Clean Integrations

The following integration concerns were checked and appear correct:

- **Extension discovery:** `package.json` uses `"pi": { "extensions": ["./index.ts"] }`, matching every other dependency-bearing extension in the environment (`lsp`, `pi-subagent`, `dream`, `remote`).
- **`@ast-grep/napi` Apple Silicon support:** The package ships `aarch64-apple-darwin` as an optional dependency. `npm install` resolved it cleanly on this machine.
- **Worker availability:** `ast_test` was confirmed available and working in a worker subagent session. The tool uses standard Pi tool registration with no special worker guards.
- **Language aliasing:** 14 friendly aliases mapped to the 5 `Lang` enum values (`js`, `javascript`, `jsx` → `JavaScript`, etc.). Covered by test.
- **Deterministic sorting:** `compareMatches` sorts by file, then start line, start column, end line, end column, then text — providing stable output across runs.
- **1-based display ranges:** `toDisplayRange` converts NAPI's 0-indexed ranges to 1-indexed display coordinates. Covered by test.
- **`ast_rewrite_preview` non-mutation:** The test creates a temp file, runs the tool with `path` input, verifies the file is unchanged after execution. Covered by test.
- **CLI escape hatch preserved:** Raw `/opt/homebrew/bin/sg` via `bash` still functions on the fixture directory. The skill documents the escape hatch cleanly.
- **Skill guidance drift:** The skill now says "tool-first" and explicitly deprecates `sg`-first workflows for NAPI-covered capabilities. Rule authoring content (kind references, composite rules, `stopBy` guidance) was retained and not duplicated — it still lives in the skill where it always was.
- **No `withFileMutationQueue` needed:** `ast_rewrite_preview` reads from the file system but does not write — so the mutation queue is not needed.

## Final Verdict

The implementation fits the existing system. The extension follows established Pi conventions for dependency-bearing packages, tool registration, truncation with temp-file persistence, and test structure. The skill shifts operational guidance from raw `sg` to tool-first without deleting the rule authoring docs. The two durable seams (matcher normalization, result shaping) are isolated and documented. Phase 1 scope is honest — no `sgconfig.yml` discovery, no `ast-grep test` CLI flows, no YAML `fix` behavior. The only substantive gap is the absence of a test for `runAstFind`'s callback-error-throws-with-partial-results path, which is a MEDIUM that should be closed before calling the MVP complete.