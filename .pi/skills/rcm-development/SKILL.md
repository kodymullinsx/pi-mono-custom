---
name: rcm-development
description: "Guidance for developing RCM documentation—control descriptions, test steps, risk mappings, and control classification (automated, ITDM, interface, manual). Use when classifying controls, determining key vs non-key, converting process descriptions to controls, or proposing RCSA/IAD changes. Triggers: scope boundaries, overview sections, test-step writing, RCSA vs IAD distinction, ITDM reclassification."
---

# IAD RCM Development

## IT RCM Scope Boundaries

For audits testing interface and semi-automated controls, the IT RCM scope is limited to:

| In Scope | Out of Scope (ITGC workstream) |
|----------|-------------------------------|
| Interface controls | User access reviews |
| Reconciliation key reports | Change management (SDLC level) |
| Semi-automated controls | Patch management |
| | Job scheduling at infrastructure level |

**Never include IT general controls (ITGC-type) in a business process IT RCM.** They are tested separately under the ITGC workstream. When in doubt, ask whether the control's failure would be caught in the ITGC workstream — if yes, it belongs there, not here.

---

## Workpaper Structure Requirement

Every IAD workpaper MUST include an **Overview section** (3-5 sentences) as the first substantive section, before the Walkthrough:

```
Overview:
[3-5 sentences covering: (1) the control being tested, (2) its business purpose,
(3) its position in the control framework.]
```

Never omit the Overview. If content is unclear, prompt the user rather than skipping it.

---

## RCSA vs IAD Controls

Controls in the RCM come from two sources, and the distinction matters when drafting or proposing changes:

| | RCSA Controls (1st Line) | IAD Controls (2nd Line) |
|---|---|---|
| **Author** | Management (business process owners) | Internal Audit (IAD) |
| **Typical category** | Manual, Semi-Automated | Automated, Interface |
| **Purpose** | Describe what management does to mitigate risk | Validate that system logic operates as designed |
| **RCM heuristic** | Manual/Semi-Auto controls are almost always RCSA | Automated controls are almost always IAD |
| **Description voice** | Describes the performer's action and its outcome | Describes the system's configuration and its behavior |

You cannot determine RCSA vs IAD from the RCM alone — but the heuristic above holds in the vast majority of cases.

**Why this matters:** When IAD recommends a description change, you are proposing that *management* update *their* control language. The description must still read as management's own statement of what they do — not as an IAD test procedure or an observation about what the system does.

---

## Control Change Proposals

When IAD identifies that an existing RCSA control description does not accurately reflect how the control operates (e.g., a hidden system dependency), use the change proposal workflow.

### When to use
- An RCSA control is classified as Manual but depends on system-generated output (hidden ITDM)
- A control description omits a system component that determines the control's effectiveness
- A prior-year reclassification moved in the wrong direction (e.g., Semi-Auto → Manual when the system dependency still exists)

### Proposal structure

For each proposed change, provide:

| Element | Content |
|---|---|
| **Control ID** | RCSA control ID and short name |
| **Current Description** | Verbatim from the RCM |
| **Current Category** | Manual, Semi-Automated, etc. |
| **Proposed Description** | New text with system-dependent language **bolded** |
| **Proposed Category** | The reclassified category (e.g., ITDM) |
| **Corresponding IAD Control** | The IAD automated control that tests the system component |
| **IAD Rationale** | 2–4 sentences, paragraph format — what the dependency is, why the current description is insufficient, what risk the gap creates |

**Rationale writing rules:**
- Concise paragraph format — not bullet lists, not verbose analysis
- Reference specific IAD workpaper evidence (control IDs, attribute results)
- State what the manual reviewer *cannot* detect without the system operating correctly
- Reference any open issues that confirm the gap (e.g., Issue_024149)

### Standard ITDM Pattern (Non-Reclassification)

For everyday ITDM controls where no reclassification is being proposed, use the **2-sentence structure**:

```
Sentence 1 (manual component): [Frequency], [Performer] [reviews/validates/confirms] [what they act on].
Sentence 2 (system component): [System] [is configured to / automatically generates / enforces]
                                [automated action that supports the manual review].
```

**Example:**
> Daily, the Compliance team reviews the Trade Surveillance Exception Report to identify potential policy violations. The Surveillance System automatically generates the report based on predefined detection scenarios and risk parameters.

**When to use 3 sentences:** Only when explicitly documenting the scope-determination dependency — i.e., when writing an ITDM reclassification proposal or when the hidden system dependency is itself the audit finding. In all other cases, 2 sentences is the correct length.

---

### ITDM Reclassification Pattern

The most common change proposal is upgrading a Manual RCSA control to ITDM when a hidden system dependency is discovered. This happens frequently with SAP Ariba, Calypso, PlanIT, and other enterprise platforms where system configuration determines what the manual reviewer sees.

**The pattern:** A manual reviewer (RCM, VSM, CO) performs a review of items that a system generated. If the system fails to generate an item, the reviewer has nothing to review — and no way to detect the omission. The manual review is real, but its *scope* is system-determined.

