# Control Development Guide

## Purpose

This guide provides comprehensive patterns for developing control descriptions and test steps aligned with IAD RCM standards. Use this guide as a reference for creating new controls or refining existing ones.

---

## Part 1: Control Description Development

### Core Formula
```
[SYSTEM/WHO] + [ACTION] + [WHAT IS CONTROLLED] + [KEY VALIDATION/OUTCOME]
```

### Element Definitions

| Element | Purpose | Examples |
|---------|---------|----------|
| **SYSTEM/WHO** | Identifies what/who performs the control | Calypso, Migraph, Finance Manager, Python script |
| **ACTION** | Verb describing control mechanism | enforces, is configured to, validates, performs, reviews, monitors |
| **WHAT IS CONTROLLED** | Core activity or data being controlled | authorization limits, data transfer accuracy, exception review, calculation logic |
| **KEY VALIDATION/OUTCOME** | Error handling or result | alerts to management, logged and addressed, rejection with error message |

---

## Part 2: Control Type Classifications

### Automated Configuration Controls

**Characteristics:**
- System settings that can be modified through configuration
- No code changes required to adjust behavior
- Tested through positive/negative scenarios and access controls

**Action Verb:** "is configured to" or "is systematically configured to"

**Template:**
```
[System] is configured to [control objective] based on [configuration parameter]. 
[Error handling statement].
```

**Real-World Example:**
Calypso is configured to enforce authorization limits based on trader job class, preventing execution of any trade exceeding the configured approval threshold for that trader's classification. Trades exceeding limits are automatically rejected with error messages to the Trading Operations team.

---

### Automated Enforcement Controls

**Characteristics:**
- Control logic embedded in application code
- System actively prevents non-compliance
- Requires code changes to modify behavior

**Action Verb:** "enforces," "prevents," "restricts"

**Template:**
```
[System] enforces [control objective] by [mechanism]. 
[Error handling statement].
```

**Real-World Example:**
Migraph enforces segregation of duties by preventing users from both creating and approving vendor records within the same workflow. The system's access control logic systematically restricts users to either creator or approver roles, with override attempts logged and escalated to management.

---

### Interface Controls

**Characteristics:**
- Data transfer between systems
- Can be real-time or batch/scheduled
- Requires validation of completeness and accuracy

**Action Verb:** "transfers," "validates," "interfaces"

**Template (Real-Time):**
```
The [Source] to [Target] interface automatically transfers [data type] in real-time via 
[mechanism], with data validation checks to ensure [validation objectives]. 
[Error handling statement].
```

**Template (Batch/Scheduled):**
```
The [Source] to [Target] interface transfers [data type] through [frequency] batch processing, 
with [validation checks] to ensure [objectives]. 
[Error handling statement].
```

**Real-World Example (Batch):**
The Loan Origination System (LOS) to Core Banking System (CBS) interface automatically transfers approved loan data through nightly batch processing, with completeness and accuracy validation checks to ensure all approved loans are transferred with complete financial terms. Data integrity errors including missing records and field mapping errors are logged and addressed daily by the IT Operations team.

**Real-World Example (Real-Time):**
The Bloomberg SEF to Calypso interface automatically transfers trade execution data in real-time via API connections, with data validation checks to ensure completeness of all required trade fields including counterparty, settlement date, and notional amount. Validation failures result in automated error alerts to the Trading Operations team.

---

### IT-Dependent Manual (ITDM) Controls

**Characteristics:**
- Combination of manual and automated components
- Manual component typically involves review, approval, or decision-making
- Automated component provides data, flags exceptions, or enforces rules

**Structure:** Describe manual component first, then automated component. For standard ITDMs, 2 sentences is the correct length. Reserve a third sentence for reclassification proposals where the scope-determination dependency is explicitly the finding.

**Standard Template (2 sentences — use for most ITDMs):**
```
[Frequency], [Manual performer] [reviews/confirms/validates] [what they act on].
[System] [is configured to / automatically generates] [automated support component].
```

**Standard Real-World Example:**
> Daily, the Compliance team reviews the Trade Surveillance Exception Report to identify potential policy violations. The Surveillance System automatically generates the report based on predefined detection scenarios and risk parameters.

