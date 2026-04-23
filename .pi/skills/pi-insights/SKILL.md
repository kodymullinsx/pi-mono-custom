---
name: pi-insights
description: Analyze Pi Coding Agent usage patterns and generate insights reports. Use this skill whenever the user asks for insights, usage analysis, session statistics, productivity reports, workflow patterns, or wants to understand how they use Pi. Also use when user wants to track their Pi usage, see session summaries, identify friction points, or get recommendations for improving their Pi workflow.
---

# Pi Insights

Generate comprehensive usage insights reports for Pi Coding Agent sessions. This skill analyzes your session history to identify patterns, friction points, and improvement opportunities.

## When to Use

- User says "insights", "usage", "analytics", "statistics", "report"
- User wants to know "how I use Pi", "what do I work on most"
- User asks for "session history", "activity summary", "productivity"
- User wants friction analysis or workflow recommendations
- User wants to improve their Pi usage patterns

## What This Skill Produces

A markdown report containing:
1. **Session Statistics** - Total sessions, messages, tokens, duration
2. **Tool Usage** - Which tools (read, write, edit, bash) you use most
3. **Project Areas** - What domains/projects you work on
4. **Goal Categories** - What types of tasks you do (debug, implement, refactor, etc.)
5. **Outcome Analysis** - How often tasks are fully vs partially achieved
6. **Friction Points** - Where things go wrong (misunderstandings, bugs, etc.)
7. **Recommendations** - CLAUDE.md additions, workflow improvements
8. **Interaction Style** - How you interact with Pi (iterative vs upfront specs)

## Data Source

Sessions are stored in:
- `~/.pi/agent/sessions/` - session JSONL files organized by working directory

Each session file contains:
- Message transcripts (user prompts + assistant responses)
- Tool calls and results
- Token usage
- Timestamps

## How to Run

### Step 1: Collect Session Data

Run the collection script to get session metadata:

```bash
~/.pi/agent/skills/pi-insights/scripts/collect_sessions.sh
```

This outputs:
- Session count
- Date range
- Total tokens
- Tool usage summary

### Step 2: Analyze Recent Sessions

Read the latest session files (last 10-20 sessions) from:
```
~/.pi/agent/sessions/
```

For each session, extract:
- `cwd` - working directory
- First user message - what the user asked for
- Tool usage - which tools were called
- Outcome - whether the task was completed
- Any friction visible in the transcript

### Step 3: Generate the Report

Compile findings into a markdown report with this structure:

```markdown
# Pi Usage Insights Report

Generated: [date]

## At a Glance

- Total Sessions: X
- Date Range: X to X
- Total Messages: X
- Total Tokens: X
- Hours of Interaction: X

## Tool Usage

| Tool | Count | % |
|------|-------|---|
| read | X | X% |
| write | X | X% |
| edit | X | X% |
| bash | X | X% |

## Project Areas

What you work on most:
1. **Project A** - X sessions - description
2. **Project B** - X sessions - description

## Goal Categories

What you ask Pi to do:
- Implement Feature: X%
- Debug/Investigate: X%
- Refactor Code: X%
- Understand Codebase: X%
- Write Tests: X%
- Other: X%

## Interaction Style

[Brief analysis of how the user works with Pi:
- Iterative vs upfront specs?
- Short or long prompts?
- Let Pi run or frequently interrupt?
- Task-focused or exploratory?]

## What's Working Well

[Identify 2-3 positive patterns:
- Effective debugging workflow
- Good use of specific file references
- Clear task definitions]

## Friction Points

[Identify areas for improvement:
- Tasks that often require multiple iterations
- Areas where Pi misunderstands
- Tool usage inefficiencies]

## Recommendations

### CLAUDE.md Additions

Suggest specific lines to add to project AGENTS.md files:

```markdown
## Workflow
- [Specific instruction based on your patterns]
```

### Suggested Workflow Improvements

1. **[Specific recommendation]**
   - Why: [Based on actual session patterns]
   - How: [Concrete suggestion]

2. **[Another recommendation]**

### Features to Explore

If not already using:
- **Skills** - Reusable prompts for common workflows
- **Extensions** - Custom tools and commands
- **Prompt Templates** - Pre-built prompts for recurring tasks
- **Themes** - Visual customization

## Session Highlights

### Most Productive Session
[Session that accomplished the most]

### Memorable Moment
[An interesting or funny exchange from transcripts]
```

## Session Analysis Guide

When analyzing individual sessions, look for:

### Goal Detection
Count explicit user requests:
- "please", "can you", "I need", "let's" = explicit goals
- Don't count Claude's autonomous exploration

### Outcome Assessment
- **fully_achieved**: User confirmed success, task complete
- **mostly_achieved**: Task done but with issues
- **partially_achieved**: Some progress but incomplete
- **not_achieved**: Task abandoned or failed

### Satisfaction Signals
- Positive: "thanks", "perfect", "great", "looks good"
- Negative: "that's not right", "try again", "broken"
- Neutral: "ok" (continuing without complaint)

### Friction Categories
- `misunderstood_request` - Claude interpreted incorrectly
- `wrong_approach` - Right goal, wrong solution
- `buggy_code` - Code didn't work
- `excessive_changes` - Over-engineered
- `slow_verbose` - Too slow or verbose

## Tips

- Analyze at least 10 sessions for meaningful insights
- Focus on recent sessions (last 30 days)
- Look for patterns across multiple sessions
- Identify recurring instructions the user gives Pi (candidates for CLAUDE.md)

## Output

Present the report directly in the conversation. Offer to:
- Save it to a file
- Focus on specific aspects (e.g., "just the friction points")
- Generate suggestions for a specific project