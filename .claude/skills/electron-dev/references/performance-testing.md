# Performance, Testing, Accessibility & Renderer APIs

---

## Performance Recommendations

### 1. Audit Dependencies
Evaluate npm modules by size and startup cost. A module great for servers may severely degrade an Electron app.

### 2. Lazy-Load Modules
Load "just in time," not eagerly at startup:
```ts
// BAD: loads parser at startup
const fooParser = require('foo-parser')
// GOOD: loads only when needed
async function parse() {
  const fooParser = require('foo-parser')
  return fooParser.parse(data)
}
```

### 3. Never Block Main Process
Use `utilityProcess.fork()`, worker threads, or async I/O. Avoid `sendSync` and `@electron/remote`.

### 4. Optimize Renderer
- Use `requestIdleCallback()` for low-priority work
- Use Web Workers for CPU-intensive operations
- Target 60 FPS

### 5. Skip Polyfills
Electron bundles modern Chromium. Don't include jQuery for DOM, `regenerator-runtime` for async/await, or CSS vendor prefixes.

### 6. Bundle Resources Locally
Ship fonts, images, and static assets instead of fetching from CDNs.

### 7. Bundle Code
Use webpack, Vite, or rollup to tree-shake and minify.

### 8. Remove Default Menu
```ts
Menu.setApplicationMenu(null) // Call before app.on('ready')
```

---

## Automated Testing

### WebdriverIO (Recommended)
```bash
npm init wdio@latest ./
# Select "Desktop Testing - of Electron Applications"
```
- Service: `'electron'`, capability: `browserName: 'electron'`
- Access Electron APIs: `browser.electron.execute()`

### Playwright (Experimental)
```ts
const { _electron: electron } = require('playwright')
const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
// Standard Playwright API works
await page.click('button')
```

### Selenium
Requires `electron-chromedriver`. Uses `goog:chromeOptions` with Electron binary path.

### Custom Test Driver
Spawn Electron with `child_process`, communicate via STDIO IPC. Lower overhead than frameworks.

---

## Accessibility

- Electron auto-enables accessibility when assistive technology detected
- Manual: `app.setAccessibilitySupportEnabled(enabled)`
- Follow standard web accessibility (ARIA, semantic HTML)
- Test with screen readers on target platforms

---

## webFrame (Renderer Process)

**Access:** `require('electron').webFrame` (via preload + contextBridge)

### Zoom
| Method | Description |
|--------|-------------|
| `setZoomFactor(factor)` | 300% = 3.0. Must be > 0.0 |
| `getZoomFactor()` | Current factor |
| `setZoomLevel(level)` | 0 = original; +/-1 = 20% change |
| `setVisualZoomLevelLimits(min, max)` | Pinch-to-zoom limits |

### CSS & Scripts
| Method | Description |
|--------|-------------|
| `insertCSS(css[, options])` | Returns key for removal. Options: `{cssOrigin: 'user'|'author'}` |
| `removeInsertedCSS(key)` | Remove by key |
| `insertText(text)` | Insert into focused element |
| `executeJavaScript(code[, userGesture])` | Returns `Promise<any>` |

### Spell Checking
| Method | Description |
|--------|-------------|
| `setSpellCheckProvider(language, provider)` | Custom spell checker |
| `isWordMisspelled(word)` | Check single word |
| `getWordSuggestions(word)` | Correction suggestions |

### Resources
| Method | Description |
|--------|-------------|
| `getResourceUsage()` | Blink cache stats: images, scripts, fonts, etc. |
| `clearCache()` | Free unused memory (refilling costs performance) |

### Frame Navigation
`getFrameForSelector(selector)`, `findFrameByName(name)`, `findFrameByToken(token)`

### Properties (readonly)
`top`, `opener`, `parent`, `firstChild`, `nextSibling`, `frameToken`

---

## webUtils (Renderer Process)

### `webUtils.getPathForFile(file)` → string

Get filesystem path from a Web File object. Returns empty string for JS-created files. Supersedes the old `file.path` augmentation.

---

## NavigationHistory (Main Process)

**Access:** `webContents.navigationHistory`

| Method | Returns | Description |
|--------|---------|-------------|
| `canGoBack()` / `canGoForward()` | boolean | Navigation possible |
| `goBack()` / `goForward()` | void | Navigate |
| `goToIndex(index)` / `goToOffset(offset)` | void | Navigate to position |
| `getActiveIndex()` | Integer | Current page index |
| `getEntryAtIndex(index)` | NavigationEntry \| null | Entry at index |
| `length()` | Integer | Total history length |
| `getAllEntries()` | NavigationEntry[] | Complete history |
| `clear()` | void | Clear history |
| `removeEntryAtIndex(index)` | boolean | Cannot remove active index |
| `restore(options)` | `Promise<void>` | Restore history. Call before any navigation |
