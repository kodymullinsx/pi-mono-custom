---
name: code-debugger
description: Structured 5-step investigation (Clarify, Map, Isolate, Validate, Fix) that prevents wasted hours chasing symptoms when the root cause is architectural, environmental, or multi-process. Use before jumping into code fixes when the bug spans multiple components or processes, the symptom is vague or intermittent, the user says "debug this", "why is X happening", "trace this", "figure out why", "it's broken", "it stopped working", duplicate outputs appear, behavior differs across environments, only some users are affected, resources leak without clear cause, or a silent failure produces no error. Without this methodology the default is to instrument code with logging, which wastes time when the real cause is outside the code. Forces you to map the system topology and binary-search components before reading source code.
---

# Code Debugger

A disciplined 5-step methodology that prevents wasted hours tracing code paths when the root cause is architectural, environmental, or outside the code entirely.

## Symptom → Section Map

Load only the section you need based on the observed symptom:

| Symptom | Jump to | First action |
|---------|---------|--------------|
| Duplicate / repeated output | Step 2 (Map) | `ps aux` — look for multiple processes |
| Works locally, fails in prod | Step 2 (Map) | Environment / config diff first |
| Intermittent failure | Step 2 + Step 3 | Timing, race condition, resource contention |
| "It suddenly stopped working" | Step 1 (Clarify) | What changed? git log, recent deploys |
| Vague symptom ("it's broken") | Step 1 (Clarify) | Get specific before touching code |
| Clear stack trace / null pointer | Step 5 (Fix) | Cause is visible — go fix it |
| Config or env-specific behavior | Step 3 (Isolate) | Env var diff, config comparison |
| One user affected, others fine | Step 3 (Isolate) | Session / data isolation |

---

## The Core Discipline

**Bad pattern we all fall into:**
1. See symptom → "messages are duplicated"
2. Jump to tracing → Add console.logs to every function
3. Spend hours instrumenting code
4. Realize two separate processes were both running
5. Facepalm

**The discipline:**
1. **Clarify** — What EXACTLY is happening?
2. **Map** — What components/systems could produce this?
3. **Isolate** — Binary search the system to find the source
4. **Validate** — Confirm hypothesis before touching code
5. **Fix** — Root cause fix, not symptom patch

---

## Step 1: Clarify

Before touching any code, answer precisely:

### Symptom Checklist
- [ ] Is it the **same output** repeated, or **different outputs**?
  - Same = likely duplicate execution
  - Different = multiple sources or different inputs
- [ ] Is it **always** or **intermittent**?
  - Always = structural issue
  - Intermittent = timing, race condition, or resource issue
- [ ] What are the **real identifiers**?
  - Message IDs, timestamps, process IDs, session IDs
  - Don't trust display labels — check underlying data
- [ ] **When did this last work?** What changed since then?

### Questions to Ask
- "What would I need to see to distinguish [theory A] from [theory B]?"
- "If I had to bet: is this one process running twice, or two processes running once?"
- "What's the simplest explanation that doesn't require a code bug?"

### Common Trap: Vague Symptoms
"It's broken" → Get specific: "Response A appears, then 500ms later Response B appears, and Response A says 'no memory' while Response B lists the conversation history."

---

## Step 2: Map

Before instrumenting code, understand the system topology:

### Component Inventory
List every component that could produce the symptom:
```
Discord messages could come from:
- Discord bot/bridge daemon (launchd)
- Discord integration in TUI (interactive pi)
- Discord webhook from another service
- Discord bot token used elsewhere
- Discord client displaying cached messages twice
```

### Flow Diagram (Mental or Actual)
```
User → Discord → [Bot Token] → Where does this go?
                ↓
        [Option A: Bridge Daemon (launchd)]
                ↓
        [Option B: TUI Extension (session_start)]
                ↓
        [Option C: Both ← this is usually the answer]
```

### Questions to Ask
- "How many processes are running right now that could trigger this?"
- "What events fire this flow?" (session_start? webhook? cron? file watcher?)
- "What config enables this component?" (env vars? settings? flags?)
- "What's the transaction boundary?" (shared vs isolated state?)

### Common Trap: Code Tunnel Vision
Don't assume "it's in this codebase." Check:
- Running processes (`ps aux`, `launchctl list`)
- Environment variables
- Loaded extensions / plugins
- Network calls to external services
- Cached or stale data

---

## Step 3: Isolate

Binary search the system BEFORE instrumenting code:

### Process of Elimination
1. **Stop component A** — Does symptom persist?
   - Yes → Not the sole source
   - No → Component A is the source
2. **Check running processes** — `ps aux | grep <pattern>`
3. **Check config locations** — Is a setting duplicated?
4. **Check event triggers** — What fires the handler? Is it firing twice?

### Isolation Techniques

**Component Isolation:**
```bash
launchctl stop com.example.daemon
# Test → If symptom persists, daemon not the cause
```

**Environment Isolation:**
```bash
ENV_VAR=debug ./service
# If behavior changes, config/env is a factor
```

**Scope Isolation:**
- Does it happen in production? Dev? Local?
- Does it happen for all users? Just one?
- Does it happen for all inputs? Only specific ones?

### Questions to Ask
- "If [Theory X] is true, what would happen if I disabled [Component Y]?"
- "What is the minimal system that still shows the symptom?"

