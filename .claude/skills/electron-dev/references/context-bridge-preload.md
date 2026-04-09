# contextBridge & Preload Scripts

The contextBridge module creates a safe bridge between the isolated preload world and the renderer's main world. Preload scripts are the only place where this bridge should be established.

---

## contextBridge API

**Process:** Renderer (preload scripts only)

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `exposeInMainWorld` | `(apiKey: string, api: any)` | Injects `api` onto `window[apiKey]` in the main world |
| `exposeInIsolatedWorld` | `(worldId: number, apiKey: string, api: any)` | Injects into a specific isolated world. `0` = default, `999` = Electron's contextIsolation world, use `1000+` for custom |
| `executeInMainWorld` | `(script: { func, args? })` | **Experimental.** Executes a function in the main world. Function is serialized (loses bound context) |

### Supported Types for Bridge Transfer

| Type | Supported | Notes |
|------|-----------|-------|
| string, number, boolean | Yes | Primitive, copied |
| Object | Yes | Keys must be simple types; **prototypes dropped** |
| Array | Yes | Same limitations as Object |
| Error | Yes | Only `message` and `stack` reliably cross |
| Promise | Yes | |
| Function | Yes | **Proxied, not copied.** Executes in originating context. Classes/constructors do NOT work |
| Date, RegExp, Map, Set, ArrayBuffer, Blob | Yes | Cloneable types |
| Symbol | **NO** | Cannot cross context boundary |

### Critical Behaviors

- **Values are copied and frozen.** Mutations on one side do NOT propagate to the other.
- **Functions are proxied**, not copied. They execute in the originating context.
- **Prototypes are dropped.** Class instances become plain objects with only own enumerable properties.
- **Classes/constructors cannot be sent.** `new MyClass()` on the other side fails.

---

## Preload Script Constraints

### Available in Sandboxed Preload (`sandbox: true`, default)

**Electron modules:** `contextBridge`, `crashReporter`, `ipcRenderer`, `nativeImage`, `webFrame`, `webUtils`

**Node.js modules:** `events`, `timers`, `url` (plus `node:` prefixed ESM variants)

**Polyfilled globals:** `Buffer`, `process`, `clearImmediate`, `setImmediate`

**Limitation:** Cannot use CommonJS `require()` to split preload into multiple files. Use a bundler (Vite via electron-vite, webpack, or Parcel) for code separation.

### Available in Unsandboxed Preload (`sandbox: false`)

Full Node.js environment plus all Electron renderer modules. **Not recommended for production.**

---

## Correct Pattern

```ts
// preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Request-response (returns Promise)
  getData: (key: string) => ipcRenderer.invoke('get-data', key),
  
  // Main-to-renderer events (callback wrapped safely)
  onUpdate: (cb: (data: any) => void) =>
    ipcRenderer.on('update', (_event, data) => cb(data)),
  
  // Fire-and-forget
  sendLog: (msg: string) => ipcRenderer.send('log', msg),

  // Cleanup
  removeUpdateListener: () => ipcRenderer.removeAllListeners('update'),
  
  // Static info (no IPC needed)
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
})
```

---

## Anti-Patterns

### Never expose raw ipcRenderer

```ts
// BAD — since v29, yields empty object anyway
contextBridge.exposeInMainWorld('electron', { ipcRenderer })

// BAD — leaks the full IPC bus
contextBridge.exposeInMainWorld('api', {
  send: ipcRenderer.send,
  on: ipcRenderer.on
})
```

### Never pass raw callbacks

```ts
// BAD — leaks IpcRendererEvent which has .sender (full ipcRenderer access)
onUpdateCounter: (callback) => ipcRenderer.on('update-counter', callback)

// GOOD — strip event, forward only data
onUpdateCounter: (callback) => ipcRenderer.on('update-counter', (_event, value) => callback(value))
```

### Never expose Node APIs to untrusted content

```ts
// BAD — grants filesystem access to renderer
contextBridge.exposeInMainWorld('fs', require('fs'))
```

---

## Channel Whitelisting Pattern

```ts
const INVOKE_CHANNELS = [
  'dialog:openFile',
  'dialog:saveFile',
  'fs:readFile',
  'store:get',
  'store:set'
] as const

const SEND_CHANNELS = [
  'window:minimize',
  'window:close',
  'app:quit'
] as const

const RECEIVE_CHANNELS = [
  'app:update-available',
  'session:output',
  'notification:show'
] as const

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: typeof INVOKE_CHANNELS[number], ...args: unknown[]) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    throw new Error(`Invalid invoke channel: ${channel}`)
  },
  send: (channel: typeof SEND_CHANNELS[number], ...args: unknown[]) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },
  on: (channel: typeof RECEIVE_CHANNELS[number], callback: (...args: unknown[]) => void) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },
  removeAllListeners: (channel: typeof RECEIVE_CHANNELS[number]) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
    }
  }
})
```

---

## Security Reminder

- **Always enable `contextIsolation`** — disabling it also disables sandboxing
- Preload environment is **more privileged** than sandboxed renderer
- The bridge copies values; it does not create shared references
- `exposeInMainWorld` must be called synchronously during preload execution
