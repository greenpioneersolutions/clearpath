import type { IpcMain } from 'electron'
import { LocalModelAdapter } from '../cli/LocalModelAdapter'

const adapter = new LocalModelAdapter()

export function registerLocalModelHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('local-models:detect', () => adapter.detectServers())

  ipcMain.handle('local-models:is-available', () => adapter.isInstalled())
}