**ITDM 3-sentence structure for reclassification proposals:**

```
Sentence 1 (manual component): [Performer] [reviews/confirms/validates] [what they act on].
Sentence 2 (system component):  [System] is configured to [automated action that determines
                                 scope/population of the manual review].
Sentence 3 (outcome):           [What happens when the control fires correctly — observable result].
```

**Example (approved in production):**
> Prior to contract signing, the CVM Vendor Sourcing Manager (VSM) confirms that all required Planning/Risk Assessment and Due Diligence tasks generated within the SAP Ariba Contract Workspace are completed. SAP Ariba is configured to generate the required task population, including Agreement Risk Forms (ARFs) triggered based on Contract Workspace data fields (e.g., amendment designation, sub-agreement type). Incomplete tasks are visible within the Contract Workspace and prevent the VSM from advancing the contract to execution.

**Common mistakes in ITDM reclassification drafts:**
- Ending with a limitation statement instead of an outcome ("...the reviewer cannot detect the omission") — this belongs in the rationale, not the control description
- Embedding Boolean logic or configuration details — that belongs in the test steps
- Writing from IAD's perspective instead of management's ("IAD has determined that...") — the description is management's control, not IAD's finding

---

## Pre-Flight Checklist

Run this checklist before outputting any control description draft. If any item fails, revise before presenting to the user.

| # | Check | Common Failure |
|---|---|---|
| 1 | Does every sentence end with an **outcome**, not a purpose clause? | "...to ensure..." or "...to prevent..." |
| 2 | Is the description **1-2 sentences** (or 3 for ITDM)? | Verbose drafts with 4+ sentences |
| 3 | Does it use **active voice, present tense**? | Passive constructions |
| 4 | Does it name the **specific system** (not "the system")? | Generic system references |
| 5 | Does it avoid **"ensures"** and use the correct action verb? | "ensures" used as a catch-all |
| 6 | Is implementation detail **absent** from the description? | Named tabs, field lists, Boolean logic in the description body |
| 7 | For ITDM: Does sentence 2 describe the **system component**, and sentence 3 the **outcome**? | Sentence 2 is an observation; sentence 3 is a limitation |
| 8 | For change proposals: Is the description written in **management's voice**, not IAD's? | "IAD has determined...", "This control depends on..." |
| 9 | For non-ITDM controls: Is the description **more than 2 sentences**? If yes, rewrite. | Third sentence almost always contains threshold or implementation detail that belongs in test steps |
| 10 | Does the description contain **enumerated values, threshold numbers, field names, or "including X, Y, Z" patterns**? If yes, remove them. | Specific values and field lists belong in test steps Attribute A, not the control description |
| 11 | Does the description reference a **specific technical filename or script path** (e.g., `MissingAribaDataIRSQ.py`, `P:\DEN-Dept\...`)? If yes, replace with a descriptive name. | Use "the Ariba IRSQ Python script" not "MissingAribaDataIRSQ.py" — filenames belong in workpapers, not control descriptions |

---

## Verbosity Diagnostic

These patterns in a draft description are red flags that the description has crossed into test-step territory. If any of these appear, remove or condense before delivery.

| Signal | Draft Example | Fix |
|---|---|---|
| Enumerated threshold values | "...below 31 for non-law firms, and below 17 for law firms" | Condense: "...against defined completeness thresholds" |
| Field-level specificity | "...including trade ID, counterparty, and settlement details" | Condense to data type: "...trade data" |
| Conditional exclusion logic | "Projects in Draft status or in change request are excluded from..." | Move to Attribute C (negative test) |
| "Including X, Y, Z" lists | "...including null checks, data type validation, and range verification" | Condense: "...data quality checks" |
| Purpose clauses ("to ensure", "to confirm") | "...to ensure current SR Project data is queried" | Replace with outcome: "...with data integrity errors logged daily" |
| A third sentence in a non-ITDM control | Any third sentence on a Manual, Interface, or EUC control | Stop at 2 — the third sentence is almost always detail for Attribute A |
| Technical filename or file path | `MissingAribaDataIRSQ.py`, `P:\DEN-Dept\...\script.py` | Use a descriptive name: "the Ariba IRSQ Python script"; paths and filenames belong in workpapers |

**Before (over-detailed):**
> MissingAribaDataIRSQ.py is configured to evaluate each SR Project ID against defined completeness thresholds — Business Details count of zero, IRSQ or Business Details count below 31 for non-law firms, and below 17 for law firms — and assigns an issue flag or warning classification accordingly. Projects in Draft status or active change request are assigned warning classifications and excluded from the actionable output.

**After (correct):**
> MissingAribaDataIRSQ.py is configured to evaluate SR Project IDs against defined completeness thresholds and assign issue flag or warning classifications. Projects in Draft status or active change request are excluded from the actionable output as potential-issue warnings.

The description's job is to name the control mechanism and its outcome — not to enumerate the logic. Logic belongs in test step Attribute A.