### Common Trap: Isolating Symptoms, Not Causes
Don't mask the symptom (e.g., filter duplicates). Find WHY they're generated.

---

## Step 4: Validate Hypothesis

Confirm understanding before writing code:

### Validation Checklist
- [ ] Can I predict the behavior based on my hypothesis?
- [ ] If I'm right, what specific evidence should I see?
- [ ] If I'm wrong, what's Plan B?

### Quick Validation Tests
- **Two-process theory:** `ps aux` — do you see duplicates?
- **Stale cache theory:** Clear cache, does it fix it?
- **Config theory:** Change config, does behavior change?
- **Race condition theory:** Add artificial delay, does timing change?

### The "Explain It" Test
Can you explain the bug to someone else in one sentence without hedging?
> "The TUI and daemon both load the extension, so session_start fires twice, creating two bridges that both respond to Discord."

If you can't say it simply, you don't understand it yet. Return to Step 2.

---

## Step 5: Fix

Root cause fix, not symptom patch:

### Fix Criteria
- [ ] Does this address **why** the symptom occurs (not just suppress it)?
- [ ] Will this break anything else?
- [ ] Is this the most minimal change?
- [ ] Can we prevent this class of issue?

### Fix Categories

**System/Architecture Fixes:**
- Process isolation (TUI vs daemon awareness)
- Configuration management (prevent duplicate loading)
- Event deduplication (guard clauses)
- State management (shared vs isolated state)

**Code Fixes:**
- Only after Steps 1–4 confirm the code is actually wrong
- Prefer guards over complex logic
- Document the invariant that was violated

### Post-Fix Verification

A fix is confirmed only when you've **reproduced the original failure condition** and observed no error:

```
Before fix: Symptom present + [root cause condition] present
After fix:  Symptom absent  + [root cause condition] handled
```

"It seems better" or "throughput resumed" is not verification. Exercise the exact path that historically failed.

---

## Output: debug-findings.md

Always write a `debug-findings.md` with this structure:

```markdown
# Debug Analysis: [issue in one phrase]

## Symptoms
What was observed, with specific identifiers (IDs, timestamps, process names, counts).

## Root Cause
One-sentence explanation a non-expert could follow.
Example: "Two processes both loaded the Discord extension, so session_start fired twice."

## Evidence
- Specific log lines / stack traces
- Process list / config state captured during isolation
- Before/after behavior demonstrating the cause

## Fix Applied
Exact files changed and what was changed, with an explanation of why this addresses
the root cause (not just the symptom).

## Verification
How the fix was confirmed: what failure condition was reproduced, and what showed it was gone.

## Prevention
Guards, tests, or architectural changes to prevent recurrence.

## Related Issues
Any adjacent problems discovered during investigation (log separately if actionable).
```

---

## Anti-Patterns

### The Console.log Spiral
Adding logs without a hypothesis → spending hours instrumenting code you don't understand.
**Instead:** Map first. Instrument only the suspected boundary.

### Symptom Chasing
Filtering duplicates → adding more filters → never asking why duplicates are generated.
**Instead:** Find the generation source, not the display symptom.

### Assuming Single Source
"It must be in sendText()" → never considering two processes could both be sending.
**Instead:** `ps aux` before reading code. Map before assuming.

### Premature Code Reading
Reading entire files for context → 30 minutes on code that isn't the problem.
**Instead:** Check configs and env vars before deep code dives.

---

## Integration with Other Skills

| Skill | When to combine | How |
|-------|-----------------|-----|
| **code-reviewer** | After identifying root cause | Verify fix doesn't introduce new issues |
| **silent-failure-hunter** | Symptom is missing output (no error, just silence) | Trace the absence rather than the presence |
| **security-reviewer** | Fix involves auth, input handling, or permissions | Check the fix doesn't open a vulnerability |

---

## Quick Reference

| Symptom | First Check | Likely Pattern |
|---------|-------------|----------------|
| Duplicate messages | `ps aux`, message IDs | Two processes |
| Stale data | Timestamps, cache headers | Cache invalidation |
| Works locally, fails prod | Environment diff | Config drift |
| Intermittent | Timing, race conditions | Concurrency |
| Affects one user only | User-specific state | Session/data isolation |
| Sudden breakage | Recent changes | What changed? |

---

## Scope

**This skill handles:**
- Multi-component / multi-process bugs where the source is unclear
- Environment-specific or intermittent failures
- Symptoms where the cause could be inside or outside the code
- Architectural issues masquerading as code bugs

**Skip directly to a fix when:**
- Clear stack trace with an obvious null pointer or type error
- Single-function logic error with an isolated test case
- Syntax error or compile-time failure the toolchain already caught

---

## Completion Criteria

A debugging session is complete when all are true:
- [ ] Symptom described precisely with specific identifiers (not "it's broken")
- [ ] System topology mapped (all components that could produce the symptom listed)
- [ ] Root cause identified and tied to evidence (logs / process state / config)
- [ ] Hypothesis validated before code was changed
- [ ] Fix targets the root cause, not the symptom
- [ ] Fix verified by reproducing the original failure condition and confirming no error
- [ ] `debug-findings.md` written with all required sections

---

## References

- **[Pi System Boundaries](references/pi-system-boundaries.md)** — When debugging Pi-specific issues (extensions, providers, model behaviors), check here for known architectural limitations and provider-specific quirks.
