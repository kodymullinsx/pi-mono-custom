# Risk Mapping & Design Decisions Guide

## Purpose

This guide provides frameworks for mapping controls to IAD Risk Inventory and making strategic control design decisions including split vs combine and key vs non-key determinations.

---

## Part 1: IAD Risk Inventory Mapping

### Risk Categories

**Data Risk**
- **Focus:** Accuracy, completeness, validity, integrity of data
- **Common Controls:** Interface validations, data quality checks, reconciliations
- **Example Risk:** Data is entered or adjusted incorrectly or untimely, resulting in inaccurate reporting

**Process Risk**
- **Focus:** Efficiency, effectiveness, compliance of processes
- **Common Controls:** Workflow routing, approval hierarchies, process monitoring
- **Example Risk:** Processes are not executed in accordance with policies and procedures

**Access Risk**
- **Focus:** Authorization, authentication, segregation of duties
- **Common Controls:** Role-based access, authorization limits, SOD enforcement
- **Example Risk:** The firm does not maintain appropriate access to systems and locations

**Technology Risk**
- **Focus:** Availability, security, resilience of systems
- **Common Controls:** Monitoring, backup procedures, disaster recovery
- **Example Risk:** Systems, applications, or infrastructure fail or are unavailable

**Model Risk**
- **Focus:** Assumptions, calculations, outputs of models
- **Common Controls:** Model validation, performance monitoring, parameter review
- **Example Risk:** The firm is reliant on models that have fundamental errors or are used incorrectly

**Governance Risk**
- **Focus:** Oversight, accountability, decision-making
- **Common Controls:** Committee reviews, policy approvals, escalation procedures
- **Example Risk:** Governance structures do not provide appropriate oversight

---

### Business Risk Description Formula

```
[WHAT] + [CAUSE] + [IMPACT]
```

**WHAT:** Describe the specific issue or condition  
**CAUSE:** Explain how or why it occurs (often starts with "due to")  
**IMPACT:** State the potential consequence (often starts with "resulting in" or "may result in")

### Examples

**Example 1 - Data Risk:**
- **What:** Inaccurate or incomplete data transferred between systems
- **Cause:** Due to inadequate interface validation checks
- **Impact:** May result in flawed reporting and business decisions

**Complete Statement:**
"Inaccurate or incomplete data transferred between systems due to inadequate interface validation checks may result in flawed reporting and business decisions."

**Example 2 - Process Risk:**
- **What:** Unauthorized workflow modifications
- **Cause:** Due to inadequate change management controls
- **Impact:** May result in non-compliant process execution and audit findings

**Complete Statement:**
"Unauthorized workflow modifications due to inadequate change management controls may result in non-compliant process execution and audit findings."

**Example 3 - Access Risk:**
- **What:** Unauthorized access to sensitive financial data
- **Cause:** Due to inadequate role-based access controls
- **Impact:** May result in data breaches, fraud, or regulatory violations

**Complete Statement:**
"Unauthorized access to sensitive financial data due to inadequate role-based access controls may result in data breaches, fraud, or regulatory violations."

---

### Control-to-Risk Alignment

When mapping a control to a risk, validate alignment by asking:

1. **Does the control directly address the stated risk?**
   - Control should mitigate the specific risk, not a tangential issue

2. **Does the control language align with the risk category?**
   - Data Risk → Control should validate data accuracy/completeness
   - Process Risk → Control should enforce process compliance
   - Access Risk → Control should restrict/authorize access

3. **Is the business risk description complete?**
   - Must include what + cause + impact
   - Should be specific enough to be testable

4. **Is the mapping defensible?**
   - Auditors should be able to understand the linkage
   - Control should logically mitigate the risk

### Alignment Examples

**Good Alignment:**
- **Risk:** Data Risk - Inaccurate data transferred between systems may result in flawed reporting
- **Control:** The LOS to CBS interface validates completeness and accuracy of all transferred loan data
- **Rationale:** Control directly addresses data accuracy risk through validation

**Poor Alignment:**
- **Risk:** Data Risk - Inaccurate data transferred between systems
- **Control:** The Finance Manager approves the monthly reconciliation report
- **Rationale:** Control is downstream; doesn't prevent inaccurate data transfer

