# Menu, MenuItem & dialog API Reference

---

## Menu

**Process:** Main | **Import:** `const { Menu } = require('electron')`

### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `Menu.setApplicationMenu(menu)` | void | Set app menu. `null` removes menu bar (Win/Linux). Use `&` for accelerators |
| `Menu.getApplicationMenu()` | Menu \| null | Current app menu |
| `Menu.buildFromTemplate(template)` | Menu | Create from template array |
| `Menu.sendActionToFirstResponder(action)` | void | **macOS only** |

### Instance Methods

| Method | Description |
|--------|-------------|
| `popup([options])` | Show as context menu. Options: `{window, frame, x, y, callback}` |
| `closePopup([window])` | Close context menu |
| `append(menuItem)` | Append item |
| `insert(pos, menuItem)` | Insert at position |
| `getMenuItemById(id)` | Get item by ID |

### Events

`menu-will-show`, `menu-will-close`

### Properties

`items` (MenuItem[]) — the menu's items

---

## MenuItem

### Constructor: `new MenuItem(options)`

| Option | Type | Description |
|--------|------|-------------|
| `click` | Function | `(menuItem, window, event) => void`. Overridden by `role` |
| `role` | string | Built-in action (see full list below) |
| `type` | string | `'normal'`, `'separator'`, `'submenu'`, `'checkbox'`, `'radio'` |
| `label` | string | Visible text |
| `sublabel` | string | Secondary text (macOS 14.4+) |
| `accelerator` | Accelerator | Keyboard shortcut |
| `icon` | NativeImage/string | Icon |
| `enabled` | boolean | Default `true` |
| `visible` | boolean | Default `true` |
| `checked` | boolean | For checkbox/radio types |
| `submenu` | Menu/template | Submenu content |
| `id` | string | Unique identifier |
| `before` / `after` | string[] | Positioning relative to other items |

### All Role Values

`undo`, `redo`, `cut`, `copy`, `paste`, `pasteAndMatchStyle`, `delete`, `selectAll`, `reload`, `forceReload`, `toggleDevTools`, `resetZoom`, `zoomIn`, `zoomOut`, `toggleSpellChecker`, `togglefullscreen`, `window`, `minimize`, `close`, `help`, `about`, `services`, `hide`, `hideOthers`, `unhide`, `quit`, `appMenu`, `fileMenu`, `editMenu`, `viewMenu`, `shareMenu`, `recentDocuments`, `toggleTabBar`, `selectNextTab`, `selectPreviousTab`, `showAllTabs`, `mergeAllWindows`, `clearRecentDocuments`, `moveTabToNewWindow`, `windowMenu`

### Behavior Notes

- Checkbox items auto-toggle `checked` on click
- Radio items enable self and disable adjacent radio siblings
- `role` overrides `click` — don't set both

---

## dialog

**Process:** Main | **Import:** `const { dialog } = require('electron')`

### showOpenDialog

```ts
// Async (recommended)
dialog.showOpenDialog([window,] options) → Promise<{canceled, filePaths, bookmarks?}>

// Sync
dialog.showOpenDialogSync([window,] options) → string[] | undefined
```

**Options:**
- `title` (string)
- `defaultPath` (string)
- `buttonLabel` (string)
- `filters` (FileFilter[]) — **extensions omit dots**: `[{name: 'Images', extensions: ['png', 'jpg']}]`
- `properties` (string[]): `'openFile'`, `'openDirectory'`, `'multiSelections'`, `'showHiddenFiles'`, `'createDirectory'` (macOS), `'promptToCreate'` (Windows), `'dontAddToRecent'` (Windows)
- `message` (string) — **macOS only**

### showSaveDialog

```ts
dialog.showSaveDialog([window,] options) → Promise<{canceled, filePath, bookmark?}>
```

Same options as open plus: `nameFieldLabel` (macOS), `showsTagField` (macOS), `showOverwriteConfirmation` (Linux)

### showMessageBox

```ts
dialog.showMessageBox([window,] options) → Promise<{response, checkboxChecked}>
```

**Options:**
- `message` (string) — **required**
- `type` (string): `'none'`, `'info'`, `'error'`, `'question'`, `'warning'`
- `buttons` (string[])
- `defaultId` / `cancelId` (number)
- `title` / `detail` (string)
- `icon` (NativeImage/string)
- `checkboxLabel` / `checkboxChecked` (async only)
- `signal` (AbortSignal) — async only

### showErrorBox

```ts
dialog.showErrorBox(title, content) → void
```

**The ONLY dialog safe to call before `app.ready`.**

### showCertificateTrustDialog

```ts
dialog.showCertificateTrustDialog([window,] {certificate, message}) → Promise<void>
```

**macOS/Windows only.**

---

## Keyboard Accelerators

Format: `Modifier+Key` or `Modifier+Modifier+Key`

**Modifiers:** `Command` (macOS), `Control`, `Alt` (Option on macOS), `Shift`, `Super` (Windows key/Cmd), `Meta`

**Shorthand:** `CmdOrCtrl` = Command on macOS, Ctrl on Windows/Linux

**Examples:** `CmdOrCtrl+N`, `CmdOrCtrl+Shift+S`, `Alt+F4`, `F11`

---

## Gotchas

- File filter extensions: `['txt']` not `['.txt']` — no dots, no wildcards
- **Windows/Linux**: Cannot simultaneously select files and directories
- Pass `BrowserWindow` to dialog to make it modal (displays as sheet on macOS)
- Async dialogs recommended on macOS to avoid expand/collapse issues
- A default menu is created automatically if none is set
- `getApplicationMenu()` returns a Menu whose items don't support dynamic add/remove
