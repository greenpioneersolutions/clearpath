# Project Conventions — CoPilot Commander e2e

This file documents this project's specific conventions, helpers, and patterns for the WebdriverIO Electron e2e suite. Read this alongside the general reference files.

## File Layout

| File | Role |
|------|------|
| `e2e/helpers/app.ts` | Shared test utilities — navigation, waits, DOM helpers, IPC access |
| `e2e/helpers/screenshots.ts` | Failure screenshot capture helper (used by `afterEach` hook) |
| `e2e/screenshot-crawl.spec.ts` | Visual regression crawl — visits every page/tab via `@wdio/visual-service` |
| `wdio.conf.ts` | Main e2e config — functional tests (excludes crawl spec) |
| `wdio.screenshots.conf.ts` | Visual crawl config — runs `screenshot-crawl.spec.ts` only |
| `e2e/*.spec.ts` | Feature test files (smoke, navigation, home, work, insights, configure, etc.) |

## Constants

```typescript
// e2e/helpers/app.ts
export const APP_READY_TIMEOUT = 20000  // 20s — wait for #root
export const ELEMENT_TIMEOUT = 10000    // 10s — individual element interactions
```

## Core Helpers

### waitForAppReady()

Polls for `#root` to exist, then waits 1s for React hydration:

```typescript
export async function waitForAppReady(): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const root = await $('#root')
        return root.isExisting()
      } catch {
        return false
      }
    },
    {
      timeout: APP_READY_TIMEOUT,
      timeoutMsg: `App root element (#root) did not appear within ${APP_READY_TIMEOUT}ms`,
      interval: 500,
    }
  )
  await browser.pause(1000)  // React hydration settle
}
```

Every spec's `before()` hook calls this first.

### navigateSidebarTo(label)

Clicks a sidebar nav link by visible text. Uses XPath — NOT WebdriverIO `=` text selector — because Electron Chromedriver doesn't reliably translate `$('a=Configure')`.

```typescript
export async function navigateSidebarTo(label: string): Promise<void> {
  // Searches entire <aside> — Configure is in a <div> outside <nav>
  const xpath = `//aside//a[contains(., '${label}')]`
  const link = await $(xpath)
  await link.waitForExist({ timeout: ELEMENT_TIMEOUT })
  await link.waitForClickable({ timeout: ELEMENT_TIMEOUT })
  await link.click()
  await browser.pause(500)  // React Router transition settle
}
```

**Known quirk**: "Configure" is pinned to the bottom of the sidebar in a `<div>` outside the main `<nav>` element. Searching the full `<aside>` handles this correctly.

### navigateToConfigureTab(tabKey)

Navigates to Configure page and clicks a specific tab:

```typescript
export async function navigateToConfigureTab(tabKey: string): Promise<void> {
  await navigateSidebarTo('Configure')
  const tabButton = await $(`#tab-${tabKey}`)
  await tabButton.waitForExist({ timeout: ELEMENT_TIMEOUT })
  await tabButton.waitForClickable({ timeout: ELEMENT_TIMEOUT })
  await tabButton.click()
  await browser.pause(500)
}
```

Tab keys: `setup`, `accessibility`, `settings`, `policies`, `integrations`, `extensions`, `memory`, `agents`, `skills`, `wizard`, `workspaces`, `team`, `scheduler`, `branding`

### navigateToHash(hash)

Navigate to a hash route. In Electron (file:// protocol), `browser.url()` doesn't work for hash routing:

```typescript
export async function navigateToHash(hash: string): Promise<void> {
  await browser.execute((h) => {
    window.location.hash = h
  }, hash)
  await browser.pause(500)
}
```

Example: `await navigateToHash('#/work?tab=compose')`

### setInputValue(selector, value)

Sets a React controlled input value. Standard `element.setValue()` doesn't always trigger React's synthetic event system in Electron.

```typescript
export async function setInputValue(selector: string, value: string): Promise<void> {
  await browser.execute(
    (sel, val) => {
      const el = document.querySelector(sel) as HTMLInputElement | null
      if (!el) return
      // Native setter bypasses React's controlled input tracking
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )?.set ?? Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value',
      )?.set
      if (nativeSetter) {
        nativeSetter.call(el, val)
      } else {
        el.value = val
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    selector,
    value,
  )
  await browser.pause(200)
}
```

### getInputValue(selector)

Read a React controlled input's value via `browser.execute` (more reliable than `element.getValue()`):

```typescript
export async function getInputValue(selector: string): Promise<string> {
  return browser.execute((sel) => {
    const el = document.querySelector(sel) as HTMLInputElement | null
    return el?.value ?? ''
  }, selector)
}
```

### invokeIPC(channel, args)

Call an IPC channel directly from the renderer via `window.electronAPI.invoke`. Useful for setting up test state or verifying persistence:

```typescript
export async function invokeIPC(channel: string, args?: unknown): Promise<unknown> {
  return browser.execute(
    (ch, a) => {
      const api = (window as any).electronAPI
      return api.invoke(ch, a)
    },
    channel,
    args,
  )
}
```

Example:
```typescript
const ws = await invokeIPC('workspace:create', {
  name: 'Test Workspace',
  description: 'Temporary for test',
}) as { id: string }
```

### getCriticalConsoleErrors()

Retrieve renderer console errors for debugging:

```typescript
export async function getCriticalConsoleErrors(): Promise<string[]> {
  try {
    const logs = await browser.getLogs('browser')
    return (logs as Array<{ level: string; message: string }>)
      .filter((entry) => entry.level === 'SEVERE' || entry.level === 'ERROR')
      .map((entry) => entry.message)
  } catch {
    return []  // getLogs may not be available in all configurations
  }
}
```

### Other Helpers

| Function | What it does |
|----------|-------------|
| `waitForWorkPage()` | Polls `#root` innerHTML length > 200 (Work page content check) |
| `getTextContents(selector)` | Get visible text from all matching elements |
| `elementWithTextExists(selector, text)` | Check if any element contains text |
| `waitForText(text, timeout?)` | Wait for text to appear anywhere in `<body>` |
| `buttonExists(text)` | Check if button with text exists |
| `clickButton(text)` | Click button by visible text (XPath) |
| `countElements(selector)` | Count matching elements |
| `getRootHTML()` | Get `#root` innerHTML |
| `getToggleState(id)` | Read `aria-checked` from toggle switch |
| `clickToggle(id)` | Click toggle by element id |
| `waitForSelector(selector, timeout?)` | Wait for selector to exist in DOM |
| `mainContentIsRendered()` | Check if `main`/`[role="main"]`/`.flex-1` exists |
| `isConfigureTabSelected(tabKey)` | Check if Configure tab has `aria-selected="true"` |

