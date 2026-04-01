import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    return ipcRenderer.invoke(channel, ...args)
  },

  on: (channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): (() => void) => {
    ipcRenderer.on(channel, callback)
    return () => {
      ipcRenderer.removeListener(channel, callback)
    }
  },

  off: (channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void => {
    ipcRenderer.removeListener(channel, callback)
  }
})
