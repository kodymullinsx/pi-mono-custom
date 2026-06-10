---
name: fieldwork-execution
description: "IAD audit fieldwork guidance for control testing, walkthroughs, attribute testing, technical validation, population and sampling, supplemental questions, TOE documentation, issue validation workpapers, detailed testing tables, conclusions, and summary memos. Use when executing or documenting fieldwork for manual, automated, ITDM, interface, or monitoring controls; testing code, scripts, databases, interfaces, or Alteryx workflows; drafting TOE answers, issue validation sections, DTTs, or test conclusions; or developing evidence-based fieldwork documentation across fieldwork and reporting."
---

# Fieldwork-Execution

This skill provides comprehensive guidance for executing IAD audit fieldwork, consolidating patterns from control testing, walkthrough documentation, attribute testing, technical validation, supplemental questions, and conclusions development.

## Conciseness Standards

**CRITICAL**: All documentation must be concise and high-level.

| Documentation Type | Maximum Length |
|-------------------|----------------|
| Supplemental Question Answers | 1-2 sentences |
| Control Descriptions | 1-2 sentences (ITDM: 3) |
| Exception Descriptions | 3-5 sentences |
| Walkthrough Openings | 2-3 sentences |
| Attribute Conclusions | 2-3 sentences |

Expand only when essential for clarity. Prioritize precision over verbosity.

## Quick Reference

### Control Description Formula
```
[SYSTEM/WHO] + [ACTION] + [WHAT IS CONTROLLED] + [ERROR HANDLING]
```

**Requirements:** 1-2 sentences (ITDM exception: 3), present tense, active voice, specific system names, error handling always included

### Test Step Structure
```
Perform a walkthrough of [system/process] and inspect [documentation] to [confirm/validate/verify]:
[Configuration/System inspection statement] (Attribute A)
[Positive Testing statement] (Attribute B)
[Negative Testing statement] (Attribute C)
[Error Handling & Monitoring statement] (Attribute D)
[Privileged Access statement] (Attribute E)
[Change Management statement] (Attribute F)
```

**Note:** The test step structure is flexible based on control type. Privileged Access and Change Management attributes typically apply only to configurable controls. Non-configurable automated controls may omit these attributes. Adjust test steps based on the specific control characteristics.

### Control Type Quick Reference

| Type | Action Verb | Example |
|------|------------|---------|
| Configurable Automated | "is configured to" | Calypso is configured to enforce limits |
| Non-configurable Automated | "enforces," "prevents" | Migraph enforces segregation of duties |
| Interface | "transfers," "validates" | The interface transfers data with validation |
| ITDM (Semi-Automated) | Both system + manual | System validates + Manager reviews |
| Manual | "performs," "reviews," "approves" | Manager reviews and approves |
| Monitoring | "monitors," "logs," "tracks" | Control-M monitors job execution |

## Design vs. Operating Effectiveness Testing

**Design Testing:** Validates control *would* work if performed correctly
- Focus: Control mechanism, logic, configuration
- Evidence: Point-in-time acceptable
- Sample: Test of one typically appropriate
- Question: "Is the control adequately designed to address the risk?"

**Operating Effectiveness Testing:** Validates control *actually* worked during audit period
- Focus: Evidence of consistent execution
- Evidence: Period coverage required
- Sample: Based on population frequency
- Question: "Did the control operate as designed throughout the period?"

**Design Conclusions:**
- Adequately Designed: "The control is adequately designed to mitigate the risk(s) associated with [risks]. No exceptions noted."
- Not Adequately Designed: "The control design is not adequate to mitigate [risk], as [deficiency]. Exception noted."

**Operating Effectiveness Conclusions:**
- Effective: "Based on testing performed, IAD determined that the control is operating effectively. No exceptions noted."
- Not Effective: "Based on testing performed, IAD determined that the control is not operating effectively. [X] exceptions were noted. Exception noted."
- Not Tested (Design Deficiency): "Operating Effectiveness Conclusion: Not Tested - Based on the design deficiency identified, IAD did not test the operating effectiveness of this control."

## Core Principles

**Brevity:** 1-2 sentences maximum for control descriptions (ITDM exception: 3)
**Specificity:** Always use actual system names (never "the system")
**Error Handling:** Always include what happens when validation fails
**Avoid "ensure":** Use validate, enforce, confirm, determine instead
**Third-Person:** Always use "IAD" as subject
**Action-Oriented:** Use validated, inspected, confirmed, assessed, reviewed, determined
**Tickmarks:** Format as `(Exhibit X, TM Y)` - for reference only, text should be self-explanatory
**No em dashes or en dashes:** Replace with natural phrasing, parentheses, or restructured sentences in all workpaper documentation
**No "because":** The word "because" is informal and out of place in workpaper writing. Rephrase using "as," "given that," "in that," or restructure the sentence
**Subjunctive mood:** Use "were" (not "was") in hypothetical scenarios, e.g., "If the control were not performed"