**Standard Real-World Example (Shorter):**
> Quarterly, Treasury Capital Markets compares internally generated Calypso discount factors against external CME benchmark curves to execute performance monitoring. Variances exceeding defined thresholds are investigated and resolved timely.

**Reclassification Template (3 sentences — only when documenting a scope-determination dependency):**
```
Sentence 1: [Performer] [reviews/confirms] [what they act on].
Sentence 2: [System] is configured to [automated action that determines scope/population].
Sentence 3: [Observable outcome when the control fires correctly].
```

**Reclassification Real-World Example:**
> Prior to contract signing, the CVM Vendor Sourcing Manager confirms that all required Planning/Risk Assessment and Due Diligence tasks generated within the SAP Ariba Contract Workspace are completed. SAP Ariba is configured to generate the required task population, including Agreement Risk Forms triggered based on Contract Workspace data fields. Incomplete tasks are visible within the Contract Workspace and prevent the VSM from advancing the contract to execution.

**What distinguishes standard vs. reclassification:** In the standard pattern, the system support sentence describes what the tool does. In the reclassification pattern, sentence 2 specifically documents that the system *determines the population the reviewer can see* — and sentence 3 makes the normal outcome observable so the gap becomes apparent when the system fails.

---

### Manual Review/Approval Controls

**Characteristics:**
- Human inspection, judgment, or authorization
- No automated component
- Evidence through sign-off, approval, or documented review

**Action Verb:** "performs," "reviews," "approves," "reconciles"

**Template:**
```
[Frequency], [Role] reviews/approves [document/report] to [objective]. 
[Documentation of review/escalation process].
```

**Real-World Example:**
Monthly, the Finance Manager reviews the reconciliation exception report to identify variances exceeding $10,000 and documents investigation results and resolution status in the Reconciliation Tracking Log.

**Real-World Example (Approval):**
For each trade modification request, the Trading Supervisor reviews the justification and approves or rejects the modification within the trading system. All approvals are logged with timestamp and approver ID.

---

### Monitoring Controls

**Characteristics:**
- Ongoing observation of system/process activity
- Logs, tracks, or alerts on specific events or conditions
- May be preventive (alerts before issue) or detective (identifies after occurrence)

**Action Verb:** "monitors," "logs," "tracks"

**Template:**
```
[System] monitors [activity/metric] and logs [details]. 
[Alert/escalation statement].
```

**Real-World Example:**
Control-M monitors all scheduled batch jobs supporting the loan processing workflow and logs execution status, start/end times, and failure details. Failed jobs trigger immediate email alerts to the IT Operations team for investigation and remediation.

---

## Part 3: Error Handling Patterns

### Real-Time Error Handling
**Pattern:** "Validation failures result in automated error alerts to [team/management]"

**When to Use:** Real-time interfaces, continuous monitoring, immediate validation

**Example:**
The Bloomberg to Calypso interface validates trade data completeness. Validation failures result in automated error alerts to the Trading Operations team.

---

### Batch Process Error Handling
**Pattern:** "with data integrity errors logged and addressed on a [frequency] basis"

**When to Use:** Scheduled batch processes, periodic data transfers, nightly interfaces

**Example:**
The nightly GL posting interface transfers trade settlements to the general ledger. Data integrity errors are logged and addressed daily by the Finance Operations team.

---

### Critical Process Error Handling
**Pattern:** "Failed validation checks trigger automatic job termination"

**When to Use:** Critical processes that must not continue with errors

**Example:**
The payroll calculation batch validates employee data completeness before processing. Failed validation checks trigger automatic job termination and immediate alert to Payroll Management.

---

### Human Follow-Up Error Handling
**Pattern:** "Exceptions are identified and escalated through automated alerts for [manual action]"

**When to Use:** Automated detection requiring human investigation or decision

**Example:**
The expense reporting system validates receipts against policy limits. Exceptions exceeding $5,000 are identified and escalated through automated alerts to department managers for approval or rejection.

---

### Manual Review Evidence
**Pattern:** "with all review activities documented in [specific log/system]"

**When to Use:** Manual controls requiring evidence trail

**Example:**
Monthly, the Controller reviews the bank reconciliation and investigates variances exceeding $10,000, with all review activities documented in the Reconciliation Tracking System.

---

## Part 4: Test Step Development

