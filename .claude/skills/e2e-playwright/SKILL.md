---
name: e2e-playwright
description: Playwright + Electron e2e testing reference for CoPilot Commander — _electron.launch setup, locators, web-first assertions, fixtures, visual regression, trace viewer, CI/CD, and a complete WebdriverIO→Playwright migration guide. Auto-loads when working on Playwright spec files, playwright.config files, or when migrating from WebdriverIO.
user-invocable: false
paths: "e2e/**/*.spec.ts, e2e/**/*.ts, playwright.config.ts, playwright.screenshots.config.ts, playwright-report/**, test-results/**"
allowed-tools: Read Glob Grep Bash
---

# Playwright E2E Testing for Electron

This skill covers **Playwright** with `_electron.launch()` driving the CoPilot Commander Electron app, plus a complete migration path from the project's existing WebdriverIO suite. Playwright is used in **library mode** (Electron is launched directly via `playwright`'s `_electron` API), but tests run under the `@playwright/test` runner via custom worker-scoped fixtures.

The app is built with `electron-vite` (unpackaged entry: `out/main/index.js`), React 18 with hash-based routing (`#/work?tab=session`), and exposes IPC via `window.electronAPI.invoke()`.

Three layers work together:
1. **`e2e/fixtures.ts`** — `test.extend()` worker-scoped `electronApp` + per-test `page` (first window)
2. **`e2e/*.spec.ts`** — feature test files using `import { test, expect } from './fixtures'`
3. **`playwright.config.ts`** / **`playwright.screenshots.config.ts`** — runner config (separate configs for functional vs visual)

> **Migrating from WebdriverIO?** Start with [references/migration-from-webdriverio.md](references/migration-from-webdriverio.md) and the conversion script in [scripts/convert-wdio-to-playwright.mjs](scripts/convert-wdio-to-playwright.mjs).

---

## How to run

```bash
# All functional tests (builds first)
npm run pw

# Single spec
npx playwright test e2e/smoke.spec.ts

# Filter by title (regex)
npx playwright test -g "navigates to Sessions"

# Visual regression crawl
npm run pw:screenshots

# Update visual baselines after intentional UI change
npm run pw:screenshots:update

# Headed (see the window) + slow motion
npx playwright test --headed --workers=1

# UI mode (time-travel, watch tests, edit locators live)
npx playwright test --ui

# Debug a specific test (Inspector + breakpoint)
npx playwright test e2e/smoke.spec.ts --debug

# Verbose API logging
DEBUG=pw:api npx playwright test
```

---

## Critical: ELECTRON_RUN_AS_NODE

VS Code sets `ELECTRON_RUN_AS_NODE=1` in child processes, causing Electron to launch as plain Node with no renderer. **Strip it from the env before calling `_electron.launch()`** — exactly the same gotcha as WDIO.

```ts
// e2e/fixtures.ts
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [...], env });
```

> See [references/playwright-electron-setup.md](references/playwright-electron-setup.md) for the full launch options reference.

---

## The Electron mental model

| Layer | API |
|-------|-----|
| **Main process** (`require('electron')`, `app`, `BrowserWindow`, `ipcMain`, `dialog`, `shell`, `Menu`) | `await electronApp.evaluate(({ app, BrowserWindow }) => ...)` |
| **Renderer DOM + React** (the visible window) | `Page` / `Locator` from `electronApp.firstWindow()` |
| **Live main-process handle** (BrowserWindow you want to keep using) | `await electronApp.evaluateHandle(...)` → `JSHandle` |
| **Renderer IPC bridge** (`window.electronAPI.invoke`) | `await page.evaluate(([ch, a]) => (window as any).electronAPI.invoke(ch, a), [channel, args])` |
| **New windows** (modals, splash → main) | `electronApp.on('window', ...)` or `await electronApp.waitForEvent('window')` |
| **Native dialogs** (`showOpenDialog`, `showMessageBox`) | Monkey-patch via `electronApp.evaluate(({ dialog }) => { dialog.showOpenDialog = ... })` BEFORE the renderer triggers them |

> See [references/electron-api-access.md](references/electron-api-access.md) and [references/electron-api-mocking.md](references/electron-api-mocking.md).

---

## Locators — prefer role/text/testid over CSS

Playwright's locators are auto-waiting and re-evaluated on every action — they replace WDIO's `$()` chained promises and the manual `waitForExist` pattern. **Order of preference:**

