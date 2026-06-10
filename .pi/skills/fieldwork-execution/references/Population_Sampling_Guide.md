# Population & Sampling Guide

## Complete Population Documentation Framework

### 1. Population Description

Define what constitutes the complete set of items that could be tested.

**Example**:
"The population consists of all [item type] processed by [system] during the audit period from [start date] to [end date]."

### 2. Information Source & Parameters Applied

Document where the population data came from and any filters applied.

**Example**:
"IAD obtained the population from [system/report] by [method]. The following parameters were applied: [list filters, date ranges, status criteria, etc.]."

### 3. Annualized Population Size & Evaluation Period

State the total count and time period covered.

**Example**:
"The annualized population consists of [X] items for the period [MM/DD/YYYY] to [MM/DD/YYYY]."

### 4. Accuracy & Completeness Validation

Explain how population completeness and accuracy were verified.

**Example**:
"IAD validated population accuracy by [cross-referencing to source data / reconciling totals / confirming no filters excluded relevant items]. IAD confirmed through inquiry with [Name, Title] that no exclusionary filters were applied during the export (Exhibit X, TM Y)."

### 5. Homogeneous Population Assessment

Document whether the population is treated consistently.

**Example - Homogeneous**:
"The population is homogeneous as [control/process] is performed in the same manner for all items using [same system, same logic, same configuration]."

**Example - Not Homogeneous**:
"The population is not homogeneous as [different product types / different geographic regions / different processing logic] result in variations in how [control/process] operates."

---

## Sample Approach & Method

### Sample Approach Options

**Full Sample**: Testing 100% of the population
**Sample of One**: Testing one representative item (requires homogeneous population)
**Statistical Sample**: Random selection with statistical confidence
**Judgmental Sample**: Non-random selection based on auditor judgment

### Sample Method Options

**Judgmental**: Auditor selects specific items based on risk, materiality, or other criteria
**Haphazard**: Auditor selects items without conscious bias but not statistically random
**Random**: Statistically random selection using random number generator

---

## Test of One Methodology

### When Test of One is Appropriate

1. **Homogeneous Control Design**: Control operates identically for all items
2. **Configuration-Based**: Control relies on system configuration that applies uniformly
3. **Code-Based**: Control implemented in code that executes consistently
4. **Single Last Modified Date**: Configuration/code unchanged during audit period
5. **Annual Controls**: Control executes only once during audit period

### Standard Language Patterns

**Pattern 1 - Single Configuration/Code**:
```
In accordance with IAD sampling methodology, as the [control/workflow] is a single, unique [configuration/code implementation], the population for design testing is one. IAD selected the [configuration/code] as a test of one, with test procedures limited to validating [specific aspects].
```

**Pattern 2 - Homogeneous Processing**:
```
Per corroboration with [Name, Title], IAD was informed that [system/process description]. Therefore, the population consists of [one configuration / one workflow / one code implementation]. Based on the IAD methodology for a design evaluation test of one, and given that there is only 1 [item] in the population, IAD selected the [item] for testing.
```

**Pattern 3 - Annual Execution**:
```
IAD selected the single annual instance of the [process name] during the audit period, as the [control] executes once per year as part of [annual process]. The integrated procedures were limited to validating [specific scope].
```

### Point-in-Time Testing Language

**Option 1 - Most Concise**:
```
Test of Design Sample: Test of Design is a walkthrough of one sample, including processing alternatives for automation. The test of design for the data integrity checks is based on [configuration settings/code inspection], and in conjunction with the last modified date of [MM/DD/YYYY], the point-in-time test of design is representative of the checks enforced throughout the full audit period, thereby providing operating effectiveness coverage. See MyGRC workpaper for Test of Design population and sampling details.
```

**Option 2 - With Audit Period Reference**:
```
Test of Design Sample: Test of Design is a walkthrough of one sample, including processing alternatives for automation. The test of design for the data integrity checks enforced is based on [configuration settings/code inspection]. Given the last modified date of [MM/DD/YYYY] and the continuous nature of the control, the point-in-time test of design test is representative of the data integrity checks enforced throughout the full audit period of [MM/DD/YYYY] to [MM/DD/YYYY], thereby providing operating effectiveness coverage. See MyGRC workpaper for Test of Design population and sampling details.
```

---

## Homogeneous Grouping for Large Populations

