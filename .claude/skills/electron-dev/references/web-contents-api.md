# webContents API Reference

**Process:** Main | An EventEmitter responsible for rendering and controlling web pages.

Accessed via `win.webContents` (BrowserWindow) or `view.webContents` (WebContentsView).

---

## Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `webContents.getAllWebContents()` | WebContents[] | All instances |
| `webContents.getFocusedWebContents()` | WebContents \| null | Currently focused |
| `webContents.fromId(id)` | WebContents \| null | By numeric ID |
| `webContents.fromFrame(frame)` | WebContents \| null | By WebFrameMain |

## Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `ipc` | IpcMain-scoped (readonly) | IPC scoped to this webContents only |
| `mainFrame` | WebFrameMain (readonly) | Top-level frame |
| `navigationHistory` | NavigationHistory (readonly) | Back/forward navigation (replaces deprecated `goBack()`/`goForward()`) |

---

## Navigation Events

**Document navigations** (different page): `did-start-navigation` → `will-frame-navigate` → `will-navigate` (main frame) → `did-frame-navigate` → `did-navigate`

**In-page navigations** (hash/pushState): `did-start-navigation` → `did-navigate-in-page`

**Important:** `event.preventDefault()` cancels on `will-navigate`/`will-frame-navigate`. Programmatic navigation (`loadURL()`) does NOT emit `will-navigate`.

| Event | Parameters | Description |
|-------|-----------|-------------|
| `will-navigate` | `event`, `url` | Main frame about to navigate. Cancellable |
| `will-frame-navigate` | `event`, `url`, `isMainFrame`, ... | Any frame about to navigate. Cancellable |
| `did-navigate` | `event`, `url`, `httpResponseCode`, `httpStatusText` | Main frame completed |
| `did-navigate-in-page` | `event`, `url`, `isMainFrame` | In-page navigation |
| `will-redirect` | `event`, `url`, ... | Server redirect during navigation |

## Loading Events

| Event | Description |
|-------|-------------|
| `did-start-loading` | Spinner started |
| `did-stop-loading` | Spinner stopped |
| `did-finish-load` | Page fully loaded |
| `did-fail-load` | Load failed (params: errorCode, errorDescription, validatedURL, isMainFrame) |
| `dom-ready` | Top-level frame DOM ready |

## Content Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `page-title-updated` | `event`, `title`, `explicitSet` | Title changed |
| `page-favicon-updated` | `event`, `favicons` | Favicon URLs received |
| `did-create-window` | `event`, `window`, `details` | `window.open()` created new window |
| `context-menu` | `event`, `params` | Right-click. Params: `x`, `y`, `linkURL`, `selectionText`, `isEditable`, `mediaType`, `editFlags`, etc. |
| `console-message` | `event`, `level`, `message`, `line`, `sourceId` | Console output (0=verbose, 1=info, 2=warning, 3=error) |

## Input Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `before-input-event` | `event`, `input` | Keyboard input before page. Cancellable |
| `before-mouse-event` | `event`, `input` | Mouse input before page. Cancellable |

## Media & Display Events

| Event | Description |
|-------|-------------|
| `media-started-playing` / `media-paused` | Media playback state |
| `audio-state-changed` | Audio output changed |
| `enter-html-full-screen` / `leave-html-full-screen` | HTML fullscreen |
| `zoom-changed` | Mouse wheel zoom |
| `cursor-changed` | Cursor type changed |

## Process Events

| Event | Description |
|-------|-------------|
| `render-process-gone` | Renderer crashed/killed |
| `unresponsive` / `responsive` | Page became/recovered from unresponsive |
| `destroyed` | WebContents destroyed |
| `preload-error` | Unhandled exception in preload |

---

## Key Methods

### Page Loading

| Method | Returns | Description |
|--------|---------|-------------|
| `loadURL(url[, options])` | `Promise<void>` | Options: `{httpReferrer, userAgent, extraHeaders, postData, baseURLForDataURL}` |
| `loadFile(filePath[, options])` | `Promise<void>` | Options: `{query, search, hash}` |
| `downloadURL(url[, options])` | void | Download without navigation |
| `stop()` | void | Stop pending navigation |
| `reload()` / `reloadIgnoringCache()` | void | Reload page |

