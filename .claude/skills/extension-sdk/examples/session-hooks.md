# Session Hooks Example

Session hooks allow extensions to react to CLI session lifecycle events: session starts/stops and turn starts/ends. This is useful for tracking usage, triggering actions, or collecting analytics.

## Manifest Configuration

```json
{
  "id": "com.example.session-tracker",
  "name": "Session Tracker",
  "version": "1.0.0",
  "description": "Tracks session duration and turn counts with notifications",
  "author": "Your Name",
  "main": "dist/main.cjs",
  "permissions": [
    "storage",
    "sessions:lifecycle",
    "notifications:emit"
  ],
  "ipcNamespace": "tracker",
  "ipcChannels": [
    "tracker:on-session-started",
    "tracker:on-session-stopped",
    "tracker:on-turn-started",
    "tracker:on-turn-ended",
    "tracker:get-stats"
  ],
  "contributes": {
    "sessionHooks": [
      {
        "event": "session:started",
        "handler": "tracker:on-session-started"
      },
      {
        "event": "session:stopped",
        "handler": "tracker:on-session-stopped"
      },
      {
        "event": "turn:started",
        "handler": "tracker:on-turn-started"
      },
      {
        "event": "turn:ended",
        "handler": "tracker:on-turn-ended"
      }
    ]
  }
}
```

### Key Points

- **`sessions:lifecycle`** permission is required for session hooks
- Each hook maps an **event** to a **handler** channel
- The handler channel must be in `ipcChannels` and use the `ipcNamespace` prefix
- You can subscribe to any combination of the 4 events

## dist/main.cjs

```javascript
'use strict'

async function activate(ctx) {
  ctx.log.info('[tracker] Activating Session Tracker...')

  // Initialize stats
  if (!ctx.store.get('stats')) {
    ctx.store.set('stats', {
      totalSessions: 0,
      totalTurns: 0,
      activeSessions: {},
      longestSession: 0,
    })
  }

  // ── session:started ───────────────────────────────────────────────────
  // Fired when a new CLI session begins.
  // `args` typically contains: { sessionId, cli, name? }

  ctx.registerHandler('tracker:on-session-started', async (_event, args) => {
    const sessionId = args?.sessionId
    if (!sessionId) return { success: true }

    ctx.log.info('[tracker] Session started: %s', sessionId)

    // Track the session start time
    const activeSessions = ctx.store.get('stats.activeSessions') || {}
    activeSessions[sessionId] = {
      startedAt: Date.now(),
      turns: 0,
      cli: args?.cli || 'unknown',
    }
    ctx.store.set('stats.activeSessions', activeSessions)

    // Increment total session count
    const totalSessions = (ctx.store.get('stats.totalSessions') || 0) + 1
    ctx.store.set('stats.totalSessions', totalSessions)

    return { success: true, sessionId }
  })

  // ── session:stopped ───────────────────────────────────────────────────
  // Fired when a CLI session ends.
  // `args` typically contains: { sessionId, cli, exitCode? }

  ctx.registerHandler('tracker:on-session-stopped', async (_event, args) => {
    const sessionId = args?.sessionId
    if (!sessionId) return { success: true }

    ctx.log.info('[tracker] Session stopped: %s', sessionId)

    const activeSessions = ctx.store.get('stats.activeSessions') || {}
    const session = activeSessions[sessionId]

    if (session) {
      const duration = Date.now() - session.startedAt
      const durationMinutes = Math.round(duration / 60000)

      // Update longest session record
      const longestSession = ctx.store.get('stats.longestSession') || 0
      if (duration > longestSession) {
        ctx.store.set('stats.longestSession', duration)
      }

      // Clean up active session
      delete activeSessions[sessionId]
      ctx.store.set('stats.activeSessions', activeSessions)

      // Notify user if session was long
      if (durationMinutes >= 30) {
        try {
          await ctx.invoke('extension:notify', {
            extensionId: ctx.extensionId,
            title: 'Long Session Ended',
            message: `Session ran for ${durationMinutes} minutes with ${session.turns} turns.`,
            severity: 'info',
          })
        } catch (err) {
          ctx.log.warn('[tracker] Failed to send notification: %s', err.message)
        }
      }

      ctx.log.info(
        '[tracker] Session %s: %d minutes, %d turns',
        sessionId, durationMinutes, session.turns,
      )
    }

    return { success: true, sessionId }
  })

  // ── turn:started ──────────────────────────────────────────────────────
  // Fired when an AI turn (request/response cycle) begins.
  // `args` typically contains: { sessionId }

  ctx.registerHandler('tracker:on-turn-started', async (_event, args) => {
    const sessionId = args?.sessionId
    // Could track turn start time for latency measurement
    return { success: true, sessionId }
  })

  // ── turn:ended ────────────────────────────────────────────────────────
  // Fired when an AI turn completes.
  // `args` typically contains: { sessionId, tokenUsage? }

  ctx.registerHandler('tracker:on-turn-ended', async (_event, args) => {
    const sessionId = args?.sessionId
    if (!sessionId) return { success: true }

    // Increment turn count for this session
    const activeSessions = ctx.store.get('stats.activeSessions') || {}
    if (activeSessions[sessionId]) {
      activeSessions[sessionId].turns = (activeSessions[sessionId].turns || 0) + 1
      ctx.store.set('stats.activeSessions', activeSessions)
    }

    // Increment global turn count
    const totalTurns = (ctx.store.get('stats.totalTurns') || 0) + 1
    ctx.store.set('stats.totalTurns', totalTurns)

    return { success: true, totalTurns }
  })

  // ── Stats query handler ───────────────────────────────────────────────
  // Not a session hook -- just a regular handler for querying accumulated stats.

  ctx.registerHandler('tracker:get-stats', async () => {
    const stats = ctx.store.get('stats') || {}
    const activeCount = Object.keys(stats.activeSessions || {}).length

    return {
      success: true,
      data: {
        totalSessions: stats.totalSessions || 0,
        totalTurns: stats.totalTurns || 0,
        activeSessions: activeCount,
        longestSessionMinutes: Math.round((stats.longestSession || 0) / 60000),
      },
    }
  })

  ctx.log.info('[tracker] Session Tracker activated with 5 handlers')
}

function deactivate() {
  // Handlers auto-unregister. No timers or watchers to clean up.
}

module.exports = { activate, deactivate }
```

