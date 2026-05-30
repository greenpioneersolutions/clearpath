# Advanced Playwright APIs

Topics that come up less often than locators/expect/fixtures but are essential for some test scenarios — API testing, native dialogs, browser permissions, time mocking, storage state, packaged-binary smoke tests.

## `page.request` / `APIRequestContext` — direct HTTP calls

Use when you want to seed data via HTTP without going through the UI, or assert against an API directly.

```ts
test('seed via HTTP', async ({ page, request }) => {
  // request fixture is an APIRequestContext bound to the page's context
  const response = await request.post('http://localhost:3000/api/seed', {
    data: { sessions: [{ name: 'fixture' }] },
  });
  expect(response.ok()).toBeTruthy();
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.id).toBeDefined();
});

// Standalone request context (no Page)
import { request as pwRequest } from '@playwright/test';
const ctx = await pwRequest.newContext({ baseURL: 'https://api.example.com' });
const data = await ctx.get('/items').then((r) => r.json());
await ctx.dispose();
```

For Electron tests, `request` works for any HTTP server you spin up (test fixtures, mock backends). It does NOT round-trip through the Electron main process — it's an independent HTTP client.

## `page.on('dialog')` — renderer-level alerts

Distinct from native Electron dialogs. JS `alert()`/`confirm()`/`prompt()`/`beforeunload` show through this listener:

```ts
test('handles confirm', async ({ page }) => {
  page.on('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toMatch(/are you sure/i);
    await dialog.accept();      // or dialog.dismiss()
  });
  await page.getByRole('button', { name: 'Delete' }).click();
});
```

For `prompt()`:
```ts
page.on('dialog', (d) => d.accept('user input'));
```

> **Native Electron dialogs (`electron.dialog.showOpenDialog`) DO NOT fire `page.on('dialog')`** — they live in the main process. Stub them via `mockElectronApi(electronApp, 'dialog', 'showOpenDialog')` instead.

## `context.grantPermissions` — clipboard, notifications, geolocation

Some app features check `navigator.permissions` or fail without permission. Grant them at the context level:

```ts
const ctx = electronApp.context();
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await ctx.grantPermissions(['geolocation']);
await ctx.grantPermissions(['notifications']);

// Reset
await ctx.clearPermissions();
```

Common permissions: `'geolocation'`, `'notifications'`, `'camera'`, `'microphone'`, `'midi'`, `'midi-sysex'`, `'background-sync'`, `'ambient-light-sensor'`, `'accelerometer'`, `'gyroscope'`, `'magnetometer'`, `'accessibility-events'`, `'clipboard-read'`, `'clipboard-write'`, `'payment-handler'`.

For specific origins:
```ts
await ctx.grantPermissions(['geolocation'], { origin: 'https://example.com' });
```

## `page.clock` — time mocking

For testing time-dependent UI (countdowns, "X minutes ago" badges) without the freeze-content workaround:

```ts
test('countdown updates', async ({ page }) => {
  // Install fake clock at a fixed instant
  await page.clock.install({ time: new Date('2026-05-06T12:00:00Z') });

  await page.goto('/timer');
  await expect(page.getByTestId('elapsed')).toHaveText('0s');

  // Fast-forward 30 seconds
  await page.clock.fastForward(30_000);
  await expect(page.getByTestId('elapsed')).toHaveText('30s');

  // Run all pending timers without advancing virtual time
  await page.clock.runFor(1000);

  // Resume real time
  await page.clock.resume();

  // Or pause again
  await page.clock.pauseAt(new Date('2026-05-06T13:00:00Z'));
});
```

Methods: `install({ time? })`, `pauseAt(time)`, `resume()`, `runFor(ms)`, `fastForward(ms | string)`, `setFixedTime(time)`, `setSystemTime(time)`.

For visual-test stability, the existing `freezeDynamicContent` helper still has a place — it covers cases where the displayed text isn't strictly time-derived (greetings, locale formatting). Use `page.clock` for testing actual countdown/elapsed-time behavior.

## `context.storageState()` — persist auth across tests

For web-style apps you'd save cookies/localStorage to a file and reuse it. Less commonly needed for Electron (auth is in OS keychain or main-process state), but useful when:
- The renderer has its own storage (localStorage/IndexedDB) you want to seed
- You're running tests across multiple BrowserContexts

```ts
// Save state once
const ctx = electronApp.context();
await ctx.storageState({ path: 'e2e/auth.json' });

// Reuse via use:
test.use({ storageState: 'e2e/auth.json' });
```

For most ClearPath tests, the per-worker `userDataDir` fixture is the right pattern — `electron-store` data is on disk, not in browser storage.

## Packaged binary testing

Smoke-testing the actual `.app` / `.exe` produced by `electron-builder`:

```ts
// e2e/packaged.fixtures.ts
import { test as base, _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import path from 'node:path';

const PACKAGED_BINARY =
  process.platform === 'darwin'
    ? path.join(__dirname, '..', 'dist-electron', 'mac-arm64', 'ClearPathAI.app', 'Contents', 'MacOS', 'ClearPathAI')
    : process.platform === 'win32'
    ? path.join(__dirname, '..', 'dist-electron', 'ClearPathAI.exe')
    : path.join(__dirname, '..', 'dist-electron', 'ClearPathAI.AppImage');

export const test = base.extend<{}, { electronApp: ElectronApplication }>({
  electronApp: [async ({}, use) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({
      executablePath: PACKAGED_BINARY,
      args: [],                          // packaged binary already knows main script
      env,
      timeout: 60_000,
    });
    await use(app);
    await app.close();
  }, { scope: 'worker' }],
});
```

```ts
// e2e/packaged-smoke.packaged.spec.ts
import { test, expect } from './packaged.fixtures';

test('packaged build launches', async ({ electronApp }) => {
  const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged);
  expect(isPackaged).toBe(true);

  const window = await electronApp.firstWindow();
  await expect(window).toHaveTitle(/Clear Path|CoPilot/);
});
```

### Packaged binary caveats

- **Electron Fuses**: `RunAsNode` AND `EnableNodeCliInspectArguments` must remain enabled in production builds, or `electron.launch()` cannot connect. Check `electron-builder`'s `electronFuses:` block and any `forge.config` in the repo.
- **ASAR**: `out/main/index.js` is bundled into `app.asar` — you can't pass it as `args[0]` to a packaged binary. The binary already knows where its main script is.
- **Code signing**: macOS may quarantine unsigned dmgs; tests should run against the locally-built binary, not a downloaded artifact.
- **Auto-updater**: stub out `electron-updater` if your packaged build hits update servers on launch.
- **Project layout**: Define a separate `playwright.packaged.config.ts` with a single `packaged` project that uses these fixtures, and `testMatch: /\.packaged\.spec\.ts/` so packaged tests don't run alongside the unpackaged smoke suite.

## Network HAR record/replay

Record real network traffic during a test, then replay it later for offline runs.

**Recording phase** (run once to capture):
```ts
// e2e/record-har.ts (one-shot script, NOT run in CI)
const electronApp = await electron.launch({
  args: [APP_ENTRY],
  recordHar: { path: 'e2e/har/copilot-auth.har', mode: 'full' },
});
// ... drive the flow you want recorded ...
await electronApp.close();   // CRITICAL — flushes the HAR file
```

**Replay phase** (in your fixture, against a freshly launched app):
```ts
// e2e/fixtures.ts (excerpt)
const electronApp = await electron.launch({ args: [APP_ENTRY], env });
const ctx = electronApp.context();
await ctx.routeFromHAR('e2e/har/copilot-auth.har');   // default replays without updating
```

Useful for testing flows that depend on third-party APIs without depending on those APIs in CI.

## Codegen does NOT work for Electron

The `npx playwright codegen` command launches a browser with a recording overlay. It cannot target Electron — Playwright's library API doesn't expose a "record" mode for `_electron.launch`.

**Workaround:** drop `await page.pause()` in a spec, run with `--headed --workers=1`, and use the Inspector's "Record" button. Subsequent UI actions show up as code in the right pane; copy/paste into your spec. This is the recommended path for Electron.

## `webContents.executeJavaScript` — alternative to `page.evaluate`

If you only have a `BrowserWindow` reference (not a Page), you can run code in the renderer via `webContents.executeJavaScript`:

```ts
const result = await electronApp.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript(
    "document.querySelector('#root')?.innerHTML.length ?? 0"
  )
);
```

This is rarely needed — for any window you can get a `Page` via `firstWindow()` or `windows()[i]` and call `page.evaluate()`. Use `executeJavaScript` only when the window doesn't have a Page wrapper (e.g. a `BrowserView` you constructed in main).

## Multiple BrowserWindows

ClearPath mostly uses a single window, but extensions or future features may add modals/splash windows.

```ts
test('handles split-screen extension window', async ({ page, electronApp }) => {
  // Listen for any new windows created during the test
  const newPages: Page[] = [];
  electronApp.on('window', (p) => newPages.push(p));

  await page.getByRole('button', { name: 'Open extension' }).click();

  // wait for the extension window
  await expect.poll(() => newPages.length).toBeGreaterThan(0);
  const extPage = newPages[0];
  await extPage.waitForLoadState('domcontentloaded');

  // Drive the second window
  await expect(extPage.getByText('Extension dashboard')).toBeVisible();
});
```

`electronApp.windows()` returns currently-open Pages synchronously, but the array updates as windows open/close — capture the snapshot when you need it. Always wait for `domcontentloaded` before driving a new window.

## `page.evaluate(window.electronAPI)` exposed via preload

ClearPath's preload bridge exposes `window.electronAPI.invoke`. To round-trip an IPC call AS THE RENDERER WOULD:

```ts
const result = await page.evaluate(
  ([ch, a]) => (window as any).electronAPI.invoke(ch, a),
  ['cli:list-sessions', null] as const,
);
```

This is preferred over calling `ipcMain.handle('ch')` directly via `electronApp.evaluate`, because it tests the **whole IPC pipeline** — preload contextBridge serialization, channel routing, handler invocation, and return-value transport.
