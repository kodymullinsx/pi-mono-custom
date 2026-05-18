# Exception Standards

## Types of Exceptions

### Design Exceptions

**Definition**: The control design does not adequately address the identified risk.

**Common Scenarios:**
- Control does not cover all aspects of the risk
- Missing necessary validation or approval steps
- Inappropriate timing or frequency for the risk
- Inadequate segregation of duties
- Insufficient error handling or monitoring

**Example:**
"The control design is not adequate to mitigate data integrity risk because the validation logic does not include completeness checks for all required pricing fields, allowing incomplete data to be processed without rejection. This design deficiency creates potential for trading decisions based on incomplete pricing information."

---

### Operating Exceptions

**Definition**: The control is not operating as designed or prescribed.

**Common Scenarios:**
- Control not performed at required frequency
- Control performed but evidence is insufficient or missing
- Errors or exceptions identified by the control not properly addressed
- Control performer lacks appropriate authority or expertise
- Untimely performance of the control

**Example:**
"Based on testing of 25 samples, IAD identified 3 instances (12%) where the monthly reconciliation review was not documented with appropriate approval signatures and variance investigation notes. These operating exceptions indicate inconsistent execution of the manual review component despite adequate control design."

---

### Control Unavailability Exception

**Definition**: The control could not be tested because it was not in operation during the audit period.

**Common Scenarios:**
- EUC not operational during audit period
- Control implemented after audit period start
- System unavailable for testing
- Control suspended or decommissioned
- New control not yet in production

**Standard Language Pattern:**
```
Due to the [control/EUC/workflow] not being in operation, IAD was not able to test the 
effectiveness of the control as a part of the [audit name] audit. Exception noted.
```

**Example - EUC Not Operational:**
```
Due to the Treasury Settlement Services Alteryx workflow not being in operation during the 
audit period, IAD was not able to test the effectiveness of the control as a part of the 
Treasury Capital Markets Investment Portfolio Management audit. Exception noted.
```

**Example - System Unavailable:**
```
Due to the Migraph application being unavailable for testing (system migration in progress), 
IAD was not able to test the effectiveness of the control as a part of the Model Risk 
Management audit. Exception noted.
```

**Usage in Supplemental Questions:**
When a control is unavailable, append the standard language to each supplemental question answer:
```
[Standard answer about control design]. Due to the [control/EUC/workflow] not being in 
operation, IAD was not able to test the effectiveness of the control as a part of the 
[audit name] audit. Exception noted.
```

---

## Exception Documentation Requirements

### 1. Factual Description

Provide specific, objective description of the exception identified.

**Good Example:**
"Of 25 reconciliations tested, 3 lacked documented approval signatures and variance investigation notes. Specifically: October 2024 reconciliation showed no approval signature, November 2024 reconciliation contained incomplete variance notes with no documented resolution, and December 2024 reconciliation was approved 15 days after the required 5-day deadline."

**Bad Example:**
"Some reconciliations were not properly reviewed."

---

### 2. Test Criteria Not Met

Reference the specific requirement or expectation that was not met.

**Template:**
```
The exception represents a deviation from [control description requirement / test step expectation / documented procedure] which requires [specific criteria].
```

**Example:**
"The exception represents a deviation from the control design which requires monthly reconciliations to be reviewed and approved within 5 business days of month-end with documented investigation of all variances exceeding $10,000."

---

### 3. Root Cause (if determined)

Identify underlying factors contributing to the exception.

**Root Cause Categories:**

**Process Design vs. Deviation:**
- Design Issue: Process is flawed or incomplete
- Deviation: Process is adequate but not followed

**Environmental Factors:**
- System Constraints: Technical limitations prevent proper execution
- Resource Constraints: Insufficient staffing or time
- Organizational Changes: Restructuring, personnel turnover

**Human Factors:**
- Training: Inadequate training or understanding
- Workload: Volume exceeds capacity
- Awareness: Personnel unaware of requirements

**Systemic Patterns:**
- Isolated Incident: One-time occurrence with unique circumstances
- Pattern: Multiple occurrences suggesting systemic issue

**Example:**
"Through inquiry with the Finance Manager, IAD determined the root cause was a staffing gap during the transition period when the previous reconciliation analyst departed. Temporary coverage arrangements resulted in incomplete documentation until a replacement was hired in January 2025."

