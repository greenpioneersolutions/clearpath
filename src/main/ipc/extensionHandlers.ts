import type { IpcMain } from 'electron'
import { dialog, app } from 'electron'
import { existsSync, mkdirSync, rmSync, readdirSync, cpSync, statSync } from 'fs'
import AdmZip from 'adm-zip'
import { join } from 'path'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { log } from '../utils/logger'
import type { ExtensionRegistry } from '../extensions/ExtensionRegistry'
import type { ExtensionMainLoader } from '../extensions/ExtensionMainLoader'
import type { ExtensionStoreFactory } from '../extensions/ExtensionStore'
import type { NotificationManager } from '../notifications/NotificationManager'
import type { ExtensionPermission } from '../extensions/types'

/**
 * IPC handlers for the extension system.
 * Follows the same registerXxxHandlers pattern as all other IPC handler files.
 */
export function registerExtensionHandlers(
  ipcMain: IpcMain,
  registry: ExtensionRegistry,
  loader: ExtensionMainLoader,
  storeFactory: ExtensionStoreFactory,
  notificationManager: NotificationManager,
): void {

  // ── List all registered extensions ────────────────────────────────────────

  ipcMain.handle('extension:list', () => {
    try {
      return { success: true, data: registry.list() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Get a single extension by ID ──────────────────────────────────────────

  ipcMain.handle('extension:get', (_e, args: { extensionId: string }) => {
    try {
      const ext = registry.get(args.extensionId)
      return ext ? { success: true, data: ext } : { success: false, error: 'Not found' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Install from file (opens file dialog, extracts, validates) ─────────────

  ipcMain.handle('extension:install', async (_e, args?: { filePath?: string; zipPath?: string }) => {
    try {
      let sourcePath = args?.filePath ?? args?.zipPath

      if (!sourcePath) {
        // Open file dialog for extension package selection
        const result = await dialog.showOpenDialog({
          title: 'Install Extension',
          filters: [{ name: 'ClearPath Extension', extensions: ['clear.ext', 'zip'] }],
          properties: ['openFile'],
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: 'Installation cancelled' }
        }
        sourcePath = result.filePaths[0]
      }

      // For now, support direct directory installation (zip extraction is a follow-up).
      // In production, we'd use a zip library (e.g., adm-zip) to extract first.
      // Check if the source is a directory (for dev/testing) or a zip file.
      const isDirectory = existsSync(sourcePath) && statSync(sourcePath).isDirectory()

      let extractedDir: string
      let tmpDir: string | undefined
      if (isDirectory) {
        extractedDir = sourcePath
      } else {
        // Extract zip to temporary directory
        tmpDir = join(app.getPath('temp'), `clearpath-ext-${Date.now()}`)
        try {
          const zip = new AdmZip(sourcePath)
          zip.extractAllTo(tmpDir, true)

          // The zip may contain files at root or in a single subdirectory
          // Check if clearpath-extension.json is at root or one level deep
          let manifestDir = tmpDir
          if (!existsSync(join(tmpDir, 'clearpath-extension.json'))) {
            // Check one level deep (zip may have been created with a wrapper directory)
            const entries = readdirSync(tmpDir)
            const subDir = entries.find(e =>
              existsSync(join(tmpDir!, e, 'clearpath-extension.json'))
            )
            if (subDir) {
              manifestDir = join(tmpDir, subDir)
            } else {
              throw new Error('Invalid extension package: clearpath-extension.json not found')
            }
          }
          extractedDir = manifestDir
        } catch (zipErr) {
          // Clean up temp dir on failure
          try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
          throw zipErr
        }
      }

      const ext = registry.install(extractedDir)

      // Auto-enable newly installed extensions
      registry.setEnabled(ext.manifest.id, true)
      const updatedExt = registry.get(ext.manifest.id)!

      // Load main process entry if present
      if (updatedExt.manifest.main && !loader.isLoaded(updatedExt.manifest.id)) {
        try {
          await loader.load(updatedExt)
        } catch (loadErr) {
          log.warn('[ext-handlers] Main process load failed for "%s": %s', updatedExt.manifest.id, loadErr)
        }
      }

      // Clean up temp extraction directory (only for zip installs)
      if (tmpDir) {
        try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
      }

      notificationManager.emit({
        type: 'agent-status' as import('../notifications/NotificationManager').NotificationType,
        severity: 'info' as import('../notifications/NotificationManager').NotificationSeverity,
        title: 'Extension Installed',
        message: `"${updatedExt.manifest.name}" has been installed and enabled. Review permissions in Configure > Extensions.`,
      })

      return { success: true, data: updatedExt }
    } catch (err) {
      log.error('[ext-handlers] Install failed: %s', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Uninstall an extension ────────────────────────────────────────────────

  ipcMain.handle('extension:uninstall', async (_e, args: { extensionId: string }) => {
    try {
      const ext = registry.get(args.extensionId)
      if (!ext) return { success: false, error: 'Extension not found' }

      // Deactivate if loaded
      await loader.unload(args.extensionId)

      // Clean up storage
      storeFactory.destroyStore(args.extensionId)

      // Remove from registry and disk
      registry.uninstall(args.extensionId)

      notificationManager.emit({
        type: 'agent-status' as import('../notifications/NotificationManager').NotificationType,
        severity: 'info' as import('../notifications/NotificationManager').NotificationSeverity,
        title: 'Extension Uninstalled',
        message: `"${ext.manifest.name}" has been removed.`,
      })

      return { success: true }
    } catch (err) {
      log.error('[ext-handlers] Uninstall failed: %s', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Enable / Disable toggle ───────────────────────────────────────────────

  ipcMain.handle('extension:toggle', async (_e, args: { extensionId: string; enabled: boolean }) => {
    try {
      const ext = registry.get(args.extensionId)
      if (!ext) return { success: false, error: 'Extension not found' }

      if (args.enabled) {
        // Enable: reset errors, update registry, load main if present
        registry.resetErrors(args.extensionId)
        registry.setEnabled(args.extensionId, true)

        const updated = registry.get(args.extensionId)!
        if (updated.manifest.main && !loader.isLoaded(args.extensionId)) {
          await loader.load(updated)
        }
      } else {
        // Disable: unload if loaded, update registry
        await loader.unload(args.extensionId)
        registry.setEnabled(args.extensionId, false)
      }

      return { success: true }
    } catch (err) {
      log.error('[ext-handlers] Toggle failed: %s', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Update permissions ────────────────────────────────────────────────────

  ipcMain.handle(
    'extension:update-permissions',
    (_e, args: { extensionId: string; granted: ExtensionPermission[]; denied: ExtensionPermission[] }) => {
      try {
        if (args.granted.length > 0) {
          registry.grantPermissions(args.extensionId, args.granted)
        }
        if (args.denied.length > 0) {
          registry.revokePermissions(args.extensionId, args.denied)
        }
        return { success: true, data: registry.get(args.extensionId) }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Extension storage operations (proxied from renderer SDK calls) ────────

  ipcMain.handle(
    'extension:storage-get',
    (_e, args: { extensionId: string; key: string }) => {
      try {
        if (!registry.hasPermission(args.extensionId, 'storage')) {
          return { success: false, error: 'Storage permission not granted' }
        }
        const store = storeFactory.getStore(args.extensionId)
        return { success: true, data: store.get(args.key) }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'extension:storage-set',
    (_e, args: { extensionId: string; key: string; value: unknown }) => {
      try {
        if (!registry.hasPermission(args.extensionId, 'storage')) {
          return { success: false, error: 'Storage permission not granted' }
        }
        const store = storeFactory.getStore(args.extensionId)
        store.set(args.key, args.value)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'extension:storage-delete',
    (_e, args: { extensionId: string; key: string }) => {
      try {
        if (!registry.hasPermission(args.extensionId, 'storage')) {
          return { success: false, error: 'Storage permission not granted' }
        }
        const store = storeFactory.getStore(args.extensionId)
        store.delete(args.key)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'extension:storage-keys',
    (_e, args: { extensionId: string }) => {
      try {
        if (!registry.hasPermission(args.extensionId, 'storage')) {
          return { success: false, error: 'Storage permission not granted' }
        }
        const store = storeFactory.getStore(args.extensionId)
        return { success: true, data: store.keys() }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'extension:storage-quota',
    (_e, args: { extensionId: string }) => {
      try {
        const store = storeFactory.getStore(args.extensionId)
        return { success: true, data: store.getQuota() }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Notification proxy (for extensions calling sdk.notifications.emit) ────

  ipcMain.handle(
    'extension:notify',
    (_e, args: { extensionId: string; title: string; message: string; severity?: 'info' | 'warning' }) => {
      try {
        if (!registry.hasPermission(args.extensionId, 'notifications:emit')) {
          return { success: false, error: 'Notification permission not granted' }
        }

        const ext = registry.get(args.extensionId)
        notificationManager.emit({
          type: 'agent-status' as import('../notifications/NotificationManager').NotificationType,
          severity: (args.severity ?? 'info') as import('../notifications/NotificationManager').NotificationSeverity,
          title: `[${ext?.manifest.name ?? args.extensionId}] ${args.title}`,
          message: args.message,
        })

        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Check extension requirements (integrations it needs) ───────────────────

  ipcMain.handle(
    'extension:check-requirements',
    async (_e, args: { extensionId: string }) => {
      try {
        const ext = registry.get(args.extensionId)
        if (!ext) return { success: false, error: 'Extension not found' }

        const requires = ext.manifest.requires
        if (!requires || requires.length === 0) {
          return { success: true, data: { met: true, results: [] } }
        }

        // Read integration status from the store directly
        const Store = require('electron-store') as typeof import('electron-store').default
        const { getStoreEncryptionKey } = require('../utils/storeEncryption') as typeof import('../utils/storeEncryption')
        const integStore = new Store({
          name: 'clear-path-integrations',
          encryptionKey: getStoreEncryptionKey(),
          defaults: {},
        })

        const results = requires.map((req) => {
          // The integration store uses the integration key directly (e.g., "github", "atlassian")
          const entry = integStore.get(req.integration) as { connected?: boolean } | null | undefined
          const met = !!(entry && entry.connected)
          return {
            integration: req.integration,
            label: req.label,
            message: req.message,
            met,
          }
        })

        const allMet = results.every((r) => r.met)
        return { success: true, data: { met: allMet, results } }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Extension IPC channels list (for dynamic preload allowlisting) ────────

  ipcMain.handle('extension:get-channels', () => {
    try {
      return { success: true, data: registry.getAllExtensionChannels() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Error recording (from renderer when iframe errors are caught) ─────────

  ipcMain.handle(
    'extension:record-error',
    async (_e, args: { extensionId: string; error: string }) => {
      try {
        const count = registry.recordError(args.extensionId, args.error)

        // Auto-disable after 3 errors in rapid succession
        if (count >= 3) {
          await loader.unload(args.extensionId)
          registry.setEnabled(args.extensionId, false)

          const ext = registry.get(args.extensionId)
          notificationManager.emit({
            type: 'error' as import('../notifications/NotificationManager').NotificationType,
            severity: 'warning' as import('../notifications/NotificationManager').NotificationSeverity,
            title: 'Extension Disabled',
            message: `"${ext?.manifest.name ?? args.extensionId}" has been disabled due to repeated errors. Re-enable it in Configure > Extensions.`,
          })

          return { success: true, disabled: true }
        }

        return { success: true, disabled: false }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )
}
