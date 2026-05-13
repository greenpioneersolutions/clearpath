# Electron API Mocking

Playwright has **no built-in equivalent to `browser.electron.mock()`**. We monkey-patch via `electronApp.evaluate()` and provide a small helper module that mirrors the Vitest-style mock API.

## The pattern

To stub a native API (e.g. `dialog.showOpenDialog`):

1. Replace the function on the main-process module before triggering it.
2. Have the replacement record its calls into a global array.
3. Read calls back via another `electronApp.evaluate()`.
4. Restore the original function in test teardown.

```ts
// monkey-patch
await electronApp.evaluate(({ dialog }) => {
  (globalThis as any).__origShowOpenDialog = dialog.showOpenDialog;
  (globalThis as any).__showOpenDialogCalls = [];
  dialog.showOpenDialog = async (...args: any[]) => {
    (globalThis as any).__showOpenDialogCalls.push(args);
    return (globalThis as any).__showOpenDialogReturn ?? { canceled: true, filePaths: [] };
  };
});

// configure return value
await electronApp.evaluate((value) => {
  (globalThis as any).__showOpenDialogReturn = value;
}, { canceled: false, filePaths: ['/tmp/fixture.json'] });

// trigger from UI
await page.getByRole('button', { name: 'Import' }).click();

// inspect calls
const calls = await electronApp.evaluate(() => (globalThis as any).__showOpenDialogCalls);
expect(calls).toHaveLength(1);
expect(calls[0]).toMatchObject([{ properties: expect.arrayContaining(['openFile']) }]);

// restore
await electronApp.evaluate(({ dialog }) => {
  dialog.showOpenDialog = (globalThis as any).__origShowOpenDialog;
  delete (globalThis as any).__showOpenDialogCalls;
  delete (globalThis as any).__showOpenDialogReturn;
});
```

## Reusable helper — `e2e/helpers/electronMock.ts`

```ts
import type { ElectronApplication } from '@playwright/test';

type Module = 'dialog' | 'shell' | 'app' | 'Menu' | 'BrowserWindow' | 'session' | 'safeStorage';

export interface ElectronMock {
  /** Calls recorded since last clear. Each entry is the args array. */
  calls(): Promise<unknown[][]>;
  /** Most recent call args, or undefined if never called. */
  lastCall(): Promise<unknown[] | undefined>;
  /** Set the next return value. */
  mockReturnValue(value: unknown): Promise<void>;
  /** Set return value for promise-returning APIs. */
  mockResolvedValue(value: unknown): Promise<void>;
  /** Replace the implementation (must be a serializable arrow function string). */
  mockImplementation(fnSource: string): Promise<void>;
  /** Clear recorded calls without restoring the original. */
  mockClear(): Promise<void>;
  /** Restore the original function. */
  restore(): Promise<void>;
}

export async function mockElectronApi(
  app: ElectronApplication,
  moduleName: Module,
  methodName: string,
): Promise<ElectronMock> {
  const key = `${moduleName}.${methodName}`;

  await app.evaluate(([mod, method, k], electronModule: any) => {
    const target = electronModule[mod];
    if (!target) throw new Error(`No Electron module: ${mod}`);
    const original = target[method];
    (globalThis as any).__electronMocks ??= {};
    (globalThis as any).__electronMocks[k] = {
      original,
      calls: [],
      returnValue: undefined,
      resolvedValue: undefined,
      impl: undefined,
    };
    target[method] = async function patched(...args: unknown[]) {
      const reg = (globalThis as any).__electronMocks[k];
      reg.calls.push(args);
      if (reg.impl) return (0, eval)(`(${reg.impl})`).apply(this, args);
      if (reg.resolvedValue !== undefined) return reg.resolvedValue;
      if (reg.returnValue !== undefined) return reg.returnValue;
      return undefined;
    };
  }, [moduleName, methodName, key] as const);

  return {
    async calls() {
      return app.evaluate((k) => (globalThis as any).__electronMocks?.[k]?.calls ?? [], key);
    },
    async lastCall() {
      const all = await this.calls();
      return all[all.length - 1];
    },
    async mockReturnValue(value) {
      await app.evaluate(([k, v]) => {
        const reg = (globalThis as any).__electronMocks?.[k];
        if (reg) reg.returnValue = v;
      }, [key, value] as const);
    },
    async mockResolvedValue(value) {
      await app.evaluate(([k, v]) => {
        const reg = (globalThis as any).__electronMocks?.[k];
        if (reg) reg.resolvedValue = v;
      }, [key, value] as const);
    },
    async mockImplementation(fnSource) {
      await app.evaluate(([k, src]) => {
        const reg = (globalThis as any).__electronMocks?.[k];
        if (reg) reg.impl = src;
      }, [key, fnSource] as const);
    },
    async mockClear() {
      await app.evaluate((k) => {
        const reg = (globalThis as any).__electronMocks?.[k];
        if (reg) reg.calls = [];
      }, key);
    },
    async restore() {
      await app.evaluate(([mod, method, k], electronModule: any) => {
        const reg = (globalThis as any).__electronMocks?.[k];
        if (reg) {
          electronModule[mod][method] = reg.original;
          delete (globalThis as any).__electronMocks[k];
        }
      }, [moduleName, methodName, key] as const);
    },
  };
}

/** Restore every mock — call from afterEach. */
export async function restoreAllElectronMocks(app: ElectronApplication): Promise<void> {
  await app.evaluate((electronModule: any) => {
    const reg = (globalThis as any).__electronMocks ?? {};
    for (const k of Object.keys(reg)) {
      const [mod, method] = k.split('.');
      const orig = reg[k]?.original;
      if (orig && electronModule[mod]) electronModule[mod][method] = orig;
    }
    delete (globalThis as any).__electronMocks;
  });
}
```

