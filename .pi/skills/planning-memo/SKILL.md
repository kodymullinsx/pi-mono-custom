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
| "ensure" | validate, verify, assess, confirm | Auditors do not ensure outcomes |
| "the system" | Specific names, such as Calypso or SAP Ariba | Eliminates ambiguity |
| "because" | as, given that, in that, or a restructured sentence | Workpaper and planning memo language should remain formal |
| Em dashes or en dashes | Commas, parentheses, colons, or separate sentences | IAD documentation should avoid informal punctuation |
| Present tense for planned procedures | Future tense, such as "will validate" | Planning describes future activities |

**Tense by Document:**
- RCM Control Descriptions: Present tense, such as "validates" or "enforces"
- Planning Memo: Future tense, such as "will validate" or "will inspect"

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
**Opening paragraph:** Start with the standard IAD application identification and scoping narrative, not a generic summary. The typical pattern is two short paragraphs: "IAD identified [X] applications, including internal applications that are used in [auditable entity / process] and related IT functions. IAD identified these applications through interviews with business management, reconciliation against details in the Application Portfolio Management (APM) database, review of the Risk Assessment in MyGRC, and review of the RCM for the auditable entity." Then state the scope decision: "[X] out of [Y] applications were determined to be in-scope for the audit. This determination was made using a risk-based approach factoring business process criticality, prior IAD coverage, and application risk rating to determine the final scoping for the applications. Refer to [Application Coverage workpaper or Placeholder] for additional details and considerations of all applications assessed for scoping. Below is a summary of the in-scope applications, their risk rating, description, and audit scoping rationale." If the integrated testing scope is narrower than the application population, add one sentence after the scoping paragraph: "As it pertains to the scope of Integrated testing, the integrated team will test key [automated controls / IT controls / interfaces] within [X] application(s): [Application names]." Add a DA note when DA coverage intersects with application data: "Note: Data Analytics will be used to help support analytical activities related to data completeness and accuracy for key data transfers, reports, or processes called out below. Refer to the Data Analytics Approach section below for more details."

**Application block format:** Use the field labels and order commonly seen in IAD planning memos.

```
Application Name: [From APM]
APM ID: AD00XXXXXX
ORR: [X] = [Rating]
SAL: [X] = [Rating]
Information Classification: [Level]
Business Owner: [Name or Placeholder]
Technology Owner: [Name or Placeholder]
Audit Subprocess: [Subprocess name(s)]

Application Description: [3-4 sentences: what the application does, key functionality, relevant integrations, and why it matters to the auditable entity]

Scope Rationale and Audit Scope: [Application] is [plain-language relationship to audit]. IAD will [planned business process or integrated testing coverage]. [If applicable, state tactful IT integrated scope limitation.] [If applicable, the DA team will validate completeness and accuracy of data movement, population development, reconciliation, or downstream reporting. See Section III, Data Analytics Approach for more details.]
```

**Application description rules:**
- Tailor the original APM description to the audit. Do not paste the full inventory description when only part of it matters.
- Use 3-4 sentences when possible. Sentence 1 states what the application is. Sentence 2 connects it to the auditable entity. Sentence 3 describes relevant integrations, reports, workflows, or data movement. Sentence 4 is optional for audit-period context or scope-specific relevance.
- Use application-specific names and vendor-specific terminology, such as ZIP, Ariba, PRCVM SQL, Tableau, or Informatica.

**Scope Rationale and Audit Scope drafting rules:**
- Start with a simple sentence describing what the application is used for in the auditable entity. Example: "Ariba is a key application used to facilitate and manage vendor lifecycle activity."
- Then state what IAD will test in plain audit language. Example: "IAD will use Ariba records and workflow evidence to test planning and risk assessment, contracting, monitoring, reporting, and offboarding activities."
- If an application is not separately tested by the integrated team, avoid blunt or mechanical language. Prefer: "[Application] will not be subject to separate IT integrated testing, as the related audit procedures will be addressed through business process testing and DA procedures." For manually driven processes, use: "Due to the manual nature of this process, [Application] is not subject to separate IT integrated testing."
- If DA coverage is relevant, summarize it at a high level: "The DA team will evaluate the completeness and accuracy of [application]-related data used in population development, data movement, reconciliation, and downstream reporting. See Section III, Data Analytics Approach for more details."
- Do not mention "core" in user-facing planning memo language. Use "business process testing," "audit procedures," or direct IAD phrasing instead.
- Do not add "Fundamental IT procedures" bullets to individual application coverage. Save access and change-management coverage for the Integrated Audit Approach when those procedures are part of the integrated IT scope.
- Use bullets to enumerate distinct testing areas when there are two or more (for example, "Interface Control:", "Application Controls:", "Segregation of Duty:"). This is the standard IAD pattern in Scope Rationale sections. Use a short paragraph instead only when a single testing area is being described.
- Never duplicate application descriptions across sections. Applications Section describes what the application does and why it matters; Integrated Audit Approach and Data Analytics Approach describe how testing will be performed.

