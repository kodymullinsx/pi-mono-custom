# Pi Mono (Custom Fork)

Personal fork of [badlogic/pi-mono](https://github.com/badlogic/pi-mono) — the Pi agent harness monorepo (self-extensible coding agent, `pi-ai` multi-provider LLM API, `pi-agent-core` runtime, `pi-tui` terminal UI). Used to track upstream, apply local feature/fix commits, and run custom `.pi/extensions` for the `pi` CLI.

## Memory Context
- Source-fork memory lives at `/Users/kodymullins/Workspace/Memory/tooling/pi-mono-custom/memory.md`.
- Live install/config/runtime memory lives at `/Users/kodymullins/Workspace/Memory/tooling/pi-harness/memory.md`.
- Treat the source checkout, global installed Pi binary, project-local `.pi/extensions`, runtime config, model routing, sessions, and active processes as separate evidence layers.
- This checkout is live runtime infrastructure; do not archive or relocate it without an explicit runtime migration.

## Remotes
- `origin` → `https://github.com/kodymullinsx/pi-mono-custom.git` (this fork)
- `upstream` → `https://github.com/badlogic/pi-mono.git` (source project)

Current branch `upgrade/first-class-pdf-image-v0791` sits a handful of commits ahead of `upstream/main` (merge-base `28df940f`), e.g. `feat(coding-agent): add first-class attachment ingestion`, `fix(ai): support disabling native tool schemas`, plus local doc/skill-guidance commits. Check `git log upstream/main..HEAD` for the current delta before assuming a commit is upstream vs local.

## Structure
- `packages/ai` — unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.)
- `packages/agent` — agent runtime (tool calling, state management)
- `packages/coding-agent` — the interactive `pi` CLI coding agent
- `packages/tui` — terminal UI library
- `packages/mom`, `packages/web-ui` — additional workspace packages
- `.pi/extensions/` — local custom extensions for the `pi` CLI (e.g. `dirty-repo-guard`, `domain-memory`, `memory-ledger`, `permission-gate`, `plan-mode`, `subagent`, `todos`, `lsp`, `custom-compaction`, `github-issue-autocomplete`, `rewind`, `grackle`, `buddy`, `handoff`, `monitor`, `preset`, `protected-paths`, `questionnaire`, `background-computer-use`, `compact-tool-renderer`, `fancy-spinner`, `loop`, `ast-grep`)
- `.pi/upgrade-first-class-multimodal/` — notes/file lists from a past upgrade tracking upstream fork point v0.70.2
- `AGENTS.md` — the authoritative dev rules for this repo (conversational style, code quality, test/build commands, git workflow, PR conventions). Read this before making changes here.

## Commands
```
npm install --ignore-scripts   # install deps, no lifecycle scripts
npm run build                  # build all packages
npm run check                  # lint, format, type check (run after code changes)
./test.sh                      # run tests (skips LLM-dependent tests w/o API keys)
./pi-test.sh                   # run pi from source, from any directory
```

## Notes
- `AGENTS.md` governs both human and agent contributors here and takes precedence over generic conventions — notably: never `git add -A`/`.`, only stage files you changed, never `git reset --hard`/`checkout .`/`clean -fd`/`stash`, never force push, and never run the full vitest suite directly (use `./test.sh`).
- Direct npm dependencies are pinned to exact versions (`save-exact=true`, `min-release-age=2` in `.npmrc`); `package-lock.json` is the dependency ground truth and pre-commit blocks accidental lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1`.
- `packages/ai/src/models.generated.ts` must never be edited directly — update `packages/ai/scripts/generate-models.ts` and regenerate.
- `test-analysis.md` at repo root is a working note (code-review-style test-gap analysis for commit `63a49969`), not permanent documentation.
