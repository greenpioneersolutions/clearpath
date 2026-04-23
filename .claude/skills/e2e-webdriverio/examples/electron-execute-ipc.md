# Example: Accessing Electron APIs and IPC from Tests

WebdriverIO for Electron provides two distinct ways to cross the renderer/main boundary from a test. Choosing the wrong one wastes time debugging. This document explains both, when to use each, and shows real examples from this project.

---

## The Two Patterns at a Glance

| Method | Runs in | Access to | Use when |
|--------|---------|-----------|----------|
| `browser.electron.execute()` | Main process | Electron APIs: `app`, `dialog`, `shell`, `BrowserWindow`, `ipcMain` | You need Electron-native capabilities |
| `browser.execute()` + `window.electronAPI` | Renderer process | IPC handlers exposed via contextBridge | You want to call the same IPC the UI calls |
| `browser.execute()` + `document.*` | Renderer process | DOM, React state, `window.*` | You need to read/write renderer-side state |

---

## Pattern A: `browser.electron.execute()` — Access Electron APIs

This runs a function in the Electron **main process**. The first argument is always the `electron` module object; additional arguments are serialized from the renderer context.

```typescript
// Get the app name
const appName = await browser.electron.execute(
  (electron) => electron.app.getName()
)
expect(appName).toBe('clear-path')

// Get user data path (passes a string argument from test context)
const userDataPath = await browser.electron.execute(
  (electron, pathName) => electron.app.getPath(pathName),
  'userData'
)
// → '/Users/jared/Library/Application Support/clear-path'
expect(userDataPath).toContain('clear-path')

// Check if the app is packaged (always false in e2e tests — we run unpackaged)
const isPackaged = await browser.electron.execute(
  (electron) => electron.app.isPackaged
)
expect(isPackaged).toBe(false)

// Get the Electron version
const version = await browser.electron.execute(
  (electron) => process.versions.electron
)
expect(version).toMatch(/^\d+\.\d+\.\d+$/)
```

**Preload requirement.** For `browser.electron.execute()` to work, your main process preload must conditionally load the wdio-electron-service preload script:

```typescript
// src/preload/index.ts (or wherever your preload is)
if (process.env.TEST === 'true') {
  import('wdio-electron-service/preload')
}
```

And in `wdio.conf.ts` capabilities:
```typescript
'wdio:electronServiceOptions': {
  appEntryPoint: path.join(__dirname, 'out/main/index.js'),
  // The service sets TEST=true automatically when launching for e2e
}
```

Without the preload import, `browser.electron.execute()` throws: `Error: Could not find browser-side preload for wdio-electron-service`.

**Serialization constraint.** Arguments and return values are JSON-serialized when crossing the main↔renderer boundary. Functions, class instances, and `undefined` values are lost. Return plain objects, strings, numbers, or booleans.

```typescript
// WRONG — BrowserWindow instance is not serializable
const win = await browser.electron.execute(
  (electron) => electron.BrowserWindow.getAllWindows()[0] // returns undefined
)

// RIGHT — extract the serializable property you need
const title = await browser.electron.execute(
  (electron) => electron.BrowserWindow.getAllWindows()[0]?.getTitle()
)
```

---

## Pattern B: `browser.execute()` + `window.electronAPI` — Call IPC Handlers

This runs code in the **renderer process** and calls the `invoke` function exposed by `contextBridge`. It goes through the same IPC path the UI uses, so you are testing real behavior — not a test backdoor.

```typescript
// Read settings
const settings = await browser.execute(async () => {
  return (window as any).electronAPI.invoke('settings:get')
}) as Record<string, unknown>

expect(settings.theme).toBe('dark')
```

```typescript
// Create a workspace and get its ID back
const ws = await browser.execute(async (name, desc) => {
  return (window as any).electronAPI.invoke('workspace:create', {
    name,
    description: desc,
  })
}, 'Test Workspace', 'Created for e2e test') as { id: string }

expect(ws.id).toBeTruthy()

// Use the workspace in the test...

// Clean up
await browser.execute(async (id) => {
  return (window as any).electronAPI.invoke('workspace:delete', { id })
}, ws.id)
```

```typescript
// Verify persistence: after a UI interaction read back via IPC
await clickToggle('a11y-high-contrast')
await browser.pause(300)

const accessibility = await browser.execute(async () => {
  return (window as any).electronAPI.invoke('accessibility:get')
}) as Record<string, unknown>

expect(accessibility.highContrast).toBe(true)
```

**The `invokeIPC` helper wraps this pattern:**

```typescript
// e2e/helpers/app.ts
export async function invokeIPC(channel: string, args?: unknown): Promise<unknown> {
  return browser.execute(
    (ch, a) => {
      const api = (window as unknown as {
        electronAPI: { invoke: (c: string, a?: unknown) => Promise<unknown> }
      }).electronAPI
      return api.invoke(ch, a)
    },
    channel,
    args,
  )
}
```

