import type { IpcMain } from 'electron'
import { join } from 'path'
import { log } from '../utils/logger'
import type { ExtensionRegistry } from './ExtensionRegistry'
import type { ExtensionStoreFactory } from './ExtensionStore'
import type { InstalledExtension, ExtensionPermission } from './types'

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

/** Lifecycle hooks exported by extension main entries. */
interface ExtensionMainExports {
  activate?(ctx: ExtensionMainContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}

/**
 * Loads extension main process entries, wraps them in sandboxed contexts,
 * and manages activate/deactivate lifecycle.
 */
export class ExtensionMainLoader {
  private ipcMain: IpcMain
  private registry: ExtensionRegistry
  private storeFactory: ExtensionStoreFactory
  private loadedExtensions: Map<string, ExtensionMainExports> = new Map()
  private registeredChannels: Map<string, Set<string>> = new Map()

  /** Host IPC handlers (registered by the app itself) — used for extension invoke() calls. */
  private hostHandlers: Map<string, (...args: unknown[]) => Promise<unknown>> = new Map()

  /** BrowserWindow webContents sender for forwarding events to the renderer. */
  private webContentsSender: Electron.WebContents | null = null

  constructor(ipcMain: IpcMain, registry: ExtensionRegistry, storeFactory: ExtensionStoreFactory) {
    this.ipcMain = ipcMain
    this.registry = registry
    this.storeFactory = storeFactory
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
   * Load and activate a single extension.
   */
  async load(ext: InstalledExtension): Promise<void> {
    const id = ext.manifest.id
    if (this.loadedExtensions.has(id)) {
      log.warn('[ext-loader] Extension "%s" is already loaded', id)
      return
    }

    const mainPath = join(ext.installPath, ext.manifest.main!)
    log.info('[ext-loader] Loading extension "%s" from %s', id, mainPath)

    try {
      // Dynamic require of the extension's main entry
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(mainPath) as ExtensionMainExports

      const ctx = this.createContext(ext)

      if (typeof mod.activate === 'function') {
        await mod.activate(ctx)
      }

      this.loadedExtensions.set(id, mod)
      log.info('[ext-loader] Extension "%s" activated', id)
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
    const mod = this.loadedExtensions.get(extensionId)
    if (!mod) return

    log.info('[ext-loader] Deactivating extension "%s"', extensionId)

    try {
      if (typeof mod.deactivate === 'function') {
        await mod.deactivate()
      }
    } catch (err) {
      log.error('[ext-loader] Error during deactivation of "%s": %s', extensionId, err)
    }

    // Unregister all IPC handlers for this extension
    const channels = this.registeredChannels.get(extensionId)
    if (channels) {
      for (const ch of channels) {
        try {
          this.ipcMain.removeHandler(ch)
        } catch {
          // Handler may already be removed
        }
      }
      this.registeredChannels.delete(extensionId)
    }

    this.loadedExtensions.delete(extensionId)
    log.info('[ext-loader] Extension "%s" unloaded', extensionId)
  }

  /** Deactivate and unload all extensions. */
  async unloadAll(): Promise<void> {
    for (const id of [...this.loadedExtensions.keys()]) {
      await this.unload(id)
    }
  }

  /** Check if a specific extension is loaded. */
  isLoaded(extensionId: string): boolean {
    return this.loadedExtensions.has(extensionId)
  }

  /**
   * Register a host IPC handler that extensions can invoke through ctx.invoke().
   * Called during app setup to expose host services (e.g., integration:github-repos).
   */
  registerHostHandler(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void {
    this.hostHandlers.set(channel, handler)
  }

  /**
   * Set the webContents reference for forwarding events to the renderer.
   * Called after the main BrowserWindow is created.
   */
  setWebContents(wc: Electron.WebContents): void {
    this.webContentsSender = wc
  }

  /**
   * Broadcast an event to all loaded extensions that have declared sessionHooks
   * matching the event. Also forwards to the renderer for iframe-based extensions.
   */
  async broadcastEvent(event: string, data: unknown): Promise<void> {
    // 1. Dispatch to main-process extensions via sessionHooks
    await this.dispatchSessionHooks(event, data)

    // 2. Forward to renderer so ExtensionHost can relay to iframe extensions
    if (this.webContentsSender && !this.webContentsSender.isDestroyed()) {
      this.webContentsSender.send('extension:event', { event, data })
    }
  }

  /**
   * Dispatch a lifecycle event to extensions that declared matching sessionHooks.
   * Calls the extension's registered IPC handler directly.
   */
  private async dispatchSessionHooks(event: string, data: unknown): Promise<void> {
    const enabled = this.registry.listEnabled()
    for (const ext of enabled) {
      const hooks = ext.manifest.contributes?.sessionHooks
      if (!hooks) continue

      for (const hook of hooks) {
        if (hook.event !== event) continue

        // Call the extension's handler directly via ipcMain
        try {
          const channels = this.registeredChannels.get(ext.manifest.id)
          if (channels?.has(hook.handler)) {
            // The handler is registered on ipcMain — invoke it via Electron's internal handler map
            const handlers = (this.ipcMain as unknown as { _invokeHandlers?: Map<string, (...a: unknown[]) => unknown> })._invokeHandlers
            const ipcHandler = handlers?.get(hook.handler)
            if (ipcHandler) {
              const fakeEvent = {} as unknown
              await Promise.resolve(ipcHandler(fakeEvent, data))
              log.debug('[ext-loader] Session hook dispatched: %s → %s', event, hook.handler)
            } else {
              log.warn('[ext-loader] Session hook handler "%s" not found on ipcMain', hook.handler)
            }
          }
        } catch (err) {
          log.error(
            '[ext-loader] Session hook dispatch failed for "%s" handler "%s": %s',
            ext.manifest.id,
            hook.handler,
            err,
          )
          this.registry.recordError(ext.manifest.id, `Session hook "${hook.handler}" failed: ${err}`)
        }
      }
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Create the sandboxed ExtensionMainContext for an extension.
   */
  private createContext(ext: InstalledExtension): ExtensionMainContext {
    const id = ext.manifest.id
    const namespace = ext.manifest.ipcNamespace
    const store = this.storeFactory.getStore(id, ext.manifest.storageQuota)

    const ctx: ExtensionMainContext = {
      extensionId: id,
      extensionPath: ext.installPath,

      registerHandler: (channel: string, handler) => {
        // Enforce namespace prefix
        if (namespace && !channel.startsWith(namespace + ':')) {
          throw new Error(
            `Extension "${id}" attempted to register handler for "${channel}" but ` +
              `all channels must start with "${namespace}:"`,
          )
        }

        // Wrap the handler with error handling
        const wrappedHandler = async (_event: unknown, args: unknown) => {
          try {
            return await handler(_event, args)
          } catch (err) {
            const errorMsg = `Extension handler "${channel}" threw: ${err}`
            log.error('[ext-loader] %s', errorMsg)
            this.registry.recordError(id, errorMsg)
            return { success: false, error: String(err) }
          }
        }

        this.ipcMain.handle(channel, wrappedHandler)

        // Track registered channels for cleanup
        if (!this.registeredChannels.has(id)) {
          this.registeredChannels.set(id, new Set())
        }
        this.registeredChannels.get(id)!.add(channel)

        log.debug('[ext-loader] Extension "%s" registered handler: %s', id, channel)
      },

      invoke: async (channel: string, ...args: unknown[]) => {
        // Check if the extension has permission to call this host channel
        const permitted = this.checkInvokePermission(ext, channel)
        if (!permitted) {
          throw new Error(
            `Extension "${id}" does not have permission to invoke "${channel}"`,
          )
        }

        const handler = this.hostHandlers.get(channel)
        if (!handler) {
          throw new Error(`Host channel "${channel}" is not available for extension invocation`)
        }

        return handler(...args)
      },

      store: {
        get: <T = unknown>(key: string, defaultValue?: T) => {
          const val = store.get<T>(key)
          return val !== undefined ? val : (defaultValue as T)
        },
        set: (key: string, value: unknown) => store.set(key, value),
        delete: (key: string) => store.delete(key),
        keys: () => store.keys(),
      },

      log: {
        info: (...args: unknown[]) => log.info(`[ext:${id}]`, ...args),
        warn: (...args: unknown[]) => log.warn(`[ext:${id}]`, ...args),
        error: (...args: unknown[]) => log.error(`[ext:${id}]`, ...args),
        debug: (...args: unknown[]) => log.debug(`[ext:${id}]`, ...args),
      },
    }

    return ctx
  }

  /**
   * Check if an extension is allowed to invoke a given host channel
   * based on its granted permissions and the channel-to-permission mapping.
   */
  private checkInvokePermission(ext: InstalledExtension, channel: string): boolean {
    // Map host IPC channels to required permissions
    const permissionMap: Record<string, ExtensionPermission> = {
      // GitHub integration
      'integration:github-repos': 'integration:github:read',
      'integration:github-pulls': 'integration:github:read',
      'integration:github-pull-detail': 'integration:github:read',
      'integration:github-issues': 'integration:github:read',
      'integration:github-search': 'integration:github:read',
      'integration:get-github-token': 'integration:github:read',
      // Backstage integration
      'integration:backstage-entities': 'integration:backstage:read',
      'integration:backstage-entity-detail': 'integration:backstage:read',
      'integration:backstage-search': 'integration:backstage:read',
      'integration:backstage-techdocs': 'integration:backstage:read',
      'integration:backstage-templates': 'integration:backstage:read',
      'integration:backstage-kubernetes': 'integration:backstage:read',
      // Session data
      'sessions:list': 'sessions:read',
      'sessions:get-messages': 'sessions:read',
      'sessions:get-active': 'sessions:read',
      'cli:list-sessions': 'sessions:read',
      'cli:get-message-log': 'sessions:read',
      'session-history:list': 'sessions:read',
      // Cost data
      'cost:summary': 'cost:read',
      'cost:list': 'cost:read',
      'cost:get-budget': 'cost:read',
      'cost:by-session': 'cost:read',
      'cost:by-model': 'cost:read',
      'cost:daily-spend': 'cost:read',
      // Feature flags
      'feature-flags:get': 'feature-flags:read',
      'feature-flags:set': 'feature-flags:write',
      'feature-flags:apply-preset': 'feature-flags:write',
      // Local models
      'local-models:detect': 'local-models:access',
      'local-models:chat': 'local-models:access',
      // Notes / memory
      'notes:list': 'notes:read',
      'notes:get': 'notes:read',
      'notes:get-full-content': 'notes:read',
      // Skills
      'skills:list': 'skills:read',
      'skills:get': 'skills:read',
      // Context estimation
      'context:estimate-tokens': 'context:estimate',
      // Notifications
      'extension:notify': 'notifications:emit',
      'notifications:emit': 'notifications:emit',
    }

    // Special case: integration:get-status is allowed if the extension has ANY integration:*:read permission
    if (channel === 'integration:get-status') {
      return this.registry.hasPermission(ext.manifest.id, 'integration:github:read')
        || this.registry.hasPermission(ext.manifest.id, 'integration:backstage:read')
    }

    const requiredPerm = permissionMap[channel]
    if (!requiredPerm) {
      // Channel not mapped — deny by default
      log.warn(
        '[ext-loader] Extension "%s" tried to invoke unmapped channel "%s"',
        ext.manifest.id,
        channel,
      )
      return false
    }

    return this.registry.hasPermission(ext.manifest.id, requiredPerm)
  }
}
