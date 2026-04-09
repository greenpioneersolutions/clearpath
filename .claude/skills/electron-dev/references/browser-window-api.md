# BrowserWindow API Reference

**Process:** Main | **Extends:** `BaseWindow`

Creates and manages windows with a single embedded web page. Inherits all methods, events, and properties from `BaseWindow`.

---

## Constructor: `new BrowserWindow([options])`

Accepts all `BaseWindow` options (size, position, behavior, appearance) plus `webPreferences`.

### webPreferences Options

#### Core & Security

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `preload` | string | — | Script loaded before page scripts. Always has Node access |
| `contextIsolation` | boolean | `true` | Separate JS contexts for preload and page. **Never disable** |
| `nodeIntegration` | boolean | `false` | Node.js in renderer. **Never enable for remote content** |
| `nodeIntegrationInWorker` | boolean | `false` | Node in web workers |
| `sandbox` | boolean | `true` | Renderer sandboxing (default since Electron 20) |
| `webSecurity` | boolean | `true` | Same-origin policy. **Never disable** |
| `allowRunningInsecureContent` | boolean | `false` | Allow HTTPS pages to load HTTP resources |

#### Session & Display

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `session` | Session | — | Custom Session instance |
| `partition` | string | — | Session partition. `persist:` prefix for persistent |
| `devTools` | boolean | `true` | Enable DevTools |
| `zoomFactor` | number | `1.0` | Default zoom (1.0 = 100%) |
| `javascript` | boolean | `true` | Enable JavaScript |
| `images` | boolean | `true` | Enable image rendering |
| `webgl` | boolean | `true` | Enable WebGL |

#### Behavior

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `experimentalFeatures` | boolean | `false` | Chromium experimental features |
| `scrollBounce` | boolean | `false` | macOS rubber banding |
| `spellcheck` | boolean | `true` | Built-in spellchecker |
| `backgroundThrottling` | boolean | `true` | Throttle when backgrounded |
| `safeDialogs` | boolean | `false` | Consecutive dialog protection |
| `navigateOnDragDrop` | boolean | `false` | Navigate on file drag |
| `autoplayPolicy` | string | — | `"no-user-gesture-required"`, `"user-gesture-required"`, `"document-user-activation-required"` |
| `v8CacheOptions` | string | `"code"` | `"none"`, `"code"`, `"bypassHeatCheck"`, `"bypassHeatCheckAndEagerCompile"` |

#### Fonts

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultFontFamily` | Object | — | Keys: `standard`, `serif`, `sansSerif`, `monospace` |
| `defaultFontSize` | Integer | `16` | Default font size |
| `defaultMonospaceFontSize` | Integer | `13` | Default monospace size |
| `minimumFontSize` | Integer | `0` | Minimum font size |
| `defaultEncoding` | string | `"ISO-8859-1"` | Default encoding |

### BaseWindow Options (inherited)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` / `height` | Integer | 800 / 600 | Window size in pixels |
| `x` / `y` | Integer | — | Position. Required together |
| `center` | boolean | `false` | Center on screen |
| `minWidth` / `minHeight` | Integer | 0 | Minimum size |
| `maxWidth` / `maxHeight` | Integer | unlimited | Maximum size |
| `show` | boolean | `true` | Show when created |
| `frame` | boolean | `true` | Include native frame |
| `parent` | BaseWindow | — | Parent window |
| `modal` | boolean | `false` | Modal (requires `parent`) |
| `resizable` | boolean | `true` | User-resizable |
| `movable` | boolean | `true` | User-movable (macOS/Windows) |
| `closable` | boolean | `true` | User-closable (macOS/Windows) |
| `focusable` | boolean | `true` | Can receive focus |
| `alwaysOnTop` | boolean | `false` | Always on top |
| `fullscreen` | boolean | `false` | Start fullscreen |
| `skipTaskbar` | boolean | `false` | Hide from taskbar |
| `kiosk` | boolean | `false` | Kiosk mode |
| `title` | string | `"Electron"` | Window title |
| `icon` | NativeImage/string | — | Window icon |
| `backgroundColor` | string | `"#FFF"` | Background color |
| `hasShadow` | boolean | `true` | Window shadow |
| `opacity` | number | — | 0.0-1.0 (macOS/Windows) |
| `transparent` | boolean | `false` | Transparent window |
| `titleBarStyle` | string | `"default"` | `"hidden"`, `"hiddenInset"` (macOS), `"customButtonsOnHover"` (macOS) |
| `titleBarOverlay` | Object/boolean | — | Window Controls Overlay: `{color, symbolColor, height}` |
| `vibrancy` | string | — | **macOS.** Vibrancy effect type |
| `backgroundMaterial` | string | — | **Windows 11.** `"mica"`, `"acrylic"`, `"tabbed"` |
| `autoHideMenuBar` | boolean | `false` | Auto-hide menu bar (Linux/Windows) |

