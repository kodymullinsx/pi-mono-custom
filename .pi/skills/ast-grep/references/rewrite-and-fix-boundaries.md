# Rewrite and fix boundaries

Use this reference when the task is about changing code rather than only finding it.

The extension now exposes more of ast-grep's fix information, but it still does not expose the full mutating CLI surface as normal Pi tools. That distinction matters.

## Three different concepts

`ast_rewrite_preview` is a narrow replacement-preview tool in the phase-1 lane. It applies a replacement template to a snippet or one file and shows the resulting text without mutating anything.

YAML `fix` is a project-rule feature. It lives in rule files and shows up through `ast_project_scan` as replacement data. That is how you inspect what a project rule would rewrite.

CLI apply flows such as interactive apply or `--update-all` are mutating operations. Those are not modeled as normal tools in this extension.

## What the extension supports

Use `ast_rewrite_preview` when the user wants a safe, local preview of a simple replacement template based on captures or transformed metavars.

Use `ast_project_scan` when the user wants to inspect replacement data coming from a real project rule with `fix`.

Use `ast_rule_test` when snapshots, labels, and fixes need validation as part of a rule project's behavior.

## What remains outside the tool surface

The extension still does not model:

- interactive apply sessions
- `--update-all`
- snapshot mutation
- first-class Pi tools for mutating fix or rewrite workflows

If the user explicitly wants mutation, drop to raw `sg` via `bash`, capture the current state first, and confirm before taking the destructive step.

## Practical guidance

Do not confuse replacement preview with native rule fixes. `ast_rewrite_preview` is good for quick, explicit preview of replacement templates, but it is not a general YAML fix or rewriter engine.

Do not confuse preserved replacement data in `ast_project_scan` with actual application. Seeing `replacement` in the structured finding means the rule produced a fix suggestion, not that anything was changed.

If a rule depends heavily on transforms, rewriters, separator handling, or punctuation cleanup, treat the project lane as the source of truth and validate it with `ast_rule_test` and project scans.

## Labels and transforms reminder

Labels point to real source locations. Transforms produce strings. That means transformed values are useful for fixes and previews, but they are not good label anchors.
