---
name: electron-dev
description: Comprehensive Electron development guide — architecture, security, IPC patterns, window management, and full API reference. Activates when working with Electron main process, preload scripts, or renderer code.
user-invocable: false
paths: "**/main/**/*.ts, **/main/**/*.js, **/preload/**/*.ts, **/preload/**/*.js, **/electron/**/*.ts, **/electron/**/*.js, **/electron.vite.config.*, **/electron-builder.*, **/forge.config.*, **/main/index.ts, **/main/index.js, **/preload.ts, **/preload.js, **/preload/index.ts, **/preload/index.js"
allowed-tools: Read Grep Glob
---

# Electron Development Guide

Standing guidance for building Electron applications. Apply these conventions whenever writing or reviewing Electron code in the main process, preload scripts, or renderer.

---

## Architecture — Process Model

| Process | Environment | Access | Use For |
|---------|-------------|--------|---------|
| **Main** | Node.js (full) | All native APIs, file system, OS | App lifecycle, window management, IPC handlers, native features |
| **Renderer** | Chromium (sandboxed) | DOM, Web APIs only | UI rendering, user interaction |
| **Preload** | Limited Node.js subset | `contextBridge`, `ipcRenderer`, `webFrame`, `events`, `timers`, `url` | Bridge between main and renderer via `contextBridge` |
| **Utility** | Node.js (full) | File system, networking, computation | CPU-intensive work, crash-isolated tasks |

Key constraints:
- **One** main process per app — blocking it freezes all windows
- **One** renderer per BrowserWindow — each is an isolated Chromium process
- Preload scripts run in an **Isolated World** separate from the page's JS context
- Use `utilityProcess.fork()` (not `child_process.fork()`) for background work

---

## Security Rules (Non-Negotiable)

1. **`contextIsolation: true`** — never disable (default since Electron 12)
2. **`nodeIntegration: false`** — never enable for windows loading remote content
3. **`sandbox: true`** — keep enabled (default since Electron 20)
4. **Use `contextBridge.exposeInMainWorld()`** — NEVER expose raw `ipcRenderer`
5. **Define Content Security Policy** — via HTTP headers or `<meta>` tag
6. **Do NOT disable `webSecurity`** — same-origin policy protects against XSS
7. **Validate IPC senders** — check `event.senderFrame.url` in every handler
8. **Whitelist IPC channels** — preload should only forward known channels
9. **Validate URLs before `shell.openExternal()`** — check protocol is `https:`
10. **Limit navigation** — handle `will-navigate` to block unexpected URLs
11. **Limit new windows** — use `setWindowOpenHandler` to control `window.open()`
12. **Only load HTTPS content** — never load HTTP in production
13. **Use `safeStorage`** for sensitive data at rest
14. **Code-sign and notarize** for distribution
15. **Use Fuses** — `@electron/fuses` flips compile-time security toggles

### Recommended BrowserWindow Configuration

```js
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false
  }
})
```

---

## IPC Communication Patterns

| Pattern | Direction | API | Use When |
|---------|-----------|-----|----------|
| invoke/handle | Renderer → Main | `ipcRenderer.invoke` / `ipcMain.handle` | Request/response (PREFERRED) |
| send/on | Renderer → Main | `ipcRenderer.send` / `ipcMain.on` | Fire-and-forget |
| webContents.send | Main → Renderer | `win.webContents.send` | Push data to renderer |
| MessageChannel | Renderer ↔ Renderer | `MessageChannelMain` | Direct window-to-window |

**Rules:**
- Prefer `invoke`/`handle` over `send`/`on` for request/response
- NEVER use `sendSync` — it blocks the renderer
- `ipcMain.handle` allows only ONE handler per channel
- IPC uses structured clone — cannot send functions, DOM nodes, or prototyped objects
- Always wrap callbacks to strip the Electron event object before forwarding

---

## Window Management Quick Reference