---

## Part 2: Split vs Combine Control Decisions

### When to Split Controls

Split controls when they have different characteristics that require independent testing or governance:

**1. Different Frequencies**
- **Example:** Daily automated interface validation vs Monthly manual reconciliation
- **Rationale:** Cannot test both on same schedule; different testing approaches

**2. Different Control Owners or Performers**
- **Example:** IT Operations performs automated monitoring vs Finance Manager performs manual review
- **Rationale:** Different responsible parties; separate accountability

**3. Different Systems or Applications**
- **Example:** Calypso trade validation vs CBS settlement validation
- **Rationale:** Different systems require different testing; failures have different impacts

**4. Different Testing Approaches**
- **Example:** Automated configuration testing vs Manual review testing
- **Rationale:** Completely different test methodologies and evidence requirements

**5. Different Risk Mappings**
- **Example:** Authorization control (Access Risk) vs Calculation control (Data Risk)
- **Rationale:** Address different risks; should be mapped separately

**6. Different Failure Impacts (Key vs Non-Key)**
- **Example:** Key control with no compensating control vs Non-key control with compensating controls
- **Rationale:** Different materiality assessment and testing requirements

### Real-World Split Example

**Scenario:** Loan origination process has both real-time credit validation and nightly batch data transfer.

**Option 1 - Combined (Incorrect):**
"The loan origination system validates credit applications in real-time and transfers approved loan data nightly to the core banking system, with validation failures and transfer errors logged and addressed by IT Operations."

**Option 2 - Split (Correct):**
- **Control A:** LOS Credit Validation Interface (Real-Time)
- **Control B:** LOS to CBS Batch Data Transfer (Nightly)

**Rationale for Split:**
- Different frequencies (real-time vs nightly)
- Different control objectives (credit validation vs data transfer)
- Different testing approaches (API testing vs batch interface testing)
- Different failure impacts (credit validation prevents bad loans; data transfer ensures accurate records)

---

### When to Combine Controls

Combine controls when they are part of an integrated workflow that cannot be tested independently:

**1. Same Risk with Sequential Steps**
- **Example:** "System validates data → rejects invalid records → logs errors"
- **Rationale:** Sequential steps in single validation process; cannot test independently

**2. Integrated Workflow (Cannot Operate Independently)**
- **Example:** Workflow routing logic that assigns tasks based on rules
- **Rationale:** Routing, assignment, and delegation are integrated; single control mechanism

**3. Same Owner, Frequency, and System**
- **Example:** Multiple validation checks performed by same system in same process
- **Rationale:** Efficient to test together; single control design

**4. Would Be Tested as Single Procedure**
- **Example:** Interface that validates multiple fields simultaneously
- **Rationale:** Auditors would test all validations together; artificial to split

### Real-World Combine Example

**Scenario:** Calypso trading system performs multiple authorization checks (trader limit, instrument type, settlement date).

**Option 1 - Split (Overly Granular):**
- Control A: Trader Limit Validation
- Control B: Instrument Type Validation
- Control C: Settlement Date Validation

**Option 2 - Combined (Correct):**
"Calypso enforces comprehensive trade authorization checks including trader limits, instrument type restrictions, and settlement date validation before trade execution. Trades failing any validation are rejected with specific error messages."

**Rationale for Combine:**
- Same system (Calypso)
- Same frequency (real-time)
- Same owner (Trading Operations)
- Sequential validations in single process
- Would be tested together as integrated authorization control

---

### Decision Framework

Use this flowchart to determine whether to split or combine:

```
START: Multiple control activities identified

↓
Question 1: Do they have the same frequency?
├─ NO → SPLIT (different testing schedules required)
└─ YES → Continue

↓
Question 2: Do they have the same owner/performer?
├─ NO → SPLIT (different accountability)
└─ YES → Continue

↓
Question 3: Do they operate in the same system?
├─ NO → SPLIT (different systems require different testing)
└─ YES → Continue

↓
Question 4: Can they be tested independently?
├─ YES → Consider SPLIT (may be separate controls)
└─ NO → COMBINE (integrated workflow)

↓
Question 5: Do they address different risks?
├─ YES → SPLIT (different risk mappings)
└─ NO → COMBINE (same risk mitigation)

↓
RESULT: COMBINE controls into single integrated control
```

