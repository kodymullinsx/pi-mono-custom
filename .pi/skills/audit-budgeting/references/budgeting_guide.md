# Comprehensive Audit Budget Allocation Guide

## Detailed Methodologies and Examples

This reference provides comprehensive guidance, formulas, and practical examples for audit budget allocation. Read this file when additional detail is needed beyond the core SKILL.md instructions.

## Team Structure

**Standard Team Composition:**
- **Director**: Executive oversight, final review (2-5% of budget)
- **Senior Manager**: 2nd level reviewer, planning oversight (10-15% of budget)
- **Manager**: 1st level reviewer, detailed planning, primary fieldwork oversight (20-30% of budget)
- **Testers**: Senior Specialists and Specialists who perform control testing (50-65% of budget combined)

**Note on Testers:** Individual allocations depend on control assignments, complexity, and availability. Testers are allocated independently based on specific controls assigned rather than paired allocations.

## Smooth Weekly Hour Distribution

### Purpose of Smoothing

**Why Smooth Hours:**
1. **Resource planning**: Easier for resource managers to commit capacity
2. **Work-life balance**: Prevents extreme week-to-week variation
3. **Concurrent audits**: Facilitates managing multiple engagements simultaneously
4. **Capacity visibility**: Clearer picture of resource utilization
5. **Realistic planning**: Accounts for practical weekly work patterns

**Target**: Consistent weekly hours approaching **40 hours/week** when resource is fully allocated to the audit.

### Smoothing Methodology

**Step 1: Calculate Raw Weekly Average**
```
Raw Average = Total Phase Hours ÷ Number of Weeks
```

**Step 2: Apply Practical Rounding**
- Avoid fractional hours like 7.3 or 12.8
- Round to practical increments: 5, 6, 8, 10, 12, 15, 16, 18, 20
- Maintain totals by adjusting buffer or distributing rounding variance

**Step 3: Apply Phase Patterns**
- **Ramp-up** (Weeks 1-2): Start 20-30% below target
- **Steady state** (Middle weeks): Maintain consistent hours
- **Ramp-down** (Final weeks): Reduce 20-30% from target

**Step 4: Adjust for Constraints**
- **PTO**: Redistribute hours to adjacent weeks (±20%)
- **Concurrent audits**: Reduce to accommodate other commitments
- **Capacity limits**: Never exceed 40 hours total across all audits
- **Phase transitions**: Gradual increase/decrease at boundaries

### Smoothing Examples

**Example 1: Manager - Planning Phase (120 hours, 10 weeks)**

Raw calculation: 120 ÷ 10 = 12 hours/week

Without smoothing (based on activities):
| Week | Activity Focus | Hours |
|------|----------------|-------|
| 1 | Announcement | 8 |
| 2 | GAU start | 12 |
| 3 | GAU intensive | 18 |
| 4 | Walkthroughs | 15 |
| 5 | Walkthroughs | 15 |
| 6 | CoVal prep | 10 |
| 7 | CoVal execution | 20 |
| 8 | Planning memo | 22 |
| 9 | Tollgate prep | 5 |
| 10 | Finalize | 5 |
| **Total** | | **130** |

With smoothing:
| Week | Smoothed Hours | Adjustment |
|------|----------------|------------|
| 1 | 8 | Ramp-up (maintained) |
| 2 | 11 | Smoothed up slightly |
| 3 | 14 | Reduced from 18 |
| 4 | 13 | Reduced from 15 |
| 5 | 13 | Reduced from 15 |
| 6 | 12 | Increased from 10 |
| 7 | 15 | Reduced from 20 |
| 8 | 16 | Reduced from 22 |
| 9 | 10 | Increased from 5 |
| 10 | 8 | Increased from 5 |
| **Total** | **120** | 10 hrs to buffer |

**Benefits**: More consistent week-to-week, no extreme spikes, maintains realistic capacity.

**Example 2: Tester - Fieldwork (135 hours, 7 weeks, with 1 week PTO)**

Raw calculation: 135 ÷ 7 = 19.3 hours/week

With PTO (Week 4):
| Week | Without Smoothing | With Smoothing & PTO |
|------|-------------------|---------------------|
| 1 | 25 | 18 |
| 2 | 20 | 18 |
| 3 | 18 | 20 |
| 4 | 0 (PTO) | 0 (PTO) |
| 5 | 22 | 22 |
| 6 | 25 | 22 |
| 7 | 25 | 20 |
| **Total** | **135** | **120** |

