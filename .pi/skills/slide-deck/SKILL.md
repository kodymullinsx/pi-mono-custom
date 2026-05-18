---
name: slide-deck
description: Use this skill whenever the user asks to create, improve, review, structure, storyboard, polish, or QA a slide deck, presentation, executive deck, PowerPoint narrative, data-flow diagram, process diagram, or slide-based work product. This skill governs deck structure, visual hierarchy, diagram readability, and final review. If the deliverable is a .pptx/.pptm/.potx/.ppsx file, use this skill together with the pptx skill so PowerPoint packaging and compatibility checks are handled correctly.
---

# Slide Deck

This skill helps turn source material into a coherent slide-based work product. It is intentionally about deck judgment: structure, narrative, visual hierarchy, diagram clarity, and final review. When the output is an actual PowerPoint file, use the `pptx` skill for file mechanics, rendering, OOXML validation, and desktop PowerPoint compatibility.

For detailed slide structures and reusable diagram patterns, read [references/structure-patterns.md](references/structure-patterns.md) when the user asks for a deck structure, control-evidence slide, process flow, data-flow diagram, model-flow diagram, or operational/technical slide. That reference includes the operational swimlane pattern used for the LST model data-flow slide.

## Source hierarchy

1. Follow the user's explicit request, target audience, and output path.
2. If the user provides a structure guide, template, brand guide, prior deck, or example, inspect it before designing.
3. If a referenced guide file is empty, say so briefly and proceed from this skill's workflow and the available source material.
4. Preserve deliberate file organization and requested output locations.
5. For long local text guides, normalize CR/CRLF line endings before concluding the file is empty or unreadable.

## Planning

For non-trivial decks, write a plan before building. Include:

- the deck purpose and likely audience
- the intended slide count or artifact shape
- the core message of each slide or section
- the visual treatment for dense concepts, such as diagrams, tables, callouts, or timelines
- the verification steps, including render review and PowerPoint open testing when applicable

Only ask clarifying questions when the missing answer materially changes the deck. Otherwise make a reasonable assumption and keep moving.

## Structure

Prefer a usable deck over a decorative one. Every slide should earn its place by answering one job:

- orient the reader
- explain a process or system
- compare options or evidence
- surface a decision, risk, gap, or recommendation
- close with the action or implication

Avoid generic landing-page or marketing compositions for operational decks. For audit, risk, finance, model, data-flow, or control decks, prioritize scanability, precise labels, and quiet visual hierarchy over oversized hero treatments.

## Diagram Slides

Use diagrams when relationships matter more than prose. For data-flow, process, control, model, or system diagrams:

- Read [references/structure-patterns.md](references/structure-patterns.md) and choose the closest pattern before drawing.
- Prefer lanes, phases, or grouped regions when they reduce cognitive load.
- Make the main path visually dominant and secondary context quieter.
- Use labels such as "observed," "documented," "manual input," or "platform evidence" only when they prevent misinterpretation.
- Keep node labels concise; put caveats in captions, footers, notes, or adjacent callouts.
- Avoid diagonal connectors unless they are the only clear route.
- Prefer orthogonal L-shaped connectors or block arrow shapes for editable PowerPoint diagrams.
- Remove non-essential cross-lane arrows before adding complex routing.
- Never let an arrow appear to originate from the wrong group or terminate between objects.

For control or validation flows, the decision point should be visually unambiguous: inputs feed the gate, the gate feeds the decision, and "yes/no" branches land directly on their outcomes.

For operational model/data-flow slides, prefer the reusable swimlane structure from the reference: inputs/triggers, runtime/process, validation/control gate, decision paths, outputs/evidence. Use it when the deck needs to show model execution, validation checks, exception handling, stakeholder notification, logs, or downstream reporting.

## Visual QA

Rendered slides are the source of truth for visual quality. Before delivery:

1. Render the deck to PDF/PNG and inspect the actual output.
2. Trace every arrow from source to target. Confirm each connector lands on the intended node and does not cross unrelated content in a misleading way.
3. Check text fit, alignment, margins, lane headers, labels, and footer/citation placement.
4. Confirm colors and line weights preserve hierarchy without creating visual noise.
5. If a connector or inherited shape effect looks like a stray line, simplify or remove it and render again.

## PowerPoint Deliverables

When the user needs a `.pptx`, `.pptm`, `.potx`, `.ppsx`, or related PowerPoint file:

- Use the `pptx` skill.
- Use editable native shapes where practical.
- Avoid fragile generated line-arrow XML for diagram-heavy slides when block arrows or L-shaped arrow assemblies work.
- Run package validation and rendered preview checks.
- When Microsoft PowerPoint is installed, run a desktop PowerPoint clean-open smoke test and confirm it does not ask to repair the file.
- Report any validation or compatibility check that could not be run.

## Closeout

Final responses should name the output path, the key changes, and the verification performed. If the deck was visually revised after render review, say what was fixed in plain language.