## Decision Frameworks

### Split vs Combine Controls
**Split when:** Different frequencies, owners, systems, testing approaches, or failure impacts
**Combine when:** Same risk with sequential steps, integrated workflow, same owner/frequency/system

### Key vs Non-Key Determination
**Key:** Direct financial/compliance impact, no compensating controls, failure → material misstatement
**Non-Key:** Support key controls, compensating controls exist, lower consequence

### Sample Approach Decision
**Full Sample:** Small populations (<20), high-risk items, 100% coverage required
**Sample of One:** Homogeneous populations, automated controls with consistent logic, single annual executions
**Statistical Sample:** Large populations (>100), variable characteristics, statistical confidence required
**Judgmental Sample:** Non-homogeneous populations, risk-based selection, specific scenarios targeted

## Standard Documentation Patterns

### Walkthrough Opening
```
On [date], IAD met with [Name, Title], to understand [process/system]. Through corroborative 
inquiry and inspection, IAD confirmed that [high-level description].
```

### Attribute Testing Format
```
Attribute [Letter]: [Brief description]

To validate that [restatement of attribute], and to confirm our understanding, IAD [testing
procedures performed]. Based on [inspection/observation/testing], IAD noted that [findings].
Therefore, IAD gained comfort that [conclusion]. [No exception noted / Exception noted].
```

Two elements are always required in the opening line: "that" (after "validate") and "and to confirm our understanding," (as the connector before the IAD action). These are not optional — the "to confirm our understanding" clause is the standard IAD framing that distinguishes walkthrough-based testing from independent reperformance.

### Positive vs. Negative Testing

**Positive Testing:** Validates control allows legitimate transactions/data
- Test with valid inputs that should be accepted
- Confirms control does not block appropriate activity
- Example: "Validate that valid trade data is successfully processed"

**Negative Testing:** Validates control prevents invalid transactions/data
- Test with invalid inputs that should be rejected
- Confirms control blocks inappropriate activity
- Example: "Validate that trades exceeding limits are rejected"

### Control Unavailability Exception
When a control cannot be tested due to non-operation:
```
Due to the [control/EUC/workflow] not being in operation, IAD was not able to test the 
effectiveness of the control as a part of the [audit name] audit. Exception noted.
```

### DA Team Cross-Reference Patterns

**For Integrated Testing:**
```
IAD Note: For full coverage over the completeness and accuracy of the [process], refer to 
test procedures performed by the Data Analytics team within [Control Name] in MyGRC.
```

**For Exception Support:**
```
For additional supporting evidence regarding the exception, refer to the data analytics 
testing (Workpaper_XXXXXX).
```

**For Scope Delineation:**
```
Note: Testing by the integrated team will be focused on [IT scope]. The DA team will test 
[DA scope]. Refer to [Control Reference] for details.
```

### Code Documentation
**Tabular Format:** Line #, Code, TM Ref., Description
**Paragraph Format:** Background/context, code architecture, control effectiveness assessment

### Database Connection Validation
Server/Host, Database Name, Authentication, Connection Timeout, Encryption

### Error Handling Testing
Detection, Logging, Notification, Resolution

### Five Supplemental Questions
1. How does control mitigate risk? (Lead with control activities; connect to risk naturally in second sentence; do not cite Risk ID or risk name verbatim) - **1-2 sentences**
2. What is basis for appropriate performer? (Job titles, expertise, authority, SOD) - **1-2 sentences**
3. How does operation timely detect/prevent? (Timing, preventative/detective, frequency) - **1-2 sentences**
4. How would organization be alerted if not performed? (Downstream processes, alerts, escalation; use subjunctive "were not performed") - **1-2 sentences**
5. What evidence supports performance? (Evidence type, retention location, demonstration) - **1-2 sentences**

### Design Sampling Description (Named Section)

The Design Sampling Description is a distinct, named section in the workpaper — not an inline paragraph — appearing after attribute write-ups and before the supplemental questions. It documents why the sample selection was appropriate for the control type.

```
In accordance with IAD methodology for [automated/manual/ITDM] controls, IAD [haphazardly
selected / performed a test of one / selected a judgmental sample of X] [item(s)] to validate
[objective]. This approach is appropriate because [control logic is homogeneous / population
is one / items are processed consistently through the same application logic]. [Add any scope
limitations, e.g., a transaction type not in use during the period, a negative scenario tested
via one representative test transaction.]
```

### Population and Sampling Requirements

