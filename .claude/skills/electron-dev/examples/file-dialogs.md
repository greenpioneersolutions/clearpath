# Pattern: File Dialogs

```ts
import { app, ipcMain, dialog, BrowserWindow } from 'electron'

// Open file dialog (modal to the calling window)
ipcMain.handle('dialog:openFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: 'Select a file',
    defaultPath: app.getPath('documents'),
    filters: [
      { name: 'Documents', extensions: ['txt', 'md', 'pdf'] },  // NO dots
      { name: 'Images', extensions: ['png', 'jpg', 'gif'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  })
  return canceled ? [] : filePaths
})

// Open directory dialog
ipcMain.handle('dialog:openDirectory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory', 'createDirectory']
  })
  return canceled ? null : filePaths[0]
})

// Save file dialog
ipcMain.handle('dialog:saveFile', async (event, defaultName: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    defaultPath: defaultName,
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Text', extensions: ['txt'] }
    ]
  })
  return canceled ? null : filePath
})

// Confirmation dialog
ipcMain.handle('dialog:confirm', async (event, message: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { response } = await dialog.showMessageBox(win!, {
    type: 'question',
    buttons: ['Cancel', 'OK'],
    defaultId: 1,
    cancelId: 0,
    title: 'Confirm',
    message
  })
  return response === 1 // true if OK
})
```

## Why This Works

- **Passing `BrowserWindow`** makes dialogs modal (macOS shows as sheet)
- **File filter extensions omit dots**: `['txt']` not `['.txt']`
- **Async dialogs recommended** on macOS to avoid expand/collapse issues
- **`dialog.showErrorBox()`** is the only dialog safe to call before `app.ready`
- **Windows/Linux**: Cannot simultaneously select files and directories
