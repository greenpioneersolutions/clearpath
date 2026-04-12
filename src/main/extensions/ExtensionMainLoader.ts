import type { IpcMain } from 'electron'
import { log } from '../utils/logger'
import type { ExtensionRegistry } from './ExtensionRegistry'
import type { ExtensionStoreFactory } from './ExtensionStore'
import type { InstalledExtension } from './types'
import { ExtensionSidecarManager } from './ExtensionSidecarManager'

/**
 * The sandboxed context given to each extension's main process entry.
 * Extensions cannot access raw ipcMain, require('fs'), or credentials directly.
 */
export interface ExtensionMainContext {
  extensionId: string
  extensionPath: string

  /** Register an IPC handler. Channel must match the extension's ipcNamespace. */
  registerHandler(channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>): void

  /** Call a host IPC channel (permission-checked). */
  invoke(channel: string, ...args: unknown[]): Promise<unknown>

  /** Scoped persistent storage. */
  store: {
    get<T = unknown>(key: string, defaultValue?: T): T
    set(key: string, value: unknown): void
    delete(key: string): void
    keys(): string[]
  }

  /** Extension-scoped logger (prefixed with extension ID). */
  log: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
    debug(...args: unknown[]): void
  }
}

/**
 * Loads extension main process entries via sidecar child processes.
 * All heavy lifecycle and IPC logic lives in ExtensionSidecarManager;
 * this class is a thin facade that preserves the public API expected by
 * src/main/index.ts and src/main/ipc/extensionHandlers.ts.
 */
export class ExtensionMainLoader {
  private sidecarManager: ExtensionSidecarManager
  private registry: ExtensionRegistry

  constructor(ipcMain: IpcMain, registry: ExtensionRegistry, storeFactory: ExtensionStoreFactory) {
    this.registry = registry
    this.sidecarManager = new ExtensionSidecarManager(ipcMain, registry, storeFactory)
  }

  /**
   * Load and activate all enabled extensions that have a main entry.
   */
  async loadAll(): Promise<void> {
    const enabled = this.registry.listEnabled()
    for (const ext of enabled) {
      if (ext.manifest.main) {
        await this.load(ext)
      }
    }
  }

  /**
   * Load and activate a single extension via its sidecar worker process.
   */
  async load(ext: InstalledExtension): Promise<void> {
    const id = ext.manifest.id
    log.info('[ext-loader] Loading extension "%s" via sidecar', id)
    try {
      await this.sidecarManager.spawn(ext)
      log.info('[ext-loader] Extension "%s" activated via sidecar', id)
    } catch (err) {
      const errorMsg = `Failed to load extension "${id}": ${err}`
      log.error('[ext-loader] %s', errorMsg)
      this.registry.recordError(id, errorMsg)
    }
  }

  /**
   * Deactivate and unload a single extension.
   */
  async unload(extensionId: string): Promise<void> {
    log.info('[ext-loader] Deactivating extension "%s"', extensionId)
    await this.sidecarManager.kill(extensionId)
    log.info('[ext-loader] Extension "%s" unloaded', extensionId)
  }

  /** Deactivate and unload all extensions. */
  async unloadAll(): Promise<void> {
    await this.sidecarManager.killAll()
  }

  /** Check if a specific extension is loaded (i.e. its sidecar is running). */
  isLoaded(extensionId: string): boolean {
    return this.sidecarManager.isRunning(extensionId)
  }

  /**
   * Register a host IPC handler that extensions can invoke through ctx.invoke().
   * Called during app setup to expose host services (e.g., integration:github-repos).
   */
  registerHostHandler(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void {
    this.sidecarManager.registerHostHandler(channel, handler)
  }

  /**
   * Set the webContents reference for forwarding events to the renderer.
   * Called after the main BrowserWindow is created.
   */
  setWebContents(wc: Electron.WebContents): void {
    this.sidecarManager.setWebContents(wc)
  }

  /**
   * Broadcast an event to all loaded extensions that have declared sessionHooks
   * matching the event. Also forwards to the renderer for iframe-based extensions.
   */
  async broadcastEvent(event: string, data: unknown): Promise<void> {
    await this.sidecarManager.broadcastEvent(event, data)
  }
}
