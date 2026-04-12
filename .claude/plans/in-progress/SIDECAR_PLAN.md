# Extension Sidecar Architecture Plan

**Branch:** `feature/integration_extensions_sidecar`  
**Source:** Migrating from `feature/integrations_extensions`  
**Date:** 2026-04-12

---

## 1. Risk Validation: Dynamic `require()` in the Main Thread

### Current Pattern (ExtensionMainLoader.ts `load()`)

```typescript
// Line ~89 — runs on Electron's main process event loop
const mod = require(mainPath) as ExtensionMainExports
const ctx = this.createContext(ext)
if (typeof mod.activate === 'function') {
  await mod.activate(ctx)
}
```

### Confirmed Risks

| Risk | Severity | Why Current Error Handling Doesn't Help |
|------|----------|----------------------------------------|
| **Synchronous `require()` blocks main thread** | High | `require()` is inherently sync — heavy module-level code (big JSON, crypto init, sync fs) freezes Electron's event loop; UI becomes unresponsive |
| **Memory leak on enable/disable cycles** | Medium | `unload()` never calls `delete require.cache[mainPath]`; module stays allocated across toggle cycles |
| **No CPU isolation** | High | CPU-intensive `activate()` or session-hook work starves the Electron scheduler; IPC responses stall, window repaints stop |
| **`process.exit()` in extension kills app** | Critical | try/catch does not intercept `process.exit()` or `process.abort()` |
| **Uncaught exception in async handler** | High | An unhandled rejection in an extension's `ipcMain.handle` after the wrapping promise resolves can surface as an unhandled rejection on the main process |
| **Infinite loop in sync code** | Critical | try/catch cannot interrupt a spin-loop; the renderer freezes indefinitely |
| **`_invokeHandlers` private API hack** | Medium | `dispatchSessionHooks` reads `(this.ipcMain as unknown as { _invokeHandlers? })._invokeHandlers` — brittle across Electron versions and likely to break on major upgrades |
| **IPC channel namespace collision** | Low | An extension that crashes mid-registration can leave a partially-registered handler on `ipcMain` |

### Minor Rebuttal

The existing `try/catch` wrapping `activate()` and the error-boundary-wrapped `registerHandler` callbacks **do** contain thrown synchronous errors. An extension that simply `throw new Error()` at the top of `activate()` is handled gracefully. The risks above are the failure modes that **cannot** be contained by try/catch alone.

**Conclusion: The assumption is valid. A single bad extension can bring down the entire Electron application in multiple realistic ways.**

---

## 2. Sidecar Pattern Design

### Core Idea

Each extension with a `main` entry point is launched as a **separate Node.js child process** via `child_process.fork()`. The main Electron process communicates with it through a structured message protocol over the built-in IPC channel that `fork()` provides for free (`process.send` / `process.on('message')`).

```
Main Process (Electron)
  ExtensionSidecarManager
    ├─ spawn(ext) ──────────────────── fork() ──► SidecarWorker [com.example.ext]
    │                                               ├── require(ext.main)
    │                                               ├── activate(proxyCtx)
    │                                               └── event loop (isolated)
    │
    ├─ spawn(ext2) ─────────────────── fork() ──► SidecarWorker [com.other.ext]
    │
    │  ipcMain.handle(channel) ◄─ bridge ──── process.send({ type: 'ipc-call', ... })
    │  hostHandler(channel)    ──── bridge ──► process.send({ type: 'invoke-result', ... })
    │  broadcastEvent()        ──── bridge ──► process.send({ type: 'event', ... })
```

### Isolation Guarantees

- A crashing extension process does **not** crash the main process
- A blocking extension process does **not** freeze the Electron event loop  
- A memory-leaking extension process has a bounded heap (killed and restarted)
- `process.exit()` in an extension only kills the sidecar, not the app
- Module cache pollution is impossible (separate V8 isolate)

### What Stays in the Main Process

| Component | Reason |
|-----------|--------|
| `ExtensionRegistry` | Needs `app.getPath()`, electron-store, manifest validation |
| `ExtensionStoreFactory` | electron-store requires Electron APIs |
| `ExtensionValidator` | Pure validation logic, fine either way |
| IPC handler registration | `ipcMain.handle()` must be called from main |
| Permission checking | Registry is authoritative for permissions |