**For design testing (standard):**
1. Population Description
2. Information Source
3. Parameters Applied
4. Annualized Population Size
5. Accuracy and Completeness
6. Homogeneous Population
7. Sample Approach
8. Sample Method
9. Sampling Description

**For QA-required TOE documentation (8-question structured format):**

When QA governance or oversight functions require a structured TOE section — including for automated application controls — use the 8-question framework. Most questions will be answered N/A for fully automated controls; the N/A responses must still be substantive and explain the reasoning. See `Population_Sampling_Guide.md` for the full framework, N/A language patterns, and when each question applies.

1. Population Description
2. Information Source and Parameters Applied
3. Annualized Population Size and Evaluation Period
4. Accuracy and Completeness
5. Homogeneous Population
6. Test of Effectiveness Summary
7. Operating Effectiveness Conclusion
8. Test of Effectiveness Sample Approach

### Conclusions
**Design:** Adequately Designed / Not Adequately Designed
**Operating Effectiveness:** Effective / Not Effective / Not Tested (Design Deficiency)
**Test of Effectiveness Summary:** Overall conclusion + attribute-by-attribute summary

## Technical Controls — Code Tab & TOD Integration

Use this section when documenting code inspection and API/endpoint testing across a Code tab and one or more TOD tabs. The goal is a cohesive evidence chain where each tab corroborates the other rather than standing alone.

### Test Step Format for Technical Controls

Test steps for API/code validation controls use a numbered list format with the attribute label at the end in parentheses:

```
Perform a walkthrough of [system/service] to gain an understanding of the [validation/processing] 
logic and perform the following:

1. Inspect the [service] source code to verify that [validation objective]. (Attribute A)
2. Perform a positive test by submitting a valid [request/transaction] to confirm [baseline behavior]. (Attribute B)
3. Perform negative tests by submitting requests with invalid inputs targeting each validation check identified through the code inspection to validate that the service rejects each request and returns appropriate error responses. (Attribute C)
4. Validate that errors are appropriately logged and alerts to the appropriate personnel are generated. (Attribute D)
5. Validate that changes to the [service] code logic followed the required change management process. (Attribute E)
6. Inspect the list of individuals with access to modify the [service] source code to confirm that access is restricted to authorized personnel. (Attribute F)
```

Keep attribute statements generic enough to apply across workpapers testing the same control pattern. Service-specific file names, endpoint names, and version numbers belong in the write-up body, not in the test step attribute statement.

### Code Tab Structure — Attribute A Write-Up

The code tab Attribute A write-up follows a four-part structure:

**1. Opening paragraph** ("To confirm that...") — one sentence stating what IAD set out to confirm, what was inspected, and what high-level conclusion was reached. Include version confirmation with exhibit references.

**2. Bulleted list of validation checks** — introduce with a transition paragraph ("Through corroborative inquiry and inspection, IAD noted that both endpoints invoke... IAD confirmed that the service enforces the following input validation checks:"), then enumerate each check as a bullet with a bold label and TM reference. Use this format when there are multiple distinct validation mechanisms; it is far more readable than separate paragraphs per check.

```
- **Check Name:** Description of what is validated and what happens on failure (TM X)
- **Check Name:** Description of what is validated and what happens on failure (TM Y)
```

**3. Cross-reference paragraph** — one to two sentences describing how the checks relate to each other (which are shared across endpoints vs. endpoint-specific) and directing the reader to the TOD tab for testing: "Refer to Tab 3 (TOD) for the positive and negative testing procedures performed to validate these checks."

**4. Exception handling paragraph** — describe the two (or more) handlers by what they do and which exception types they receive, tied to TMs. Document the actual routing behavior factually, including any cases where exception types route to an unintended handler. Close by confirming that regardless of handler, the request is rejected before any upstream data retrieval is attempted.

### "To Validate That" Framing — Code Tab vs. TOD Tab

The "To validate that [attribute], and to confirm our understanding, IAD..." opener belongs in the TOD tab write-ups, where each figure gets its own framing. In the code tab, use "To confirm that..." once in the attribute opening paragraph, then let the remainder flow directly with "IAD inspected...", "IAD confirmed...", "IAD noted..." — no repeated framing per sub-section. The code tab is a continuous inspection narrative, not a series of mini-attributes.

### Factual Exception Routing — Document It, Don't Editorialize It

When code inspection reveals that a validation check correctly rejects invalid requests but produces a suboptimal HTTP response code (e.g., HTTP 500 instead of HTTP 400) due to exception handler routing, document the routing behavior factually using TMs and confirm that the control objective is met. Do not omit the routing observation — the negative test results will show the HTTP code, and a reviewer needs the code tab to explain why. The distinction is: explain what happens and why, confirm rejection before data retrieval, and do not characterize the routing as a deficiency or note an exception for it.

