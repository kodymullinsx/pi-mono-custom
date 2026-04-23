---
name: brave-search
description: Web discovery via Brave Search API. Use it to find relevant sites, docs, and URLs before switching to browser-session DOM access for authoritative page content.
---

# Brave Search

Web discovery using the official Brave Search API. No browser required.

Use this skill to find candidate URLs, compare search results, and do lightweight source triage.

Do not treat Brave content extraction as equivalent to the full page you see in a browser. When exact page fidelity matters, switch to `browser-tools` and read the page through the live browser session with `browser-dom.js` or `browser-eval.js`.

## Setup

Requires a Brave Search API account with a free subscription. A credit card is required to create the free subscription (you won't be charged).

1. Create an account at https://api-dashboard.search.brave.com/register
2. Create a "Free AI" subscription
3. Create an API key for the subscription
4. Add to your shell profile (`~/.profile` or `~/.zprofile` for zsh):
   ```bash
   export BRAVE_API_KEY="your-api-key-here"
   ```
5. Install dependencies (run once):
   ```bash
   cd {baseDir}
   npm install
   ```

## Search

```bash
{baseDir}/search.js "query"                         # Basic search (5 results)
{baseDir}/search.js "query" -n 10                   # More results (max 20)
{baseDir}/search.js "query" --content               # Include quick readable extracts for triage only
{baseDir}/search.js "query" --freshness pw          # Results from last week
{baseDir}/search.js "query" --freshness 2024-01-01to2024-06-30  # Date range
{baseDir}/search.js "query" --country DE            # Results from Germany
{baseDir}/search.js "query" -n 3 --content          # Combined options
```

### Options

- `-n <num>` - Number of results (default: 5, max: 20)
- `--content` - Fetch and include quick readable content as markdown for triage, not full-page fidelity
- `--country <code>` - Two-letter country code (default: US)
- `--freshness <period>` - Filter by time:
  - `pd` - Past day (24 hours)
  - `pw` - Past week
  - `pm` - Past month
  - `py` - Past year
  - `YYYY-MM-DDtoYYYY-MM-DD` - Custom date range

## Quick Content Triage

```bash
{baseDir}/content.js https://example.com/article
```

Fetches a URL and extracts a readable subset as markdown.

This is not the authoritative full page. It may omit JS-rendered content, navigation, sidebars, tables, hidden sections, comments, and other browser-visible details. Use `browser-tools/browser-dom.js` or `browser-tools/browser-eval.js` when the task depends on what is actually rendered in the browser session.

## Output Format

```
--- Result 1 ---
Title: Page Title
Link: https://example.com/page
Age: 2 days ago
Snippet: Description from search results
Content: (if --content flag used)
  Markdown content extracted from the page...

--- Result 2 ---
...
```

## When to Use

- Searching for documentation or API references
- Looking up facts or current information
- Finding likely source URLs before opening them in the browser
- Any task requiring web search without interactive browsing

## Default Workflow

1. Use `brave-search/search.js` to find candidate URLs.
2. Open the best URL in the browser session with `browser-tools`.
3. Use browser-session DOM access for website content:
   - `browser-dom.js --text` for rendered page text
   - `browser-dom.js` for full rendered HTML
   - `browser-eval.js` for targeted DOM queries