---

## Part 3: Key vs Non-Key Control Determination

### Key Control Characteristics

**Key controls have ALL of the following:**

1. **Direct Impact on Financial Statements or Compliance**
   - Control directly prevents material misstatements
   - Failure would affect reported financial results
   - Required for regulatory compliance

2. **No Effective Compensating Controls**
   - No other control adequately mitigates the same risk
   - Loss of this control creates material exposure
   - Compensating controls (if any) are insufficient

3. **High Consequence of Failure**
   - Material misstatement likely
   - Significant compliance violation
   - Major financial or reputational impact

### Key Control Examples

**Example 1 - GL Posting Interface:**
"The Calypso to General Ledger interface validates completeness and accuracy of all trade settlements before financial statement generation, with no compensating manual review."

**Why Key:**
- Direct impact on financial statements (revenue recognition)
- No compensating controls (automated posting without manual review)
- Failure → Material misstatement in financial results

**Example 2 - Authorization Limits:**
"Calypso enforces trader authorization limits preventing execution of trades exceeding approved thresholds, with override capabilities restricted to senior management."

**Why Key:**
- Direct impact on risk exposure and potential losses
- Primary control for trading risk management
- Failure → Unauthorized trades, potential material losses

---

### Non-Key Control Characteristics

**Non-key controls have ONE OR MORE of the following:**

1. **Support Key Controls or Provide Additional Assurance**
   - Provides early warning or detection
   - Supports effectiveness of key controls
   - Adds layers of assurance

2. **Effective Compensating Controls Exist**
   - Key control adequately mitigates the risk
   - Loss of non-key control does not create material exposure
   - Other controls provide sufficient mitigation

3. **Lower Consequence of Failure**
   - Would not directly result in material misstatement
   - Provides operational efficiency or early detection
   - Failure would be detected by key controls

### Non-Key Control Examples

**Example 1 - Batch Job Monitoring:**
"Control-M monitors all scheduled batch jobs and logs execution status. Failed jobs trigger immediate email alerts to IT Operations."

**Why Non-Key:**
- Supports effectiveness of batch processes (key controls)
- Failure would be detected through other means (reconciliations, error reports)
- Provides early warning but not primary control

**Example 2 - Daily Automated Price Validation:**
"The data quality Python script validates that Calypso pricing data aligns with vendor pricing within defined thresholds, with variances flagged for investigation."

**Why Non-Key:**
- Compensating control exists (quarterly performance monitoring by Model Owner is key control)
- Provides early detection but not primary validation
- Failure would be caught by quarterly review

---

### Decision Framework

Use this decision tree to determine key vs non-key classification:

```
START: Control identified

↓
Question 1: Does the control directly impact financial statements or regulatory compliance?
├─ NO → Likely NON-KEY
└─ YES → Continue

↓
Question 2: Are there effective compensating controls?
├─ YES → Likely NON-KEY (unless compensating control is insufficient)
└─ NO → Continue

↓
Question 3: What is the consequence of control failure?
├─ Material misstatement or significant compliance violation → KEY
├─ Would be detected by other controls → NON-KEY
└─ Uncertain → Continue

↓
Question 4: Is this control the PRIMARY mitigation for a material risk?
├─ YES → KEY
└─ NO → NON-KEY

↓
RESULT: Document rationale for classification
```

---

### Borderline Cases

**Scenario 1: Control with Partial Compensating Coverage**

**Control:** Daily automated interface validation  
**Compensating Control:** Monthly manual reconciliation (key control)

**Analysis:**
- Daily validation provides early detection
- Monthly reconciliation would catch errors but with delay
- Delay could result in operational issues but not material misstatement

**Decision:** **Non-Key** - Monthly reconciliation is sufficient compensating control

---

**Scenario 2: Control That Prevents Severe Operational Issues**

**Control:** Database connection validation before data extraction  
**Impact:** Failure could result in incomplete data extraction and flawed analysis

**Analysis:**
- Operational impact is severe
- However, downstream reconciliations (key controls) would detect incomplete data
- Does not directly affect financial statements