- Set `show: false` and listen for `ready-to-show` to prevent white flash
- Store `BrowserWindow` and `Tray` references at module level — GC destroys them if lost
- macOS: do NOT quit on `window-all-closed`; re-create window on `activate`
- `BrowserView` is **DEPRECATED** — use `WebContentsView` with `BaseWindow`
- Pass `BrowserWindow` to `dialog.show*Dialog()` to make dialogs modal
- macOS fullscreen transitions are async — use events, not immediate checks

---

## Performance Guidelines

- **Lazy-load modules** — don't `require` everything at startup
- **Never block main process** — use `utilityProcess.fork()` for CPU-heavy work
- **Never use `sendSync`** — blocks the renderer until main responds
- **Bundle code** — use webpack, Vite, or esbuild for tree-shaking
- **Skip polyfills** — Electron bundles modern Chromium
- **Set `Menu.setApplicationMenu(null)`** before `ready` if no menu needed

---

## Common Gotchas

| Gotcha | Detail |
|--------|--------|
| Modules requiring `app.ready` | `session`, `screen`, `powerMonitor`, `net`, `Notification`, `Tray`, `globalShortcut` |
| `protocol.registerSchemesAsPrivileged()` | MUST be called **BEFORE** `app.ready` and only once |
| GC destroys Tray/BrowserWindow | Store references in module-level variables |
| `dialog.showErrorBox` | The ONLY dialog safe to call before `app.ready` |
| File filter extensions | Use `['txt']` not `['.txt']` — no dots |
| `ipcMain.handle` | Only ONE handler per channel — calling twice throws |
| `nativeTheme.themeSource` | Only affects native UI + `prefers-color-scheme` CSS |
| Preload must be CJS | Even when main uses ESM, preload must be CommonJS |
| ESM: no `__dirname` | Use `path.dirname(fileURLToPath(import.meta.url))` |
| `screen` module import | Don't destructure at top level — import after `app.ready` |
| `globalShortcut` cleanup | Always `unregisterAll()` in `will-quit` event |
| BaseWindow webContents | Must manually call `view.webContents.close()` on window close |
| `contextBridge` values | Values are copied and frozen; prototypes are dropped |
| `ipcRenderer` since v29 | Cannot be sent over contextBridge — wrap each call individually |

---

## Quick API Lookup

| Need | Module | Process |
|------|--------|---------|
| App lifecycle, paths, single instance | `app` | Main |
| Create/manage windows | `BrowserWindow` | Main |
| Multi-view window layouts | `BaseWindow` + `WebContentsView` | Main |
| IPC (main side) | `ipcMain` | Main |
| IPC (renderer side) | `ipcRenderer` (via preload) | Renderer |
| Safe renderer bridge | `contextBridge` | Preload |
| Application/context menus | `Menu`, `MenuItem` | Main |
| Native file/message dialogs | `dialog` | Main |
| Desktop notifications | `Notification` | Main |
| System tray icon | `Tray` | Main |
| Browser sessions, cookies, cache | `session`, `Cookies` | Main |
| Control web page content | `webContents` | Main |
| Custom URL protocols | `protocol` | Main |
| Dark/light mode | `nativeTheme` | Main |
| Open URLs/files externally | `shell` | Main+Renderer |
| System clipboard | `clipboard` | Main+Renderer |
| Global keyboard shortcuts | `globalShortcut` | Main |
| Power/sleep monitoring | `powerMonitor` | Main |
| Display/monitor info | `screen` | Main |
| HTTP from main process | `net` (use `net.fetch`) | Main |
| Intercept HTTP requests | `WebRequest` (via `session`) | Main |
| Encrypt data at rest | `safeStorage` | Main |
| Background computation | `utilityProcess` | Main |
| Image manipulation | `nativeImage` | Main+Renderer |
| Auto-updates | `autoUpdater` | Main |
| Screen capture | `desktopCapturer` | Main |
| Download management | `DownloadItem` (via session) | Main |
| Crash reporting | `crashReporter` | Main+Renderer |
| File path from File object | `webUtils` | Renderer |
| Prevent system sleep | `powerSaveBlocker` | Main |
| Network logging | `netLog` | Main |
| Navigation history | `NavigationHistory` (via webContents) | Main |
| Zoom, CSS injection | `webFrame` | Renderer |

