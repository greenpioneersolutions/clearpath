# Pattern: Deep Linking with Custom Protocol

Register a custom protocol so external apps/browsers can open your app with `myapp://path/to/action`.

---

## main.ts

```ts
import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'

const PROTOCOL = 'myapp'
let mainWindow: BrowserWindow | null = null

// MUST be called before app.ready and only once
if (process.defaultApp) {
  // Dev mode: register with path to script
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1])
    ])
  }
} else {
  // Production: register normally
  app.setAsDefaultProtocolClient(PROTOCOL)
}

// macOS: handle protocol URL when app is already running
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// Windows/Linux: protocol URL arrives via process argv
// When app is already running, second-instance fires instead
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows/Linux: URL is the last argv element
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`))
    if (url) handleDeepLink(url)

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function handleDeepLink(url: string): void {
  const parsed = new URL(url)
  // parsed.hostname = action, parsed.pathname = params
  // Example: myapp://open/document?id=123
  mainWindow?.webContents.send('deep-link', {
    action: parsed.hostname,
    path: parsed.pathname,
    params: Object.fromEntries(parsed.searchParams)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  // Check if launched with a deep link (cold start)
  const launchUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`))
  if (launchUrl) {
    mainWindow.once('ready-to-show', () => handleDeepLink(launchUrl))
  }
}

app.whenReady().then(createWindow)
```

## preload.ts

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onDeepLink: (callback: (data: { action: string; path: string; params: Record<string, string> }) => void) =>
    ipcRenderer.on('deep-link', (_event, data) => callback(data)),
  removeDeepLinkListener: () =>
    ipcRenderer.removeAllListeners('deep-link')
})
```

## Why This Works

- **`setAsDefaultProtocolClient()`** registers `myapp://` with the OS
- **macOS uses `open-url` event** — works both on cold start and when app is running
- **Windows/Linux use `second-instance` argv** — URL is passed as a command-line argument
- **`requestSingleInstanceLock()`** ensures only one instance handles the URL
- **Dev mode** needs `process.execPath` + script path because the app isn't packaged
- **Cold start handling** checks `process.argv` after window creation
- Parse deep link URLs with `new URL()` — never use string splitting or `startsWith()`
