# Test Step Development Guide

## Purpose

This guide provides comprehensive methodology for developing test steps that enable effective control testing. Use this guide when creating test steps for RCM controls.

---

## Standard Test Step Structure

### Preferred Format
```
Perform a walkthrough of [system/process] and inspect [documentation] to [confirm/validate]:
[Configuration/mechanism inspection statement] (Attribute A)
[Valid scenarios accepted statement] (Attribute B)
[Invalid scenarios rejected statement] (Attribute C)
[Error logging and notification statement] (Attribute D)
[Access restrictions statement] (Attribute E) [if applicable]
[Change procedures statement] (Attribute F) [if applicable]
```

### Key Characteristics
- **Opening statement:** Describes the walkthrough and inspection approach
- **Numbered steps:** Each step has clear action and expected outcome
- **Attribute labels:** Explicit labeling with descriptive names
- **Context-dependent attributes:** E and F primarily for configurable controls
- **Logical flow:** Moves from understanding → validation → governance

---

## Core Testing Principles

### Attribute A - Configuration/Mechanism Inspection
**Purpose:** Understand how the control is designed and configured

**Action Verbs:** Inspect, Review, Examine

**What to Document:**
- Configuration settings and parameters
- Code logic or workflow design
- Process documentation or procedures
- System architecture or component relationships

**Example:**
"Inspect the Calypso authorization configuration to verify that limits are systematically configured by trader job class with defined thresholds for each classification."

---

### Attribute B - Positive Testing
**Purpose:** Validate the control functions correctly with valid inputs

**Action Verbs:** Perform, Validate, Confirm, Execute

**What to Test:**
- Valid transactions/data are accepted
- System processes correctly formatted inputs
- Expected outcomes occur for compliant scenarios

**Examples:**
- "Perform a positive test by executing a trade within authorization limits and confirm the system accepts it successfully."
- "Validate that the interface successfully transfers valid exception records with all required fields."
- "Execute the workflow with valid investment data and confirm it completes without flagging errors."

---

### Attribute C - Negative Testing
**Purpose:** Validate the control properly rejects/flags invalid inputs

**Action Verbs:** Perform, Validate, Confirm, Attempt

**What to Test:**
- Invalid transactions/data are rejected
- System identifies non-compliant scenarios
- Appropriate error messages are generated

**Examples:**
- "Perform a negative test by attempting a trade exceeding authorization limits and confirm the system rejects it with appropriate error message."
- "Validate that the interface appropriately handles missing or malformed data by rejecting the transfer."
- "Process invalid data (null values, incorrect data types) and confirm the workflow flags these issues."

---

### Attribute D - Error Handling & Monitoring
**Purpose:** Validate that errors are detected, logged, and addressed

**Action Verbs:** Validate, Inspect, Verify, Confirm

**What to Test:**
- Error logging completeness and detail
- Notification mechanisms function appropriately
- Resolution procedures are documented
- Escalation paths are defined

**Examples:**
- "Validate that rejected trades are logged with sufficient detail including trader ID, attempted amount, and rejection reason."
- "Inspect error logs to validate failures are captured with sufficient detail for investigation."
- "Verify that validation failures trigger automated email alerts to the Treasury team."
- "Confirm that IT Operations responds to alerts timely and documents resolution activities."

---

### Attribute E - Privileged Access (Context-Dependent)
**Purpose:** Confirm only authorized personnel can modify the control

**Action Verbs:** Inspect, Validate, Confirm, Verify

**When to Use:** Primarily for configurable automated controls where configuration changes affect control behavior

**What to Test:**
- Access restrictions for configuration changes
- Role-based permissions appropriate
- No unauthorized modification capability

**Examples:**
- "Inspect access controls to confirm only authorized personnel can modify authorization limit configurations."
- "Validate that only authorized Treasury personnel can execute or modify the Alteryx workflow."
- "Confirm that only IT Operations managers and authorized developers have access to modify interface parameters."

**When NOT to Use:** Manual review controls (use different access control validation), non-configurable automated controls (cannot be modified without code changes)

---

### Attribute F - Change Management (Context-Dependent)
**Purpose:** Validate configuration changes follow proper procedures

**Action Verbs:** Validate, Inspect, Confirm, Verify

