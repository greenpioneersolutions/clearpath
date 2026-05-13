# Organizing Tests

How to structure specs, parallelism, retries, sharding, and tagging.

## Test discovery

Playwright auto-discovers files matching the runner config:

```ts
// playwright.config.ts
testDir: './e2e',
testMatch: /.*\.spec\.ts/,             // default: .*(test|spec).(js|ts|mjs)
testIgnore: [
  /screenshot-crawl\.spec\.ts/,
  /screenshot-crawl-experimental\.spec\.ts/,
  /extensions-integration\.spec\.ts/,
],
```

The visual config has its own `testMatch` so `npm run pw:screenshots` only picks up the crawl spec.

## File structure

```
e2e/
  fixtures.ts               # test.extend() — electronApp, page, POMs
  helpers/
    app.ts                  # waitForAppReady, navigateSidebarTo, freezeDynamicContent
    electronMock.ts
    screenshots.ts
  pages/
    SessionsPage.ts
    WorkPage.ts
  smoke.spec.ts
  home.spec.ts
  sessions.spec.ts
  navigation.spec.ts
  configure.spec.ts
  screenshot-crawl.spec.ts
  ...
```

## `test.describe` — group related tests

```ts
import { test, expect } from './fixtures';

test.describe('Sessions page', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('link', { name: 'Sessions' }).click();
  });

  test('shows empty state with no sessions', async ({ page }) => { /* ... */ });
  test('renders new-session button', async ({ page }) => { /* ... */ });

  test.describe('with existing sessions', () => {
    test.beforeEach(async ({ page }) => { /* seed sessions */ });
    test('archives a session', async ({ page }) => { /* ... */ });
  });
});
```

Anonymous describes are useful with `test.use({...})`:
```ts
test.describe(() => {
  test.use({ trace: 'on' });
  test('always trace this', async ({ page }) => { /* ... */ });
});
```

## Hooks

| Hook | Scope |
|------|-------|
| `test.beforeAll(fn)` | Once per worker (per file/describe) |
| `test.afterAll(fn)` | Once per worker, after all tests |
| `test.beforeEach(fn)` | Before every test |
| `test.afterEach(fn)` | After every test |

> **`beforeAll`/`afterAll` re-run if a worker is restarted** (e.g. after a fatal failure). Don't put one-time-only setup there — use `globalSetup` instead.

```ts
test.beforeEach(async ({ page }, testInfo) => {
  console.log(`Running: ${testInfo.title}`);
});
```

## Parallel vs serial within a file

Default: tests **inside a file** run sequentially in a single worker. Use this for stateful tests (each one builds on the previous).

```ts
// Force parallel within file
test.describe.configure({ mode: 'parallel' });

// Force serial (default but explicit)
test.describe.configure({ mode: 'serial' });
```

For Electron, **leave it serial**. Multiple Electron instances per worker compete for shared state (electron-store files, OS keychain).

## `fullyParallel` (config)

```ts
fullyParallel: true,          // every test in every file runs in parallel
fullyParallel: false,         // default — files run in parallel, tests within file serial
```

Combined with `workers: 4`, `fullyParallel: true` will run up to 4 tests at once across all files. **For Electron, set `workers: 1` and leave `fullyParallel: false`.**

## Retries

```ts
// playwright.config.ts
retries: process.env.CI ? 2 : 0,
```

Per-test:
```ts
test.describe.configure({ retries: 3 });
```

A flaky test that passes on retry is reported as `flaky` — visible in the HTML report. To fail the whole run on flakes:
```ts
failOnFlakyTests: true,
```

Or:
```bash
npx playwright test --fail-on-flaky-tests
```

## Sharding

Split a slow suite across multiple parallel jobs:

```bash
# Job 1
npx playwright test --shard=1/4

# Job 2
npx playwright test --shard=2/4
# etc
```

For sharded CI, use the `blob` reporter and `merge-reports` to produce a unified HTML report. See [ci-cd.md](ci-cd.md).

## `test.only` (focus) and `test.skip`

```ts
test.only('focus this', async ({ page }) => { /* ... */ });
test.skip('not yet', async ({ page }) => { /* ... */ });

// Conditional skip
test('chromium only', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium only');
  // ...
});
```

`forbidOnly: !!process.env.CI` fails the run if any `test.only` slipped in.

## `test.fixme` — known broken

```ts
test.fixme('broken — see #1234', async ({ page }) => {
  // doesn't run
});
```

Different from `skip`: `fixme` signals "this should pass and we will fix it"; `skip` signals "intentionally not relevant here".

