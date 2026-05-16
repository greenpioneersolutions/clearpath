# Example: Electron Evaluate & IPC

Three patterns for crossing process boundaries from a Playwright test, with worked examples.

## The three layers

| Pattern | API | Where the function runs |
|---------|-----|-------------------------|
| A — Main process | `electronApp.evaluate(fn, arg?)` | Electron main process; `fn` receives `require('electron')` as first arg |
| B — Renderer DOM | `page.evaluate(fn, arg?)` | Renderer's window context |
| C — IPC bridge | `page.evaluate(([ch,a]) => electronAPI.invoke(ch,a), [ch,a])` | Renderer; round-trips through preload → main IPC handler |

## Pattern A — Read main-process state

```ts
import { test, expect } from './fixtures';

test('main-process API access', async ({ electronApp }) => {
  // Get the user-data dir
  const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  expect(userDataDir).toMatch(/userData/);

  // Get the app version
  const version = await electronApp.evaluate(({ app }) => app.getVersion());
  expect(version).toMatch(/^\d+\.\d+\.\d+/);

  // Count open BrowserWindows
  const winCount = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().length
  );
  expect(winCount).toBe(1);

  // Check packaged status
  const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged);
  expect(isPackaged).toBe(false);

  // Get all window titles
  const titles = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.getTitle())
  );
  expect(titles[0]).toMatch(/Clear Path|CoPilot/);
});
```

## Pattern A — Pass arguments

The function ships to a different process, so closures over Node-side variables don't work. Use the `arg` parameter:

```ts
const channel = 'cli:list-sessions';

// ❌ Wrong — `channel` is undefined inside the function
await electronApp.evaluate(() => console.log(channel));

// ✅ Right — pass via arg
await electronApp.evaluate((ch) => console.log(ch), channel);

// ✅ Multiple args via tuple
await electronApp.evaluate(
  ([ch, payload]) => console.log(ch, payload),
  ['cli:start-session', { name: 'test' }] as const,
);
```

## Pattern A — Mutate main-process state (sparingly)

```ts
test('manipulate the focused window', async ({ electronApp, page }) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    win?.setContentSize(1280, 800);
    win?.setBounds({ x: 100, y: 100, width: 1280, height: 800 });
  });

  // Verify by checking some renderer-observable effect
  const innerSize = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  expect(innerSize.w).toBe(1280);
});
```

## Pattern A — Hold a live handle (`evaluateHandle`)

For repeated operations on the same main-process object:

```ts
test('window handle persistence', async ({ electronApp }) => {
  const winHandle = await electronApp.evaluateHandle(({ BrowserWindow }) =>
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  );

  await winHandle.evaluate((bw) => bw.setBounds({ width: 1280, height: 800, x: 0, y: 0 }));
  const bounds = await winHandle.evaluate((bw) => bw.getBounds());
  expect(bounds.width).toBe(1280);

  await winHandle.evaluate((bw) => bw.focus());

  // Optional explicit cleanup
  await winHandle.dispose();
});
```

## Pattern B — Read renderer DOM

```ts
test('read DOM directly', async ({ page }) => {
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toBe('#/');

  const inputValue = await page.evaluate(
    (sel) => (document.querySelector(sel) as HTMLInputElement)?.value,
    '#name'
  );
  expect(inputValue).toBe('');

  // Multiple values via single evaluate
  const meta = await page.evaluate(() => ({
    title: document.title,
    hash: location.hash,
    rootLen: document.querySelector('#root')?.innerHTML.length ?? 0,
  }));
  expect(meta.rootLen).toBeGreaterThan(100);
});
```

## Pattern C — IPC round-trip via the preload bridge

ClearPath exposes IPC as `window.electronAPI.invoke(channel, args)`. The cleanest way is the helper:

```ts
import { invokeIPC } from './helpers/pw';

test('list sessions via IPC', async ({ page }) => {
  const sessions = await invokeIPC<{ id: string; name: string }[]>(page, 'cli:list-sessions');
  expect(Array.isArray(sessions)).toBe(true);
});

test('create then delete', async ({ page }) => {
  const id = await invokeIPC<string>(page, 'cli:start-session', { name: 'temp' });
  expect(typeof id).toBe('string');

  const before = await invokeIPC<unknown[]>(page, 'cli:list-sessions');
  await invokeIPC(page, 'cli:delete-session', id);
  const after = await invokeIPC<unknown[]>(page, 'cli:list-sessions');
  expect(after.length).toBe(before.length - 1);
});
```

