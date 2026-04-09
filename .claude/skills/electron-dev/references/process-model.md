# Electron Process Model

Electron inherits Chromium's multi-process architecture. Each process is isolated; a crash in one renderer does not bring down the app.

## Main Process

- **Singleton.** One per application. Entry point of the app.
- Runs in a **full Node.js environment**. Can `require()` modules, use all Node APIs.
- **Responsibilities:** Window management (`BrowserWindow`), application lifecycle (`app`), native APIs (menus, dialogs, tray), IPC handling.
- When a `BrowserWindow` is destroyed, its renderer process terminates.
- **Blocking the main process freezes all windows** — never do CPU-heavy work here.

## Renderer Process

- **One per BrowserWindow** (and per web embed).
- Responsible for **rendering web content**: HTML, CSS, JS — standard web platform.
- **No direct access to `require` or Node.js APIs** (when properly configured with `nodeIntegration: false`).
- Should behave according to web standards. Use bundlers (webpack, Vite) for npm modules.

## Preload Scripts

- Execute in the renderer process **before** web content loads.
- Run in the **Isolated World** (separate JS context from the page).
- Have access to a **subset of Node.js APIs**: `require`, `process`, `Buffer`, plus Electron renderer modules (`contextBridge`, `ipcRenderer`, `webFrame`, `crashReporter`, `nativeImage`, `webUtils`).
- **Primary purpose:** Bridge between the privileged main process and the sandboxed renderer, via `contextBridge`.
- Attached via `webPreferences.preload` in the BrowserWindow constructor.
- **MUST be CommonJS** (`.cjs` or `.js` without `"type": "module"`) even when main uses ESM.

### Sandboxed Preload Limitations

When `sandbox: true` (default since Electron 20):
- Cannot use CommonJS `require` to split preload into multiple files — use a bundler
- Available modules: `electron` (subset), `events`, `timers`, `url`, plus `node:` prefixed ESM variants
- Polyfilled globals: `Buffer`, `process`, `clearImmediate`, `setImmediate`

## Utility Process

- Spawned from the main process via `utilityProcess.fork()`.
- Runs in a **full Node.js environment**.
- Use for: untrusted services, CPU-intensive tasks, crash-prone components.
- **Key advantage over `child_process.fork()`:** Can establish communication with renderer processes using MessagePorts.
- **Always prefer `utilityProcess.fork()` over `child_process.fork()`** in Electron.

## TypeScript Module Aliases

| Alias | Use In |
|-------|--------|
| `electron/main` | Main process modules |
| `electron/renderer` | Renderer process modules |
| `electron/common` | Modules available in both processes |

## Security Boundaries

1. **Process isolation** — renderer crashes are contained
2. **Context isolation** — preload scripts run in separate JS context from page
3. **Sandboxing** — renderer has restricted OS access
4. **IPC gating** — renderer cannot directly call main process APIs; must go through IPC