---

### 4. Potential Impact

Describe the effect on risk mitigation.

**Template:**
```
This exception [increases risk of / reduces effectiveness of / creates potential for] [specific risk scenario]. [Additional context on severity or likelihood if known].
```

**Example:**
"This exception increases the risk that reconciliation variances exceeding materiality thresholds could remain undetected and unresolved, potentially resulting in inaccurate financial reporting. While compensating controls exist through the quarterly management review process, the frequency and severity of exceptions identified suggest this control is not operating effectively as a primary mitigating control."

---

### 5. Management Response (if obtained)

Document management's explanation and planned remediation.

**Template:**
```
Management acknowledges the exception and [agrees/disagrees] with IAD's assessment. [Management's explanation]. Management has [implemented/plans to implement] the following remediation: [specific actions and timeline].
```

**Example:**
"Management acknowledges the exception and agrees with IAD's assessment that reconciliation review documentation was inadequate during the transition period. Management has implemented the following remediation effective January 2025: (1) hired replacement reconciliation analyst, (2) implemented mandatory documentation checklist requiring approval signature and variance investigation notes, (3) established weekly monitoring of reconciliation completion status by Senior Manager."

---

## Compensating Controls Evaluation

### When to Evaluate Compensating Controls

Assess compensating controls when:
- Primary control has design or operating exceptions
- Exception severity requires assessment of residual risk
- Management asserts other controls mitigate the risk

### Evaluation Framework

**1. Identify Potential Compensating Controls**

Look for controls that:
- Address the same risk
- Operate at different level (more granular or broader)
- Occur before or after the failed control
- Provide overlapping coverage

**2. Test Compensating Control Effectiveness**

Apply same testing rigor:
- Validate design adequacy
- Test operating effectiveness
- Assess coverage completeness

**3. Evaluate Coverage Adequacy**

Determine if compensating controls:
- Fully mitigate the risk
- Partially mitigate the risk
- Do not adequately mitigate the risk

**4. Document Overall Control Environment**

**Template:**
```
While [primary control] has [design/operating] exceptions, IAD identified [compensating control] which [describe compensating control operation]. Based on testing of [compensating control], IAD determined that [assessment of overall control environment effectiveness].
```

**Example:**
"While the monthly reconciliation review control (Cntl_XXXXXX) has operating exceptions, IAD identified the quarterly management oversight review (Cntl_YYYYYY) which provides compensating detective control through comprehensive review of all reconciliation exception patterns and resolution status. Based on testing of the quarterly management review, IAD determined that the control environment provides adequate risk mitigation despite the monthly control exceptions, though management should address the root cause to strengthen the primary control."

---

## Point-in-Time Evidence

### When Point-in-Time Evidence is Necessary

**System Limitations:**
- System does not retain historical configuration data
- Historical access lists are not available
- Configuration changes overwrite previous settings
- System migrations eliminated historical evidence

**Continuous Operations:**
- Certificates valid through multiple periods
- Access controls remain in effect ongoing
- Configurations apply continuously once set

**Practical Constraints:**
- Evidence collection not possible during audit period
- Historical data purged before testing

---

### Required Documentation Components

**1. Document the Date Gap**

Clearly state when evidence was obtained versus audit period end.

**Template:**
```
IAD obtained [evidence type] on [date obtained], which was [X days] [before/after] the audit 
period end date of [audit period end date].
```

**Example:**
"IAD obtained the production database connection string configuration on January 15, 2025, which was 15 days after the audit period end date of December 31, 2024."

---

**2. Provide Justification**

Explain why point-in-time evidence is reliable for the audit period.

**Standard Justification Pattern:**
```
IAD obtained point-in-time evidence on [date], which was [before/after] the end of the audit 
coverage period ([date]). IAD gained reasonable assurance that the point-in-time evidence was 
substantially the same as it would have been on [audit end date] because:
1. [Justification - e.g., SSL certificate validity period began within audit period]
2. [Corroboration - e.g., Change management logs confirmed no modifications]
3. [System constraint - e.g., If expired, system would fail to operate]
```