### Integrated Audit Approach
**Length:** 5-8 sentences, single paragraph (strict)
**Tone:** Future tense. Preferred opener: "The IT integrated audit team will assess the configuration and effectiveness of key automated controls within [app(s)] that support [business process]." Acceptable alternative: "The integrated team will..."

**Structure:**
1. Opening that names the in-scope applications and connects integrated testing to the business process
2. Application-specific and interface testing (grouped thematically by app or control type, not listed individually)
3. Closing: change management and access controls when those procedures are part of the integrated IT scope
4. Required final line: "Refer to Part II, Application section for detailed scoping rationale and audit scope for each application."

**Essential Elements:**
- Complete RCM coverage: all IT controls thematically represented without repeating detail already in the Application blocks
- Specific application names (never "the system")
- Testing methodology explicitly stated (for example, positive and negative testing, configuration inspection, walkthrough)
- Closing on fundamental IT procedures when in scope

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
| Using "because" | Replace with as, given that, in that, or restructure the sentence |
| Using em dashes or en dashes | Replace with commas, parentheses, colons, or separate sentences |
| "The system enforces..." | Use specific name: "SAP Ariba enforces..." |
| Present tense in planning | Convert to future: "IAD will validate..." |
| Literal scope rationale, such as "not in RCM" | State scope boundaries tactfully and connect to business process, DA, or integrated testing coverage |
| Application coverage written as long bullet lists | Condense to a short paragraph unless distinct testing areas require bullets |
| Multiple paragraphs in Integrated Approach | Combine into single flowing paragraph |
| Missing required access or change-management coverage in Integrated Approach | Add a closing sentence when those procedures are part of integrated IT scope |
| Listing controls individually | Group thematically by application or process |

---

## Worked Example Patterns

> These examples live in this file and are the canonical source. The `references/Planning_Examples.md` file contains earlier examples (IPM, Compensation Program, TPLC) and remains valid. For BSM and MRM, the patterns below take precedence.

### BSM: Balance Sheet Management (3 applications, IT + DA)

**Applications section covers:**
- Bloomberg: BVOL Data Integrity Checks, automated text search validation against prior-day file
- Calypso: Curve Construction Model Data Quality, automated validation of curve input data
- Thunderbird ODS: Hedge Relationship Daily Monitoring, **DA approach** (reperformance of variance analysis)

**Integrated Audit Approach (single paragraph):**
> "The integrated team will test three automated controls supporting the Balance Sheet Management process. For Bloomberg and Calypso controls, IAD will perform positive and negative test procedures in accordance with IAD methodology for automated controls. For the Thunderbird ODS monitoring control, IAD will apply a Data Analytics approach, reperforming the daily hedge relationship variance analysis using IAD-extracted data and applying the same variance thresholds defined in the control. Where applicable, IAD will corroborate control configurations against the approved change management record and will confirm that access to modify control logic is limited to authorized personnel."

### MRM: Model Risk Management (Migraph + MyGRC)

**Applications section covers:**
- Migraph: Model Inventory Workflow Routing and QAQC, automated routing to model validators and QAQC workflow
- MyGRC: Model Issue Interface, automated interface between Migraph (issue creation) and MyGRC (issue tracking)

**Integrated Audit Approach note:** MRM audits require distinct treatment of 2LOD oversight scoping. The Integrated Audit Approach should reference coordination with 1LOD (model risk team) and 2LOD (MRO) separately. MRO provides **effective challenge**. It does not implement or test controls.

**SR 11-7 reference in planning:** Reference as "the Federal Reserve's Supervisory Guidance on Model Risk Management (SR 11-7)" on first use; "SR 11-7" thereafter. Do not use page-level citations in planning memos (save those for issue drafting).

### 5+ Application Audits

For audits with 5 or more in-scope applications, group applications by audit subprocess in the Applications section rather than listing each individually. The Integrated Audit Approach paragraph should reference application groups, not individual system names.

---

## Reference Documents

**[Planning_Examples.md](references/Planning_Examples.md)**: Complete real-world examples for:
- Investment Portfolio Management (full IT scope)
- Compensation Program (limited IT scope)
- Third-Party Management Lifecycle

---

## Related Skills

- **rcm-development**: For control description drafting and test step creation
- **fieldwork-execution**: For testing execution documentation

---

**Version:** 4.3 | **Updated:** April 2026
