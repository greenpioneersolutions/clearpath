# Example: Mocking Electron Dialogs in Tests

Native Electron dialogs (`dialog.showOpenDialog`, `dialog.showSaveDialog`, `dialog.showMessageBox`) present a hard blocker for automated testing: they open OS-native windows that WebDriver cannot interact with, and they block the main process event loop until the user dismisses them. A test that triggers a real dialog will hang forever.

The solution is `browser.electron.mock()` from `wdio-electron-service`, which replaces the Electron API function with a Jest-compatible mock before your test code can trigger it.

---

## Why Mocking Is Necessary

When `dialog.showOpenDialog()` is called in the main process:
1. The OS opens a native file picker window
2. The Electron main process blocks on the dialog response
3. No further IPC messages can be processed
4. WebdriverIO's Chromedriver connection to the renderer is still alive but the main process is unresponsive
5. The test runner times out waiting for any subsequent UI update

You cannot "click" the native dialog via WebDriver — it is not part of the Electron renderer's DOM. The only correct approach is to intercept the call before it reaches the OS.

---

## Complete Example: File Import Dialog

```typescript
/// <reference types="@wdio/globals/types" />
/// <reference types="mocha" />

import {
  waitForAppReady,
  navigateSidebarTo,
  navigateToConfigureTab,
  clickButton,
  getRootHTML,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

describe('File Import Dialog', () => {
  let dialogMock: Awaited<ReturnType<typeof browser.electron.mock>>

  before(async () => {
    await waitForAppReady()
    await navigateSidebarTo('Configure')
    await navigateToConfigureTab('settings')

    // Install the mock BEFORE any code that could trigger the dialog.
    // browser.electron.mock() intercepts at the Electron API level in the
    // main process — the real dialog.showOpenDialog is never called.
    dialogMock = await browser.electron.mock('dialog', 'showOpenDialog')

    // Configure what the mock returns when the UI triggers it.
    // The shape must match what dialog.showOpenDialog resolves to in Electron.
    await dialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['/Users/test/my-config.json'],
    })
  })

  after(async () => {
    // Always restore mocks — otherwise the mock persists into subsequent
    // spec files because wdio-electron-service shares the main process
    // across the test run (maxInstances: 1).
    await browser.electron.restoreAllMocks()
  })

  it('processes the selected file path', async () => {
    // This button click triggers dialog.showOpenDialog in the main process.
    // Our mock intercepts it, returns the fake path, and the main process
    // handler passes the path back to the renderer via IPC — all synchronously
    // from the test's perspective.
    await clickButton('Import Config')
    await browser.pause(500) // give the IPC response time to reach the renderer

    // Verify the mock was called exactly once
    expect(dialogMock.mock.calls).toHaveLength(1)

    // Verify the UI processed the returned file path
    // (adjust selector to match actual rendered output in your component)
    const html = await getRootHTML()
    expect(html).toContain('my-config.json')
  })

  it('handles a cancelled dialog gracefully', async () => {
    // Clear the recorded calls from the previous test
    await dialogMock.mockClear()

    // Reconfigure the mock to simulate the user pressing Cancel
    await dialogMock.mockResolvedValue({ canceled: true, filePaths: [] })

    await clickButton('Import Config')
    await browser.pause(300)

    // Dialog was still intercepted (called once)
    expect(dialogMock.mock.calls).toHaveLength(1)

    // No error state should appear — the component should handle cancellation silently
    const errorEl = await $('.error-message')
    expect(await errorEl.isExisting()).toBe(false)

    // The previously displayed filename should remain unchanged
    const html = await getRootHTML()
    expect(html).toContain('my-config.json') // still shows the file from the first test
  })

  it('passes the correct dialog options', async () => {
    await dialogMock.mockClear()
    await dialogMock.mockResolvedValue({ canceled: true, filePaths: [] })

    await clickButton('Import Config')
    await browser.pause(300)

    // Inspect what arguments the UI passed to showOpenDialog
    const [_event, options] = dialogMock.mock.calls[0] as [unknown, Electron.OpenDialogOptions]
    expect(options.properties).toContain('openFile')
    expect(options.filters).toEqual(
      expect.arrayContaining([{ name: 'JSON', extensions: ['json'] }])
    )
  })
})
```

---

## The `browser.electron.mock()` API

`browser.electron.mock(module, method)` returns a mock object that behaves like a Jest mock function, with these methods:

| Method | Description |
|--------|-------------|
| `mockResolvedValue(value)` | Mock resolves with `value` on every call |
| `mockResolvedValueOnce(value)` | Resolves with `value` only on the next call |
| `mockReturnValue(value)` | Synchronous return (use for non-async Electron APIs) |
| `mockImplementation(fn)` | Replace with a custom function |
| `mockClear()` | Clear recorded calls (keeps the mock active) |
| `mockReset()` | Clear calls AND reset the implementation |
| `mockRestore()` | Restore the original Electron function |
| `.mock.calls` | Array of argument arrays for each call |
| `.mock.results` | Array of return values / thrown errors |

