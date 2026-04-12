// ── Sidecar Worker Entry Point ────────────────────────────────────────────────
// Runs as a standalone Node.js process spawned via child_process.fork().
// NO Electron imports are allowed here — this file must be Electron-free.
// All communication with the main process goes through process.send() / process.on('message').

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { MainToWorker, WorkerToMain } from './SidecarProtocol'
import type { ExtensionManifest } from './types'

// ── Typed send helper ─────────────────────────────────────────────────────────

function send(msg: WorkerToMain): void {
  process.send?.(msg)
}

// ── Worker state ──────────────────────────────────────────────────────────────

/** Handlers registered by the extension via ctx.registerHandler(). */
const handlers = new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()

/** Pending ctx.invoke() calls waiting for invoke-result from main. */
const pendingInvokes = new Map<string, { resolve: (v: unknown) => void; reject: (r: unknown) => void }>()

/** Pending store operation calls waiting for store-result from main. */
const pendingStores = new Map<string, { resolve: (v: unknown) => void; reject: (r: unknown) => void }>()

/** The loaded extension module — kept so deactivate() can be called later. */
let mod: { activate?: (ctx: ExtensionMainContext) => Promise<void> | void; deactivate?: () => Promise<void> | void } | null = null

/** Local store cache — initialized during activate, kept in sync with main. */
let storeCache: Record<string, unknown> = {}

/** The extension manifest from the init message — used for namespace validation and hook lookups. */
let manifest: ExtensionManifest | null = null

// ── Context interface (sync store variant backed by local cache) ──────────────

/**
 * The proxy context given to extension main entries running in the sidecar.
 * Store methods are synchronous — reads come from a local cache pre-loaded
 * during init, and writes update the cache immediately then fire-and-forget
 * the write to the main process.
 */
interface ExtensionMainContext {
  extensionId: string
  extensionPath: string
  registerHandler(channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>): void
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  store: {
    get<T = unknown>(key: string, defaultValue?: T): T
    set(key: string, value: unknown): void
    delete(key: string): void
    keys(): string[]
  }
  log: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
    debug(...args: unknown[]): void
  }
}

// ── Context factory ───────────────────────────────────────────────────────────

function createContext(extensionId: string, extensionPath: string, mf: ExtensionManifest): ExtensionMainContext {
  const namespace = mf.ipcNamespace

  return {
    extensionId,
    extensionPath,

    registerHandler(channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>): void {
      // Validate that the channel starts with the extension's ipcNamespace prefix
      if (namespace && !channel.startsWith(namespace + ':')) {
        throw new Error(
          `Extension "${extensionId}" attempted to register handler for "${channel}" but ` +
            `all channels must start with "${namespace}:"`,
        )
      }

      // Store locally
      handlers.set(channel, handler)

      // Inform main to set up ipcMain.handle bridge for this channel
      send({ type: 'register', channel })
    },

    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      return new Promise<unknown>((resolve, reject) => {
        const requestId = randomUUID()
        pendingInvokes.set(requestId, { resolve, reject })
        send({ type: 'invoke', requestId, channel, args })
      })
    },

    store: {
      get<T = unknown>(key: string, defaultValue?: T): T {
        const val = storeCache[key]
        return val !== undefined ? (val as T) : (defaultValue as T)
      },

      set(key: string, value: unknown): void {
        storeCache[key] = value
        // Fire-and-forget write to main
        send({ type: 'store', requestId: randomUUID(), op: 'set', key, value })
      },

      delete(key: string): void {
        delete storeCache[key]
        // Fire-and-forget delete to main
        send({ type: 'store', requestId: randomUUID(), op: 'delete', key })
      },

      keys(): string[] {
        return Object.keys(storeCache)
      },
    },

    log: {
      info(...args: unknown[]): void {
        send({ type: 'log', level: 'info', args })
      },
      warn(...args: unknown[]): void {
        send({ type: 'log', level: 'warn', args })
      },
      error(...args: unknown[]): void {
        send({ type: 'log', level: 'error', args })
      },
      debug(...args: unknown[]): void {
        send({ type: 'log', level: 'debug', args })
      },
    },
  }
}

