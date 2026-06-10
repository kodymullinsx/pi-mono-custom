# Supplemental Documentation Guide

## Conciseness Requirement

**CRITICAL**: All supplemental question answers must be **1-2 sentences maximum per answer**. Expand only when essential for clarity.

**Example - Verbose (Avoid):**
"The control mitigates the risk of inaccurate or incomplete data impacting management's reconciliation of forecast data between the MIRA and PlanIT databases by ensuring that the data connections with the Excel workbooks configured within Microsoft Excel for MIRA and the IBM Planning Analytics Add-in for PlanIT are appropriately configured to connect to the correct IT production environments for each application, thereby preventing the retrieval of data from non-production sources that could compromise data integrity."

**Example - Concise (Preferred):**
"The validation script confirms database connections are configured to production environments, preventing retrieval of non-production data that could compromise data integrity. Connection validation occurs prior to reconciliation execution."

## Writing Standards

All supplemental question answers must adhere to the following rules:

- **No em dashes or en dashes.** Replace with natural phrasing, parentheses, or restructured sentences.
- **No "because."** The word "because" is informal in workpaper context. Use "as," "given that," "in that," or restructure.
- **Subjunctive mood in hypotheticals.** Use "If the control were not performed" (not "was not performed").
- **No Risk ID citations in Q1.** Describe the risk in plain, natural language rather than citing the Risk ID or formal risk name verbatim.

---

## Five Standard RCM Questions

### Question 1: How does the control mitigate the risk identified?

**Pattern:** Lead with what the control does (first sentence), then connect to the risk naturally in the second sentence. Do not cite the Risk ID or formal risk name verbatim — describe the risk in plain terms.

**Required Elements:**
- Control activities (what the system or performer does)
- Natural risk connection (what type of risk is addressed, in plain language)
- Preventative or detective nature

**Template (1-2 sentences):**
```
[System/control] [does X, Y, and Z], [resulting in / requiring / preventing] [key outcome].
These [automated/manual] control activities mitigate the risk of [natural risk description]
by ensuring that [specific protection mechanism].
```

**Example - Automated Application Control:**
```
EPP enforces segregation of duties between wire initiators and approvers, applies dollar-based
authorization limits based on user role assignments, and prevents self-approval through
application logic, requiring that all wire disbursements receive independent authorization
before funds are released. These automated control activities mitigate the risk of unauthorized
or erroneous wire transfer activity resulting from internal processing errors by ensuring that
no single user can both initiate and approve the same transaction and that approval authority
is restricted to users whose configured limits cover the transaction amount.
```

**Example - Interface/Data Validation Control:**
```
The Bloomberg to Calypso interface validates the completeness and accuracy of all transferred
pricing fields before ingestion, rejecting incomplete data with automated error alerts to the
Trading Operations team. These automated control activities mitigate the risk of data loss or
degradation during transfer by ensuring that only complete, validated pricing data enters
downstream trading and valuation processes.
```

**Example - Manual Review Control:**
```
The Finance Manager reviews reconciliation exception reports and documents investigation results
for all variances exceeding the defined materiality threshold, requiring resolution prior to
financial close. These detective control activities mitigate the risk of undetected financial
misstatement by ensuring variances are identified, investigated, and resolved before period-end
reporting.
```

---

### Question 2: What is the basis for determining the person(s)/team performing the control are appropriate?

**Required Elements:**
- Job titles (NOT individual names)
- Relevant expertise for the control
- Authority level appropriate for the decision
- Segregation of duties considerations (if applicable)

**Template (1-2 sentences):**
```
The [Job Title] possesses the requisite [expertise type] and has appropriate [authority/skills] 
to [perform control action]. [SOD consideration if applicable].
```

**Example - Technical Control:**
```
The Software Development & Engineering team possesses requisite technical expertise in database 
architecture and has appropriate skills to configure and validate database connection parameters.
```

**Example - Manual Review Control:**
```
The Finance Manager possesses requisite financial reporting expertise and has appropriate 
authority to review and investigate reconciliation exceptions exceeding materiality thresholds.
```

---

### Question 3: How does the operation of the control timely detect/prevent the risk described?

**Required Elements:**
- When the control operates (timing)
- Preventative or detective
- Timing appropriateness for the risk
- Frequency alignment with risk

**Template (1-2 sentences):**
```
The control operates [frequency/timing] [before/after] [process step], enabling [timely 
detection/prevention]. This [preventative/detective] control [timing justification].
```

