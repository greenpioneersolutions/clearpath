# nativeTheme, shell & clipboard

---

## nativeTheme

**Process:** Main | **Import:** `const { nativeTheme } = require('electron')`

### Events

| Event | Description |
|-------|-------------|
| `updated` | Any theme property changed |

### Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `shouldUseDarkColors` | boolean | No | Whether OS/Chromium has dark mode enabled |
| `themeSource` | string | **Yes** | `'system'` (default), `'light'`, `'dark'`. Overrides Chromium theme; affects `shouldUseDarkColors`, CSS `prefers-color-scheme`, and native UI |
| `shouldUseHighContrastColors` | boolean | No | High-contrast mode (macOS/Windows) |
| `shouldUseDarkColorsForSystemIntegratedUI` | boolean | No | Windows: distinguishes system vs app theme |
| `shouldUseInvertedColorScheme` | boolean | No | Inverted color scheme (macOS/Windows) |
| `inForcedColorsMode` | boolean | No | Windows high contrast mode |
| `prefersReducedTransparency` | boolean | No | Reduced transparency preference |

### Usage Pattern

```ts
// Set theme
nativeTheme.themeSource = 'dark' // or 'light' or 'system'

// React to changes
nativeTheme.on('updated', () => {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('theme:changed', theme)
  })
})
```

### Caveats

- Setting `themeSource` to `'system'` removes override, returns to OS default
- On macOS, also affects native OS UI elements (not just web content)
- `nativeTheme.themeSource` only affects native UI + `prefers-color-scheme` CSS, NOT your HTML/CSS directly

---

## shell

**Process:** Main and Renderer (renderer must be non-sandboxed)

| Method | Returns | Platform | Description |
|--------|---------|----------|-------------|
| `showItemInFolder(fullPath)` | void | All | Opens file manager, selects item |
| `openPath(path)` | `Promise<string>` | All | Open with default app. Resolves with error or empty string |
| `openExternal(url[, options])` | `Promise<void>` | All | Open URL in default handler. Options: `{activate}` (macOS), `{workingDirectory}` (Windows) |
| `trashItem(path)` | `Promise<void>` | All | Move to OS trash. Use `path.resolve()` for correct separators |
| `beep()` | void | All | System beep |
| `writeShortcutLink(path[, op], options)` | boolean | Windows | Create/update shortcut. Op: `'create'`, `'update'`, `'replace'` |
| `readShortcutLink(path)` | ShortcutDetails | Windows | Read shortcut |

### Security Warning

**Never pass user-controlled data to `shell.openExternal()`** — malicious URIs can execute commands. Always validate protocol (`https:` only).

**Windows:** URL max 2081 characters.

---

## clipboard

**Process:** Main and Renderer (renderer usage deprecated since v41; use preload + contextBridge)

All methods accept optional `type`: `'clipboard'` (default) or `'selection'` (**Linux only** — X11 selection clipboard).

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `readText([type])` | string | Read plain text |
| `writeText(text[, type])` | void | Write plain text |
| `readHTML([type])` | string | Read HTML |
| `writeHTML(markup[, type])` | void | Write HTML |
| `readImage([type])` | NativeImage | Read image |
| `writeImage(image[, type])` | void | Write image |
| `readRTF([type])` | string | Read RTF |
| `writeRTF(text[, type])` | void | Write RTF |
| `readBookmark()` | `{title, url}` | macOS/Windows |
| `writeBookmark(title, url[, type])` | void | macOS/Windows |
| `readFindText()` | string | **macOS.** Find pasteboard |
| `writeFindText(text)` | void | **macOS.** Find pasteboard |
| `clear([type])` | void | Clear clipboard |
| `availableFormats([type])` | string[] | Supported formats |
| `write(data[, type])` | void | Composite write: `{text, html, image, rtf, bookmark}` |

### Experimental Methods

| Method | Description |
|--------|-------------|
| `has(format[, type])` | Check format availability |
| `read(format)` | Read custom format |
| `readBuffer(format)` | Read binary format |
| `writeBuffer(format, buffer[, type])` | Write binary format |

Format strings must use ASCII with `/` separators.
