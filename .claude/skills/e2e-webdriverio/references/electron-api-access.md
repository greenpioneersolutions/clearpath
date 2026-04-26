# Electron API Access — browser.electron.execute()

A reference for accessing Electron main process APIs and renderer process context from WebdriverIO e2e tests using `wdio-electron-service`.

---

## Overview: Two Execution Contexts

| Method | Runs in | Use for |
|---|---|---|
| `browser.electron.execute(fn, ...args)` | **Electron main process** | `app`, `dialog`, `shell`, `BrowserWindow`, `ipcMain`, etc. |
| `browser.execute(fn, ...args)` | **Renderer process** (the web page) | DOM, `window`, `window.electronAPI`, any preload-exposed API |

These are completely separate JavaScript contexts. Code passed to `browser.electron.execute` cannot access `window` or the DOM, and code passed to `browser.execute` cannot access Node.js APIs.

---

## Required Preload Setup

`browser.electron.execute()` works by communicating through Electron's IPC mechanism. This requires two conditional imports in your app code — **only active when `process.env.TEST === 'true'`**.

### Main Process (`src/main/index.ts`)

```typescript
// At the bottom of your main process entry, after app setup:
if (process.env.TEST === 'true') {
  import('wdio-electron-service/main')
}
```

### Preload Script (`src/preload/index.ts`)

```typescript
// At the bottom of your preload script:
if (process.env.TEST === 'true') {
  import('wdio-electron-service/preload')
}
```

Both files must import their respective shims. Missing either one causes `browser.electron` to be undefined at test time.

### Non-Bundled Preloads

If your preload is not bundled (loaded directly as a plain CommonJS file), the dynamic import shim may not resolve correctly. Disable the sandbox on the BrowserWindow instead:

```typescript
new BrowserWindow({
  webPreferences: {
    sandbox: false,
    preload: path.join(__dirname, 'preload.js'),
  },
})
```

Bundled preloads (e.g., via electron-vite) handle module resolution automatically and do not need this workaround.

---

## Setting TEST=true

The `process.env.TEST` flag must be `'true'` when Electron launches. Set it in the wdio config's `onPrepare` hook:

```typescript
// wdio.conf.ts
export const config = {
  // ...
  onPrepare() {
    process.env.TEST = 'true'
  },
}
```

Alternatively, set it in the capability via `appArgs` or an environment variable map if your service version supports it. The `onPrepare` hook is the most portable approach.

**Security note:** Never ship a production build with `TEST=true` baked in. The conditional import pattern (`if (process.env.TEST === 'true')`) ensures the wdio shims are never included in production bundles.

---

## browser.electron.execute() Syntax

```typescript
await browser.electron.execute(
  (electron, arg1, arg2, ...) => {
    // 'electron' is the Electron module — use it to access any Electron API
    return electron.app.getName()
  },
  'arg1value',  // serialized and passed as arg1
  'arg2value',  // serialized and passed as arg2
)
```

**Rules:**
- The first parameter of the callback is always the Electron module object (not configurable).
- Additional arguments are serialized via IPC (must be JSON-serializable — no functions, no class instances).
- The return value is also serialized — return plain objects, strings, numbers, or arrays.
- The function body must be self-contained; it cannot close over variables from the test file's scope (use extra args instead).

---

## Accessing Electron APIs — Examples

### app

```typescript
// Get app name
const name = await browser.electron.execute((electron) => electron.app.getName())

// Get app version
const version = await browser.electron.execute((electron) => electron.app.getVersion())

// Get a user data path
const userData = await browser.electron.execute(
  (electron, pathName) => electron.app.getPath(pathName),
  'userData'
)

// Check if app is packaged
const isPackaged = await browser.electron.execute((electron) => electron.app.isPackaged)
```

### BrowserWindow

```typescript
// Get the title of the focused window
const title = await browser.electron.execute((electron) => {
  const win = electron.BrowserWindow.getFocusedWindow()
  return win ? win.getTitle() : null
})

// Get all window bounds
const bounds = await browser.electron.execute((electron) => {
  const [win] = electron.BrowserWindow.getAllWindows()
  return win ? win.getBounds() : null
})
```

### ipcMain (trigger handlers from test)

```typescript
// Emit an ipcMain event to exercise a handler
await browser.electron.execute((electron, channel, payload) => {
  const [win] = electron.BrowserWindow.getAllWindows()
  if (win) win.webContents.send(channel, payload)
}, 'my-channel', { key: 'value' })
```

---

## Renderer Access via browser.execute()

Use `browser.execute()` to interact with the renderer — DOM, React state, or anything exposed via the preload's `contextBridge`.

### Direct DOM access

```typescript
const text = await browser.execute(() => {
  return document.querySelector('h1')?.textContent ?? ''
})
```

### IPC via contextBridge-exposed API

When your preload exposes `window.electronAPI`:

```typescript
// Invoke an IPC handler and get its return value
const settings = await browser.execute(async (channel) => {
  return (window as any).electronAPI.invoke(channel)
}, 'settings:get')

// Send a one-way IPC message
await browser.execute((channel, payload) => {
  ;(window as any).electronAPI.send(channel, payload)
}, 'settings:set', { theme: 'dark' })
```

The `browser.execute` callback runs in the renderer, so `window`, `document`, and anything on `window.electronAPI` are all accessible.

---

## Common Pitfalls

### browser.electron is undefined

**Symptom:** `TypeError: Cannot read properties of undefined (reading 'execute')`

**Cause:** The preload setup is missing or the conditional import was not hit.

**Fix checklist:**
1. Confirm `wdio-electron-service/main` is imported in your main process when `TEST === 'true'`
2. Confirm `wdio-electron-service/preload` is imported in your preload when `TEST === 'true'`
3. Confirm `process.env.TEST = 'true'` is set in `onPrepare` before Electron launches
4. Rebuild the app (`npm run build`) after adding the conditional imports

### Arguments must be serializable

```typescript
// BAD — function is not serializable, will throw
await browser.electron.execute((electron, fn) => fn(), () => 'hello')

// GOOD — pass the data, compute inside
await browser.electron.execute((electron, value) => value.toUpperCase(), 'hello')
```

### Cannot close over test-scope variables

```typescript
const myPath = '/some/path'

// BAD — myPath is not in scope inside browser.electron.execute
await browser.electron.execute((electron) => {
  return electron.app.getPath(myPath)  // ReferenceError
})

// GOOD — pass as argument
await browser.electron.execute(
  (electron, p) => electron.app.getPath(p),
  myPath
)
```
