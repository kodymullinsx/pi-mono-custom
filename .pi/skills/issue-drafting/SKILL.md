---
name: issue-drafting
description: "Structured guidance for drafting internal audit issues following IAD documentation standards. Use when drafting audit issues, writing issue descriptions, developing risk rating rationales, formulating root causes, writing recommendations, or refining an audit issue. Also trigger when the user mentions 'issue draft', 'finding', 'observation', 'root cause', 'risk rating rationale', 'recommendation', or 'action plan'. Also trigger when the user asks about: 2LOD vs 1LOD role language (effective challenge vs implementing controls), whether control IDs belong in issue narratives or stakeholder emails, regulatory citation discipline for SR 11-7 or OCC bulletins (verbatim vs paraphrased), regulatory tolerances/grace periods before calling something non-compliant, RCSA coverage gap issue patterns (Low rating), abbreviation protocol, definitive vs range ratings, or condition-first vs criteria-first issue structure. Covers the full issue lifecycle from initial finding through final deliverable formatting."
---

# Issue Drafting

This skill provides structured guidance for drafting internal audit issues that meet IAD documentation standards and executive reporting expectations. Every component builds logically from the finding to the recommendation, with strict conciseness requirements throughout.

## Conciseness Standards

**CRITICAL**: Reviewers reject verbose documentation. Adhere to these limits.

| Component | Target Length |
|-----------|-------------|
| Issue Name | 1 sentence (executive summary of the problem) |
| Issue Description | 5-6 sentences total, paragraph format only |
| Root Cause | 1-2 sentences |
| Risk | 1-3 sentences |
| Risk Rating Rationale | 3 sentences (impact, likelihood, conclusion) |
| Recommendation | 1-2 sentences |

Expand only when essential for clarity. Never use bullet points in the issue description.

## Formatting Rules

### Abbreviation Protocol

On first use of any group name, title, or abbreviation, spell it out fully and declare the abbreviation in parentheses. Use only the abbreviation in every instance thereafter.

**Example:** "Treasury Capital Markets (TCM) uses a daily monitoring spreadsheet... TCM's process includes..."

This applies to all terms including but not limited to: organization names, standard names, system names, and technical terms.

### Standard/Policy References

Do not include standard ID numbers (e.g., STND_01881) in the issue draft. Reference standards by their full name on first use with an abbreviation, then use the abbreviation thereafter.

### Technical Language Simplification

Simplify technical terminology for a business audience when possible. For example, use "macro" rather than "VBA (Visual Basic for Applications) macro" unless the specific technology type is material to the finding.

## Issue Components

### 1. Issue Name

One sentence that serves as the executive summary of the complete issue. The sentence must be neutral in tone, clearly state what is not effective, appropriate, or adequate, and stand on its own so readers understand the scope without reading further.

**Do:** State the problem factually with enough context to be self-contained.
**Don't:** Use short titles (e.g., "Excessive Privileged Access") or include risk language.

**Example:**
> The Daily Hedge Relationship Monitoring spreadsheet used by Treasury Capital Markets (TCM) has not been assessed or registered as an End-User Computing (EUC) solution under the Business-Led Development (BLD) Standard.

### 2. Issue Rating

Assign severity (Low, Medium, High, Very High) based on the combination of impact and likelihood assessed against the firm's risk matrix. The rating drives prioritization and reporting to oversight committees.

### 3. Issue Description

Paragraph format only — no bullet points. Structure the description as **condition first, then criteria**:

1. **Condition / Gap statement** (2-3 sentences): Lead with what was found — what has not happened, what is deficient, or what was observed. Weave in technical details that substantiate the finding rather than listing them separately. Include a sentence describing what the tool/process is used for and its significance.
2. **Criteria / Standard requirement** (1-2 sentences): State the governing standard or policy and what it requires, establishing the benchmark against which the condition was measured.

**Tone:** Neutral, factual, no accusatory language or assumptions about intent.

**Opening Sentence Guidance:** Avoid passive constructions like "During IAD's review, it was noted that..." since the entire issue document is inherently the product of IAD's review. Instead, lead directly with the condition. Effective patterns include:

- **Direct condition:** "[Entity]'s [process/tool] has not been [assessed/registered/implemented]..."
- **Process-anchored:** "The [tool] supporting [entity]'s [process] leverages [characteristics], yet has not been [assessed/registered]..."
- **Control-anchored:** "The primary [analytical tool/system of record] for [entity]'s [process] has not been [assessed/registered]..."