### When Homogeneous Grouping is Appropriate

Use homogeneous grouping when:
- Large population (50+ items) with potential variations
- Underlying processing logic is the same within subgroups
- Items differ only by static data parameters (not logic)
- Multiple configurations using the same calculation engine
- Different product types processed through identical validation logic

### Grouping Strategy

**Step 1: Identify Grouping Criteria**
Determine which fields or characteristics define homogeneity:
- Calculation engine or processing logic
- Event types or transaction categories
- Product types or instrument classes
- System module or component

**Step 2: Concatenate Key Fields**
Create unique combinations by concatenating distinguishing fields to map distinct processing scenarios.

**Step 3: Validate Homogeneity Within Groups**
Confirm that items within each group:
- Use identical calculation/validation logic
- Vary only by static data parameters
- Are processed through the same system pathway

**Step 4: Apply Test of One Per Group**
Select one representative item from each homogeneous group for detailed testing.

### Standard Documentation Pattern

```
To establish an efficient testing strategy, IAD analyzed the [X] [configurations/items] by 
concatenating [key fields - e.g., three key fields (Event Type, Product Type, and Pricing 
Measure)] to map distinct processing scenarios. IAD grouped these scenarios into [Y] 
homogeneous [calculation/processing] categories based on the underlying [logic type - e.g., 
calculation engine logic].

IAD determined that [configurations/items] within each category utilize identical 
[logic type], varying only by [variable elements - e.g., product-specific static data such 
as day count conventions or payment frequencies]. Based on this homogeneity, IAD applied a 
"Test of One" sampling approach, selecting one representative [configuration/item] from 
each active category for detailed [testing type - e.g., reperformance testing].
```

**Example - Calypso Pricing Measures:**
```
To establish an efficient testing strategy, IAD analyzed the 134 configurations by 
concatenating three key fields (Event Type, Product Type, and Pricing Measure) to map 
distinct processing scenarios. IAD grouped these scenarios into 25 homogeneous calculation 
categories based on the underlying calculation engine logic.

IAD determined that configurations within each category utilize identical calculation 
engines, varying only by product-specific static data such as day count conventions or 
payment frequencies. Based on this homogeneity, IAD applied a "Test of One" sampling 
approach, selecting one representative configuration from each active category for 
detailed reperformance testing.
```

### Exclusions Documentation

**When excluding items from population:**
```
[Configurations/Items] confirmed by management as not applicable to Schwab's operations were 
excluded from testing, including [list excluded items]. The rationale for these exclusions 
is documented in [exhibit reference].
```

---

## Sampling Description Requirements

### For Design Testing

Document the rationale for the design sample selection.

**Example - Test of One**:
```
For the test of design, IAD selected a sample of one [workflow/configuration/code]. The [item] represents the entire population of this [control type]'s design. This "test of one" approach is appropriate because the [design element]'s configuration, input parameters, and validation logic are applied consistently each time the control is executed, making the control design homogeneous.
```

**Example - Multiple Workflows**:
```
The population consists of [X] workflows across [Y] business processes. IAD selected [#] workflows using judgmental sampling based on [materiality, complexity, risk assessment], providing coverage of [%] of transaction volume.
```

### For Operating Effectiveness Testing

Document the sample size and selection method for operating effectiveness testing.

**Example - Statistical Sample**:
```
IAD selected a statistical sample of [#] items from a population of [X] using random sampling methodology. This sample size provides [%] confidence with [%] precision based on [expected error rate assumptions].
```

**Example - Full Sample (Small Population)**:
```
IAD identified a population of [X] items with [elevated privilege / administrative access / high dollar value]. Given the small population size and [high-risk nature / materiality], IAD selected 100% of the population for testing to validate [testing objective].
```

**Example - Judgmental Sample**:
```
IAD selected a judgmental sample of [#] items from a population of [X], focusing on [high-dollar transactions / complex scenarios / new implementations] to validate [control objective]. This sample represents [%] of population volume and [%] of dollar value.
```

---

## Cross-Reference Patterns

### For Integrated Testing
```
IAD Note: For full coverage over the completeness and accuracy of the interface process, refer to test procedures performed by the Data Analytics team within [Control Name] in MyGRC.
```

### For Manual Components
```
For testing over the downstream manual review and approval of [output] generated by this [workflow/script], refer to [Control Name].
```

