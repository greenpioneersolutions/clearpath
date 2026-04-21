/**
 * SDK Example — Main Process Entry
 *
 * Demonstrates:
 * - activate(ctx) / deactivate() lifecycle
 * - IPC handler registration for all declared channels
 * - ctx.store usage for persistent key-value data
 * - ctx.invoke() for calling host APIs
 * - ctx.log for structured logging
 * - Session hook handlers (session:started, session:stopped, turn:started, turn:ended)
 * - Context provider handler for AI context injection
 * - Health endpoint for uptime monitoring
 */

import type { ExtensionMainContext } from '@clearpath/extension-sdk'

// ── Types ────────────────────────────────────────────────────────────────────

interface Config {
  greeting: string
  enableDebugLogging: boolean
  maxEventLogSize: number
}

interface EventLogEntry {
  event: string
  timestamp: number
  data?: unknown
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Config = {
  greeting: 'Hello from SDK Example!',
  enableDebugLogging: false,
  maxEventLogSize: 100,
}

// ── State ────────────────────────────────────────────────────────────────────

let activatedAt: number | null = null
let ctx: ExtensionMainContext | null = null
const registeredChannels: Set<string> = new Set()

// ── Helpers ──────────────────────────────────────────────────────────────────

function appendEventLog(entry: EventLogEntry): void {
  if (!ctx) return
  const config = ctx.store.get<Config>('config', DEFAULT_CONFIG) ?? DEFAULT_CONFIG
  const log = ctx.store.get<EventLogEntry[]>('eventLog', []) ?? []
  log.push(entry)

  // Trim to max size
  while (log.length > config.maxEventLogSize) {
    log.shift()
  }

  ctx.store.set('eventLog', log)
}

// ── Extension Lifecycle ──────────────────────────────────────────────────────

/**
 * Called by the host when the extension is loaded.
 * Registers all IPC handlers and initializes storage defaults.
 */
export async function activate(context: ExtensionMainContext): Promise<void> {
  ctx = context
  activatedAt = Date.now()
  registeredChannels.clear()

  // Wrap registerHandler to track channel names
  const origRegister = ctx.registerHandler.bind(ctx)
  ctx.registerHandler = (channel: string, handler: Parameters<ExtensionMainContext['registerHandler']>[1]) => {
    registeredChannels.add(channel)
    return origRegister(channel, handler)
  }

  ctx.log.info('SDK Example extension activating...')

  // Initialize default storage values if not already set
  if (!ctx.store.get('config')) {
    ctx.store.set('config', DEFAULT_CONFIG)
  }
  if (!ctx.store.get('eventLog')) {
    ctx.store.set('eventLog', [])
  }
  if (!ctx.store.get('counter')) {
    ctx.store.set('counter', 0)
  }
  if (!ctx.store.get('demoData')) {
    ctx.store.set('demoData', {
      items: ['Alpha', 'Bravo', 'Charlie'],
      createdAt: Date.now(),
    })
  }

  // ── 1. Get config ────────────────────────────────────────────────────────

  ctx.registerHandler('sdk-example:get-config', async () => {
    try {
      const config = ctx!.store.get<Config>('config', DEFAULT_CONFIG)
      return { success: true, data: config }
    } catch (err) {
      ctx!.log.error('get-config failed: %s', (err as Error).message)
      return { success: false, error: (err as Error).message }
    }
  })

  // ── 2. Set config ────────────────────────────────────────────────────────

  ctx.registerHandler('sdk-example:set-config', async (_e, args) => {
    try {
      const current = ctx!.store.get<Config>('config', DEFAULT_CONFIG) ?? DEFAULT_CONFIG
      const merged = { ...current, ...(args as Partial<Config>) }
      ctx!.store.set('config', merged)
      ctx!.log.info('Config updated: %o', merged)
      return { success: true, data: merged }
    } catch (err) {
      ctx!.log.error('set-config failed: %s', (err as Error).message)
      return { success: false, error: (err as Error).message }
    }
  })

  // ── 3. Get demo data ─────────────────────────────────────────────────────

  ctx.registerHandler('sdk-example:get-demo-data', async () => {
    try {
      const eventLog = ctx!.store.get<EventLogEntry[]>('eventLog', []) ?? []
      const sessionCount = eventLog.filter(e => e.event === 'session:started').length
      const turnCount = eventLog.filter(e => e.event === 'turn:started').length
      return {
        success: true,
        data: {
          extensionId: ctx!.extensionId,
          sessionCount,
          turnCount,
          uptime: activatedAt ? Date.now() - activatedAt : 0,
        },
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── 4. Get event log ─────────────────────────────────────────────────────

  ctx.registerHandler('sdk-example:get-event-log', async () => {
    try {
      const log = ctx!.store.get<EventLogEntry[]>('eventLog', []) ?? []
      return { success: true, data: log }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── 5. Clear event log ───────────────────────────────────────────────────

  ctx.registerHandler('sdk-example:clear-event-log', async () => {
    try {
      ctx!.store.set('eventLog', [])
      ctx!.log.info('Event log cleared')
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── 6. Increment counter ─────────────────────────────────────────────────

  ctx.registerHandler('sdk-example:increment-counter', async () => {
    try {
      const current = ctx!.store.get<number>('counter', 0) ?? 0
      const next = current + 1
      ctx!.store.set('counter', next)
      return { success: true, data: { counter: next } }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── 7. Get storage stats ─────────────────────────────────────────────────

  ctx.registerHandler('sdk-example:get-storage-stats', async () => {
    try {
      const keys = ctx!.store.keys()
      const stats = {
        keyCount: keys.length,
        keys,
        counter: ctx!.store.get<number>('counter', 0),
        activatedAt,
        uptimeMs: activatedAt ? Date.now() - activatedAt : 0,
      }
      return { success: true, data: stats }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── 8-11. Session lifecycle hooks ────────────────────────────────────────

  ctx.registerHandler('sdk-example:on-session-started', async (_e, args) => {
    ctx!.log.info('Session started: %o', args)
    appendEventLog({ event: 'session:started', timestamp: Date.now(), data: args })
    return { success: true, data: null }
  })

  ctx.registerHandler('sdk-example:on-session-stopped', async (_e, args) => {
    ctx!.log.info('Session stopped: %o', args)
    appendEventLog({ event: 'session:stopped', timestamp: Date.now(), data: args })
    return { success: true, data: null }
  })

  ctx.registerHandler('sdk-example:on-turn-started', async (_e, args) => {
    if (ctx!.store.get<Config>('config', DEFAULT_CONFIG)?.enableDebugLogging) {
      ctx!.log.debug('Turn started: %o', args)
    }
    appendEventLog({ event: 'turn:started', timestamp: Date.now(), data: args })
    return { success: true, data: null }
  })

  ctx.registerHandler('sdk-example:on-turn-ended', async (_e, args) => {
    if (ctx!.store.get<Config>('config', DEFAULT_CONFIG)?.enableDebugLogging) {
      ctx!.log.debug('Turn ended: %o', args)
    }
    appendEventLog({ event: 'turn:ended', timestamp: Date.now(), data: args })
    return { success: true, data: null }
  })

  // ── 12. Context provider ─────────────────────────────────────────────────

  ctx.registerHandler('sdk-example:ctx-demo', async (_e, args) => {
    try {
      const params = args as { topic?: string }
      const config = ctx!.store.get<Config>('config', DEFAULT_CONFIG) ?? DEFAULT_CONFIG
      const eventLog = ctx!.store.get<EventLogEntry[]>('eventLog', []) ?? []
      const counter = ctx!.store.get<number>('counter', 0) ?? 0

      const sessionEvents = eventLog.filter(
        (e) => e.event === 'session:started' || e.event === 'session:stopped',
      )
      const turnEvents = eventLog.filter(
        (e) => e.event === 'turn:started' || e.event === 'turn:ended',
      )

      const lines: string[] = [
        '## SDK Example Extension Context',
        '',
        `**Greeting**: ${config.greeting}`,
        `**Counter**: ${counter}`,
        `**Total Events Logged**: ${eventLog.length}`,
        `**Sessions Observed**: ${sessionEvents.length}`,
        `**Turns Observed**: ${turnEvents.length}`,
        `**Activated At**: ${activatedAt ? new Date(activatedAt).toISOString() : 'N/A'}`,
        `**Uptime**: ${activatedAt ? Math.round((Date.now() - activatedAt) / 1000) : 0}s`,
      ]

      if (params.topic) {
        lines.push('', `### Requested Topic: ${params.topic}`)
        lines.push(
          `This context provider received the topic "${params.topic}" as a user-supplied parameter.`,
        )
      }

      if (eventLog.length > 0) {
        lines.push('', '### Recent Events')
        for (const entry of eventLog.slice(-5)) {
          lines.push(`- \`${entry.event}\` at ${new Date(entry.timestamp).toISOString()}`)
        }
      }

      const context = lines.join('\n')
      return {
        success: true,
        context,
        tokenEstimate: Math.ceil(context.length / 4),
        metadata: { truncated: false, eventCount: eventLog.length, topic: params.topic ?? null },
      }
    } catch (err) {
      ctx!.log.error('ctx-demo failed: %s', (err as Error).message)
      return { success: false, error: (err as Error).message }
    }
  })

  // ── 13. Health check ─────────────────────────────────────────────────────

  ctx.registerHandler('sdk-example:health', async () => {
    return {
      success: true,
      data: {
        status: 'healthy',
        handlers: [...registeredChannels],
        extensionId: ctx!.extensionId,
        extensionPath: ctx!.extensionPath,
        activatedAt,
        uptimeMs: activatedAt ? Date.now() - activatedAt : 0,
        storeKeys: ctx!.store.keys().length,
      },
    }
  })

  // ── Demonstrate ctx.invoke() — call a host API ───────────────────────────

  try {
    // Attempt to read a host setting (may fail silently if the channel doesn't exist)
    const appVersion = await ctx.invoke('app:get-version').catch(() => 'unknown')
    ctx.log.info('Host app version: %s', appVersion)
  } catch {
    ctx.log.debug('Could not read host app version (expected during testing)')
  }

  ctx.log.info('SDK Example extension activated — 13 handlers registered')
}

/**
 * Called by the host when the extension is being unloaded.
 * Clean up any resources held by the main process.
 */
export function deactivate(): void {
  if (ctx) {
    ctx.log.info(
      'SDK Example extension deactivating after %dms',
      activatedAt ? Date.now() - activatedAt : 0,
    )
  }
  activatedAt = null
  ctx = null
  registeredChannels.clear()
}

// Note: esbuild with format:"cjs" converts the ES named exports above
// into module.exports = { activate, deactivate } automatically.
