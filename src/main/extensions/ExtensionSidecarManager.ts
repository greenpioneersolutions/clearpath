import { fork, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { log } from '../utils/logger'
import type { ExtensionRegistry } from './ExtensionRegistry'
import type { ExtensionStoreFactory } from './ExtensionStore'
import type { InstalledExtension, ExtensionPermission } from './types'
import type { MainToWorker, WorkerToMain, PendingCall } from './SidecarProtocol'
import { SIDECAR_TIMEOUT_MS, SIDECAR_INIT_TIMEOUT_MS } from './SidecarProtocol'

// ── Internal sidecar entry ────────────────────────────────────────────────────

interface SidecarEntry {
  process: ChildProcess
  extensionId: string
  /** IPC channels the sidecar has registered via 'register' messages. */
  channels: Set<string>
  /** In-flight requests awaiting a response (ipc-result, event-result, or init). */
  pendingDispatches: Map<string, PendingCall>
}

// ── ExtensionSidecarManager ───────────────────────────────────────────────────

/**
 * Manages per-extension child processes (sidecars) and bridges IPC between
 * the Electron main process and each sidecar worker.
 *
 * Each enabled extension with a `main` entry gets its own forked Node.js
 * process (sidecar).  The sidecar runs the extension's activate/deactivate
 * lifecycle and responds to IPC calls forwarded from the renderer or from
 * internal host services.
 */
export class ExtensionSidecarManager {
  private sidecars: Map<string, SidecarEntry> = new Map()

  /**
   * Host IPC handlers registered by the app.  Extensions may call these via
   * ctx.invoke() — permission-checked in checkInvokePermission().
   */
  private hostHandlers: Map<string, (...args: unknown[]) => Promise<unknown>> = new Map()

  /** Reference to the main BrowserWindow webContents for forwarding events. */
  private webContentsSender: Electron.WebContents | null = null

  private ipcMain: IpcMain
  private registry: ExtensionRegistry
  private storeFactory: ExtensionStoreFactory

  constructor(ipcMain: IpcMain, registry: ExtensionRegistry, storeFactory: ExtensionStoreFactory) {
    this.ipcMain = ipcMain
    this.registry = registry
    this.storeFactory = storeFactory
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a host IPC handler that extensions can reach via ctx.invoke().
   * Called during app setup to expose host services.
   */
  registerHostHandler(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void {
    this.hostHandlers.set(channel, handler)
  }

  /**
   * Set the webContents reference for forwarding events to the renderer.
   * Call this after the main BrowserWindow is created.
   */
  setWebContents(wc: Electron.WebContents): void {
    this.webContentsSender = wc
  }

  /**
   * Spawn a sidecar worker process for an extension and wait for it to finish
   * initialising (up to SIDECAR_INIT_TIMEOUT_MS).
   */
  async spawn(ext: InstalledExtension): Promise<void> {
    const extensionId = ext.manifest.id

    if (this.sidecars.has(extensionId)) {
      log.warn('[sidecar] Extension "%s" is already running — ignoring spawn request', extensionId)
      return
    }

    const workerPath = join(__dirname, 'sidecar-worker.js')
    log.info('[sidecar] Spawning sidecar for "%s" from %s', extensionId, workerPath)

    const child = fork(workerPath, [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    // Pipe stdout / stderr through the main logger
    child.stdout?.on('data', (chunk: Buffer) => {
      log.debug('[sidecar:%s] stdout: %s', extensionId, chunk.toString().trimEnd())
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      log.warn('[sidecar:%s] stderr: %s', extensionId, chunk.toString().trimEnd())
    })

    const entry: SidecarEntry = {
      process: child,
      extensionId,
      channels: new Set(),
      pendingDispatches: new Map(),
    }
    this.sidecars.set(extensionId, entry)

    // Wire message and exit handlers before sending init so we never miss a
    // message that arrives synchronously after child.send().
    child.on('message', (msg: unknown) => this.handleWorkerMessage(extensionId, msg))
    child.on('exit', (code: number | null) => this.handleWorkerExit(extensionId, code))

    // Send the init message to the worker
    const initMsg: MainToWorker = {
      type: 'init',
      extensionId: ext.manifest.id,
      extensionPath: ext.installPath,
      mainEntry: ext.manifest.main!,
      manifest: ext.manifest,
      grantedPermissions: ext.grantedPermissions as string[],
    }
    child.send(initMsg)

    // Wait for the 'ready' message (resolved inside handleWorkerMessage)
    const initPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Sidecar init timeout for "${extensionId}"`))
      }, SIDECAR_INIT_TIMEOUT_MS)

      entry.pendingDispatches.set('__init__', {
        resolve: () => {
          clearTimeout(timeout)
          resolve()
        },
        reject: (err: unknown) => {
          clearTimeout(timeout)
          reject(err)
        },
        timeout,
      })
    })

    try {
      await initPromise
      log.info('[sidecar] Extension "%s" sidecar ready', extensionId)
    } catch (err) {
      this.handleSpawnFailure(extensionId, err)
      throw err
    }
  }

  /**
   * Gracefully deactivate and kill the sidecar for an extension.
   * Waits up to 5 seconds for a clean shutdown before SIGKILL-ing.
   */
  async kill(extensionId: string): Promise<void> {
    const entry = this.sidecars.get(extensionId)
    if (!entry) return

    log.info('[sidecar] Killing sidecar for "%s"', extensionId)

    // Ask the worker to deactivate cleanly
    try {
      entry.process.send({ type: 'deactivate' } as MainToWorker)
    } catch {
      // Process may already be dead; proceed to force-kill
    }

    // Wait up to 5 s for a 'deactivated' message or process exit
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        log.warn('[sidecar] Graceful shutdown timeout for "%s" — sending SIGKILL', extensionId)
        try {
          entry.process.kill('SIGKILL')
        } catch {
          // Already dead
        }
        resolve()
      }, 5_000)

      const deactivatedPending: PendingCall = {
        resolve: () => {
          clearTimeout(timeout)
          resolve()
        },
        reject: () => {
          clearTimeout(timeout)
          resolve()
        },
        timeout,
      }
      entry.pendingDispatches.set('__deactivate__', deactivatedPending)

      // Also resolve if the process exits on its own
      entry.process.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    this.cleanupEntry(extensionId, 'Extension killed')
  }

  /** Kill all running sidecars. */
  async killAll(): Promise<void> {
    await Promise.allSettled([...this.sidecars.keys()].map((id) => this.kill(id)))
  }

  /** Return true if a sidecar is running for the given extension. */
  isRunning(extensionId: string): boolean {
    const entry = this.sidecars.get(extensionId)
    if (!entry) return false
    // exitCode is null while the process is still alive
    return entry.process.exitCode === null && !entry.process.killed
  }

  /**
   * Broadcast a lifecycle event to every sidecar whose extension declares a
   * matching sessionHook, and forward the event to the renderer as well.
   */
  async broadcastEvent(event: string, data: unknown): Promise<void> {
    const dispatchPromises: Promise<unknown>[] = []

    for (const [, entry] of this.sidecars) {
      const ext = this.registry.get(entry.extensionId)
      if (!ext) continue

      const hooks = ext.manifest.contributes?.sessionHooks
      if (!hooks) continue

      const matchingHooks = hooks.filter((h) => h.event === event)
      if (matchingHooks.length === 0) continue

      for (const hook of matchingHooks) {
        const requestId = randomUUID()
        const dispatchPromise = new Promise<unknown>((resolve, reject) => {
          const timeout = setTimeout(() => {
            entry.pendingDispatches.delete(requestId)
            reject(new Error(`Event dispatch timeout for "${event}" in extension "${entry.extensionId}"`))
          }, SIDECAR_TIMEOUT_MS)

          entry.pendingDispatches.set(requestId, { resolve, reject, timeout })
        })

        try {
          entry.process.send({
            type: 'event',
            requestId,
            event: hook.handler,
            data,
          } as MainToWorker)
          dispatchPromises.push(dispatchPromise)
        } catch (err) {
          log.error('[sidecar] Failed to send event "%s" to "%s": %s', event, entry.extensionId, err)
          entry.pendingDispatches.delete(requestId)
        }
      }
    }

    // Forward to the renderer so ExtensionHost can relay to iframe extensions
    if (this.webContentsSender && !this.webContentsSender.isDestroyed()) {
      this.webContentsSender.send('extension:event', { event, data })
    }

    // Await all dispatches but do not throw — individual failures are logged
    const results = await Promise.allSettled(dispatchPromises)
    for (const result of results) {
      if (result.status === 'rejected') {
        log.warn('[sidecar] Event dispatch failed: %s', result.reason)
      }
    }
  }

  // ── Message handling ───────────────────────────────────────────────────────

  private handleWorkerMessage(extensionId: string, raw: unknown): void {
    const entry = this.sidecars.get(extensionId)
    if (!entry) return

    // Basic runtime type guard — all messages must be objects with a string 'type'
    if (!raw || typeof raw !== 'object' || typeof (raw as Record<string, unknown>)['type'] !== 'string') {
      log.warn('[sidecar] Received malformed message from "%s": %j', extensionId, raw)
      return
    }

    const msg = raw as WorkerToMain

    switch (msg.type) {
      case 'ready': {
        const pending = entry.pendingDispatches.get('__init__')
        if (pending) {
          entry.pendingDispatches.delete('__init__')
          pending.resolve(undefined)
        }
        break
      }

      case 'register': {
        const channel = msg.channel

        // Create a bridge handler on ipcMain that forwards calls to the sidecar
        this.ipcMain.handle(channel, async (_event: unknown, args: unknown) => {
          const currentEntry = this.sidecars.get(extensionId)
          if (!currentEntry) {
            return { success: false, error: 'Extension not running' }
          }

          const requestId = randomUUID()
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              currentEntry.pendingDispatches.delete(requestId)
              reject(new Error(`Sidecar IPC timeout for channel "${channel}"`))
            }, SIDECAR_TIMEOUT_MS)

            currentEntry.pendingDispatches.set(requestId, { resolve, reject, timeout })
            currentEntry.process.send({
              type: 'ipc-call',
              requestId,
              channel,
              args,
            } as MainToWorker)
          })
        })

        entry.channels.add(channel)
        log.debug('[sidecar] Extension "%s" registered channel: %s', extensionId, channel)
        break
      }

      case 'unregister': {
        const channel = msg.channel
        try {
          this.ipcMain.removeHandler(channel)
        } catch {
          // Handler may already be removed
        }
        entry.channels.delete(channel)
        log.debug('[sidecar] Extension "%s" unregistered channel: %s', extensionId, channel)
        break
      }

      case 'ipc-result': {
        const pending = entry.pendingDispatches.get(msg.requestId)
        if (!pending) break
        clearTimeout(pending.timeout)
        entry.pendingDispatches.delete(msg.requestId)
        if (msg.error !== undefined) {
          pending.reject(new Error(msg.error))
        } else {
          pending.resolve(msg.result)
        }
        break
      }

      case 'event-result': {
        const pending = entry.pendingDispatches.get(msg.requestId)
        if (!pending) break
        clearTimeout(pending.timeout)
        entry.pendingDispatches.delete(msg.requestId)
        if (msg.error !== undefined) {
          pending.reject(new Error(msg.error))
        } else {
          pending.resolve(undefined)
        }
        break
      }

      case 'invoke': {
        // The worker is calling ctx.invoke() — permission-check and dispatch
        const { requestId, channel, args } = msg
        const allowed = this.checkInvokePermission(extensionId, channel)

        if (!allowed) {
          log.warn('[sidecar] Permission denied: "%s" tried to invoke "%s"', extensionId, channel)
          entry.process.send({
            type: 'invoke-result',
            requestId,
            error: 'Permission denied',
          } as MainToWorker)
          break
        }

        ;(async () => {
          try {
            const handler = this.hostHandlers.get(channel)
            if (!handler) {
              throw new Error(`Host channel "${channel}" not available`)
            }
            const result = await handler(...(args as unknown[]))
            entry.process.send({ type: 'invoke-result', requestId, result } as MainToWorker)
          } catch (err) {
            entry.process.send({
              type: 'invoke-result',
              requestId,
              error: String(err),
            } as MainToWorker)
          }
        })()
        break
      }

      case 'store': {
        // The worker is performing a store operation — execute synchronously on the main side
        const { requestId, op, key, value } = msg
        const store = this.storeFactory.getStore(extensionId)
        try {
          let result: unknown
          switch (op) {
            case 'get':
              result = store.get(key!)
              break
            case 'set':
              store.set(key!, value)
              break
            case 'delete':
              store.delete(key!)
              break
            case 'keys':
              result = store.keys()
              break
            case 'quota':
              result = store.getQuota()
              break
            case 'getAll': {
              // Return the entire store data object for local caching
              const allKeys = store.keys()
              const data: Record<string, unknown> = {}
              for (const k of allKeys) {
                data[k] = store.get(k)
              }
              result = data
              break
            }
          }
          entry.process.send({ type: 'store-result', requestId, result } as MainToWorker)
        } catch (err) {
          entry.process.send({
            type: 'store-result',
            requestId,
            error: String(err),
          } as MainToWorker)
        }
        break
      }

      case 'log': {
        const prefix = `[ext:${extensionId}]`
        log[msg.level](prefix, ...(msg.args as unknown[]))
        break
      }

      case 'error': {
        log.error(
          '[sidecar] Error from "%s": %s (fatal=%s)',
          extensionId,
          msg.message,
          msg.fatal,
        )
        const errorCount = this.registry.recordError(extensionId, msg.message)

        if (msg.fatal || errorCount >= 3) {
          if (errorCount >= 3) {
            this.registry.setEnabled(extensionId, false)
            log.warn(
              '[sidecar] Extension "%s" auto-disabled after %d errors',
              extensionId,
              errorCount,
            )
          }
          this.kill(extensionId).catch(() => {})
        }
        break
      }

      case 'deactivated': {
        // The worker finished its clean shutdown — resolve any pending kill waiter
        const pending = entry.pendingDispatches.get('__deactivate__')
        if (pending) {
          clearTimeout(pending.timeout)
          entry.pendingDispatches.delete('__deactivate__')
          pending.resolve(undefined)
        }
        log.info('[sidecar] Extension "%s" deactivated cleanly', extensionId)
        break
      }

      default: {
        log.warn('[sidecar] Unknown message type from "%s": %j', extensionId, raw)
        break
      }
    }
  }

  private handleWorkerExit(extensionId: string, code: number | null): void {
    const entry = this.sidecars.get(extensionId)
    if (!entry) return

    // If a kill was in progress, the exit is expected — the kill() method will
    // call cleanupEntry() itself once the deactivated message arrives or the
    // 5 s grace period expires.  But if we got here without a pending
    // __deactivate__ dispatch, the exit was unexpected.
    if (!entry.pendingDispatches.has('__deactivate__')) {
      log.error(
        '[sidecar] Extension "%s" process exited unexpectedly (code=%s)',
        extensionId,
        code,
      )
      this.registry.recordError(extensionId, `Sidecar process exited (code=${code})`)
    }

    this.cleanupEntry(extensionId, `Sidecar process exited (code=${code})`)
  }

  private handleSpawnFailure(extensionId: string, error: unknown): void {
    log.error('[sidecar] Failed to spawn sidecar for "%s": %s', extensionId, error)
    this.registry.recordError(extensionId, `Sidecar spawn failure: ${error}`)
    this.cleanupEntry(extensionId, `Sidecar spawn failure: ${error}`)
  }

  // ── Cleanup helper ─────────────────────────────────────────────────────────

  /**
   * Tear down a sidecar entry: unregister all its IPC channels, reject any
   * in-flight pending dispatches, and remove the entry from the map.
   */
  private cleanupEntry(extensionId: string, rejectReason: string): void {
    const entry = this.sidecars.get(extensionId)
    if (!entry) return

    // Unregister all IPC handlers this sidecar registered
    for (const channel of entry.channels) {
      try {
        this.ipcMain.removeHandler(channel)
      } catch {
        // May already be removed
      }
    }
    entry.channels.clear()

    // Reject all pending dispatches
    for (const [id, pending] of entry.pendingDispatches) {
      // Skip sentinel keys that are already resolved/rejected by their own flow
      clearTimeout(pending.timeout)
      pending.reject(new Error(rejectReason))
      entry.pendingDispatches.delete(id)
    }

    this.sidecars.delete(extensionId)
    log.info('[sidecar] Sidecar entry removed for "%s"', extensionId)
  }

  // ── Permission checking ────────────────────────────────────────────────────

  /**
   * Check whether an extension is permitted to invoke a given host channel.
   * Maps each host IPC channel to the ExtensionPermission it requires, then
   * delegates to the registry.
   */
  private checkInvokePermission(extensionId: string, channel: string): boolean {
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

    // Special case: integration:get-status is allowed if the extension has ANY
    // integration:*:read permission (does not need all of them).
    if (channel === 'integration:get-status') {
      return (
        this.registry.hasPermission(extensionId, 'integration:github:read') ||
        this.registry.hasPermission(extensionId, 'integration:backstage:read')
      )
    }

    const requiredPerm = permissionMap[channel]
    if (!requiredPerm) {
      log.warn(
        '[sidecar] Extension "%s" tried to invoke unmapped channel "%s"',
        extensionId,
        channel,
      )
      return false
    }

    return this.registry.hasPermission(extensionId, requiredPerm)
  }
}