```ts
// 1. Role + accessible name (BEST — survives DOM/CSS/styling refactors)
await page.getByRole('button', { name: 'Save' }).click();
await page.getByRole('link',   { name: 'Sessions' }).click();
await page.getByRole('tab',    { name: 'Settings' }).click();

// 2. Text — for non-interactive elements
await expect(page.getByText('Welcome back')).toBeVisible();

// 3. Label (form controls)
await page.getByLabel('Session name').fill('My Test Session');

// 4. Test ID (for non-text-bearing elements you control)
await page.getByTestId('agent-card').click();

// 5. CSS — only when nothing above works (e.g. existing #id, [data-screenshot-stub])
await page.locator('#root').waitFor();

// 6. XPath — Electron-specific fallback for compound text matches
await page.locator('xpath=//button[not(@role="tab") and contains(., "Settings")]').click();
```

> See [references/locators.md](references/locators.md) and [examples/selector-strategies.md](examples/selector-strategies.md).

---

## Web-first assertions auto-retry

Use `expect()` from `@playwright/test` — these re-poll until pass or `expect.timeout` (5s default):

```ts
import { expect } from './fixtures';

await expect(page).toHaveTitle(/CoPilot/);
await expect(page).toHaveURL(/#\/work/);
await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
await expect(page.getByTestId('toast')).toContainText('Saved');
await expect(page.getByRole('listitem')).toHaveCount(3);
await expect(page.locator('#root')).toBeVisible();
```

**Anti-pattern:** wrapping a non-locator boolean — that loses retry:
```ts
expect(await locator.isVisible()).toBe(true);     // ❌ no retry
await expect(locator).toBeVisible();              // ✅ retries
```

> See [references/expect-assertions.md](references/expect-assertions.md).

---

## Don't write tests that pass silently

The most common review feedback on the existing suite was variants of "this test passes when the thing it claims to verify is missing." Three rules:

1. **Test name must match the assertion.** `'has no critical errors'` MUST assert `expect(consoleErrors).toEqual([])`, not `Array.isArray(consoleErrors)` (always true). `'contains a nav element with aria-label'` MUST assert the aria-label value, not just attachment.
2. **No `if (count > 0)` guards** for elements the test name treats as required. Use `await expect(loc).toBeVisible()` so a missing element fails the test loudly. Reserve `if`-guards for genuinely feature-gated UI and pair them with an explicit `test.skip(true, 'reason')`.
3. **Scope locators.** `page.locator('nav').first()` matches any `<nav>` on the page (tab strips, breadcrumbs, etc). Prefer `page.getByRole('navigation', { name: 'Main navigation' })` or scope to a known container (`page.locator('aside').getByRole(...)`).

> Full taxonomy + worked before/after examples: [references/anti-patterns.md](references/anti-patterns.md).

---

## React input values — `fill()` works (no native-setter dance needed)

Unlike WDIO's `setValue`, **Playwright's `locator.fill()` correctly fires React's `onChange`** because it dispatches real input events from the browser side. Only fall back to the native-setter helper for stubborn cases (CodeMirror, Monaco, custom controlled wrappers that intercept `input`).

```ts
await page.getByLabel('Session name').fill('My Test Session');
const value = await page.getByLabel('Session name').inputValue();
```

> See [examples/react-input-pattern.md](examples/react-input-pattern.md) for the fallback helper.

---

## Hash routing navigation

