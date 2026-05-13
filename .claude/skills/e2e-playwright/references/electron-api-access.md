# Electron API Access

How to drive the Electron main process and renderer from a Playwright test. Replaces WDIO's `browser.electron.execute()` and `browser.execute()`.

## Three execution layers

| Layer | API | What it has access to |
|-------|-----|----------------------|
| **Main process** | `electronApp.evaluate(fn, arg?)` / `evaluateHandle` | `app`, `BrowserWindow`, `ipcMain`, `dialog`, `shell`, `Menu`, `nativeTheme`, `safeStorage`, `session`, `crashReporter` |
| **Renderer (DOM)** | `page.evaluate(fn, arg?)` | `document`, `window`, React state via `window.electronAPI`, anything in the renderer's window |
| **Renderer (IPC bridge)** | `page.evaluate(([ch, a]) => (window as any).electronAPI.invoke(ch, a), [channel, args])` | Round-trip through the preload bridge → main IPC handler |

## `electronApp.evaluate(pageFunction, arg?)`

Runs in the **main Electron process**. The first parameter passed to your function is the result of `require('electron')` in the main script — destructure what you need.

```ts
test('reads main-process state', async ({ electronApp }) => {
  const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  const isPackaged  = await electronApp.evaluate(({ app }) => app.isPackaged);
  const version     = await electronApp.evaluate(({ app }) => app.getVersion());
  const winCount    = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
});
```

**Serialization rules** (same as `page.evaluate`):
- Args must be JSON-serializable (no functions, classes, DOM nodes).
- Return value must be JSON-serializable. Non-serializable values become `undefined`.
- `-0`, `NaN`, `Infinity`, `-Infinity` are correctly transferred.
- Promises are awaited automatically.

**Don't close over Node-side variables** — the function ships to a different process. Use the `arg` parameter:

```ts
const channel = 'plugins:list';
// ❌ Wrong — `channel` is undefined inside the function
await electronApp.evaluate(() => console.log(channel));
// ✅ Right — pass via arg
await electronApp.evaluate((ch) => console.log(ch), channel);
```

## `electronApp.evaluateHandle(pageFunction, arg?)`

Same as `evaluate`, but returns a `JSHandle` that keeps the underlying main-process object alive. Use when you want to keep operating on a `BrowserWindow`, `Menu`, `ipcMain` listener, or other live object.

```ts
const winHandle = await electronApp.evaluateHandle(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]
);
await winHandle.evaluate((bw) => bw.setBounds({ x: 0, y: 0, width: 1280, height: 800 }));
const bounds = await winHandle.evaluate((bw) => bw.getBounds());
await winHandle.dispose(); // optional — released when fixture tears down
```

## `electronApp.browserWindow(page)`

Convenience: get a `JSHandle<BrowserWindow>` for a specific Page. Useful when you have a Page and want to call BrowserWindow methods on it (resize, focus, send to front, send IPC to it).

```ts
const winHandle = await electronApp.browserWindow(page);
await winHandle.evaluate((bw) => {
  bw.webContents.send('test:reset', null);
  bw.setBounds({ width: 1280, height: 800, x: 0, y: 0 });
});
```

## `electronApp.firstWindow({ timeout? })`

Wait for the first BrowserWindow's renderer to be ready and return it as a Page. Default timeout 30s; override with `setDefaultTimeout` on the context.

```ts
const window = await electronApp.firstWindow();
await window.waitForLoadState('domcontentloaded');
```

## `electronApp.windows()` (synchronous)

All currently open BrowserWindows as Pages. Returns an empty array if no windows are open yet — use `firstWindow()` to wait.

## `electronApp.waitForEvent(event, predicate?)`

Wait for the next emission of `'window'` or `'close'`. Useful when an action opens a new BrowserWindow:

```ts
const [settingsWindow] = await Promise.all([
  electronApp.waitForEvent('window'),
  page.getByRole('button', { name: 'Open Settings' }).click(),
]);
await settingsWindow.waitForLoadState('domcontentloaded');
```

`waitForEvent` accepts either a predicate function or an `{ predicate?, timeout? }` object.

## `electronApp.context()`

