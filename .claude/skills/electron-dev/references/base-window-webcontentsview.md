# BaseWindow & WebContentsView

Use `BaseWindow` + `WebContentsView` for multi-view window layouts (split panes, embedded panels). For single-page windows, use `BrowserWindow` instead.

---

## BaseWindow

**Process:** Main | **Import:** `const { BaseWindow } = require('electron')`

Flexible window without built-in web content. Compose multiple `WebContentsView` instances into it.

### Constructor: `new BaseWindow([options])`

Same options as BrowserWindow's window-level options (size, position, behavior, appearance) but **without `webPreferences`** (no embedded web content).

### Critical Difference from BrowserWindow

**BaseWindow does NOT auto-destroy WebContents on close.** You MUST manually clean up:

```ts
const win = new BaseWindow()
const view = new WebContentsView()
win.contentView.addChildView(view)

win.on('closed', () => {
  view.webContents.close()  // REQUIRED — prevents memory leak
})
```

### Key Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `setContentView(view)` | void | Set the content view |
| `getContentView()` | View | Get the content view |
| `destroy()` | void | Force close (no unload events) |
| `close()` | void | Graceful close |
| All BrowserWindow window methods | — | `show()`, `hide()`, `focus()`, `setBounds()`, `setTitle()`, etc. |

### Static Methods

| Method | Returns |
|--------|---------|
| `BaseWindow.getAllWindows()` | BaseWindow[] |
| `BaseWindow.getFocusedWindow()` | BaseWindow \| null |
| `BaseWindow.fromId(id)` | BaseWindow \| null |

---

## WebContentsView

**Process:** Main | **Extends:** `View`

Displays a WebContents. Used to compose multiple web views in a single BaseWindow.

### Constructor: `new WebContentsView([options])`

| Option | Type | Description |
|--------|------|-------------|
| `webPreferences` | WebPreferences | Same options as BrowserWindow's webPreferences |
| `webContents` | WebContents | Existing WebContents to adopt (may only appear in one view at a time) |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `webContents` | WebContents (readonly) | The displayed WebContents |

### Inherited from View

| Method | Description |
|--------|-------------|
| `setBounds(bounds)` | Set position and size within parent |
| `getBounds()` | Get current bounds |
| `setBackgroundColor(color)` | Set background color |
| `addChildView(view[, index])` | Add child view |
| `removeChildView(view)` | Remove child view |
| `children` | Array of child views |

---

## Multi-View Layout Example

```ts
const { app, BaseWindow, WebContentsView } = require('electron')

app.whenReady().then(() => {
  const win = new BaseWindow({ width: 800, height: 600 })

  // Left panel
  const left = new WebContentsView()
  win.contentView.addChildView(left)
  left.setBounds({ x: 0, y: 0, width: 400, height: 600 })
  left.webContents.loadURL('https://electronjs.org')

  // Right panel
  const right = new WebContentsView()
  win.contentView.addChildView(right)
  right.setBounds({ x: 400, y: 0, width: 400, height: 600 })
  right.webContents.loadURL('https://github.com')

  // Handle resize
  win.on('resize', () => {
    const [width, height] = win.getContentSize()
    left.setBounds({ x: 0, y: 0, width: Math.floor(width / 2), height })
    right.setBounds({ x: Math.floor(width / 2), y: 0, width: Math.ceil(width / 2), height })
  })

  // CRITICAL: Clean up webContents on close
  win.on('closed', () => {
    left.webContents.close()
    right.webContents.close()
  })
})
```

---

## When to Use Which

| Aspect | BrowserWindow | BaseWindow + WebContentsView |
|--------|--------------|------------------------------|
| Web views | Single embedded webContents | Multiple composable views |
| webContents cleanup | Automatic on close | **Manual** (must call `view.webContents.close()`) |
| `ready-to-show` event | Yes | No (no embedded web content) |
| Parent/child via method | `setParentWindow()` | Constructor `parent` option only |
| Use case | Single-page windows | Split panes, multi-view layouts |

---

## Gotchas

- **Memory leaks:** Always close webContents in the window's `closed` event
- **One view per webContents:** A WebContents may only appear in one WebContentsView at a time
- **Layout is manual:** Handle `resize` events and call `setBounds()` yourself
- **No `ready-to-show`:** BaseWindow has no embedded content, so this event doesn't exist
- **`BrowserView` is deprecated:** Use WebContentsView instead
- **Cannot subclass:** Electron's built-in classes cannot be subclassed