**Decision:** **Non-Key** - Operational control; reconciliations provide compensating coverage

---

**Scenario 3: Control with No Alternative**

**Control:** Authorization limit enforcement in trading system  
**Impact:** Failure could result in unauthorized trades and material losses

**Analysis:**
- Direct financial impact (potential losses)
- No compensating controls (trades execute in real-time)
- Primary control for trading risk management

**Decision:** **Key** - No effective compensating control; material financial impact

---

## Part 4: Primary vs Compensating Control Relationships

### Primary Control
The control that directly mitigates the risk; typically tested for operating effectiveness.

**Example:**
"Monthly, the Finance Manager reviews and approves the bank reconciliation, investigating all variances exceeding $10,000."

---

### Compensating Control
A control that provides alternative mitigation if the primary control fails or is not operating effectively.

**Example (Compensating for Primary):**
- **Primary:** Daily automated batch job monitoring alerts IT Operations to failures
- **Compensating:** Weekly reconciliation by Finance catches any data issues if monitoring fails

**Relationship:** Compensating control provides backstop; reduces testing reliance on primary

---

### Control Relationship Documentation

When documenting control relationships, clearly state:

1. **Primary Control:** The control that directly addresses the risk
2. **Compensating Control:** The control that provides alternative mitigation
3. **Relationship:** How the compensating control mitigates risk if primary fails
4. **Testing Implication:** Whether testing can rely on compensating control

**Example Documentation:**
```
Primary Control (Cntl_001): Daily automated interface validation
Compensating Control (Cntl_002): Monthly manual reconciliation
Relationship: If daily validation fails, monthly reconciliation would detect data errors within 30 days
Testing Implication: Primary control classified as Non-Key; monthly reconciliation (Key) provides sufficient mitigation
```

---

## Part 5: IAD Risk Inventory

Select a risk from the inventory below and customize the description using the Business Risk Description Formula: [WHAT] + [CAUSE] + [IMPACT]

### Model Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007426 | The firm is reliant on models that have fundamental errors, are used incorrectly, or involve errors in model registration, development, implementation, documentation, or ongoing monitoring |

### Third-Party Management
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007428 | The Firm fails to manage third parties in adherence to firm-wide policies and standards |

### Fraud and Financial Crime
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007429 | External parties conduct activities with the intent to defraud the Firm, clients, or vendors |
| Risk_007439 | Money laundering and terrorist financing activity is conducted through the Firm |
| Risk_007441 | Sanctioned countries, individuals, and organizations defined by OFAC or other sanctioning bodies conduct business through the Firm |

### Access Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007490 | The Firm does not maintain appropriate access to systems and locations |

### Data Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007586 | Data is entered or adjusted incorrectly or untimely |
| Risk_007587 | Critical Data Elements are improperly set up or maintained |
| Risk_007588 | Data does not yield or result in reliable outputs, decisions, or reports |
| Risk_007589 | Data is lost or degraded during migration, conversion, cleansing, or structuring |
| Risk_007590 | Data is not retained accurately, completely, or in a manner that is accessible or readily available |

### Communication and Process Execution
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007653 | The Firm fails to communicate information properly or accurately (excluding reports) |
| Risk_007655 | Persons of the Firm fail to completely and accurately execute a process |
| Risk_007657 | The Firm fails to process transactions or internal processes on a timely basis |

### Regulatory and Compliance
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007686 | Performing actions without the required license or registration or communicating an invalid professional designation |
| Risk_007687 | Disclosures (written or verbal) are not accurate, complete, and/or delivered timely to appropriate clients |
| Risk_007699 | Transactions are processed that exceed the required Firm and/or regulatory limits |

### Privacy and Data Protection
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007706 | Regulators and clients/employees are not made aware of an exposure of Personal Information and mitigating actions when required |
| Risk_007707 | Clients' privacy rights (e.g., collection, sharing externally, selling, and deletion) are not met |

### Business Continuity and Records
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007888 | The Firm is unable to maintain acceptable business activities through and beyond severe disruptions to its processes |
| Risk_007889 | Required records are not retained to support the Firm's Legal and Compliance record-keeping requirements |

