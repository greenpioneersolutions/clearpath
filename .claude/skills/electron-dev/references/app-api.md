# app Module API Reference

**Process:** Main | **Import:** `const { app } = require('electron')`

Controls the application's event lifecycle. An EventEmitter.

---

## Lifecycle Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `will-finish-launching` | — | Basic startup. Set up `open-file`/`open-url` handlers here |
| `ready` | `event`, `launchInfo` (macOS) | Initialization complete. Use `app.whenReady()` for async |
| `window-all-closed` | — | All windows closed. Default quits unless you handle this event |
| `before-quit` | `event` | Before windows close. `preventDefault()` cancels quit |
| `will-quit` | `event` | After all windows closed, before termination |
| `quit` | `event`, `exitCode` | During quit sequence |
| `activate` | `event`, `hasVisibleWindows` | **macOS.** App activated (dock click, relaunch) |
| `second-instance` | `event`, `argv`, `workingDirectory`, `additionalData` | Another instance attempted to launch |

## Window Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `browser-window-blur` | `event`, `window` | A BrowserWindow lost focus |
| `browser-window-focus` | `event`, `window` | A BrowserWindow gained focus |
| `browser-window-created` | `event`, `window` | New BrowserWindow created |
| `web-contents-created` | `event`, `webContents` | New webContents created |

## Security Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `certificate-error` | `event`, `webContents`, `url`, `error`, `certificate`, `callback`, `isMainFrame` | SSL cert validation failed |
| `select-client-certificate` | `event`, `webContents`, `url`, `certificateList`, `callback` | Client cert requested |
| `login` | `event`, `webContents`, `authDetails`, `authInfo`, `callback` | Basic/digest auth required |
| `render-process-gone` | `event`, `webContents`, `details` | Renderer crashed or killed |
| `child-process-gone` | `event`, `details` | Non-renderer child process exited |

## macOS-Only Events

| Event | Description |
|-------|-------------|
| `open-file` | File opened via dock/Finder. Requires `CFBundleDocumentTypes` in Info.plist |
| `open-url` | Custom URL scheme invoked. Requires `CFBundleURLTypes` in Info.plist |
| `did-become-active` | App becomes active |
| `did-resign-active` | App lost focus |
| `continue-activity` | Handoff activity received from another device |
| `new-window-for-tab` | Native new tab button clicked |

---

## Key Methods

### App Lifecycle

| Method | Returns | Description |
|--------|---------|-------------|
| `app.quit()` | void | Graceful quit. Fires events, respects `beforeunload` |
| `app.exit([exitCode])` | void | Immediate exit. Default code=0 |
| `app.relaunch([options])` | void | Restart after exit. **Must call `quit()`/`exit()` after** |
| `app.isReady()` | boolean | Whether initialization complete |
| `app.whenReady()` | `Promise<void>` | Resolves when ready |
| `app.focus([options])` | void | Activate app. macOS: `{steal: true}` to force foreground |
| `app.hide()` / `app.show()` | void | **macOS.** Hide/show all windows |

### Paths & Metadata

| Method | Returns | Description |
|--------|---------|-------------|
| `app.getAppPath()` | string | Application directory |
| `app.getPath(name)` | string | Special directory. Names: `home`, `appData`, `userData`, `sessionData`, `temp`, `exe`, `desktop`, `documents`, `downloads`, `music`, `pictures`, `videos`, `logs`, `crashDumps` |
| `app.setPath(name, path)` | void | Override special directory |
| `app.getVersion()` | string | Version from package.json |
| `app.getName()` / `app.setName(name)` | string/void | App name |
| `app.getLocale()` | string | Current locale from Chromium |
| `app.getSystemLocale()` | string | System locale |

### Protocol Handling

| Method | Returns | Description |
|--------|---------|-------------|
| `app.setAsDefaultProtocolClient(protocol)` | boolean | Register as default handler for URL scheme |
| `app.removeAsDefaultProtocolClient(protocol)` | boolean | Remove as default. macOS/Windows |
| `app.isDefaultProtocolClient(protocol)` | boolean | Check if default |
| `app.getApplicationNameForProtocol(url)` | string | App name handling the protocol |

### Single Instance

| Method | Returns | Description |
|--------|---------|-------------|
| `app.requestSingleInstanceLock([data])` | boolean | True if this instance holds the lock |
| `app.hasSingleInstanceLock()` | boolean | Whether holding lock |
| `app.releaseSingleInstanceLock()` | void | Release lock |

### Login Items (macOS, Windows)

| Method | Returns | Description |
|--------|---------|-------------|
| `app.getLoginItemSettings([options])` | Object | `{openAtLogin, wasOpenedAtLogin, status, ...}` |
| `app.setLoginItemSettings(settings)` | void | Configure login behavior |

### Other

| Method | Returns | Description |
|--------|---------|-------------|
| `app.getFileIcon(path[, options])` | `Promise<NativeImage>` | File icon. Options: `{size: "small"|"normal"|"large"}` |
| `app.setBadgeCount([count])` | void | **Linux, macOS.** Set dock badge. 0 hides |
| `app.isPackaged` | boolean | True if packaged (production) |
| `app.showAboutPanel()` | void | Show about panel |
| `app.setAboutPanelOptions(options)` | void | Set about content |
| `app.disableHardwareAcceleration()` | void | **Must call before `ready`** |
| `app.enableSandbox()` | void | Force sandbox for all renderers. **Must call before `ready`** |
| `app.getAppMetrics()` | ProcessMetric[] | Memory/CPU statistics |
| `app.getGPUInfo(infoType)` | `Promise<unknown>` | `"basic"` or `"complete"` |
| `app.configureHostResolver(options)` | void | DNS/DoH config. Call after `ready` |
| `app.setProxy(config)` | `Promise<void>` | Set proxy. Call after `ready` |

---

## Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `app.isPackaged` | boolean (readonly) | True if running from packaged app |
| `app.applicationMenu` | Menu \| null | Read/write. Application menu |
| `app.commandLine` | CommandLine (readonly) | Command line args |
| `app.dock` | Dock \| undefined (readonly) | **macOS.** Dock icon manipulation |
| `app.name` | string | App name |
| `app.userAgentFallback` | string | Global fallback user agent |
| `app.runningUnderARM64Translation` | boolean (readonly) | Running under Rosetta/WOW |

---

## Gotchas

- `window-all-closed`: If not subscribed, default quits. On macOS, apps typically stay open
- `app.relaunch()` does NOT quit by itself — call `quit()` or `exit()` after
- `disableHardwareAcceleration()` and `enableSandbox()` must be called before `ready`
- `getGPUFeatureStatus()` only reliable after `gpu-info-update` event
- `startAccessingSecurityScopedResource()`: **Leaks kernel resources** if cleanup function not called
- Login item settings differ between macOS < 13 and macOS 13+ (requires `type`/`serviceName`)
- Many modules require `app.ready` before use — use `app.whenReady()` pattern
