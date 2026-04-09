# Pattern: Auto-Update with electron-updater

```ts
// main.ts — using electron-updater (cross-platform)
import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, dialog } from 'electron'

function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // CRITICAL: Only run in packaged apps
  if (!app.isPackaged) return

  autoUpdater.checkForUpdatesAndNotify()

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update:available', info.version)
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update:progress', progress.percent)
    mainWindow.setProgressBar(progress.percent / 100)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    mainWindow.setProgressBar(-1) // clear progress
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart to apply?`
    })
    if (response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err.message)
  })
}
```

## Why This Works

- **`app.isPackaged` guard** prevents update checks in development
- **Progress bar** on the window provides visual feedback
- **Dialog prompt** lets user choose when to restart
- Updates apply on next launch even without calling `quitAndInstall()`
- `electron-updater` works cross-platform (unlike built-in `autoUpdater` which is macOS/Windows only)
