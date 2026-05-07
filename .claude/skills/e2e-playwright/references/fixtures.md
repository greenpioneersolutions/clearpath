# Fixtures

Fixtures replace beforeAll/afterAll plumbing with composable, scoped setup. The Electron migration relies on fixtures heavily — the worker-scoped `electronApp` is the central plumbing.

## Built-in fixtures

| Fixture | Type | Notes |
|---------|------|-------|
| `page` | `Page` | Test-scoped — fresh context per test (web tests). For Electron, you'll OVERRIDE this to return `electronApp.firstWindow()`. |
| `context` | `BrowserContext` | Test-scoped. For Electron, derive from `electronApp.context()`. |
| `browser` | `Browser` | Worker-scoped. **Not used for Electron** (we don't launch a browser). |
| `browserName` | `string` | `chromium`/`firefox`/`webkit`. Not relevant for Electron. |
| `request` | `APIRequestContext` | Standalone HTTP client. |

## Defining custom fixtures — `test.extend()`

```ts
// e2e/fixtures.ts
import { test as base, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'node:path';

type WorkerFixtures = {
  electronApp: ElectronApplication;
};
type TestFixtures = {
  // Override built-in `page` with the Electron first window
  page: Page;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  electronApp: [async ({}, use) => {
    const env = { ...process.env, NODE_ENV: 'test' };
    delete env.ELECTRON_RUN_AS_NODE;

    const app = await electron.launch({
      args: [path.join(__dirname, '..', 'out/main/index.js'), '--no-sandbox'],
      env,
      timeout: 30_000,
    });

    await use(app);

    await app.close();
  }, { scope: 'worker' }],

  page: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },
});

export { expect } from '@playwright/test';
```

> Generic order matters: `test.extend<TestFixtures, WorkerFixtures>()` — test scope first.

## Scopes

| Scope | When set up / torn down |
|-------|------------------------|
| `'test'` (default) | Once per test |
| `'worker'` | Once per worker process |

Use **worker** when setup is expensive AND test isolation isn't required:
- Launching Electron (5-15s)
- Connecting to a remote DB
- Authenticating with OAuth (storage state)

Use **test** for state that must reset:
- Fresh user data dir per test
- Clean database row
- Per-test mocks

## Auto fixtures (`{ auto: true }`)

Run even if no test references them. Useful for cross-cutting setup like attaching console listeners or saving logs on failure.

```ts
saveConsoleOnFailure: [async ({ page }, use, testInfo) => {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await use();   // run the test

  if (testInfo.status !== testInfo.expectedStatus && errors.length) {
    await testInfo.attach('console-errors', {
      body: errors.join('\n'),
      contentType: 'text/plain',
    });
  }
}, { auto: true }],
```

## Option fixtures (`{ option: true }`) — declarative project config

Expose a "knob" tests can rely on, settable per-project in `playwright.config.ts`:

```ts
export const test = base.extend<{ defaultLanguage: string }>({
  defaultLanguage: ['en-US', { option: true }],
  page: async ({ defaultLanguage, page }, use) => {
    await page.evaluate((lang) => navigator.language = lang, defaultLanguage);
    await use(page);
  },
});

// playwright.config.ts
projects: [
  { name: 'english', use: { defaultLanguage: 'en-US' } },
  { name: 'french',  use: { defaultLanguage: 'fr-FR' } },
];
```

## Box fixtures (`{ box: true }`) — hide from reports

Useful for fixtures that wrap multiple internal steps you don't want cluttering the trace:

```ts
authenticatedApp: [async ({}, use) => {
  // ... lots of setup steps ...
  await use(app);
}, { box: true }],
```

`box: true` hides ALL inner steps from the UI/HTML report. `box: 'self'` shows inner steps but hides the wrapper itself.

## Custom title

```ts
electronApp: [async ({}, use) => { /* ... */ }, { scope: 'worker', title: 'Electron app' }],
```

## Per-fixture timeout

```ts
slowSetup: [async ({}, use) => { /* ... */ }, { scope: 'worker', timeout: 120_000 }],
```

Worker-scoped fixtures default to test timeout; override when slower.

## Override built-in fixtures

```ts
// Override `context` to add HTTP route
context: async ({ context }, use) => {
  await context.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await use(context);
},

// Override `storageState` to inject auth
storageState: async ({}, use) => {
  await use({ cookies: [/* ... */], origins: [] });
},
```

## Composing — `mergeTests`

Pull fixtures from multiple sources:

```ts
import { mergeTests } from '@playwright/test';
import { test as electronTest } from './electron-fixtures';
import { test as a11yTest } from './a11y-fixtures';
import { test as ipcTest } from './ipc-fixtures';

export const test = mergeTests(electronTest, a11yTest, ipcTest);
```

## Execution order rules

- Fixture A depending on B: B set up before A, torn down after A.
- Non-auto fixtures lazy — only set up when referenced.
- Auto worker fixtures run before `beforeAll`. Auto test fixtures run before `beforeEach`.
- Worker fixtures torn down at worker shutdown. Test fixtures torn down per test.

## Worker-info / test-info

Fixtures get `workerInfo` (worker scope) or `testInfo` (test scope) as the third argument:

```ts
electronApp: [async ({}, use, workerInfo) => {
  console.log(`Worker ${workerInfo.workerIndex} (parallel ${workerInfo.parallelIndex})`);
  // workerInfo.config — full TestConfig
  // workerInfo.project — TestProject
  // workerInfo.workerIndex — 0..N (1-based on the worker; bumps on retry)
  // workerInfo.parallelIndex — 0..workers-1 (stable across retries)
  // ...
}, { scope: 'worker' }],

page: async ({ electronApp }, use, testInfo) => {
  // testInfo.title, testInfo.outputPath, testInfo.attach, testInfo.status
  console.log(`Test "${testInfo.title}" output dir: ${testInfo.outputDir}`);
  await use(...);
},
```

## Project fixtures for hermetic state

For tests that mutate `electron-store` (sessions, settings, MCPs, costs, plugins), use a worker-scoped `userDataDir` fixture so each worker gets its own slot, and a test-scoped `cleanStores` fixture that wipes between tests:

```ts
userDataDir: [async ({}, use, workerInfo) => {
  const dir = path.join(__dirname, '.userData', `w${workerInfo.workerIndex}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await use(dir);
}, { scope: 'worker' }],

electronApp: [async ({ userDataDir }, use) => {
  const env = { ...process.env, NODE_ENV: 'test' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [APP_ENTRY, `--user-data-dir=${userDataDir}`, '--no-sandbox'],
    env,
  });
  await use(app);
  await app.close();
}, { scope: 'worker' }],

resetStores: [async ({ electronApp }, use) => {
  await electronApp.evaluate(({ app }) => {
    // your app's IPC for "reset all stores" or direct store manipulation
  });
  await use();
}, { auto: true }],
```

## Pitfalls

1. **Forgetting `scope: 'worker'`** for the `electronApp` fixture means a fresh launch for every test (slow, redundant).
2. **Sharing `page` across tests** breaks isolation — DOM state leaks. Use a per-test `page` fixture (default).
3. **Long-lived fixture** + a flaky test that doesn't tear down properly leaves the app in a weird state for the next test. Always restore mocks in `afterEach`, not the fixture.
4. **Worker fixture failing in setup** crashes the whole worker — Playwright restarts it (and re-runs `beforeAll`).
5. **Closing `electronApp` more than once** — make `await app.close()` your only teardown; don't also call `app.process().kill()` in a hook.
