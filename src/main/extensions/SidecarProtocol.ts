// ── Sidecar IPC Message Protocol ─────────────────────────────────────────────
// Typed JSON message protocol for communication between the Electron main
// process and extension sidecar child processes (spawned via child_process.fork()).

import type { ExtensionManifest } from './types'

// ── Timeouts ─────────────────────────────────────────────────────────────────

/** Maximum milliseconds to wait for a sidecar request to resolve. */
export const SIDECAR_TIMEOUT_MS = 15_000

/** Maximum milliseconds to wait for sidecar initialization (activate) to complete. */
export const SIDECAR_INIT_TIMEOUT_MS = 30_000

// ── Main → Worker ─────────────────────────────────────────────────────────────

/**
 * Discriminated union of all messages the main process sends to a sidecar worker.
 */
export type MainToWorker =
  | {
      /** Tells the worker to require() the extension entry point and call activate(). */
      type: 'init'
      extensionId: string
      extensionPath: string
      mainEntry: string
      manifest: ExtensionManifest
      grantedPermissions: string[]
    }
  | {
      /** Tells the worker to call deactivate() and then exit. */
      type: 'deactivate'
    }
  | {
      /** Forwards an ipcMain.handle call to the sidecar's registered handler. */
      type: 'ipc-call'
      requestId: string
      channel: string
      args: unknown
    }
  | {
      /** Dispatches a session lifecycle hook event to the extension. */
      type: 'event'
      requestId: string
      event: string
      data: unknown
    }
  | {
      /** Delivers the result of a ctx.invoke() call the worker previously requested. */
      type: 'invoke-result'
      requestId: string
      result?: unknown
      error?: string
    }
  | {
      /** Delivers the result of a store operation the worker previously requested. */
      type: 'store-result'
      requestId: string
      result?: unknown
      error?: string
    }

// ── Worker → Main ─────────────────────────────────────────────────────────────

/**
 * Discriminated union of all messages a sidecar worker sends to the main process.
 */
export type WorkerToMain =
  | {
      /** Extension activated successfully; worker is ready to receive calls. */
      type: 'ready'
    }
  | {
      /** Extension deactivated; worker will exit immediately after sending this. */
      type: 'deactivated'
    }
  | {
      /** Error report from the worker. Fatal errors indicate the worker cannot continue. */
      type: 'error'
      message: string
      fatal: boolean
    }
  | {
      /** Tells main to register an ipcMain.handle bridge for the given channel. */
      type: 'register'
      channel: string
    }
  | {
      /** Tells main to remove the ipcMain handler for the given channel. */
      type: 'unregister'
      channel: string
    }
  | {
      /** Response to a previously received 'ipc-call' message. */
      type: 'ipc-result'
      requestId: string
      result?: unknown
      error?: string
    }
  | {
      /** Response to a previously received 'event' dispatch message. */
      type: 'event-result'
      requestId: string
      error?: string
    }
  | {
      /** Worker wants to call a host handler via ctx.invoke(). */
      type: 'invoke'
      requestId: string
      channel: string
      args: unknown[]
    }
  | {
      /** Worker wants to perform a store operation (get, set, delete, keys, or quota check). */
      type: 'store'
      requestId: string
      op: 'get' | 'set' | 'delete' | 'keys' | 'quota' | 'getAll'
      key?: string
      value?: unknown
    }
  | {
      /** Log message to be routed through the main process logger. */
      type: 'log'
      level: 'info' | 'warn' | 'error' | 'debug'
      args: unknown[]
    }

// ── Pending Call Tracker ──────────────────────────────────────────────────────

/**
 * Tracks an in-flight request awaiting a response from the other side of the
 * sidecar channel.  Stored in a Map keyed by requestId.
 */
export interface PendingCall {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}