Use `invokeIPC` in tests instead of the raw `browser.execute` pattern — it handles the TypeScript casting and is easier to read:

```typescript
// Same operations, cleaner syntax
const settings = await invokeIPC('settings:get') as Record<string, unknown>
const ws = await invokeIPC('workspace:create', { name: 'Test WS' }) as { id: string }
await invokeIPC('workspace:delete', { id: ws.id })
await invokeIPC('accessibility:reset')
```

**Async inside `browser.execute`.** The function you pass to `browser.execute()` can be `async` — WebdriverIO awaits the returned Promise before resolving. This is necessary here because `electronAPI.invoke()` returns a Promise.

**Argument passing.** Additional arguments after the function are serialized and passed as function parameters:

```typescript
// These two are equivalent:
await browser.execute(async (id) => {
  return (window as any).electronAPI.invoke('workspace:delete', { id })
}, ws.id)

// vs using invokeIPC:
await invokeIPC('workspace:delete', { id: ws.id })
```

Do NOT close over test variables inside the `browser.execute` function — they are in a different scope (the Node.js test process, not the renderer). Always pass them as extra arguments.

```typescript
// WRONG — ws.id is in Node.js scope, not available in browser.execute
const ws = { id: 'abc-123' }
await browser.execute(async () => {
  // ws is undefined here!
  return (window as any).electronAPI.invoke('workspace:delete', { id: ws.id })
})

// RIGHT — pass as argument
await browser.execute(async (id) => {
  return (window as any).electronAPI.invoke('workspace:delete', { id })
}, ws.id)
```

---

## Pattern C: `browser.execute()` + DOM — Read/Write Renderer State

For cases where you need to interact with the DOM directly rather than through IPC:

```typescript
// Read a React-controlled input's current value
const value = await browser.execute((selector) => {
  const el = document.querySelector(selector) as HTMLInputElement | null
  return el?.value ?? ''
}, '#workspace-name-input')

// Check if an element has a specific CSS class
const isActive = await browser.execute((selector, cls) => {
  const el = document.querySelector(selector)
  return el?.classList.contains(cls) ?? false
}, '#mode-button', 'active')

// Scroll to a specific position in a scrollable container
await browser.execute(() => {
  document.querySelector('.overflow-y-auto')?.scrollTo(0, 500)
})

// Read window.location.hash (confirm navigation worked)
const hash = await browser.execute(() => window.location.hash)
expect(hash).toBe('#/work?tab=compose')
```

---

## Complete Example: Using All Three Patterns Together

Here is a test that combines all three approaches to test workspace creation end-to-end:

```typescript
describe('Workspace Creation', () => {
  let createdId: string

  before(async () => {
    await waitForAppReady()
    await navigateSidebarTo('Configure')
    await navigateToConfigureTab('workspaces')
  })

  after(async () => {
    // Clean up via IPC regardless of test outcome
    if (createdId) {
      await invokeIPC('workspace:delete', { id: createdId })
    }
  })

  it('creates a workspace via UI', async () => {
    // Pattern C: interact with the DOM
    await clickButton('New Workspace')
    await browser.pause(300)

    await setInputValue('#workspace-name', 'E2E Test Workspace')
    await clickButton('Create')
    await browser.pause(500)
  })

  it('persists the workspace in electron-store', async () => {
    // Pattern B: verify via IPC
    const result = await invokeIPC('workspace:list') as Array<{ id: string; name: string }>
    const created = result.find((ws) => ws.name === 'E2E Test Workspace')
    expect(created).toBeDefined()
    createdId = created!.id
  })

  it('app is in correct state after creation', async () => {
    // Pattern A: check Electron-level state
    const isPackaged = await browser.electron.execute(
      (electron) => electron.app.isPackaged
    )
    // Just confirming the main process is still responsive
    expect(typeof isPackaged).toBe('boolean')
  })
})
```

---

## When to Use Which

**Use `browser.electron.execute()`** when you need:
- `electron.app.getPath()`, `getName()`, `getVersion()`, `isPackaged`
- `electron.BrowserWindow` manipulation (bounds, focus, title)
- Mocking `electron.dialog`, `electron.shell` (see `electron-mock-dialog.md`)
- Reading `electron.app.getAppPath()` to build file paths in tests

**Use `browser.execute()` + `window.electronAPI`** (via `invokeIPC`) when you need:
- Test setup: create/delete workspaces, sessions, notifications
- Verification: confirm UI interactions persisted to electron-store
- Teardown: reset settings, clear cost records, restore defaults
- Any handler already registered in `src/main/ipc/` handlers

**Use `browser.execute()` + DOM** when you need:
- Read React-controlled input values (always use this, not `getValue()`)
- Write to React-controlled inputs (use `setInputValue` helper)
- Set `window.location.hash` for navigation (use `navigateToHash` helper)
- Scroll containers, check CSS classes, inspect computed styles
