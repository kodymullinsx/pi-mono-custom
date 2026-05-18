# Issue Drafting Guide — Detailed Reference

This reference provides expanded examples, risk matrix guidance, and supplementary documentation for the issue drafting skill.

## Table of Contents
1. [Risk Matrix — Magnitude of Impact](#magnitude-of-impact)
2. [Risk Matrix — Likelihood](#likelihood)
3. [Extended Issue Examples](#extended-issue-examples)
4. [Issue Description Variations](#issue-description-variations)
5. [Issue Name Variations](#issue-name-variations)
6. [Risk Rating Rationale Variations](#risk-rating-rationale-variations)
7. [Supplementary Documentation](#supplementary-documentation)

---

## Magnitude of Impact

Use these thresholds to justify the impact component of the risk rating rationale.

| Rating | Financial Loss | Operational/Technology | Compliance | Info Security/Privacy | Reputational | Strategic |
|--------|---------------|----------------------|------------|----------------------|--------------|-----------|
| Very High | >$50M | Major degradation; >120 min disruption; >25% customer impact | Major regulatory focus/scrutiny; major penalty/corrective action | >800K records; >100K notifications | Major negative media; major customer satisfaction decrease | Major adverse impact on corporate strategic initiatives |
| High | >$5M-$50M | Significant degradation; >60 min disruption; >5-25% customer impact | Significant regulatory focus; significant penalty/corrective action | >40K-800K records; >5K-100K notifications | Significant negative media; significant satisfaction decrease | Significant adverse impact on corporate strategic initiatives |
| Medium | >$500K-$5M | Moderate degradation; >25 min disruption; >1-5% customer impact | Moderate regulatory focus; moderate penalty/corrective action | >4K-40K records; >500-5K notifications | Moderate negative media; moderate satisfaction decrease | Moderate adverse impact on corporate strategic initiatives |
| Low | >$50K-$500K | Minor degradation; >5 min disruption; >0.5-1% customer impact | Minor regulatory focus; minor penalty/corrective action | >2K-4K records; >200-500 notifications | Minor negative media; minor satisfaction decrease | Minor adverse impact on corporate strategic initiatives |

## Likelihood

Likelihood is assessed across two dimensions: **Volume** and **Complexity**.

### Volume

| Rating | Description |
|--------|-------------|
| Very High | Major volume of assets, accounts, customers, systems, balances, trades, and/or transactions requiring major sub-processes, technology, and/or human resources |
| High | Significant volume requiring significant sub-processes, technology, and/or human resources |
| Medium | Moderate volume requiring moderate sub-processes, technology, and/or human resources |
| Low | Minor volume of assets, accounts, customers, systems, balances, trades, and/or transactions |

### Complexity

| Rating | Factors |
|--------|---------|
| Very High | Large number of highly complex laws/regulations/policies; highly complex products/services/delivery channels; primary corporate strategic initiatives; ongoing extensive training/licensing requirements; external conditions with very material effect |
| High | Significant number of highly complex laws/regulations/policies; significant number of highly complex products/services; secondary corporate strategic initiatives; annual training/licensing requirements; material external conditions |
| Medium | Some moderately complex laws/regulations/policies; simple products/services; lower priority corporate/primary business entity initiatives; one-time training/licensing; moderate external conditions |
| Low | No applicable laws/regulations requiring standards/policies; no more than one simple product/service; secondary business entity initiatives; one-time training only; no relevant external conditions |

---

## Extended Issue Examples

### Example: Insufficient Error Handling (Interface Control)

**Issue Name:**
The error handling and monitoring processes for the MyGRC to Migraph data interface are not adequate to detect, investigate, and resolve data transfer issues that could affect model risk metrics reporting.

**Issue Rating:** Medium

**Issue Description:**
The Model Risk Oversight (MRO) team's data interface between MyGRC and Migraph does not adequately address how errors are tracked, investigated, and resolved, despite transferring model-related issue data into monthly risk metrics reports for the Model Governance Subcommittee (MGS). The Windows Task Scheduler job lacks error notification configurations, error logs are retained for only 30 days, and there is no formal process for the systematic review and remediation of errors logged within Migraph. These deficiencies are compounded by the absence of downstream compensating controls, such as data reconciliations. The Migraph application is used by MRO to manage model risk governance activities, including reporting to oversight committees. Enterprise standards require that data interfaces incorporate error handling processes sufficient to detect, notify, and resolve data transfer failures in a timely manner.

**Root Cause:**
The error handling and monitoring processes were not fully developed or integrated when the MyGRC to Migraph interface was implemented, and were not re-evaluated as the criticality of the data transfer increased.

**Root Cause Taxonomy:** Policy, Standard, or Procedure Existence

**Risk:**
Inadequate error handling and monitoring may result in undetected data transfer issues between MyGRC and Migraph, leading to incomplete or inaccurate issue management data used for monthly model risk metrics reporting. Inaccurate data could lead to oversight committees being unaware of significant model risks, policy violations, or overdue remediation activities, impairing their ability to make informed decisions.

**Risk Rating Rationale:**
The impact is considered Medium as inaccurate model risk metrics could lead to under-reporting of the firm's cumulative model risk exposure, potentially masking risk metric breaches and resulting in regulatory scrutiny; however, the interface does not contain Non-Public Information and supports internal reporting functions. The likelihood is assessed as Low, given that the interface runs daily and the data is primarily leveraged during month-end reporting which undergoes reasonableness checks prior to use. A Medium impact and Low likelihood result in an overall risk rating of Medium.

**Recommendation:**
Management must either establish a formal error handling and monitoring process for the MyGRC to Migraph data interface, including error detection, notification, and resolution procedures; or implement downstream reconciliation controls to detect and resolve discrepancies between MyGRC and Migraph data before monthly reporting deadlines.

---

### Example: Unregistered EUC (Governance Gap)

**Issue Name:**
The Daily Hedge Relationship Monitoring spreadsheet used by Treasury Capital Markets (TCM) has not been assessed or registered as an End-User Computing (EUC) solution under the Business-Led Development (BLD) Standard.

**Issue Rating:** Low

**Issue Description:**
TCM's Daily Hedge Relationship Monitoring spreadsheet has not been assessed against BLD applicability criteria or registered as an EUC, despite leveraging automated Power Query workflows that execute SQL queries against the Thunderbird production database, a macro that programmatically generates the archived control file, and a multi-step daily process spanning data refresh, exception detection, dual sign-off, and network archival. The spreadsheet is used by TCM to evaluate the effectiveness of cashflow hedges daily, serving as both the primary analytical tool and the system of record for historical control evidence. The BLD Standard requires that EUC solutions developed outside of Schwab Technology Services (STS) that meet applicable criteria, including automated workflows, scripts, and macros, be registered in the Application Portfolio Management (APM) tool, submitted through Solution Hub for BLD Level determination, and incorporated into the relevant Risk and Control Self-Assessment (RCSA).

**Root Cause:**
Management was not aware that the monitoring spreadsheet's technical characteristics met the BLD Standard's applicable criteria for EUC registration.

**Root Cause Taxonomy:** Policy or Standard Non-Adherence

**Risk:**
Without formal registration and BLD Level assessment, the monitoring spreadsheet is not subject to the governance controls required by the BLD Standard, including semi-annual registration reviews, change management oversight, and RCSA risk coverage. Undetected modifications to embedded queries or macro behavior could affect the integrity of control evidence without triggering governance review.

**Risk Rating Rationale:**
The impact is considered Low, as the finding represents a governance gap with minor compliance implications limited to internal standard non-adherence, no direct financial loss exposure, and no information security risk given that the spreadsheet processes Internal-classified data without Non-Public Information. The likelihood is considered Medium, as the process involves a moderate volume of hedge relationships and some moderately complex regulatory considerations (hedge accounting standards, ASC 815); however, the BLD governance gap itself is narrow in scope and limited to a single unregistered solution. A Low impact and Medium likelihood result in an overall issue rating of Low.

**Recommendation:**
Management must assess the Daily Hedge Relationship Monitoring spreadsheet against the BLD Standard's applicable criteria and, if confirmed as an EUC, complete the required registration in the APM tool, submit the solution through Solution Hub for BLD Level determination, and incorporate the associated risks and controls within the relevant RCSA.

---

## Issue Description Variations

When drafting issue descriptions, the same finding can be framed with different emphasis depending on the audience and context. The condition-first structure remains constant, but the level of technical detail varies.

### Technical Emphasis (for IT-integrated findings)
Weave specific system names, query types, macro behavior, and data flow details into the condition statement. This approach is appropriate when the technical characteristics are central to why the issue exists.

### Process Emphasis (for business process findings)
Focus on the process steps, roles, and governance expectations in the condition statement. Technical details are secondary and mentioned only if they clarify the gap.

### Compliance Emphasis (for regulatory or standards findings)
The condition statement emphasizes specific non-adherence with provisions. The criteria section references the standard requirement and section.

---

## Issue Name Variations

The issue name must be a single sentence that functions as an executive summary. Different approaches can emphasize different aspects of the same finding while remaining self-contained:

### Direct Condition
> TCM's Daily Hedge Relationship Monitoring spreadsheet has not been assessed or registered as an EUC under the BLD Standard.

### Scope-Emphasis
> An unregistered spreadsheet supporting daily hedge effectiveness monitoring operates outside BLD governance despite leveraging automated workflows, embedded SQL queries, and macros that meet EUC applicable criteria.

### Requirement-Emphasis
> TCM's Daily Hedge Relationship Monitoring spreadsheet has not been registered in the APM tool as required by the BLD Standard, despite exhibiting multiple applicable EUC characteristics.

### Control-Anchored
> The spreadsheet serving as the system of record for daily hedge relationship monitoring has not been assessed against BLD applicable criteria or registered as an EUC.

### Adequacy-Framed
> Governance over the Daily Hedge Relationship Monitoring spreadsheet is not adequate, as the solution has not been identified or registered as an EUC under the BLD Standard despite meeting multiple applicable criteria.

---

## Risk Rating Rationale Variations

The same issue can have different rationale emphasis depending on which impact factor is most relevant. Each variation must use a single, definitive rating for both impact and likelihood.

### Compliance-Focused
> The impact is considered [rating], as the non-registration represents [severity] non-adherence with [standard] with no direct regulatory exposure, no client-facing impact, and no involvement of Non-Public Information. The likelihood is considered [rating], as the process involves [volume descriptor] and [complexity descriptor]. A [impact rating] impact and [likelihood rating] likelihood result in an overall issue rating of [rating].

### Operational/Technology-Focused
> The impact is considered [rating], as the governance gap poses [severity] operational risk to [process]; the underlying control continues to operate [frequency], and no degradation to critical systems or customer-facing capabilities would result. The likelihood is considered [rating], as the process involves [volume descriptor] and [complexity descriptor]. A [impact rating] impact and [likelihood rating] likelihood result in an overall issue rating of [rating].

### Balanced Multi-Factor
> The impact is considered [rating], as the finding represents a governance gap with [severity] compliance implications limited to [scope], no direct financial loss exposure, and no information security risk given [data classification details]. The likelihood is considered [rating], as the process involves [volume descriptor] and [complexity descriptor]. A [impact rating] impact and [likelihood rating] likelihood result in an overall issue rating of [rating].

---

## Supplementary Documentation

### Management Action Plans

In response to the IAD Recommendation, management creates a detailed action plan outlining specific tasks, owners, and timelines to remediate the issue. The action plan is management's commitment to fixing the problem — IAD does not prescribe the implementation approach.

### IAD Validation Test Steps

To validate that the action plan has been effectively completed, IAD develops specific test steps. These should cover:

- **Attribute A:** Inspect newly established procedures or registrations to confirm they address the root cause.
- **Attribute B:** Obtain and review evidence demonstrating the remediation has been implemented and is functioning.
- **Attribute C:** Validate any new controls by reperforming or inspecting a sample to confirm effectiveness.

**Example Test Steps (Unregistered EUC):**
- Attribute A: Inspect the APM tool to confirm the spreadsheet has been registered as an EUC and a BLD Level has been assigned.
- Attribute B: Obtain and review the Solution Hub submission to confirm BLD risks and controls have been identified and the solution has been incorporated into the relevant RCSA.
- Attribute C: Validate that the semi-annual EUC registration review process includes the monitoring spreadsheet in its review scope.