### Standard Structure (Preferred Format)

```
Perform a walkthrough of [system/process] and inspect [documentation] to [confirm/validate]:
1. [Configuration/mechanism description] (Attribute A)
2. [Positive testing description] (Attribute B)
3. [Negative testing description] (Attribute C)
4. [Error handling description] (Attribute D)
5. [Access control description] (Attribute E) [if applicable]
6. [Change management description] (Attribute F) [if applicable]
```

### Core Testing Principles

**Attribute A - Configuration/Mechanism Inspection**
- **Purpose:** Understand how the control is designed
- **Action Verbs:** Inspect, Review, Examine
- **What to Document:** Configuration settings, code logic, process documentation, workflow design
- **Example:** Inspect the Calypso authorization configuration to verify that limits are systematically configured by trader job class with defined thresholds.

**Attribute B - Positive Testing**
- **Purpose:** Validate the control functions correctly with valid inputs
- **Action Verbs:** Perform, Validate, Confirm
- **What to Test:** Valid transactions/data are accepted and processed correctly
- **Example:** Perform a positive test by executing a trade within authorization limits and confirm the system accepts it successfully.

**Attribute C - Negative Testing**
- **Purpose:** Validate the control properly rejects/flags invalid inputs
- **Action Verbs:** Perform, Validate, Confirm
- **What to Test:** Invalid transactions/data are rejected or flagged appropriately
- **Example:** Perform a negative test by attempting a trade exceeding authorization limits and confirm the system rejects it with appropriate error message.

**Attribute D - Error Handling & Monitoring**
- **Purpose:** Validate errors are detected, logged, and addressed
- **Action Verbs:** Validate, Inspect, Verify
- **What to Test:** Error logging completeness, notification mechanisms, resolution procedures
- **Example:** Validate that rejected trades are logged with sufficient detail including trader ID, attempted amount, and rejection reason.

**Attribute E - Privileged Access** (Context-Dependent)
- **Purpose:** Confirm only authorized personnel can modify control
- **Action Verbs:** Inspect, Validate, Confirm
- **What to Test:** Access restrictions for configuration changes
- **When to Use:** Primarily for configurable automated controls
- **Example:** Inspect access controls to confirm only authorized personnel can modify authorization limit configurations.

**Attribute F - Change Management** (Context-Dependent)
- **Purpose:** Validate configuration changes follow proper procedures
- **Action Verbs:** Validate, Inspect, Confirm
- **What to Test:** Documentation, approval, and testing of changes
- **When to Use:** Primarily for configurable automated controls
- **Example:** Validate that configuration changes are documented and tested before implementation.

---

### Control-Type-Specific Test Step Patterns

#### Pattern 1: Automated Configuration Controls

**Opening:**
```
Perform a walkthrough of the [system] [control type] and inspect the system configuration to validate:
```

**Standard Attributes:**
1. Configuration inspection → How control is configured (Attribute A)
2. Positive testing → Valid scenarios accepted (Attribute B)
3. Negative testing → Invalid scenarios rejected (Attribute C)
4. Error handling → Errors logged and addressed (Attribute D)
5. Privileged access → Configuration change restrictions (Attribute E)
6. Change management → Change procedures followed (Attribute F)

**Real-World Example:**
```
Perform a walkthrough of the Calypso authorization limits and inspect the system configuration to validate:
1. Inspect that Calypso is systematically configured to enforce authorization limits based on trader job class with defined thresholds for each classification. (Attribute A)
2. Perform a positive test by executing a trade within authorization limits and confirm the system accepts it successfully. (Attribute B)
3. Perform a negative test by attempting a trade exceeding authorization limits and confirm the system rejects it with appropriate error message. (Attribute C)
4. Validate that rejected trades are logged with sufficient detail including trader ID, attempted amount, and rejection reason. (Attribute D)
5. Inspect access controls to confirm only authorized personnel can modify authorization limit configurations. (Attribute E)
6. Validate that configuration changes are documented and tested before implementation. (Attribute F)
```

---

#### Pattern 2: Interface Controls

**Opening:**
```
Perform a walkthrough of the [Source] to [Target] interface and inspect [documentation] to validate:
```