**When to Use:** Primarily for configurable automated controls where configuration changes require governance

**What to Test:**
- Documentation of configuration changes
- Approval process followed
- Testing completed before implementation
- Audit trail of changes maintained

**Examples:**
- "Validate that configuration changes are documented and tested before implementation."
- "Inspect change management tickets to confirm authorization configuration changes followed documented approval procedures."
- "Confirm that workflow modifications follow documented change management procedures with testing before deployment."

**When NOT to Use:** Manual controls (may have different change management approaches), controls where configuration is static

---

## Control-Type-Specific Patterns

### Pattern 1: Automated Configuration Controls

**Opening:**
```
Perform a walkthrough of the [system] [control type] and inspect the system configuration to validate:
```

**Standard Attributes:**
1. Configuration inspection (Attribute A)
2. Positive testing - valid scenarios accepted (Attribute B)
3. Negative testing - invalid scenarios rejected (Attribute C)
4. Error handling and logging (Attribute D)
5. Privileged access - configuration change restrictions (Attribute E)
6. Change management - change procedures followed (Attribute F)

**Complete Example:**
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

### Pattern 2: Interface Controls

**Opening:**
```
Perform a walkthrough of the [Source] to [Target] interface and inspect [documentation] to validate:
```

**Standard Attributes:**
1. Configuration/mapping inspection (Attribute A)
2. Positive testing or execution validation (Attribute B)
3. Error identification or negative testing (Attribute C)
4. Error handling and escalation (Attribute D)
5. Sample verification (Attribute E)
6. Privileged access (Attribute F)
7. Change management (Attribute G)

**Complete Example:**
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

**IAD Note Pattern:**
```
IAD Note: For full coverage over the completeness and accuracy of the interface process, refer to test procedures performed by the Data Analytics team within Control [Reference].
```

---

### Pattern 3: ITDM (Semi-Automated) Controls

**Opening:**
```
Perform a walkthrough of the [process/workflow] and inspect [documentation] to validate:
```

**Standard Attributes:**
1. Automated component configuration (Attribute A)
2. Positive testing - automated component (Attribute B)
3. Negative testing - automated component (Attribute C)
4. Manual review and error resolution (Attribute D)
5. Privileged access (Attribute E)
6. Change management (Attribute F)

**Complete Example:**
```
Perform a walkthrough of the Alteryx workflow execution process and inspect the workflow configuration to validate:
1. Inspect the Alteryx workflow configuration to confirm data quality checks are systematically configured including null checks, data type validation, and range verification. (Attribute A)
2. Perform a positive test by processing valid investment data through the workflow and confirm it completes successfully without flagging errors. (Attribute B)
3. Perform a negative test by processing invalid data (null values, incorrect data types) and confirm the workflow appropriately flags these issues in the output report. (Attribute C)
4. Validate that the Treasury Manager reviews the output report monthly as evidenced by sign-off and documents resolution of flagged exceptions. (Attribute D)
5. Inspect access controls to confirm only authorized Treasury personnel can execute or modify the Alteryx workflow. (Attribute E)
6. Validate that workflow modifications follow documented change management procedures with testing before implementation. (Attribute F)
```

**Technical Testing Cross-Reference:**
For Alteryx workflows specifically, reference: "For detailed Alteryx workflow testing methodology, refer to IAD Technical Testing Skill - Alteryx Workflows."

---

### Pattern 4: Manual Review/Approval Controls

**Opening:**
```
Perform a walkthrough of the [review/approval process] and inspect relevant documentation to validate:
```

**Standard Attributes:**
1. Process documentation or report inspection (Attribute A)
2. Execution evidence (Attribute B)
3. Completeness of review (Attribute C)
4. Exception investigation and resolution (Attribute D)
5. Access controls (Attribute E)

**Complete Example:**
```
Perform a walkthrough of the monthly reconciliation exception review process and inspect relevant documentation to validate:
1. Inspect the reconciliation exception report to confirm it identifies all variances exceeding the $10,000 threshold. (Attribute A)
2. Validate that the Finance Manager reviews the exception report monthly as evidenced by sign-off or approval. (Attribute B)
3. Select a sample of exceptions and verify that investigation was performed and documented in the Reconciliation Tracking Log. (Attribute C)
4. Confirm that resolution status for each exception is tracked through completion. (Attribute D)
5. Validate that only authorized personnel have access to modify reconciliation exceptions or override controls. (Attribute E)
```

