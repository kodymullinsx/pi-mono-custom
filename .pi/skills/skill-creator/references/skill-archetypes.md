# Skill archetypes

Use this guide after the user's intent is clear enough to classify the skill's dominant operating mode. The archetype is not a box the skill must fit perfectly. It is a design shortcut: choose the structure, resources, tests, and trigger description that match the skill's main failure mode.

If a skill spans several modes, name the primary archetype first and add only the secondary pieces that materially improve reliability. Do not add scripts, schemas, references, or templates just because an archetype could use them.

## Quick router

| Archetype | Use when | Primary risk | Best proof |
|---|---|---|---|
| Artifact / execution | The user expects a concrete file, transformed dataset, code artifact, or package | The artifact is wrong, corrupted, incomplete, or not validated | File validators, scripts, fixtures, rendered previews, before/after comparisons |
| Procedural / professional guidance | The user needs domain judgment, methodology, drafting rules, or a professional workflow | The answer uses the wrong doctrine, tone, structure, or decision framework | Scenario prompts, rubric grading, good/bad example checks, reviewer feedback |
| Style / brand transformation | The user wants existing content transformed to match a style, brand, palette, or voice | The transformation over-edits, under-applies rules, or damages source intent | Before/after comparisons, visual checks, source-of-truth conformance checks |
| Live-system / operational | The skill guides work against an API, CLI, local app, database, browser, or service | The agent causes unintended side effects, misses auth/context limits, or hides failures | Dry-runs, read-only smoke checks, mocked writes, confirmation-gate tests |
| Hybrid | Two or more modes are necessary for the actual workflow | The skill becomes bloated or tests the wrong thing | Primary-archetype proof plus one or two secondary checks |

## Artifact / execution skills

Use this archetype when the skill creates, edits, repairs, converts, audits, or packages a concrete artifact. Local examples include `xlsx` and `pptx`. Other examples include PDF repair, DOCX generation, data-cleaning pipelines, code-generation helpers, workbook repair, and script-backed production skills.

### Design goal

Optimize for correct output, preservation of user-provided structure, repeatable execution, tool selection, and validation before delivery. The most important bundled resources are usually scripts, schemas, validators, fixtures, and examples. References are still useful, but they should support execution reliability rather than become long essays.

### Recommended folder shape

```text
skill-name/
├── SKILL.md
├── LICENSE.txt                 # if needed
├── scripts/                    # deterministic inspection, edit, preview, or QA tools
│   ├── manifest.yaml            # useful when scripts have stable contracts
│   └── ...
├── schemas/                    # optional JSON schemas for script outputs
├── references/                 # file-type policy, preservation rules, cookbook, troubleshooting
├── fixtures/                   # optional input/output examples for tests
└── examples/                   # short workflow examples
```

Use this shape only when complexity warrants it. A small artifact skill may need only `SKILL.md`, one helper script, and a few test prompts.

### What belongs in SKILL.md

Keep the main skill focused on when to use the skill, file-type policy, standard workflows, tool-selection rules, validation gates, and pointers to scripts or references. Put long tool manuals, troubleshooting lists, and cookbook examples in references. Put repeatable inspection, conversion, preview, and validation logic in scripts.

### Quality gates

Artifact skills should answer these questions before delivery:

- What file types trigger the skill, and what near-miss formats do not?
- What must be preserved from user-provided artifacts?
- Which tools are safe for each workflow, and which tools are destructive?
- What scripts are available, what are their inputs and outputs, and what side effects do they have?
- What validators, previews, or comparisons must pass before the artifact is delivered?
- What errors block delivery and must be disclosed?

For `xlsx` and `pptx`-style skills, include preservation policies, deterministic QA, preview/render workflows, and explicit gates such as “do not deliver until package validation and visual QA pass.” Script manifests and schema-stable outputs are useful when scripts are numerous or reused across evals.

### Common mistakes

Do not rebuild preservation-sensitive user files from scratch when targeted edits are safer. Do not promise exact round-tripping for unsupported formats. Do not let a script silently degrade output quality. Do not add schemas or manifests for one-off helpers that have no stable contract.

### Eval patterns

Use evals that produce files, not only text explanations. Good expectations check package validity, required files or sheets/slides, preserved metadata, formula or relationship integrity, expected content, and rendered previews. Prefer programmatic expectations when possible, then use human review for visual or judgment-heavy qualities.

