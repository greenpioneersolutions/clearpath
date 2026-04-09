# Pattern: Multi-Window Management

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'

// Track all windows
const windows = new Map<string, BrowserWindow>()

function createWindow(id: string, options: {
  url?: string
  file?: string
  parent?: BrowserWindow
  modal?: boolean
  width?: number
  height?: number
}): BrowserWindow {
  const win = new BrowserWindow({
    width: options.width ?? 800,
    height: options.height ?? 600,
    show: false,
    parent: options.parent,
    modal: options.modal ?? false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  win.on('closed', () => {
    windows.delete(id)
  })

  if (options.url) {
    win.loadURL(options.url)
  } else if (options.file) {
    win.loadFile(options.file)
  }

  windows.set(id, win)
  return win
}

// Usage
app.whenReady().then(() => {
  const main = createWindow('main', {
    file: path.join(__dirname, '../renderer/index.html'),
    width: 1200,
    height: 800
  })

  // Open settings as a modal child window
  ipcMain.handle('open-settings', () => {
    if (windows.has('settings')) {
      windows.get('settings')!.focus()
      return
    }
    createWindow('settings', {
      file: path.join(__dirname, '../renderer/settings.html'),
      parent: main,
      modal: true,
      width: 600,
      height: 500
    })
  })
})
```

## Why This Works

- **Map-based tracking** with string IDs prevents duplicate windows and enables lookup
- **`show: false` + `ready-to-show`** avoids white flash on every window
- **Cleanup on `closed`** removes the reference from the map
- **Modal windows** require a `parent` — displayed as sheets on macOS
- **Focus check** prevents opening duplicate settings windows
- All windows share the same security-hardened webPreferences