**Template - Configuration Last Modified:**
```
Point-in-time evidence is appropriate because IAD validated that the configuration was last 
modified on [date], which precedes the audit period start date of [date]. Since the configuration 
remained unchanged throughout the audit period and operates continuously once configured, the 
point-in-time evidence obtained after period end is representative of the configuration enforced 
during the full audit period.
```

**Template - Last Modified Date Pattern:**
```
Given the last modified date of [date] and the continuous nature of the control, the point-in-time 
test of design is representative of the [checks/controls] enforced throughout the full audit 
period of [start date] to [end date], thereby providing operating effectiveness coverage.
```

**Example - Access Controls:**
"Point-in-time evidence is appropriate because the Active Directory access list represents current state of access controls that operate continuously. IAD validated through change management logs that no additions or deletions of privileged users occurred during the audit period, confirming that the access list obtained after period end reflects the access controls in effect throughout the audit period."

---

**3. Corroborate When Possible**

Strengthen reliance on point-in-time evidence through additional support.

**Corroboration Sources:**
- Change management logs
- System version history
- Management confirmation letters
- Audit trails showing configuration stability
- Historical evidence from portions of audit period

**Example:**
"To corroborate reliance on point-in-time evidence, IAD:
- Inspected change management logs for [system] and confirmed no configuration changes were made to [specific configuration] during the audit period (Exhibit X, TM A)
- Obtained management representation confirming configuration remained unchanged during audit period (Exhibit Y, TM B)
- Tested configuration operation during audit period through review of production execution logs showing consistent behavior (Exhibit Z, TM C)"

---

**4. Document Limitations**

Acknowledge any limitations in the point-in-time evidence approach.

**Template:**
```
IAD acknowledges the limitation that [specific limitation]. However, based on [corroborating evidence/procedures], IAD determined this limitation does not materially affect the reliability of the testing conclusion.
```

**Example:**
"IAD acknowledges the limitation that historical access list data is not available to directly verify access controls during the audit period. However, based on change management log review showing no access changes, management confirmation, and the continuous nature of Active Directory access controls, IAD determined this limitation does not materially affect the reliability of the testing conclusion regarding appropriateness of access during the audit period."

---

### Framework by Control Type

**Point-in-Time Controls** (Execute on specific dates):
- Focus on specific execution dates
- Test completeness (all required executions occurred)
- Test timeliness (executions occurred within required timeframe)
- Point-in-time evidence less applicable unless testing control design

**Continuous Controls** (Operate continuously):
- Use point-in-time evidence with justification
- Validate configuration/code stability through change management
- Confirm continuous operation through execution logs or system behavior
- Most appropriate use case for point-in-time evidence approach

---

## Vendor System Limitation Adaptations

### When Adaptations are Necessary

**Proprietary Code Limitations:**
- Vendor-managed systems where underlying code is not accessible
- Proprietary algorithms or calculation engines
- Black-box processing logic

**System Access Limitations:**
- Cannot directly observe or test control operation
- Production environment access restricted
- Limited visibility into vendor systems

**Documentation Limitations:**
- Proprietary algorithms not fully documented
- Vendor documentation insufficient for detailed testing
- Multi-system dependencies with third-party components

---

### Standard Adaptation Documentation Pattern

```
Original Plan: IAD originally planned to [original testing approach].

Adaptation Rationale: [System] is a vendor-managed proprietary system where [limitation 
description - e.g., underlying code is not accessible to Schwab personnel].

Adapted Approach: IAD adapted testing to focus on:
(1) [Alternative approach 1 - e.g., configurable validation parameters]
(2) [Alternative approach 2 - e.g., reperformance testing]
(3) [Alternative approach 3 - e.g., vendor documentation review]

Justification: This adapted approach provides reasonable assurance over [control objective] 
by validating [what the adapted approach validates].

Limitations: IAD acknowledges that [specific limitation - e.g., direct inspection of 
proprietary code was not possible]. However, the adapted approach provides reasonable 
assurance over [control objective].
```

