---
name: planning-memo
description: "Streamlined guidance for IAD audit planning memo development. Use when developing Planning Memo sections (Applications, Integrated Audit Approach, Data Analytics Approach), extracting planning content from RCM, evaluating application scope, fact-checking planning documentation against RCM, or determining which systems are in scope for integrated testing based on RCM System Associations. Also trigger when the user asks about worked examples for specific audit types (BSM Balance Sheet Management, MRM Model Risk Management), how to handle 5+ application audits, 2LOD framing in planning (MRO effective challenge vs testing controls), SR 11-7 citation format in planning memos, decommissioned or retired systems that should be excluded from scope, distinguishing systems tested for IT controls vs systems that are data sources only, upstream versus downstream data-flow direction, or the single-paragraph rule for the Integrated Audit Approach section."
---

# IAD Planning Memo Development

## Core Principle

**RCM is the single source of truth:**
- **Applications Section** ← RCM "System Associations" column
- **Integrated Audit Approach** ← IT controls in RCM (test steps inform testing approach)
- **Data Analytics Approach** ← DA controls in RCM
- **Scope Decisions** ← Controls assigned to integrated team vs. core team

---

## Critical Language Rules

| Never Use | Always Use | Reason |
|-----------|------------|--------|
| "ensure" | validate, verify, assess, confirm | Auditors don't ensure outcomes |
| "the system" | Specific names (Calypso, SAP Ariba) | Eliminates ambiguity |
| Present tense | Future tense ("will validate") | Planning describes future activities |

**Tense by Document:**
- RCM Control Descriptions → Present tense ("validates," "enforces")
- Planning Memo → Future tense ("will validate," "will inspect")

---

## Reading RCM to Inform Planning

### Extract Applications
**Look at:** System Associations column
**Distinguish:** Systems where controls are TESTED vs. systems that provide DATA

```
Control: System Associations = "Alteryx, Calypso, BNY Mellon NEXEN"

✓ IT Testing: Alteryx (workflow), Calypso (configuration)
✗ Not IT Testing: BNY Mellon NEXEN (external custodian - data source only)
```

### Validate Lifecycle and Data-Flow Direction
Before locking scope, confirm each referenced system was active during the audit period and map where audit scope begins.

- Explicitly exclude decommissioned, retired, or completed systems unless a specific residual-risk rationale is documented.
- Use directional language to separate upstream source systems from the in-scope control point.
- A good shorthand is: `Source System (Out of Scope) -> In-Scope Control Boundary -> Downstream Recipient (Out of Scope)`.
- If a system is only a data origin or recipient, say so directly rather than implying IAD will test that system's controls.

### Extract Testing Approach
**Look at:** IT/DA Test Steps column
**Transform:** RCM test step language → Planning memo future tense

### Group Controls Thematically
Don't list controls individually. Group by application, control type, or process area.

---

## Section Patterns

### Applications Section
**Length:** 3-4 sentences per application (paragraph format)

```
Application Name: [From APM]
APM ID: AD00XXXXXX
ORR: [X] = [Rating]
SAL: [X] = [Rating]
Information Classification: [Level]
Application Owner: [Business Owner; Technology Owner]

Description: [2-3 sentences: purpose, key functionality, integration points]

Scope Rationale and Audit Scope: [Application] is [relationship to audit].
IAD's approach includes:
• [Testing Area 1]: IAD will [specific approach]
• [Testing Area 2]: IAD will [specific approach]

Audit subprocess: • [Subprocess name(s)]
```

**Rule:** Never duplicate application descriptions across sections. Applications section describes WHAT; other sections describe HOW tested.

### Integrated Audit Approach
**Length:** 5-7 sentences, single paragraph (strict)
**Tone:** Future tense, "the integrated team will..."

**Structure:**
1. Opening risk-focused statement connecting technology to business objectives
2. Application-specific testing (grouped thematically)
3. Interface testing (if applicable)
4. Closing: change management and access controls

**Essential Elements:**
- Complete RCM coverage (all IT controls thematically represented)
- Specific application names (never "the system")
- Risk linkage to business objectives
- Closing on fundamental IT procedures

