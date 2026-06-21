---
name: implement
description: Execute an already-approved implementation plan with disciplined scope control, proof-first validation, and structured review. Use when the user wants approved work turned into code without scope creep, fake confidence, or overengineering. Reach for this whenever the task is "implement this plan", "carry out the approved changes", "do the fix and prove it works", or "finish the implementation cleanly."
compatibility: Works best with the `subagent` skill and the curated reviewer agents `code-simplifier`, `integration-reviewer`, `validation-reviewer`, and optional `silent-failure-hunter`.
---

# Implement

Use this skill when the plan is already approved and the job is disciplined execution.

If the plan is not actually approved, or core scope/invariants are still unsettled, stop and get that clarified first. This skill is for implementation, not architecture drift.

The current session is the primary implementer. Subagents are support mechanisms for research, pressure-testing, and independent review. They do not replace proof.

## Core Principle

Optimize for:
- smaller diffs
- stronger evidence
- reuse over reinvention
- fewer abstractions
- clearer ownership

Do not optimize for:
- code volume
- document volume
- reviewer count for its own sake
- consensus without execution

## Operating Defaults

Use these defaults unless the task clearly needs something else:

- Use direct repo tools for narrow local inspection.
- Use the `subagent` skill for dependent multi-step work or independent review passes.
- If the direct `subagent` tool is not exposed in the current harness, do not skip the phase. Either run it in a live Pi session where the direct tool is exposed, or stop and return blocked.
- Treat missing direct tool access in API/external harnesses as a probable harness-exposure difference before assuming the package is misinstalled.
- For required review phases, the execution priority is: callable direct `subagent` tool → blocked handoff. Do **not** insert nested `pi --mode rpc`, custom Node helpers, print-mode bridges, or ad hoc session-log polling in the middle of that ladder.
- Use `mode: "spawn"` for research, discovery, and design passes.
- Use `mode: "fork"` for review passes that should inspect the current session's implementation work and validation evidence.
- Preserve model-family diversity across reviewers when the roster supports it. In this setup, most implementation/review agents default to `novita/minimax/minimax-m2.7`, while `validation-reviewer` and `silent-failure-hunter` use `deepinfra/zai-org/GLM-5`.
- Capture reviewer outputs explicitly in the parent session; do not rely on implicit artifact files unless the runtime actually produces them.

Reference the `subagent` skill whenever you need the exact payload shape, option names, or current agent roster.

## Execution Contract

Before research or implementation, confirm the execution contract is actually clear enough to proceed.

Required inputs:
- Approved plan
- Non-goals
- Invariants
- Reuse targets
- Complexity budget
- Validation plan

If any of these are missing in a way that materially affects correctness, stop and escalate instead of silently inventing scope.

Use this escalation format:

```markdown
## Escalation: [brief title]
- **Blocked on:** [requirement / invariant / file / contract]
- **Question:** [specific answerable question]
- **Options considered:**
  - A. ... — pros / cons
  - B. ... — pros / cons
- **Recommendation:** [best recommendation and why]
- **Impact of waiting:** [what cannot be completed safely until resolved]
```

Produce an **Execution Contract** summary before continuing.

## Phase 1: Research

Map the codebase for everything relevant to the change.

Produce an **Existing Code Inventory**:
- files and modules the implementation will touch or depend on
- existing implementations of similar functionality
- patterns and conventions that must be followed
- integration points and callsites that may also need updating
- anything likely to be duplicated or over-abstracted

If research materially changes the scope or approach, surface that before implementing.

### Research pattern defaults

Use direct tools for tight local questions. When working in TypeScript/JavaScript, Python, C/C++, Swift, Kotlin, or Rust, prefer the configured LSP where it gives faster or more precise symbol evidence: `typescript-language-server`, `pyright`, `clangd`, `sourcekit-lsp`, `kotlin-language-server`, and `rust-analyzer` are expected local options. Use them for go-to-definition, references, hover/type facts, and implementation jumps; fall back to `sg`, `rg`, and direct file reads when the LSP is unavailable, ambiguous, or slower than source inspection. In JavaScript/TypeScript projects, consider `knip` when the change may create or remove entrypoints, exports, dependencies, scripts, or whole files; treat unconfigured baseline output as triage input, not an automatic cleanup mandate.

Use sequential subagent calls when the work naturally breaks into trace -> design handoffs. A good default is:

```json
// Step 1 — trace
{ "agent": "code-explorer", "task": "Trace the existing implementation, reuse points, invariants, and affected callsites for this approved change.", "mode": "spawn" }

// Step 2 — design
{ "agent": "code-architect", "task": "Convert the exploration findings into an implementation blueprint that stays within the approved scope, non-goals, invariants, reuse targets, and complexity budget.", "mode": "spawn" }
```

If the scope, constraints, or approach remain genuinely ambiguous after research, move to Phase 2. Otherwise skip it and say why.

## Phase 2: Clarify (conditional)

Use the `questionnaire` tool only when ambiguity would materially change:
- implementation shape
- API or schema decisions
- validation requirements
- integration behavior
- operational risk

Keep questions minimal. Do not ask preference questions that do not affect correctness.

## Phase 3: Proof Plan

Before writing code, make the validation plan concrete.

Define:
- mechanical checks
- targeted regression checks
- benchmarks / replay cases / fixtures when behavior or performance requires them
- manual verification only where automation is insufficient
- expected outcomes for pass and fail

The point is not to have more checks. The point is to know what evidence would convince a skeptical human that the change works.

## Phase 4: Implement

Implement exactly the approved scope.

Scope rules:
- no unrequested features or "while I'm here" work
- no speculative abstractions
- prefer editing existing code over adding wrappers or layers
- do not add fallback behavior unless it handles an expected recoverable condition and preserves correctness
- if you discover something broken outside scope, note it instead of fixing it silently

After implementation, run a **Scope Diff**:
- every requested item: `yes` / `partial` / `no`
- any additions not explicitly requested
- complexity delta: new files, interfaces, abstractions, config, fallbacks

If the implementation clearly exceeds the complexity budget, flag that before moving on.

## Phase 5: Mechanical Validation

Run the proof plan before subjective review.

At minimum, run the relevant:
- lint
- typecheck
- tests
- benchmarks / replays / fixtures promised in the validation plan

Capture concrete outcomes, not vague claims.

If a mechanical check fails, fix that first unless it is clearly unrelated.

## Phase 6: Post-Implementation Review Gate

This is a separate hard gate between implementation/mechanical proof and completion.
It is mandatory for any substantive code change and cannot be bypassed.

Before the work can be called complete, you must produce independent review artifacts from the required reviewer passes.
Self-review does not satisfy this gate.
Mechanical validation does not satisfy this gate.
A summary that says review is still pending does not satisfy this gate.

Required evidence for this gate:
- which reviewer agents ran
- which execution path was used (`subagent` tool)
- captured reviewer outputs
- severity-ranked findings
- proof that all `HIGH` and `CRITICAL` findings were either fixed or explicitly escalated

If the direct `subagent` tool is unavailable in the current harness, do not silently continue.
You must either:
1. run the review phase in a live Pi session where the direct `subagent` tool is exposed, or
2. stop and return a blocked status

Do not build a fragile orchestration workaround just to avoid blocking.
Unsupported completion paths for this gate include:
- nested `pi --mode rpc` wrappers
- custom helper scripts that send prompts and poll custom messages
- top-level session-file globbing used as the primary completion detector
- declaring success because a run started, produced one read turn, or remained alive
Fail closed instead: declare the work blocked on the mandatory review gate and provide the exact `subagent` payload needed to complete it.

Use this blocked format:

```markdown
## Blocked: mandatory post-implementation review gate
- **Why blocked:** direct subagent review path is unavailable in this harness
- **Required next step:** run independent review in a live Pi session where the direct `subagent` tool is exposed
- **Implementation status:** code changed, but completion verdict is withheld pending mandatory review
- **What is still missing:** reviewer outputs from code-simplifier, integration-reviewer, validation-reviewer
- **Use this `subagent` payload in live Pi:**
  ```json
  {
    "tasks": [
      {
        "agent": "code-simplifier",
        "task": "Review <FILES>. Focus only on unnecessary complexity, speculative abstraction, redundant logic, or simplifications that preserve behavior. Do not edit. Return concrete findings with severity and file references, or 'no issues'."
      },
      {
        "agent": "integration-reviewer",
        "task": "Review <FILES>. Focus on missed reuse, integration gaps, partial rollouts, duplicate logic, and contract drift. Do not edit. Return concrete findings with severity and file references, or 'no issues'."
      },
      {
        "agent": "validation-reviewer",
        "task": "Audit <FILES> and the validation evidence gathered so far. Focus on proof strength, regression gaps, fallback behavior, silent failure risk, and whether the change is actually demonstrated. Do not edit. Return concrete findings with severity and file references, or 'no issues'."
      }
    ],
    "mode": "fork"
  }
  ```
```

