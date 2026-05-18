---
name: audit-budgeting
description: Systematic audit budget allocation and resource planning for Internal Audit departments. Use when users request audit budget allocation, budget planning, resource allocation, hour distribution across roles/phases, control-based budgeting, milestone-driven planning, weekly scheduling, or related audit planning documentation. Implements formula-driven approaches including the Doubling Rule (hierarchical resource allocation), control-based hour calculations, phase distribution percentages, smooth weekly hour distribution targeting 40-hour capacity, and individual tester allocation. Team structure includes Director, Senior Manager (2nd level reviewer), Manager (1st level reviewer), and Testers (Senior Specialists and Specialists). Supports multiple audit types including Investment Portfolio Management, Model Risk Management, Third-Party Management Lifecycle, and Compensation Program audits.
---

# Audit Budgeting

## Core Response Structure

When users request audit budget allocation, respond with **only** these five components in this exact order:

1. **Budget Parameters** - Total budget hours, buffer percentage, team composition, timeline
2. **Role-Based Allocation** - Hours per role using the Doubling Rule principle
3. **Phase Distribution** - Hour allocation across Pre-Planning, Planning, Fieldwork, Reporting, Post-Audit
4. **Control-Based Adjustment** - If controls specified, calculate using standard rates
5. **Weekly Schedule** - Specific weekly hour distribution (max 40 hours/week per resource)

**Format Flexibility**: Adapt to user's requested format (Excel, table, Gantt chart, etc.) while maintaining these five components in the same order.

**Key Constraint**: Include **only** these five components unless additional details are specifically requested. Do not add supplemental narrative, methodology explanations, or best practices unless explicitly asked.

## Foundational Principles

### Team Structure

**Standard Team Composition:**
- **Director**: Executive oversight, final review, strategic guidance
- **Senior Manager**: 2nd level reviewer, planning oversight, reporting coordination
- **Manager**: 1st level reviewer, detailed planning, primary fieldwork oversight
- **Testers**: Senior Specialists and Specialists (also called Seniors and Staff) who perform control testing

### The Doubling Rule

Each organizational level should have approximately **2x the hours** of the level above:

**Standard Application:**
```
Director: 10 hours (base)
Senior Manager: 40-50 hours (4-5x Director due to minimal Director involvement)
Manager: 80-100 hours (2x Senior Manager)
Testers (combined): 160-200 hours (2x Manager)
```

**Validation Example** (500-hour audit):
- Director: 10 hours (2%)
- Senior Manager: 50 hours (10%) ≈ 5x Director
- Manager: 100 hours (20%) = 2x Senior Manager
- Testers (combined): 200 hours (40%) = 2x Manager
- Remaining 140 hours distributed based on phase needs

**Note on Testers:** Individual tester hours depend on:
- Number of controls assigned to each tester
- Control complexity (simple: 30 hrs, standard: 40 hrs, complex: 50-60 hrs)
- Individual availability and capacity constraints
- Testing timeline and concurrent work

### Smooth Hour Distribution

**Goal**: Distribute hours evenly across weeks to **approach 40-hour weekly capacity** while respecting phase intensity patterns.

**Smoothing Principles:**
1. **Target 40 hours/week** when resources are fully allocated to the audit
2. **Ramp up gradually** during planning phase (start lower, build to target)
3. **Maintain steady state** during fieldwork (consistent weekly hours)
4. **Ramp down gradually** during reporting phase (reduce as work concludes)
5. **Respect PTO and constraints** by redistributing hours to adjacent weeks

**Example Smooth Distribution (Manager, 8-week fieldwork):**
| Week | Without Smoothing | With Smoothing | Notes |
|------|-------------------|----------------|-------|
| 1 | 12 | 10 | Gradual ramp-up |
| 2 | 8 | 10 | Smoothed upward |
| 3 | 15 | 12 | Smoothed downward |
| 4 | 15 | 12 | Consistent |
| 5 | 10 | 12 | Smoothed upward |
| 6 | 18 | 14 | Smoothed downward |
| 7 | 12 | 14 | Consistent |
| 8 | 5 | 6 | Wrap-up |

**Benefits of Smoothing:**
- More predictable resource commitments
- Easier to identify capacity conflicts
- Better work-life balance for team members
- Facilitates concurrent audit management
- Clearer to resource managers

## Control-Based Budgeting

### Standard Rates per Control

**Per Control Allocation:**
- **Testers (per control assigned)**: 30-60 hours depending on complexity
  - Simple: 30 hours
  - Standard: 40 hours
  - Complex: 50-60 hours