Note: PTO week results in 15 hours moved to buffer or timeline extension.

**Example 3: Multi-Phase Smoothing (Manager across full audit)**

21-week audit: 143 total hours

| Phase | Weeks | Hours | Avg/Week | Smoothed Pattern |
|-------|-------|-------|----------|------------------|
| Pre-Planning | 3 | 15 | 5 | 4, 5, 6 |
| Planning | 8 | 60 | 7.5 | 6, 8, 8, 8, 8, 8, 7, 7 |
| Fieldwork | 7 | 50 | 7.1 | 6, 7, 7, 8, 8, 7, 7 |
| Reporting | 3 | 18 | 6 | 6, 6, 6 |
| **Total** | **21** | **143** | **6.8** | Smooth transitions |

### Smoothing Decision Tree

```
Is resource fully allocated to this audit? 
├─ YES → Target 35-40 hrs/week, smooth to approach target
└─ NO → What % allocation?
   ├─ 50% → Target 20 hrs/week
   ├─ 75% → Target 30 hrs/week  
   └─ 25% → Target 10 hrs/week

Are there PTO weeks?
├─ YES → Redistribute to adjacent weeks (±20%)
└─ NO → Continue with standard smoothing

Do activities create natural peaks?
├─ YES (e.g., Tollgate, CoVal) → Allow 20-30% spike, reduce adjacent weeks
└─ NO → Maintain consistent weekly pattern

Does raw average exceed 40 hrs/week?
├─ YES → Options:
│   ├─ Extend timeline (add weeks)
│   ├─ Add resource
│   ├─ Accept 2-3 weeks at 45-50 hrs
│   └─ Reduce scope
└─ NO → Proceed with smoothing
```

## Detailed Phase Breakdown and Milestone-Based Budgeting

### Planning Phase Milestones and Budget Allocation

**Critical Constraint**: Planning phase must conclude and be signed off within 10 days (including weekends) after Control Validation (CoVal).

#### Planning Phase Milestones:
1. **Announcement Memo** (Week 1)
2. **Kickoff Meeting** (Week 1-2)
3. **Gain an Understanding (GAU) Meetings** (Weeks 2-4)
4. **Walkthrough Meetings** (Weeks 4-6)
5. **Control Validation (CoVal)** (Weeks 6-7)
6. **Issue Analysis** (Weeks 7-8)
7. **Planning Memo** (Week 8)
   - Director Review
   - MD Initial Review (Prior to Tollgate)
   - Tollgate review (48 hours before tollgate meeting)
   - Tollgate meeting
8. **Flowcharts** (Weeks 6-8)
9. **Risk and Control Matrix** (Weeks 7-8)

#### Formula-Based Planning Budget:

```
Planning Budget = Base Hours + (Interface/Data Governance Multiplier) + (Control Complexity Buffer)

Where:
- Base Hours = Core planning activities (GAU, walkthroughs, standard documentation)
- Interface/Data Governance Multiplier = 5 hours × number of interface/data governance controls requiring separate flowcharts
- Control Complexity Buffer = 2-3 hours × number of complex controls identified
```

**Role-Specific Planning Allocation:**
- **Director**: 2-3% of planning budget (strategy approval, tollgate participation)
- **Senior Manager**: 15-20% of planning budget (heavy involvement in GAU, CoVal, tollgate)
- **Manager**: 30-35% of planning budget (detailed planning, memo drafting, flowchart creation)
- **Senior + Staff**: 45-50% of planning budget (walkthrough execution, control documentation)

#### Planning Phase Weekly Distribution Example:

| Week | Milestone Focus | Director | Sr Manager | Manager | Senior | Staff | Total |
|------|----------------|----------|------------|---------|---------|-------|-------|
| 1 | Announcement/Kickoff | 0.5 | 3 | 8 | 6 | 6 | 23.5 |
| 2-3 | GAU Meetings | 0 | 6 | 12 | 10 | 10 | 38 |
| 4-5 | Walkthroughs | 0.5 | 4 | 10 | 12 | 12 | 38.5 |
| 6-7 | CoVal | 0.5 | 8 | 15 | 8 | 8 | 39.5 |
| 8 | Planning Memo/Tollgate | 1.5 | 6 | 10 | 4 | 4 | 25.5 |

### Fieldwork Phase Activities and Budget Structure

