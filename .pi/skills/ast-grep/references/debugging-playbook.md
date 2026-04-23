# Debugging playbook

Use this reference when a matcher is failing, matching too much, or behaving differently than expected.

The fastest way to waste time in ast-grep is to keep adding complexity before you know which layer is actually wrong. Debug the matcher in stages.

## The escalation ladder

Start with `ast_test` on the smallest possible snippet that should match.

If a direct `pattern` fails, ask whether the problem is really a fragment-parsing problem. If it is, switch to `matcher.context` and try again.

If `context` still fails or matches the wrong node, inspect the extracted node and add `matcher.selector`.

If the extracted node is right and you are already using `matcher.context`, vary `matcher.strictness` deliberately. Do not guess. Change one strictness value and rerun the same tiny snippet. In this extension, strictness is part of the pattern-object path, so move a bare `matcher.pattern` into `matcher.context` form before changing it.

If you still cannot tell what ast-grep thinks the query is, use `ast_debug_query`. That shows how the query itself is being parsed, which is often the missing clue.

Only after the matcher works on a tiny snippet should you widen the search with `ast_find` or move to the project lane.

## Diagnose by failure type

### No match at all

The usual causes are: the fragment does not parse as the node you think it does, the wrong node was extracted from a pattern object, or the chosen strictness is too narrow.

First reduce the snippet. Then try `context`. Then add `selector` if needed. Then inspect with `ast_debug_query`.

### Matches the wrong thing

The usual causes are: the extracted node is broader or narrower than intended, the pattern is too permissive, or `signature`/`template`/`ast` strictness is broader than you expected.

Keep the same snippet and tighten only one variable at a time. Start with selector. Then tighten strictness. Only after that move to a fuller `rule`.

### The rule object behaves strangely

This is usually a relational or composition problem, not a parser problem.

Common mistakes are putting `all` inside one `has` when you really meant multiple `has` conditions, using `field` when the search is not an immediate parent-child relationship, or letting a relational search cross a scope boundary because `stopBy` was too broad.

### Works in `ast_test` but not in project scans

That usually means the issue is not the matcher. It is project context.

Move to the project lane. Check `sgconfig.yml`, rule discovery, language globs, custom languages, injections, severity settings, and whether you are supposed to be using `ast_project_scan` or `ast_rule_test` instead of `ast_find`.

## Tool-specific guidance

`ast_test` is the first stop for matcher authoring. Use it to prove the matcher itself.

`ast_debug_query` is for understanding how ast-grep parses the query. Use it when the problem is extraction, selector choice, or strictness interpretation.

`ast_find` is for widening a proven matcher across files. Do not use it to debug `sgconfig.yml` behavior.

`ast_rule_test` is for rule fixtures and snapshots. Use it when the matcher works in isolation but the project rule still behaves wrong.

`ast_project_scan` is for config-driven scans, labels, metadata, fixes, injected languages, and severity-aware project behavior.

## Minimal-debug workflow

A good default loop is:

1. write the smallest snippet that should match
2. try `matcher.pattern`
3. switch to `matcher.context` if the target is a fragment
4. add `matcher.selector` if the extracted node is wrong
5. vary strictness only after extraction looks right, and only once the matcher is in `matcher.context` form
6. use `ast_debug_query` if parsing is still unclear
7. widen with `ast_find`
8. move to `ast_rule_test` or `ast_project_scan` if project behavior matters

## When to stop using ast-grep as the only tool

If the question is really about references, types, control flow, or semantic equivalence, ast-grep is no longer the whole answer. Use it to find syntactic candidates quickly, then hand off to LSP or compiler-aware tools.
