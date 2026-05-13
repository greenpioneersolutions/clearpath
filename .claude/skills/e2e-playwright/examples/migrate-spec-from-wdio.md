# Example: Migrate a Spec from WDIO to Playwright

Worked before-and-after of `e2e/smoke.spec.ts`, the smallest spec in the suite. Use this as a template for migrating the rest.

## Before — WDIO `e2e/smoke.spec.ts`

```ts
/// <reference types="@wdio/globals/types" />
/// <reference types="mocha" />
import {
  waitForAppReady,
  navigateSidebarTo,
  mainContentIsRendered,
  getCriticalConsoleErrors,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

describe('Smoke tests', () => {
  before(async () => {
    await waitForAppReady()
  })

  it('opens an Electron window', async () => {
    const title = await browser.getTitle()
    expect(typeof title).toBe('string')
  })

  it('renders the React root', async () => {
    const root = await $('#root')
    expect(await root.isExisting()).toBe(true)
    const html = await root.getHTML()
    expect(html.length).toBeGreaterThan(100)
  })

  it('has no critical console errors on initial load', async () => {
    const errors = await getCriticalConsoleErrors()
    expect(errors).toHaveLength(0)
  })

  it('renders the sidebar navigation', async () => {
    const nav = await $('nav')
    expect(await nav.isExisting()).toBe(true)
    const links = await $$('nav a')
    expect(links.length).toBeGreaterThan(0)
  })

  it('navigates to Sessions', async () => {
    await navigateSidebarTo('Sessions')
    expect(await mainContentIsRendered()).toBe(true)
  })

  it('navigates to Settings', async () => {
    await navigateSidebarTo('Settings')
    expect(await mainContentIsRendered()).toBe(true)
  })

  it('navigates to Insights', async () => {
    await navigateSidebarTo('Insights')
    expect(await mainContentIsRendered()).toBe(true)
  })

  it('navigates back to Home', async () => {
    await navigateSidebarTo('Home')
    expect(await mainContentIsRendered()).toBe(true)
  })
})
```

## After — Playwright `e2e/smoke.spec.ts`

```ts
import { test, expect } from './fixtures';
import { waitForAppReady, navigateSidebarTo, mainContentIsRendered } from './helpers/app';

test.describe('Smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
  });

  test('opens an Electron window', async ({ page }) => {
    await expect(page).toHaveTitle(/Clear Path|CoPilot/);
  });

  test('renders the React root', async ({ page }) => {
    await expect(page.locator('#root')).toBeVisible();
    const html = await page.locator('#root').innerHTML();
    expect(html.length).toBeGreaterThan(100);
  });

  test('has no critical console errors on initial load', async ({ consoleErrors }) => {
    // consoleErrors is auto-collected by the fixture and attached on failure
    expect(consoleErrors).toEqual([]);
  });

  test('renders the sidebar navigation', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.locator('aside').getByRole('link')).not.toHaveCount(0);
  });

  test('navigates to Sessions', async ({ page }) => {
    await navigateSidebarTo(page, 'Sessions');
    expect(await mainContentIsRendered(page)).toBe(true);
    await expect(page).toHaveURL(/#\/work/);
  });

  test('navigates to Settings', async ({ page }) => {
    await navigateSidebarTo(page, 'Settings');
    expect(await mainContentIsRendered(page)).toBe(true);
    await expect(page).toHaveURL(/#\/configure/);
  });

  test('navigates to Insights', async ({ page }) => {
    await navigateSidebarTo(page, 'Insights');
    expect(await mainContentIsRendered(page)).toBe(true);
    await expect(page).toHaveURL(/#\/insights/);
  });

  test('navigates back to Home', async ({ page }) => {
    await navigateSidebarTo(page, 'Home');
    expect(await mainContentIsRendered(page)).toBe(true);
    await expect(page).toHaveURL(/#\/$|#\/?$/);
  });
});
```

## Diff explained

| Change | Why |
|--------|-----|
| Removed triple-slash refs | `@playwright/test` provides types; no globals to declare |
| Removed `import { ... } from './helpers/app.js'` (kept) | Same — but helpers now take `page: Page` as first arg |
| `describe` → `test.describe` | Playwright Test API |
| `it` → `test` | Same |
| `before` → `test.beforeEach` | The WDIO `before` ran once per spec; Playwright's `beforeAll` is the equivalent. **However**, with worker-scoped Electron the app stays alive between tests, so we use `beforeEach` to ensure a clean route per test. |
| `await browser.getTitle()` | `await page.title()` (or even better: `await expect(page).toHaveTitle(/.../)`) |
| `await $('#root')` + `.isExisting()` | `await expect(page.locator('#root')).toBeVisible()` |
| `await $('nav')` + `.isExisting()` | `await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()` |
| `await $$('nav a')` + `.length` | `await expect(page.locator('aside').getByRole('link')).not.toHaveCount(0)` |
| `await navigateSidebarTo('Sessions')` | `await navigateSidebarTo(page, 'Sessions')` (helper takes `page` arg now) |
| `await getCriticalConsoleErrors()` | `consoleErrors` fixture (auto-collects via listener) |
| `expect(...).toBeGreaterThan(N)` | Same syntax — works for non-locator values |
| Added `await expect(page).toHaveURL(...)` | Stronger assertion than just "main content rendered" — verifies the route changed |