## Usage

```ts
import { test, expect } from './fixtures';
import { mockElectronApi, restoreAllElectronMocks } from './helpers/electronMock';

test.describe('Open dialog', () => {
  test.afterEach(async ({ electronApp }) => {
    await restoreAllElectronMocks(electronApp);
  });

  test('handles file selection', async ({ page, electronApp }) => {
    const dialog = await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');
    await dialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/fixture.json'] });

    await page.getByRole('button', { name: 'Import config' }).click();

    expect(await dialog.calls()).toHaveLength(1);
    const lastCall = await dialog.lastCall();
    expect(lastCall?.[1]).toMatchObject({ properties: expect.arrayContaining(['openFile']) });

    await expect(page.getByTestId('toast')).toContainText('Imported');
  });

  test('handles cancel', async ({ page, electronApp }) => {
    const dialog = await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');
    await dialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await page.getByRole('button', { name: 'Import config' }).click();
    await expect(page.getByTestId('toast')).toBeHidden();
  });
});
```

## Common stubs

### `dialog.showOpenDialog`
```ts
const m = await mockElectronApi(electronApp, 'dialog', 'showOpenDialog');
await m.mockResolvedValue({ canceled: false, filePaths: ['/tmp/x.json'] });
```

### `dialog.showSaveDialog`
```ts
const m = await mockElectronApi(electronApp, 'dialog', 'showSaveDialog');
await m.mockResolvedValue({ canceled: false, filePath: '/tmp/out.json' });
```

### `dialog.showMessageBox`
```ts
const m = await mockElectronApi(electronApp, 'dialog', 'showMessageBox');
await m.mockResolvedValue({ response: 0 }); // 0 = first button (Cancel/OK)
```

### `shell.openExternal`
```ts
const m = await mockElectronApi(electronApp, 'shell', 'openExternal');
await m.mockResolvedValue(undefined);
// trigger UI...
const calls = await m.calls();
expect(calls[0][0]).toBe('https://example.com');
```

### `app.quit`
**Be very careful** — if you don't restore this, the fixture's `electronApp.close()` may not work cleanly. Always pair with `afterEach` restore:

```ts
const m = await mockElectronApi(electronApp, 'app', 'quit');
await m.mockReturnValue(undefined);
await page.getByRole('menuitem', { name: 'Quit' }).click();
expect(await m.calls()).toHaveLength(1);
// restoreAllElectronMocks runs in afterEach — fixture cleanup will then quit normally
```

## Caveats

1. **Mocks leak across tests** if not restored. The `afterEach` cleanup is critical — losing the original `dialog.showOpenDialog` reference means subsequent tests in the same worker fire the stub instead of the real API.
2. **`mockImplementation` ships source code as a string.** This is necessary because functions are not serializable across the IPC boundary. Keep implementations small and self-contained — no closures over Node-side variables.
3. **Custom IPC handlers** registered via `ipcMain.handle('ch', fn)` can be replaced too:
   ```ts
   await electronApp.evaluate(({ ipcMain }) => {
     ipcMain.removeHandler('cli:list-sessions');
     ipcMain.handle('cli:list-sessions', async () => [/* fixture */]);
   });
   ```
   Restore them in `afterEach` by re-importing the real handler module — or scope to a single test that runs in isolation (`test.describe.configure({ mode: 'serial' })`).
4. **Don't mock UI primitives** (`BrowserWindow.show`, etc.) — let Playwright drive the real UI; mock only the boundary APIs (dialog/shell/external services).

## Alternative: HTTP-level mocking via `context.route`

For services that hit HTTP **from the renderer** via `fetch`/`XMLHttpRequest`, `context.route` is simpler than monkey-patching:

```ts
const ctx = electronApp.context();
await ctx.route('https://api.github.com/**', async (route) => {
  await route.fulfill({ json: { items: [] } });
});
```

### Caveats for Electron (important)

`context.route` works for renderer-originated HTTP. **It does NOT reliably intercept:**

- **Main-process `net.fetch` / `https.get` / `axios` running in main** — these use Node's networking stack, not Chromium's. To mock those, monkey-patch the main-process module (e.g. replace `https.request`, or stub the consumer module via `electronApp.evaluate`).
- **Privileged origins** — `file://` requests for app resources, `chrome-extension://` URLs, and some service-worker fetches can bypass `context.route`.
- **Native modules** that bypass Chromium entirely (e.g. an Octokit instance running in main).

For renderer fetches against `https://api.github.com/**` etc. — `context.route` is correct. For **CoPilot Commander main-process HTTP** (Copilot CLI auth probes, MCP catalog HTTP fetches), prefer the monkey-patch helper or stub the IPC handler that wraps the network call.

### File input vs native dialog

| User-facing flow | What to use |
|------------------|-------------|
| HTML `<input type="file">` in the renderer | `await page.locator('input[type=file]').setInputFiles(path)` — Playwright has first-class support; don't mock |
| `electron.dialog.showOpenDialog()` from main process | Mock via `mockElectronApi(electronApp, 'dialog', 'showOpenDialog')` — see worked example |
| Drag-and-drop file drop zone | Use `page.dispatchEvent('drop', {...})` with synthetic DataTransfer |

Don't confuse the two — many UIs use a hidden `<input type="file">` styled as a button, in which case `setInputFiles` is the right tool, NOT `dialog.showOpenDialog` mocking.
