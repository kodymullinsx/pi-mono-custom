---
name: monarch
description: "Monarch Money financial intelligence. Use for ANY request about finances, spending, budgets, net worth, recurring bills, categorization, cashflow, goals, transaction rules, or account management. Triggers: 'how are my finances', 'run monarch', 'financial brief', 'what did I spend on X', 'what bills are coming up', 'anything look off', 'categorize this', 'set a budget', 'create a rule', or the daily cron at 8:03am ET. Makes live GraphQL API calls, then delivers analytical narrative to Discord."
---

# Monarch Money — Financial Intelligence Skill

## How to query the API

Read `references/api.md` for the Python request pattern (curl_cffi required — Monarch blocks standard HTTP clients), required headers, and token loading. Then read `references/queries.md` for ready-to-use GraphQL queries and `references/mutations.md` for write operations.

Canonical local project path: `/Users/kodymullins/Projects/Monarch Money`.

Use these local helpers when relevant:
- `/Users/kodymullins/Projects/Monarch Money/monarch refresh` — canonical token refresh. Captures a live browser-session token via browser-tools and writes `MONARCH_TOKEN` back to `.env`.
- `/Users/kodymullins/Projects/Monarch Money/monarch brief` — standard monthly brief.
- `/Users/kodymullins/Projects/Monarch Money/monarch overview` — broader direct-GraphQL overview.
- `/Users/kodymullins/Projects/Monarch Money/monarch spend Uber --field merchant --exact` — exact merchant/category spend lookup without writing a one-off query.
- `/Users/kodymullins/Projects/Monarch Money/monarch review-queue --limit 20` — aggregate the current `needsReview` queue.
- `/Users/kodymullins/Projects/Monarch Money/monarch review-plan --limit 20` — convert the review queue into review/recategory/relabel/manual buckets plus draft rules/tags.
- `/Users/kodymullins/Projects/Monarch Money/monarch smoke-test` — validates the local JS API layer.

For anything more specific, write queries directly using the patterns in the reference files or reuse the local JS client at `/Users/kodymullins/Projects/Monarch Money/js-api/`.

Full GraphQL operation library with verbosity variants: `references/operations.ts`.

## Session-validated API behavior (2026-03-08)

- Endpoint is `https://api.monarch.com/graphql`.
- In `monarchmoney-ts-main`/`monarchmoney-ts-mcp` style clients, explicitly set `baseURL` to `https://api.monarch.com`. The `api.monarchmoney.com` path returned `525` in session tests.
- `MONARCH_TOKEN` works for reads and writes and is the canonical credential in this setup. `MONARCH_SESSION_TOKEN`/`MONARCH_USER_TOKEN` may return 401.
- Introspection is disabled for non-admin users.
- Transaction writes use V2 input-style mutations (`updateTransaction(input: ...)`, `bulkUpdateTransactions(...)`).
- Transaction rules use V2 schema (`createTransactionRuleV2`, `updateTransactionRuleV2`, `TransactionRuleV2` fields).
- If GraphQL returns generic errors like `Something went wrong while processing: None`, first suspect an outdated field/mutation shape.
- `aggregates(...)` cashflow responses are often arrays. Read summary values from `summary[0].summary`.
- `institutions { ... }` can fail with 400. Use `credentials { institution { ... } }` or `Web_GetInstitutionSettings`.
- Merchant queries should not request `totalAmount`; use `transactionCount` (or `transactionsCount` only if confirmed).
- Some recurring query fields vary by account/schema. Start from minimal known-good fields and expand only if needed.
- Prefer `Common_GetJointPlanningData` (`budgetData(startMonth:endMonth)`) over legacy `budgets(...)`.
- The local `monarch_overview.py` budget watch is now day-aware for the current month: compare category spend to month progress, not just final-budget percent used.
- Some Monarch accounts use `budgetSystem: groups_and_categories`; if category budgets appear empty, fall back to `monthlyAmountsByCategoryGroup` before declaring budget data unavailable.
- Use `merchant_spend.py` / `./monarch spend` for exact merchant/category lookups before writing ad hoc transaction-search queries.
- Use `review_queue.py` / `./monarch review-queue` to size and cluster the current review backlog before proposing cleanup work.
- Use `review_plan.py` / `./monarch review-plan` when the user wants to turn the review backlog into recategorize/relabel/rule/tag actions.
- If auth is the problem, refresh the token from the live browser session first; if auth is fine but GraphQL fails, suspect stale field shape before blaming the token.
- Budget queries can still fail on some accounts/schemas; treat budget checks as best-effort, not required for completion.
- Net worth history: use `aggregateSnapshots(filters: { startDate, endDate })` — NOT `netWorthHistory` (invalid field). Fields are `balance` (net worth), `assetsBalance`, `liabilitiesBalance` (negative). Validated 2026-03-17.

## Capabilities

### Read operations
- Account balances, net worth, net worth history
- Transactions (filtered, searched, paginated, hidden)
- Cashflow summaries and breakdowns (by category, merchant, account, month)
- Budget status, goals, bills
- Recurring streams and upcoming items
- Categories, tags, merchants
- Credit score and history
- Insights and notifications
- Institution connection status
- Subscription details

