# Pattern: Custom Protocol for Secure Local File Serving

Replace `file://` with a custom protocol to limit file access and avoid elevated privileges. This is Electron security recommendation #18.

---

## main.ts

```ts
import { app, BrowserWindow, protocol, net, session } from 'electron'
import path from 'node:path'

// MUST be called before app.ready — registers scheme privileges
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    standard: true,     // enables relative URL resolution
    secure: true,       // treated as HTTPS-equivalent
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}])

app.whenReady().then(() => {
  const appRoot = path.join(__dirname, '../renderer')

  // Handle app:// requests
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    // Resolve file path — prevent directory traversal
    let filePath = path.normalize(decodeURIComponent(url.pathname))
    if (filePath === '/' || filePath === '\\') filePath = '/index.html'

    const fullPath = path.join(appRoot, filePath)

    // SECURITY: Verify resolved path is within appRoot
    if (!fullPath.startsWith(appRoot)) {
      return new Response('Forbidden', { status: 403 })
    }

    return net.fetch(`file://${fullPath}`)
  })

  // Set CSP for the custom protocol
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' app:; script-src 'self' app:; style-src 'self' app: 'unsafe-inline'"
        ]
      }
    })
  })

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Load via custom protocol instead of file://
  mainWindow.loadURL('app://bundle/index.html')
})
```

## Why This Works

- **`registerSchemesAsPrivileged()`** MUST be called before `app.ready` — only one chance
- **`protocol.handle()`** is the modern API (replaces deprecated `registerFileProtocol`)
- **`net.fetch('file://...')`** delegates actual file reading to Electron's network stack
- **Path traversal protection** via `path.normalize()` + prefix check ensures only `appRoot` files are served
- **`standard: true`** makes relative URLs resolve correctly (CSS, images, etc.)
- **`secure: true`** treats the protocol as HTTPS-equivalent, enabling service workers and crypto APIs
- **CSP headers** further restrict what the custom protocol pages can load
- Using `app://` instead of `file://` avoids the elevated privileges that `file://` grants (Electron security recommendation #18)
