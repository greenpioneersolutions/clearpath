# Migration: WebdriverIO → Playwright

A practical, line-by-line migration guide for the existing CoPilot Commander e2e suite.

## Strategy

1. **Keep both suites running side-by-side** during migration. Don't delete WDIO until Playwright covers the same surface.
2. **Migrate spec-by-spec** — start with `smoke.spec.ts` (small, isolated), then `home.spec.ts`, `navigation.spec.ts`, etc.
3. **Run the conversion script first** (`scripts/convert-wdio-to-playwright.mjs`) to get a starting point — it handles ~70% of the syntax. The remaining 30% needs human review.
4. **Verify each migrated spec** by running it locally before moving on.
5. **Update CI last** — gate `playwright test` behind a flag, leave `wdio` in place, then swap when confident.

## Big-picture differences

| Concern | WebdriverIO | Playwright |
|---------|-------------|-----------|
| Driver | Chromedriver via `wdio-electron-service` | Direct via Electron's CDP/Node Inspector |
| Preload shim | Required (`wdio-electron-service/main` + `preload`) | None |
| Test runner | Mocha | `@playwright/test` |
| Globals | `browser`, `$`, `$$`, `expect` (auto-injected) | Imported: `test`, `expect`, `page`, `electronApp` |
| Auto-wait | Action commands wait; reads don't | Both — but `expect()` is the retry loop |
| Selector "by text" | Unreliable (Chromedriver) | First-class via `getByRole`/`getByText` |
| Mocking Electron APIs | `browser.electron.mock(...)` | DIY monkey-patch via `electronApp.evaluate` |
| Visual regression | `@wdio/visual-service` (extra package) | `expect(page).toHaveScreenshot()` (built in) |
| Trace replay | None | Full DOM/network/console time-travel |
| Config | `wdio.conf.ts` (capabilities, services) | `playwright.config.ts` (`use:`, `projects`) |
| Hook naming | `afterTest` (NOT `afterEach`) at runner level | `test.afterEach` (sane) |

## API translation table

### Element / Locator

| WDIO | Playwright |
|------|-----------|
| `$('selector')` | `page.locator('selector')` |
| `$$('selector')` | `page.locator('selector')` (then `.all()`/`.first()`/`.nth(i)`) |
| `$('aria/Submit')` | `page.getByRole('button', { name: 'Submit' })` |
| `$('//button[contains(., "Save")]')` | `page.getByRole('button', { name: 'Save' })` (preferred) or `page.locator('//button[contains(., "Save")]')` |
| `el.click()` | `loc.click()` |
| `el.doubleClick()` | `loc.dblclick()` |
| `el.setValue('text')` | `loc.fill('text')` |
| `el.addValue('text')` | `loc.pressSequentially('text')` |
| `el.clearValue()` | `loc.clear()` |
| `el.getValue()` | `loc.inputValue()` |
| `el.getText()` | `loc.textContent()` / `loc.innerText()` |
| `el.getAttribute('x')` | `loc.getAttribute('x')` |
| `el.getProperty('x')` | `loc.evaluate((n,k) => (n as any)[k], 'x')` |
| `el.isExisting()` | `(await loc.count()) > 0` (or use `expect(loc).toBeAttached()`) |
| `el.isDisplayed()` | `loc.isVisible()` (or `expect(loc).toBeVisible()`) |
| `el.isEnabled()` | `loc.isEnabled()` (or `expect(loc).toBeEnabled()`) |
| `el.isClickable()` | usually unnecessary — `click()` auto-waits |
| `el.isFocused()` | `loc.isFocused()` (or `expect(loc).toBeFocused()`) |
| `el.waitForExist({ timeout })` | `loc.waitFor({ state: 'attached', timeout })` |
| `el.waitForDisplayed({ timeout })` | `loc.waitFor({ state: 'visible', timeout })` |
| `el.waitForClickable({ timeout })` | usually unnecessary — `click()` auto-waits |
| `el.waitForEnabled({ timeout })` | `expect(loc).toBeEnabled({ timeout })` |
| `el.scrollIntoView()` | `loc.scrollIntoViewIfNeeded()` |
| `el.saveScreenshot(path)` | `loc.screenshot({ path })` |
| `el.getCSSProperty('x').value` | `loc.evaluate((n,k) => getComputedStyle(n).getPropertyValue(k), 'x')` |
| `el.selectByVisibleText('US')` | `loc.selectOption({ label: 'US' })` |
| `el.selectByAttribute('value', 'US')` | `loc.selectOption('US')` |
| `el.selectByIndex(2)` | `loc.selectOption({ index: 2 })` |
| `el.dragAndDrop(target)` | `loc.dragTo(targetLoc)` |
| `el.moveTo()` | `loc.hover()` |

