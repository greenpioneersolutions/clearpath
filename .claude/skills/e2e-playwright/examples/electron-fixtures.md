# Example: `e2e/fixtures.ts`

Complete fixture file for ClearPath. One Electron app per worker, fresh Page per test, plus optional helpers for hermetic state and console error collection.

```ts
// e2e/fixtures.ts
import { test as base, _electron as electron, expect } from '@playwright/test';
import type { ElectronApplication, Page, ConsoleMessage } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ENTRY = path.join(__dirname, '..', 'out', 'main', 'index.js');

type WorkerFixtures = {
  electronApp: ElectronApplication;
  userDataDir: string;
};

type TestFixtures = {
  /** First Electron BrowserWindow as a Page. Overrides built-in `page`. */
  page: Page;
  /** Console errors collected during the test. */
  consoleErrors: string[];
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // ── WORKER-SCOPED ──────────────────────────────────────────────────────────

  /** A unique userData dir per worker keeps electron-store data isolated. */
  userDataDir: [
    async ({}, use, workerInfo) => {
      const dir = path.join(__dirname, '.userData', `worker-${workerInfo.workerIndex}`);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      await use(dir);
    },
    { scope: 'worker' },
  ],

  /** One Electron app per worker — launched once, reused across tests. */
  electronApp: [
    async ({ userDataDir }, use) => {
      // VS Code sets ELECTRON_RUN_AS_NODE=1 in child terminals — it MUST be unset
      // here or Electron launches as plain Node with no renderer.
      const env = { ...process.env, NODE_ENV: 'test' };
      delete env.ELECTRON_RUN_AS_NODE;

      const app = await electron.launch({
        args: [
          APP_ENTRY,
          `--user-data-dir=${userDataDir}`,
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--force-device-scale-factor=1',
        ],
        env,
        timeout: 30_000,
      });

      // Forward main-process logs to the test runner stdout — useful for diagnosing crashes.
      app.process().stdout?.on('data', (b) => process.stdout.write(`[main] ${b}`));
      app.process().stderr?.on('data', (b) => process.stderr.write(`[main:err] ${b}`));

      await use(app);

      await app.close();
    },
    { scope: 'worker', timeout: 60_000 },
  ],

  // ── TEST-SCOPED ─────────────────────────────────────────────────────────────

  /** Override the built-in `page` to return the Electron's first window. */
  page: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    // Wait for the React mount + first render. The follow-up assertion in the
    // spec auto-retries; this just kicks the wait off.
    await window.locator('#root').waitFor({ state: 'attached', timeout: 20_000 });
    await use(window);
  },

  /** Console errors gathered during the test; auto-attached on failure. */
  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      const onConsole = (msg: ConsoleMessage) => {
        if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
      };
      const onPageError = (e: Error) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`);
      page.on('console', onConsole);
      page.on('pageerror', onPageError);

      await use(errors);

      page.off('console', onConsole);
      page.off('pageerror', onPageError);

      if (testInfo.status !== testInfo.expectedStatus && errors.length) {
        await testInfo.attach('console-errors', {
          body: errors.join('\n'),
          contentType: 'text/plain',
        });
      }
    },
    { auto: true },                   // run for every test, even if not referenced
  ],
});

export { expect };
```

## Usage in a spec

```ts
// e2e/smoke.pw.spec.ts
import { test, expect } from './fixtures';

test('app launches and shows main window', async ({ page, electronApp }) => {
  await expect(page).toHaveTitle(/Clear Path|CoPilot/);

  // Read main-process state
  const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged);
  expect(isPackaged).toBe(false);
});

test('navigates to Sessions', async ({ page }) => {
  await page.locator('aside').getByRole('link', { name: 'Sessions' }).click();
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
});

test('console-error fixture is auto-applied', async ({ page, consoleErrors }) => {
  // consoleErrors is the array — it accumulates during the test.
  await page.locator('aside').getByRole('link', { name: 'Settings' }).click();
  expect(consoleErrors).toEqual([]);   // assert no errors
});
```

## Variations

### Pin window size before each test

```ts
page: async ({ electronApp }, use) => {
  const window = await electronApp.firstWindow();
  // Pin to a known viewport so visual tests are stable
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    w?.setContentSize(1280, 800);
  });
  await window.waitForLoadState('domcontentloaded');
  await use(window);
},
```

### Mocked CLI flag

If the app honors `CLEARPATH_E2E_FAKE_CLI=1` to use a fake CLI adapter:

```ts
electronApp: [async ({ userDataDir }, use) => {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    CLEARPATH_E2E_FAKE_CLI: '1',     // gates the CLIManager fake adapter
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ /* ... */ });
  await use(app);
  await app.close();
}, { scope: 'worker' }],
```

### Reset stores between tests

```ts
resetStores: [
  async ({ electronApp }, use) => {
    // Wipe stores via IPC before each test
    await electronApp.evaluate(async ({ ipcMain }: any) => {
      // Hypothetical channel — assumes app exposes a "reset" handler in test mode
      // Otherwise, delete the JSON files directly:
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { app } = await import('electron');
      const userData = app.getPath('userData');
      for (const file of [
        'clear-path-sessions.json',
        'clear-path-settings.json',
        'clear-path-notifications.json',
        'clear-path-cost.json',
        'clear-path-history.json',
        'clear-path-mcps.json',
        'clear-path-notes.json',
      ]) {
        try { fs.unlinkSync(path.join(userData, file)); } catch {}
      }
    });
    await use();
  },
  { auto: true },
],
```

> Note: this fixture re-runs per test. If you want stores reset only at start of worker, use `{ scope: 'worker', auto: true }`.

### Page Object fixtures

```ts
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';

type Pages = TestFixtures & {
  sessionsPage: SessionsPage;
  settingsPage: SettingsPage;
};

export const test = base.extend<Pages, WorkerFixtures>({
  // ... electronApp, userDataDir, page, consoleErrors as above ...

  sessionsPage: async ({ page }, use) => use(new SessionsPage(page)),
  settingsPage: async ({ page }, use) => use(new SettingsPage(page)),
});
```

Then in a spec:
```ts
test('archive a session', async ({ sessionsPage }) => {
  await sessionsPage.goto();
  await sessionsPage.archive('Old session');
});
```

## Important pitfalls

1. **Worker-scoped fixture failure crashes the whole worker.** If `electron.launch()` throws once, Playwright restarts the worker and retries — make sure the `args` are correct or you'll loop until the global timeout.
2. **`await app.close()` is the only teardown** — don't also call `app.process().kill()` in another hook (double-close can leave zombies).
3. **`userDataDir` collisions** — if you re-run after a previous worker left data, the fixture wipes & recreates — fine. But running two test commands at once with the same `workerIndex` (impossible normally, but possible with two CI processes on one runner) collides.
4. **`page` fixture overrides the built-in** — but only because we declared `page: ...`. If you forget that, your test gets a fresh BrowserContext-backed Page, which doesn't connect to Electron.
5. **`consoleErrors` is `auto: true`** — runs for every test even when not referenced. That's intentional — you want pageerror capture on failures you didn't explicitly check.