Returns the underlying `BrowserContext`. This is your handle for:
- `context.tracing.start({ screenshots: true, snapshots: true })` / `context.tracing.stop({ path: 'trace.zip' })`
- `context.route(url, handler)` for HTTP mocking from main/renderer
- `context.setDefaultTimeout(ms)` for context-wide timeout
- `context.cookies()`, `context.storageState()`

## `electronApp.process()`

Returns the Node `ChildProcess` of the main Electron process. Useful for:
- Reading stdout/stderr (debugging crashes, log inspection)
- Sending signals (`kill`)
- Reading `pid`

```ts
electronApp.process().stdout?.on('data', (d) => process.stdout.write(`[main] ${d}`));
electronApp.process().stderr?.on('data', (d) => process.stderr.write(`[main:err] ${d}`));
```

## `electronApp.on('console', listener)` (v1.42+)

Capture **main-process** `console.log` / `console.error`. Note: renderer console comes from `page.on('console')`.

```ts
electronApp.on('console', (msg) => console.log(`[main]`, msg.type(), msg.text()));
```

## Renderer-side patterns

### Pattern A — DOM access via `page.evaluate`

```ts
const hash = await page.evaluate(() => window.location.hash);
const value = await page.evaluate((sel) => (document.querySelector(sel) as HTMLInputElement)?.value, '#name');
```

### Pattern B — IPC round-trip via `electronAPI.invoke`

CoPilot Commander exposes IPC via `window.electronAPI.invoke(channel, args)` (preload bridge). To exercise an IPC handler from the renderer side:

```ts
const sessions = await page.evaluate(
  ([ch, a]) => (window as any).electronAPI.invoke(ch, a),
  ['cli:list-sessions', null] as const,
);
```

Wrap it in a helper:

```ts
async function invokeIPC<T = unknown>(page: Page, channel: string, args?: unknown): Promise<T> {
  return page.evaluate(
    ([ch, a]) => (window as any).electronAPI.invoke(ch, a),
    [channel, args] as const,
  );
}
```

### Pattern C — Send IPC from main to renderer

```ts
await electronApp.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0];
  win?.webContents.send('test:flush-cache', null);
});
// then assert via locator
await expect(page.getByTestId('cache-status')).toHaveText('cleared');
```

## When to use which

| Goal | Use |
|------|-----|
| Read `app.getVersion()` / `app.getPath()` / `BrowserWindow.getAllWindows()` | `electronApp.evaluate` |
| Resize the window or call `webContents.send` | `electronApp.evaluate` (or `browserWindow(page)` then `winHandle.evaluate`) |
| Call an IPC handler the renderer would invoke | `page.evaluate(['ch', a], ([ch,a])=>electronAPI.invoke(ch,a))` |
| Read DOM / `window.location.hash` | `page.evaluate` |
| Click a button or fill an input | `page.locator(...).click()` / `.fill()` (NEVER use `page.evaluate` for this) |
| Wait for a new BrowserWindow to open | `electronApp.waitForEvent('window')` |
| Get the underlying `child_process.ChildProcess` | `electronApp.process()` |

## Common Electron one-liners

```ts
// Quit the app from a test (rarely needed — the fixture handles it)
await electronApp.evaluate(({ app }) => app.quit());

// Read all open window titles
const titles = await electronApp.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().map((w) => w.getTitle())
);

// Open a URL in default browser (test stubs this — see electron-api-mocking.md)
await electronApp.evaluate(({ shell }) => shell.openExternal('https://example.com'));

// Read current ipcMain handlers (debugging)
const handlerCount = await electronApp.evaluate(({ ipcMain }) =>
  (ipcMain as any).eventNames().length
);

// Resize main window
await electronApp.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.setContentSize(1280, 800);
});

// Get userData path for a hermetic-store test
const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
```

## Console / pageerror collection (renderer)

The WDIO `getCriticalConsoleErrors()` helper read `browser.getLogs('browser')`. In Playwright, attach listeners early via a fixture:

```ts
// in fixtures.ts
page: async ({ electronApp }, use, testInfo) => {
  const window = await electronApp.firstWindow();
  const errors: string[] = [];
  window.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  window.on('pageerror', (e) => errors.push(e.message));
  await window.waitForLoadState('domcontentloaded');
  await use(window);
  if (errors.length) testInfo.attach('console-errors', { body: errors.join('\n'), contentType: 'text/plain' });
},
```