### What Moves to the Sidecar

| Component | Migration |
|-----------|-----------|
| Extension `require()` | Worker process `require()`s extension code |
| `activate()` / `deactivate()` calls | Worker calls them with a proxy context |
| Extension's registered IPC handlers | Worker runs handlers locally; main bridges calls to it |
| Extension's `ctx.invoke()` calls | Worker sends message; main resolves via host handlers |
| Session hook execution | Main sends event message; worker dispatches locally |
| Extension logging | Worker sends log messages to main for routing |

---

## 3. Message Protocol

All messages are typed JSON objects sent over `fork()`'s IPC channel.

### Main → Sidecar

```typescript
type MainToWorker =
  // Lifecycle
  | { type: 'init'; extensionId: string; extensionPath: string; manifest: ExtensionManifest; grantedPermissions: string[] }
  | { type: 'deactivate' }
  // IPC bridging: main received an ipcMain.handle call for this extension's channel
  | { type: 'ipc-call'; requestId: string; channel: string; args: unknown }
  // Event dispatch (session hooks)
  | { type: 'event'; requestId: string; event: string; data: unknown }
  // Response to worker's invoke() request
  | { type: 'invoke-result'; requestId: string; result?: unknown; error?: string }
  // Response to worker's store operation
  | { type: 'store-result'; requestId: string; result?: unknown; error?: string }
```

### Sidecar → Main

```typescript
type WorkerToMain =
  // Lifecycle
  | { type: 'ready' }
  | { type: 'deactivated' }
  | { type: 'error'; message: string; fatal: boolean }
  // Handler registration (tells main which channels to bridge)
  | { type: 'register'; channel: string }
  | { type: 'unregister'; channel: string }
  // IPC handler response (to an 'ipc-call' from main)
  | { type: 'ipc-result'; requestId: string; result?: unknown; error?: string }
  // Event hook response
  | { type: 'event-result'; requestId: string; error?: string }
  // Host invocation (ctx.invoke())
  | { type: 'invoke'; requestId: string; channel: string; args: unknown[] }
  // Storage operations (proxied to main's ExtensionStoreFactory)
  | { type: 'store'; requestId: string; op: 'get' | 'set' | 'delete' | 'keys' | 'quota'; key?: string; value?: unknown }
  // Logging
  | { type: 'log'; level: 'info' | 'warn' | 'error' | 'debug'; args: unknown[] }
```

---

## 4. Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `src/main/extensions/SidecarProtocol.ts` | Typed message union types + helper constructors |
| `src/main/extensions/sidecar-worker.ts` | Worker entry point (compiled as separate Vite chunk) |
| `src/main/extensions/ExtensionSidecarManager.ts` | Manages per-extension child processes + IPC bridge |

### Modified Files

| File | Change |
|------|--------|
| `electron.vite.config.ts` | Add `sidecar-worker` as second rollup input in `main` build |
| `src/main/extensions/ExtensionMainLoader.ts` | Replace `require()` + `activate()` with `SidecarManager.spawn()`. Fix `_invokeHandlers` hack. Keep all public method signatures identical. |
| `src/main/index.ts` | No changes needed — `ExtensionMainLoader` public API unchanged |

---

## 5. Detailed Implementation

### 5.1 `electron.vite.config.ts` — Add Sidecar Entry

```typescript
main: {
  build: {
    externalizeDeps: true,
    rollupOptions: {
      input: {
        index: 'src/main/index.ts',
        'sidecar-worker': 'src/main/extensions/sidecar-worker.ts',  // NEW
      }
    }
  }
}
```

The compiled worker lands at `out/main/sidecar-worker.js`, which is what `fork()` receives.

### 5.2 `SidecarProtocol.ts`

Exports the `MainToWorker` and `WorkerToMain` discriminated union types. Also exports a `SIDECAR_TIMEOUT_MS = 15_000` constant for request timeouts.

### 5.3 `sidecar-worker.ts`

The worker is a plain Node.js module (no Electron imports). It:

1. Waits for the `init` message
2. `require()`s the extension's main entry
3. Constructs a proxy `ExtensionMainContext`:
   - `registerHandler(channel, fn)` → sends `{ type: 'register', channel }` to main, stores handler locally
   - `invoke(channel, ...args)` → sends `{ type: 'invoke', requestId, channel, args }`, awaits `invoke-result`
   - `store.*` → sends `{ type: 'store', op, key, value }`, awaits `store-result`
   - `log.*` → sends `{ type: 'log', level, args }`
4. Calls `activate(ctx)`; on success sends `{ type: 'ready' }`
5. On `ipc-call` messages → runs the locally-stored handler, sends back `ipc-result`
6. On `event` messages → runs matching session-hook handler, sends back `event-result`
7. On `deactivate` → calls `mod.deactivate?.()`, sends `deactivated`, exits

Error handling in worker:
- All handlers wrapped in try/catch → `ipc-result` with `error` field
- `process.on('uncaughtException')` → `{ type: 'error', fatal: true }` then exit(1)
- `process.on('unhandledRejection')` → `{ type: 'error', fatal: false }` (logged, not fatal)

### 5.4 `ExtensionSidecarManager.ts`

```typescript
interface SidecarEntry {
  process: ChildProcess
  extensionId: string
  channels: Set<string>          // channels the sidecar has registered
  pendingInvokes: Map<string, PendingCall>   // waiting for invoke-result
  pendingDispatches: Map<string, PendingCall> // waiting for ipc-result / event-result
  pendingStoreOps: Map<string, PendingCall>   // waiting for store-result
}

class ExtensionSidecarManager {
  // Spawn a child process for an extension
  async spawn(ext: InstalledExtension): Promise<void>
  
  // Gracefully terminate an extension's sidecar
  async kill(extensionId: string): Promise<void>
  
  // Terminate all sidecars
  async killAll(): Promise<void>
  
  // Check if sidecar is running
  isRunning(extensionId: string): boolean
  
  // Dispatch event to all running sidecars with matching session hooks
  async broadcastEvent(event: string, data: unknown): Promise<void>
  
  // Set webContents for forwarding renderer events
  setWebContents(wc: Electron.WebContents): void
}
```

**spawn() flow:**
1. Resolve worker path: `join(__dirname, 'sidecar-worker.js')`
2. `fork(workerPath, [], { silent: false })` — stderr/stdout piped to main's logger
3. Send `{ type: 'init', ... }` with manifest + grantedPermissions
4. Await `{ type: 'ready' }` with a 30-second timeout
5. On `register` message → call `ipcMain.handle(channel, ...)` with bridge handler
6. On `invoke` message → permission-check → call host handler → send `invoke-result`
7. On `store` message → call `storeFactory.getStore(id)[op]()` → send `store-result`
8. On `log` message → route to `log[level](...args)`
9. On `error` with `fatal: true` → call `registry.recordError()`, kill process, auto-disable at 3 errors
10. On process `exit` (unexpected) → same as fatal error

**ipcMain bridge handler (registered per channel):**
```typescript
ipcMain.handle(channel, async (_event, args) => {
  const requestId = randomUUID()
  const sidecar = this.sidecars.get(extensionId)
  if (!sidecar) return { success: false, error: 'Extension not running' }
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sidecar.pendingDispatches.delete(requestId)
      reject(new Error(`Sidecar IPC timeout for channel "${channel}"`))
    }, SIDECAR_TIMEOUT_MS)
    
    sidecar.pendingDispatches.set(requestId, { resolve, reject, timeout })
    sidecar.process.send({ type: 'ipc-call', requestId, channel, args })
  })
})
```

### 5.5 Refactoring `ExtensionMainLoader.ts`

All public method signatures remain **identical**. Internally:

- `constructor(ipcMain, registry, storeFactory)` → also creates `ExtensionSidecarManager`
- `load(ext)` → delegates to `sidecarManager.spawn(ext)` instead of `require()`
- `unload(extensionId)` → delegates to `sidecarManager.kill(extensionId)` instead of `ipcMain.removeHandler()`
- `unloadAll()` → delegates to `sidecarManager.killAll()`
- `isLoaded(extensionId)` → delegates to `sidecarManager.isRunning(extensionId)`
- `broadcastEvent(event, data)` → delegates to `sidecarManager.broadcastEvent()` (replaces `_invokeHandlers` hack)
- `setWebContents(wc)` → delegates to `sidecarManager.setWebContents(wc)`
- `registerHostHandler(channel, handler)` → stored in `ExtensionSidecarManager.hostHandlers`