---

## Reference Materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/process-model.md](references/process-model.md) | Electron architecture, 4 process types, constraints | Understanding process boundaries or TypeScript module aliases |
| [references/app-api.md](references/app-api.md) | `app` module: lifecycle events, paths, methods, properties | Working with app lifecycle, paths, single instance, login items |
| [references/browser-window-api.md](references/browser-window-api.md) | BrowserWindow: constructor, webPreferences, events, methods | Creating/configuring windows, handling window events |
| [references/base-window-webcontentsview.md](references/base-window-webcontentsview.md) | BaseWindow + WebContentsView for multi-view layouts | Building split-pane or multi-view windows |
| [references/web-contents-api.md](references/web-contents-api.md) | webContents: navigation events, methods, properties | Controlling page content, navigation, printing, DevTools |
| [references/ipc-patterns.md](references/ipc-patterns.md) | All 4 IPC patterns, MessageChannel, serialization rules | Implementing main↔renderer communication |
| [references/security-checklist.md](references/security-checklist.md) | All 20 security recommendations with rationale | Security review, configuring BrowserWindow, handling untrusted content |
| [references/context-bridge-preload.md](references/context-bridge-preload.md) | contextBridge API, preload scripts, sandboxing | Writing preload scripts or exposing APIs to renderer |
| [references/menu-dialog-api.md](references/menu-dialog-api.md) | Menu, MenuItem, dialog, keyboard accelerators | Building menus, showing dialogs, adding shortcuts |
| [references/tray-notification-nativeimage.md](references/tray-notification-nativeimage.md) | Tray, Notification, nativeImage | System tray icons, desktop notifications, image handling |
| [references/session-protocol-net.md](references/session-protocol-net.md) | session, Cookies, protocol, net, WebRequest, DownloadItem | Network requests, custom protocols, downloads, permissions |
| [references/native-theme-shell-clipboard.md](references/native-theme-shell-clipboard.md) | nativeTheme, shell, clipboard | Dark mode, opening external URLs, clipboard operations |
| [references/system-apis.md](references/system-apis.md) | globalShortcut, powerMonitor, screen, systemPreferences, safeStorage | Global shortcuts, power events, display info, encrypted storage |
| [references/utility-process-api.md](references/utility-process-api.md) | utilityProcess, desktopCapturer, crashReporter | Background processes, screen capture, crash reporting |
| [references/build-distribution.md](references/build-distribution.md) | Packaging, ASAR, fuses, code signing, native modules, auto-updates | Building, distributing, or updating the app |
| [references/performance-testing.md](references/performance-testing.md) | Performance tips, automated testing, accessibility, webFrame | Optimizing performance, writing tests, accessibility |

## Example Code

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/secure-boilerplate.md](examples/secure-boilerplate.md) | Secure app setup template | Starting a new Electron app or window |
| [examples/ipc-all-patterns.md](examples/ipc-all-patterns.md) | All 4 IPC patterns with code | Implementing any IPC communication |
| [examples/preload-bridge.md](examples/preload-bridge.md) | Comprehensive preload with whitelisting | Setting up contextBridge API |
| [examples/system-tray-app.md](examples/system-tray-app.md) | Tray application | Adding system tray functionality |
| [examples/file-dialogs.md](examples/file-dialogs.md) | File/save/message dialogs | Showing native dialogs |
| [examples/dark-mode.md](examples/dark-mode.md) | Dark mode with nativeTheme | Adding dark/light mode support |
| [examples/auto-update.md](examples/auto-update.md) | Auto-update with electron-updater | Adding auto-update functionality |
| [examples/utility-process.md](examples/utility-process.md) | Background computation | Offloading CPU-intensive work |
| [examples/multi-window.md](examples/multi-window.md) | Multi-window management | Managing multiple windows |
| [examples/session-permissions.md](examples/session-permissions.md) | Session & permission management | Handling permissions and downloads |
| [examples/safe-storage.md](examples/safe-storage.md) | Encrypted credential storage | Storing sensitive data securely |
| [examples/app-menu.md](examples/app-menu.md) | Application menu with shortcuts | Building application menus |
| [examples/deep-linking.md](examples/deep-linking.md) | Deep linking with custom protocol | Handling `myapp://` URLs from external apps |
| [examples/custom-protocol.md](examples/custom-protocol.md) | Custom protocol for secure file serving | Replacing `file://` with a safer custom protocol |