### Data Analytics Approach
**Length:** 3-5 sentences
**Structure:** Procedures → Reperformance → Reconciliation

```
The Data Analytics (DA) team will validate the completeness and accuracy
of data transferred from [Source] to [Target], including confirmation that
source connections reference production environments. DA will independently
reperform [calculation/transformation logic] to validate [expected outcomes].
Additionally, DA will reconcile outputs against source systems.
```

---

## Fact-Check Before Finalizing

1. **Control Coverage:** All IT controls from RCM appear thematically in Integrated Audit Approach
2. **Application Alignment:** Applications match RCM System Associations
3. **No Orphaned Content:** Nothing in planning memo that isn't in RCM
4. **Interface Testing:** All interfaces between in-scope systems addressed
5. **Data Sources Excluded:** External custodian systems not listed for IT testing
6. **Lifecycle Status Confirmed:** Decommissioned, retired, or completed systems explicitly excluded unless residual risk justifies inclusion
7. **Data-Flow Direction Clear:** Upstream sources, in-scope control point, and downstream recipients are labeled with clear scope boundaries

---

## Common Mistakes Quick-Fix

| Mistake | Fix |
|---------|-----|
| Using "ensure" | Replace with validate, verify, assess, confirm |
| "The system enforces..." | Use specific name: "SAP Ariba enforces..." |
| Present tense in planning | Convert to future: "IAD will validate..." |
| Multiple paragraphs in Integrated Approach | Combine into single flowing paragraph |
| Missing fundamental IT procedures | Add closing on change management/access controls |
| Listing controls individually | Group thematically by application or process |

---

## Worked Example Patterns

> These examples live in this file and are the canonical source. The `references/Planning_Examples.md` file contains earlier examples (IPM, Compensation Program, TPLC) and remains valid — but BSM and MRM patterns below take precedence for those workstreams.

### BSM — Balance Sheet Management (3 applications, IT + DA)

**Applications section covers:**
- Bloomberg: BVOL Data Integrity Checks — automated text search validation against prior-day file
- Calypso: Curve Construction Model Data Quality — automated validation of curve input data
- Thunderbird ODS: Hedge Relationship Daily Monitoring — **DA approach** (reperformance of variance analysis)

**Integrated Audit Approach (single paragraph):**
> "The integrated team will test three automated controls supporting the Balance Sheet Management process. For Bloomberg and Calypso controls, IAD will perform positive and negative test procedures in accordance with IAD methodology for automated controls. For the Thunderbird ODS monitoring control, IAD will apply a Data Analytics approach, reperforming the daily hedge relationship variance analysis using IAD-extracted data and applying the same variance thresholds defined in the control. Where applicable, IAD will corroborate control configurations against the approved change management record and will confirm that access to modify control logic is limited to authorized personnel."

### MRM — Model Risk Management (Migraph + MyGRC)

**Applications section covers:**
- Migraph: Model Inventory Workflow Routing and QAQC — automated routing to model validators, QAQC workflow
- MyGRC: Model Issue Interface — automated interface between Migraph (issue creation) and MyGRC (issue tracking)

**Integrated Audit Approach note:** MRM audits require distinct treatment of 2LOD oversight scoping. The Integrated Audit Approach should reference coordination with 1LOD (model risk team) and 2LOD (MRO) separately. MRO provides **effective challenge** — it does not implement or test controls.

**SR 11-7 reference in planning:** Reference as "the Federal Reserve's Supervisory Guidance on Model Risk Management (SR 11-7)" on first use; "SR 11-7" thereafter. Do not use page-level citations in planning memos (save those for issue drafting).

### 5+ Application Audits

For audits with 5 or more in-scope applications, group applications by audit subprocess in the Applications section rather than listing each individually. The Integrated Audit Approach paragraph should reference application groups, not individual system names.

---

## Reference Documents

**[Planning_Examples.md](references/Planning_Examples.md)** — Complete real-world examples for:
- Investment Portfolio Management (full IT scope)
- Compensation Program (limited IT scope)
- Third-Party Management Lifecycle

---

## Related Skills

- **rcm-development** — For control description drafting and test step creation
- **fieldwork-execution** — For testing execution documentation

---

**Version:** 4.2 | **Updated:** March 2026