### Assertions

| WDIO | Playwright |
|------|-----------|
| `expect(el).toBeDisplayed()` | `await expect(loc).toBeVisible()` |
| `expect(el).toExist()` | `await expect(loc).toBeAttached()` |
| `expect(el).toBeClickable()` | usually drop — `click()` auto-waits; if needed, `await expect(loc).toBeEnabled()` + visibility |
| `expect(el).toBeEnabled()` | `await expect(loc).toBeEnabled()` |
| `expect(el).toBeDisabled()` | `await expect(loc).toBeDisabled()` |
| `expect(el).toBeFocused()` | `await expect(loc).toBeFocused()` |
| `expect(el).toBeChecked()` | `await expect(loc).toBeChecked()` |
| `expect(el).toHaveText('x')` | `await expect(loc).toHaveText('x')` |
| `expect(el).toHaveText(expect.stringContaining('x'))` | `await expect(loc).toContainText('x')` |
| `expect(el).toHaveValue('x')` | `await expect(loc).toHaveValue('x')` |
| `expect(el).toHaveAttribute('x','y')` | `await expect(loc).toHaveAttribute('x','y')` |
| `expect(el).toHaveElementClass('x')` | `await expect(loc).toContainClass('x')` |
| `expect(el).toHaveId('x')` | `await expect(loc).toHaveId('x')` |
| `expect(el).toHaveHTML('<x>')` | (no direct equivalent) — `expect(await loc.innerHTML()).toBe('<x>')` |
| `expect(els).toBeElementsArrayOfSize(3)` | `await expect(loc).toHaveCount(3)` |
| `expect(browser).toMatchScreenSnapshot('home')` | `await expect(page).toHaveScreenshot('home.png')` |

### Browser / Page