### Write operations
- Create, update, delete transactions
- Split transactions
- Create, update, delete transaction rules (auto-categorization)
- Bulk update/hide/unhide transactions
- Set budget amounts
- Create, update, delete goals
- Create, update, delete categories and tags
- Tag/untag transactions
- Create manual accounts; update or delete accounts
- Trigger account refresh
- Review or dismiss recurring streams
- Dismiss insights

## Analysis protocol

Run in order for daily briefs. Go deep on flags; skip sections where nothing changed.

### 1. Data integrity and connection artifacts

Before analyzing trends, check for account reconnection artifacts:
- Long flat net worth plateaus followed by a sudden drop/rise often indicate disconnected/re-added accounts, not real financial change.
- Use institution/account status queries (`Web_GetInstitutionSettings`, `accounts(filters: {includeDeleted: true})`) to confirm missing or deleted credentials/accounts.
- Call out artifact windows explicitly and exclude them from behavioral conclusions.

### 2. Categorization integrity

Pull transactions for the current month. Look for "Uncategorized" with large amounts — almost always investment fund activity (Vanguard, Schwab, Fidelity), internal transfers, or payroll entries miscategorized by Monarch. Name the specific merchant, amount, and date. Suggest the exact rule and scope (merchant + account + optional current-category filter).

Also look for the same merchant appearing under different categories across months (rule misconfiguration), and transfer amounts that look like real spending.

### 3. Recurring bill check

Use `recurringTransactionStreams` for known recurring charges. Compare against what posted this month. Use `recurringTransactionItems` with a date window for expected upcoming items.

Flag: bills that did not post, amounts that changed (`amountDiff != 0`), new streams, or inactive streams still charging.

### 4. Spending patterns (3-month)

Run cashflow aggregates for current month and prior 2 months. Compare category-level spending trends. Look for sustained directional changes (3 consecutive months), not month-to-month noise. Distinguish seasonal from behavioral.

### 5. Cash flow health

Is savings rate improving, declining, or flat? Flag negative savings months with context: one-time event vs pattern. Note income changes.

### 6. Budget status (best effort)

If budget queries succeed: categories over 100% need attention; over 80% are watch items. If budget query fails due schema drift, explicitly state that budget data was unavailable.

### 7. Upcoming (next 7-14 days)

Run `recurringTransactionItems` for next 14 days. Items with `isPast: false AND transactionId: null` are expected but not yet posted.

## Ad-hoc queries

When user asks a specific question (not a full brief), answer directly:

- "What did I spend on groceries?" -> prefer `/Users/kodymullins/Projects/Monarch Money/monarch spend groceries --field category` first
- "Any new subscriptions?" -> recurring streams + recent transaction deltas
- "Set dining budget to $400" -> `updateBudgetItem(...)`
- "Create a rule for Vanguard" -> `createTransactionRuleV2(input: ...)`
- "How much did I spend at Amazon?" -> prefer `/Users/kodymullins/Projects/Monarch Money/monarch spend Amazon` first
- "What are the 121 transactions I need to review?" -> start with `/Users/kodymullins/Projects/Monarch Money/monarch review-queue --limit 20`
- "Which of these need recategorizing or new rules?" -> prefer `/Users/kodymullins/Projects/Monarch Money/monarch review-plan --limit 20` first
- "Hide this transaction" -> `updateTransaction(input: { id, hideFromReports: true })`
- "Tag these as vacation" -> create tag if needed, then `setTransactionTags(input: ...)`
- "Refresh my accounts" -> `requestAccountsRefresh(accountIds: ...)`

For write operations, always confirm with the user before executing unless the request is unambiguous.

## Output format

Write a genuine analytical narrative using Kody's writing style (see USER.md): direct, no emojis, sentence case headings, minimal formatting.

Structure for daily briefs:
1. Headline — one sentence on the overall picture
2. Flags — specific items needing attention, ordered by priority; name merchant, amount, date, and exact fix
3. Patterns — 2-3 sentences on 3-month trends, signal vs. noise
4. Upcoming — expected bills in next 1-2 weeks
5. One question — one specific question to prompt a decision

If nothing is wrong, say so in one sentence and move to forward look.

For ad-hoc queries, answer directly — no need for full brief structure.

## Delivery

After completing the analysis, post to Discord channel `1480146170310299732`:

```bash
openclaw message send --channel discord --target "channel:1480146170310299732" --message "<analysis text>"
```

Discord has a 2000-character limit per message. If analysis exceeds that, split into 2-3 logical chunks and send sequentially.

## Memory

Update in `~/projects/Memory/personal/finance/memory.md`:
- Confirmed recurring bill baselines (merchant, typical amount, timing, account)
- Category 3-month averages
- Known categorization issues (for example, recurring merchant/category drift)
- User-stated goals or spending concerns
- Confirmed one-time events (to avoid repeated false anomaly flags)
- Rules created (to avoid duplicate suggestions)

Do not store: specific monthly totals, transaction-level detail, or balances that will go stale.