### For Input/Output Testing
```
For testing over the accuracy and reconciliation of [input source] data, refer to [Control Name]. For testing over the [downstream process], refer to [Control Name].
```

---

## Common Scenarios & Standard Language

### Scenario 1: Single Alteryx Workflow
```
Per corroboration with [Name, Title], IAD was informed that the [Team] utilizes the [Workflow Name] Alteryx workflow as a [purpose]. Therefore, the population consists of one workflow. In accordance with IAD sampling methodology, as [Workflow Name] is a single, unique Alteryx workflow executed [frequency], the population for design testing is one. IAD selected the one workflow as a sample of one, with test procedures limited to validating the workflow's configuration and automated logic.
```

### Scenario 2: Annual Model Execution
```
IAD selected the single annual instance of the [Model Name] during the audit period, as the model executes once per year as part of [annual process]. The integrated procedures were limited to validating [specific scope such as: model configuration, input validation, calculation logic].
```

### Scenario 3: Access Testing - Full Sample
```
IAD identified a population of [#] users with [access type] based on the [report name]. Given the small population size and the high-risk nature of [access type] that could enable [risk description], IAD selected 100% of the population for testing to validate [objective].
```

### Scenario 4: Configuration Testing - Test of One
```
The test of design for the [automated checks/configuration] is based on [configuration inspection/code review]. IAD validated that the [configuration/code] was last modified on [MM/DD/YYYY], which [precedes/falls within] the audit period of [MM/DD/YYYY] to [MM/DD/YYYY]. Since the [configuration/code] remained unchanged throughout the audit period and the control operates continuously, the point-in-time test of design is representative of the [controls/checks] enforced throughout the full audit period, thereby providing operating effectiveness coverage.
```

### Scenario 5: Large Population with Homogeneous Groups
```
The population consists of [X] [configurations/transactions] across [Y] [categories/product types]. IAD analyzed the population and identified [Z] homogeneous groups based on [grouping criteria]. IAD selected one representative item from each group using the "Test of One" approach, providing comprehensive coverage across all [processing logic/calculation types] while maintaining testing efficiency.
```

### Scenario 6: Haphazard Selection
```
IAD observed [Name] haphazardly select the [item/sample] from [population] for testing. The haphazard selection approach is appropriate as the population is homogeneous and no specific risk factors warranted targeted selection.
```

---

## TOE 8-Question Framework for Automated Application Controls

### When This Framework Applies

When QA oversight or governance requirements mandate structured TOE documentation — even for automated application controls — use this 8-question format. For fully automated controls, most questions will be answered N/A, but the N/A answers must be substantive: they should explain the rationale, not simply say "not applicable." The goal is to demonstrate that you considered the question and have a defensible reason why traditional population-based OE testing doesn't apply.

Think of these questions as a structured narrative of your sampling and operating effectiveness logic. For automated controls, the key assertion is: the control operates homogeneously and continuously based on application configuration; therefore, the design test (point-in-time configuration inspection + reperformance of in-scope scenarios) is representative of operation throughout the period.

---

### Question 1: Population Description

For a true population-based control, describe all items that could be tested. For automated application controls, explain why a discrete population isn't the applicable basis for evaluation.

**When N/A (automated controls):**
```
N/A — This is an automated application control in which [System] enforces [control logic —
e.g., segregation-of-duties restrictions, dollar-based authorization limits] systematically
across all [transaction type] based on configured [role-based privilege restrictions /
application logic]. IAD validated operating effectiveness through configuration inspection
and reperformance of in-scope [scenarios / approval cases], rather than through a recurring
population of manually performed review items. As such, a discrete transaction population
is not the applicable basis for TOE evaluation.
```

**When applicable (ITDM or recurring manual component):**
```
The population consists of all [items] processed by [System] during the evaluation period
of [MM/DD/YYYY] to [MM/DD/YYYY].
```

---

### Question 2: Information Source and Parameters Applied

Document where configuration evidence was obtained and what filters or parameters were applied.

**Standard language:**
```
IAD obtained [System] configuration evidence for the evaluation period of [start] through
[end], including [list specific reports/evidence — e.g., Role Permissions and Privilege
Restrictions reports, Corporate Disbursement Policy, User Roles reports, last-modified-date
records for in-scope configurations]. Supporting transaction-level evidence was obtained for
the haphazardly selected [positive / negative] test scenarios ([transaction IDs]).
```

