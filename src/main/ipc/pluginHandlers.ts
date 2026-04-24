import type { IpcMain } from 'electron'
import { dialog, shell } from 'electron'
import { log } from '../utils/logger'
import type { PluginManager, CustomPathCli, PluginCli } from '../plugins/PluginManager'

export function registerPluginHandlers(ipcMain: IpcMain, pluginManager: PluginManager): void {
  ipcMain.handle('plugins:list', () => {
    try {
      return pluginManager.listPlugins()
    } catch (err) {
      log.error(`[pluginHandlers] list failed: ${(err as Error).message}`)
      return []
    }
  })

  // Rescan is the same as list — discovery happens fresh every call. Kept as a
  // separate channel so the UI's intent (force refresh) is clear in the IPC log.
  ipcMain.handle('plugins:rescan', () => {
    try {
      return pluginManager.listPlugins()
    } catch (err) {
      log.error(`[pluginHandlers] rescan failed: ${(err as Error).message}`)
      return []
    }
  })

  ipcMain.handle('plugins:add-custom', async (_e, args: { path?: string; cli: CustomPathCli }) => {
    let path = args?.path?.trim()
    if (!path) {
      const result = await dialog.showOpenDialog({
        title: 'Select plugin directory',
        properties: ['openDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      path = result.filePaths[0]
    }
    const outcome = pluginManager.addCustomPath({ path, cli: args.cli ?? 'auto' })
    if ('error' in outcome) return { error: outcome.error }
    return { entry: outcome.entry }
  })

  ipcMain.handle('plugins:remove-custom', (_e, args: { path: string }) => {
    if (!args?.path) return { error: 'path required' }
    pluginManager.removeCustomPath(args.path)
    return { success: true }
  })

  ipcMain.handle('plugins:set-enabled', (_e, args: { cli: PluginCli; paths: string[] }) => {
    if (args?.cli !== 'copilot' && args?.cli !== 'claude') return { error: 'invalid cli' }
    if (!Array.isArray(args.paths)) return { error: 'paths must be an array' }
    pluginManager.setEnabled(args.cli, args.paths)
    return { success: true }
  })

  ipcMain.handle('plugins:open-folder', async (_e, args: { path: string }) => {
    if (!args?.path) return { error: 'path required' }
    const errMsg = await shell.openPath(args.path)
    if (errMsg) return { error: errMsg }
    return { success: true }
  })
}