---

## Quick Reference Formulas

### Control Description
```
[SYSTEM/WHO] + [ACTION] + [WHAT IS CONTROLLED] + [OUTCOME WHEN CONTROL FIRES]
```
**Length:** 1-2 sentences (ITDM exception: 3 sentences max) | **Voice:** Present tense, active | **Rule:** Sentence 2 must be an outcome statement — NOT a purpose clause

**Correct ending (outcome):** "Any records failing validation are rejected and logged in [system] for review by [team]."
**Incorrect ending (purpose):** "...to ensure data integrity." or "...to prevent unauthorized access."

**Conciseness guardrail:** Keep the control description at the objective/outcome level. Do not enumerate implementation mechanics, named tabs, validation sub-types, or detailed evidence references in the control description itself. Put that detail in the test steps or supporting workpapers.

**Precision in Method Language:** Use the exact method name the user specifies. Never upgrade to a stronger synonym:
- "text search" ≠ "diff" or "comparison"
- "log review" ≠ "automated monitoring"
- "manual reconciliation" ≠ "automated reconciliation"

Overstating control strength inflates audit assurance.

### Test Step Opening
```
Perform a walkthrough of [system/process] and inspect [documentation] to [confirm/validate]:
[Configuration/System inspection statement] (Attribute A)
[Positive Testing statement] (Attribute B)
[Negative Testing statement] (Attribute C)
[Error Handling & Monitoring statement] (Attribute D)
[Privileged Access statement] (Attribute E)
[Change Management statement] (Attribute F)
```

**Unconditional Rule:** Write test steps as always-executable inspection or walkthrough procedures. Do not embed `if/then` logic inside the step. If the triggering condition is absent, document `N/A` with rationale in the results, scope note, or workpaper narrative rather than turning the step into a decision tree.

---

## Action Verb Quick-Select

| Control Type | Use | Avoid |
|--------------|-----|-------|
| Configurable | "is configured to" | "ensures" |
| Enforcement | "enforces," "prevents," "restricts" | "ensures" |
| Validation | "validates," "verifies," "confirms" | "ensures" |
| Monitoring | "monitors," "logs," "tracks" | "ensures" |
| Manual | "performs," "reviews," "approves" | "ensures" |

**Never use "the system"** — always specify actual system name (Calypso, Migraph, SAP Ariba).

**Deprecated system names:** In TCM workpapers, use **TADx** (current). Never use "Harrier" (deprecated, replaced by TADx in 2023) except when explicitly describing the historical transition.

---

## Decision Quick-Checks

### Split vs Combine Controls

**Split when:**
- Different frequencies (daily vs monthly)
- Different owners/performers
- Different systems
- Different testing approaches

**Combine when:**
- Same risk with sequential steps
- Integrated workflow (cannot test independently)
- Same owner, frequency, system

### Key vs Non-Key

**Key Control:**
- Direct impact on financial statements/compliance
- No compensating controls
- Failure → material misstatement

**Non-Key Control:**
- Supports key controls
- Compensating controls exist
- Failure → would not result in material misstatement

---

## RPA / EUC Controls — 6-Attribute Pattern

RPA and EUC automated processing controls require **6 attributes (A through F)**. Attribute F is frequently omitted — it is required.

| Attribute | Description |
|-----------|-------------|
| A | EUC configuration inspection |
| B | Positive test — valid data processed correctly |
| C | Negative test — invalid data rejected/flagged |
| D | Error handling and alerting |
| E | Access — minimum robot permissions, no superuser, encrypted credentials |
| **F** | **Change management SOD — modifier ≠ promoter** |

## Decision Table Validation

Before finalizing any decision table or routing matrix:
1. Identify all mutually exclusive fields.
2. Verify no row combines mutually exclusive states.

**SAP Ariba:** Master Agreement and Sub Agreement are mutually exclusive (enforced by UI). No row should have both set to true simultaneously.

---

## Standard RCM Output

When delivering RCM content, provide these four components:

1. **Risk** — Format: [Risk ID] - [Category] - [Statement from IAD Risk Inventory]
2. **Control Name** — Format: [Control ID] - [Brief descriptive name]
3. **Control Description** — 1-2 sentences (ITDM exception: 3 sentences)
4. **Test Steps** — Standard structure with attribute labels

---

## Reference Documents

Consult these for detailed patterns, templates, and examples:

**[Control_Development_Guide.md](references/Control_Development_Guide.md)**
- Control type classifications with templates
- Error handling patterns
- Common pitfalls and solutions

**[Test_Step_Guide.md](references/Test_Step_Guide.md)**
- Attribute definitions and examples
- Control-type-specific test patterns
- Technical testing integration

**[Risk_Design_Guide.md](references/Risk_Design_Guide.md)**
- IAD Risk Inventory categories and mapping
- Business risk formula: [WHAT] + [CAUSE] + [IMPACT]
- Split/combine decision trees with examples
- Key/non-key determination criteria
