# Structure Patterns

Use these patterns when a user asks for a deck structure, a technical process slide, a control-evidence slide, or a data-flow/model-flow diagram. They distill the local slide deck structure guide plus the LST model diagram repair loop.

## Core Deck Framework

Build decks in four phases:

1. Planning: define objective, audience, decision need, and content priority.
2. Design: choose a consistent layout system, containment strategy, colors, typography, and navigation cues.
3. Content development: write concise, audience-appropriate headings and body text.
4. Refinement: verify content, render visuals, trace connectors, and test the final artifact.

Standard sections:

- Title
- Agenda or orientation
- Context/background
- Main content sections
- Summary or key takeaways
- Next steps or audience action
- Appendix for technical support

For technical presentations, separate conceptual explanation from technical implementation details. Use section dividers or consistent color cues when the deck spans multiple content categories.

## Layout And Containment

Use containment to make dense technical slides readable:

- Visual boundaries: subtle backgrounds, thin borders, or both.
- Consistent styling: similar evidence types should use similar containers.
- Logical grouping: related nodes and details belong in the same region.
- Hierarchy: larger or higher-contrast containers signal importance.
- Breathing room: leave clear gaps between lanes, cards, and arrows.

Good structures:

- Three-panel: input -> process -> output.
- Content/evidence/impact: technical content plus a business relevance area.
- Context bar plus body containers: top framing statement above detailed evidence blocks.
- Hierarchy containers: primary container with nested sub-containers.
- Information flow: source -> transformation -> validation -> target/result.

## Technical Control Evidence Pattern

Use this when the slide needs to demonstrate a control, test, validation, or audit evidence trail.

Core components:

- Context banner: test purpose or control objective.
- Input/source evidence: where the data or trigger originates.
- Process/validation evidence: how the control processes the input.
- Result/output evidence: what the system produces or rejects.
- Validation table or check cards: trace key fields/checks.
- Impact statement: why the control or finding matters.
- Status indicators: success/failure or normal/exception handling.

Positive test slides should show the expected path and validation success. Negative test slides should show invalid input, rejection/error handling, and why that protects the process.

## Process Flow Pattern

Use this when the user needs to explain sequential stages or relationships between components.

Core components:

- Process context.
- Flow diagram.
- Short step descriptions.
- Directional indicators.
- Entry and exit points when applicable.
- Optional "why this matters" or impact block.

Prefer contained flow blocks over loose text. For multi-path flows, make decision points explicit and label branches directly.

## Operational Data-Flow Swimlane Pattern

Use this pattern for model flows, data integrity controls, 2LOD/IA technical diagrams, system interfaces, data pipelines, scheduler/orchestration flows, and validation/error-handling diagrams.

Recommended lane sequence:

1. Inputs & triggers: source systems, files, manual inputs, UI/cron/scheduler triggers.
2. Runtime/process: model, service, job, APIs initialized or used by the runtime.
3. Validation/control gate: automated checks, manual gates, reconciliation controls, required fields, count checks.
4. Decision paths: success/failure branch, abort conditions, retry handling, exception paths.
5. Outputs & evidence: production writes, reports, emails, stakeholder notifications, logs, downstream BI/reporting.

Design treatment:

- Use vertical lanes with strong, short headers.
- Make the runtime or control gate visually dominant.
- Use brand/core color for the primary process, cool blue for validation/control, green for success outputs, warm orange for decisions, and red/cayenne for failure/abort.
- Place check cards inside a contained validation panel rather than connecting every individual check to every outcome.
- Keep documented/contextual flows quieter than observed/code-evidenced flows.
- Use a compact legend only when line or color semantics could be ambiguous.
- Include a muted footer for source artifacts or basis of preparation.

Connector rules:

- Main path: inputs -> runtime -> validation gate -> decision.
- Success path: decision "No" branch -> calculations/writes -> completion email/reporting/stakeholders.
- Failure path: decision "Yes" branch -> failure handling -> stakeholder alert -> abort -> logs/evidence.
- Do not draw direct arrows from individual validation check cards to failure handling unless each check has a distinct outcome worth showing.
- Avoid cross-lane arrows that cross cards or imply false dependencies. If a relationship is contextual, use a quiet label or note instead.
- Prefer L-shaped or orthogonal connectors. If a connector is visually noisy, remove it and rely on lane ordering plus labels.

Quality bar:

- A reader should be able to trace the main flow in under ten seconds.
- Every arrow should have one obvious source and one obvious target.
- No arrow should terminate between objects.
- Failure and success branches should be visually distinct without overwhelming the main process.
- The slide should remain useful if shown as a static screenshot, but the PowerPoint objects should stay editable.