---

## Key Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `ready-to-show` | — | Page rendered but not yet shown. **Show window here to avoid flash** |
| `close` | `event` | Before window closes. `preventDefault()` cancels |
| `closed` | — | After close. Remove all references |
| `page-title-updated` | `event`, `title`, `explicitSet` | Document title changed |
| `unresponsive` / `responsive` | — | Web page became/recovered from unresponsive |
| `blur` / `focus` | — | Window lost/gained focus |
| `show` / `hide` | — | Window shown/hidden |
| `maximize` / `unmaximize` | — | Window maximized/restored |
| `minimize` / `restore` | — | Window minimized/restored |
| `will-resize` | `event`, `newBounds`, `{edge}` | Before resize. `preventDefault()` cancels |
| `resize` / `resized` | — | Resizing / finished resizing |
| `will-move` | `event`, `newBounds` | Before move. `preventDefault()` (Windows only) |
| `move` / `moved` | — | Moving / finished moving |
| `enter-full-screen` / `leave-full-screen` | — | Fullscreen toggled |
| `enter-html-full-screen` / `leave-html-full-screen` | — | HTML API fullscreen |
| `swipe` | `event`, `direction` | **macOS.** Trackpad swipe |

---

## Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `BrowserWindow.getAllWindows()` | BrowserWindow[] | All opened windows |
| `BrowserWindow.getFocusedWindow()` | BrowserWindow \| null | Currently focused window |
| `BrowserWindow.fromWebContents(wc)` | BrowserWindow \| null | Window owning the webContents |
| `BrowserWindow.fromId(id)` | BrowserWindow \| null | Window by ID |

---

## Key Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `win.loadURL(url[, options])` | `Promise<void>` | Load URL. Options: `{httpReferrer, userAgent, extraHeaders, postData}` |
| `win.loadFile(filePath[, options])` | `Promise<void>` | Load local HTML. Options: `{query, search, hash}` |
| `win.reload()` | void | Reload page |
| `win.setMenu(menu)` / `win.removeMenu()` | void | Menu bar (Linux/Windows) |
| `win.setParentWindow(parent)` | void | Set parent window |
| `win.getChildWindows()` | BrowserWindow[] | Child windows |
| `win.capturePage([rect, opts])` | `Promise<NativeImage>` | Capture page snapshot |
| `win.flashFrame(flag)` | void | Flash to attract attention |
| `win.setProgressBar(progress[, options])` | void | 0-1 range. Options: `{mode}` (Windows) |
| `win.setOverlayIcon(overlay, desc)` | void | **Windows.** Taskbar overlay |
| `win.setThumbarButtons(buttons)` | boolean | **Windows.** Toolbar buttons (max 7) |

Plus all BaseWindow methods: `destroy()`, `close()`, `show()`, `hide()`, `focus()`, `blur()`, `minimize()`, `maximize()`, `restore()`, `setBounds()`, `setSize()`, `setPosition()`, `center()`, `setTitle()`, `setAlwaysOnTop()`, `setOpacity()`, `setVibrancy()`, `setBackgroundMaterial()`, `setTouchBar()`, etc.

---

## Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `win.webContents` | WebContents (readonly) | The window's WebContents |
| `win.id` | Integer (readonly) | Unique window ID |
| `win.title` | string | Window title |
| `win.fullScreen` | boolean | Fullscreen state |
| `win.kiosk` | boolean | Kiosk mode |
| `win.resizable` / `win.movable` / `win.closable` | boolean | Window behavior |
| `win.autoHideMenuBar` | boolean | Menu bar auto-hide |
| `win.documentEdited` | boolean | **macOS.** Grey dot in close button |
| `win.representedFilename` | string | **macOS.** File in title bar |

---

## Gotchas

- **`ready-to-show`**: Create with `show: false`, show in this event to avoid white flash
- **`paintWhenInitiallyHidden`**: If `false` with `show: false`, renderer won't activate until `show()`
- **macOS fullscreen**: Transitions are async — use events, not immediate `isFullScreen()` checks
- **`will-resize` on macOS**: Only provides `bottom` and `right` edge values
- **`will-move` preventDefault**: Only works on Windows
- **`fromBrowserView()` is deprecated** — BrowserView itself is deprecated
- **GC**: Store BrowserWindow references at module level — GC destroys the window if lost
