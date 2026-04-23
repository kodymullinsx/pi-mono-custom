# Monitor extension

Standalone Pi extension for long-running shell monitors with subagent-aware ownership.

Features:

- `monitor` LLM tool with `start`, `stop`, `list`, and `status`
- `/monitor` slash command
- Detached runner per monitor
- Filesystem-backed state and event spool under `~/.pi/agent/state/monitor/`
- Idle-safe wake delivery via visible `monitor-event` custom messages
- Root-session ownership via `PI_MONITOR_OWNER_SESSION_ID`, `PI_MONITOR_OWNER_SESSION_FILE`, and `PI_MONITOR_OWNER_CWD`

Notes:

- Monitor ownership is durable and env-aware, but event delivery targets the currently open session id, not inherited env vars. This prevents subagent child sessions from waking themselves for root-owned monitors.
- Starting a monitor fails closed if there is no durable owner session file.
- Zero-exit monitors do not wake the model. Manual stop does not emit an error wake.

Quick manual check:

```bash
pi -e /Users/kodymullins/.pi/agent/extensions/monitor
```
