---
name: e2e-webdriverio
description: WebdriverIO v9 + Electron e2e testing reference for CoPilot Commander — Electron service setup, selectors, async patterns, visual regression, CI/CD, and project-specific conventions in e2e/ and wdio.conf.ts. Auto-loads when working on e2e spec files or wdio configs.
user-invocable: false
paths: "e2e/**/*.spec.ts, e2e/**/*.ts, wdio.conf.ts, wdio.screenshots.conf.ts, e2e/screenshots/**"
allowed-tools: Read Glob Grep Bash
---

# WebdriverIO E2E Testing

This project uses **WebdriverIO v9** with `wdio-electron-service` to run end-to-end tests against the Electron app, and `@wdio/visual-service` for screenshot-based visual regression. The app is built with `electron-vite` (unpackaged entry: `out/main/index.js`), React 18 with hash-based routing (`#/work?tab=session`), and exposes IPC via `window.electronAPI.invoke()`.

Three layers work together:
1. **`e2e/helpers/app.ts`** — shared utilities: `waitForAppReady`, `navigateSidebarTo`, `setInputValue`, `invokeIPC`, and more
2. **`e2e/*.spec.ts`** — feature test files (functional) + `e2e/screenshot-crawl.spec.ts` (visual)
3. **`wdio.conf.ts`** / **`wdio.screenshots.conf.ts`** — separate configs for functional vs. visual runs

---

## How to run

```bash
# Functional e2e (builds first)
npm run e2e

# Visual crawl — compare against baselines
npm run e2e:screenshots

# Update baselines after intentional UI change
npm run e2e:screenshots:update

# Single spec during development
npx wdio run wdio.conf.ts --spec e2e/home.spec.ts

# Verbose debug output
WDIO_LOG_LEVEL=debug npx wdio run wdio.conf.ts --spec e2e/smoke.spec.ts
```

---

## Critical: ELECTRON_RUN_AS_NODE

**Every wdio config file** must have this at the top (before `export const config`):

```typescript
delete process.env.ELECTRON_RUN_AS_NODE
```

VS Code sets `ELECTRON_RUN_AS_NODE=1` in child processes, causing Electron to launch as plain Node with no renderer window. Both `wdio.conf.ts` and `wdio.screenshots.conf.ts` already include this.

---

## Selectors in Electron

WebdriverIO's `=` text selectors (e.g. `$('button=Save')`) are **not reliably supported** in Electron's Chromedriver. Use **XPath** for text-based selection:

```typescript
// Find by text — XPath works reliably in Electron
const btn = await $(`//button[contains(., 'Save')]`)
const link = await $(`//aside//a[contains(., 'Configure')]`)

// Exclude certain roles
const innerTab = await $(`//button[not(@role='tab') and contains(., 'Settings')]`)

// CSS still works for ID, class, data attributes (preferred when possible)
const tab = await $('#tab-settings')
const card = await $('[data-testid="agent-card"]')
```

---

## Async rules

```typescript
// Always await WDIO commands
await element.click()

// for...of (not forEach) for async iteration
for (const el of await $$('.item')) {
  await el.click()
}

// Use waitFor* instead of browser.pause()
await el.waitForDisplayed({ timeout: 10000 })

// Use expect matchers (auto-wait) instead of raw boolean
await expect(el).toBeDisplayed()    // ✓ waits up to waitforTimeout
expect(await el.isDisplayed()).toBe(true)  // ✗ no wait, fragile
```

---

## React input values

Standard `element.setValue()` doesn't trigger React's synthetic event system. Use the project's `setInputValue` helper:

```typescript
import { setInputValue, getInputValue } from './helpers/app.js'

await setInputValue('#session-name-input', 'My Test Session')
const value = await getInputValue('#session-name-input')
```

---

## Hash routing navigation

In Electron (file:// protocol), `browser.url()` doesn't navigate hash routes. Use:

```typescript
import { navigateToHash } from './helpers/app.js'