### Inline (without the helper)

```ts
const sessions = await page.evaluate(
  ([ch, a]) => (window as any).electronAPI.invoke(ch, a),
  ['cli:list-sessions', null] as const,
);
```

## Pattern: Send IPC from main → renderer

Useful when the test needs to push state into the renderer that doesn't have a dedicated UI:

```ts
test('reset cache via main-side IPC', async ({ electronApp, page }) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send('test:reset-cache', { reason: 'test' });
  });

  // Renderer's IPC listener clears state — assert via the locator
  await expect(page.getByTestId('cache-status')).toHaveText('cleared');
});
```

## Pattern: Wait for a new BrowserWindow

```ts
test('opens settings in new window', async ({ page, electronApp }) => {
  const [settingsWindow] = await Promise.all([
    electronApp.waitForEvent('window'),
    page.getByRole('button', { name: 'Open settings' }).click(),
  ]);

  await settingsWindow.waitForLoadState('domcontentloaded');
  await expect(settingsWindow).toHaveTitle(/Settings/);

  // Operate on the new window like any Page
  await settingsWindow.getByRole('button', { name: 'Save' }).click();
});
```

## Pattern: Capture all main-process console output

```ts
test('captures main logs', async ({ electronApp }) => {
  const mainLogs: string[] = [];
  electronApp.on('console', (msg) => mainLogs.push(`[${msg.type()}] ${msg.text()}`));

  await electronApp.evaluate(() => console.log('hello from main'));

  expect(mainLogs.some((l) => l.includes('hello from main'))).toBe(true);
});
```

## Pattern: Forward `process()` stdio for crash debugging

```ts
test('crash diagnostics', async ({ electronApp }) => {
  const stderrLines: string[] = [];
  electronApp.process().stderr?.on('data', (d: Buffer) => stderrLines.push(d.toString()));

  // ... trigger something that may crash ...

  if (stderrLines.length) {
    console.log('Stderr captured:\n', stderrLines.join(''));
  }
});
```

## Pattern: HTTP mocking via `context.route`

For services the renderer fetches (or main process via `net.fetch`), use the BrowserContext route handler:

```ts
test('mock GitHub API', async ({ electronApp, page }) => {
  const ctx = electronApp.context();
  await ctx.route('https://api.github.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ id: 1, name: 'fake' }] }),
    });
  });

  await page.getByRole('button', { name: 'Refresh repos' }).click();
  await expect(page.getByText('fake')).toBeVisible();
});
```

## Serialization rules (for both `evaluate` flavors)

- Args must be JSON-serializable (no functions, no DOM nodes, no symbols).
- Return values are JSON-serialized — non-serializable becomes `undefined`.
- Promises are awaited automatically.
- `-0`, `NaN`, `Infinity`, `-Infinity` are correctly transferred.
- For multiple args, wrap in a tuple and add `as const` for type narrowing.

## When to use which (decision table)

| Goal | Use |
|------|-----|
| Read `app.getVersion()`, `app.getPath()` | Pattern A |
| Resize/focus a window, send IPC to it | Pattern A (or `browserWindow(page)` for a known page) |
| Query the renderer DOM (`document.querySelector`) | Pattern B |
| Read `window.location.hash` or other window state | Pattern B |
| Click a button or fill an input | **Use locators, not `page.evaluate`** |
| Round-trip IPC the way the renderer would | Pattern C |
| Wait for a new BrowserWindow | `electronApp.waitForEvent('window')` |
| Mock HTTP from renderer | `electronApp.context().route(...)` |
| Mock a native dialog | `electronApp.evaluate(({dialog}) => { dialog.showOpenDialog = ... })` |

## Anti-patterns

| Don't | Do |
|-------|-----|
| `page.evaluate(() => document.querySelector('#btn').click())` | `page.locator('#btn').click()` (auto-waits) |
| Closing over Node-side variables in `evaluate` | Pass via the `arg` parameter |
| Returning a DOM node from `page.evaluate` | Use `page.locator(...)` instead |
| Using `electronApp.evaluate` to do UI actions | Use `page` and locators |
| Stuffing many things into one `evaluate` body | Split into smaller, named helpers |
