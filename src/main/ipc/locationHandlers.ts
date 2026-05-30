import type { IpcMain } from 'electron'
import { dialog, shell } from 'electron'
import { existsSync } from 'fs'
import { log } from '../utils/logger'
import { isSensitiveSystemPath } from '../utils/pathSecurity'
import type { LocationsManager } from '../locations/LocationsManager'

/**
 * IPC surface for the Locations service (Local Setup page, first-run wizard,
 * QuickStart approved-folders picker). Mirrors the dialog-or-path pattern used
 * by {@link ./pluginHandlers.registerPluginHandlers}: when the renderer doesn't
 * pass a path, we open the native folder picker here in main.
 */
export function registerLocationHandlers(ipcMain: IpcMain, locations: LocationsManager): void {
  // ── Approved folders ─────────────────────────────────────────────────────--

  ipcMain.handle('locations:list-approved', () => {
    try {
      return locations.listApproved()
    } catch (err) {
      log.error(`[locationHandlers] list-approved failed: ${(err as Error).message}`)
      return []
    }
  })

  ipcMain.handle('locations:add-approved', async (_e, args?: { path?: string; label?: string }) => {
    let path = args?.path?.trim()
    if (!path) {
      const result = await dialog.showOpenDialog({
        title: 'Choose a folder ClearPath can access',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      path = result.filePaths[0]
    }
    const outcome = locations.addApproved(path, args?.label)
    if ('error' in outcome) return { error: outcome.error }
    return { entry: outcome.entry }
  })

  ipcMain.handle('locations:remove-approved', (_e, args: { id: string }) => {
    if (!args?.id) return { error: 'id required' }
    locations.removeApproved(args.id)
    return { success: true }
  })

  // ── Default working directory ────────────────────────────────────────────--

  ipcMain.handle('locations:get-default-cwd', () => locations.getDefaultWorkingDir())

  ipcMain.handle('locations:set-default-cwd', (_e, args: { path: string | null }) => {
    const outcome = locations.setDefaultWorkingDir(args?.path ?? null)
    if ('error' in outcome) return { error: outcome.error }
    return { success: true }
  })

  // ── Extra source folders ─────────────────────────────────────────────────--

  ipcMain.handle('locations:list-sources', () => {
    try {
      return locations.listSources()
    } catch (err) {
      log.error(`[locationHandlers] list-sources failed: ${(err as Error).message}`)
      return []
    }
  })

  ipcMain.handle('locations:add-source', async (_e, args?: { path?: string }) => {
    let path = args?.path?.trim()
    if (!path) {
      const result = await dialog.showOpenDialog({
        title: 'Choose a folder to scan for skills, agents, and plugins',
        properties: ['openDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      path = result.filePaths[0]
    }
    const outcome = locations.addSource(path)
    if ('error' in outcome) return { error: outcome.error }
    return { entry: outcome.entry }
  })

  ipcMain.handle('locations:remove-source', (_e, args: { path: string }) => {
    if (!args?.path) return { error: 'path required' }
    locations.removeSource(args.path)
    return { success: true }
  })

  // ── Reveal a discovered location in the OS file manager ───────────────────--

  ipcMain.handle('locations:open-path', async (_e, args: { path: string }) => {
    const path = args?.path?.trim()
    if (!path) return { error: 'path required' }
    if (isSensitiveSystemPath(path)) return { error: 'That location is protected' }
    if (!existsSync(path)) return { error: 'Folder no longer exists' }
    const errMsg = await shell.openPath(path)
    if (errMsg) return { error: errMsg }
    return { success: true }
  })

  // ── Health ────────────────────────────────────────────────────────────────

  ipcMain.handle('locations:health', () => {
    try {
      return locations.health()
    } catch (err) {
      log.error(`[locationHandlers] health failed: ${(err as Error).message}`)
      return { defaultWorkingDir: null, approvedFolders: [], sourceFolders: [] }
    }
  })
}