**Example - Real-Time Preventative:**
```
The control operates in real-time during trade execution, preventing unauthorized trades from 
processing. This preventative control validates authorization limits before execution, 
rejecting unauthorized trades immediately.
```

**Example - Detective Control:**
```
The control operates monthly after reconciliation completion but before financial close. This 
detective control identifies variances timely, allowing investigation before month-end reporting.
```

---

### Question 4: How would the organization be alerted if the control is not performed?

**Required Elements:**
- Downstream RCSA processes that would detect non-performance (cite underlying RCSA control IDs)
- The IAD control covering those RCSA controls (cited separately as the testing vehicle)
- Additional mitigating factors (reconciliations, escalation paths, compensating layers)

**Important distinction — RCSA controls vs. IAD controls:**
RCSA controls represent actual business processes. IAD controls are created for testing purposes and are not standalone RCSA controls. In Q4, always cite the underlying RCSA process controls first, then reference the IAD control as the coverage vehicle for those controls.

**Template:**
```
If this control were not performed, [risk outcome] would be subject to detection through
[process description] (Cntl_XXXXX, Cntl_XXXXX, Cntl_XXXXX), which is covered within the
IAD control Cntl_XXXXX ([IAD Control Name]). Further, [additional detection mechanism]
(Cntl_XXXXX). [Compensating layer if applicable.]
```

**Example - Automated Application Control:**
```
If this control were not performed, unauthorized or over-limit wire disbursements would be
subject to detection through Cash Management's review of wire transfer request signatures
and authorization authority against the Corporate Disbursement Policy (Cntl_016535,
Cntl_016539, Cntl_016561, Cntl_016765, Cntl_016767), which is covered within the IAD
control Cntl_068793 (Template/Freeform Wire Transaction Requests and Approval). Further,
discrepancies resulting from unauthorized or erroneous fund movements would be detected
through the daily review and reconciliation of cash accounts (Cntl_016823).
```

**Example - Manual Control:**
```
If this control were not performed, the absence of documented review evidence would be
detected during quarterly management oversight (Cntl_XXXXXX), which is covered within the
IAD control Cntl_XXXXXX ([IAD Control Name]). Unresolved exceptions would also be flagged
during financial close.
```

---

### Question 5: What evidence supports the control is being performed?

**Required Elements:**
- Specific evidence type
- Retention location
- How evidence demonstrates control operation

**Template (1-2 sentences):**
```
Control performance is evidenced by [specific evidence type] maintained in [location], 
demonstrating [what evidence shows].
```

**Example - Automated Control:**
```
Control performance is evidenced by system execution logs in the production database, capturing 
timestamps, validation results, and error details. Logs demonstrate continuous operation with 
appropriate validation throughout the audit period.
```

**Example - Manual Control:**
```
Control performance is evidenced by signed reconciliation approval forms in SharePoint, 
including reviewer signature, review date, and documented exception investigation. Forms 
demonstrate timely review and documented resolution.
```

---

## Control Unavailability in Supplemental Questions

When a control is not in operation, append the standard unavailability language to each answer:

**Pattern:**
```
[Standard answer about control design]. Due to the [control/EUC/workflow] not being in 
operation, IAD was not able to test the effectiveness of the control as a part of the 
[audit name] audit. Exception noted.
```

**Example - Question 1 with Unavailability:**
```
The control mitigates Risk_007589 - Data Risk by validating data transferred between systems. 
This preventative control rejects incomplete data before ingestion. Due to the Alteryx workflow 
not being in operation, IAD was not able to test the effectiveness of the control as a part 
of the Treasury Settlement Services audit. Exception noted.
```

---

## Conclusion Statements

### Design Assessment Conclusions

**Adequately Designed - Standard Language:**
```
The control is adequately designed to mitigate the risk(s) associated with [specific risk(s)]. 
No exceptions noted.
```

**Not Adequately Designed - Standard Language:**
```
The control design is not adequate to mitigate [risk], as [specific deficiency]. Exception noted.
```

**Examples:**
```
Not Adequately Designed: The control design is not adequate to mitigate data integrity risk,
as the validation logic does not include completeness checks for all required pricing fields.
Exception noted.
```

---

### Operating Effectiveness Conclusions

**Effective - Standard Language:**
```
Based on testing performed, IAD determined that the control is operating effectively. 
No exceptions noted.
```