---

### Question 3: Annualized Population Size and Evaluation Period

State the count of items tested and the period. For automated controls, explain why an annualized count isn't the basis for sample sizing.

**When N/A (automated controls):**
```
N/A — This is an automated application control evaluated through [System] configuration
inspection and reperformance of in-scope [scenarios / test cases] for the evaluation period
of [start] through [end]. Because the control logic is configuration-based and applied
homogeneously across all [transaction types], an annualized transaction count is not the
basis for sample sizing; the configuration itself represents the full population of one.
```

---

### Question 4: Accuracy and Completeness

Explain how you validated that the evidence obtained is accurate and complete — i.e., that no relevant items were excluded and the reports reflect production configuration.

**When N/A with justification (automated controls):**
```
N/A — This is an automated application control. IAD validated the accuracy of configuration
evidence by inspecting system-generated [report names] directly within [System] and confirming
with [Contact, Title] that the reports reflect the current production configuration without
exclusionary filters (refer to [Exhibit reference] for filter documentation).
```

---

### Question 5: Homogeneous Population

Document whether the control logic is applied consistently across the population.

**Homogeneous automated control:**
```
The control logic is homogeneous. [System] applies the same configured [control mechanism —
e.g., approval-routing logic, self-approval restriction, dollar-limit enforcement]
consistently across all [transaction type], with differences driven by [user access group /
configured role-based privilege restrictions] rather than different manual processing logic.
Accordingly, [one / a sample of one per in-scope scenario] is representative of the full
population of [System] [transactions] subject to this control.
```

---

### Question 6: Test of Effectiveness Summary

Summarize what was tested and the testing approach. This should parallel the attribute-by-attribute conclusions from the workpaper.

```
IAD validated [list scenarios tested — e.g., one positive [transaction type] scenario,
one [negative condition 1] scenario, one [negative condition 2] scenario], and inspected
the related [System] [authorization configuration / template field restrictions / change
management documentation / privileged-access evidence] to determine whether [System]
operated as designed throughout the evaluation period. Point-in-time configuration
inspection, combined with last-modified-date review, confirmed the underlying [control logic]
remained unchanged during the audit period. [Note any outstanding attributes here — e.g.,
Attribute H is outstanding and the overall conclusion will be updated upon completion.]
```

---

### Question 7: Operating Effectiveness Conclusion

State the conclusion for the period. If any attributes are outstanding, note the interim conclusion.

**Full conclusion:**
```
Based on testing performed, IAD determined that the control is operating effectively for
Attributes [A through X]. No exceptions noted.
```

**Interim (outstanding attributes):**
```
Based on testing performed to date, IAD determined that the control is operating effectively
for Attributes [A through X]. No exceptions noted. Conclusion to be updated upon completion
of [Attribute Y] testing.
```

---

### Question 8: Test of Effectiveness Sample Approach

Explain the sample approach and why it provides operating effectiveness coverage. For automated controls, explain why the design test is representative of operating effectiveness across the period.

**Standard N/A with reasoning (automated controls):**
```
N/A — In accordance with IAD methodology for automated application controls, IAD applied a
sample-of-one approach per in-scope automated scenario, as [System] applies homogeneous,
configuration-based [control type] logic across the population of [transactions]. The test
of design for the [System] [control mechanism] is based on the [role-based privilege
restriction configuration / application logic] and last-modified-date inspection; given the
continuous nature of the control and the unchanged configuration throughout the audit period,
the point-in-time test of design is representative of the [controls] enforced throughout the
full evaluation period of [start] through [end], thereby providing operating effectiveness
coverage.
```

---

### Putting It Together: N/A Discipline

When writing N/A answers, follow this discipline:
- **Always name the system** — never write "the application"
- **Always state the control type** — "automated application control" vs. "configuration-based control"
- **Always explain the rationale** — not just "N/A" but why the traditional question doesn't apply
- **Always point to the alternative evidence** — configuration inspection, reperformance, last-modified-date review
- **Avoid copy-paste across all eight questions** — each answer should feel tailored to what that question is actually asking

---

## Issue Validation Population and Sampling

### When This Section Applies

Issue validations assess a single, non-recurring remediation effort (an action plan) rather than a recurring control. The population is a discrete, bounded set of evidence artifacts rather than a transaction-based population. Traditional population-based sampling concepts (annualized population size, stratification, statistical sampling) generally do not apply, but each question still requires a substantive response explaining why.

