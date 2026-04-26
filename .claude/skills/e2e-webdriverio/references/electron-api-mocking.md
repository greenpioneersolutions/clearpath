# Electron API Mocking — browser.electron.mock()

A reference for mocking Electron APIs in WebdriverIO e2e tests using `wdio-electron-service`. Mocking lets you control and assert on native Electron behaviors — file dialogs, shell actions, app events — without triggering real OS dialogs or side effects.

---

## Overview

`wdio-electron-service` provides a Vitest-compatible mocking layer for Electron's built-in modules. You can mock individual functions or entire namespaces (e.g., `dialog`, `shell`, `app`, `autoUpdater`) and then assert on how many times they were called, with what arguments, and what they returned.

**Mocking requires the same preload setup as `browser.electron.execute()`** — see `electron-api-access.md` for preload configuration.

---

## Creating Mocks

### Mock a single function

```typescript
const dialogMock = await browser.electron.mock('dialog', 'showOpenDialog')
```

Returns a mock function object. The real `dialog.showOpenDialog` is now replaced by the mock for the duration of the test (or until restored).

### Mock all functions in a namespace

```typescript
const appMock = await browser.electron.mockAll('app')
```

Returns an object where every function in the `app` namespace is mocked. Useful when you want to prevent any real `app` behavior during a test.

### Common APIs to mock

| API | Function | Why |
|---|---|---|
| `dialog` | `showOpenDialog` | Prevent real OS file picker from blocking |
| `dialog` | `showSaveDialog` | Prevent real OS save dialog |
| `dialog` | `showMessageBox` | Prevent real alert dialogs |
| `shell` | `openExternal` | Prevent browser/URL opens during tests |
| `app` | `quit` | Prevent app from closing mid-test |
| `app` | `relaunch` | Prevent unexpected restarts |
| `autoUpdater` | `checkForUpdates` | Prevent network calls to update server |

---

## Configuring Mock Return Values

The mock object supports a Vitest-compatible API for controlling what it returns.

### Synchronous returns

```typescript
const mock = await browser.electron.mock('dialog', 'showOpenDialog')

// Always return this value
mock.mockReturnValue({ canceled: false, filePaths: ['/tmp/test.txt'] })

// Return this value only for the next call, then revert to undefined
mock.mockReturnValueOnce({ canceled: true, filePaths: [] })
```

### Async / Promise returns

```typescript
const mock = await browser.electron.mock('dialog', 'showOpenDialog')

// Resolve with this value
mock.mockResolvedValue({ canceled: false, filePaths: ['/chosen/file.txt'] })

// Resolve with this value only for the next call
mock.mockResolvedValueOnce({ canceled: false, filePaths: ['/first-call.txt'] })

// Reject with an error
mock.mockRejectedValue(new Error('dialog failed'))

// Reject only for the next call
mock.mockRejectedValueOnce(new Error('one-time failure'))
```

### Custom implementation

```typescript
const mock = await browser.electron.mock('dialog', 'showOpenDialog')

// Replace with a custom function
mock.mockImplementation(async (options) => {
  return { canceled: false, filePaths: ['/mocked/' + options.title] }
})

// Custom implementation for the next call only
mock.mockImplementationOnce(async () => ({ canceled: true, filePaths: [] }))
```

---

## Inspecting Mock State

After an action that triggers the mocked API, assert on what happened:

### Call count and arguments

```typescript
// Array of argument arrays — one entry per call
console.log(mock.calls)
// e.g. [[{ title: 'Open File', filters: [...] }]]

// Shorthand for the most recent call's arguments
console.log(mock.lastCall)
// e.g. [{ title: 'Open File', filters: [...] }]

// Assert specific call
expect(mock.calls).toHaveLength(1)
expect(mock.calls[0][0]).toMatchObject({ title: 'Open File' })
```

### Return values

```typescript
// Array of { type, value } per call
console.log(mock.results)
// e.g. [{ type: 'return', value: { canceled: false, filePaths: [...] } }]
```

### Call order (across multiple mocks)

```typescript
const dialogMock = await browser.electron.mock('dialog', 'showOpenDialog')
const shellMock = await browser.electron.mock('shell', 'openExternal')

// After triggering actions:
// invocationCallOrder is a number array — lower number = called first
console.log(dialogMock.invocationCallOrder)  // e.g. [1]
console.log(shellMock.invocationCallOrder)   // e.g. [2]
```

### Check if something is a mock

```typescript
const isMock = await browser.electron.isMockFunction(dialogMock)
// true
```

---

## Mock Lifecycle — Cleanup