**Note:** Manual controls typically do not require Attributes F (Change Management) as the process itself is the control, not a configurable system setting.

---

### Pattern 5: Monitoring Controls

**Opening:**
```
Perform a walkthrough of the [monitoring process] and inspect [system/documentation] to validate:
```

**Standard Attributes:**
1. Monitoring configuration (Attribute A)
2. Log completeness (Attribute B)
3. Alert mechanism testing (Attribute C)
4. Response procedures validation (Attribute D)
5. Access controls (Attribute E)

**Complete Example:**
```
Perform a walkthrough of the Control-M batch job monitoring process and inspect the monitoring configuration to validate:
1. Inspect the Control-M monitoring configuration to confirm all critical batch jobs are monitored with appropriate thresholds and alert rules. (Attribute A)
2. Validate that the monitoring system logs all batch job executions including start time, end time, and status. (Attribute B)
3. Perform a test to confirm that failed batch jobs trigger immediate email alerts to the IT Operations team. (Attribute C)
4. Inspect evidence that IT Operations responds to alerts timely and documents resolution activities. (Attribute D)
5. Inspect access controls to confirm only authorized personnel can modify monitoring configurations or alert rules. (Attribute E)
```

---

## Technical Testing Integration

When test steps involve technical components, cross-reference **IAD Technical Testing Skill** for execution and documentation standards.

### Code/Script Inspection

**When to Use:** Testing Python scripts, R scripts, SQL procedures, VBA macros, PowerShell scripts, Alteryx workflows (code-based components)

**Test Step Pattern:**
```
1. Inspect the [script type] to confirm [control objective] is systematically implemented through [mechanism]. For code documentation methodology including tabular format with line numbers and tickmarks, refer to IAD Technical Testing Skill - Code Documentation. (Attribute A)
```

**Real-World Example:**
```
1. Inspect the Python validation script to confirm data quality checks are systematically configured including null checks, data type validation, and range verification. For code documentation methodology including tabular format with line numbers and tickmarks, refer to IAD Technical Testing Skill - Code Documentation. (Attribute A)
```