Pattern for documenting this in the code tab:
> "IAD noted that [exception type] is not included in the explicit HTTP 400 registration list, which means it resolves to the catch-all and returns HTTP 500 rather than HTTP 400. In all cases, regardless of which handler processes the exception, the service rejects the request before any upstream data retrieval is attempted, and both handlers log the exception details prior to constructing the error response."

The same factual explanation then appears in the negative test write-up, tracing the same chain to tie the observed HTTP code to the code inspection.

### Positive Test Write-Up — Required Specificity

The Attribute B write-up must document the actual test parameters and the actual response content — not generic descriptions. Include:

- **Headers:** names and whether they contained valid values
- **Account identifier(s):** the specific value(s) used
- **Date range:** the specific startDate and endDate values
- **Payload structure:** confirmation that it was well-formed

For the response, describe what the service returned — not just "HTTP 200 with a data payload" but the specific fields present (e.g., account identifier, as-of timestamp, institution name, transaction records). This level of specificity lets the reviewer verify the test was performed correctly and that the response corresponded to the parameters submitted.

### Negative Test Write-Up — Required Elements

Each negative test figure write-up must address five things:

1. **Target check** — which validation check from the code inspection is being tested (cite Tab 2 TM)
2. **Construction** — the specific invalid value submitted and what kept all other parameters valid (to isolate this check from others). Use actual values (e.g., "account list set to an empty array", "start date field set to 'not-a-date'", "account list set to the string 'not-an-array'")
3. **Observation** — the HTTP status code returned and whether a data payload was present or absent
4. **Exception chain trace** — trace from the exception thrown by the check (Tab 2 TM) through the exception handler registration list (Tab 2 TM E) to the handler that processed it (Tab 2 TM E or TM F) and the HTTP code it produced. This is what connects the observation to the code logic and resolves any apparent inconsistency for the reviewer.
5. **Conclusion** — confirm that rejection occurred before any upstream data retrieval. End with "No exceptions noted."

Pattern for exception chain trace:
> "Per the source code inspection (Tab 2, TM X), [check] throws a specific exception type when [invalid condition]. IAD traced this exception type to the global exception handler (Tab 2, TM E) and confirmed that it [is / is not] included in the handler's explicit registration list for HTTP 400 responses, [causing it to return HTTP 400 with a descriptive error message / causing it to resolve to the catch-all handler (Tab 2, TM F) which returns HTTP 500]."

### Cross-Tab Integration Pattern

Use bidirectional cross-references to connect the two tabs:

- **Code tab → TOD:** After the code tab write-up, direct the reader to the TOD tab: "Refer to Tab 3 (TOD) for the positive and negative testing procedures performed to validate these checks in the production environment."
- **TOD tab → Code:** Within each negative test write-up, trace the exception chain back to the code inspection TMs (see exception chain trace pattern above). This prevents the reviewer from having to piece together why the observed HTTP code matches or differs from what might be expected.

### Reference Templates — API / Code Validation Controls

Use these as concrete starting points when setting up a new API or code inspection workpaper. They encode the standard IAD patterns and prevent format errors that arise when rebuilding structure from scratch.

#### Standard Attribute Mapping

| Attribute | Purpose |
|-----------|---------|
| A | Source code inspection — verify validation checks are implemented and enforced |
| B | Positive test — confirm valid inputs accepted and data returned |
| C | Negative tests — confirm invalid inputs rejected before data retrieval |
| D | Error logging and alerting |
| E | Change management compliance |
| F | Access controls |

This mapping is the canonical ordering for API/code validation controls. If a particular attribute does not apply (e.g., the service has no configurable change management process), omit it and renumber accordingly. Do not reorder B and C — positive test always precedes negative tests.

#### TOD Tab Opening Paragraph

The TOD section opens with a transition paragraph that (a) states the purpose of the testing, (b) connects back to the code inspection, and (c) confirms production-version alignment with exhibit references:

> "On [date], IAD performed positive and negative testing against the [service name] production environment via the [interface, e.g., Swagger UI interface]. The purpose of this testing was to validate that the input validation logic identified through the source code inspection (Tab [X], Code) operates as designed in the production environment. IAD confirmed through the production API specification and the corresponding source control release tag that the deployed version was consistent with the version inspected during the code review (Tab [X], Code, Exhibit 1, Exhibit 2)."

This paragraph appears once before the Attribute B write-up and is not repeated per figure.

#### Positive Test Parameter Documentation Format

Document the actual test parameters submitted using a bulleted list before describing the response. This lets the reviewer verify the test was well-formed and the parameters satisfied each validation check:

> "For the positive test scenario, IAD submitted a valid API request to both the [endpoint A] and [endpoint B] production endpoints with the following parameters:
> - **Headers:** [header name 1], [header name 2], and [header name 3], all populated with valid values
> - **Account List:** Single valid account identifier ([actual ID]), satisfying both the account presence check (Tab [X], TM C) and the singleton constraint on the transaction endpoint (Tab [X], TM B)
> - **Date Range:** startDate of [YYYY-MM-DD] and endDate of [YYYY-MM-DD], satisfying the date bounds check (Tab [X], TM D)
> - **Payload Structure:** Properly structured JSON request body conforming to the expected schema"

Follow the parameter list immediately with the response observation (HTTP code and actual response fields returned — institution name, account identifier, as-of timestamp, etc.).

#### Interface Navigation Evidence Pattern

When documenting that IAD observed a walkthrough within a UI or API interface, use this structure:

> "IAD observed [Name, Title] log into [system] and navigate to [specific location or interface], noting that [observation with TM reference]. IAD traced [field(s)] between [source] and [target] and confirmed that [accuracy or validation conclusion] (Figure [X], TM [Y])."

For Swagger UI specifically: confirm the connected environment (production vs. test), the endpoint(s) targeted, and that the interface was live against the production service rather than a mock.

#### Error Monitoring Write-Up Structure (Attribute D)

Cover two distinct layers — application-level logging and job-level alerting — in separate paragraphs:

1. **Application-level logging** — cite the code inspection finding that exception handlers log details before constructing the error response. Corroborate with a log entry from the centralized logging system showing the exception type, stack trace, and request context were captured.
2. **Job-level monitoring** — describe the Control-M job configuration: server/application/sub-application path, the "When job ended Not OK" Actions rules (email recipients, stop cyclic run). Reference the STORE ProdOps or equivalent job catalog showing the OLA and escalation point.
3. **Operating effectiveness evidence** — cite a Remedy (or equivalent) incident that was auto-generated by the Control-M notification, routed to the documented escalation point, and resolved.

Conclusion: confirm errors are logged at the application level and job failures generate automated alerts to appropriate personnel.

#### LMD Write-Up Structure (Attribute E)

Follow the approvals/UAT/implementation bullet structure. Open with version confirmation (production version via API spec endpoint + matching source control release tag), then inspect the change ticket:

```
IAD obtained and inspected Remedy change ticket [CRQ#] for the [service] [release] production 
deployment (Figure 1) and noted the following:

- Approvals: [Name, Title] on [date] (Figure 1, TM A); [Name, Title] on [date] (Figure 1, TM B); ...
- UAT: [Artifact reference(s)] attached on [date] (Figure 1, TM E).
- Implementation: Implementation was initiated by [Name, Title] on [date] (Figure 1, TM F). 
  [Name, Title] completed the final review on [date] (Figure 1, TM G).
```

Then document GitHub branch protection rules (if applicable) as a systematic gate consistent with the change management process — note the Active ruleset name, PR requirement, required approvals, Code Owner review, and stale review dismissal.

Conclude: production version is consistent with the version-controlled release tag and the deployment followed the required change management process.

#### Access Controls Write-Up Structure (Attribute F)

1. Identify the code owner group via the CODEOWNERS file — note the wildcard entry pattern (`* @org/team-name`) and cross-reference the branch protection Code Owner requirement established in Attribute E.
2. Obtain the team membership listing. Document member count, confirm all are active employees.
3. Reference the supplementary analysis table (Exhibit) documenting each member's role, department, and access appropriateness rationale.
4. Conclude: access is restricted to the named team, all members are active and appropriately authorized, and the branch protection requirement provides a systematic gate.

Note: the Attribute F test step uses "Inspect the list of individuals with access to modify the [service] source code to confirm that access is restricted to authorized personnel" — not "Validate that access is restricted." The inspect framing reflects that the procedure is an evidence review, not a functional test.

---

## Issue Validation Workpapers

Issue validation workpapers follow the same walkthrough format as standard control testing but require adaptation for the issue/action plan context. Issue validations assess whether a single, non-recurring remediation effort was adequately designed and effectively implemented, producing a discrete set of evidence artifacts rather than a recurring control execution population. This distinction drives differences in structure, sampling language, and population documentation throughout the workpaper.

### Workpaper Structure

Issue validation workpapers use the following section ordering. When populating a TOC template (xlsx), each section maps to a specific tab or cell range.

