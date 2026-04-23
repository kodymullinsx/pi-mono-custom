# Fancy Spinner

`fancy-spinner` is a Pi spinner extension that keeps agent runs feeling alive without lying about what the agent is doing. It takes its cue from Claude Code's strongest spinner idea: tell the truth first, then add a small amount of personality.

## V1 Scope

- One primary display surface per mode (detailed under Rendering Rules)
- One timer and one in-memory state machine
- Interactive layout favors a playful headline plus an indented truthful activity line while tools are active
- Tool-aware activity summaries for built-in Pi tools
- Parallel-safe aggregation when more than one tool is active
- Claude-style spinner verbs drive the playful headline text
- Safe fallback behavior when UI width is unknown or the session has no TUI

Non-goals for V1:

- No footer replacement
- No widget or overlay UI
- No terminal title animation
- No per-token rendering tricks

## Files

- `index.ts` wires Pi lifecycle events, timers, cleanup, and rendering.
- `activity.ts` translates tool events into readable status text.
- `copy.ts` keeps playful copy short, phase-based, and easy to tune.

## Event Model

The extension follows Pi's installed extension API:

- `agent_start`: start spinner lifecycle for one user prompt
- `agent_end`: stop and clear status
- `session_start`: reset state after reload, `/new`, `/resume`, or `/fork`
- `session_shutdown`: force cleanup on exit or session switch
- `turn_start`: reset to a thinking phase for the next LLM turn
- `tool_execution_start` / `tool_call` / `tool_execution_update` / `tool_execution_end`: maintain truthful tool activity and progress freshness
- `message_start` / `message_update`: switch to responding mode for assistant messages only

## Configuration

Environment flags:

- `PI_SPINNER_STALL_MS` default `15000`
- `PI_SPINNER_TICK_MS` default `120`
- `PI_SPINNER_ROTATE_MS` default `4000`
- `PI_SPINNER_MINIMAL=1` disables flavor copy and keeps only timer + activity
- `PI_SPINNER_COLOR_MODE` default `theme-wave` (`off` disables color animation)
- `PI_SPINNER_WAVE_STEP_MS` default `100` (lower is faster color motion)
- `PI_SPINNER_WAVE_ROLE` default `accent` (any Pi theme foreground role, e.g. `mdLink`, `syntaxFunction`)
- Invalid values print a warning once and fall back:
  - `PI_SPINNER_STALL_MS`, `PI_SPINNER_TICK_MS`, `PI_SPINNER_ROTATE_MS`, `PI_SPINNER_WAVE_STEP_MS` require positive integers
  - `PI_SPINNER_COLOR_MODE` allows only `off` or `theme-wave`
  - `PI_SPINNER_MINIMAL` accepts `1|true|yes` and `0|false|no`

## Rendering Rules

- Interactive TTY mode uses Pi's loader spinner glyph and supplies a two-line message:
  - headline: elapsed time plus a playful verb like `Skedaddling...` (theme-wave accent shimmer by default)
  - detail: an indented truthful activity line like `Running bash -lc ...` when tools are active
- RPC/non-TTY fallback stays single-line because it renders via footer status, not the loader widget
- Theme-wave uses a single-hue rolling shimmer from the active theme `accent` color (with a Pi default fallback), and is applied to the interactive headline only; status fallback remains plain text
- Theme-wave brightness curve is tuned to avoid muddy dimming on warm colors like yellow while keeping a gentle highlight crest
- Wide terminals show the full activity summary
- Medium and narrow terminals progressively compact the truthful activity line

Pi does not currently expose terminal width on `ctx`, so width-aware behavior uses live terminal columns when available and falls back conservatively when they are not.

Pi's default interactive loader already owns the main "working" slot. This extension replaces that message in interactive mode instead of stacking a second spinner in the footer.

## Manual Verification Matrix

1. Load directly with `pi -e ~/.pi/agent/extensions/fancy-spinner/index.ts`
2. Run `/reload` after placing the directory under `~/.pi/agent/extensions/`
3. Ask a no-tool question and confirm the spinner appears, advances time, switches into responding, and clears on completion
4. Ask a repo question that triggers `read`, `grep`, `find`, or `ls` and confirm the status shows readable activity text instead of raw tool names
5. Trigger `bash` usage and confirm the status shows `Running ...`
6. Trigger parallel tools and confirm the status reports `N tools` truthfully
7. Leave a long-running or sparse tool active and confirm the stall marker appears, then clears when activity resumes
8. Interrupt a run and confirm the status line fully clears
9. Test `/new`, `/resume`, `/fork`, and `/reload` to confirm stale status does not leak into the next session
10. Launch with `PI_SPINNER_MINIMAL=1` and confirm flavor copy disappears
11. Switch themes while spinner is active and confirm headline colors follow the active theme
12. Launch with `PI_SPINNER_COLOR_MODE=off` and confirm spinner text is uncolored

## Notes

This extension is intentionally small so the behavior stays understandable. If a V2 is needed later, it should build on verified truthfulness first rather than add more surfaces or animation.
