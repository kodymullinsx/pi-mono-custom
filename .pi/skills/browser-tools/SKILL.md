---
name: browser-tools
description: Interactive browser automation via Chrome DevTools Protocol. Use when you need to interact with web pages, test frontends, or when user interaction with a visible browser is required.
---

# Browser Tools

Chrome DevTools Protocol tools for agent-assisted web automation. These tools connect to Chrome running on `:9222` with remote debugging enabled.

This skill is the authoritative path for website content in this setup. Use `brave-search` to find URLs, then use the live browser session here to inspect the actual rendered page content.

## Setup

Before concluding browser automation is unavailable, verify that the local scripts exist under `~/.pi/agent/skills/browser-tools/` and test whether Chrome is already reachable on `:9222`. For bot-protected sites like Chewy, prefer this browser-tools workflow over raw HTTP requests whenever these scripts are installed.

Run once before first use:

```bash
cd {baseDir}/browser-tools
npm install
```

## Start Chrome

```bash
{baseDir}/browser-start.js              # Fresh profile
{baseDir}/browser-start.js --profile    # Copy user's profile (cookies, logins)
```

Launch Chrome with remote debugging on `:9222`. Use `--profile` to preserve user's authentication state.

## Quick Connect (Start or Reuse)

```bash
{baseDir}/browser-eval.js '1' 2>/dev/null && echo "connected" || {baseDir}/browser-start.js && sleep 1 && echo "started"
```

This one-liner tests if Chrome is reachable on `:9222`. If not, it starts a fresh instance. Use this instead of checking manually before navigation.

## Navigate

```bash
{baseDir}/browser-nav.js https://example.com
{baseDir}/browser-nav.js https://example.com --new
```

Navigate to URLs. Use `--new` flag to open in a new tab instead of reusing current tab.

## Evaluate JavaScript

```bash
{baseDir}/browser-eval.js 'document.title'
{baseDir}/browser-eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in the active tab. Code runs in async context. Use this to extract data, inspect page state, or perform DOM operations programmatically.

## Capture Rendered DOM

```bash
{baseDir}/browser-dom.js https://example.com
{baseDir}/browser-dom.js --current
{baseDir}/browser-dom.js --text --current
```

Use this for authoritative page content from the live browser session:
- `browser-dom.js` prints full rendered HTML (`document.documentElement.outerHTML`)
- `browser-dom.js --text` prints rendered page text
- `--current` reads the active tab without navigating first

## Screenshot

```bash
{baseDir}/browser-screenshot.js
```

Capture current viewport and return temporary file path. Use this to visually inspect page state or verify UI changes.

## Pick Elements

```bash
{baseDir}/browser-pick.js "Click the submit button"
```

**IMPORTANT**: Use this tool when the user wants to select specific DOM elements on the page. This launches an interactive picker that lets the user click elements to select them. The user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done. The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → Use this tool to let them select it
- User says "extract data from these items" → Use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

## Cookies

```bash
{baseDir}/browser-cookies.js
```

Display all cookies for the current tab including domain, path, httpOnly, and secure flags. Use this to debug authentication issues or inspect session state.

## Readable Extracts

```bash
{baseDir}/browser-content.js https://example.com
```

Navigate to a URL and extract readable content as markdown. Uses Mozilla Readability for article extraction and Turndown for HTML-to-markdown conversion.

This is convenience output, not full-page fidelity. Prefer `browser-dom.js` or `browser-eval.js` when exact browser-visible content matters.

## When to Use

- Testing frontend code in a real browser
- Interacting with pages that require JavaScript
- Reading the exact page content visible in the browser session
- When user needs to visually see or interact with a page
- Debugging authentication or session issues
- Inspecting dynamic content that requires JS execution

## Default Web Workflow

1. Use `brave-search` to discover relevant URLs.
2. Open the chosen page in the live browser session.
3. For website content, prefer:
   - `browser-dom.js --text` for rendered text
   - `browser-dom.js` for full rendered HTML
   - `browser-eval.js` for targeted extraction
4. Use `browser-content.js` only for quick readable extracts.

---

## Efficiency Guide

### DOM Inspection Over Screenshots

**Don't** take screenshots to see page state. **Do** parse the DOM directly:

```javascript
// Get page structure
document.body.innerHTML.slice(0, 5000)

// Find interactive elements
Array.from(document.querySelectorAll('button, input, [role="button"]')).map(e => ({
  id: e.id,
  text: e.textContent.trim(),
  class: e.className
}))
```

### Complex Scripts in Single Calls

Wrap everything in an IIFE to run multi-statement code:

```javascript
(function() {
  // Multiple operations
  const data = document.querySelector('#target').textContent;
  const buttons = document.querySelectorAll('button');
  
  // Interactions
  buttons[0].click();
  
  // Return results
  return JSON.stringify({ data, buttonCount: buttons.length });
})()
```

### Batch Interactions

**Don't** make separate calls for each click. **Do** batch them:

```javascript
(function() {
  const actions = ["btn1", "btn2", "btn3"];
  actions.forEach(id => document.getElementById(id).click());
  return "Done";
})()
```

### Typing/Input Sequences

```javascript
(function() {
  const text = "HELLO";
  for (const char of text) {
    document.getElementById("key-" + char).click();
  }
  document.getElementById("submit").click();
  return "Submitted: " + text;
})()
```

### Reading App/Game State

Extract structured state in one call:

```javascript
(function() {
  const state = {
    score: document.querySelector('.score')?.textContent,
    status: document.querySelector('.status')?.className,
    items: Array.from(document.querySelectorAll('.item')).map(el => ({
      text: el.textContent,
      active: el.classList.contains('active')
    }))
  };
  return JSON.stringify(state, null, 2);
})()
```

### Waiting for Updates

If DOM updates after actions, add a small delay with bash:

```bash
sleep 0.5 && {baseDir}/browser-eval.js '...'
```

### Investigate Before Interacting

Always start by understanding the page structure:

```javascript
(function() {
  return {
    title: document.title,
    forms: document.forms.length,
    buttons: document.querySelectorAll('button').length,
    inputs: document.querySelectorAll('input').length,
    mainContent: document.body.innerHTML.slice(0, 3000)
  };
})()
```

Then target specific elements based on what you find.