```
1. Issue and Action Plan Information (header fields)
2. Background (context for the issue and remediation)
3. Validation Objectives & Procedures (test steps, split into TOD and TOE)
4. Validation Testing
   a. Walkthrough opening paragraph
   b. Test of Design
      - Section intro paragraph
      - Attribute A narrative
      - Attribute B narrative
   c. Test of Operating Effectiveness
      - Section intro paragraph
      - Operating Effectiveness Population and Sampling
      - Attribute C narrative
      - Attribute D narrative
5. Design Evaluation (sample method, sampling description, assessment conclusion, 5 CDA questions)
6. Operating Effectiveness Evaluation (OE sample approach/method/description, effectiveness summary, OE conclusion)
7. Evidence Index
```

### TOD / TOE Attribute Split

Do not embed TOD and TOE sub-sections within each attribute. Instead, organize the workpaper into two clearly labeled blocks:

```
Test of Design
  Attribute A: [TOD-focused test step]
  Attribute B: [TOD-focused test step]

Test of Operating Effectiveness
  Attribute C: [TOE-focused test step]
  Attribute D: [TOE-focused test step]
```

TOD attributes validate whether the remediation is adequately designed to address the root cause. TOE attributes validate whether the remediation was actually implemented. This separation produces a cleaner workpaper and avoids redundant sub-section labels inside each attribute.

Each section should open with an intro paragraph stating the purpose of that testing block:

**TOD intro:**
> Test of Design validates that the governing standards, contractual provisions, and [remediation mechanism] establish an adequate framework for [risk mitigation objective].

**TOE intro:**
> Test of Operating Effectiveness validates that the remediation was executed within the action plan timeline and that the recurring mechanisms required to sustain compliance over time are in place and operating.

### Synthesize, Don't Enumerate

Issue validation attributes often draw on documentary evidence (standards, contracts, emails, platform records). The attribute narrative should synthesize what was confirmed, not enumerate every field, question number, or data point inline. Let tickmarks carry the exact details.

**Over-enumerated (avoid):**
> The IRSQ confirms that ADP generates records with regulatory and business archival requirements (Question 1.6: Yes) and is required to maintain such records (Question 1.7: Yes). The vendor is classified as critical given that ADP produces annual W2 forms for approximately 32,000 employees (Question 2.14: Yes). All five risk control assessments were completed with an Effective review decision.

**Synthesized (preferred):**
> The IRSQ confirms that ADP generates and maintains records subject to regulatory and business archival requirements, and the vendor is classified as critical (Evidence 2, TM B, TM C). All risk control assessments were completed with an Effective review decision (Evidence 2, TM D).

The tickmarks (TM B, TM C, TM D) carry the exact question numbers and answers. The prose carries the conclusion.

### Attribute Header Format

Issue validation attributes use the same header format as control test attributes: the full test step text appears as the attribute header, not a short label.

```
### Attribute A: [Full test step text from the test steps section]
```

### Issue Validation Population and Sampling

Issue validations produce a bounded evidence set rather than a recurring control execution population. The population/sampling documentation must be grounded with named sources, inquiry references, and evidence cross-referencing rather than abstract descriptions.

**Grounding pattern:** Always open population descriptions with "Per discussion with [Name, Title]" or "Per inspection of [specific document]" to establish the source. Cross-reference each evidence artifact against the action plan requirements to demonstrate coverage.

**Population Description:**
```
Per discussion with [Name, Title] and [Name, Title], IAD was informed that [ActionPlan_ID]
required [team] to [action plan description]. The population consists of the complete set
of remediation deliverables produced under [ActionPlan_ID], including: (1) [evidence
description] (Evidence 1), (2) [evidence description] (Evidence 2), ... (N) [evidence
description] (Evidence N).
```

**Information Source and Parameters Applied:**
```
The information source used to obtain the evidence population was direct transfer from
[Name, Title] and [Name, Title]. [Name] provided Evidences [X through Y] on [date],
consisting of [list specific items]. [Name] provided Evidence [Z] on [date], consisting
of [specific item]. The parameters applied were all evidence artifacts associated with
[ActionPlan_ID] (due date [date]). [If the evaluation window extends beyond the due date,
explain why.] No exclusionary filters were applied.
```

**Annualized Population and Evaluation Period:**
```
N/A. [ActionPlan_ID] is a single, non-recurring remediation event rather than a recurring
control execution. The population is not annualized; it consists of one action plan with
[N] discrete evidence artifacts produced during the remediation activity window. The
evaluation period spans the remediation activity window through [end date].
```

**Accuracy and Completeness:**
```
Through corroborative inquiry with [Name, Title], [Name, Title], and [Name, Title] on
[dates], IAD validated that the evidence population was complete and accurate. Management
confirmed that all artifacts produced in connection with the remediation were provided to
IAD and that no additional deliverables or correspondence existed beyond the [N] evidence
artifacts received. IAD cross-referenced the evidence set against the action plan
requirements and the [governing standard's] obligations, confirming coverage of [list
coverage areas]. No items were excluded from the population.
```