### Per-mock cleanup

```typescript
// Clear call history and results, but keep the mock implementation
mock.mockClear()

// Clear call history + remove implementation (mock returns undefined)
mock.mockReset()

// Restore the original Electron function (unmock)
mock.mockRestore()
```

### Global cleanup (all mocks at once)

```typescript
// Clear all mocks (optionally scoped to a namespace)
await browser.electron.clearAllMocks()
await browser.electron.clearAllMocks('dialog')  // only dialog mocks

// Reset all mocks
await browser.electron.resetAllMocks()
await browser.electron.resetAllMocks('shell')

// Restore all mocks to original Electron APIs
await browser.electron.restoreAllMocks()
await browser.electron.restoreAllMocks('app')
```

### Auto-cleanup via service config

Set these in `wdio-electron-service` options to automatically clean up mocks between every test, without needing `afterEach` hooks:

```typescript
services: [
  [
    'electron',
    {
      clearMocks: true,    // mockClear() after each test
      resetMocks: false,   // mockReset() after each test
      restoreMocks: false, // mockRestore() after each test
    },
  ],
],
```

| Option | Method called | Clears history | Clears implementation | Restores original |
|---|---|---|---|---|
| `clearMocks: true` | `mockClear()` | Yes | No | No |
| `resetMocks: true` | `mockReset()` | Yes | Yes | No |
| `restoreMocks: true` | `mockRestore()` | Yes | Yes | Yes |

Only enable one — they overlap. `clearMocks: true` is the recommended minimum for most suites. Use `restoreMocks: true` if tests need pristine Electron API behavior between runs.

---

## Complete Example

Mock `dialog.showOpenDialog`, trigger the UI action that calls it, assert the call, then restore.

```typescript
import { browser, expect } from '@wdio/globals'

describe('File Picker', () => {
  let dialogMock: Awaited<ReturnType<typeof browser.electron.mock>>

  before(async () => {
    // Create the mock before the test suite
    dialogMock = await browser.electron.mock('dialog', 'showOpenDialog')
  })

  afterEach(async () => {
    // Clear call history between tests
    dialogMock.mockClear()
  })

  after(async () => {
    // Restore the real dialog API after the suite
    dialogMock.mockRestore()
  })

  it('opens a file dialog when the button is clicked', async () => {
    // Set the mock return value
    dialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['/Users/test/project'],
    })

    // Click the button in the UI that triggers dialog.showOpenDialog
    const btn = await browser.$('button[data-testid="open-folder-btn"]')
    await btn.click()

    // Wait for any async update
    await browser.waitUntil(async () => {
      const el = await browser.$('[data-testid="selected-path"]')
      return (await el.getText()) !== ''
    })

    // Assert the mock was called once
    expect(dialogMock.calls).toHaveLength(1)

    // Assert it was called with the right options
    expect(dialogMock.calls[0][0]).toMatchObject({
      properties: ['openDirectory'],
    })

    // Assert the UI reflects the chosen path
    const pathEl = await browser.$('[data-testid="selected-path"]')
    expect(await pathEl.getText()).toBe('/Users/test/project')
  })

  it('handles canceled dialog gracefully', async () => {
    dialogMock.mockResolvedValue({ canceled: true, filePaths: [] })

    const btn = await browser.$('button[data-testid="open-folder-btn"]')
    await btn.click()

    // UI should not update
    await browser.pause(200)
    const pathEl = await browser.$('[data-testid="selected-path"]')
    expect(await pathEl.getText()).toBe('')
  })
})
```

---

## Mocking shell.openExternal

```typescript
it('does not open a real browser when clicking a link', async () => {
  const shellMock = await browser.electron.mock('shell', 'openExternal')
  shellMock.mockResolvedValue(undefined)

  const link = await browser.$('a[data-testid="docs-link"]')
  await link.click()

  expect(shellMock.calls).toHaveLength(1)
  expect(shellMock.calls[0][0]).toBe('https://docs.example.com')

  shellMock.mockRestore()
})
```

---

## Mocking app.quit

```typescript
it('calls app.quit when the quit menu item is selected', async () => {
  const quitMock = await browser.electron.mock('app', 'quit')
  quitMock.mockReturnValue(undefined)  // prevent actual quit

  // Trigger via IPC or UI action
  await browser.execute(() => {
    ;(window as any).electronAPI.send('menu:quit')
  })

  await browser.waitUntil(() => quitMock.calls.length > 0)
  expect(quitMock.calls).toHaveLength(1)

  quitMock.mockRestore()
})
```