**Not Effective - Standard Language:**
```
Based on testing performed, IAD identified exceptions in the operation of the control. 
[Describe exceptions]. Exception noted.
```

**Not Tested (Design Deficiency):**
```
Operating Effectiveness Conclusion: Not Tested - Based on the design deficiency identified, 
IAD did not test the operating effectiveness of this control.
```

**Not Tested (Control Unavailable):**
```
Operating Effectiveness Conclusion: Not Tested - Due to the [control/EUC/workflow] not being 
in operation, IAD was not able to test the effectiveness of the control.
```

**Examples:**
```
Not Effective: Based on testing performed, IAD identified exceptions in the operation of the 
control. Of 25 samples tested, 3 (12%) showed inadequate documentation of variance 
investigation. Exception noted.
```

---

## Test of Effectiveness Summary

### Format Options

Two formats exist depending on what the workpaper requires:

**Option A — Narrative format** (default for manual and ITDM controls): An overall OE conclusion followed by attribute-by-attribute results in prose.

**Option B — 8-question structured format** (required when QA governance mandates structured TOE documentation, including for automated application controls): See `Population_Sampling_Guide.md → TOE 8-Question Framework for Automated Application Controls` for the full question set, N/A language templates, and field-by-field guidance. When this format applies, the 8-question section replaces the narrative TOE summary.

---

### Option A: Narrative Format

**1. Overall Conclusion Statement**
```
Based on testing performed, IAD determined that the control is operating effectively.
Refer to attachment [Workpaper Reference] for testing details.
```

**2. Attribute-by-Attribute Results**

For each attribute tested, document:
- Attribute letter and description
- Testing procedures performed
- Observations and findings
- Conclusion with exception status

**Standard Format:**
```
Attribute [Letter] - [Attribute Description]:
To validate that [attribute objective], and to confirm our understanding, IAD [specific
testing procedures]. Based on [inspection/testing/observation], IAD noted that [specific
findings]. Therefore, IAD gained comfort that [conclusion statement]. No exception noted.
```

**Example:**
```
Attribute A - Configuration Inspection:
To validate that Calypso authorization limits are configured by trader job class, and to
confirm our understanding, IAD inspected the authorization configuration tables (Exhibit 1,
TM A-D). Based on inspection, IAD noted limits are configured with defined thresholds for
each of the 12 trader classifications. Therefore, IAD gained comfort that authorization
limits are appropriately configured. No exception noted.

Attribute B - Positive Testing:
To validate that Calypso accepts trades within authorized limits, and to confirm our
understanding, IAD observed a positive test where a Senior Trader submitted a trade within
their limit (Exhibit 2, TM A). Based on observation, IAD noted the system processed the
trade successfully. Therefore, IAD gained comfort that trades within limits are accepted
appropriately. No exception noted.

Attribute C - Negative Testing:
To validate that Calypso rejects trades exceeding authorized limits, and to confirm our
understanding, IAD observed a negative test where a Junior Trader attempted to exceed their
limit (Exhibit 2, TM B). Based on observation, IAD noted the system rejected the trade with
appropriate error messaging. Therefore, IAD gained comfort that trades exceeding limits are
systematically rejected. No exception noted.
```

---

## Summary Memo Components

### Standard Opening
```
This summary memo documents [post-planning updates/changes/key judgments] made during fieldwork 
for the [Audit Name] audit.
```

### Resource Changes (if applicable)
```
Resource Changes:
During fieldwork, the following resource changes occurred: [describe personnel 
additions/departures and impact on audit execution].
```

### Post-Planning Updates (if applicable)
```
Post-Planning Updates:
The following updates were made to planning phase workpapers during fieldwork: [describe 
updates to planning sections with business justification].
```

### RCM Changes (if applicable)
```
RCM Changes:
The following changes were made to the Risk Control Matrix after the planning phase: [describe 
control additions/deletions/modifications with justification].
```

### Point-in-Time Testing (if applicable)
```
Point-in-Time Testing:
The following controls were tested using point-in-time evidence obtained after the audit 
period end: [list controls with justification for why historical evidence was unavailable].
```

### Audit Plan Changes (if applicable)
```
Audit Plan Changes:
The following variances from the approved audit plan occurred during fieldwork:
- Budget: [actual hours vs. budgeted hours with explanation]
- Schedule: [actual timeline vs. planned timeline with explanation]
- Data Analytics Approach: [changes to DA testing plan with justification]
```

---