<!--
## References

Sources used to compile this skill:

### API Reference
- https://www.electronjs.org/docs/latest/api/app
- https://www.electronjs.org/docs/latest/api/browser-window
- https://www.electronjs.org/docs/latest/api/base-window
- https://www.electronjs.org/docs/latest/api/web-contents-view
- https://www.electronjs.org/docs/latest/api/web-contents
- https://www.electronjs.org/docs/latest/api/ipc-main
- https://www.electronjs.org/docs/latest/api/ipc-renderer
- https://www.electronjs.org/docs/latest/api/context-bridge
- https://www.electronjs.org/docs/latest/api/message-channel-main
- https://www.electronjs.org/docs/latest/api/message-port-main
- https://www.electronjs.org/docs/latest/api/menu
- https://www.electronjs.org/docs/latest/api/menu-item
- https://www.electronjs.org/docs/latest/api/dialog
- https://www.electronjs.org/docs/latest/api/tray
- https://www.electronjs.org/docs/latest/api/notification
- https://www.electronjs.org/docs/latest/api/native-theme
- https://www.electronjs.org/docs/latest/api/native-image
- https://www.electronjs.org/docs/latest/api/shell
- https://www.electronjs.org/docs/latest/api/clipboard
- https://www.electronjs.org/docs/latest/api/touch-bar
- https://www.electronjs.org/docs/latest/api/session
- https://www.electronjs.org/docs/latest/api/cookies
- https://www.electronjs.org/docs/latest/api/protocol
- https://www.electronjs.org/docs/latest/api/net
- https://www.electronjs.org/docs/latest/api/client-request
- https://www.electronjs.org/docs/latest/api/global-shortcut
- https://www.electronjs.org/docs/latest/api/power-monitor
- https://www.electronjs.org/docs/latest/api/power-save-blocker
- https://www.electronjs.org/docs/latest/api/screen
- https://www.electronjs.org/docs/latest/api/safe-storage
- https://www.electronjs.org/docs/latest/api/utility-process
- https://www.electronjs.org/docs/latest/api/desktop-capturer
- https://www.electronjs.org/docs/latest/api/crash-reporter
- https://www.electronjs.org/docs/latest/api/auto-updater
- https://www.electronjs.org/docs/latest/api/system-preferences
- https://www.electronjs.org/docs/latest/api/web-request
- https://www.electronjs.org/docs/latest/api/download-item
- https://www.electronjs.org/docs/latest/api/net-log
- https://www.electronjs.org/docs/latest/api/web-frame
- https://www.electronjs.org/docs/latest/api/web-utils
- https://www.electronjs.org/docs/latest/api/navigation-history

### Guides & Tutorials
- https://www.electronjs.org/docs/latest/tutorial/process-model
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/tutorial/application-distribution
- https://www.electronjs.org/docs/latest/tutorial/code-signing
- https://www.electronjs.org/docs/latest/tutorial/updates
- https://www.electronjs.org/docs/latest/tutorial/asar-archives
- https://www.electronjs.org/docs/latest/tutorial/fuses
- https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
- https://www.electronjs.org/docs/latest/tutorial/performance
- https://www.electronjs.org/docs/latest/tutorial/automated-testing
- https://www.electronjs.org/docs/latest/tutorial/accessibility
- https://www.electronjs.org/docs/latest/tutorial/sandbox
- https://www.electronjs.org/docs/latest/
-->
