# Monarch Money — GraphQL Mutation Reference (V2)

All mutations go to `https://api.monarch.com/graphql` with `Authorization: Token <hex>`. See `api.md` for request headers and token loading.

Safety note: confirm with user before write operations unless request is unambiguous.

---

## Transactions

### Create transaction (V2)

```graphql
mutation Common_CreateTransactionMutation($input: CreateTransactionMutationInput!) {
  createTransaction(input: $input) {
    transaction { id }
    errors { message code fieldErrors { field messages } }
  }
}
```

Example variables:

```json
{
  "input": {
    "accountId": "<account-id>",
    "name": "Amazon",
    "amount": -42.69,
    "date": "2026-03-07",
    "category": "Shopping",
    "notes": "optional"
  }
}
```

### Update transaction (V2)

```graphql
mutation Common_UpdateTransaction($input: UpdateTransactionMutationInput!) {
  updateTransaction(input: $input) {
    transaction { id amount date hideFromReports category { id name } merchant { id name } }
    errors { message code fieldErrors { field messages } }
  }
}
```

Common fields in `UpdateTransactionMutationInput`:
- `id` (transaction id)
- `category` (category name string)
- `hideFromReports` (boolean)
- `name`, `date`, `amount`, `notes`, `ownerUserId`, `businessEntityId`

### Delete transaction (V2)

```graphql
mutation Common_DeleteTransactionMutation($input: DeleteTransactionMutationInput!) {
  deleteTransaction(input: $input) {
    deleted
    errors { message code fieldErrors { field messages } }
  }
}
```

Example variables:

```json
{ "input": { "id": "<transaction-id>" } }
```

### Bulk update transactions (V2)

```graphql
mutation Common_BulkUpdateTransactionsMutation(
  $selectedTransactionIds: [ID!]
  $excludedTransactionIds: [ID!]
  $allSelected: Boolean!
  $expectedAffectedTransactionCount: Int!
  $updates: TransactionUpdateParams!
  $filters: TransactionFilterInput
) {
  bulkUpdateTransactions(
    selectedTransactionIds: $selectedTransactionIds
    excludedTransactionIds: $excludedTransactionIds
    updates: $updates
    allSelected: $allSelected
    expectedAffectedTransactionCount: $expectedAffectedTransactionCount
    filters: $filters
  ) {
    success
    affectedCount
    errors { message }
  }
}
```

Example variables (bulk recategorize specific ids):

```json
{
  "selectedTransactionIds": ["<tx-1>", "<tx-2>"],
  "excludedTransactionIds": [],
  "allSelected": false,
  "expectedAffectedTransactionCount": 2,
  "updates": { "categoryId": "<category-id>" },
  "filters": null
}
```

Common `updates` fields (`TransactionUpdateParams`):
- `categoryId`, `merchantName`, `date`, `notes`, `hide`, `tags`, `reviewStatus`, `goalId`, `isRecurring`, `ownerUserId`, `businessEntityId`

---

## Transaction Rules (V2)

### Create rule

```graphql
mutation Common_CreateTransactionRuleMutationV2($input: CreateTransactionRuleInput!) {
  createTransactionRuleV2(input: $input) {
    errors { message code fieldErrors { field messages } }
  }
}
```

### Update rule

```graphql
mutation Common_UpdateTransactionRuleMutationV2($input: UpdateTransactionRuleInput!) {
  updateTransactionRuleV2(input: $input) {
    errors { message code fieldErrors { field messages } }
  }
}
```

### Delete rule

```graphql
mutation Common_DeleteTransactionRule($id: ID!) {
  deleteTransactionRule(id: $id) {
    deleted
    errors { message code fieldErrors { field messages } }
  }
}
```

### Rule input patterns (validated)

Operator values for merchant criteria are lowercase strings like `eq` and `contains`.

Example create-rule input (safe scoped auto-categorization):

```json
{
  "input": {
    "merchantCriteria": [{ "operator": "eq", "value": "vanguard real estate index institutional" }],
    "accountIds": ["<retirement-account-id>"],
    "categoryIds": ["<uncategorized-category-id>"],
    "setCategoryAction": "<investments-category-id>",
    "applyToExistingTransactions": true
  }
}
```

Useful `CreateTransactionRuleInput` fields:
- Criteria: `merchantCriteria`, `merchantNameCriteria`, `originalStatementCriteria`, `accountIds`, `categoryIds`, `amountCriteria`, ownership/business-entity criteria
- Actions: `setCategoryAction`, `setMerchantAction`, `setHideFromReportsAction`, `addTagsAction`, `reviewStatusAction`, `linkGoalAction`, `linkSavingsGoalAction`, ownership/business-entity actions
- `applyToExistingTransactions`

---

## Tags

### Set tags on transaction (V2)

```graphql
mutation Common_SetTransactionTags($input: SetTransactionTagsInput!) {
  setTransactionTags(input: $input) {
    transaction { id tags { id name } }
    errors { message code fieldErrors { field messages } }
  }
}
```

### Create tag (V2)

```graphql
mutation Common_CreateTransactionTag($input: CreateTransactionTagInput!) {
  createTransactionTag(input: $input) {
    tag { id name color order transactionCount }
    errors { message }
  }
}
```

---

## Accounts / Budgets / Goals / Insights

These operations can vary by account entitlements and schema rollout. Use the same pattern:
- prefer input-style mutations (`...($input: SomeInput!)`)
- request minimal fields first
- if generic GraphQL errors appear, re-check current schema from live app bundle/source map and retry
- mutation signature probes may return the same generic 400 payload for multiple failure modes; do not assume the first guessed signature is correct