**Example - Vendor Pricing System:**
```
Original Plan: IAD originally planned to inspect the underlying code logic for Calypso's 
pricing calculation engine to validate systematic enforcement of pricing validation rules.

Adaptation Rationale: Calypso is a vendor-managed proprietary system where the underlying 
pricing calculation code is not accessible for direct inspection.

Adapted Approach: IAD adapted testing to focus on (1) inspection of configurable validation 
parameters within Calypso's accessible configuration screens, (2) reperformance testing of 
sample pricing calculations to validate accuracy, and (3) review of vendor technical 
documentation describing the pricing validation framework.

Justification: This adapted approach provides reasonable assurance over Calypso's pricing 
validation controls by validating both the configured parameters and the actual calculation 
results, while acknowledging limitations in testing the proprietary calculation engine itself.

Limitations: IAD acknowledges that direct inspection of proprietary pricing calculation 
code was not possible. However, the combination of configuration validation, reperformance 
testing, and vendor documentation review provides reasonable assurance that pricing 
validations operate as designed.
```

---

## Truncated Output Documentation

### When Truncated Output Occurs

**System Display Limitations:**
- User interface truncates long outputs
- Report displays limited to certain row/character counts
- System logs rotate or limit visible history

**Not Acceptable When:**
- Data itself is truncated (not just display)
- Unable to corroborate with alternative evidence
- Truncation obscures critical validation results

### Standard Documentation Pattern

```
Due to system limitations, the output was truncated. However, IAD live-observed that 
[validation checks/results] and no error messages were displayed. This observation is 
corroborated by [reference to other attribute testing or alternative evidence].
```

**Example:**
"Due to system limitations, the Calypso validation log output was truncated to display only the most recent 100 records. However, IAD live-observed that all displayed validation checks passed with no error messages. This observation is corroborated by the error notification log (Attribute D testing) which showed no validation failures during the audit period."

### When Truncated Output is Acceptable

- System display limitation only (not data limitation)
- Live observation documented
- Cross-corroboration with other evidence available
- Truncation does not affect testing conclusion

---

## Testing Adaptations

### When Testing Adaptations are Necessary

**System Limitations:**
- Cannot directly observe or test control operation
- Historical evidence unavailable
- Production environment access restricted
- Proprietary vendor systems with limited visibility

**Evidence Unavailability:**
- Evidence not retained for full audit period
- Evidence format changed during audit period
- Evidence access requires specialized tools/skills

**Reperformance Limitations:**
- Complex calculations requiring specialized software
- Proprietary algorithms not fully documented
- Multi-system dependencies

---

### Documentation Requirements for Adaptations

**1. State Original Plan**

Describe the originally intended testing approach.

**2. Explain Why Adaptation Needed**

Document the specific constraint or limitation requiring adaptation.

**3. Describe Adapted Approach**

Detail the alternative testing procedures performed.

**4. Justify Reasonableness**

Explain why adapted approach provides sufficient assurance.

**5. Acknowledge Limitations**

Be transparent about any limitations in the adapted approach.

---

## Population-Based vs. Annual Controls

### Population-Based Controls

Controls that execute multiple times over a population of transactions or items.

**Testing Focus:**
- Define population clearly with specific parameters
- Use appropriate sampling methodology
- Test completeness (all population items subject to control)
- Test accuracy (control operates correctly for items tested)
- Assess operating effectiveness across the population

---

### Annual Controls

Controls that execute only once during the audit period.

**Testing Focus:**
- Test the single instance thoroughly
- Validate alignment with documented requirements
- Focus on quality and effectiveness of the single execution
- Detailed testing table typically not necessary
- "Test of one" represents 100% of population

**Documentation Approach:**
```
IAD selected the single annual instance of [control name] during the audit period, as the control executes once per year as part of [annual process]. IAD's testing focused on [specific attributes tested] to validate [control objective].
```

---

## Exception Summary Statement

Always conclude exception documentation with clear exception status.

**Design Exception:**
```
Based on the design deficiency identified, IAD determined the control is not adequately designed to mitigate the identified risk. Exception noted.
```

**Operating Exception:**
```
Based on the exceptions identified during testing, IAD determined the control is not operating effectively. Exception noted.
```

**Multiple Exceptions:**
```
Based on the combination of design deficiencies and operating exceptions identified, IAD determined the control is not adequately designed or operating effectively. Exception noted.
```

**Control Unavailability Exception:**
```
Due to the [control/EUC/workflow] not being in operation, IAD was not able to test the effectiveness of the control as a part of the [audit name] audit. Exception noted.
```

---
