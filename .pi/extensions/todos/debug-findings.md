# Debug Analysis: Pi todos refinement regressions

## Symptoms
Four concrete issues were identified in `index.ts` after the recent todos refinements:

1. TypeScript reported unresolved names for widget auto-hide state:
   - `autoHideTimer`
   - `todoWidgetState`
2. `activeForm` was accepted and serialized, but disappeared after read/modify/write flows.
3. The widget's intended 5-second post-completion grace period never happened.
4. Verification nudges were skipped entirely when `listTodos()` returned partial results with an error.

## Root Cause
The regressions came from state and data-flow mismatches introduced during refinement work: widget auto-hide helpers were defined outside the closure that owned their state, `activeForm` was not propagated through `parseTodoContent()`, widget filtering removed completed items before the grace-period logic could observe them, and verification-nudge handling treated any partial-load error as a full stop.

## Evidence
- Scope failure reproduced via TypeScript check before fixes:
  - `TS2304: Cannot find name 'autoHideTimer'`
  - `TS2304: Cannot find name 'todoWidgetState'`
- `parseTodoContent()` originally returned all core fields except `activeForm`, while `serializeTodo()` wrote `activeForm`, proving silent field loss on rewrite.
- `getSessionWidgetTodos()` originally filtered out closed todos entirely, making the auto-hide branch unreachable for the intended completed-item grace period.
- `checkVerificationNudge()` originally returned `null` immediately on `result.error`, even when `result.todos` contained enough loaded todos to evaluate.

## Fix Applied
Updated `~/.pi/agent/extensions/todos/index.ts` with targeted fixes:

1. **Widget auto-hide scope fix**
   - Moved `autoHideTimer` to module scope.
   - Changed `scheduleWidgetAutoHide()` to accept `state` explicitly.
   - Added a defensive `try/catch` in the timer callback.

2. **`activeForm` persistence fix**
   - Added `activeForm: parsed.data.activeForm` to `parseTodoContent()` so read/modify/write paths preserve it.

3. **Widget grace-period fix**
   - Changed `getSessionWidgetTodos()` to return active/open assigned todos while work remains, but return completed assigned todos once everything is completed so the widget can remain visible briefly.
   - Updated widget counts so completed rows do not inflate the "open" count.
   - Auto-hide now clears widget rows after the grace period rather than mutating the persisted hidden preference.

4. **Verification-nudge partial-load fix**
   - `checkVerificationNudge()` now continues evaluation when some todos load successfully, while logging that it is using a partial list.
   - It only skips outright when no todos were loaded.

5. **Canonical status fallback cleanup**
   - Changed `getTodoStatus()` fallback from legacy `"open"` to canonical `"pending"`.

## Verification
Validated the fixes with structure-aware checks and follow-up review:

1. **ast-grep checks (`sg`)**
   - Confirmed `scheduleWidgetAutoHide(ctx, state)` now uses explicit state.
   - Confirmed `parseTodoContent()` returns `activeForm`.
   - Confirmed `getSessionWidgetTodos()` now computes `sessionTodos` and `activeTodos` separately.
   - Confirmed `checkVerificationNudge()` now handles partial-load errors without unconditional early return.

2. **TypeScript check**
   - Re-ran `tsc --noEmit ...` and confirmed the prior unresolved-name errors are gone.
   - Remaining TypeScript output is limited to missing external module declarations in this standalone check context, not local code errors.

3. **Targeted subagent review**
   - `code-simplifier`: no concrete remaining issues.
   - `silent-failure-hunter`: no concrete remaining issues.

## Prevention
- Keep helper functions either inside the owning closure or pass required state explicitly.
- When adding a new persisted field, trace it through the entire path:
  - parse front matter
  - parse full record
  - serialize
  - create/update flows
  - rendering
- For UI grace-period logic, validate the preconditions against the actual filtered data set rather than the intended conceptual state.
- For partial-load helpers, prefer degraded evaluation with warning logs over unconditional early exit when safe.
- Use `sg` for propagation/path checks when adding new fields or branching logic.

## Related Issues
- The standalone `tsc` invocation still cannot resolve Pi package/type dependencies from this directory. That is an environment/type-resolution limitation of the ad hoc check, not a confirmed bug in the extension itself.
