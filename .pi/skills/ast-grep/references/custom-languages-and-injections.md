# Custom languages and injections

Use this reference when the task involves a language outside the built-in NAPI lane, or when code is embedded inside another language.

This is the clearest boundary between the extension's two lanes.

## The important environment boundary

Phase 1 is the built-in NAPI lane. In this environment that means `javascript`, `typescript`, `tsx`, `html`, and `css` plus their accepted aliases.

If the user needs a custom language, a project-defined grammar, or injected-language behavior tied to `sgconfig.yml`, move to the CLI lane. Do not keep forcing the problem through `ast_test` or `ast_find`.

## Custom languages

Custom languages in ast-grep depend on project configuration and a compiled tree-sitter shared library. In practice that means `sgconfig.yml` is part of the runtime behavior.

Use `ast_debug_query` with `configPath` when you need to inspect how a custom-language query is parsed.

Use `ast_project_scan` when you need to search a configured project that includes custom language registration.

Use `ast_rule_test` when you need to validate rules and snapshots for that project.

Do not assume phase 1 can help here. The NAPI lane in this extension is intentionally narrower than the full CLI language surface.

## Injections

Language injection means a host language contains code in another language. The most common example is JavaScript or CSS inside HTML.

In ast-grep, injections are a project-level concern. Built-in HTML JavaScript and CSS injection is automatic in the CLI lane. Other injections depend on explicit configuration.

If the user wants to find JavaScript inside HTML, CSS inside HTML, or any configured embedded language inside a host document, use `ast_project_scan`.

If the user wants to inspect how the embedded-language query parses, use `ast_debug_query`.

## One-level reality check

Treat injections as single-level for practical reasoning. If HTML injects JavaScript, ast-grep can search that JavaScript. Do not assume recursive multi-stage injection behavior beyond what the project explicitly configures.

## Common mistake pattern

A common failure mode is trying to debug injected-language behavior with `ast_find` because the syntax looks simple. That is the wrong lane. The moment embedding or project configuration matters, switch to `ast_project_scan`.

Another common mistake is assuming that a custom language issue is a matcher issue. Often the real problem is missing config, wrong `configPath`, incorrect file extension mapping, or an incomplete grammar setup.

## Good decision rule

Ask one question early: is the language behavior entirely local and built-in, or is it project-defined?

If it is local and built-in, phase 1 is fine.

If it is project-defined, injected, or custom, use the CLI lane immediately.
