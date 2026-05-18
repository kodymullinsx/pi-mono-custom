# BackgroundComputerUse Pi Adapter

Project-local Pi extension for using the local `background-computer-use` macOS sidecar from `pi-mono-custom`.

## Operating model

The adapter discovers BackgroundComputerUse from a runtime manifest written by the macOS app. Manifest lookup is ordered and loopback-only:

```text
BCU_MANIFEST_PATH, when set
$TMPDIR/background-computer-use/runtime-manifest.json
$TMPDIR/com.apple.shortcuts.mac-helper/background-computer-use/runtime-manifest.json
```

Every manifest `baseURL` must be loopback HTTP. Non-loopback URLs are rejected even when they appear in a fallback manifest. `bcu_status` reports the actual manifest path used, and also reports the configured manifest path when they differ.

Default startup opens the installed app first:

```text
~/Applications/BackgroundComputerUse.app
```

Override that with `BCU_APP_PATH` or the `bcu_start` tool's `appPath` parameter. The source-checkout start script remains available as an explicit fallback through `BCU_REPO_PATH` or the tool's `repoPath` parameter. Running the source checkout's `script/start.sh` may build, sign, install `~/Applications/BackgroundComputerUse.app`, create or use a local signing keychain, terminate an existing BackgroundComputerUse process, and open the app. The installed-app startup path does not do those build/sign/install steps.

## Tools

Read and discovery tools are always registered:

- `bcu_status` - manifest, health, permissions, contract, and required route status.
- `bcu_get_routes` - live self-documenting route catalog.
- `bcu_start` - open the installed app and wait for a healthy runtime, with source-checkout fallback when allowed.
- `bcu_list_apps` - targetable running apps.
- `bcu_list_windows` - windows for a target app query.
- `bcu_get_window_state` - state token, screenshot path or optional image block, focused element, and compact tree summary. Optional profiles make common reads cheaper:
  - `fast_visual` sends `imageMode: "path"` and `maxNodes: 50` for quick screenshot-first inspection.
  - `semantic` sends `imageMode: "omit"` and `maxNodes: 500` for AX/tree inspection without screenshot overhead.
  - `full_debug` requests the heavier debug payload for adapter/runtime diagnosis. Explicit parameters override profile defaults.

Action tools are registered only when `BCU_ENABLE_ACTIONS=1`:

- `bcu_press_key` - press a key or key chord against a target window.
- `bcu_click` - click a target by element index or screenshot coordinate.
- `bcu_scroll` - scroll a target element or scrollable ancestor in a direction.
- `bcu_type_text` - type text into the focused or targeted text-entry element.
- `bcu_set_value` - set a value directly on a semantic replacement target.
- `bcu_perform_secondary_action` - invoke an exposed secondary action label or binding from the projected tree.

For actions, call `bcu_get_window_state` first, pass the latest `stateToken` when available, perform one action, and read state again after meaningful UI changes. Action routes can validly return HTTP 200 with `ok=false` when an effect was unsupported, ambiguous, or not verified; the adapter preserves those structured results instead of converting them to transport errors. Mutating tools also acquire a local action lock so concurrent Pi sessions do not interleave clicks, typing, or keypresses.

## Permissions

BackgroundComputerUse reports permissions from `/v1/bootstrap`.

- System routes and `bcu_list_apps` do not require full permissions.
- `bcu_list_windows` requires Accessibility.
- `bcu_get_window_state` requires Accessibility, and requires Screen Recording unless `imageMode` is `omit`.
- Action tools require the runtime to report a fully ready permission state.

If permissions are missing, grant them to the signed `.app` bundle in System Settings, then quit and relaunch BackgroundComputerUse.

## Validation

From this directory:

```bash
npm test
npm run typecheck
npm run check
```

Repo-root `npx tsgo --noEmit` and `npm run check` do not currently cover `.pi/extensions`, so they are not proof for this adapter unless the root configs are expanded later.

## Safety notes

The normal `bcu_start` path opens the installed app and waits for the runtime manifest. The heavier source-checkout path delegates to `script/start.sh` only when the installed app is unavailable or unusable and source-checkout side effects are explicitly allowed. `bcu_start` and `/bcu-start` report the selected startup method, skip restart when a healthy runtime is already present, and refuse to run over an unhealthy existing process unless `forceRestart` is set intentionally.

Mutating tools use a small file lock at `$TMPDIR/background-computer-use/pi-action.lock` by default. Override with `BCU_ACTION_LOCK_PATH` for tests or unusual deployments, and `BCU_ACTION_LOCK_TTL_MS` if the default 30-second stale-lock window is not appropriate.
