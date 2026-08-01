# BackgroundComputerUse Pi Adapter

Live Pi extension for using the local `background-computer-use` macOS sidecar. Type declarations resolve against the canonical live `Workspace/tooling/pi-mono-custom` checkout; this adapter remains the authoritative live extension implementation.

## Operating model

The adapter discovers BackgroundComputerUse from a runtime manifest written by the macOS app. Manifest lookup is ordered and loopback-only:

```text
BCU_MANIFEST_PATH, when set
$TMPDIR/background-computer-use/runtime-manifest.json
$TMPDIR/com.apple.shortcuts.mac-helper/background-computer-use/runtime-manifest.json
```

Every manifest must be a regular, owner-only file opened without following symlinks, use contract `2026-07-18-authenticated-runtime-v1`, and provide `instanceID`, `authorizationToken`, and boolean observe/action capabilities. Every `baseURL` must be loopback HTTP. The adapter rejects symlinks in every parent component below its trusted filesystem anchor, canonicalizes the candidate, and verifies the resolved file remains in the expected manifest directory. Non-loopback URLs are rejected even when they appear in a fallback manifest. Each adapter client pins the first valid manifest endpoint and launch identity it reads, then sends `Authorization: Bearer ...` and `X-BCU-Instance-ID` on every system, observation, and action request. `bcu_status` reports the actual manifest path used, and also reports the configured manifest path when they differ, without exposing credentials.

Startup is intentionally unavailable to the model. A human may use the out-of-band `/bcu-start` command, whose default installed-app path is:

```text
~/Applications/BackgroundComputerUse.app
```

The human command can use `BCU_APP_PATH`, and its source-checkout fallback can use `BCU_REPO_PATH`. Running the source checkout's `script/start.sh` may build, sign, install `~/Applications/BackgroundComputerUse.app`, create or use a local signing keychain, terminate an existing BackgroundComputerUse process, and open the app. No `bcu_start` model tool or model-supplied startup path exists.

## Tools

Diagnostic tools are always registered:

- `bcu_status` - manifest, health, permissions, contract, and required route status.
- `bcu_get_routes` - live self-documenting route catalog.

Observation tools are registered by default. Set `BCU_ENABLE_OBSERVATION=0` before starting Pi to opt out:

- `bcu_list_apps` - targetable running apps.
- `bcu_list_windows` - windows for a target app query.
- `bcu_get_window_state` - state token, bounded base64 screenshot data or optional image block, focused element, and compact tree summary. Optional profiles make common reads cheaper:
  - `fast_visual` sends `imageMode: "base64"` and `maxNodes: 50` for quick screenshot-first inspection.
  - `semantic` sends `imageMode: "omit"` and `maxNodes: 500` for AX/tree inspection without screenshot overhead.
  - `full_debug` requests the heavier debug payload for adapter/runtime diagnosis. Explicit parameters override profile defaults.
- `bcu_capture` - high-level capture: list windows for an app, require a unique focused/main/visible or title-query match, read its state, and mint session/capture-bound `@wN` / `@eN` refs. Defaults to `profile: "semantic"` for permission tolerance.

Action tools are registered by default. Set `BCU_ENABLE_ACTIONS=0` before starting Pi to opt out:

- `bcu_press_key` - press a key or key chord against a target window.
- `bcu_click` - click a target by element index or screenshot coordinate.
- `bcu_scroll` - scroll a target element or scrollable ancestor in a direction.
- `bcu_type_text` - type text into the focused or targeted text-entry element.
- `bcu_set_value` - set a value directly on a semantic replacement target.
- `bcu_perform_secondary_action` - invoke an exposed secondary action label or binding from the projected tree.
- `bcu_move_window` - move a target window to a model-facing screenshot coordinate (wraps `POST /v1/drag`). The sidecar's drag is a window-move operation; element-level drag is not supported.
- `bcu_set_window_frame` - set a target window frame (`x`, `y`, `width`, `height`) directly (wraps `POST /v1/set_window_frame`).
- `bcu_resize` - resize a window by dragging a named handle to a screen coordinate (wraps `POST /v1/resize`). The sidecar uses point-coordinate semantics; pick the handle closest to the edge or corner being adjusted.