## Step-by-step migration recipe

1. **Run the conversion script first**:
   ```bash
   node .claude/skills/e2e-playwright/scripts/convert-wdio-to-playwright.mjs e2e/smoke.spec.ts
   ```
   This handles ~70% of the syntax changes.

2. **Fix imports**:
   - Add `import { test, expect } from './fixtures';` at the top
   - Remove triple-slash refs
   - Update helper imports to use `import { ... } from './helpers/app';` (no `.js` if the original used `.js`)

3. **Update test signatures**:
   - `it(...)` → `test('title', async ({ page }) => {...})`
   - `describe(...)` → `test.describe(...)`
   - `before` → `test.beforeAll`; `beforeEach` → `test.beforeEach`

4. **Update helpers calls**:
   - Pass `page` as the first arg to each helper

5. **Replace assertions**:
   - `expect(await el.isDisplayed()).toBe(true)` → `await expect(loc).toBeVisible()`
   - `expect(await el.isExisting()).toBe(true)` → `await expect(loc).toBeAttached()`
   - `expect(await el.getText()).toBe('x')` → `await expect(loc).toHaveText('x')`
   - `expect(await el.getValue()).toBe('x')` → `await expect(loc).toHaveValue('x')`

6. **Update selectors**:
   - `$('//button[contains(., "Save")]')` → `page.getByRole('button', { name: 'Save' })`
   - `$('button=Save')` → `page.getByRole('button', { name: 'Save' })`
   - `$$('selector')` → `page.locator('selector')` (use `.all()`/`.first()` to access elements)

7. **Replace `browser.execute` / `browser.electron.execute`**:
   - `await browser.execute(fn, a, b)` → `await page.evaluate(fn, [a, b])` (note: single arg)
   - `await browser.electron.execute(fn, a)` → `await electronApp.evaluate(fn, a)`

8. **Replace mocking**:
   - `await browser.electron.mock(...)` → use `mockElectronApi(...)` helper from `electronMock.ts`

9. **Run the test**:
   ```bash
   npx playwright test e2e/smoke.spec.ts
   ```

10. **Investigate failures with the trace** — `npx playwright show-report` and click the failed test.

## Helper migration

`e2e/helpers/app.ts` carries over almost verbatim — see [examples/custom-helpers.md](custom-helpers.md). The only API change is each helper now takes `page: Page` as the first argument.

## When the conversion script falls short

The script handles common patterns but you'll need to manually fix:

- **Multi-arg `browser.execute`** — Playwright's `page.evaluate` takes a single `arg` parameter; rewrite the function body to destructure
- **WDIO chained promise reads** — `await el.foo.bar` (rare but exists) becomes `await loc.evaluate(n => n.foo.bar)`
- **`browser.electron.mock(...)` calls** — replace with `mockElectronApi(...)` helper
- **Visual `checkScreen` calls** — convert to `await expect(page).toHaveScreenshot(...)`
- **XPath that's now redundant** — replace `//button[contains(., "X")]` with `getByRole('button', { name: 'X' })`
- **Mocha-specific patterns** — `this.timeout(120000)` → `test.setTimeout(120000)`; arrow function in `before()` body needs no change (Playwright doesn't have the function-syntax requirement)

## Order of work for the whole suite

1. ✅ `smoke.spec.ts` — small, isolated; perfect first migration
2. `home.spec.ts` — uses `setInputValue`, `browser.keys`, hash navigation
3. `navigation.spec.ts`
4. `accessibility.spec.ts`
5. `app-lifecycle.spec.ts`
6. `configure.spec.ts` — heavy use of `navigateToConfigureTab`
7. `integrations.spec.ts`
8. `extensions.spec.ts`
9. `session-manager.spec.ts`
10. `work-launchpad.spec.ts` (now `sessions-launchpad.spec.ts`)
11. `work-page.spec.ts`
12. `insights.spec.ts`
13. `white-label.spec.ts`
14. `screenshot-crawl.spec.ts` — heaviest; do last

For each: convert with the script, manual cleanup, run locally until green, then commit.

## Side-by-side CI strategy

Until all specs are migrated, keep BOTH WDIO and Playwright workflows running. Don't make Playwright a required check until the whole suite passes consistently for a week:

```yaml
jobs:
  wdio:
    name: WDIO (legacy — required)
    # ... existing workflow ...

  playwright:
    name: Playwright (new — informational)
    continue-on-error: true   # don't block PRs while migrating
    # ... new workflow ...
```

Once green, flip `continue-on-error: false` on Playwright and remove `continue-on-error: true`. Then later, delete the WDIO workflow and uninstall WDIO packages.