**Example:**
> TCM's Daily Hedge Relationship Monitoring spreadsheet has not been assessed against BLD applicability criteria or registered as an EUC, despite leveraging automated Power Query workflows that execute SQL queries against the Thunderbird production database, a macro that programmatically generates the archived control file, and a multi-step daily process spanning data refresh, exception detection, dual sign-off, and network archival. The spreadsheet is used by TCM to evaluate the effectiveness of cashflow hedges daily, serving as both the primary analytical tool and the system of record for historical control evidence. The BLD Standard requires that EUC solutions developed outside of Schwab Technology Services (STS) that meet applicable criteria, including automated workflows, scripts, and macros, be registered in the Application Portfolio Management (APM) tool, submitted through Solution Hub for BLD Level determination, and incorporated into the relevant Risk and Control Self-Assessment (RCSA).

### 4. Root Cause

1-2 sentences identifying the fundamental reason the issue occurred. Keep it simple and tied directly back to the issue. Root causes are typically related to lack of awareness, assumptions, or gaps in understanding of applicable standards.

Focus on systemic factors, not individual errors.

**Common root cause patterns:**
- Lack of awareness that a standard's criteria applied
- Assumptions about scope or applicability
- Process not re-evaluated as complexity or criticality increased
- Compensating controls not considered at implementation

**Example:**
> Management was not aware that the monitoring spreadsheet's technical characteristics met the BLD Standard's applicable criteria for EUC registration.

### 5. Root Cause Taxonomy

Select the most appropriate category from the predefined classification below. When multiple categories could apply, choose the one most directly tied to the root cause statement.

**People:**
- Depth of Knowledge / Skill Set
- Organizational Morale / Culture
- Organizational Structure
- Resource Limitation
- Other (People)

**Process:**
- Decision Making Authority — Compliance
- Decision Making Authority — Existence
- Monitoring and Supervision — Compliance
- Monitoring and Supervision — Existence
- Policy or Standard Non-Adherence
- Policy, Standard, or Procedure Existence
- Project Definition / Execution / Oversight
- Training — Compliance
- Training — Existence
- Vendor Performance
- Other (Process)

**Technology:**
- Data Integrity
- Information Availability
- Infrastructure
- Logical and Physical Access
- System Availability / Reliability
- System Configuration / Programming
- Other (Technology)

### 6. Risk

1-3 sentences articulating the potential negative business consequences if the issue is not remediated. This section answers "so what?" by linking the issue to potential impacts: inaccurate reporting, governance gaps, regulatory non-compliance, financial loss, or impaired decision-making.

Specify how the issue could lead to harm, not just that it could.

**Example:**
> Without formal registration and BLD Level assessment, the monitoring spreadsheet is not subject to the governance controls required by the BLD Standard, including semi-annual registration reviews, change management oversight, and RCSA risk coverage. Undetected modifications to embedded queries or macro behavior could affect the integrity of control evidence without triggering governance review.

### 7. Risk Rating Rationale

Exactly 3 sentences following this structure:

1. **Impact sentence:** State the impact level and justify it by referencing specific impact factors (financial loss thresholds, operational/technology disruption, compliance exposure, information security/privacy, reputational, strategic). Include mitigating factors that bound the impact (e.g., data classification, no client-facing exposure, no NPI).

2. **Likelihood sentence:** State the likelihood level and justify it by referencing volume and complexity factors. Consider informal mitigating controls without giving them full credit as formal compensating controls.

3. **Conclusion sentence:** State the resulting overall issue rating based on the impact and likelihood combination.

**CRITICAL — Definitive Ratings Rule:** Each rating (impact and likelihood) must be a single, definitive level (Low, Medium, High, or Very High). Never use ranges or hedged ratings such as "Low to Medium" or "Medium to High." If the assessment falls between two levels, commit to one rating and use the justification to acknowledge the factors that informed the decision. Indecisive ratings undermine credibility and create ambiguity in the overall issue rating.

**Example:**
> The impact is considered Low, as the finding represents a governance gap with minor compliance implications limited to internal standard non-adherence, no direct financial loss exposure, and no information security risk given that the spreadsheet processes Internal-classified data without Non-Public Information. The likelihood is considered Medium, as the process involves a moderate volume of hedge relationships and some moderately complex regulatory considerations (hedge accounting standards, ASC 815); however, the BLD governance gap itself is narrow in scope and limited to a single unregistered solution. A Low impact and Medium likelihood result in an overall issue rating of Low.

### 8. Recommendation

1-2 sentences providing a clear, high-level directive to management. Recommendations must be actionable and directly linked to the root cause. Avoid being overly prescriptive on implementation — that is management's responsibility in the action plan. Offering alternatives (e.g., "Management must either X or Y") is effective.