// ── Message dispatcher ────────────────────────────────────────────────────────

async function handleMessage(raw: unknown): Promise<void> {
  const msg = raw as MainToWorker

  switch (msg.type) {
    // ── Initialization ───────────────────────────────────────────────────────
    case 'init': {
      manifest = msg.manifest

      const entryPath = join(msg.extensionPath, msg.mainEntry)

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        mod = require(entryPath) as typeof mod

        const ctx = createContext(msg.extensionId, msg.extensionPath, msg.manifest)

        // Pre-load store data into local cache for synchronous access
        const cacheRequestId = randomUUID()
        const cachePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
          pendingStores.set(cacheRequestId, {
            resolve: (v: unknown) => resolve(v as Record<string, unknown>),
            reject,
          })
        })
        send({ type: 'store', requestId: cacheRequestId, op: 'getAll' })
        storeCache = await cachePromise

        if (typeof mod?.activate === 'function') {
          await mod.activate(ctx)
        }

        send({ type: 'ready' })
      } catch (err) {
        send({ type: 'error', message: String(err), fatal: false })
        process.exit(1)
      }
      break
    }

    // ── IPC call from main forwarded to extension handler ────────────────────
    case 'ipc-call': {
      const handler = handlers.get(msg.channel)

      if (!handler) {
        send({
          type: 'ipc-result',
          requestId: msg.requestId,
          error: `Handler not found for channel "${msg.channel}"`,
        })
        break
      }

      try {
        const result = await handler({}, msg.args)
        send({ type: 'ipc-result', requestId: msg.requestId, result })
      } catch (err) {
        send({ type: 'ipc-result', requestId: msg.requestId, error: String(err) })
      }
      break
    }

    // ── Session lifecycle event dispatch ─────────────────────────────────────
    case 'event': {
      const sessionHooks = manifest?.contributes?.sessionHooks ?? []
      const matchingHooks = sessionHooks.filter((hook) => hook.event === msg.event)

      if (matchingHooks.length === 0) {
        send({ type: 'event-result', requestId: msg.requestId })
        break
      }

      try {
        for (const hook of matchingHooks) {
          const hookHandler = handlers.get(hook.handler)
          if (hookHandler) {
            await hookHandler({}, msg.data)
          }
        }
        send({ type: 'event-result', requestId: msg.requestId })
      } catch (err) {
        send({ type: 'event-result', requestId: msg.requestId, error: String(err) })
      }
      break
    }

    // ── Result of a ctx.invoke() call that the worker requested ──────────────
    case 'invoke-result': {
      const pending = pendingInvokes.get(msg.requestId)
      if (!pending) break

      pendingInvokes.delete(msg.requestId)

      if (msg.error !== undefined) {
        pending.reject(new Error(msg.error))
      } else {
        pending.resolve(msg.result)
      }
      break
    }

    // ── Result of a store operation the worker requested ─────────────────────
    case 'store-result': {
      const pending = pendingStores.get(msg.requestId)
      if (!pending) break

      pendingStores.delete(msg.requestId)

      if (msg.error !== undefined) {
        pending.reject(new Error(msg.error))
      } else {
        pending.resolve(msg.result)
      }
      break
    }

    // ── Deactivate and exit ──────────────────────────────────────────────────
    case 'deactivate': {
      try {
        if (typeof mod?.deactivate === 'function') {
          await mod.deactivate()
        }
      } catch {
        // Swallow deactivate errors — we are exiting regardless
      }

      send({ type: 'deactivated' })
      process.exit(0)
    }
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Only activate side-effects when running as a forked child process.
// When loaded by vitest or other tooling, process.send is undefined.

if (typeof process.send === 'function') {
  process.on('uncaughtException', (err: Error) => {
    send({ type: 'error', message: `Uncaught exception: ${err.message}`, fatal: true })
    process.exit(1)
  })

  process.on('unhandledRejection', (reason: unknown) => {
    send({ type: 'error', message: `Unhandled rejection: ${reason}`, fatal: false })
  })

  process.on('message', (msg: unknown) => {
    handleMessage(msg).catch((err: unknown) => {
      send({ type: 'error', message: `Message handler failed: ${err}`, fatal: false })
    })
  })
}