### Trigger-description patterns

Artifact descriptions should include file types, deliverable names, file-operation verbs, and preservation-sensitive contexts. Include near-miss negatives in trigger evals: tabular data that only needs CSV, a general analysis prompt without a workbook deliverable, or a request for advice rather than artifact modification.

## Procedural / professional guidance skills

Use this archetype when the skill guides a professional workflow, drafting standard, decision process, methodology, or policy interpretation. Local examples include `fieldwork-execution`, `issue-drafting`, `planning-memo`, and `rcm-development`. Non-audit examples include legal drafting guidance, consulting delivery playbooks, policy interpretation, research workflows, incident postmortem methodology, and internal operating procedures.

### Design goal

Optimize for correct routing, controlled language, domain judgment, concise outputs, and reviewable work products. The most important bundled resources are reference indexes, doctrine hierarchy, task routers, templates, checklists, rubrics, controlled vocabulary, prohibited-language guidance, and good/bad examples.

### Recommended folder shape

```text
skill-name/
├── SKILL.md
├── references/
│   ├── index.md                 # what to read for each task
│   ├── doctrine-hierarchy.md    # source priority and conflict rules
│   ├── templates.md             # output structures and section patterns
│   ├── controlled-language.md   # required, preferred, and prohibited terms
│   ├── checklists.md            # task-specific review checks
│   ├── rubrics.md               # grading standards for evals and human review
│   └── examples.md              # good and bad examples with explanation
└── evals/                       # optional scenario prompts and expected checks
```

A compact procedural skill may keep the router and the most common templates in `SKILL.md`, then use references only for long doctrine, examples, and edge cases.

### What belongs in SKILL.md

Keep the main skill focused on task routing, source priority, core style rules, and the shortest reusable templates. Long reference material belongs in `references/`. Domain examples should teach the pattern without turning the archetype into one domain's policy manual.

### Quality gates

Procedural skills should answer these questions before delivery:

- What task is the user performing?
- Which reference governs that task, and what wins if references conflict?
- What facts are required before drafting?
- What template or section structure applies?
- What language is required, preferred, or prohibited?
- How should missing information be handled?
- What checklist or rubric should be used before final output?

For audit-style skills, this may include doctrine hierarchy, IAD language rules, concise output standards, issue or control templates, and workpaper checklists. For non-audit skills, use the same pattern with the domain's governing sources. A legal drafting skill might prioritize jurisdiction, clause type, client position, defined terms, and fallback language. A consulting delivery skill might prioritize engagement phase, audience, decision needed, artifact template, and executive-ready wording.

### Common mistakes

Do not bury the task router under long reference prose. Do not make examples so domain-specific that the model cannot generalize. Do not use all-caps rules where a concise reason would teach better judgment. Do not overfit the skill to one user's last correction when the pattern is broader.

### Eval patterns

Use scenario prompts with realistic messy context. Expectations should check routing, required facts, section structure, controlled vocabulary, prohibited phrases, length limits, and whether the output follows the right decision framework. Rubric grading is often better than brittle string matching, but prohibited-language and required-template checks can be programmatic.

### Trigger-description patterns

Procedural descriptions should include task contexts, work products, domain terms, and lifecycle phases. Trigger evals should include prompts that never name the skill but clearly request the work product. Near-miss negatives should include generic writing, unrelated domain advice, or requests where another skill should own the artifact.

## Style / brand transformation skills

Use this archetype when the skill transforms existing content to match a brand, voice, palette, design system, or style guide. `schwab-branding` is a local example. Other examples include executive-tone rewrites, house-style editing, brand deck recoloring, accessibility color checks, or publication-format conversion.

### Design goal

Optimize for faithful transformation. The skill should apply the style rules while preserving the user's underlying content, intent, structure, and unrelated design choices.

### Recommended folder shape

```text
skill-name/
├── SKILL.md
├── references/
│   ├── style-guide.md           # source-of-truth rules
│   ├── transformation-rules.md  # what to change and what to preserve
│   └── examples.md              # before/after examples
├── assets/                      # palettes, templates, fonts, sample images if allowed
└── scripts/                     # optional preview or contrast/brand checks
```

### What belongs in SKILL.md

Keep the main skill focused on source-of-truth rules, transformation boundaries, workflow, and QA checks. Use references for long palettes, voice rules, or examples. Use assets only when they are stable and licensed for reuse.