- **Manager (1st level review)**: 3-5 hours per control (average 4 hours)
- **Senior Manager (2nd level review)**: 1-3 hours per control (average 2 hours)
- **Director (selective 3rd level review)**: 1-2 hours per control (average 1 hour, complex controls only)

### Control Assignment and Distribution

**Individual Tester Allocation:**
Controls are assigned to individual testers based on:
1. **Even distribution** (e.g., 9 controls = 3 per tester for 3 testers)
2. **Complexity balance** (distribute simple/standard/complex evenly)
3. **Individual capacity** (respect PTO, concurrent audits, skill level)
4. **Specialization** (assign controls requiring specific expertise appropriately)

**Example Control Assignment (9 controls, 3 testers):**
```
Tester 1 (Senior Specialist - Jessie):
- Control 1: Alteryx Pricing Workflow (Standard: 40 hrs)
- Control 2: Position Reconciliation (Standard: 40 hrs)
- Control 3: Trade Validation (Complex: 55 hrs)
Total: 135 hours

Tester 2 (Senior Specialist - Theila):
- Control 4: SOD Matrix Review (Simple: 30 hrs)
- Control 5: Interface Control A (Standard: 40 hrs)
- Control 6: Data Quality Check (Standard: 40 hrs)
Total: 110 hours

Tester 3 (Specialist - Wing):
- Control 7: System Access Review (Simple: 30 hrs)
- Control 8: Pricing Upload (Standard: 40 hrs)
- Control 9: Reporting Control (Standard: 40 hrs)
Total: 110 hours

Combined Testing Hours: 355 hours
```

### Control Complexity Adjustments

**Simple Controls** (30 hours):
- Automated controls
- Single system controls
- Limited sample sizes
- Clear documentation

**Standard Controls** (40 hours):
- Manual controls
- Moderate complexity
- Standard sample sizes
- Multiple attributes

**Complex Controls** (50-60 hours):
- Multi-system controls
- High judgment required
- Large sample sizes
- Multiple locations/divisions
- Significant deficiency history

### Calculation Methodology

**Step 1: Base Fieldwork Hours**
```
Total Testing Hours = Sum of (Controls × Hours per Control based on complexity)
Manager Review = Number of Controls × 4 hours
Senior Manager Review = Number of Controls × 2 hours
Director Review = Complex Controls × 1 hour
```

**Step 2: Add Non-Fieldwork Phases**
```
Planning = Base Fieldwork × 0.30-0.40
Reporting = Base Fieldwork × 0.15-0.20
Buffer = Total × 0.10
```

**Example** (9 controls: 2 simple, 5 standard, 2 complex):
```
Fieldwork:
- Testing: (2×30) + (5×40) + (2×55) = 60 + 200 + 110 = 370 hours
- Manager: 9 × 4 = 36 hours
- Senior Manager: 9 × 2 = 18 hours
- Director: 2 × 1 = 2 hours
- Fieldwork Subtotal: 426 hours

Other Phases:
- Planning (35%): 149 hours
- Reporting (18%): 77 hours
- Buffer (10%): 65 hours

Total Budget: 717 hours
```

## Phase Distribution

### Standard Phase Percentages

Apply these baseline percentages to total budget:

| Phase | % of Total | Primary Resources | Secondary Resources |
|-------|------------|-------------------|---------------------|
| Pre-Planning | 3-5% | Senior Manager, Manager | Testers |
| Planning | 25-30% | Senior Manager, Manager | Testers, Director |
| Fieldwork | 50-55% | Testers | Manager, Senior Manager (review) |
| Reporting | 10-12% | Manager, Senior Manager | Testers, Director |
| Post-Audit | 1-2% | Manager | Senior Manager |

### Phase-Specific Role Distribution

**Pre-Planning Phase:**
- Senior Manager: 20-25%
- Manager: 35-40%
- Testers (combined): 35-40%

**Planning Phase:**
- Director: 2-3%
- Senior Manager: 15-20%
- Manager: 30-35%
- Testers (combined): 45-50%

**Fieldwork Phase:**
- Director: 0-1%
- Senior Manager: 8-10%
- Manager: 15-20%
- Testers (combined): 70-75%

**Reporting Phase:**
- Director: 5-10%
- Senior Manager: 20-25%
- Manager: 35-40%
- Testers (combined): 30-35%

## Weekly Allocation Process

### Capacity Management and Smoothing

**Critical Constraint**: No resource exceeds **40 hours per week** across all audits.

**Smoothing Methodology:**
1. **Calculate total hours per phase** from milestone dates
2. **Divide by number of weeks** to get average weekly hours
3. **Apply smoothing adjustments**:
   - Round to practical hour increments (avoid 7.3 hrs/week, use 7 or 8)
   - Front-load complex activities
   - Back-load review and wrap-up activities
   - Maintain consistency week-to-week where possible
