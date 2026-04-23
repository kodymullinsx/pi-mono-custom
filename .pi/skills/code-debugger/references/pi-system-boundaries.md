# Pi System Boundaries and Extension Limitations

A reference for debugging issues that may be architectural limitations rather than bugs.

## When to Suspect an Architectural Boundary

- The feature "should" exist based on patterns elsewhere
- Code comments acknowledge the limitation (e.g., kimi-compat.ts comment about response stream scrubbing)
- No amount of extension code can solve the problem
- Multiple workaround attempts all fail
- The needed hook/event simply doesn't exist

## Extension Hook Mutability Reference

| Hook | Can Modify? | Returns | Use Case |
|------|-------------|---------|----------|
| `before_provider_request` | ✅ Yes | `unknown` (new payload) | Modify request payload sent to provider |
| `context` | ✅ Yes | `ContextEventResult` | Modify conversation context before prompt |
| `tool_call` | ✅ Yes | `ToolCallEventResult` | Block/modify tool execution |
| `tool_result` | ✅ Yes | `ToolResultEventResult` | Modify tool results before display |
| `message_start` | ❌ No | `void` | Observe message beginning |
| `message_update` | ❌ No | `void` | Observe streaming tokens (read-only) |
| `message_end` | ❌ No | `void` | Observe message completion |
| `turn_start` / `turn_end` | ❌ No | `void` | Observe turn lifecycle |
| `agent_start` / `agent_end` | ❌ No | `void` | Observe agent lifecycle |

**Key insight:** Events with `ExtensionHandler<Event>` (no second type parameter) are read-only.

## What Extensions CANNOT Do

### 1. Intercept Streaming Response Tokens

**The problem:** Extensions receive only parsed message events (`message_update`), not raw LLM tokens.

**Why it matters:** Some models (Kimi K2.5) emit raw tool-call tokens that leak into output:
```
  
functions.bash:138  {"command": "mv ..."}