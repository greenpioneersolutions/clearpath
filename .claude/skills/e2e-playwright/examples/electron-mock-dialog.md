# Example: Mock an Electron Dialog

Worked example using the helper from [references/electron-api-mocking.md](../references/electron-api-mocking.md). Shows the full lifecycle: install → configure → trigger UI → assert calls → restore.

## Setup

```ts
// e2e/sessions.pw.spec.ts
import { test, expect } from './fixtures';
import { mockElectronApi, restoreAllElectronMocks } from './helpers/electronMock';
```

The helper is in [`references/electron-api-mocking.md`](../references/electron-api-mocking.md). Drop it at `e2e/helpers/electronMock.ts`.

## Mock `dialog.showOpenDialog`

```ts
test.describe('Import config', () => {
  test.afterEach(async ({ electronApp }) => {
    // CRITICAL — restore all mocks between tests so they don't leak
    await restoreAllElectronMocks(electronApp);
  });

  test('imports a JSON file', async ({ page, electronApp }) => {
    // 1. Install the mock BEFORE clicking the button
    const dialog = await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');

    // 2. Configure the return value (canceled = false to simulate selection)
    await dialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/fixture-config.json'],
    });

    // 3. Trigger the UI flow that calls showOpenDialog
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Import config' }).click();

    // 4. Assert the dialog was called once with the expected options
    expect(await dialog.calls()).toHaveLength(1);
    const lastCall = await dialog.lastCall();
    expect(lastCall?.[0]).toMatchObject({
      properties: expect.arrayContaining(['openFile']),
      filters: expect.arrayContaining([expect.objectContaining({ extensions: ['json'] })]),
    });

    // 5. Assert the UI reflects the import
    await expect(page.getByTestId('toast')).toContainText('Imported');
  });

  test('handles cancel', async ({ page, electronApp }) => {
    const dialog = await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');
    await dialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Import config' }).click();

    // No toast — UI must handle the cancel quietly
    await expect(page.getByTestId('toast')).toBeHidden();
    expect(await dialog.calls()).toHaveLength(1);
  });
});
```

## Mock `dialog.showSaveDialog`

```ts
test('exports config to user-chosen path', async ({ page, electronApp }) => {
  const save = await mockElectronApi(electronApp, 'dialog', 'showSaveDialog');
  await save.mockResolvedValue({ canceled: false, filePath: '/tmp/exported-config.json' });

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Export config' }).click();

  expect(await save.calls()).toHaveLength(1);
  await expect(page.getByTestId('toast')).toContainText('Exported to /tmp/exported-config.json');

  await restoreAllElectronMocks(electronApp);
});
```

## Mock `dialog.showMessageBox`

`showMessageBox` returns `{ response: <button index> }`:

```ts
test('confirms destructive action', async ({ page, electronApp }) => {
  const msg = await mockElectronApi(electronApp, 'dialog', 'showMessageBox');
  // 0 = first button (Cancel), 1 = Confirm, etc.
  await msg.mockResolvedValue({ response: 1 });

  await page.getByRole('button', { name: 'Reset all data' }).click();

  expect(await msg.calls()).toHaveLength(1);
  const lastArgs = await msg.lastCall();
  // showMessageBox(window, options) — args[1] is the options object
  expect(lastArgs?.[1]).toMatchObject({
    type: 'warning',
    buttons: expect.arrayContaining(['Cancel', 'Confirm']),
  });

  await expect(page.getByTestId('toast')).toContainText('Reset complete');

  await restoreAllElectronMocks(electronApp);
});
```

## Mock `shell.openExternal`

The app uses `shell.openExternal` to open URLs in the user's default browser. Mock it so tests don't actually open browser windows.

```ts
test('opens external URL on link click', async ({ page, electronApp }) => {
  const ext = await mockElectronApi(electronApp, 'shell', 'openExternal');
  await ext.mockResolvedValue(undefined);

  await page.getByRole('link', { name: 'Documentation' }).click();

  expect(await ext.calls()).toHaveLength(1);
  expect((await ext.lastCall())?.[0]).toBe('https://docs.clearpath.ai');

  await restoreAllElectronMocks(electronApp);
});
```

## Mock `app.quit` (be careful)

```ts
test('quits via menu', async ({ page, electronApp }) => {
  const quit = await mockElectronApi(electronApp, 'app', 'quit');
  await quit.mockReturnValue(undefined);

  // Trigger the quit action — app.quit() is intercepted
  await page.getByRole('menuitem', { name: 'Quit' }).click();

  expect(await quit.calls()).toHaveLength(1);

  // CRITICAL — restore before fixture teardown so the actual close works
  await restoreAllElectronMocks(electronApp);
});
```