4. **Adjust for constraints**:
   - PTO: Redistribute hours to adjacent weeks or other testers
   - Concurrent audits: Reduce weekly hours proportionally
   - Phase transitions: Gradually ramp up/down

**Smoothing Example (Tester with 120 hours over 8 weeks):**
```
Raw average: 120 ÷ 8 = 15 hours/week

Smoothed allocation:
Week 1: 12 hours (ramp-up)
Week 2: 15 hours (steady state)
Week 3: 16 hours (peak activity)
Week 4: 16 hours (maintain)
Week 5: 15 hours (steady state)
Week 6: 16 hours (final push)
Week 7: 15 hours (wrap-up begins)
Week 8: 15 hours (finalize)
Total: 120 hours ✓
```

### Role-Based Weekly Guidelines

**Planning Phase:**
- Senior Manager/Manager: 10-15 hours/week (peak during CoVal/Tollgate)
- Testers: 5-12 hours/week (walkthroughs, documentation)

**Fieldwork Phase:**
- Testers: 10-20 hours/week (control testing, varies by assignment)
- Manager: 4-8 hours/week (review)
- Senior Manager: 3-5 hours/week (2nd level review)

**Reporting Phase:**
- Manager: 8-12 hours/week (issue drafting, report writing)
- Senior Manager: 5-8 hours/week (review)
- Testers: 3-8 hours/week (issue vetting, documentation)

### Weekly Schedule Format

Present weekly allocation showing:
- Week ending date
- Hours per individual resource per week
- Phase indicators
- Weekly total per resource
- Capacity warnings (if >40 hours)
- PTO indicators

**Example Individual Tester Schedule:**
| Week Ending | Jessie (Sr Spec) | Theila (Sr Spec) | Wing (Spec) | Manager | Sr Manager | Phase |
|-------------|------------------|------------------|-------------|---------|------------|-------|
| 9/22/2025 | 15 | 12 | 0 (PTO) | 8 | 4 | Planning |
| 9/29/2025 | 18 | 14 | 16 | 6 | 4 | Fieldwork |
| 10/6/2025 | 16 | 15 | 15 | 8 | 5 | Fieldwork |
| 10/13/2025 | 0 (PTO) | 18 | 18 | 10 | 5 | Fieldwork |

### Handling PTO and Availability Constraints

**When Tester Has PTO:**
1. **Redistribute controls** to other testers if early in audit
2. **Shift hours** to adjacent weeks if feasible
3. **Extend timeline** if multiple testers have overlapping PTO
4. **Accept reduced capacity** and adjust expectations

**Example PTO Handling:**
```
Original Plan:
- Wing: 16 hrs/week for 6 weeks = 96 hours
- Week 3 PTO identified

Adjusted Plan:
- Week 1: 18 hours (increased)
- Week 2: 18 hours (increased)
- Week 3: 0 hours (PTO)
- Week 4: 20 hours (increased)
- Week 5: 20 hours (increased)
- Week 6: 20 hours (increased)
Total: 96 hours ✓
```

## Milestone-Based Planning

### Key Audit Milestones

Use these dates to calculate phase durations and weekly allocations:

1. **Pre-Planning Start Date**
2. **Announcement Memo Date** (Week 1 of Planning)
3. **Control Validation (CoVal) Date** (Weeks 6-7 of Planning)
4. **Planning Memo / Tollgate Date** (Week 8, must be ≤10 days after CoVal)
5. **End of Fieldwork Date**
6. **Report Date**

### Automatic Timeline Calculations

**From Milestones:**
1. Calculate weeks between milestone dates
2. Assign to phases:
   - Pre-Planning: Start to Announcement Memo
   - Planning: Announcement Memo to Tollgate (includes 10-day post-CoVal rule)
   - Fieldwork: Post-Tollgate to End of Fieldwork
   - Reporting: End of Fieldwork to Report Date
3. Generate weekly allocations based on phase durations

**Formula:**
```
Weekly Hours per Role = (Phase Total Hours × Role %) ÷ Weeks in Phase
```

## Standard Role Allocation Ratios

Use these percentages when distributing fixed budgets:

**By Role (Total Budget):**
- Director: 2-5%
- Senior Manager: 10-15%
- Manager: 20-30%
- Testers (combined): 50-65%

**Individual Tester Distribution:**
When multiple testers are on the team, distribute tester hours based on:
- Control assignments (evenly distributed or by complexity)
- Individual capacity and availability
- Skill level and experience

**Example (3 testers, 450 total tester hours):**
- Senior Specialist 1: 160 hours (35% of tester hours) - 3 complex controls
- Senior Specialist 2: 150 hours (33% of tester hours) - 3 standard controls
- Specialist 1: 140 hours (32% of tester hours) - 3 simple/standard controls