#### Fieldwork Phase Activities:
1. **Controls Testing** (Primary activity)
2. **Weekly Status Calls** (Ongoing)
3. **Observation Vetting** (As issues arise)
4. **Issue Drafting** (For identified deficiencies)
5. **Issues Analysis Update** (If applicable)
6. **Summary Memo Update** (If applicable)
7. **Flowchart Updates** (If applicable)
8. **Control Reviews**:
   - 1st Level Review (Senior → Manager)
   - 2nd Level Review (Manager → Senior Manager)
   - 3rd Level Review (Senior Manager → Director, if applicable)

#### Enhanced Control-Based Fieldwork Formula:

```
Fieldwork Budget = Testing Hours + Review Hours + Administrative Hours

Testing Hours = Controls × 40 hours (Senior/Staff paired)
Review Hours = Controls × (4 hours Manager + 2 hours Sr Manager + 1 hour Director)
Administrative Hours = (Weekly status + Issue drafting + Updates) = 5-10% of testing hours
```

**Detailed Review Structure:**
- **1st Level Review (Manager)**: 3-5 hours per control
- **2nd Level Review (Senior Manager)**: 1-3 hours per control
- **3rd Level Review (Director)**: 0.5-1 hour per control (complex controls only)

#### Fieldwork Weekly Pattern Example (8 Controls):

| Week | Controls Focus | Testing (Sr+Staff) | 1LR (Manager) | 2LR (Sr Mgr) | 3LR (Director) | Total |
|------|----------------|-------------------|---------------|--------------|----------------|-------|
| 1 | Controls 1-2 | 30+30 | 8 | 4 | 1 | 73 |
| 2 | Controls 3-4 | 30+30 | 8 | 4 | 1 | 73 |
| 3 | Controls 5-6 | 30+30 | 8 | 4 | 1 | 73 |
| 4 | Controls 7-8 | 30+30 | 8 | 4 | 1 | 73 |
| 5 | Review/Issues | 10+10 | 4 | 2 | 1 | 27 |
| 6 | Wrap-up | 5+5 | 2 | 1 | 0 | 13 |

### Reporting Phase Activities and Issue-Based Budgeting

#### Reporting Phase Activities:
1. **Issue Vetting with Auditee** (Rating confirmation, description refinement, action plan development)
2. **Issue/Action Plan Objects Creation in MyGRC** (System entry and documentation)

#### Formula-Based Reporting Budget:

```
Reporting Budget = Base Hours + (Issue Multiplier × Number of Findings)

Where:
- Base Hours = Standard reporting activities (draft report, management responses, final report)
- Issue Multiplier = 8-12 hours per formal finding (vetting + MyGRC entry + documentation)
```

**Issue Complexity Adjustments:**
- **Simple Issues**: 6-8 hours (clear deficiency, straightforward action plan)
- **Standard Issues**: 8-12 hours (moderate complexity, standard vetting process)
- **Complex Issues**: 15-20 hours (significant deficiencies requiring extensive vetting, multiple stakeholders)

#### Reporting Phase Role Distribution:

| Activity | Director | Sr Manager | Manager | Senior | Staff |
|----------|----------|------------|---------|---------|-------|
| Issue Vetting | 10-15% | 25-30% | 40-45% | 15-20% | 5-10% |
| MyGRC Entry | 0% | 5-10% | 30-40% | 40-50% | 10-20% |
| Report Drafting | 5-10% | 20-25% | 50-60% | 10-15% | 0-5% |
| Final Review | 20-30% | 40-50% | 20-30% | 0-10% | 0% |

## Integrated Formula-Based Budget Calculator

### Total Audit Budget Formula:

```
Total Budget = Planning + Fieldwork + Reporting + Buffer

Planning = Base Planning Hours + (5 × Interface Controls) + (3 × Complex Controls)
Fieldwork = (40 × Total Controls) + (4 × Total Controls) + (2 × Total Controls) + (1 × Total Controls)
Reporting = Base Reporting Hours + (10 × Expected Findings)
Buffer = 10% of (Planning + Fieldwork + Reporting)
```

### Example Calculation (Medium Audit):

**Audit Parameters:**
- 12 total controls
- 3 interface/data governance controls
- 2 complex controls
- 3 expected findings

**Calculation:**
```
Planning = 80 + (5 × 3) + (3 × 2) = 80 + 15 + 6 = 101 hours
Fieldwork = (40 × 12) + (4 × 12) + (2 × 12) + (1 × 12) = 480 + 48 + 24 + 12 = 564 hours
Reporting = 40 + (10 × 3) = 40 + 30 = 70 hours
Subtotal = 735 hours
Buffer (10%) = 74 hours
Total Budget = 809 hours
```

