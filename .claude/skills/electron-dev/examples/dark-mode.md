# Pattern: Dark Mode Support

```ts
// main.ts
import { nativeTheme, ipcMain, BrowserWindow } from 'electron'

ipcMain.handle('theme:get', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
})

ipcMain.handle('theme:set', (_event, mode: 'system' | 'light' | 'dark') => {
  nativeTheme.themeSource = mode
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
})

// Push theme changes to all windows
nativeTheme.on('updated', () => {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('theme:changed', theme)
  })
})

// preload.ts
contextBridge.exposeInMainWorld('themeAPI', {
  get: () => ipcRenderer.invoke('theme:get'),
  set: (mode: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme:set', mode),
  onChange: (cb: (theme: 'dark' | 'light') => void) =>
    ipcRenderer.on('theme:changed', (_e, theme) => cb(theme))
})
```

```css
/* renderer CSS — responds to nativeTheme.themeSource changes automatically */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1e2e;
    --fg: #cdd6f4;
    --surface: #313244;
    --primary: #89b4fa;
  }
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #eff1f5;
    --fg: #4c4f69;
    --surface: #ccd0da;
    --primary: #1e66f5;
  }
}
```

## Why This Works

- `nativeTheme.themeSource` controls both native UI and CSS `prefers-color-scheme`
- Setting to `'system'` removes the override and follows OS preference
- The `updated` event fires on any theme property change — push to all windows
- CSS media queries respond automatically to `themeSource` changes