**`_invokeHandlers` hack removed**: Session hook dispatch now works correctly because the sidecar's own registered handler functions are stored locally in the worker process and invoked via the `event` message type — no private API access needed.

---

## 6. Error & Crash Handling

| Scenario | Handling |
|----------|---------|
| Extension `throw` in `activate()` | Worker catches, sends `{ type: 'error', fatal: false }`, main calls `registry.recordError()` |
| Extension `process.exit()` | Sidecar process exits; main's `child.on('exit')` fires → `recordError()` → auto-disable at 3 |
| Extension CPU spin (infinite loop) | Main registers a watchdog: if no heartbeat in 30s during an active call, kill process |
| IPC call timeout | `SIDECAR_TIMEOUT_MS` (15s) per call; returns error to renderer |
| Extension crashes on init | `ready` message never arrives; `spawn()` rejects after 30s → `recordError()` |
| 3+ errors | `registry.setEnabled(false)`, sidecar killed, notification emitted (same as current behavior) |

---

## 7. Implementation Sequence

```
Step 1 ── Create SidecarProtocol.ts (types only, no logic)
Step 2 ── Create sidecar-worker.ts (standalone, testable in isolation)
Step 3 ── Create ExtensionSidecarManager.ts (no ExtensionMainLoader changes yet)
Step 4 ── Add sidecar-worker entry to electron.vite.config.ts
Step 5 ── Refactor ExtensionMainLoader.ts to delegate to ExtensionSidecarManager
Step 6 ── Remove _invokeHandlers hack; use event-based session hook dispatch
Step 7 ── Update require.cache note in unload() (no longer needed — remove comment)
Step 8 ── Write unit tests for SidecarProtocol message types
Step 9 ── Write integration test: spawn mock extension in sidecar, verify round-trip IPC
Step 10 ─ Verify all existing extension-related tests still pass
```

---

## 8. Preserved Functionality Checklist

| Feature | Preserved? | How |
|---------|-----------|-----|
| Extension `activate()` / `deactivate()` lifecycle | ✅ | Worker calls them directly |
| `ctx.registerHandler(channel, fn)` | ✅ | Worker stores fn locally; main bridges calls |
| `ctx.invoke(channel, ...args)` | ✅ | invoke → main → hostHandler → result back to worker |
| `ctx.store.*` | ✅ | store message → main → ExtensionStoreFactory |
| `ctx.log.*` | ✅ | log message → main → logger with ext prefix |
| Session hook dispatch | ✅ | event message → worker → local handler |
| `broadcastEvent()` to renderer | ✅ | Forwarded via webContents.send (unchanged) |
| Auto-disable after 3 errors | ✅ | Error messages + process exit both call `recordError()` |
| `extension:toggle` enable/disable | ✅ | spawn() / kill() replace load() / unload() |
| All `extensionHandlers.ts` IPC channels | ✅ | No changes to extensionHandlers.ts |
| `ExtensionHost.tsx` (renderer iframe) | ✅ | No changes — it communicates via MessagePort |
| Permission checking | ✅ | Main still checks via `registry.hasPermission()` before proxying |
| `registerHostHandler` pattern | ✅ | Stored in SidecarManager, called on invoke messages |

---

## 9. Trade-offs

| Concern | Impact | Mitigation |
|---------|--------|------------|
| Higher startup latency per extension | ~50–200ms per fork() | Acceptable; extensions load async post-app-ready |
| IPC overhead for every handler call | ~1–5ms round-trip | Extensions are not latency-critical paths |
| Worker path must be known at fork time | Build config change required | Single electron.vite.config.ts addition |
| Cannot use Electron APIs in worker | Extension authors lose electron access | Documented constraint; SDK proxies all needed capabilities |
| Debugging worker processes | Harder to attach debugger | `fork()` with `--inspect-brk` in dev mode (optional flag) |