## CoVal-Triggered Budget Updates

### Budget Update Timeline:
1. **Initial Budget**: Based on preliminary scope assessment
2. **CoVal Confirmation**: Refined budget based on confirmed control count and complexity
3. **Final Adjustment**: Post-CoVal budget submitted within 48 hours of CoVal completion

### CoVal Budget Update Process:

**Step 1: Control Count Validation**
- Compare initial estimates to CoVal-confirmed controls
- Identify additions/deletions from preliminary scope

**Step 2: Complexity Assessment**
- Reclassify controls based on CoVal findings (simple/standard/complex)
- Adjust multipliers accordingly

**Step 3: Updated Budget Calculation**
- Apply confirmed control counts to formulas
- Calculate variance from initial budget
- Prepare justification for material changes (>15%)

**Step 4: Stakeholder Communication**
- Submit updated budget to Senior Manager, Director, and resource management
- Include variance analysis and timeline implications
- Request approval for resource allocation changes

### Budget Update Template:

```
Audit: [Name]
CoVal Date: [Date]
Budget Update: [Date]

| Phase | Initial Budget | CoVal-Updated | Variance | Variance % |
|-------|---------------|---------------|----------|------------|
| Planning | X | X | X | X% |
| Fieldwork | X | X | X | X% |
| Reporting | X | X | X | X% |
| Total | X | X | X | X% |

Control Analysis:
- Initial Control Count: X
- CoVal-Confirmed Count: X
- Simple Controls: X (30 hrs each)
- Standard Controls: X (40 hrs each)
- Complex Controls: X (50-60 hrs each)
- Interface/Data Governance: X (additional 5 hrs planning each)

Justification for Variance: [Explanation]
Resource Impact: [Timeline/staffing changes]
```

## Practical Examples

### Example 1: Investment Portfolio Management Audit (9 Controls)

**Parameters:**
- 9 controls (2 simple, 5 standard, 2 complex)
- 3 interface/data governance controls requiring additional flowcharts
- 3 expected findings
- Team: Senior Manager, Manager, 3 Testers (2 Senior Specialists, 1 Specialist)
- Timeline: 22 weeks (July 2025 - December 2025)
  - Pre-Planning: 3 weeks
  - Planning: 8 weeks
  - Fieldwork: 7 weeks
  - Reporting: 4 weeks

**Control Assignment (Even Distribution - 3 controls each):**

**Tester 1 - Jessie (Senior Specialist):**
- Control 1: Alteryx Pricing Workflow (Standard: 40 hrs)
- Control 2: Position Reconciliation (Standard: 40 hrs)
- Control 3: Trade Validation (Complex: 55 hrs)
Total: 135 hours

**Tester 2 - Theila (Senior Specialist):**
- Control 4: SOD Matrix Review (Simple: 30 hrs)
- Control 5: Interface Control A (Standard: 40 hrs)
- Control 6: Data Quality Check (Standard: 40 hrs)
Total: 110 hours

**Tester 3 - Wing (Specialist):**
- Control 7: System Access Review (Simple: 30 hrs)
- Control 8: Pricing Upload (Standard: 40 hrs)
- Control 9: Reporting Control (Standard: 40 hrs)
Total: 110 hours

**Budget Calculation:**
```
Planning:
- Base: 80 hours
- Interface Controls: 3 × 5 = 15 hours
- Complex Controls: 2 × 3 = 6 hours
- Planning Total: 101 hours

Fieldwork:
- Testing: 355 hours (135 + 110 + 110)
- Manager Review: 9 × 4 = 36 hours
- Senior Manager Review: 9 × 2 = 18 hours
- Fieldwork Total: 409 hours

Reporting:
- Base: 40 hours
- Findings: 3 × 10 = 30 hours
- Reporting Total: 70 hours

Subtotal: 580 hours
Buffer (10%): 58 hours
Total Budget: 638 hours
```

**Role Distribution:**
- Senior Manager: 64 hours (10%)
- Manager: 127 hours (20%)
- Jessie: 185 hours (29%)
- Theila: 160 hours (25%)
- Wing: 160 hours (25%)

**Weekly Schedule Example (Fieldwork Phase - 7 weeks):**

