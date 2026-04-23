# Monarch Money API Reference

## Endpoint and Auth

```
POST https://api.monarch.com/graphql
Authorization: Token <64-char hex>
Content-Type: application/json
```

Token loaded from: `/Users/kodymullins/Projects/Monarch Money/.env` key `MONARCH_TOKEN`.

## Session-validated notes (2026-03-08)

- Use `MONARCH_TOKEN`. Other local tokens (for example `MONARCH_SESSION_TOKEN` / `MONARCH_USER_TOKEN`) may return 401.
- For `monarchmoney-ts-main` style clients, force `baseURL: "https://api.monarch.com"`. Using `https://api.monarchmoney.com` produced consistent `525` failures in tests.
- Introspection is disabled for non-admin users.
- Write operations are sensitive to schema shape and headers; use the V2 docs in `mutations.md`.
- Generic GraphQL errors like `Something went wrong while processing: None` usually indicate wrong field names or old mutation structure.

## Python Request Pattern

Monarch is behind Cloudflare. Standard clients may fail with 525. Use `curl_cffi` and Chrome impersonation.

```python
from curl_cffi.requests import Session

def load_token():
    env = {}
    for line in open('/Users/kodymullins/projects/Monarch Money/.env'):
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    return env['MONARCH_TOKEN']

TOKEN = load_token()

DEFAULT_HEADERS = {
    'Accept': 'application/json',
    'Client-Platform': 'web',
    'Origin': 'https://app.monarchmoney.com',
    'x-cio-client-platform': 'web',
    'x-cio-site-id': '2598be4aa410159198b2',
    'x-gist-user-anonymous': 'false',
}

def gql(query, variables=None):
    with Session(impersonate='chrome110') as s:
        headers = {**DEFAULT_HEADERS, 'Authorization': f'Token {TOKEN}'}
        r = s.post(
            'https://api.monarch.com/graphql',
            json={'query': query, 'variables': variables or {}},
            headers=headers,
        )
        data = r.json()
        if 'errors' in data:
            raise RuntimeError(data['errors'])
        return data.get('data', {})
```

## TypeScript Client Pattern (monarchmoney-ts-main)

```ts
import { MonarchClient } from "monarchmoney-ts";

const client = new MonarchClient({
  token: process.env.MONARCH_TOKEN!,
  baseURL: "https://api.monarch.com",
});
```

## Token Refresh

If API returns 401/403, prefer the local browser-tools capture path:
1. Run `/Users/kodymullins/Projects/Monarch Money/monarch refresh`
2. That command reuses Chrome, captures the live `Authorization: Token ...` header from `https://api.monarch.com/graphql`, and updates `MONARCH_TOKEN` in `/Users/kodymullins/Projects/Monarch Money/.env`
3. If you need deeper debugging, run `/Users/kodymullins/Projects/Monarch Money/monarch capture-network -- --output /tmp/monarch-network.json`

## Local CLI shortcuts

For common local work, prefer the repo entrypoint:

```bash
/Users/kodymullins/Projects/Monarch Money/monarch overview
/Users/kodymullins/Projects/Monarch Money/monarch brief --weeks 4
/Users/kodymullins/Projects/Monarch Money/monarch spend Uber --field merchant --exact
/Users/kodymullins/Projects/Monarch Money/monarch smoke-test
```

Use `./monarch spend` / `merchant_spend.py` for quick spend questions before writing custom transaction queries.

## Date Format

All dates are `YYYY-MM-DD` strings.

```python
from calendar import monthrange
from datetime import datetime

now = datetime.now()
year, month = now.year, now.month
last_day = monthrange(year, month)[1]
start = f"{year}-{month:02d}-01"
end = f"{year}-{month:02d}-{last_day:02d}"
```
