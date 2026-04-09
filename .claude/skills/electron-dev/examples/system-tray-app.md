# Pattern: System Tray Application

```ts
import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'

// CRITICAL: Store tray reference at module level to prevent GC
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

function createTray(): void {
  // macOS: use Template image for automatic dark/light mode
  const iconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'trayTemplate.png')  // must end in "Template"
    : path.join(__dirname, 'tray.png')

  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)

  tray.setToolTip('My Electron App')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Window', click: () => mainWindow?.show() },
    { label: 'Hide Window', click: () => mainWindow?.hide() },
    { type: 'separator' },
    {
      label: 'Status',
      submenu: [
        { label: 'Online', type: 'radio', checked: true },
        { label: 'Away', type: 'radio' },
        { label: 'Offline', type: 'radio' }
      ]
    },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ])

  tray.setContextMenu(contextMenu)

  // Click toggles window visibility
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  createTray()
})
```

## Why This Works

- **Module-level `tray` variable** prevents garbage collection from destroying the icon
- **macOS Template images** (filename ending in `Template`) adapt to dark/light mode automatically
- Recommended sizes: 16x16 (72dpi) + 32x32@2x (144dpi) for macOS
- **Windows**: ICO format recommended
- **Linux**: Must call `setContextMenu()` again after modifying MenuItems