| Week Ending | Jessie | Theila | Wing | Manager | Sr Manager | Phase Notes |
|-------------|--------|--------|------|---------|------------|-------------|
| 9/29/2025 | 18 | 14 | 16 | 6 | 4 | Controls 1, 4, 7 start |
| 10/6/2025 | 16 | 15 | 15 | 8 | 5 | Testing continues |
| 10/13/2025 | 0 (PTO) | 18 | 18 | 10 | 5 | Theila/Wing cover |
| 10/20/2025 | 20 | 16 | 0 (PTO) | 8 | 4 | Jessie catches up |
| 10/27/2025 | 18 | 15 | 16 | 6 | 3 | Controls 2, 5, 8 |
| 11/3/2025 | 20 | 14 | 15 | 4 | 2 | Controls 3, 6, 9 |
| 11/10/2025 | 18 | 12 | 10 | 2 | 1 | Final review/wrap |
| **Total** | **110** | **104** | **90** | **44** | **24** | |

Note: Jessie's fieldwork total (110) is lower than her total assignment (135) because remaining hours are in planning and reporting phases.

### Example 2: Model Risk Management Audit (8 Controls)

**Parameters:**
- 8 controls (all standard complexity)
- 2 expected findings
- Team: Director, Senior Manager, Manager, 2 Senior Specialists
- No Specialist assigned (team uses two experienced testers)

**Control Assignment (4 controls each):**

**Tester 1 - Senior Specialist A:**
- Controls 1-4: Standard testing (4 × 40 = 160 hrs)

**Tester 2 - Senior Specialist B:**
- Controls 5-8: Standard testing (4 × 40 = 160 hrs)

**Budget Calculation:**
```
Planning: 100 hours
Fieldwork:
- Testing: 320 hours (160 + 160)
- Manager: 8 × 4 = 32 hours
- Senior Manager: 8 × 2 = 16 hours
- Director: 8 × 1 = 8 hours
- Fieldwork Total: 376 hours

Reporting:
- Base: 35 hours
- Findings: 2 × 10 = 20 hours
- Reporting Total: 55 hours

Subtotal: 531 hours
Buffer (10%): 53 hours
Total Budget: 584 hours
```

**Role Distribution:**
- Director: 12 hours (2%)
- Senior Manager: 58 hours (10%)
- Manager: 117 hours (20%)
- Senior Specialist A: 198 hours (34%)
- Senior Specialist B: 199 hours (34%)

**Smooth Weekly Distribution (Manager, 10-week planning):**

| Week | Raw Calculation | Smoothed | Adjustment Rationale |
|------|----------------|----------|---------------------|
| 1 | 8 | 8 | Announcement/kickoff |
| 2 | 12 | 11 | GAU meetings start |
| 3 | 15 | 12 | Smoothed down |
| 4 | 15 | 13 | Walkthroughs |
| 5 | 18 | 14 | Smoothed down |
| 6 | 10 | 13 | Smoothed up |
| 7 | 8 | 12 | Control validation |
| 8 | 22 | 15 | Tollgate prep (smoothed) |
| 9 | 12 | 13 | Tollgate review |
| 10 | 7 | 6 | Wrap-up |
| **Total** | **127** | **117** | 10 hrs moved to buffer |

### Example 3: Small Audit with Minimal Complexity (5 Controls)

**Parameters:**
- 5 standard controls
- No interface/data governance controls
- 1 expected finding
- Team: Senior Manager, Manager, 1 Senior Specialist

**Control Assignment:**
**Tester 1 - Senior Specialist:**
- Controls 1-5: All standard (5 × 40 = 200 hrs)

**Calculation:**
```
Fieldwork:
- Testing: 200 hours
- Manager: 5 × 4 = 20 hours
- Senior Manager: 5 × 2 = 10 hours
- Fieldwork Subtotal: 230 hours

Planning (35% of fieldwork): 80 hours
Reporting: 42 hours + (10 × 1 finding) = 52 hours

Subtotal: 362 hours
Buffer (10%): 36 hours
Total Budget: 398 hours
```

**Role Distribution:**
- Senior Manager: 40 hours (10%)
- Manager: 80 hours (20%)
- Senior Specialist: 278 hours (70%)

Note: Senior Specialist percentage is higher than typical because this is a small team without additional testers to share the workload.

## Best Practices and Tips

### 1. Applying the Doubling Rule
- Start from the top down when allocating hours
- Adjust ratios based on complexity: Simple audits may need less than 2x, complex audits more
- Consider team size: Smaller teams may have compressed ratios
- Validate total hours after applying the rule to ensure budget compliance
- Accept reasonable variance (1.5x to 2.5x) based on audit needs