**Standard Attributes:**
1. Configuration inspection → Mapping documentation, schema (Attribute A)
2. Positive testing → Valid data accepted (Attribute B)
3. Negative testing → Invalid data rejected (Attribute C)
4. Error handling → Errors logged and addressed (Attribute D)
5. Sample verification → Sample of transferred data validated (Attribute E)
6. Privileged access → Configuration change restrictions (Attribute F)
7. Change management → Change procedures followed (Attribute G)

**Real-World Example:**
```
Perform a walkthrough of the LOS to CBS interface and inspect the batch job configuration to validate:
1. Inspect the data mapping documentation to confirm completeness and accuracy of all required loan data fields. (Attribute A)
2. Verify that the batch job executes on the scheduled nightly frequency and completes successfully. (Attribute B)
3. Inspect batch job logs to identify any transfer failures or data integrity errors during the audit period. (Attribute C)
4. Validate that identified errors are logged with sufficient detail and escalated to IT Operations for timely resolution. (Attribute D)
5. Select a sample of transferred loan records and verify complete and accurate transfer by comparing source LOS data to target CBS data. (Attribute E)
6. Inspect access controls to confirm only authorized personnel can modify batch job configuration. (Attribute F)
7. Validate that batch job configuration changes are documented and tested before implementation. (Attribute G)
```

**Cross-Reference for Comprehensive Interface Testing:**
```
IAD Note: For full coverage over the completeness and accuracy of the interface process, 
refer to test procedures performed by the Data Analytics team within Control [Reference].
```

---

#### Pattern 3: ITDM (Semi-Automated) Controls

**Opening:**
```
Perform a walkthrough of the [process/workflow] and inspect [documentation] to validate:
```

**Standard Attributes:**
1. Configuration inspection → Automated component design (Attribute A)
2. Positive testing → Valid scenarios automated correctly (Attribute B)
3. Negative testing → Invalid scenarios flagged appropriately (Attribute C)
4. Manual review → Manual component performed and documented (Attribute D)
5. Privileged access → Access restrictions (Attribute E)
6. Change management → Change procedures followed (Attribute F)

**Real-World Example:**
```
Perform a walkthrough of the Alteryx workflow execution process and inspect the workflow configuration to validate:
1. Inspect the Alteryx workflow configuration to confirm data quality checks are systematically configured including null checks, data type validation, and range verification. (Attribute A)
2. Perform a positive test by processing valid investment data through the workflow and confirm it completes successfully without flagging errors. (Attribute B)
3. Perform a negative test by processing invalid data (null values, incorrect data types) and confirm the workflow appropriately flags these issues in the output report. (Attribute C)
4. Validate that the Treasury Manager reviews the output report monthly as evidenced by sign-off and documents resolution of flagged exceptions. (Attribute D)
5. Inspect access controls to confirm only authorized Treasury personnel can execute or modify the Alteryx workflow. (Attribute E)
6. Validate that workflow modifications follow documented change management procedures with testing before implementation. (Attribute F)
```

**For Alteryx Workflows:** Cross-reference IAD Technical Testing Skill - Alteryx Workflows for detailed testing methodology

---

#### Pattern 4: Manual Review/Approval Controls

**Opening:**
```
Perform a walkthrough of the [review/approval process] and inspect relevant documentation to validate:
```

**Standard Attributes:**
1. Process documentation → Review procedures defined (Attribute A)
2. Execution evidence → Review performed as required (Attribute B)
3. Completeness → All required items reviewed (Attribute C)
4. Exception investigation → Exceptions identified and resolved (Attribute D)
5. Access controls → Appropriate restrictions (Attribute E)

**Real-World Example:**
```
Perform a walkthrough of the monthly reconciliation exception review process and inspect relevant documentation to validate:
1. Inspect the reconciliation exception report to confirm it identifies all variances exceeding the $10,000 threshold. (Attribute A)
2. Validate that the Finance Manager reviews the exception report monthly as evidenced by sign-off or approval. (Attribute B)
3. Select a sample of exceptions and verify that investigation was performed and documented in the Reconciliation Tracking Log. (Attribute C)
4. Confirm that resolution status for each exception is tracked through completion. (Attribute D)
5. Validate that only authorized personnel have access to modify reconciliation exceptions or override controls. (Attribute E)
```

---

#### Pattern 5: Monitoring Controls

