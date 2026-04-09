# IPC Communication Patterns

All main↔renderer communication goes through IPC. Electron provides four patterns.

---

## Pattern 1: invoke/handle (Request/Response) — PREFERRED

```ts
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile')
})
// main.ts
ipcMain.handle('dialog:openFile', async (event) => {
  validateSender(event.senderFrame)
  const { filePaths } = await dialog.showOpenDialog({})
  return filePaths[0]
})
// renderer
const path = await window.electronAPI.openFile()
```

**Use when:** You need a response back. This is the preferred pattern for most IPC.

## Pattern 2: send/on (Fire-and-Forget)

```ts
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  setTitle: (title: string) => ipcRenderer.send('set-title', title)
})
// main.ts
ipcMain.on('set-title', (event, title) => {
  BrowserWindow.fromWebContents(event.sender)?.setTitle(title)
})
```

**Use when:** No response needed.

## Pattern 3: webContents.send (Main → Renderer Push)

```ts
// main.ts
win.webContents.send('update-counter', newValue)
// preload.ts — ALWAYS strip the event object
contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateCounter: (cb: (value: number) => void) =>
    ipcRenderer.on('update-counter', (_event, value) => cb(value))
})
```

**Use when:** Main process needs to push data to a specific renderer.

## Pattern 4: MessageChannel (Renderer ↔ Renderer)

```ts
// main.ts — broker creates channel and distributes ports
const { port1, port2 } = new MessageChannelMain()
win1.webContents.postMessage('port', null, [port1])
win2.webContents.postMessage('port', null, [port2])

// preload.ts — receive the port
ipcRenderer.on('port', (event) => {
  const port = event.ports[0]
  port.start() // MUST call start()
  port.onmessage = (e) => console.log(e.data)
})
```

**Use when:** Two renderers need to communicate directly without routing through main.

---

## ipcMain API

**Process:** Main only. An EventEmitter.

### Listener Methods

| Method | Description |
|--------|-------------|
| `ipcMain.on(channel, listener)` | Subscribe to channel. Fires on every message. |
| `ipcMain.once(channel, listener)` | One-time listener; auto-removes after first invocation. |
| `ipcMain.off(channel, listener)` | Remove a specific listener. |
| `ipcMain.removeAllListeners(channel?)` | Remove all listeners for channel (or all). |

### Handler Methods (Promise-based)

| Method | Description |
|--------|-------------|
| `ipcMain.handle(channel, listener)` | Handle `ipcRenderer.invoke()` calls. Returns Promise or value. |
| `ipcMain.handleOnce(channel, listener)` | Single-use handler. |
| `ipcMain.removeHandler(channel)` | Remove handler for channel. |

### Event Objects

**IpcMainEvent** (from `on`/`once`):
- `event.returnValue` — Set to reply synchronously (for `sendSync`)
- `event.reply(channel, ...args)` — Async reply; iframe-safe (targets sending frame)
- `event.sender` — The `webContents` that sent the message
- `event.senderFrame` — The `WebFrameMain` that sent the message (use for validation)
- `event.ports` — `MessagePortMain[]` (when sent via `postMessage`)

**IpcMainInvokeEvent** (from `handle`):
- `event.sender` — The `webContents` that invoked
- `event.senderFrame` — The `WebFrameMain` that invoked

---

## ipcRenderer API

**Process:** Renderer only. An EventEmitter.

| Method | Description |
|--------|-------------|
| `ipcRenderer.on(channel, listener)` | Subscribe to channel. |
| `ipcRenderer.once(channel, listener)` | One-time listener. |
| `ipcRenderer.off(channel, listener)` | Remove specific listener. |
| `ipcRenderer.removeAllListeners(channel?)` | Remove all listeners. |
| `ipcRenderer.send(channel, ...args)` | Async fire-and-forget to main. |
| `ipcRenderer.invoke(channel, ...args)` | Send message, await response. Returns `Promise<any>`. |
| `ipcRenderer.sendSync(channel, ...args)` | **Blocks entire renderer.** Avoid. |
| `ipcRenderer.postMessage(channel, message, transfer?)` | Send with optional MessagePort transfer. |
| `ipcRenderer.sendToHost(channel, ...args)` | Send to `<webview>` host page. |

---

## MessageChannelMain / MessagePortMain

**Process:** Main only.

```ts
const { port1, port2 } = new MessageChannelMain()
```

**MessagePortMain methods:**
- `port.postMessage(message, transfer?)` — Send message
- `port.start()` — **MUST call** to begin receiving messages
- `port.close()` — Disconnect the port

**MessagePortMain events:**
- `message` — `{ data, ports }` — Received message
- `close` — Remote end disconnected

**Key difference from DOM:** Uses `port.on('message', handler)` (Node EventEmitter), NOT `port.onmessage`.

---

## Serialization Rules (Structured Clone Algorithm)

**Supported:** strings, numbers, booleans, Uint8Array, plain objects, arrays, Date, RegExp, Map, Set, ArrayBuffer, Blob.

**Throws:** Functions, Promises, Symbols, WeakMaps, WeakSets.

**Cannot send:** DOM objects, prototype chains (dropped).

---

## Rules & Anti-Patterns

### Do

- Prefer `invoke`/`handle` for request/response
- Always validate `event.senderFrame` in handlers
- Use `event.reply()` over `event.sender.send()` (iframe-safe)
- Whitelist channels in preload — don't forward arbitrary strings
- Strip the event object in callbacks: `(_event, value) => cb(value)`

### Don't

- **Never use `sendSync`** — blocks the entire renderer
- **Never expose raw `ipcRenderer`** via contextBridge (yields empty object since v29)
- **Never pass user-controlled channel names** — allows arbitrary IPC injection
- **Never pass raw IPC callbacks** without stripping the event (leaks `IpcRendererEvent.sender`)
- **Don't call `handle()` twice** on the same channel — throws. Call `removeHandler()` first.

### Gotchas

- **Error serialization:** Errors thrown in `handle` lose custom properties; only `message` survives
- **`event.reply()` vs `event.sender.send()`:** `reply()` routes to the correct frame (iframe-safe); `sender.send()` always targets main frame
- **Transferred ports** cannot be used by the sender after transfer
