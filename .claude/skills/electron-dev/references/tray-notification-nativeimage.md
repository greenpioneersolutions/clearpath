# Tray, Notification & nativeImage

---

## Tray

**Process:** Main | **CRITICAL: Store reference at module level to prevent GC**

### Constructor

`new Tray(image: NativeImage | string, [guid: string])`

- `guid`: UUID for icon persistence across relaunches (Windows position, macOS position)

### Events

| Event | Parameters | Platform |
|-------|-----------|----------|
| `click` | `event`, `bounds`, `position` | All |
| `right-click` | `event`, `bounds` | macOS, Windows |
| `double-click` | `event`, `bounds` | macOS, Windows |
| `balloon-show` / `balloon-click` / `balloon-closed` | — | Windows |
| `drop-files` | `event`, `files` | macOS |
| `mouse-enter` / `mouse-leave` / `mouse-move` | `event`, `position` | macOS, Windows |

### Methods

| Method | Platform | Description |
|--------|----------|-------------|
| `destroy()` / `isDestroyed()` | All | Lifecycle |
| `setImage(image)` | All | Update icon |
| `setPressedImage(image)` | macOS | Pressed state icon |
| `setToolTip(text)` | All | Hover text |
| `setTitle(title[, options])` | macOS | Text next to icon. Options: `{fontType: 'monospaced'|'monospacedDigit'}` |
| `setContextMenu(menu)` | All | Context menu |
| `popUpContextMenu([menu, position])` | macOS, Windows | Show menu |
| `displayBalloon(options)` | Windows | `{icon, iconType, title, content, largeIcon, noSound}` |
| `getBounds()` | macOS, Windows | Icon bounds |

### Platform Notes

- **macOS**: Use template images (filename ending in `Template`). Recommended: 16x16 (72dpi) + 32x32@2x (144dpi)
- **Windows**: ICO format recommended
- **Linux**: Must call `setContextMenu()` again after modifying MenuItems

---

## Notification

**Process:** Main only (renderer should use Web Notifications API)

### Static: `Notification.isSupported()` → boolean

### Constructor: `new Notification([options])`

| Option | Type | Platform | Description |
|--------|------|----------|-------------|
| `title` | string | All | Notification title |
| `subtitle` | string | macOS | Below title |
| `body` | string | All | Body text |
| `silent` | boolean | All | Suppress sound |
| `icon` | string/NativeImage | All | Icon |
| `hasReply` | boolean | macOS | Inline reply input |
| `urgency` | string | Linux/Windows | `'normal'`, `'critical'`, `'low'` |
| `actions` | NotificationAction[] | macOS | Action buttons |
| `toastXml` | string | Windows | Custom XML (supersedes all other props) |
| `timeoutType` | string | Linux/Windows | `'default'` or `'never'` |

### Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `show` | — | Displayed |
| `click` | — | User clicked |
| `close` | `{reason}` | Dismissed (reason on Windows: `'userCanceled'`, `'timedOut'`) |
| `reply` | `{reply}` | Inline reply (macOS) |
| `action` | `{actionIndex}` | Action button clicked |
| `failed` | `event`, `error` | Error during show (Windows) |

### Methods

- `show()` — **Must be called explicitly** after construction
- `close()` — Dismiss notification

### Caveats

- `show()` must be called — instantiation alone does NOT show
- `close` event is not guaranteed in all cases
- **Windows**: `'critical'` urgency requires `timeoutType: 'never'`

---

## nativeImage

**Process:** Main and Renderer

### High DPI Support

Filename convention: `@Nx` suffix (e.g., `icon@2x.png`). Supported: `@1x`, `@1.25x`, `@1.5x`, `@2x`, `@3x`, `@4x`, `@5x`.

### Template Images (macOS)

Black + alpha channel images that adapt to light/dark. Filename must end in `Template` (e.g., `iconTemplate.png`).

### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `createEmpty()` | NativeImage | Empty image |
| `createFromPath(path)` | NativeImage | From PNG/JPEG file |
| `createFromBuffer(buffer[, options])` | NativeImage | Options: `{width, height, scaleFactor}` |
| `createFromDataURL(dataURL)` | NativeImage | From base64 data URL |
| `createFromNamedImage(name[, hslShift])` | NativeImage | **macOS.** From NSImage/SF Symbol |
| `createThumbnailFromPath(path, size)` | `Promise<NativeImage>` | macOS/Windows |

### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `toPNG([options])` | Buffer | PNG data. Options: `{scaleFactor}` |
| `toJPEG(quality)` | Buffer | JPEG data (0-100 quality) |
| `toBitmap([options])` | Buffer | Raw bitmap data |
| `toDataURL([options])` | string | Data URL |
| `isEmpty()` | boolean | Whether empty |
| `getSize([scaleFactor])` | Size | Image dimensions |
| `getAspectRatio([scaleFactor])` | number | Width/height ratio |
| `crop(rect)` | NativeImage | Cropped copy |
| `resize(options)` | NativeImage | Options: `{width, height, quality}` |
| `setTemplateImage(option)` | void | **macOS.** Mark as template |
| `isTemplateImage()` | boolean | Is template |
| `getScaleFactors()` | number[] | All scale factors |
| `addRepresentation(options)` | void | Add at scale factor |

### Supported Formats

PNG (recommended, supports transparency), JPEG, ICO (Windows, from file paths). EXIF metadata is NOT processed.