> If you don't restore `app.quit`, the worker fixture's `await electronApp.close()` may hang or error.

## Pattern: per-mock cleanup vs `restoreAllElectronMocks`

```ts
test('per-mock', async ({ electronApp }) => {
  const dialog = await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');
  // ...
  await dialog.restore();  // restore just this one
});

test('restore-all', async ({ electronApp }) => {
  await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');
  await mockElectronApi(electronApp, 'dialog', 'showSaveDialog');
  await mockElectronApi(electronApp, 'shell', 'openExternal');
  // ...
  await restoreAllElectronMocks(electronApp);  // sweep them all
});
```

The `afterEach` hook with `restoreAllElectronMocks` is the safest default — it can't leak.

## Pattern: assert sequence of calls

```ts
test('two-step flow', async ({ page, electronApp }) => {
  const ext = await mockElectronApi(electronApp, 'shell', 'openExternal');
  await ext.mockResolvedValue(undefined);

  await page.getByRole('link', { name: 'Docs' }).click();
  await page.getByRole('link', { name: 'Support' }).click();

  const calls = await ext.calls();
  expect(calls).toHaveLength(2);
  expect(calls[0][0]).toBe('https://docs.clearpath.ai');
  expect(calls[1][0]).toBe('https://support.clearpath.ai');

  await restoreAllElectronMocks(electronApp);
});
```

## Pattern: clear calls without restoring

Useful when you want to assert "exactly 1 call after the click" without counting any earlier setup-phase calls:

```ts
test('precise call count', async ({ page, electronApp }) => {
  const dialog = await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');
  await dialog.mockResolvedValue({ canceled: true, filePaths: [] });

  // ... some setup that may invoke dialog ...
  await dialog.mockClear();   // wipe calls but keep the patch active

  await page.getByRole('button', { name: 'Open' }).click();
  expect(await dialog.calls()).toHaveLength(1);

  await restoreAllElectronMocks(electronApp);
});
```

## Pattern: dynamic implementation

For more complex stubs (return different values based on arguments), use `mockImplementation` with a stringified arrow function:

```ts
test('different responses per filter', async ({ page, electronApp }) => {
  const dialog = await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');
  await dialog.mockImplementation(`
    async (window, options) => {
      const ext = options.filters?.[0]?.extensions?.[0];
      if (ext === 'json') return { canceled: false, filePaths: ['/tmp/x.json'] };
      if (ext === 'yaml') return { canceled: false, filePaths: ['/tmp/x.yaml'] };
      return { canceled: true, filePaths: [] };
    }
  `);

  // ... test ...
  await restoreAllElectronMocks(electronApp);
});
```

⚠️ The implementation is stringified and `eval`-ed in the main process — so it cannot close over Node-side variables. All inputs must come through arguments.

## Pattern: replace an `ipcMain` handler

For tests where you want to short-circuit a custom IPC handler (not just an Electron API):

```ts
test('mock cli:list-sessions', async ({ electronApp, page }) => {
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('cli:list-sessions');
    ipcMain.handle('cli:list-sessions', async () => [
      { id: 'fake-1', name: 'Mocked session 1' },
      { id: 'fake-2', name: 'Mocked session 2' },
    ]);
  });

  await page.getByRole('link', { name: 'Sessions' }).click();
  await expect(page.getByText('Mocked session 1')).toBeVisible();
  await expect(page.getByText('Mocked session 2')).toBeVisible();

  // Restore by re-importing the real handler module — or scope to a single test
  // and use afterEach to restart the worker if needed.
});
```

> Replacing `ipcMain.handle` is sticky — there's no built-in restore. Either use `test.describe.configure({ mode: 'serial' })` and let the worker continue with the mock, or capture the original handler before replacing.

## Common pitfalls

1. **Mock leaks** — forgetting `restoreAllElectronMocks` means the next test in the worker fires the stub. Use `afterEach`.
2. **Triggering before mocking** — `mockElectronApi` MUST be called before the UI fires the API. Move the call to the top of the test or to `beforeEach`.
3. **Stale references** — `dialog.calls()` returns a snapshot. Calling `.calls()` again later returns the new state, but earlier returned arrays don't update.
4. **Async impl in `mockImplementation`** — make sure the stringified function is async if the original is async. Otherwise the renderer's `await electronAPI.invoke(...)` resolves immediately with `undefined`.
5. **`globalThis` collision** — the helper stores under `__electronMocks`. Don't pick that name for app code globals.