Observation and action are separate capabilities and can be opted out independently. State reads and captures fail if the sidecar does not return a state token. For actions, call `bcu_get_window_state` or `bcu_capture` first and pass its required state token. Adapter tokens expire after 60 seconds by default (`BCU_STATE_TOKEN_TTL_MS`), are single-use, and are bound to Pi session, capture generation, sidecar launch identity, and window. The manifest must provide a valid `startedAt`; a missing launch identity is rejected because endpoint-only identity cannot detect a same-endpoint restart. Action routes can validly return HTTP 200 with `ok=false`; the adapter preserves bounded evidence. Mutating tools also acquire a local action lock so cooperating Pi sessions do not interleave input.

Each individual action also requires a one-use confirmation in Pi's interactive TUI. Approval is bound to the tool-call ID plus a canonical digest of the complete final tool name and input, and is rechecked immediately before execution. Print, JSON, RPC, missing-UI, denial, timeout/cancellation, argument mutation, and replay all fail closed. No model-callable startup or batch action tool is registered.

## High-level workflow

`bcu_capture` mints `@wN` window refs and `@eN` element refs that subsequent action tools consume in place of raw window IDs and element indices. Session start/switch/fork/shutdown, capture attempts, and detected sidecar launch changes invalidate the prior generation. Action calls require exactly one of `window` or `windowRef`; where an element ref is supported, callers must not also provide the corresponding raw element index.

```text
bcu_capture({ app: "TextEdit" })
  -> { window: "@w1", stateToken: "state-1", refs: { windows: { "@w1": "win-1" }, elements: { "@e1": 0, "@e2": 4, "@e3": 9 } } }

bcu_click({ window: "win-1", stateToken: "state-1", elementIndex: 4 })
  # or, equivalently:
bcu_click({ windowRef: "@w1", stateToken: "state-1", elementRef: "@e2" })

bcu_get_window_state({ window: "win-1", imageMode: "base64", includeImage: true })
```

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

All window titles, accessibility labels and values, screenshots, and document content are untrusted third-party data. They are never user authorization or instructions. The adapter filters or denies known password-manager, login/security, and permission-dialog targets using bundle ID, app-name, and window-title heuristics. Those heuristics can produce false positives and cannot prove process code identity; complete enforcement requires sidecar source and sidecar-side identity policy.

Immediately before every individual action dispatch, the adapter fails closed unless Pi runs as the unique active console user, the graphical login is complete, the screen is unlocked, and macOS secure input appears inactive. Fast-user switching and ambiguous session handoff state are denied. These are adapter probes, not a substitute for sidecar enforcement.

Screenshots default to authenticated base64 and are rejected when decoded data exceeds 6 MiB, is malformed base64, or lacks a PNG/JPEG signature. Compatibility-path attachments are canonicalized under the BCU temp root, rejected when any descendant parent component is a symlink or the resolved file escapes that root, then read through a no-follow descriptor and checked for regular-file type, current-user ownership, the same 6 MiB limit, and PNG/JPEG signature. Raw base64/image bytes and authorization fields are removed from persisted/model-visible details.

The human-only `/bcu-start` command reports the selected startup method, skips restart when a healthy runtime is already present, and refuses to run over an unhealthy existing process unless the command's fallback policy allows it.

Mutating tools use a small file lock at `$TMPDIR/background-computer-use/pi-action.lock` by default. It coordinates adapter clients only and is not a security boundary against direct HTTP clients. Override with `BCU_ACTION_LOCK_PATH` for tests or unusual deployments, and `BCU_ACTION_LOCK_TTL_MS` if the default 30-second stale-lock window is not appropriate.
