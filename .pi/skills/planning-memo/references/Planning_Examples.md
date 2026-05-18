# Planning Memo Examples

Real-world examples demonstrating planning memo patterns for different audit scopes.

---

## Example 1: Investment Portfolio Management (Full IT Scope)

**RCM Context:**
- Applications: Calypso, Bloomberg, Alteryx, Thunderbird ODS
- IT Controls: 8 automated controls (pricing models, interfaces, reconciliation workflows)
- DA Controls: 3 reperformance controls

### Applications Section (Excerpt)

```
Application Name: Calypso
APM ID: AD00102859
ORR: 4 = Very High
SAL: 4 = Very High
Information Classification: Highly Confidential
Application Owner: Treasury Capital Markets, SVP; Enterprise Technology Services, Director

Description: Calypso is the primary trading and portfolio management system for Treasury Capital Markets, providing trade capture, pricing model execution, interest accrual calculations, position reporting, and risk analytics for the investment portfolio.

Scope Rationale and Audit Scope: Calypso is the system of record for investment positions and portfolio valuation. IAD's approach includes:
• Automated Calculations: IAD will evaluate pricing model configurations, interest accrual logic, and amortization calculations
• Interfaces: IAD will evaluate data integrity between Calypso and upstream pricing sources
• Key Reports: IAD will evaluate completeness and accuracy of position reports and valuation outputs

Audit subprocess: • Valuation of Investment Positions • Data Governance
```

### Integrated Audit Approach

```
The IT integrated audit team will assess the configuration and effectiveness of automated controls within Calypso, Bloomberg interfaces, and Alteryx workflows that support investment portfolio valuation and settlement processes. In Calypso, the team will validate pricing model configurations for derivatives pricing, interest accrual calculations, and amortization logic through configuration inspection and reperformance testing. For the interfaces from ICE, Bloomberg, and Intex to Calypso, testing will validate data integrity checks including completeness validations, accuracy checks against benchmark data, and error handling mechanisms for invalid or missing data. The team will inspect Alteryx workflow configurations for holdings reconciliation, stale price identification, and quote monitoring to validate data transformation logic, exception identification thresholds, and automated alerting mechanisms. For all critical configurations tested, the integrated team will review change management procedures and access controls to validate that modifications are appropriately documented, tested, and restricted to authorized personnel.
```

### Data Analytics Approach

```
The Data Analytics (DA) team will validate the completeness and accuracy of data transferred from Thunderbird ODS to the hedge relationship daily monitoring spreadsheet, including confirmation that source connections reference production environments. DA will independently reperform the holdings reconciliation logic executed in the Alteryx workflow to validate that discrepancies exceeding $5 threshold are properly identified and flagged for management review. Additionally, DA will reperform stale price identification logic to confirm that quotes exceeding age thresholds or deviating from benchmark prices are accurately detected and reported for manual pricing review.
```

---

## Example 2: Compensation Program (Limited IT Scope)

**RCM Context:**
- Applications: Workday, EquiView, Branch Incentive Tracking System
- IT Controls: 1 automated reminder control in Workday only
- DA Controls: Multiple reperformance and reconciliation controls

### Applications Section (Opening)

```
IAD confirmed 3 applications are in scope for the Compensation Program audit. While all three applications support critical compensation processes, IAD took a risk-based approach to determine integrated testing scope. Integrated IT testing will be limited to Workday for one automated control component, while the core audit team will test manual and semi-automated business controls across all applications.
```

### Integrated Audit Approach

```
The IT integrated audit team will assess the automated reminder functionality within Workday that supports timely completion of plan participant agreements. The team will inspect the system configuration that triggers weekly email reminders to employees who have not yet signed required plan participant agreements, validating that reminder criteria appropriately identify outstanding agreements and that automated emails are sent on the scheduled frequency. Testing will include positive and negative scenarios to confirm the reminder logic operates as designed and that access to modify the reminder configuration is appropriately restricted.
```

**Key Pattern:** When IT scope is limited, the Integrated Audit Approach is shorter and focused. Explicitly state scope limitations in Applications Section opening.

---

## Example 3: Third-Party Management Lifecycle (Multi-Application)

**RCM Context:**
- Applications: SAP Ariba, Alteryx
- IT Controls: 4 workflow controls in Ariba, 1 workflow control in Alteryx
- DA Controls: None

### Integrated Audit Approach

```
The IT integrated audit team will assess the configuration and effectiveness of key automated controls within SAP Ariba and Alteryx that support the Third-Party Lifecycle processes. In SAP Ariba, the team will inspect system configurations to validate that Agreement Risk Form routing logic generates and routes forms based on specific Engagement Risk Project data field values, confirming that mandatory fields cannot be bypassed through positive and negative testing procedures. Additionally, the team will validate the back-end Inherent Risk Rating calculation configuration to confirm that mapping calculations accurately derive risk ratings from IRSQ response mappings. Testing will also verify that automated control assessments initiate based on predefined risk thresholds, with Engagement Control Mapping rules properly routing assessments when responses meet specified risk levels. The team will validate that secure encryption algorithms align with STS Cryptography and Key Management Standards for application data protection. For Alteryx, the integrated team will validate that the non-compliance reporting workflow is registered as an End User Computing application with appropriate governance documentation and includes systematic data validation checks to identify and handle incomplete or invalid data inputs through positive and negative testing procedures. Audit procedures will include inspecting system configurations, reviewing access controls to validate that modifications to automated controls require appropriate authorization, and testing change management processes related to these configurations.
```

**Key Pattern:** Multi-application scope requires transitions between systems ("In SAP Ariba... For Alteryx...") while maintaining single-paragraph structure.

---

## Pattern Summary

| Scenario | Integrated Approach Length | Key Characteristics |
|----------|---------------------------|---------------------|
| Full IT Scope | 5-7 sentences | Multiple applications, interfaces, comprehensive |
| Limited IT Scope | 3-4 sentences | Single control/application focus, scope statement |
| Multi-Application | 6-8 sentences | Clear transitions between systems |

---

**Version:** 4.0 | **Updated:** January 2026
