# Monarch Money — GraphQL Query Reference (validated + practical)

All queries go to `https://api.monarch.com/graphql` with `Authorization: Token <hex>`. See `api.md` for headers and request pattern.

## Stability notes (2026-03-08)

- Prefer minimal field sets first; expand only after validation.
- Transaction rules are `TransactionRuleV2` (legacy fields like `name`/`priority` may fail).
- Recurring endpoints work, but some optional fields can fail depending on account/schema.
- `aggregates(...)` may return arrays; parse `summary[0].summary` instead of assuming an object.
- Root `institutions` queries can fail; prefer `credentials` and `Web_GetInstitutionSettings`.
- Merchant field `totalAmount` is stale in tested schemas; use `transactionCount`.
- Budget endpoints can fail for some accounts; treat as best-effort.

---

## Accounts

### All accounts (net worth calc)

```graphql
query {
  accounts {
    id
    displayName
    currentBalance
    includeInNetWorth
    isHidden
    isAsset
    type { name }
  }
}
```

### Net worth history (daily snapshots)

```graphql
query Common_GetAggregateSnapshots($filters: AggregateSnapshotFilters) {
  aggregateSnapshots(filters: $filters) {
    date
    balance
    assetsBalance
    liabilitiesBalance
  }
}
```

Variables: `{ "filters": { "startDate": "2025-01-01", "endDate": "2026-03-17" } }`

Note: `netWorthHistory` is NOT a valid field — it returns schema errors. Use `aggregateSnapshots` with date filters. Fields are `balance` (net worth), `assetsBalance`, `liabilitiesBalance` (negative value).

---

## Cashflow

### Summary + category breakdown

```graphql
query($f: TransactionFilterInput) {
  summary: aggregates(filters: $f, fillEmptyValues: true) {
    summary { sumIncome sumExpense savings savingsRate }
  }
  byCategory: aggregates(filters: $f, groupBy: ["category"]) {
    groupBy { category { id name group { type } } }
    summary { sum }
  }
}
```

Parsing note:
- Treat `summary` as an array and read totals from `summary[0].summary`.

Filter template:

```json
{
  "f": {
    "startDate": "2026-03-01",
    "endDate": "2026-03-31",
    "search": "",
    "categories": [],
    "accounts": [],
    "tags": []
  }
}
```

---

## Transactions

### Standard list (safe shape)

```graphql
query($f: TransactionFilterInput) {
  allTransactions(filters: $f) {
    totalCount
    results(limit: 500) {
      id
      amount
      date
      pending
      hideFromReports
      merchant { name }
      category { id name group { type } }
      account { id displayName }
    }
  }
}
```

### Smart search

```graphql
query($search: String, $startDate: String, $endDate: String, $limit: Int) {
  allTransactions(filters: {
    search: $search
    startDate: $startDate
    endDate: $endDate
    transactionVisibility: non_hidden_transactions_only
  }) {
    totalCount
    results(limit: $limit, orderBy: DATE_DESC) {
      id
      amount
      date
      merchant { name }
      category { id name }
      account { id displayName }
    }
  }
}
```

### Transaction details

```graphql
query Common_GetTransactionDrawer($id: UUID!) {
  getTransaction(id: $id) {
    id
    amount
    date
    notes
    hideFromReports
    isRecurring
    reviewStatus
    needsReview
    merchant { id name }
    category { id name group { type } }
    account { id displayName }
    tags { id name }
    splits { id amount category { id name } }
  }
}
```

---

## Transaction Rules (V2)

### Rules settings query (validated)

```graphql
query Mobile_RulesSettingsScreenQuery {
  transactionRules {
    id
    order
    merchantCriteriaUseOriginalStatement
    merchantCriteria { operator value }
    merchantNameCriteria { operator value }
    originalStatementCriteria { operator value }
    accountIds
    categoryIds
    setCategoryAction { id name }
    setMerchantAction { id name }
    setHideFromReportsAction
    reviewStatusAction
    sendNotificationAction
    markNeedsReviewAction
    markReviewedAction
    unassignNeedsReviewByUserAction
  }
}
```

---

## Institutions

### Minimal institutions via credentials (safe fallback)

```graphql
query {
  credentials {
    id
    institution {
      id
      name
      url
    }
  }
}
```

### Full institution settings (validated)

```graphql
query Web_GetInstitutionSettings {
  credentials {
    id
    updateRequired
    disconnectedFromDataProviderAt
    displayLastUpdatedAt
    dataProvider
    institution {
      id
      name
      url
    }
  }
  accounts(filters: { includeDeleted: true }) {
    id
    displayName
    subtype { display }
    mask
    credential { id }
    deletedAt
  }
  subscription {
    isOnFreeTrial
    hasPremiumEntitlement
  }
}
```

---

## Recurring

### Streams (minimal stable)

```graphql
query($includeLiabilities: Boolean) {
  recurringTransactionStreams(includePending: true, includeLiabilities: $includeLiabilities) {
    stream {
      id
      frequency
      amount
      isActive
      merchant { name }
    }
  }
}
```

### Upcoming items (next 14 days)

```graphql
query($startDate: Date!, $endDate: Date!) {
  recurringTransactionItems(startDate: $startDate, endDate: $endDate) {
    date
    isPast
    transactionId
    amount
    amountDiff
    stream {
      id
      amount
      merchant { name }
    }
  }
}
```

Interpretation:
- `isPast: false` and `transactionId: null` => expected but not posted yet.
- `amountDiff != null && amountDiff != 0` => amount changed.

---

## Budgets (best effort)

```graphql
query Common_GetJointPlanningData($startDate: Date!, $endDate: Date!) {
  budgetSystem
  budgetData(startMonth: $startDate, endMonth: $endDate) {
    totalsByMonth {
      month
      totalIncome { actualAmount plannedAmount remainingAmount }
      totalExpenses { actualAmount plannedAmount remainingAmount }
    }
    monthlyAmountsByCategory {
      category { id }
      monthlyAmounts {
        month
        plannedCashFlowAmount
        actualAmount
        remainingAmount
      }
    }
  }
  categoryGroups {
    id
    name
    type
    categories { id name }
  }
  goalsV2 {
    id
    name
    archivedAt
  }
}
```

If this still fails with generic schema errors on a given account, note budget data as unavailable and continue the brief.

---

## Categories / Tags / Merchants

### Categories

```graphql
query {
  categories {
    id
    name
    group { id name type }
  }
}
```

### Tags

```graphql
query {
  householdTransactionTags {
    id
    name
    color
    order
  }
}
```

### Merchant search

```graphql
query GetMerchants($search: String, $limit: Int, $includeIds: [ID!]) {
  merchants(
    search: $search
    limit: $limit
    orderBy: TRANSACTION_COUNT
    includeIds: $includeIds
  ) {
    id
    name
    transactionCount
    logoUrl
  }
}
```

If `transactionCount` fails on a future rollout, try `transactionsCount` as a fallback field name.