### Quality gates

Style and brand skills should answer these questions:

- What is the authoritative style source?
- What must change, and what must not change?
- How should conflicts between readability, accessibility, and brand rules be resolved?
- What before/after review proves the transformation worked?
- What visual or text checks are required before delivery?

### Common mistakes

Do not modify layout, wording, images, or data unless the transformation actually requires it. Do not apply palette or voice rules mechanically when contrast, meaning, or hierarchy would suffer. Do not confuse generic design advice with a request to apply a specific brand system.

### Eval patterns

Use before/after prompts with representative artifacts or text. Expectations can check required colors, prohibited colors, unchanged images, preserved slide count, retained headings, or required voice markers. Human review is often needed for visual hierarchy and tone.

### Trigger-description patterns

Descriptions should include the brand or style name, transformation verbs, and target artifacts. Trigger evals should include direct and indirect requests to apply the style. Near-miss negatives should include generic design critique, unrelated editing, or a request to create new content without applying the named style system.

## Live-system / operational skills

Use this archetype when the skill guides interaction with an API, CLI, local app, database, browser, or service. Examples include GitHub, Sentry, browser tools, Apple Mail, Monarch, deployment tools, and internal admin CLIs.

### Design goal

Optimize for safe, correct operations against live systems. The skill should make tool choice, auth assumptions, side effects, confirmation gates, rate limits, and failure handling clear.

### Recommended folder shape

```text
skill-name/
├── SKILL.md
├── references/
│   ├── commands.md              # supported commands or API calls
│   ├── safety.md                # read/write boundaries and confirmation rules
│   ├── troubleshooting.md       # common auth, rate limit, and environment failures
│   └── examples.md              # common workflows
└── scripts/                     # optional wrappers or read-only inspection tools
```

### What belongs in SKILL.md

Keep the main skill focused on when to use the skill, allowed tools, read-before-write workflow, confirmation requirements, and common command patterns. Put long API references and troubleshooting details in references.

### Quality gates

Operational skills should answer these questions:

- What tool or service owns the task?
- What credentials, local state, or environment assumptions apply?
- Which operations are read-only, and which can mutate external state?
- What user confirmation is required before writes, sends, deletes, deployments, or purchases?
- How are errors, rate limits, partial failures, and stale data disclosed?
- What proof shows the live action happened or the read-only result is current?

### Common mistakes

Do not hide a failed API call behind stale cached output. Do not perform irreversible or external actions without explicit confirmation. Do not assume a CLI flag exists without verifying command ownership and help output. Do not overfit to one local machine if the skill may be shared.

### Eval patterns

Prefer read-only or mocked evals. For live tools, use dry-run modes, local fixtures, harmless list/get calls, or recorded examples. Expectations should check that the skill asks for confirmation before side effects, reports failures clearly, uses the right command family, and does not invent results.

### Trigger-description patterns

Descriptions should include service names, tool names, common user goals, and action verbs. Trigger evals should distinguish live interaction requests from generic advice. Near-miss negatives should include prompts that mention the service but only ask for conceptual guidance.

## Hybrid skills

Use this archetype when the skill truly needs more than one operating mode. Most hybrid skills should still have a primary archetype. Name it, then add only the secondary guidance that reduces real failures.

Examples:

- A procedural audit skill that produces workpapers is still primarily procedural. It may include artifact guidance for templates or file output, but its main proof is methodology, language, and rubric conformance.
- An Excel workbook repair skill is primarily artifact/execution even if it includes policy references. Its main proof is that the workbook opens, preserves structure, recalculates, and passes QA.
- A brand deck recoloring skill may be style/brand plus artifact/execution. It needs brand rules and visual QA, plus package preservation checks.
- A GitHub release skill may be live-system plus artifact/execution if it writes changelogs or packages assets, but external side-effect safety remains the primary risk.

### Hybrid design rules

Pick one primary owner for the workflow. Keep `SKILL.md` as the router and move secondary details into references. Avoid duplicating the same template, script instruction, or checklist in multiple places. When designing evals, prove the primary failure mode first, then add a small number of secondary checks.

### Hybrid trigger-description patterns

Lead with the primary task and add secondary contexts only when they materially affect triggering. Do not stuff every related noun into the description. Use trigger evals to test ambiguous prompts where the skill competes with another skill.
