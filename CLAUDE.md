# Pi Mono (Custom Fork)

Personal fork of [badlogic/pi-mono](https://github.com/badlogic/pi-mono) — the Pi agent harness monorepo (`pi-ai`, `pi-agent-core`, `pi-tui`, and the `pi` coding-agent CLI). This checkout tracks upstream, carries local feature/fix commits, and supplies custom extensions for the Pi CLI.

## Project Context

- Canonical checkout: `/Users/kodymullins/Workspace/tooling/pi-mono-custom`.
- This is the live Pi Harness source fork and runtime-adjacent source workspace. Do not archive, relocate, or treat it as disposable without an explicit runtime migration.
- Source-level memory lives at `/Users/kodymullins/Workspace/Memory/tooling/pi-mono-custom/memory.md`; live install/config/runtime memory lives at `/Users/kodymullins/Workspace/Memory/tooling/pi-harness/memory.md`.
- Distinguish the source checkout, global installed Pi binary, `.pi/extensions`, runtime config, sessions, model routing, and active processes. Prove the layer the user asked about.
- Current package directories are `packages/ai`, `packages/agent`, `packages/coding-agent`, `packages/tui`, `packages/mom`, `packages/web-ui`, `packages/server`, and `packages/storage`.
- `test-analysis.md` at the repository root is a working code-review-style test-gap note for commit `63a49969`, not permanent documentation.

## Remotes and extension inventory

- `origin` → `https://github.com/kodymullinsx/pi-mono-custom.git` (this fork)
- `upstream` → `https://github.com/badlogic/pi-mono.git` (source project)
- Before making provenance or local-delta claims, run `git branch --show-current` and `git log --oneline upstream/main..HEAD`; do not rely on a fixed branch name, merge base, or commit count.
- The current source extension directories under `.pi/extensions/` are `background-computer-use`, `browser-control`, `buddy`, `domain-memory`, `fancy-spinner`, `github-context`, `grackle`, `lsp`, `memory-ledger`, `monitor`, `planning-workflow`, `rewind`, `safety-policy`, `subagent`, `tmux-terminal`, `tool-discovery`, and `vision-ingress`. Treat this as a source inventory, not proof that the installed global runtime has the same extensions.
- `.pi/upgrade-first-class-multimodal/` contains notes and file lists from a past upgrade tracking upstream fork point v0.70.2. The `.pi/` tree is runtime/config evidence, not a substitute for source or installed-runtime proof.
- `AGENTS.md` and `CLAUDE.md` are paired root contracts. Keep their shared rules aligned; do not assume another harness will load the companion file.

## Conversational and code contract

- Keep answers short, concise, direct, and technical. Do not add fluff or cheerful filler. Do not use emojis in commits, issues, PR comments, or code.
- Answer a user's question before making edits or running implementation commands. When responding to feedback or analysis, explicitly say whether you agree or disagree before describing changes.
- Read files in full before wide-ranging changes, before editing files not fully inspected, and when asked to investigate or audit. Do not rely on search snippets for broad changes.
- Avoid `any` unless absolutely necessary, inline single-use helpers, and guessed external API types; inspect `node_modules` for those types.
- Use top-level imports only. Code checked by the root TypeScript configuration must use erasable TypeScript syntax: no parameter properties, `enum`, `namespace`/`module`, `import =`, `export =`, or other constructs requiring JavaScript emit.
- Never remove intentional functionality without asking, and do not preserve backward compatibility unless requested.
- Keep keybindings configurable through `DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS`; never hardcode checks such as `matchesKey(keyData, "ctrl+x")`.
- Never edit `packages/ai/src/models.generated.ts` directly. Update `packages/ai/scripts/generate-models.ts`, regenerate, and review the resulting generated diff.

## Commands and test boundaries

Quick local commands are:

```bash
npm install --ignore-scripts
npm run check
./test.sh
./pi-test.sh                 # can also run from another directory
```

- After code changes (not docs), run `npm run check` with full output and fix all errors, warnings, and infos before committing. This does not run tests.
- Use `./test.sh` from the repo root for non-e2e tests. Never run the full Vitest suite directly because endpoint/auth environment variables can activate e2e tests. For a focused test, run `node node_modules/vitest/vitest.mjs --run test/specific.test.ts` from the relevant package root.
- If you create or modify a test, run it and iterate until it passes. For `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` with the faux provider; never use real provider APIs, keys, or paid tokens.
- Put issue-specific regressions under `packages/coding-agent/test/suite/regressions/` as `<issue-number>-<short-slug>.test.ts`.
- Never run `npm run build` or `npm test` unless the user requests it. Write ad-hoc multi-line scripts to a temporary file instead of embedding them in shell commands.
- Never commit unless the user asks.

## Dependency and install security

- Treat dependency and lockfile changes as reviewed code. Keep direct external dependencies pinned to exact versions.
- `.npmrc` sets `save-exact=true` and `min-release-age=2`; `package-lock.json` is the dependency ground truth.
- Use `npm install --ignore-scripts` for local hydration and `npm ci --ignore-scripts` for clean/CI-style installs. Do not run lifecycle scripts unless requested.
- If dependency metadata changes, refresh `package-lock.json` with `npm install --package-lock-only --ignore-scripts`.
- If `packages/coding-agent/npm-shrinkwrap.json` needs regeneration, run `node scripts/generate-coding-agent-shrinkwrap.mjs` and verify with `--check` or `npm run check`. Review any lifecycle-script allowlist entry; never add one silently.
- Pre-commit blocks lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1`. Do not bypass that gate unless the user wants the lockfile change committed.

## Git and external collaboration

- Multiple Pi sessions may modify different files in this checkout. Never touch unstaged, staged, or untracked files outside your own changes.
- Stage explicit paths only; never use `git add -A` or `git add .`. Before committing, run `git status` and verify that only your files are staged. `packages/ai/src/models.generated.ts` may accompany your own changes when regeneration requires it.
- Never run `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, `git add -A`, `git add .`, `git commit --no-verify`, or force push. If a rebase conflict is outside your files, abort and ask the user.
- Use the repository's `CONTRIBUTING.md` contributor gate. Review PRs without moving this worktree: use `gh pr view`, `gh pr diff`, `gh api`, and local `git show`/`git diff`; do not run `gh pr checkout` or `git switch` unless explicitly requested.
- For issues, apply every relevant package label. Write multiline issue/PR comments to a temporary file and post with `--body-file`; retain the originating prompt's required AI disclaimer.

## Interactive testing with tmux

Run the TUI from the repository root in a controlled terminal:

```bash
tmux new-session -d -s pi-test -x 80 -y 24
tmux send-keys -t pi-test "./pi-test.sh" Enter
sleep 3 && tmux capture-pane -t pi-test -p
tmux send-keys -t pi-test "your prompt here" Enter
tmux send-keys -t pi-test Escape
tmux kill-session -t pi-test
```

## Changelogs and releases

- Each package has `packages/*/CHANGELOG.md`. Add entries under `## [Unreleased]` using `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, or `### Removed`; released sections are immutable.
- Keep all packages on lockstep versions. Before releasing, confirm the `/cl` changelog audit has run on the latest `main` commit.
- Smoke-test an unpublished release from outside the repository with `npm run release:local -- --out /tmp/pi-local-release --force`, including Node and Bun `--help`, `--version`, `--list-models`, a real prompt, and interactive tmux startup. Failures block release unless the user explicitly accepts the risk.
- Release commands are `PI_ALLOW_LOCKFILE_CHANGE=1 npm_config_min_release_age=0 npm run release:patch` and `PI_ALLOW_LOCKFILE_CHANGE=1 npm_config_min_release_age=0 npm run release:minor`; review lockfile/shrinkwrap diffs. The release script updates changelogs, runs checks, commits, tags, and pushes, so do not run it without explicit release authorization and do not rerun it after the tag is pushed.
- CI publishes tagged packages through `.github/workflows/build-binaries.yml` and npm trusted publishing. If publishing fails, fix CI or transient npm issues and rerun the tag workflow; do not create a second release for the same version.

## User override

If the user's instructions conflict with this contract, ask for explicit confirmation before overriding it. Only then execute the conflicting instruction.
