---
name: ast-grep
description: Guide for writing ast-grep rules to perform structural code search and analysis. Use when users need to search codebases using Abstract Syntax Tree (AST) patterns, find specific code structures, or perform complex code queries that go beyond simple text search. Prefer this skill whenever text search is too imprecise, especially for JavaScript or TypeScript call patterns, function forms, imports, or syntax-aware filtering.
---

# ast-grep code search

## Overview

This skill helps translate natural-language code search requests into ast-grep matchers and project-rule workflows.

In this environment there are two explicit lanes:

- Phase 1, the NAPI lane: `ast_test`, `ast_find`, and `ast_rewrite_preview`
- Phase 2, the CLI-backed project lane: `ast_debug_query`, `ast_rule_test`, and `ast_project_scan`

The extension is the executable truth. This skill should route work to that surface accurately, not teach a broader tool than the extension actually exposes.

Use phase 1 for fast matcher iteration against the built-in NAPI language surface. Use phase 2 when `sgconfig.yml`, project rules, injected-language scanning, custom languages, rule tests, richer scan data, or debug-query inspection matter.

## Fidelity contract in this environment

The extension now preserves native ast-grep behavior much more closely for the features it exposes.

Important consequences:
- `matcher.context` no longer requires `matcher.selector`
- strictness support includes `cst`, `smart`, `ast`, `relaxed`, `signature`, and `template`
- `ast_project_scan` preserves labels, metavariable captures, replacement data, metadata, language, and byte offsets from CLI scan output
- `ast_rule_test` returns structured `cases`, `issues`, and `notices` in addition to `rawOutput`
- `ast_debug_query` supports `selector`, `strictness`, `configPath`, and `sexp`
- mutation workflows are still outside the normal Pi tool surface

## Reference map

Load references progressively. Do not dump the whole ast-grep book into every task.

Read `references/matcher-semantics.md` when the task is really about how to express a match: pattern versus context, when selector matters, strictness, metavariables, and when to move to a rule object.

Read `references/debugging-playbook.md` when a matcher fails, overmatches, or behaves differently than expected. This is the escalation ladder for `ast_test`, `ast_debug_query`, and the move into project tools.

Read `references/project-workflows.md` when `sgconfig.yml`, labels, fixes, metadata, severities, snapshots, or richer scan/test behavior matter.

Read `references/custom-languages-and-injections.md` when the request involves custom languages, embedded code, or any project-defined parsing behavior.

Read `references/rewrite-and-fix-boundaries.md` when the request is about rewrites, fixes, apply behavior, or the difference between preview and mutation.

Read `references/rule_reference.md` when you need exact YAML syntax for atomic, relational, or composite rule fields.

## When to use this skill

Use this skill when users:
- need structural code search rather than plain text search
- want to find syntax-aware patterns in JavaScript, TypeScript, HTML, or CSS
- need relational or composite ast-grep rules
- want help debugging why a matcher is not matching
- need to inspect ast-grep rule projects, run rule tests, or scan via `sgconfig.yml`
- need custom-language or injected-language behavior through the CLI lane
- need to understand rewrite, fix, and apply boundaries correctly

## Default decision ladder

Start with the smallest representative snippet.

Use `ast_test` first. Prefer `matcher.pattern` when the syntax is self-contained.

If the target is a fragment or ambiguous construct, switch to `matcher.context`. That is also where `matcher.selector` and `matcher.strictness` apply in this extension. Only add `matcher.selector` if the builtin extraction heuristic is not selecting the node you need.

If matching still feels wrong after extraction looks right, vary `matcher.strictness` deliberately instead of guessing.

If you need to see how ast-grep parses the query, use `ast_debug_query`.

Once the matcher works on a snippet, widen with `ast_find` only if the task is still phase-1 and not `sgconfig.yml` aware.

If project rules, config, injected languages, custom languages, labels, fixes, or snapshots matter, stop using the phase-1 lane and switch to `ast_project_scan` or `ast_rule_test`.

## Tool order for this environment

Use the tools in this order unless the task clearly starts in the project lane:

1. `ast_test` for matcher iteration against a small snippet
2. `ast_find` for structured repo search after the matcher already works
3. `ast_debug_query` when you need parse inspection, selector/strictness visibility, or config-aware query behavior
4. `ast_rule_test` for rule fixtures and snapshot verification
5. `ast_project_scan` for `sgconfig.yml`-aware project scans with rich structured findings
6. Raw `/opt/homebrew/bin/sg` via `bash` only for workflows still not modeled, especially interactive apply flows, `--update-all`, scaffolding, or other mutating CLI behavior

## Lane boundaries

### Phase 1: built-in NAPI lane

Use phase 1 for `javascript`, `typescript`, `tsx`, `html`, and `css` plus their supported aliases.

Use `ast_test` to prove the matcher itself.

Use `ast_find` to widen a proven matcher across files.

Use `ast_rewrite_preview` only for a safe preview of replacement templates on a snippet or a single file. It is not a YAML fix or rewriter engine.

### Phase 2: CLI-backed project lane

Use phase 2 when the project configuration is part of the behavior.

Use `ast_debug_query` when query parsing, strictness, selector choice, or config-aware custom-language behavior is the real question. A `matched: false` result is normal there because the tool inspects the query in an empty temp directory rather than searching repo files.

Use `ast_rule_test` when valid and invalid cases, snapshots, labels, or fixes need proof.

Use `ast_project_scan` when the caller needs labels, captures, replacement data, metadata, byte offsets, injected-language matches, or severity-aware project behavior.

## Quick examples

Simple pattern iteration:

```json
{
  "language": "javascript",
  "snippet": "console.log(\"x\")",
  "matcher": {
    "pattern": "console.log($ARG)"
  }
}
```

Pattern object with explicit selector:

```json
{
  "language": "typescript",
  "snippet": "const wrapped = { value: 1, other: 2 };",
  "matcher": {
    "context": "const wrapped = { value: $VAL };",
    "selector": "pair",
    "strictness": "smart"
  }
}
```

Pattern object that relies on builtin extraction:

```json
{
  "language": "javascript",
  "snippet": "console.log(\"x\");",
  "matcher": {
    "context": "console.log($ARG);"
  }
}
```

Project-aware debug query:

```json
{
  "language": "typescript",
  "query": "console.log($ARG)",
  "selector": "call_expression",
  "strictness": "template",
  "format": "sexp",
  "configPath": "sgconfig.yml"
}
```

Project-aware scan:

```json
{
  "paths": ["src"],
  "includeMetadata": true,
  "severity": {
    "warning": ["no-debugger"]
  }
}
```

## Guardrails

Do not keep fighting a fragment with a simple pattern when `context` is the real fix.

Do not use `ast_find` for `sgconfig.yml`-aware scans, rule tests, snapshots, custom languages, or injected-language project behavior.

Do not imply that `ast_rewrite_preview` is a general fix/apply engine. It is a safe preview tool.

Do not treat ast-grep as a semantic engine. It is strong at syntax and weak at references, types, control flow, and semantic equivalence.

If the question is really semantic, use ast-grep to find candidates quickly and hand off to LSP or compiler-aware tools.

## Remaining CLI escape hatch

Use raw `/opt/homebrew/bin/sg` via `bash` only when the user explicitly needs behavior the extension still does not model cleanly.

Good reasons to drop to the CLI:
- interactive apply flows
- `--update-all`
- snapshot mutation
- scaffolding with `sg new`
- bespoke one-off experiments that do not justify extending the tool surface