### Credit Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007895 | Counterparty fails to fulfill its contractual obligations |
| Risk_007920 | An issuer of a security held within the investment and/or liquidity portfolios fails to meet its financial obligation |
| Risk_007928 | An individual or entity fails to meet financial obligations associated with the Firm's loan products |

### Liquidity Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007921 | The Firm is unable to monetize assets and/or does not have sufficient liquidity due to unexpected haircuts, time to monetization, market depth, pledge ability, collateralization, and/or impact to reputation |
| Risk_007922 | The Firm does not have sufficient liquidity due to unexpected client outflows from banking accounts, brokerage accounts, inability to raise new or renew existing wholesale funding when desired and/or intercompany funding activity |
| Risk_007959 | The Firm has a reduction in liquidity due to unexpected increases in margin loans, pledged assets lines, home equity lines of credit, mortgage, and/or other unexpected increases in client activity |

### Market Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_007961 | Schwab's market risk exposure results in adverse change in net interest revenue (NIR) and/or economic value of equity (EVE) from on balance sheet activities |
| Risk_009953 | Schwab's market risk exposure results in adverse change in fee income and/or valuation from off-balance sheet activities |

### Capital Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_008026 | The Firm, inclusive of all legal entities, does not have capital in order to maintain sufficient capital requirements |
| Risk_008027 | Growth in client deposits/balance sheet outpaces any potential growth in capital leading to degradation of capital ratios |

### Product and Service Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_008042 | The Firm delivers products and/or services that are improperly designed to meet Firm and/or regulatory requirements or client needs |
| Risk_008069 | The Firm does not have the required client account information to properly identify, complete due diligence, service, and protect our clients |
| Risk_010746 | A recommendation, investment strategy, service, or account feature is not appropriate for a client or is not delivered or continually assessed |

### Trading Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_008806 | Trades are not executed, aggregated, or allocated in a manner or market that is the most advantageous to the client, or that is fair and equitable across client accounts |
| Risk_008807 | Firm or client trading that deliberately attempts to interfere with the market or to create artificial, false, or misleading appearances with respect to the price of, or market for, a security, commodity, or currency |
| Risk_008817 | Proprietary trading or investing in, sponsoring, or transacting with covered funds is conducted in a manner not in accordance with the Volcker Rule |

### Technology Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_010686 | The Firm is unable to maintain acceptable service levels through severe disruptions to the firm's data, business systems, and/or supporting IT infrastructure |
| Risk_010687 | Insufficient implementation and information resource design limits integrity of networks/systems |
| Risk_017765 | Technology solutions are not developed, deployed, or maintained to provide value delivery |

### Conduct Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_010711 | An incentive compensation plan promotes improper conduct and/or is not administered properly |
| Risk_011029 | All other intentional violations of the Code of Business Conduct and Ethics, the law, regulations, and/or conduct-related policies |
| Risk_011035 | Improper internal use/sharing and/or disclosure of confidential or highly confidential information |
| Risk_011037 | Internal parties conduct activities with the intent to defraud the Firm, clients, or vendors |
| Risk_011039 | Offers or promises for items of value are given/received to improperly influence decisions or behaviors, secure an improper advantage, or avoid a disadvantage |

### Governance Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_012698 | Risk governance practices and program requirements are not designed, built, operated, or maintained to meet risk management objectives and/or regulatory requirements |
| Risk_012700 | Persons of the Firm fail to completely and accurately execute a process |

### Workplace and Discrimination Risk
| Risk ID | Risk Statement |
|---------|----------------|
| Risk_013950 | Workplace discrimination, harassment, or retaliation occurs against a protected class or in violation of company policies |
| Risk_017680 | Improper external sharing and/or disclosure of confidential or highly confidential information |

### Customizing Risk Descriptions

When developing a control, select the most appropriate risk from the inventory above and customize using:

**Template:**
```
[Risk ID] - [What can go wrong] due to [Cause], resulting in [Impact to the business].
```

**Example - Customized from Risk_007589:**
```
Original: Data is lost or degraded during migration, conversion, cleansing, or structuring

Customized: Risk_007589 - Pricing data transferred from Bloomberg to Calypso is incomplete or
inaccurate due to inadequate interface validation checks, resulting in trading decisions based
on incorrect market data.
```