## ELECTRON_RUN_AS_NODE Fix

Both `wdio.conf.ts` and `wdio.screenshots.conf.ts` have this at the top (before `export const config`):

```typescript
delete process.env.ELECTRON_RUN_AS_NODE
```

VS Code sets `ELECTRON_RUN_AS_NODE=1` in child processes. This causes Electron to launch as a plain Node.js runtime instead of opening the GUI window — the renderer never starts. Deleting it before the config export ensures every test run gets a real Electron window regardless of how the runner was invoked.

## Two-Config Pattern

| Config | `specs` | `exclude` | `services` | Run via |
|--------|---------|-----------|------------|---------|
| `wdio.conf.ts` | `e2e/**/*.spec.ts` | extensions-integration, screenshot-crawl | `['electron']` + visual | `npm run e2e` |
| `wdio.screenshots.conf.ts` | `e2e/screenshot-crawl.spec.ts` | none | `['electron']` + visual | `npm run e2e:screenshots` |

WDIO v9: `--spec` cannot override `exclude`. Since `screenshot-crawl.spec.ts` is excluded from `wdio.conf.ts`, it's impossible to run it with `--spec ./e2e/screenshot-crawl.spec.ts`. The dedicated config solves this.

## npm Scripts

```bash
npm run e2e                   # Run functional tests (builds first)
npm run e2e:screenshots       # Run visual crawl (compare mode)
npm run e2e:screenshots:update  # Run visual crawl (update baselines)
npm run e2e:extensions        # Run packaged extension integration tests
```

## Screenshot Conventions (Visual Crawl)

Screenshot naming: `{section}--{subsection}.png`

| Pattern | Example |
|---------|---------|
| Top-level page | `home--initial.png` |
| Work tab | `work--tab-compose.png` |
| Work panel | `work--panel-agents.png` |
| Insights tab | `insights--tab-analytics.png` |
| Configure tab | `configure--tab-settings.png` |
| Configure sub-tab | `configure--tab-settings--sub-cli-flags.png` |
| Extension page | `ext--pr-scores.png` |

All screenshots stored in `e2e/screenshots/`:
- `baseline/` — committed to Git LFS (source of truth)
- `actual/` — generated by CI (gitignored, uploaded as artifact)
- `failures/` — generated on test failure (gitignored)
- `diff/` — pixel diff images (gitignored)

## Failure Screenshots

The `afterEach` hook in `wdio.conf.ts` calls `captureFailureScreenshot()` from `e2e/helpers/screenshots.ts` on any failed test. Screenshots are saved to `e2e/screenshots/failures/{timestamp}--{test-title}.png`. This is best-effort — it never throws or masks the original failure.

## Process Cleanup

The `after` hook closes the Electron window (`window.close()`), and `onComplete` kills any orphaned processes:

```typescript
after: async function() {
  try { await browser.execute(() => { window.close() }) } catch {}
},
onComplete: async function() {
  try {
    const { execSync } = await import('child_process')
    execSync('pkill -f "out/main/index.js" 2>/dev/null || true', { stdio: 'ignore' })
  } catch {}
},
```

Without this, running the full test suite can leave dozens of orphaned Electron windows.
