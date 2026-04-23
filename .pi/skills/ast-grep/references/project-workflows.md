# Project workflows

Use this reference when the task depends on `sgconfig.yml`, project rules, snapshots, labels, fix output, severities, or richer scan diagnostics.

This is the phase-2 lane. The extension now preserves much more of native ast-grep's project behavior here than it used to.

## Choose the right project tool

Use `ast_project_scan` when the task is to scan a real ast-grep project and preserve the structured findings. This is the right tool when the caller cares about labels, metavariable captures, replacement data, metadata, byte offsets, or injected-language findings.

Use `ast_rule_test` when the task is to validate rule fixtures or snapshots. This is the right tool when the caller needs pass/fail outcomes for valid and invalid cases, snapshot-related failures, or severity-off rule handling.

Use `ast_debug_query` when the question is how the query itself parses under project-aware conditions, especially when `configPath` or custom languages matter.

## What `ast_project_scan` preserves now

The extension preserves the useful CLI JSON contract instead of shrinking it to a thin summary. That includes:

- file path and matched text
- 1-based display ranges plus byte offsets
- labels
- metavariable captures
- transformed values when present in the CLI output
- replacement data from rule fixes
- metadata
- language
- surrounding line and char-count fields when emitted by `sg`

If a caller needs a quick yes or no, you can summarize this data. Do not forget that the underlying result is richer now.

## What `ast_rule_test` returns now

The tool still returns `rawOutput`, but it also returns structured information that is much easier for an agent to reason about.

`cases` captures rule-level pass or fail summaries.

`issues` classifies common failure blocks such as unexpected matches, missing expected matches, snapshot mismatches, and missing snapshots.

`notices` captures things like `Configuration not found! <rule-id>` so the result stays honest about what the raw CLI actually reported. When the extension can prove that the rule does exist but is `severity: off`, it upgrades that notice to `severity_off_excluded`, preserves the raw CLI message separately, and points you at `includeOff`.

Use the structured fields first. Fall back to `rawOutput` when the caller needs the exact terminal text.

## Rule testing guidance

Use valid and invalid cases, not just one side. A rule is not well-proven if it only matches the bad case and never proves that it leaves good code alone.

Use snapshots when labels, messages, or fixes matter. If a rule has a `fix`, a label message, or nontrivial formatting in its diagnostic output, snapshots are part of the proof, not optional decoration.

Use `includeOff` when the project intentionally contains `severity: off` rules that still need to be tested. Without it, `sg test` can emit a missing-configuration-style notice for a rule file that does exist but is currently excluded by severity, and the extension will surface that as `severity_off_excluded` when it can confirm the cause.

## Severity and filtering

Use `filter` when the project has many rules and you only want one slice of them.

Use severity overrides when you need to surface an otherwise-off rule or temporarily promote a rule for inspection. This is especially useful for targeted scans while you are still iterating.

Use `reportStyle` when the human-readable diagnostics matter. The structured finding list is still the main contract, but the diagnostic output is often useful for quick review.

## `ast_find` versus `ast_project_scan`

Do not use `ast_find` when the match depends on rule files, `sgconfig.yml`, custom languages, injections, labels, fixes, or scan metadata. `ast_find` is the built-in NAPI lane, not the project lane.

Use `ast_project_scan` when the project itself is part of the behavior.

## Fixture strategy in this environment

If you are adding or adjusting project-lane behavior, keep the fixture project honest. Good fixture projects include:

- at least one rule with metadata
- at least one rule with labels
- at least one rule with fix output
- at least one severity-off rule if that path matters
- at least one injected-language example when that behavior matters
- rule tests that prove both positive and negative cases

That is how the extension and the skill stay aligned with real ast-grep workflows rather than only isolated matcher snippets.