### Content Manipulation

| Method | Returns | Description |
|--------|---------|-------------|
| `insertCSS(css[, options])` | `Promise<string>` | Inject stylesheet. Returns key. Options: `{cssOrigin}` |
| `removeInsertedCSS(key)` | `Promise<void>` | Remove injected CSS |
| `executeJavaScript(code[, userGesture])` | `Promise<any>` | Evaluate code in page context |
| `setWindowOpenHandler(handler)` | void | Intercept `window.open()`. Return `{action: "allow"|"deny"}` |

### Editing

`undo()`, `redo()`, `cut()`, `copy()`, `paste()`, `pasteAndMatchStyle()`, `delete()`, `selectAll()`, `unselect()`, `replace(text)`, `replaceMisspelling(text)`, `insertText(text)`

### Search

| Method | Returns | Description |
|--------|---------|-------------|
| `findInPage(text[, options])` | Integer | Returns requestId. Options: `{forward, findNext, matchCase}` |
| `stopFindInPage(action)` | void | `"clearSelection"`, `"keepSelection"`, `"activateSelection"` |

### Zoom

| Method | Description |
|--------|-------------|
| `setZoomFactor(factor)` | Zoom multiplier (1.0 = 100%) |
| `getZoomFactor()` | Current factor |
| `setZoomLevel(level)` | Relative scale (0 = default; each +1 = +20%) |
| `setVisualZoomLevelLimits(min, max)` | Pinch-zoom range (disabled by default) |

### Printing

| Method | Returns | Description |
|--------|---------|-------------|
| `getPrintersAsync()` | `Promise<PrinterInfo[]>` | Available printers |
| `print([options[, callback]])` | void | Print. Options: `{silent, printBackground, deviceName, ...}` |
| `printToPDF(options)` | `Promise<Buffer>` | Generate PDF |

### IPC

| Method | Description |
|--------|-------------|
| `send(channel, ...args)` | Send async message to renderer |
| `sendToFrame(frameId, channel, ...args)` | Message to specific frame |
| `postMessage(channel, message[, transfer])` | Send with MessagePort transfer |

### DevTools

| Method | Description |
|--------|-------------|
| `openDevTools([options])` | Options: `{mode: "left"|"right"|"bottom"|"undocked"|"detach"}` |
| `closeDevTools()` / `toggleDevTools()` | Close/toggle |
| `isDevToolsOpened()` / `isDevToolsFocused()` | Status checks |
| `inspectElement(x, y)` | Inspect at coordinates |

### Audio & Capture

| Method | Description |
|--------|-------------|
| `setAudioMuted(muted)` | Mute/unmute |
| `isAudioMuted()` / `isCurrentlyAudible()` | Audio status |
| `capturePage([rect, opts])` | Capture visible area. **Only works when page is visible** |

### Other

| Method | Description |
|--------|-------------|
| `getURL()` / `getTitle()` | Current URL/title |
| `isLoading()` / `isLoadingMainFrame()` | Loading status |
| `close([opts])` | Close page. Options: `{waitForBeforeUnload}` |
| `forcefullyCrashRenderer()` | Terminate renderer (for crash recovery) |
| `setUserAgent(agent)` / `getUserAgent()` | User agent |
| `savePage(fullPath, saveType)` | Save page. Type: `"HTMLOnly"`, `"HTMLComplete"`, `"MHTML"` |

---

## Gotchas

- **Programmatic navigation** (`loadURL()`) does NOT emit `will-navigate`
- **Zoom level** applies across same-origin domains — use different origins for per-window zoom
- **`capturePage()`** only works when visible. For hidden windows use `{stayHidden: false}`
- **Visual zoom** (pinch-to-zoom) is disabled by default — call `setVisualZoomLevelLimits()`
- **History methods deprecated** in v32+: use `navigationHistory` property
- **macOS `printToPDF()`** with `@page` CSS ignores `landscape` option
- **Windows DevTools** opens in `detach` mode with Windows Control Overlay