## How Session Hooks Are Dispatched

1. A CLI session event fires (e.g., a user starts a new session)
2. The `ExtensionMainLoader.broadcastEvent()` is called with the event name and data
3. The loader iterates all enabled extensions that declared `sessionHooks` for that event
4. For each matching hook, the loader calls the extension's registered IPC handler directly
5. The event is also forwarded to the renderer so iframe-based extensions can receive it via `sdk.events.on()`

Key points:
- Hooks are dispatched **sequentially**, not in parallel
- If a hook handler throws, the error is logged and recorded, but other hooks still fire
- The host does not wait for hooks to complete before proceeding with the session

## Listening to Session Events in the Renderer

You can also listen to session events from renderer code using `sdk.events.on()`:

```javascript
// IIFE pattern
request('events.subscribe', { event: 'turn:ended' })
port.onmessage = function (event) {
  var data = event.data
  if (data.type === 'ext:event' && data.event === 'turn:ended') {
    console.log('Turn ended:', data.data)
  }
}

// React SDK pattern
const sdk = useSDK()
useEffect(() => {
  const unsub = sdk.events.on('turn:ended', (data) => {
    console.log('Turn ended:', data)
    setTurnCount(prev => prev + 1)
  })
  return unsub
}, [])
```

This requires `sessions:lifecycle` permission.

## Available Events

| Event | When Fired | Data Shape |
|-------|-----------|------------|
| `session:started` | New CLI session begins | `{ sessionId, cli, name? }` |
| `session:stopped` | CLI session ends | `{ sessionId, cli, exitCode? }` |
| `turn:started` | AI turn begins | `{ sessionId }` |
| `turn:ended` | AI turn completes | `{ sessionId, tokenUsage? }` |
