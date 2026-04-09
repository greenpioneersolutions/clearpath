# Pattern: Session & Permission Management

```ts
import { session, app, BrowserWindow } from 'electron'
import path from 'node:path'

app.whenReady().then(() => {
  const ses = session.defaultSession

  // Permission request handler — control camera, mic, geolocation, etc.
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const parsed = new URL(webContents.getURL())
    const isAllowed = parsed.protocol === 'file:'
      || (parsed.protocol === 'http:' && parsed.hostname === 'localhost')

    // Allow notifications and clipboard for our app only
    if (isAllowed && ['notifications', 'clipboard-read'].includes(permission)) {
      callback(true)
      return
    }

    // Deny everything else
    callback(false)
  })

  // Handle file downloads
  ses.on('will-download', (_event, item) => {
    const savePath = path.join(app.getPath('downloads'), item.getFilename())
    item.setSavePath(savePath)

    item.on('updated', (_event, state) => {
      if (state === 'progressing' && !item.isPaused()) {
        const progress = item.getReceivedBytes() / item.getTotalBytes()
        BrowserWindow.getFocusedWindow()?.setProgressBar(progress)
      }
    })

    item.on('done', (_event, state) => {
      BrowserWindow.getFocusedWindow()?.setProgressBar(-1)
      if (state === 'completed') {
        console.log('Download completed:', savePath)
      }
    })
  })

  // Set custom user agent (strip Electron identifier)
  ses.setUserAgent(ses.getUserAgent().replace(/Electron\/\S+/, ''))

  // Proxy configuration
  ses.setProxy({
    proxyRules: 'http=proxy.example.com:8080;https=proxy.example.com:8443',
    proxyBypassRules: 'localhost,127.0.0.1'
  })
})
```

## Why This Works

- **Electron auto-approves all permissions by default** — this handler restricts them
- **Origin validation** ensures only our app's content gets permissions
- **Download handler** sets save path (bypasses save dialog) and tracks progress
- **User agent stripping** removes Electron identifier for web compatibility
- **`session.defaultSession`** is only available after `app.whenReady()`
