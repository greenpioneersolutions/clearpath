# Pattern: All 4 IPC Communication Patterns

---

## Pattern 1: invoke/handle (Request/Response) — PREFERRED

```ts
// main.ts
ipcMain.handle('dialog:openFile', async (event) => {
  // Validate sender
  const parsed = new URL(event.senderFrame.url)
  if (parsed.protocol !== 'file:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost')) {
    throw new Error('Unauthorized IPC sender')
  }

  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Text', extensions: ['txt', 'md', 'json'] }]
  })
  if (canceled) return null
  return filePaths[0]
})

// preload.ts
contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('dialog:openFile')
})

// renderer
const filePath = await window.api.openFile()
```

**Use when:** You need a response. Most common pattern.

## Pattern 2: send/on (Fire-and-Forget)

```ts
// main.ts
ipcMain.on('set-title', (event, title: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.setTitle(title)
})

// preload.ts
contextBridge.exposeInMainWorld('api', {
  setTitle: (title: string) => ipcRenderer.send('set-title', title)
})

// renderer
window.api.setTitle('My New Title')
```

**Use when:** No response needed (logging, UI updates).

## Pattern 3: webContents.send (Main → Renderer Push)

```ts
// main.ts
function pushDataToRenderer(win: BrowserWindow, data: unknown): void {
  win.webContents.send('data-update', data)
}

// preload.ts — ALWAYS strip the Electron event object
contextBridge.exposeInMainWorld('api', {
  onDataUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on('data-update', (_event, data) => callback(data))
  },
  removeDataUpdateListener: () => {
    ipcRenderer.removeAllListeners('data-update')
  }
})

// renderer
window.api.onDataUpdate((data) => {
  console.log('Received from main:', data)
})

// cleanup when component unmounts
window.api.removeDataUpdateListener()
```

**Use when:** Main process pushes updates to renderer (progress, state changes).

## Pattern 4: MessageChannel (Renderer ↔ Renderer)

```ts
// main.ts — broker creates channel and distributes ports
import { BrowserWindow, MessageChannelMain } from 'electron'

function connectWindows(win1: BrowserWindow, win2: BrowserWindow): void {
  const { port1, port2 } = new MessageChannelMain()
  win1.webContents.postMessage('new-port', null, [port1])
  win2.webContents.postMessage('new-port', null, [port2])
}

// preload.ts — both windows use the same preload
let messagePort: MessagePort | null = null

contextBridge.exposeInMainWorld('comm', {
  send: (msg: unknown) => messagePort?.postMessage(msg),
  onMessage: (cb: (data: unknown) => void) => {
    if (messagePort) messagePort.onmessage = (event) => cb(event.data)
  }
})

ipcRenderer.on('new-port', (event) => {
  messagePort = event.ports[0]
  messagePort.start() // MUST call start() or messages won't flow
})
```

**Use when:** Two renderers need direct communication without routing through main.

---

## Rules

- **Prefer Pattern 1** (invoke/handle) for request/response
- **NEVER use `sendSync`** — blocks the entire renderer
- **Always validate `event.senderFrame`** in handlers
- **Always strip the event object** in preload callbacks: `(_event, data) => cb(data)`
- `ipcMain.handle` allows only ONE handler per channel
- IPC uses structured clone — cannot send functions, DOM nodes, or prototyped objects