**`mockClear()` vs `mockReset()` vs `mockRestore()`:**
- `mockClear()` — wipe `mock.calls` and `mock.results`, keep the mock behavior. Use between `it()` blocks in the same describe when you want to check call counts per test.
- `mockReset()` — wipe calls AND the configured mock return value. The next call returns `undefined`. Use when you need to completely reconfigure the mock for a new scenario.
- `mockRestore()` — remove the mock entirely and reinstate the real Electron function. Use in `after()`. Prefer `browser.electron.restoreAllMocks()` in `after()` to catch any mocks you may have forgotten.

---

## Mocking `dialog.showSaveDialog`

```typescript
let saveMock: Awaited<ReturnType<typeof browser.electron.mock>>

before(async () => {
  saveMock = await browser.electron.mock('dialog', 'showSaveDialog')
  await saveMock.mockResolvedValue({
    canceled: false,
    filePath: '/Users/test/exported-config.json',
  })
})

after(async () => {
  await browser.electron.restoreAllMocks()
})

it('exports config to the chosen path', async () => {
  await clickButton('Export Config')
  await browser.pause(500)

  expect(saveMock.mock.calls).toHaveLength(1)

  // Verify the UI shows a success message
  const html = await getRootHTML()
  expect(html).toContain('exported-config.json')
})
```

---

## Mocking `dialog.showMessageBox`

Message boxes are used for confirmations ("Are you sure you want to delete?"). The return value is `{ response: number }` where `response` is the index of the clicked button.

```typescript
let confirmMock: Awaited<ReturnType<typeof browser.electron.mock>>

before(async () => {
  confirmMock = await browser.electron.mock('dialog', 'showMessageBox')
})

after(async () => {
  await browser.electron.restoreAllMocks()
})

it('deletes workspace when user confirms', async () => {
  // Simulate clicking the first button (index 0 = "Delete")
  await confirmMock.mockResolvedValue({ response: 0 })

  await clickButton('Delete Workspace')
  await browser.pause(500)

  // Workspace should be gone from the list
  const html = await getRootHTML()
  expect(html).not.toContain('My Test Workspace')
})

it('does not delete when user cancels', async () => {
  // Simulate clicking the second button (index 1 = "Cancel")
  await confirmMock.mockResolvedValue({ response: 1 })

  await clickButton('Delete Workspace')
  await browser.pause(300)

  // Workspace should still be present
  const html = await getRootHTML()
  expect(html).toContain('My Test Workspace')
})
```

---

## Mocking `shell.openExternal`

`shell.openExternal()` opens URLs in the system browser. In tests you never want the browser to actually open — mock it and verify the correct URL was passed.

```typescript
let shellMock: Awaited<ReturnType<typeof browser.electron.mock>>

before(async () => {
  shellMock = await browser.electron.mock('shell', 'openExternal')
  // openExternal returns a Promise<void> — mockResolvedValue(undefined) simulates success
  await shellMock.mockResolvedValue(undefined)
})

after(async () => {
  await browser.electron.restoreAllMocks()
})

it('opens the docs link in the system browser', async () => {
  await clickButton('Open Docs')
  await browser.pause(200)

  expect(shellMock.mock.calls).toHaveLength(1)
  const [url] = shellMock.mock.calls[0] as [string]
  expect(url).toContain('docs.clearpath.ai')
})
```

---

## Mocking `app.quit`

Never let a test actually quit the Electron app — it would tear down the entire test session. Mock `app.quit` for tests that cover "Exit" / "Quit" buttons.

```typescript
let quitMock: Awaited<ReturnType<typeof browser.electron.mock>>

before(async () => {
  quitMock = await browser.electron.mock('app', 'quit')
  // app.quit() is synchronous — use mockReturnValue(undefined) not mockResolvedValue
  await quitMock.mockReturnValue(undefined)
})

after(async () => {
  await browser.electron.restoreAllMocks()
})

it('triggers app.quit when Exit is clicked', async () => {
  await clickButton('Exit Application')
  await browser.pause(200)

  expect(quitMock.mock.calls).toHaveLength(1)
  // App is still running — the real quit was intercepted
  const root = await $('#root')
  expect(await root.isExisting()).toBe(true)
})
```

---

## Gotchas

**Mock must be installed before the trigger.** `browser.electron.mock()` is async — `await` it before clicking any button that could trigger the dialog. If the button is clicked first and the mock isn't ready, the real dialog opens and the test hangs.

**Always restore in `after()`.** `wdio-electron-service` runs all spec files against the same Electron process (maxInstances: 1). A mock installed in spec A leaks into spec B if not restored. `browser.electron.restoreAllMocks()` is the safest teardown — it restores everything regardless of what was mocked.

**`mock.calls` includes the `event` argument.** Electron IPC handlers receive `(event, ...args)`. When inspecting `mock.calls[0]`, the first element is the IPC event object, not the first argument you expect:

```typescript
// The actual call signature: showOpenDialog(event, options)
const [_event, options] = dialogMock.mock.calls[0] as [unknown, Electron.OpenDialogOptions]
```

**Mocks work across the IPC bridge.** `browser.electron.mock()` operates in the main process. When the renderer calls `window.electronAPI.invoke('some-channel')` and the main process handler calls `dialog.showOpenDialog()`, the mock intercepts it correctly — you do not need to do anything special to make the IPC path work.

**Cannot mock renderer-only code.** `browser.electron.mock()` only mocks Electron main-process module methods. If your component directly imports a renderer-only module and calls something on it, you need to use `browser.execute()` with a different approach (e.g., inject a stub into `window`).