**Opening:**
```
Perform a walkthrough of the [monitoring process] and inspect [system/documentation] to validate:
```

**Standard Attributes:**
1. Configuration inspection → Monitoring rules and thresholds (Attribute A)
2. Log completeness → Monitoring captures required events (Attribute B)
3. Alert mechanism → Notifications function appropriately (Attribute C)
4. Response procedures → Escalations handled timely (Attribute D)
5. Access controls → Monitoring configuration restrictions (Attribute E)

**Real-World Example:**
```
Perform a walkthrough of the Control-M batch job monitoring process and inspect the monitoring configuration to validate:
1. Inspect the Control-M monitoring configuration to confirm all critical batch jobs are monitored with appropriate thresholds and alert rules. (Attribute A)
2. Validate that the monitoring system logs all batch job executions including start time, end time, and status. (Attribute B)
3. Perform a test to confirm that failed batch jobs trigger immediate email alerts to the IT Operations team. (Attribute C)
4. Inspect evidence that IT Operations responds to alerts timely and documents resolution activities. (Attribute D)
5. Inspect access controls to confirm only authorized personnel can modify monitoring configurations or alert rules. (Attribute E)
```

---

## Part 5: Technical Testing Integration

When test steps involve technical components, cross-reference the **IAD Technical Testing Skill** for execution and documentation:

### Code/Script Inspection
**When to Use:** Python scripts, R scripts, SQL procedures, VBA macros, PowerShell scripts

**Test Step Pattern:**
```
1. Inspect the [script type] to confirm [control objective] is systematically implemented
through [mechanism]. For code documentation standards, refer to IAD Technical Testing Skill
- Code Documentation. (Attribute A)
```

**Real-World Example:**
```
1. Inspect the Python validation script to confirm data quality checks are systematically
configured including null checks, data type validation, and range verification. For code
documentation methodology including tabular format with line numbers and tickmarks, refer
to IAD Technical Testing Skill - Code Documentation. (Attribute A)
```

---

### Database Connection Testing
**When to Use:** Validating production database connections, SQL queries, data extraction

**Test Step Pattern:**
```
1. Inspect the database connection configuration to validate connection to production database
with appropriate authentication method. For database connection testing methodology, refer to
IAD Technical Testing Skill - Database Testing. (Attribute A)
```

**Real-World Example:**
```
1. Inspect the SQL Server connection string within the Alteryx workflow to validate connection
to the production DataHub database using Windows Authentication. For detailed database
connection validation methodology including server, database, authentication, and parameter
verification, refer to IAD Technical Testing Skill - Database Testing. (Attribute A)
```

---

### Reperformance Testing
**When to Use:** Reperforming automated calculations, data transformations, validations

**Test Step Pattern:**
```
[#]. Reperform [process/calculation] for a sample and compare results to production outputs
to validate [objective]. For reperformance documentation standards, refer to IAD Technical
Testing Skill - Reperformance Testing. (Attribute [X])
```

**Real-World Example:**
```
5. With assistance from the Data Analytics team, reperform the margin calculation for a
sample of securities using the same inputs and validate that reperformed results match
production outputs within acceptable tolerance. For reperformance testing methodology
including environment setup, execution documentation, and results comparison standards,
refer to IAD Technical Testing Skill - Reperformance Testing. (Attribute E)
```

---

### Error Handling Assessment
**When to Use:** Comprehensive error handling testing (detection, logging, notification, resolution)

**Test Step Pattern:**
```
[#]. Validate that the [system/script] systematically detects errors, logs them with
sufficient detail, notifies appropriate personnel, and provides resolution procedures.
For comprehensive error handling assessment methodology, refer to IAD Technical Testing
Skill - Error Handling. (Attribute [X])
```

**Real-World Example:**
```
4. Validate that the Python script systematically detects data quality errors, logs them
to the error tracking table with sufficient detail (timestamp, field name, error type,
invalid value), sends email notifications to the Treasury team, and provides documented
resolution procedures. For comprehensive error handling testing covering detection, logging,
notification, and resolution components, refer to IAD Technical Testing Skill - Error Handling.
(Attribute D)
```

---

## Part 6: Common Pitfalls and Solutions

