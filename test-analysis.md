# Test Analysis: `63a49969` — fix(ai): support disabling native tool schemas

## Summary

The commit adds `compat.supportsTools?: boolean` (default `true`) to `OpenAICompletionsCompat`. When `false`, native tool schemas, `tool_choice`, assistant `tool_calls`, and `tool`-role messages are omitted from the API payload, and tool history is serialized as text content instead. The new test in `openai-completions-tool-choice.test.ts` covers the happy-path single-tool-call + single-text-result case well. There are four behavioral gaps where the code has branching logic that the new test does not exercise.

## Critical Gaps

None. All gaps are moderate severity — the core "tools are omitted and history is text-serialized" path is tested.

## Important Improvements

### 1. Tool result with image content + `supportsTools: false`

- **Location**: `packages/ai/src/providers/openai-completions.ts:1014-1030` (the `!compat.supportsTools` + `imageBlocks.length > 0` branch)
- **Reason**: Test gap
- **What regresses**: When a tool result contains images and `supportsTools: false`, the code emits a `user` message with multipart content (text part + image_url parts). If this path regresses — images silently dropped, content structure wrong (string instead of array), or the `text` part malformed — no test would catch it. The existing `openai-completions-tool-result-images.test.ts` only exercises `supportsTools: true`.
- **Bug this would catch**: A refactor that moves the image-block collection inside the `compat.supportsTools` guard would silently drop all tool-result images for `supportsTools: false` providers.
- **Confidence**: 80

### 2. Multiple consecutive tool results + `supportsTools: false`

- **Location**: `packages/ai/src/providers/openai-completions.ts:1014` (`textBlocks.join("\n\n")`)
- **Reason**: Test gap
- **What regresses**: The code iterates consecutive `toolResult` messages, collects their text into `textBlocks[]`, then joins with `"\n\n"`. The new test has only one tool result. If the join logic or iteration regresses (e.g., only the last tool result is included, join separator changes), no test catches it.
- **Bug this would catch**: A bug where `textBlocks` is reset per iteration instead of accumulated, causing only the last tool result to appear in the emitted `user` message.
- **Confidence**: 70

### 3. Assistant message with both text content and tool calls + `supportsTools: false`

- **Location**: `packages/ai/src/providers/openai-completions.ts:934-936` (`[text, toolCallText].filter((part) => part.length > 0).join("\n\n")`)
- **Reason**: Test gap
- **What regresses**: When an assistant message has both text and tool calls, the code concatenates them with `"\n\n"`. The new test only has a tool-call-only assistant message (no text). The `stringifyAssistantContent` helper and the filter/join logic are untested for the mixed case.
- **Bug this would catch**: A bug where `stringifyAssistantContent` returns `""` for array content with text parts (e.g., filtering wrong part type), causing assistant text to be silently dropped when tool calls are also present.
- **Confidence**: 65

### 4. Consecutive user messages after tool-result conversion + `supportsTools: false`

- **Location**: `packages/ai/src/providers/openai-completions.ts:806-816` (bridging gate) and `packages/ai/src/providers/openai-completions.ts:1025` (`lastRole = "user"`)
- **Reason**: Test gap
- **What regresses**: When `supportsTools: false`, tool results become `user` messages and `lastRole` is set to `"user"`. The next real user message is also `user`. The `requiresAssistantAfterToolResult` bridging is correctly skipped. But the new test does not assert the full message role sequence, so it cannot detect a regression that coalesces or drops consecutive user messages. Providers like Kimi (Novita) may reject coalesced user messages.
- **Bug this would catch**: A regression where the `lastRole = "user"` assignment is removed or the bridging gate is widened, causing either (a) a phantom assistant bridge inserted where it shouldn't be, or (b) consecutive user messages being silently merged.
- **Confidence**: 55

## Test Quality Issues

None. The new test is well-structured with specific assertions on each transformed field. The `supportsTools: true` additions to existing fixtures are compile-time necessities, not test inflation.

## Positive Observations

- The new test directly verifies the six most important behavioral claims: `tools` undefined, `tool_choice` undefined, `tool_calls` absent, content contains `Tool call:`, `tool`-role absent, and tool result contains `Tool result:` with the tool name.
- The `stringifyAssistantContent` helper is a clean extraction with straightforward logic.
- The `lastRole = "user"` assignment after tool-result conversion is correct and ensures the state machine tracks properly for downstream conditionals.
- The `hasToolHistory` fallback (empty `tools: []` for Anthropic proxies) is correctly gated inside `compat.supportsTools`, which prevents an empty tools array from being sent to providers that reject it.