**What Technical Testing Covers:**
- Tabular format for code documentation (line #, code, tickmark, description)
- Function initialization and entry points
- Control flow logic (conditionals, loops, error handling)
- Data processing (transformations, validations, calculations)
- Integration points (database connections, API calls)

---

### Database Connection Validation

**When to Use:** Validating production database connections, SQL queries, data extraction processes

**Test Step Pattern:**
```
1. Inspect the database connection configuration to validate connection to production database with appropriate authentication method. For database connection validation methodology including server, database, authentication, and parameter verification, refer to IAD Technical Testing Skill - Database Testing. (Attribute A)
```

**Real-World Example:**
```
1. Inspect the SQL Server connection string within the Alteryx workflow to validate connection to the production DataHub database using Windows Authentication. For detailed database connection validation methodology, refer to IAD Technical Testing Skill - Database Testing. (Attribute A)
```

**What Technical Testing Covers:**
- Server/Host validation (correct production server)
- Database Name verification (correct production database)
- Port configuration (appropriate for database type)
- Authentication method (Windows Auth, SQL Auth)
- Connection parameters (timeout, encryption)

---

### Reperformance Testing

**When to Use:** Reperforming automated calculations, data transformations, validations to verify accuracy

**Test Step Pattern:**
```
[#]. With assistance from the Data Analytics team, reperform [process/calculation] for a sample and compare results to production outputs to validate [objective]. For reperformance testing methodology including environment setup, execution documentation, and results comparison standards, refer to IAD Technical Testing Skill - Reperformance Testing. (Attribute [X])
```

**Real-World Example:**
```
5. With assistance from the Data Analytics team, reperform the margin calculation for a sample of securities using the same inputs and validate that reperformed results match production outputs within acceptable tolerance. For reperformance testing methodology, refer to IAD Technical Testing Skill - Reperformance Testing. (Attribute E)
```

**What Technical Testing Covers:**
- Inputs Used (specify data for reperformance)
- Environment Details (test environment configuration)
- Execution Steps (document steps taken)
- Results Comparison (compare to production outputs)
- Discrepancy Analysis (explain any differences)

---

### Comprehensive Error Handling Assessment

**When to Use:** Testing complex error handling (detection, logging, notification, resolution)

**Test Step Pattern:**
```
[#]. Validate that the [system/script] systematically detects errors, logs them with sufficient detail, notifies appropriate personnel, and provides resolution procedures. For comprehensive error handling testing covering detection, logging, notification, and resolution components, refer to IAD Technical Testing Skill - Error Handling. (Attribute [X])
```

**Real-World Example:**
```
4. Validate that the Python script systematically detects data quality errors, logs them to the error tracking table with sufficient detail (timestamp, field name, error type, invalid value), sends email notifications to the Treasury team, and provides documented resolution procedures. For comprehensive error handling assessment methodology, refer to IAD Technical Testing Skill - Error Handling. (Attribute D)
```

**What Technical Testing Covers:**
- **Error Detection:** Mechanisms to identify errors (try/catch blocks, validation checks)
- **Error Logging:** Completeness, detail, retention, access, format
- **Error Notification:** Recipients, content, timing, reliability
- **Error Resolution:** Procedures, escalation paths, tracking

---

### Pattern 6: Semi-Automated Performance Monitoring Controls (e.g., Model Performance Monitoring)

Used when a process combines an automated tool or workbook with manual human submission, review, and approval steps — such as quarterly model performance monitoring submitted through Migraph and approved by MRO.

**Opening:**
```
Perform a walkthrough of the [process name] and inspect relevant [system] submission records, performance monitoring documentation, and approval evidence to confirm the following:
```

**Key opening statement rules:**
- Do NOT embed sample periods (e.g., "Q1 2025 and Q2 2025") in the opening. Sample selection belongs in the population/sampling section of the workpaper.
- Do NOT pre-specify the evidence list in detail. Reference it generically ("relevant submission records, performance monitoring documentation").
- Keep the opening a clean, standard walkthrough statement.

**Standard Attributes:**
1. Submission and approval confirmation (Attribute A)
2. Threshold evaluation framework inspection (Attribute B)
3. Breach escalation evidence (Attribute C — unconditional, N/A at execution if no breach)
4. DA cross-reference via IAD Note (if applicable — not a numbered attribute)

**Complete Example:**
```
Perform a walkthrough of the quarterly Hedge Effectiveness Performance Monitoring process and inspect relevant Migraph submission records, performance monitoring workbooks, and MRO approval documentation to confirm the following:

1. Inspect Migraph workflow submissions for each sampled quarter to confirm TCM submitted the Hedge Effectiveness Performance Monitoring report, including supporting metrics and threshold calculations, and that MRO approved each submission. (Attribute A)

2. Inspect performance monitoring results for each sampled quarter to confirm all regression metrics were evaluated against established threshold ranges (Acceptable, Awareness, and Alert). (Attribute B)

3. Inspect evidence that any Alert-level threshold breaches identified during the sampled quarters were escalated by TCM in accordance with the escalation procedures documented in the model whitepaper. (Attribute C)

IAD Note: [Insert note on DA coverage of automated workbook logic and data extraction completeness, with cross-reference to relevant DA control.]
```

**Critical design notes:**

**Attribute B — Scope to the evaluation framework, not the metric list.** Do not enumerate individual metrics (slope, R-squared, F-statistic, etc.) within the attribute statement. Metric-level detail belongs in execution documentation. The attribute should confirm that the evaluation framework was applied, not catalogue every data point.

**Attribute C — Always write as an unconditional inspection step.** Never frame as "If a breach occurred..." Test steps must be always-applicable. The correct approach is to write C as an affirmative inspection step; if no breach occurred during execution, the tester documents N/A with rationale. This applies to any conditional scenario within test steps — obligation steps, escalation steps, remediation steps — all should be written affirmatively.

**Attributes E and F — Omit for manual/semi-automated controls** where the process itself is the control, not a configurable system setting. Include only if the automated workbook component is separately tested as an IT control.

**Timeliness requirements** — Only include submission timeliness language in Attribute A if the model whitepaper clearly defines a submission deadline that can be tested against. If timeliness has been risk accepted or is not reasonably captured in the whitepaper, omit this component.

**Model risk rating matters for breach notification scope.** Per the Model Owner Procedure:
- Very High and High Risk models: breach escalation AND outward notification to model users required.
- Medium Risk models: breach escalation only (no model user notification requirement).
- Tailor Attribute C accordingly based on the model's risk rating.

---

## Test Step Structural Standards

The following rules govern all test step construction regardless of control type. Violations identified during review should be corrected before finalizing RCM documentation.

### Rule 1: Opening Statements Must Be Clean and Generic
The opening walkthrough statement sets scope — it should NOT:
- Embed specific sample periods ("Q1 2025 and Q2 2025")
- Pre-list specific evidence items with excessive detail
- Contain conditional logic

These details belong in the population/sampling workpaper section or execution documentation.

**Correct:** "Perform a walkthrough of the quarterly performance monitoring process and inspect relevant submission records and approval documentation to confirm the following:"

**Incorrect:** "Perform a walkthrough of the quarterly performance monitoring process and inspect Migraph workflow submissions, Q1 2025 and Q2 2025 workbooks, and MRO approval emails to confirm the following:"

---

### Rule 2: Attribute Steps Must Be Unconditional
Every attribute must be written as an always-applicable inspection step. Conditional framing ("If X occurred...") is not permitted in test step statements.

**Correct:** "Inspect evidence that any Alert-level threshold breaches identified during the sampled period were escalated in accordance with the escalation procedures documented in the model whitepaper."

**Incorrect:** "If an Alert-level breach was identified, inspect evidence that TCM followed the escalation procedures."

At execution, testers document "N/A — no Alert-level breaches identified during sampled period" when the condition was not triggered.

---

### Rule 3: Single-Objective Attributes
Each attribute should test one thing. Compound attributes that enumerate multiple distinct items (four metrics, three system checks, two approval parties) make testing and documentation harder to execute cleanly. Scope the attribute to the objective; leave detail for execution.

**Correct:** "Inspect performance monitoring results for each sampled quarter to confirm all regression metrics were evaluated against established threshold ranges."

**Incorrect:** "Inspect performance monitoring results for each sampled quarter to confirm all regression metrics (slope, R-squared, F-statistic, and observation count) remained within Acceptable or Awareness threshold ranges, and that no Alert-level breaches were identified by TCM or MRO across either quarter."

---

### Rule 4: No Em Dashes or En Dashes in Test Steps
Use plain punctuation (commas, colons, parentheses) in all test step language. Em dashes (--) and en dashes (-) should not appear in control descriptions or test step text.

---

## Common Test Step Pitfalls

### Pitfall 1: Vague Action Descriptions
**Problem:** "Inspect the system configuration."

**Solution:** "Inspect the Calypso authorization configuration to verify that limits are systematically configured by trader job class with defined thresholds for each classification."

**Key:** Be specific about what to inspect and what the expected outcome is.

---

### Pitfall 2: Missing Expected Outcomes
**Problem:** "Perform a positive test."

**Solution:** "Perform a positive test by executing a trade within authorization limits and confirm the system accepts it successfully."

**Key:** State both the test action and the expected result.

---

### Pitfall 3: No Cross-Team Testing References
**Problem:** Test steps imply comprehensive testing by IT team alone, ignoring Data Analytics or Core team coverage.

**Solution:** Include IAD Note referencing related testing:
"IAD Note: For full coverage over the completeness and accuracy of the interface process, refer to test procedures performed by the Data Analytics team within Control [Reference]."

**Key:** Clarify scope boundaries and cross-team dependencies.

---

### Pitfall 4: Inappropriate Use of Attributes E and F
**Problem:** Including "Privileged Access" and "Change Management" attributes for non-configurable controls or manual processes.

**Solution:** Only include these attributes when:
- Control is configurable (automated)
- Configuration changes affect control behavior
- Access controls and change management are relevant governance mechanisms

**Key:** Context-dependent attributes should only be used when applicable.

---

### Pitfall 5: Passive Voice in Test Steps
**Problem:** "Configuration should be inspected to verify..."

**Solution:** "Inspect the configuration to verify..."

**Key:** Start with action verb in active voice.