### 2. Individual Tester Allocation
- Distribute controls evenly when possible (e.g., 9 controls = 3 per tester)
- Balance complexity across testers (mix simple/standard/complex)
- Consider experience level: Senior Specialists can handle more complex controls
- Respect individual capacity constraints (PTO, concurrent audits, skill gaps)
- Document control assignments clearly in planning documentation

### 3. Smoothing Weekly Hours
- **Goal**: Target consistent weekly hours approaching 40 hrs/week when fully allocated
- **Method**: Divide phase hours by weeks, then adjust for practical increments
- **Ramp patterns**: Start 20-30% below target, maintain steady state, end 20-30% below target
- **Avoid**: Extreme week-to-week variation (swings >10 hours)
- **PTO handling**: Redistribute to adjacent weeks (±20% adjustment acceptable)
- **Review**: Ensure no week exceeds 40 hours across all audits

### 4. Planning Phase
- Front-load senior management time for strategy and risk assessment
- Allow ramp-up time for team members new to the audit area
- Include buffer for scope changes identified during planning
- Assign controls to testers early to facilitate preparation
- Schedule walkthroughs efficiently to minimize tester planning hours

### 5. Fieldwork Phase
- Maintain consistent weekly hours for testers during active testing
- Schedule manager review time throughout, not just at end
- Build in time for re-performance if issues identified
- Stagger control testing to balance workload
- Monitor actual hours weekly and adjust remaining weeks as needed

### 6. Reporting Phase
- Stagger review cycles to avoid bottlenecks
- Reserve director time for final week
- Include time for client meetings and issue resolution
- Assign testers to issue vetting and documentation tasks
- Smooth hours during reporting (avoid 40 hr week 1, then 5 hr week 2)

### 7. General Guidelines
- Track actual vs. budget weekly to identify trends early
- Monitor the doubling rule in actuals to refine future budgets
- Communicate availability constraints upfront
- Document allocation rationale for future reference
- Use prior year actuals as baseline when available
- Adjust for team composition changes
- Maintain individual weekly schedules for each resource
- Update allocations post-CoVal to reflect confirmed scope

## Budget Tracking Templates

### Weekly Tracking Format

```
Audit: [Audit Name]
Week Ending: [Date]
Phase: [Current Phase]

| Resource | Role | Budgeted | Actual | Variance | YTD Budget | YTD Actual | YTD Variance |
|----------|------|----------|--------|----------|------------|------------|--------------|
| [Name] | D | X | X | X | X | X | X |
| [Name] | SM | X | X | X | X | X | X |
| [Name] | M | X | X | X | X | X | X |
| [Name] | S | X | X | X | X | X | X |
| [Name] | Staff | X | X | X | X | X | X |
| **Total** | | **X** | **X** | **X** | **X** | **X** | **X** |

Doubling Rule Check:
- Manager hours ÷ Senior Manager hours = X.X
- (Senior + Staff) hours ÷ Manager hours = X.X
- Staff/Senior hour alignment = X%

Phase Progress: X% Complete
Budget Utilization: X%
Key Issues: [List any concerns]
```

### Staff/Senior Pairing Tracker

```
Week: [Date]
Senior: [Name] | Staff: [Name]

| Day | Activity | Senior Hrs | Staff Hrs | Notes |
|-----|----------|------------|-----------|-------|
| Mon | [Activity] | X | X | |
| Tue | [Activity] | X | X | |
| Wed | [Activity] | X | X | |
| Thu | [Activity] | X | X | |
| Fri | [Activity] | X | X | |
| **Total** | | **X** | **X** | Should match |
```

### Phase Transition Checklist

**Before Moving to Next Phase:**
- [ ] Current phase deliverables complete
- [ ] Hours tracked and reconciled
- [ ] Next phase resources confirmed available
- [ ] Any budget overruns addressed
- [ ] Client informed of progress

## Conclusion

These detailed methodologies provide comprehensive guidance for audit budget allocation across various audit types and team compositions. Remember:

1. **The Doubling Rule**: Ensures appropriate supervision ratios
2. **Staff/Senior Pairing**: Recognizes constant supervision requirements
3. **Formula-Driven Approach**: Provides consistency and predictability
4. **Milestone-Based Planning**: Aligns resources with key audit dates
5. **Flexibility**: Adapt base methodologies to specific circumstances

Always validate allocations against both budget constraints and audit objectives.