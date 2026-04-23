# Custom compaction

This extension upgrades Pi's compaction behavior without modifying the Pi runtime package. The default shipping path is summary-only: it builds a higher-signal compaction summary from Pi's existing compaction preparation, cumulative file-operation tracking, and extension-captured metadata about large or truncated `bash`, `read`, and `grep` runs.

It does not patch built-in runtime packages, add new native compaction settings, or claim cache-stable request shaping from the extension layer. Any live `context` shaping stays off by default and should remain off unless the payload-diff workflow below passes.

## What it does

- captures truncation-oriented metadata from `tool_execution_start` and `tool_execution_end`
- carries that metadata forward in compaction `details` so later compactions can reuse it
- builds compaction prompts from:
  - `messagesToSummarize`
  - `turnPrefixMessages`
  - `previousSummary`
  - Pi's extracted file operations
  - recent large-output observations
- falls back to Pi's default compaction whenever the custom path cannot safely finish

## What it does not do

- rewrite built-in `read` or `grep` runtime outputs
- add native settings like `compaction.budgetEnabled` or spillover directories
- guarantee prompt-cache preservation
- treat `bash` `fullOutputPath` as a durable dependency

## Configuration

The extension is controlled with environment variables so we do not touch Pi's built-in settings schema.

| Variable | Default | Purpose |
|---|---|---|
| `PI_CUSTOM_COMPACTION_SUMMARY_PROVIDER` | `google` | Provider used for compaction summaries |
| `PI_CUSTOM_COMPACTION_SUMMARY_MODEL` | `gemini-2.5-flash` | Model used for compaction summaries |
| `PI_CUSTOM_COMPACTION_SUMMARY_MAX_TOKENS` | `8192` | Max output tokens for the summary call |
| `PI_CUSTOM_COMPACTION_MAX_ARTIFACTS` | `150` | Max retained large-output observations in memory/details |
| `PI_CUSTOM_COMPACTION_MAX_SUMMARY_ARTIFACTS` | `20` | Max observations appended to a summary prompt |
| `PI_CUSTOM_COMPACTION_MAX_PREVIEW_CHARS` | `220` | Preview size stored per artifact |
| `PI_CUSTOM_COMPACTION_ENABLE_CONTEXT_SHAPING` | `false` | Enables guarded live shaping of hidden extension messages |
| `PI_CUSTOM_COMPACTION_CUSTOM_TYPE_PREFIX` | `custom-compaction/` | Prefix used to identify extension-owned helper messages |
| `PI_CUSTOM_COMPACTION_CAPTURE_DIR` | unset | Enables payload capture when set |
| `PI_CUSTOM_COMPACTION_CAPTURE_RUN` | `capture` | Run label under the capture directory |

## Verification

Run the focused regression suite from this directory:

```bash
node --test test/custom-compaction.test.mjs
```

The tests cover:
- no-op and guarded `context` shaping behavior
- artifact-index capture and compaction detail hydration
- deterministic summary prompt assembly
- payload-diff handling for hidden extension-owned messages
- extension loading plus clean fallback to default compaction when the summary model is unavailable

## Cache-safety workflow

Keep live shaping disabled for normal use. Only test it behind a dedicated capture run.

1. Capture a baseline with summary-only behavior:

```bash
export PI_CUSTOM_COMPACTION_CAPTURE_DIR="$HOME/.pi/custom-compaction-captures"
export PI_CUSTOM_COMPACTION_CAPTURE_RUN="baseline-summary-only"
unset PI_CUSTOM_COMPACTION_ENABLE_CONTEXT_SHAPING
```

2. Capture a candidate run with live shaping enabled in test mode:

```bash
export PI_CUSTOM_COMPACTION_CAPTURE_DIR="$HOME/.pi/custom-compaction-captures"
export PI_CUSTOM_COMPACTION_CAPTURE_RUN="candidate-context-shaping"
export PI_CUSTOM_COMPACTION_ENABLE_CONTEXT_SHAPING=true
```

3. Compare the runs:

```bash
node scripts/capture-provider-payload.mjs compare \
  --capture-dir "$HOME/.pi/custom-compaction-captures" \
  --baseline-run baseline-summary-only \
  --candidate-run candidate-context-shaping
```

Interpret the result this way:
- a zero exit means both the filtered history check and the canonicalized full-payload check passed
- a non-zero exit means the `context` path should stay disabled
- `--history-only` is available for diagnostics, but it is not the default release gate and should not be treated as cache-safety proof

## Manual smoke test

Use Pi with this extension loaded, then:

1. Generate long `bash`, `read`, and `grep` outputs.
2. Force compaction with `/compact`.
3. Confirm compaction succeeds and keeps the provided `firstKeptEntryId`.
4. Confirm the summary mentions relevant large-output facts without dumping raw blobs.
5. If testing live shaping, run the cache-safety workflow above before leaving it enabled.

## Limits

This extension improves compaction quality, not the native runtime budget pipeline. The largest tool-output pressure points still exist upstream, and provider-side cache-hit behavior cannot be proven from this layer alone.