**Example:**
> Management must assess the Daily Hedge Relationship Monitoring spreadsheet against the BLD Standard's applicable criteria and, if confirmed as an EUC, complete the required registration in the APM tool, submit the solution through Solution Hub for BLD Level determination, and incorporate the associated risks and controls within the relevant RCSA.

## Issue Template

When drafting a complete issue, use this structure:

```
Issue Name:
[One sentence executive summary of the problem]

Issue Rating:
[Low / Medium / High / Very High]

Repeat Issue ID:
[Prior issue ID if applicable, otherwise N/A]

Issue Description:
[5-6 sentences in paragraph format: condition/gap with technical details, business context, standard/criteria requirement]

Root Cause:
[1-2 sentences: lack of awareness, assumptions, or systemic gap]

Root Cause Taxonomy:
[Predefined category]

Risk:
[1-3 sentences: potential consequences if not remediated]

Risk Taxonomy:
[Predefined category]

Risk Rating Rationale:
[3 sentences: impact justification, likelihood justification, overall rating conclusion]

Recommendation:
[1-2 sentences: actionable directive linked to root cause]

RCSA Parent_ID:
[TBD or specific ID]

Vendor Name:
[TBD or specific vendor]

Issue Owner:
[TBD or specific name]

Issue Delegate:
[TBD or specific name]
```

## Critical Language Rules

### No Control IDs in Issue Narratives or Emails

Control IDs (`Cntl_XXXXXX` format) must NOT appear in:
- Issue descriptions or summaries
- Stakeholder emails and correspondence
- AuditBoard or other issue management system narrative fields

Control IDs belong in: attached RCM spreadsheets, workpaper detail, and internal mapping documents. Keep issue language at the process or system level.

### 2nd Line of Defense (2LOD) Role Language

When drafting issues involving 2LOD entities (MRO, Compliance, Risk):

| Use | Never Use |
|-----|-----------|
| "effective challenge" | "implementing controls" |
| "reviewing and challenging control design" | "testing controls" |
| "requiring model owners to document" | "operating controls" |
| "oversight of..." | "executing procedures" |

2LOD provides oversight and challenge. 1LOD implements, operates, and executes.

### Regulatory Citation Discipline

For SR 11-7, OCC bulletins, FDIC guidance, and similar sources:
1. Use **verbatim quotes** with exact page and section numbers.
2. Verify against the source document before including.
3. If exact text is unavailable: write `per SR 11-7 (paraphrased)` — not quotation marks around a paraphrase.

Common error: citing p.3 when correct is p.5, or presenting paraphrased language with quotation marks.

### Regulatory Tolerance And Applicability Check

Before calling something non-compliant, confirm whether the underlying regulation, policy, or standard contains:
- explicit tolerance thresholds
- grace periods or safe harbors
- conditional applicability criteria

If the rule is conditional, write against **applicability** rather than forcing an `in-scope/out-of-scope` binary. If the rule contains a tolerance or grace period, measure the observed behavior against that threshold rather than a stricter interpretation. Misreading tolerated timing, volume, or applicability language inflates severity and weakens audit credibility.

### RCSA Coverage Gap Issues (Low Rating Pattern)

When the finding is that controls are operating effectively but not documented in an RCSA:
- **Rating:** Low (documentation gap only, not a control failure)
- **Root Cause:** Process — Policy, Standard, or Procedure Existence
- **Condition opening:** Lead with specific gap metrics (e.g., "X of Y controls were not documented...")
- **Do NOT rate this Medium or above** solely because coverage is low — assess actual control performance separately

## Key Principles

- **Condition first, then criteria** in the issue description — lead with what was found, then state the standard
- **Paragraph format only** in the issue description — reviewers dislike bullet points
- **Neutral tone** throughout — state facts without accusatory language
- **Technical specificity** supports the finding but should be woven into sentences, not listed
- **Simplified technical language** for business audiences — avoid unnecessary jargon
- **Abbreviation discipline** — declare on first use, abbreviate thereafter
- **No standard ID numbers** in the issue body
- **No control IDs** (Cntl_XXXXXX) in issue narratives or stakeholder correspondence
- **Definitive ratings only** — never use ranges like "Low to Medium" for impact or likelihood
- **Every component builds on the last** — description establishes the gap, root cause explains why, risk explains the consequence, recommendation addresses the root cause
- **Informal mitigating factors** can be acknowledged in the risk rating rationale without treating them as formal compensating controls
- **2LOD entities** (MRO, Compliance) provide challenge and oversight — they do not implement or test controls

## Reference Documents

For detailed examples covering multiple issue types (access management, error handling, interface controls, data integrity), supplementary documentation on action plans and test steps, and the full risk matrix rating dimensions, see:
[Issue_Drafting_Guide.md](references/Issue_Drafting_Guide.md)