await navigateToHash('#/work?tab=compose')
// or directly:
await browser.execute((hash) => { window.location.hash = hash }, '#/work?panel=agents')
await browser.pause(500)
```

---

## Two-config pattern

| Config | Specs run | Trigger |
|--------|-----------|---------|
| `wdio.conf.ts` | All `e2e/**/*.spec.ts` except crawl | `npm run e2e` |
| `wdio.screenshots.conf.ts` | `screenshot-crawl.spec.ts` only | `npm run e2e:screenshots` |

WDIO v9: `--spec` cannot override `exclude`. Since `screenshot-crawl.spec.ts` is excluded from `wdio.conf.ts`, a dedicated config is required to run it.

---

## Visual regression

The screenshot crawl uses `@wdio/visual-service` to compare every page/tab against committed baselines:

```typescript
/// <reference types="@wdio/visual-service" />
const result = await browser.checkScreen('home--initial')
expect(result).toBeLessThanOrEqual(2)  // < 2% mismatch allowed
```

Baselines live in `e2e/screenshots/baseline/` (Git LFS). First run auto-saves baselines; subsequent runs compare pixel-by-pixel.

---

## Reference materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/project-conventions.md](references/project-conventions.md) | All helpers, constants, naming conventions, two-config pattern | Starting any e2e work; understanding the project's specific patterns |
| [references/electron-service-setup.md](references/electron-service-setup.md) | wdio-electron-service install, appEntryPoint, CI flags, two-config | Setting up or modifying wdio.conf.ts |
| [references/electron-api-access.md](references/electron-api-access.md) | browser.electron.execute(), preload setup, renderer bridge | Accessing Electron APIs or main process from tests |
| [references/electron-api-mocking.md](references/electron-api-mocking.md) | browser.electron.mock(), mockReturnValue, clearAllMocks | Mocking dialog, shell, app, or other Electron APIs |
| [references/wdio-config.md](references/wdio-config.md) | Full wdio.conf.ts anatomy, all hooks, services, suites | Modifying or understanding the wdio config |
| [references/selectors.md](references/selectors.md) | CSS, XPath, ARIA, data-testid — with Electron caveats | Writing selectors; text selector doesn't work in Electron |
| [references/async-patterns.md](references/async-patterns.md) | await rules, for...of, Promise.all, waitUntil | Reviewing async correctness; forEach/async bugs |
| [references/element-api.md](references/element-api.md) | Full element object: waitFor*, click, getText, isDisplayed | Looking up element methods |
| [references/browser-api.md](references/browser-api.md) | browser.execute, saveScreenshot, waitUntil, getLogs, debug | Looking up browser-level commands |
| [references/expect-assertions.md](references/expect-assertions.md) | All expect-webdriverio matchers, soft assertions | Writing or reviewing assertions |
| [references/visual-testing.md](references/visual-testing.md) | @wdio/visual-service setup, checkScreen, baseline management | Working on visual regression tests |
| [references/visual-service-options.md](references/visual-service-options.md) | All service and method options: blockOut, ignoreAntialiasing, etc. | Configuring visual comparison behavior |
| [references/visual-reporter.md](references/visual-reporter.md) | @wdio/visual-reporter — view diffs in browser UI | Investigating visual test failures |
| [references/debugging.md](references/debugging.md) | browser.debug(), REPL, VSCode launch.json, flaky strategies | Debugging a failing or flaky test |
| [references/timeouts.md](references/timeouts.md) | All timeout layers: waitforTimeout, Mocha, connectionRetry | Timeout errors; configuring test timing |
| [references/ci-cd.md](references/ci-cd.md) | GitHub Actions, Xvfb, screenshot artifacts, sharding | Writing or fixing CI workflows |
| [references/page-objects.md](references/page-objects.md) | Page Object pattern with getter selectors | Organizing selectors into reusable classes |
| [references/typescript-setup.md](references/typescript-setup.md) | tsconfig, tsx, triple-slash refs, custom types | TypeScript errors in e2e files |
| [references/organizing-suites.md](references/organizing-suites.md) | Suites, maxInstances, retries, sharding, watch mode | Organizing or running subsets of tests |

---

## Examples

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/electron-service-config.md](examples/electron-service-config.md) | Complete annotated wdio.conf.ts | Creating or reviewing the wdio config |
| [examples/writing-functional-test.md](examples/writing-functional-test.md) | Full spec file: before, describe, it, assertions | Writing a new spec file |
| [examples/custom-helpers.md](examples/custom-helpers.md) | All app.ts helpers with code and rationale | Understanding or extending the helper layer |
| [examples/electron-execute-ipc.md](examples/electron-execute-ipc.md) | browser.electron.execute vs browser.execute + window.electronAPI | Accessing Electron APIs or IPC from tests |
| [examples/electron-mock-dialog.md](examples/electron-mock-dialog.md) | Mock dialog.showOpenDialog, shell.openExternal, app.quit | Testing UI that triggers native Electron dialogs |
| [examples/visual-screenshot-test.md](examples/visual-screenshot-test.md) | Data-driven screenshot crawl with checkScreen and blockOut | Working on screenshot-crawl.spec.ts |
| [examples/debug-session.md](examples/debug-session.md) | browser.debug() REPL, VSCode launch.json, root cause table | Debugging a specific failing test |
| [examples/react-input-pattern.md](examples/react-input-pattern.md) | Native setter + dispatchEvent for React controlled inputs | Setting input values that React reads correctly |
| [examples/xpath-selectors.md](examples/xpath-selectors.md) | XPath patterns for Electron — sidebar, buttons, compound | Writing selectors when CSS text matching fails |
| [examples/ci-github-actions.md](examples/ci-github-actions.md) | Full GitHub Actions e2e + screenshot regression workflows | Writing or debugging CI workflows |
