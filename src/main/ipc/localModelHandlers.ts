import type { IpcMain } from 'electron'
import { LocalModelAdapter } from '../cli/LocalModelAdapter'

const adapter = new LocalModelAdapter()

export { adapter as localModelAdapter }

export function registerLocalModelHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('local-models:detect', () => adapter.detectServers())

  ipcMain.handle('local-models:is-available', () => adapter.isInstalled())

  ipcMain.handle(
    'local-models:chat',
    async (
      _event,
      args: {
        model: string
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
        source?: 'ollama' | 'lmstudio'
      },
    ) => {
      const content = await adapter.chat(args.model, args.messages, args.source)
      return { content }
    },
  )
}
