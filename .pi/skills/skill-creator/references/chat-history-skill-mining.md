# Chat-History Skill Mining

Use this workflow when improving a skill from historical chats, transcripts, or archive exports.

## Goal

Turn real correction behavior into patch-ready skill updates and eval prompts without polluting the skill with stale project context.

## Workflow

1. Build candidate spans, not whole-chat summaries.
2. Prioritize correction loops:
   - model assumption
   - user correction
   - corrected output
3. Multi-label each span by:
   - target skill
   - project or work area
   - artifact type such as `positive_example`, `correction`, `refinement_request`, `template`, or `iteration`
4. Cluster spans by failure mode, not just topic.
5. Novelty-check each cluster against the current skill before proposing a patch.
6. Produce separate artifacts for:
   - patch candidates
   - eval designs
   - meta summaries
7. Apply only the highest-confidence patches first, then rerun evals.

## What to prioritize

- Correction spans over generic positive examples
- Repeated user refinements over one-off preferences
- Anti-patterns that caused observable rework
- Wording that repeatedly improved output quality
- Eval prompts derived from real failures

## Anti-patterns

- Treating whole chats as a single unit when one chat contains multiple projects or skills
- Mixing patch candidates, eval designs, and summaries in one machine-readable file
- Using generic eval prompts that drift outside the real domain
- Applying synthesized patch backlogs blindly without novelty checking
- Treating exploratory synthesis as source of truth instead of hypothesis

## Output discipline

- Keep schemas stable and versioned
- Preserve source provenance for every span
- Keep project-specific content out of general-purpose skill rules unless it reflects a durable pattern
- Prefer a small set of high-confidence patches over a large noisy backlog
