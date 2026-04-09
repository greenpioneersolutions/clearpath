# Pattern: Comprehensive Preload Bridge with Channel Whitelisting

A well-structured preload with channel whitelisting and proper typing.

---

```ts
import { contextBridge, ipcRenderer } from 'electron'

// Channel whitelists — only these channels are allowed
const INVOKE_CHANNELS = [
  'dialog:openFile',
  'dialog:saveFile',
  'dialog:showMessage',
  'fs:readFile',
  'fs:writeFile',
  'app:getVersion',
  'app:getPath',
  'store:get',
  'store:set'
] as const

const SEND_CHANNELS = [
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:setTitle',
  'app:quit'
] as const

const RECEIVE_CHANNELS = [
  'app:update-available',
  'app:download-progress',
  'session:output',
  'session:error',
  'notification:show'
] as const

contextBridge.exposeInMainWorld('electronAPI', {
  // Type-safe invoke with channel validation
  invoke: (channel: typeof INVOKE_CHANNELS[number], ...args: unknown[]) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    throw new Error(`Invalid invoke channel: ${channel}`)
  },

  // Type-safe send with channel validation
  send: (channel: typeof SEND_CHANNELS[number], ...args: unknown[]) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },

  // Type-safe receive with channel validation
  on: (channel: typeof RECEIVE_CHANNELS[number], callback: (...args: unknown[]) => void) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },

  // Cleanup listener
  removeAllListeners: (channel: typeof RECEIVE_CHANNELS[number]) => {
    if (RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
    }
  },

  // Static info (no IPC needed)
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
})
```

## TypeScript Types (for renderer)

```ts
// types/electron.d.ts
interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, callback: (...args: unknown[]) => void): void
  removeAllListeners(channel: string): void
  versions: {
    node: string
    chrome: string
    electron: string
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

## Why This Works

- **Channel whitelisting** prevents arbitrary IPC injection — only known channels pass through
- **Event stripping** in `on()` prevents leaking `IpcRendererEvent.sender` (which has full `ipcRenderer` access)
- **`as const` arrays** provide TypeScript type safety for channel names
- **Validation** throws/silently drops invalid channels rather than forwarding them
- **Cleanup method** allows React components to remove listeners on unmount
- **Static versions** are read once during preload — no IPC needed
