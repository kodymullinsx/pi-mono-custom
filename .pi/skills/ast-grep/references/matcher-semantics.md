# Matcher semantics

Use this reference when the real question is how to express the match, not how to run the tool.

This is the core decision surface for the phase-1 lane and the place where most ast-grep confusion starts. The extension now follows native ast-grep behavior closely for the matcher features it exposes, so the right mental model is the native one.

## Start with the smallest thing that can work

Use `matcher.pattern` when the target is a clean, self-contained construct that parses directly as the thing you want to match. This is the fastest path and the easiest to reason about.

Move to `matcher.context` when the target is a fragment, an ambiguous sub-expression, or syntax that only makes sense inside a larger construct. In the current extension, `matcher.selector` is optional. Omit it when ast-grep's builtin extraction heuristic is likely to pick the node you want. Add it when you need explicit control. `matcher.strictness` lives on this same pattern-object path, so it is only valid together with `matcher.context`, not a bare `matcher.pattern` string.

Move to `matcher.rule` only when you need relational or composite logic, such as `inside`, `has`, `precedes`, `follows`, `all`, `any`, or `not`.

## Pattern objects: context and selector

The key thing to remember is that ast-grep parses the pattern as real code in the target language, then extracts one node from that parsed tree to use as the matcher. When you provide `context`, you are giving ast-grep enough surrounding syntax to parse the fragment correctly.

If you omit `selector`, ast-grep uses its builtin extraction heuristic. That heuristic chooses the leaf node or the first node with more than one child. This is often correct, but small syntax changes can change the extracted node. A trailing semicolon is the classic example. `console.log($ARG)` usually extracts a `call_expression`, while `console.log($ARG);` may extract an `expression_statement` instead.

Add `selector` when the builtin extraction result is not the node you want. Good candidates are things like `pair`, `call_expression`, `function_declaration`, or `member_expression`.

Treat `strictness` the same way. If you want to vary strictness, move the matcher into `matcher.context` form first and then change the strictness value there.

## Strictness guide

The extension supports all six strictness values that matter for native ast-grep matching.

`cst` is the most exact. Named and unnamed nodes must match, so punctuation, keywords, and other syntax details matter.

`smart` is the practical default. It is less rigid than `cst`, but still respects the structure implied by the pattern.

`ast` ignores unnamed nodes and compares the named structure. This is often what you want when formatting differences should not matter.

`relaxed` is like `ast`, but also ignores comments. Use it when comments are the only reason a structurally correct match is failing.

`signature` matches by structural shape rather than exact text. This is useful when names and literals should vary but the form should stay the same.

`template` is text-oriented while still preserving structural position. It is useful when the text matters more than node kinds.

If you are unsure whether a failure is caused by the extracted node or by strictness, keep the snippet tiny and change one thing at a time.

## Metavariable behavior that trips people up

`$VAR` captures one named node. `$$OP` can capture unnamed nodes like operators. `$$$ARGS` captures zero or more consecutive sibling nodes.

Repeated metavariable names unify. If `$A` appears twice, the second occurrence must match the first capture exactly.

`_`-prefixed metavariables do not unify. Use them when two placeholders should be independent.

`$$$` matching is non-greedy and does not backtrack. If a later part of the pattern fails, ast-grep does not retry alternate multi-captures for you.

## Choosing between kind, pattern, and rule

Use `pattern` when the syntax shape is concrete and readable.

Use `kind` when you need a broad node category, or when the fragment you care about does not parse well as a standalone pattern.

Use `rule` when the meaning depends on context, containment, ordering, or multiple conditions.

Do not reach for `regex` first. Regex is a refinement tool after the structural candidate set is already narrow.

## Phase-1 boundary in this environment

The phase-1 lane is the built-in NAPI surface. Use it for `javascript`, `typescript`, `tsx`, `html`, and `css` plus their supported aliases.

If the real need is custom languages, injected-language project scans, `sgconfig.yml`, snapshots, rule metadata, or CLI debug behavior, leave this reference and move to `project-workflows.md` or `custom-languages-and-injections.md`.
