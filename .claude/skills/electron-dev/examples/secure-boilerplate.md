# Pattern: Secure App Boilerplate

A minimal but properly secured Electron application template.

---

## main.ts

```ts
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // avoid white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Show only when content is painted
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  // Prevent navigation to unexpected URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'file:') event.preventDefault()
  })

  // Control window.open()
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(createWindow)

// macOS: keep alive when all windows closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// macOS: re-create window when dock icon clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

## preload.ts

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Request/response
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),

  // Fire-and-forget
  setTitle: (title: string) => ipcRenderer.send('set-title', title),

  // Main → renderer push (callback wrapped safely)
  onUpdateCounter: (callback: (value: number) => void) =>
    ipcRenderer.on('update-counter', (_event, value) => callback(value)),

  // App info
  getVersions: () => ({
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  })
})
```

## Why This Works

- `show: false` + `ready-to-show` prevents the white flash on startup
- All security defaults enforced: `contextIsolation`, `nodeIntegration: false`, `sandbox: true`
- Navigation restricted to `file://` only
- `window.open()` blocked — external URLs opened in default browser
- Single instance lock prevents duplicate app windows
- macOS lifecycle properly handled (stay alive, recreate on activate)
- Module-level `mainWindow` reference prevents GC from destroying the window
- Preload wraps all IPC calls and strips event objects from callbacks