**Validation Check:**
- Manager ≈ 2x Senior Manager
- Testers (combined) ≈ 2x Manager
- Individual tester hours proportional to control assignment complexity

## Quick Calculation References

### Per Control Rates
- **Testers**: 30-60 hours per control (depends on complexity)
  - Simple: 30 hours
  - Standard: 40 hours
  - Complex: 50-60 hours
- **Manager (1st level review)**: 4 hours per control
- **Senior Manager (2nd level review)**: 2 hours per control
- **Director (3rd level review)**: 1 hour per complex control

### Standard Ratios
- Director: 2-5% of total budget
- Senior Manager: 10-15% of total budget
- Manager: 20-30% of total budget
- Testers Combined: 50-65% of total budget

### Phase Percentages
- Planning: 25-30% of total budget
- Fieldwork: 50-55% of total budget
- Reporting: 10-12% of total budget
- Buffer: Always 10% contingency

### Doubling Rule Check
- Each level ≈ 2x the level above
- Minimum ratio: 1.5x
- Maximum ratio: 2.5x
- Ideal ratio: 2.0x

### Smoothing Guidelines
- Target: 40 hours/week for full allocation
- Variation: ±5 hours week-to-week acceptable
- Ramp-up: Start 20-30% below target in week 1
- Ramp-down: Reduce 20-30% in final week
- PTO adjustment: Redistribute ±20% to adjacent weeks

## Common Constraints and Solutions

### Resource at Capacity (40 hours/week)
- Shift hours to other team members in same role
- Smooth hours across more weeks (extend timeline slightly)
- Reduce concurrent audit commitments
- Utilize temporary resource augmentation

### Holiday/PTO Conflicts
- Redistribute hours to adjacent weeks (±20% adjustment)
- Shift control assignments to available testers
- Front-load or back-load work around absences
- Utilize buffer hours for coverage
- Accept reduced weekly hours if timeline permits

### Concurrent Audit Demands
- Stagger intensive phases across audits
- Share resources during low-intensity phases
- Smooth hours to maintain consistent 30-35 hr/week across all audits
- Prioritize higher-risk audits during capacity conflicts

### Uneven Control Distribution
**Problem**: Control complexity creates uneven tester workloads

**Solutions**:
- Balance by assigning mix of simple/standard/complex to each tester
- Adjust distribution: Give more complex controls to senior specialists
- Accept 10-20% variance in total tester hours as reasonable
- Consider partial control sharing if complexity allows

### Smoothing Creates Timeline Extensions
**Problem**: Smoothing to 40 hrs/week requires more weeks than available

**Solutions**:
- Accept higher weekly hours during peak (45-50 hrs for 2-3 weeks)
- Reduce scope or control count
- Add temporary tester resource
- Compress review cycles

### Doubling Rule Creates Over-Budget Scenario
**Problem**: Strict application of doubling rule exceeds budget

**Solutions**:
- Compress ratios to 1.5x or 1.7x instead of 2x
- Adjust team composition (fewer levels, more concentrated work)
- Apply doubling rule only in primary phases
- Accept variance in fieldwork phase where testers dominate

**Example Adjustment:**
```
Original (Over Budget):
- Senior Manager: 50 hours
- Manager: 100 hours (2x)
- Testers: 200 hours (2x)
Total: 350 hours for 250 budget

Adjusted (Within Budget):
- Senior Manager: 40 hours
- Manager: 70 hours (1.75x)
- Testers: 140 hours (2x)
Total: 250 hours
```

## Output Format Guidelines

### Excel/Spreadsheet Format
- Tab 1: Summary (Budget Parameters, Role Allocation, Phase Distribution)
- Tab 2: Control-Based Calculation (if applicable)
- Tab 3: Weekly Schedule with calendar dates
- Tab 4: Formula Reference (optional, if requested)

### Table Format
Present in hierarchical tables:
1. Budget Parameters table
2. Role-Based Allocation table
3. Phase Distribution table
4. Control-Based Adjustment table (if applicable)
5. Weekly Schedule table

### Narrative Format
Structure as:
1. **Budget Parameters** section
2. **Role-Based Allocation** section with Doubling Rule validation
3. **Phase Distribution** section with percentages
4. **Control-Based Adjustment** section (if applicable)
5. **Weekly Schedule** section

## Resources

This skill includes a comprehensive reference file with detailed examples, formulas, and best practices:

### references/
- **budgeting_guide.md**: Complete Audit Budgeting Guide with detailed methodologies, milestone-based planning formulas, CoVal-triggered budget updates, and practical examples across audit types