**Homogeneous Population:**
```
The population is one. [ActionPlan_ID] represents a single, non-recurring remediation
event producing one set of deliverables. As such, the population is homogeneous.
```

**Sample Method / Approach / Description:**
```
Sample Approach: Sample of One
Sample Method: Non-statistical
Sample Description: Based on a population of one action plan ([ActionPlan_ID]) mitigating
a [risk level] level of inherent risk, the single occurrence of the remediation was
selected for effectiveness testing. The remediation produces a discrete, fixed set of [N]
evidence artifacts rather than a recurring population of control executions. [Enumerate
what the evidence set contains.] This bounded population does not permit or require
sampling reduction. IAD validated the completeness of the remediation through full
inspection of all [N] evidence artifacts.
```

### Detailed Testing Table for Issue Validations

Use one row per evidence artifact rather than a single row for the entire action plan. Each sample item gets its own row with identifying details and attribute result tickmarks. Refer to the **Detailed Testing Table Guide** section for the full DTT structure, conciseness rules, tickmark conventions, and issue validation examples.

### Design Evaluation for Issue Validation

- **Design Sample Method:** Test of One (Issue Validation)
- **Design Sampling Description:** Describe the single, non-recurring remediation effort, the cross-functional coordination required, the discrete evidence artifact categories inspected, and why a test-of-one approach is appropriate (bounded population that does not permit or require sampling reduction).
- **Design Assessment Conclusion:** State whether the remediation is adequately designed to address the root cause. Enumerate the specific remediation actions completed.
- The five CDA questions apply; adapt the framing from "control" to "remediation" as needed.

### Operating Effectiveness Evaluation for Issue Validation

This is a separate section from the Design Evaluation. It documents the OE sampling rationale and the effectiveness conclusion. For issue validations, this section contains:

- **OE Sample Approach:** Test of One (Issue Validation)
- **OE Sample Method:** Non-statistical
- **OE Sampling Description:** Brief statement that the remediation is non-recurring, the evidence set is bounded, and IAD inspected all artifacts without sampling reduction.
- **Test of Effectiveness Summary:** Summarize what was validated in each TOE attribute (with attribute references), the key alignment points confirmed, and the recurring mechanisms established.
- **Operating Effectiveness Assessment Conclusion:** State whether the remediation is operating effectively. Enumerate the key findings that support the conclusion. Close with "No exceptions noted" or describe exceptions.

---

## Detailed Testing Table Guide

The Detailed Testing Table (DTT) is a concise, scannable summary of all testing performed for a control or issue validation. It appears in the workpaper leadsheet or a dedicated tab and is the primary artifact a reviewer uses to verify scope, coverage, and results at a glance. The DTT must never contain paragraph-length text in any cell.

### Structure

Every DTT has four blocks:

1. **Header block** — control/action plan metadata (ID, description, risk, population source, population size, sample size, sample selection method)
2. **Attribute key** — one row per attribute with a short description (1 sentence max)
3. **Sample table** — one row per sample item (or evidence artifact for issue validations), with attribute result columns containing only tickmark symbols
4. **Legend** — defines each tickmark symbol used

### Header Block

| Field | Content |
|---|---|
| Control ID / Action Plan | ID and short name |
| Control / AP Description | 1-2 sentences max |
| Risk | Risk statement from RCM |
| Population Source | System, report, or person who provided the population |
| Population Size | Count and unit (e.g., "923 unique new/modified access", "6 evidence artifacts") |
| Sample Size | Count selected for testing |
| Sample Selection Method | Random, haphazard, judgmental, non-statistical, or full inspection |

### Attribute Key

List each attribute letter with a one-sentence description. Do not reproduce the full test step text here.

| Attribute | Description |
|---|---|
| A | [One-sentence summary of what is tested] |
| B | [One-sentence summary of what is tested] |

### Sample Table

Each row represents one discrete sample item. Columns are:

| Column | Content |
|---|---|
| Sample # | Sequential number |
| Identifier | Ticket number, evidence name, request ID, or other unique reference |
| Description | Short label (not a paragraph) |
| Date | Date of the item or event tested |
| Attribute columns (A, B, C...) | Tickmark symbol only (e.g., `p`, `X1`, `a`) or blank if not applicable |
| Reference | Tab name, evidence filename, or "Evidence Tab" |

After the last sample row, add summary rows:

| | | | | **0** | **0** | ... | **Exceptions** |
| | | | | **N** | **N** | ... | **Total Tested** |

### Tickmark Symbols

Use a consistent legend. Common patterns:

| Symbol | Meaning |
|---|---|
| p | No exception noted |
| EX | Exception noted |
| X1 | No exception noted (alternate notation) |
| a | No exception noted (alternate notation) |
| N/A | Attribute not applicable to this sample |

Pick one notation and use it consistently within a workpaper. Define it in the legend block at the bottom of the DTT.

### Legend Block

```
| Symbol | Description |
|---|---|
| p | No exception noted. |
| EX | Exception noted. |

**Test Result:** [No Exception / Exception Noted]

| | Name | Date |
|---|---|---|
| Preparer | | |
| Reviewer | | |
```

### Conciseness Rules

- No cell in the sample table should contain more than one short phrase
- Attribute descriptions in the key are one sentence max
- If a finding requires explanation, put it in the attribute narrative write-up, not in the DTT
- The DTT is a summary artifact; the attribute write-ups carry the detail
- When in doubt, shorter is better

### Adapting by Control Type

**Recurring controls (ITGC, application, manual):** Each sample row is one instance from the population (one access request, one change ticket, one firecall, one reconciliation). Attribute columns reflect each test step applied to that instance.

**Automated/configurable controls:** Sample rows may represent walkthrough observations, configuration screenshots, or test transactions. Fewer rows, but each row should correspond to a distinct piece of evidence.

**Issue validations:** Each sample row is one evidence artifact. Attribute columns reflect which TOD/TOE attributes that evidence supports. A single evidence item may support multiple attributes.

### Example: Issue Validation DTT

| Sample # | Evidence | Description | Date | A | B | C | D | Reference |
|---|---|---|---|---|---|---|---|---|
| 1 | Evidence 1 | Record Retention Standards | 6/1/2024 | p | | | | Evidence Tab |
| 2 | Evidence 2 | Vendor Engagement Record and IRSQ | 2/2/2026 | p | | | | Evidence Tab |
| 3 | Evidence 3 | Master Services Agreement | 11/1/2003 | p | | | | Evidence Tab |
| 4 | Evidence 4 | Vendor Record Retention Periods Summary | 3/21/2025 | | p | | | Evidence Tab |
| 5 | Evidence 5 | Email: RRS Schedule Update Request | 3/12/2026 | | p | p | | Evidence Tab |
| 6 | Evidence 6 | Email: Annual Purge Confirmation Language | 3/19/2026 | | | | p | Evidence Tab |
| | | | | **0** | **0** | **0** | **0** | **Exceptions** |
| | | | | **3** | **2** | **1** | **1** | **Total Tested** |

### Example: Recurring Control DTT (Access Provisioning)

| Sample # | Name | Request # | Approver | Approval Date | Create Date | A | B | Reference |
|---|---|---|---|---|---|---|---|---|
| 1 | J. Finamore | 48022 | S. Klingensmith, Mgr III | 7/16/2019 | 7/18/2019 | X | X | Evidence Tab |
| 2 | A. Vath | 48105 | T. Reynolds, Dir II | 7/30/2019 | 8/1/2019 | X | X | Evidence Tab |
| ... | | | | | | | | |
| | | | | | | **0** | **0** | **Exceptions** |
| | | | | | | **25** | **25** | **Total Tested** |

### Example: Emergency Change DTT (Firecall Execution)

| Sample # | Request | Ticket # | System | Requester | Request Date | Approver | Approval Date | A | Reference |
|---|---|---|---|---|---|---|---|---|---|
| 1 | EAM002474 | CAR202027782 | PRDCLNT100 | E. Thomson | 7/1/2020 | R. Lewis, IT Analyst IV | 7/14/2020 | a | Evidence Tab |
| 2 | EAM002481 | FY21 WIP reval | PRDCLNT100 | J. Kott | 7/11/2020 | T. Metinko, Controller I | 7/12/2020 | a | Evidence Tab |
| ... | | | | | | | | | |
| | | | | | | | | **0** | **Exceptions** |
| | | | | | | | | **20** | **Total Tested** |

---

## Reference Documents

For comprehensive examples and detailed guidance, see the following reference files:

| Reference | Purpose |
|-----------|---------|
| [Control_Development_Standards.md](references/Control_Development_Standards.md) | Control descriptions by type, test steps, DA cross-references |
| [Exception_Standards.md](references/Exception_Standards.md) | Exceptions, compensating controls, point-in-time evidence, vendor limitations |
| [Population_Sampling_Guide.md](references/Population_Sampling_Guide.md) | Population documentation, sampling approaches, test of one, homogeneous grouping |
| [Supplemental_Documentation.md](references/Supplemental_Documentation.md) | Five RCM questions, conclusions, summary memo components |
| [Technical_Testing_Guide.md](references/Technical_Testing_Guide.md) | Code inspection, database validation, API testing, test environments |

---