### Pitfall 1: Over-Engineering Control Descriptions
**Problem:** Control descriptions embedding threshold values, field enumerations, or conditional logic that belongs in test steps — even when technically within the sentence limit.

**Example 1 (Too Detailed — classic over-sentence violation):**
"The Calypso trading system is systematically configured to enforce authorization limits based on the trader's job classification, which is defined in the HR master data and synchronized daily with the trading platform through the HR-to-Calypso interface. The system evaluates each trade request against the configured threshold matrix, which maintains different limits for various instrument types including equities, fixed income, and derivatives, and compares the trade notional amount to the applicable limit. When a trade exceeds the configured limit, the system prevents execution and generates an error message displayed to the trader in the trading blotter, while simultaneously logging the attempted breach to the security audit log with details including trader ID, timestamp, instrument type, requested amount, and configured limit. All rejected trades are also captured in the daily compliance report reviewed by Risk Management."

**Solution:**
"Calypso is configured to enforce authorization limits based on trader job class, preventing execution of any trade exceeding the configured approval threshold for that trader's classification. Trades exceeding limits are automatically rejected with error messages to the Trading Operations team."

**Example 2 (Too Detailed — 2 sentences but packed with implementation detail):**
"MissingAribaDataIRSQ.py is configured to evaluate each SR Project ID against defined completeness thresholds — Business Details count of zero, IRSQ or Business Details count below 31 for non-law firms, and below 17 for law firms — and assigns an issue flag or warning classification accordingly. Projects in Draft status or active change request are assigned warning classifications and excluded from the actionable output."

**Solution:**
"MissingAribaDataIRSQ.py is configured to evaluate SR Project IDs against defined completeness thresholds and assign issue flag or warning classifications. Projects in Draft status or active change request are excluded from the actionable output as potential-issue warnings."

**Key:** The description names the mechanism and outcome. The specific threshold values (31, 17), field names, and exclusion logic belong in test step Attribute A, where the auditor will inspect them directly. Putting them in the description does not make it more testable — it makes it harder to read and risks becoming stale if thresholds change.

---

### Pitfall 2: Generic System References
**Problem:** Using "the system" instead of specific application names

**Example (Generic):**
"The system validates data completeness before processing and rejects invalid records."

**Solution (Specific):**
"The Loan Origination System validates data completeness before processing and rejects loan applications with missing required fields."

**Key:** Always use specific system names. This enables effective testing and provides clarity.

---

### Pitfall 3: Passive Voice
**Problem:** Using passive voice instead of active voice

**Example (Passive):**
"Data validation is performed by the interface before transfer to the target system. Errors are logged and addressed by the operations team."

**Solution (Active):**
"The MyGRC to Migraph interface validates data completeness before transfer. Data integrity errors are logged and addressed daily by the operations team."

**Key:** Start sentences with the system or performer, use active verbs.

---

### Pitfall 4: Missing Error Handling
**Problem:** Control description doesn't explain what happens when validation fails

**Example (Missing Error Handling):**
"Calypso validates trade settlement data for completeness and accuracy."

**Solution (With Error Handling):**
"Calypso validates trade settlement data for completeness and accuracy before posting to the general ledger. Validation failures result in automated error alerts to the Settlement Operations team."

**Key:** Always include outcome or error handling in control descriptions.

---

### Pitfall 5: Vague Test Steps
**Problem:** Test steps lack specificity about what to test or expected outcomes

**Example (Vague):**
"1. Inspect the system configuration. (Attribute A)"
"2. Test that the control works. (Attribute B)"

**Solution (Specific):**
"1. Inspect the Calypso authorization configuration to verify that limits are systematically configured by trader job class with defined thresholds for each classification. (Attribute A)"
"2. Perform a positive test by executing a trade within authorization limits and confirm the system accepts it successfully. (Attribute B)"

**Key:** Be specific about what to inspect/test and what the expected outcome is.

---

### Pitfall 6: Using "Ensure"
**Problem:** Overuse of "ensure" which is vague and implies guarantees

**Example (Using "Ensure"):**
"The system ensures data quality and ensures all errors are logged."

**Solution (Without "Ensure"):**
"The system validates data quality and logs all errors to the error tracking table."

**Key:** Replace "ensure" with specific action verbs: validate, confirm, enforce, determine, verify.