## `test.fail` — expected to fail

```ts
test.fail('demonstrates the bug', async ({ page }) => {
  // The body MUST throw or assertion-fail; passing fails the test.
});
```

## `test.slow` — triple the timeout

```ts
test('a long crawl', async ({ page }) => {
  test.slow();
  // Triples the test timeout (e.g. 30s → 90s)
});
```

Cannot be used inside `beforeAll`/`afterAll` — use `test.setTimeout(ms)` there.

## Tags (for filtering)

Tags begin with `@` and can be in the title or in the details object:

```ts
test('login flow @smoke @auth', async ({ page }) => { /* ... */ });

test('full report', { tag: ['@slow', '@vrt'] }, async ({ page }) => { /* ... */ });

test.describe('group', { tag: '@auth' }, () => {
  // ... all tests inherit @auth
});
```

Filter:
```bash
npx playwright test --grep @smoke
npx playwright test --grep-invert @slow
npx playwright test --grep "@smoke|@auth"            # OR
npx playwright test --grep "(?=.*@smoke)(?=.*@auth)" # AND
```

In config:
```ts
grep: /@smoke/,
grepInvert: /@slow/,
```

## Annotations

```ts
test('flow', {
  annotation: { type: 'issue', description: 'GH#1234' },
}, async ({ page }) => { /* ... */ });

// Multiple
test('multi-flow', {
  annotation: [
    { type: 'issue', description: 'GH#1234' },
    { type: 'flake', description: 'sometimes hangs in CI' },
  ],
}, async ({ page }) => { /* ... */ });

// Runtime
test('dynamic', async ({ browser }) => {
  test.info().annotations.push({ type: 'browser', description: browser.version() });
});
```

Annotations whose `type` starts with `_` are hidden from the HTML reporter.

## `test.step` — group steps in trace/report

```ts
test('purchase flow', async ({ page, sessionsPage }) => {
  await test.step('open new session dialog', async () => {
    await sessionsPage.goto();
    await sessionsPage.newSessionButton.click();
  });
  await test.step('fill in details', async () => {
    await page.getByLabel('Name').fill('My session');
    await page.getByRole('button', { name: 'Create' }).click();
  });
});
```

Steps appear as collapsible sections in the HTML report and trace viewer.

## Projects for splitting

Use multiple projects when you want different defaults per group of tests:

```ts
projects: [
  { name: 'smoke', testMatch: /smoke\.spec\.ts/, retries: 0 },
  { name: 'full',  testIgnore: /smoke\.spec\.ts/, retries: 2 },
]
```

```bash
npx playwright test --project=smoke
```

## Project dependencies (setup chains)

```ts
projects: [
  { name: 'auth-setup', testMatch: /auth\.setup\.ts/ },
  { name: 'main', dependencies: ['auth-setup'] },
]
```

Setup runs first; main runs only if setup passes.

## Watch mode

UI mode includes a watch feature:
```bash
npx playwright test --ui
```

For a CLI watch (no UI):
```bash
npx playwright test --watch
```

(Re-runs the last command on file change.)

## Maximum failures

Stop after N failures:
```ts
maxFailures: process.env.CI ? 10 : undefined,
```

```bash
npx playwright test --max-failures=5
npx playwright test -x   # exit on first failure
```

## Running the last failed tests

```bash
npx playwright test --last-failed
```

## Globs / direct file specs

```bash
npx playwright test e2e/sessions.spec.ts e2e/work.spec.ts
npx playwright test e2e/sessions.spec.ts:42       # specific line
npx playwright test 'sessions/*'                  # regex against full path
```

## Suite organization conventions for CoPilot Commander

| File | Tests in scope |
|------|---------------|
| `smoke.spec.ts` | App launches, sidebar, basic navigation |
| `home.spec.ts` | Home/Dashboard rendering, action cards, quick prompt |
| `sessions.spec.ts` (was `work-launchpad.spec.ts`) | Sessions launchpad, new-session flow |
| `work-page.spec.ts` | Work/chat page, message rendering, mode cycling |
| `notes.spec.ts` (1.13.0+) | Notes page, attach-to-session flow |
| `configure.spec.ts` | Settings tabs, MCP, plugins |
| `extensions.spec.ts` | Extensions list, enable/disable |
| `extensions-integration.spec.ts` | Real extension package — excluded from default run |
| `screenshot-crawl.spec.ts` | Visual regression — separate config |
| `accessibility.spec.ts` | a11y assertions |

Match the names from the existing WDIO suite during migration; rename only when consolidating.