Do not use any of these words unless this gate is satisfied:
- complete
- done
- finished
- implemented successfully

Allowed wording before the gate is satisfied:
- implementation drafted
- code changed
- mechanically validated
- review pending
- blocked on mandatory review gate

Only after this gate is satisfied may you proceed to the independent review synthesis and re-proof steps below.

## Phase 7: Independent Review

Run specialized review passes with distinct mandates. Keep the first round independent.
This phase is mandatory for substantive code changes. Do not stop at a review summary if `HIGH` or `CRITICAL` findings remain.

### Reviewer A — Simplicity / Complexity Veto

Preferred agent:
- `code-simplifier`

Focus:
- unnecessary abstractions
- avoidable wrappers or new files
- speculative generalization
- redundant code or naming churn
- complexity that can be deleted or inlined

### Reviewer B — Integration / Recall Veto

Preferred agent:
- `integration-reviewer`

This agent is configured for integration and codebase-recall review.

Focus:
- missed reuse candidates
- duplicate logic
- touched-but-not-updated callsites
- inconsistent surrounding patterns
- migration or integration incompleteness

### Reviewer C — Validation / Operability Veto

Preferred agent:
- `validation-reviewer`

This agent is configured for proof-strength and operability review.

Ask it to look for:
1. unhandled or untested error paths
2. fallback behaviors that could mask real failures
3. defensive code that quietly degrades correctness
4. missing meaningful testing
5. operational fragility under load, partial failure, or stale state

If the change is heavy on retries, fallbacks, or partial-failure behavior, also run:
- `silent-failure-hunter`

### Review execution default

For implement workflows, use parallel review passes so the reviewers do not anchor on each other:

```json
{
  "tasks": [
    {
      "agent": "code-simplifier",
      "task": "Review the current implementation for unnecessary complexity, speculative abstraction, and simplifications that preserve behavior."
    },
    {
      "agent": "integration-reviewer",
      "task": "Review the current implementation for missed reuse, integration gaps, partial rollouts, and contract drift."
    },
    {
      "agent": "validation-reviewer",
      "task": "Audit whether the current implementation is actually proven by the validation evidence gathered so far."
    }
  ],
  "mode": "fork"
}
```

If you also need a silent-failure pass, run it in the same batch or as an immediate follow-up review.

### Review synthesis

After all independent passes complete:
- preserve each reviewer's distinct findings
- consolidate overlaps without erasing differences
- rank issues by severity
- fix `CRITICAL` and `HIGH` findings
- keep `MEDIUM` and `LOW` findings separate unless they are cheap and clearly worthwhile

If only one reviewer family is available, emulate independence with separate prompts and explicitly note lower confidence.

## Phase 8: Re-Proof and Conditional Additional Review

After fixing substantive findings, rerun the relevant proof checks.
Do not conclude implementation while `HIGH` or `CRITICAL` findings remain unresolved; fix, re-proof, and rerun review until convergence or the 3-fix rule forces escalation.

Trigger another review round only if Round 1 surfaced issues that required real code changes, such as:
- any `CRITICAL` issue
- one or more meaningful `HIGH` issues
- structural gaps that changed the implementation shape

Run a third round only if the second round still finds `HIGH` or `CRITICAL` issues.

Apply the **3-fix rule** aggressively:
- if 3 distinct fixes each surface a new problem in a different place, stop
- do not proceed to fix #4 as if this were still local cleanup
- surface the pattern as architectural

## Phase 9: Closeout

Implementation is complete only when:
- the **Post-Implementation Review Gate** has been satisfied
- the **Scope Diff** is clean, or deviations are explicitly called out
- promised validation evidence has been run and captured
- all `CRITICAL` and `HIGH` findings are resolved or explicitly escalated
- no reviewer has an unaddressed structural veto
- remaining concerns are documented clearly

Use this closeout structure:

```markdown
# Closeout

## Execution Contract
## Existing Code Inventory
## Clarify Status
## Proof Plan and Validation Results
## Scope Diff
## Post-Implementation Review Gate Status
## Review Findings by Role
## Outstanding Risks or Follow-ups
## Completion Verdict
```

Do not claim success based only on model agreement. Evidence comes first.