| WDIO | Playwright |
|------|-----------|
| `browser.execute(fn, ...args)` | `page.evaluate(fn, args)` (single arg parameter — wrap multi-args in tuple) |
| `browser.executeAsync(fn, ...args)` | `page.evaluate(async fn, args)` |
| `browser.electron.execute(fn, ...args)` | `electronApp.evaluate(fn, args)` |
| `browser.electron.mock('mod', 'method')` | Custom helper — see [electron-api-mocking.md](electron-api-mocking.md) |
| `browser.url('http://x')` | `page.goto('http://x')` |
| `browser.url('#/work')` (Electron file://) | `page.evaluate(h => window.location.hash = h, '#/work')` |
| `browser.getTitle()` | `page.title()` |
| `browser.getUrl()` | `page.url()` |
| `browser.pause(1000)` | `page.waitForTimeout(1000)` (still discouraged) |
| `browser.waitUntil(fn, opts)` | `page.waitForFunction(fn, args, opts)` or `expect.poll(fn).toBe(value)` |
| `browser.keys(['Enter'])` | `page.keyboard.press('Enter')` |
| `browser.keys('Hello')` | `page.keyboard.type('Hello')` |
| `browser.saveScreenshot(path)` | `page.screenshot({ path })` |
| `browser.checkScreen('tag')` | `await expect(page).toHaveScreenshot('tag.png')` |
| `browser.getLogs('browser')` | `page.on('console', ...)` listener (see fixtures) |
| `browser.debug()` | `await page.pause()` |
| `browser.maximizeWindow()` | `electronApp.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0]?.maximize())` |
| `browser.setWindowSize(w, h)` | `electronApp.evaluate(({BrowserWindow}, [w,h]) => BrowserWindow.getAllWindows()[0]?.setContentSize(w,h), [1280,800])` |

### Test framework (Mocha → Playwright Test)

| WDIO (Mocha) | Playwright Test |
|--------------|----------------|
| `describe('x', () => { ... })` | `test.describe('x', () => { ... })` |
| `it('x', async () => { ... })` | `test('x', async ({ page }) => { ... })` |
| `before(async () => { ... })` | `test.beforeAll(async () => { ... })` |
| `after(async () => { ... })` | `test.afterAll(async () => { ... })` |
| `beforeEach(async () => { ... })` | `test.beforeEach(async ({ page }) => { ... })` |
| `afterEach(async () => { ... })` | `test.afterEach(async ({ page }) => { ... })` |
| `it.skip('x', ...)` | `test.skip('x', ...)` |
| `it.only('x', ...)` | `test.only('x', ...)` |
| `this.timeout(120000)` (must use function syntax) | `test.setTimeout(120000)` (no function syntax needed) |
| Top-of-file triple-slash refs | (none — `@playwright/test` provides types) |
| `browser`, `$`, `$$`, `expect` globals | Imported: `test`, `expect`; `page` from fixture |

### Config (`wdio.conf.ts` → `playwright.config.ts`)

| WDIO field | Playwright equivalent |
|------------|----------------------|
| `runner: 'local'` | (default) |
| `specs: ['./e2e/**/*.spec.ts']` | `testDir: './e2e'`, `testMatch: /.*\.spec\.ts/` |
| `exclude: [...]` | `testIgnore: [...]` |
| `maxInstances: 1` | `workers: 1` |
| `capabilities: [{ browserName: 'electron', 'wdio:electronServiceOptions': { appEntryPoint } }]` | Move into `e2e/fixtures.ts` `electron.launch({ args: [appEntryPoint] })` |
| `'goog:chromeOptions': { args: ['--no-sandbox'] }` | `electron.launch({ args: ['--no-sandbox', ...] })` |
| `services: ['electron']` | (none — `_electron` is built-in) |
| `framework: 'mocha'` | (none — `@playwright/test` is the framework) |
| `mochaOpts.timeout: 60000` | `timeout: 60_000` |
| `waitforTimeout: 15000` | `expect.timeout: 10_000` (covers most cases) |
| `connectionRetryTimeout: 120000` | (no equivalent — Playwright's launch timeout is `electron.launch({ timeout })`) |
| `connectionRetryCount: 3` | (none — Playwright fails fast on launch error) |
| `reporters: ['spec']` | `reporter: 'list'` |
| `specFileRetries: 2` | `retries: 2` |
| `afterTest` (per-test) | `test.afterEach` |
| `after` (per-spec teardown) | `test.afterAll` |
| `onComplete` (post-run) | `globalTeardown:` |

## Common patterns

### Sidebar navigation

```ts
// WDIO
await navigateSidebarTo('Settings');

// Playwright (helper-based)
await navigateSidebarTo(page, 'Settings');

// Playwright (inline)
await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
```

### Hash routing

```ts
// WDIO
await navigateToHash('#/work?tab=compose');
// or
await browser.execute((hash) => { window.location.hash = hash }, '#/work?tab=compose');
await browser.pause(500);

// Playwright
await page.evaluate((hash) => { window.location.hash = hash }, '#/work?tab=compose');
await page.waitForLoadState('domcontentloaded');
```

### React input

```ts
// WDIO — needed native-setter helper because setValue() didn't trigger React onChange
await setInputValue('#name', 'My Session');

// Playwright — fill() works correctly
await page.locator('#name').fill('My Session');
// or
await page.getByLabel('Session name').fill('My Session');
```

### IPC round-trip

```ts
// WDIO
const sessions = await invokeIPC('cli:list-sessions');

// Playwright
const sessions = await invokeIPC<Session[]>(page, 'cli:list-sessions');
// or inline:
const sessions = await page.evaluate(
  ([ch, a]) => (window as any).electronAPI.invoke(ch, a),
  ['cli:list-sessions', null] as const,
);
```

### Main-process state

```ts
// WDIO
const isPackaged = await browser.electron.execute((electron) => electron.app.isPackaged);

// Playwright
const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged);
```

### Mocking dialog

```ts
// WDIO
await browser.electron.mock('dialog', 'showOpenDialog');
await browser.electron.dialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/x.json'] });
await page.click('#import');
expect(await browser.electron.dialog.showOpenDialog.mock.calls).toHaveLength(1);

// Playwright (using the helper from electron-api-mocking.md)
const dialog = await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');
await dialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/x.json'] });
await page.getByRole('button', { name: 'Import' }).click();
expect(await dialog.calls()).toHaveLength(1);
```

### Visual regression

```ts
// WDIO
const result = await browser.checkScreen('home--initial', { hideElements: ['.live-clock'] });
expect(result).toBeLessThanOrEqual(2);

// Playwright
await expect(page).toHaveScreenshot('home--initial.png', {
  mask: [page.locator('.live-clock')],
  maxDiffPixelRatio: 0.02,
});
```

## What stays the same

- The `freezeDynamicContent` helper (it's pure DOM manipulation inside `page.evaluate`)
- The screenshot baseline directory (`e2e/screenshots/baseline/`)
- The data-driven crawl spec structure (table of routes/tabs)
- Hash-routing navigation logic
- The two-config pattern (functional vs visual)
- `--force-device-scale-factor=1` for DPR pinning
- CI Linux deps + Xvfb pattern
- Git LFS for visual baselines

## What goes away

- `wdio-electron-service/main` and `wdio-electron-service/preload` imports in app code
- The TypeScript triple-slash refs at the top of every spec
- `process.env.TEST = 'true'` setup (unless used by other tooling)
- Mocha-specific patterns (`this.timeout()`, function syntax for hooks)
- The `afterTest` vs `afterEach` naming gotcha
- `connectionRetryTimeout`/`connectionRetryCount`
- The native-setter `setInputValue` helper (mostly — keep as a fallback for CodeMirror/Monaco)

## What gets better

- **Trace viewer** — full time-travel for any failed test
- **UI mode** — watch tests, edit locators live (`--ui`)
- **First-class text/role selectors** — no more XPath compounds
- **`expect()` web-first assertions** — auto-retry without `waitFor*` boilerplate
- **Built-in visual diff** — no extra service, slider in HTML report
- **Sharding + `merge-reports`** — straightforward fan-out
- **Codegen** — `await page.pause()` opens the recorder

## Order of work

1. Add `@playwright/test` to devDependencies; remove WDIO packages later.
2. Create `playwright.config.ts` and `e2e/fixtures.ts`.
3. Run `scripts/convert-wdio-to-playwright.mjs` on `e2e/smoke.spec.ts`.
4. Manually clean up the converted spec — fix imports, replace XPath where `getByRole` works, update assertions.
5. Run `npx playwright test e2e/smoke.spec.ts` until green.
6. Repeat for each remaining spec.
7. Port `e2e/screenshot-crawl.spec.ts` last — it's the heaviest.
8. Update `package.json` scripts to add `pw`, `pw:screenshots`, etc.
9. Add CI workflow (`.github/workflows/playwright.yml`); leave WDIO in place initially.
10. Once all specs are green on CI for ~1 week, delete WDIO infra.

See [examples/migrate-spec-from-wdio.md](../examples/migrate-spec-from-wdio.md) for a worked before/after.