The distinguishing characteristic of issue validation population documentation is that answers must be grounded with named sources and specific evidence references. Abstract or formulaic descriptions are insufficient. Each answer should demonstrate that IAD identified, obtained, and validated the completeness of a specific evidence set.

---

### Grounding Principle

Every population and sampling answer should begin with or reference a specific named source:

- "Per discussion with [Name, Title]..." for information obtained through inquiry
- "Per inspection of [specific document or system]..." for information obtained through inspection
- "[Name, Title] provided Evidences [X through Y] on [date]..." for documenting evidence receipt

This grounding connects the documentation to the specific people and artifacts that support the conclusion, rather than stating conclusions abstractly.

---

### Population Description (Issue Validation)

Enumerate each evidence artifact by number, description, and evidence reference. Open with the inquiry source that established the population scope.

```
Per discussion with [Name, Title] and [Name, Title], IAD was informed that [ActionPlan_ID]
required [team] to [action plan description]. The population consists of the complete set
of remediation deliverables produced under [ActionPlan_ID], including: (1) [description]
(Evidence 1), (2) [description] (Evidence 2), ... (N) [description] (Evidence N).
```

### Information Source and Parameters Applied (Issue Validation)

Document who provided what and when. Name each evidence provider separately with their title and the specific artifacts they provided.

```
The information source used to obtain the evidence population was direct transfer from
[Name, Title] and [Name, Title]. [Name] provided Evidences [X through Y] on [date],
consisting of [list items]. [Name] provided Evidence [Z] on [date], consisting of
[specific item]. The parameters applied were all evidence artifacts associated with
[ActionPlan_ID] (due date [date]). [If the evaluation window extends beyond the due
date, explain why, e.g., "The evaluation window extends through [date] to capture
Evidence [N], which postdates the action plan due date but is required to demonstrate
that [arrangement/mechanism] is in place."] No exclusionary filters were applied.
```

### Annualized Population Size and Evaluation Period (Issue Validation)

```
N/A. [ActionPlan_ID] is a single, non-recurring remediation event rather than a recurring
control execution. The population is not annualized; it consists of one action plan with
[N] discrete evidence artifacts produced during the remediation activity window. The
evaluation period spans the remediation activity window through [end date].
```

### Accuracy and Completeness (Issue Validation)

Cross-reference the evidence set against the action plan requirements and governing standards to demonstrate coverage. Name the specific people who confirmed completeness and the dates of confirmation.

```
Through corroborative inquiry with [Name, Title], [Name, Title], and [Name, Title] on
[dates], IAD validated that the evidence population was complete and accurate. Management
confirmed that all artifacts produced in connection with the remediation were provided to
IAD and that no additional deliverables or correspondence existed beyond the [N] evidence
artifacts received. IAD cross-referenced the evidence set against the action plan
requirements and the [governing standard's] obligations, confirming coverage of [list
specific coverage areas, e.g., "the IRSQ disclosure requirement (Evidence 2), the
contractual basis for record return or destruction (Evidence 3), the RRS alignment
(Evidences 4 and 5), and the annual purge confirmation mechanism (Evidence 6)"]. No items
were excluded from the population.
```

### Homogeneous Population (Issue Validation)

```
The population is one. [ActionPlan_ID] represents a single, non-recurring remediation
event producing one set of deliverables. As such, the population is homogeneous.
```

### Sample Approach, Method, and Description (Issue Validation)

```
Sample Approach: Sample of One
Sample Method: Non-statistical
Sample Description: Based on a population of one action plan ([ActionPlan_ID]) mitigating
a [risk level] level of inherent risk, the single occurrence of the remediation was
selected for effectiveness testing. The remediation produces a discrete, fixed set of [N]
evidence artifacts rather than a recurring population of control executions: [enumerate
what the evidence set contains, e.g., "one set of governing standards (Evidence 1), one
vendor engagement record and IRSQ (Evidence 2), one Master Services Agreement (Evidence 3),
one vendor retention summary (Evidence 4), one RRS update request and confirmation
(Evidence 5), and one purge confirmation arrangement (Evidence 6)"]. This bounded
population does not permit or require sampling reduction. IAD validated the completeness
of the remediation through full inspection of all [N] evidence artifacts.
```

---