In Electron (file:// protocol), `page.goto()` doesn't navigate hash routes well. Use `evaluate`:

```ts
await page.evaluate((hash) => { window.location.hash = hash }, '#/work?tab=compose');
await page.waitForLoadState('domcontentloaded');
// or wait for the new content
await expect(page.getByRole('tab', { name: 'Compose', selected: true })).toBeVisible();
```

A `navigateToHash` helper is provided in the fixtures example.

---

## Two-config pattern

| Config | Specs run | Trigger |
|--------|-----------|---------|
| `playwright.config.ts` | All `e2e/**/*.spec.ts` except crawl | `npm run pw` |
| `playwright.screenshots.config.ts` | `screenshot-crawl.spec.ts` only | `npm run pw:screenshots` |

The visual config pins device-pixel-ratio (`--force-device-scale-factor=1`), disables animations/caret, and uses a different `snapshotPathTemplate` so visual baselines live in `e2e/screenshots/baseline/` (Git LFS).

> See [references/playwright-config.md](references/playwright-config.md) and [examples/playwright-config-example.md](examples/playwright-config-example.md).

---

## Visual regression with `toHaveScreenshot`

```ts
await expect(page).toHaveScreenshot('home--initial.png', {
  mask: [page.locator('[data-screenshot-stub]'), page.getByTestId('time-now')],
  maxDiffPixelRatio: 0.02,
  animations: 'disabled',
  caret: 'hide',
});
```

Update baselines after intentional UI changes:
```bash
npx playwright test --update-snapshots
```

> See [references/visual-testing.md](references/visual-testing.md) and [examples/visual-screenshot-test.md](examples/visual-screenshot-test.md).

---

## Tracing — Playwright's killer debug feature

Configure once:
```ts
// playwright.config.ts
use: { trace: 'on-first-retry' }
```

When a test fails on retry, Playwright captures DOM snapshots before/during/after every action, network log, console, source code, and a screenshot timeline. Open the trace:

```bash
npx playwright show-trace test-results/.../trace.zip
# or drag-and-drop the .zip into https://trace.playwright.dev
```

> See [references/trace-viewer.md](references/trace-viewer.md).

---

## Migrating from WebdriverIO

The project has a complete WDIO suite in `e2e/*.spec.ts` (see the existing `e2e-webdriverio` skill). The Playwright migration path:

1. Read [references/migration-from-webdriverio.md](references/migration-from-webdriverio.md) for the API translation table.
2. Run [scripts/convert-wdio-to-playwright.mjs](scripts/convert-wdio-to-playwright.mjs) on a single spec to get a starting point.
3. Walk through [examples/migrate-spec-from-wdio.md](examples/migrate-spec-from-wdio.md) for the manual cleanup steps.
4. Replace the WDIO mocking layer with the helper in [examples/electron-mock-dialog.md](examples/electron-mock-dialog.md) (Playwright has no built-in equivalent to `browser.electron.mock`).

---

## Reference materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/project-conventions.md](references/project-conventions.md) | App-specific helpers, route table, sidebar labels, two-config pattern | Starting any e2e work; understanding project specifics |
| [references/playwright-electron-setup.md](references/playwright-electron-setup.md) | `_electron.launch` options, executable paths, fuses, supported Electron versions | Setting up `e2e/fixtures.ts` or troubleshooting launch |
| [references/electron-api-access.md](references/electron-api-access.md) | `electronApp.evaluate`, `evaluateHandle`, `browserWindow`, `process()`, `windows()` | Accessing main process or BrowserWindow APIs from tests |
| [references/electron-api-mocking.md](references/electron-api-mocking.md) | Custom monkey-patch helper that mirrors WDIO's mock API | Mocking dialog, shell, app.quit, or other Electron APIs |
| [references/playwright-config.md](references/playwright-config.md) | Full `TestConfig`/`TestProject`/`use` options, two-config pattern | Editing the config or adding a project |
| [references/locators.md](references/locators.md) | All `getBy*` strategies, filtering, chaining, strictness, lists | Writing or reviewing selectors |
| [references/locator-api.md](references/locator-api.md) | Every `Locator` method: `click`, `fill`, `press`, `screenshot`, `waitFor`, etc. | Looking up a locator method signature |
| [references/expect-assertions.md](references/expect-assertions.md) | Every web-first matcher, soft assertions, polling, `toPass`, custom matchers | Writing or reviewing assertions |
| [references/advanced-apis.md](references/advanced-apis.md) | `page.request`, `page.on('dialog')`, `context.grantPermissions`, `page.clock`, `storageState`, packaged binary, HAR record/replay, multi-window | Anything beyond locators/expect/fixtures |
| [references/auto-waiting.md](references/auto-waiting.md) | Actionability checks, when to add explicit waits, `waitForFunction` | Diagnosing flake or "element not actionable" |
| [references/fixtures.md](references/fixtures.md) | `test.extend()`, worker vs test scope, auto/option/box fixtures, `mergeTests` | Adding or editing the `electronApp`/`page` fixture |
| [references/visual-testing.md](references/visual-testing.md) | `toHaveScreenshot`, baseline workflow, mask/threshold, snapshot path templates | Working on visual regression tests |
| [references/visual-options.md](references/visual-options.md) | All `toHaveScreenshot` options + `page.screenshot` options | Tuning visual diffs (mask, threshold, fullPage, clip) |
| [references/trace-viewer.md](references/trace-viewer.md) | `trace:` modes, `context.tracing.start/stop`, `show-trace`, public viewer | Investigating a failure or onboarding to traces |
| [references/debugging.md](references/debugging.md) | `page.pause()`, `--ui`, `--debug`, VSCode launch.json, `PWDEBUG=console`, codegen | Debugging a failing or flaky test |
| [references/timeouts.md](references/timeouts.md) | Test/expect/action/navigation timeouts, `test.setTimeout`, `test.slow` | Timeout errors; configuring test timing |
| [references/ci-cd.md](references/ci-cd.md) | GitHub Actions, Xvfb, `npx playwright install --with-deps`, sharding, blob+merge | Writing or fixing CI workflows |
| [references/page-objects.md](references/page-objects.md) | Class-based POM with locators, fixture-injected pages | Organizing selectors into reusable classes |
| [references/typescript-setup.md](references/typescript-setup.md) | `tsconfig.e2e.json`, why Playwright runs even with TS errors, separate `tsc --noEmit` step | TypeScript errors in e2e files |
| [references/organizing-tests.md](references/organizing-tests.md) | `test.describe.configure`, parallel/serial mode, retries, projects, sharding | Organizing or running subsets of tests |
| [references/migration-from-webdriverio.md](references/migration-from-webdriverio.md) | API translation table, what stays, what changes, helper rewrites | Converting an existing WDIO spec |
| [references/anti-patterns.md](references/anti-patterns.md) | Silent-pass guards, name/assertion mismatches, ESM-require traps, listener timing, baseline auto-create — every mistake the PR review caught | **Read before writing or reviewing any new spec.** Quick scan if you're adding a `if ((await loc.count()) > 0)` guard or a "no errors" assertion |

---

## Examples

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/playwright-config-example.md](examples/playwright-config-example.md) | Annotated `playwright.config.ts` + `playwright.screenshots.config.ts` | Creating or reviewing the configs |
| [examples/electron-fixtures.md](examples/electron-fixtures.md) | Complete `e2e/fixtures.ts` — worker-scoped app, per-test page, helpers | Setting up the fixture file |
| [examples/writing-functional-test.md](examples/writing-functional-test.md) | Full spec file: imports, `test.describe`, hooks, web-first assertions | Writing a new spec file |
| [examples/custom-helpers.md](examples/custom-helpers.md) | Every helper from `e2e/helpers/app.ts` rewritten for Playwright | Porting helpers from WDIO; understanding the helper layer |
| [examples/electron-evaluate-ipc.md](examples/electron-evaluate-ipc.md) | `electronApp.evaluate` (main) vs `page.evaluate` (renderer) vs `electronAPI.invoke` (IPC) | Accessing Electron APIs or IPC from tests |
| [examples/electron-mock-dialog.md](examples/electron-mock-dialog.md) | Custom mock helper + worked dialog/shell/app.quit examples | Testing UI that triggers native Electron APIs |
| [examples/visual-screenshot-test.md](examples/visual-screenshot-test.md) | Data-driven `toHaveScreenshot` crawl with masks and dynamic-content freezing | Working on the visual crawl spec |
| [examples/debug-session.md](examples/debug-session.md) | `page.pause()`, UI mode, trace viewer, VSCode launch.json | Debugging a specific failing test |
| [examples/react-input-pattern.md](examples/react-input-pattern.md) | `locator.fill()` first; native-setter fallback for CodeMirror/Monaco | Setting input values in React-controlled UIs |
| [examples/selector-strategies.md](examples/selector-strategies.md) | `getByRole`/`getByText`/`getByTestId` patterns; XPath fallback | Writing selectors when you need ideas |
| [examples/ci-github-actions.md](examples/ci-github-actions.md) | Full GHA workflow: install deps, Xvfb, sharding, blob+merge, baselines | Writing or debugging CI |
| [examples/migrate-spec-from-wdio.md](examples/migrate-spec-from-wdio.md) | Worked before/after of `e2e/smoke.spec.ts` | Converting a single WDIO spec by hand |

---

## Scripts

| File | Purpose |
|------|---------|
| [scripts/convert-wdio-to-playwright.mjs](scripts/convert-wdio-to-playwright.mjs) | Best-effort find/replace of common WDIO patterns → Playwright. Run on a single spec; review every change manually. |
| [scripts/check-playwright-setup.mjs](scripts/check-playwright-setup.mjs) | Doctor — verifies `@playwright/test` is installed, `out/main/index.js` exists, `ELECTRON_RUN_AS_NODE` not set, snapshot dirs exist. |

Run scripts (paths relative to the repo root):
```bash
node .claude/skills/e2e-playwright/scripts/check-playwright-setup.mjs
node .claude/skills/e2e-playwright/scripts/convert-wdio-to-playwright.mjs e2e/smoke.spec.ts
```
