# Main Process API Reference

Extensions with a `main` entry in their manifest run Node.js code in the Electron main process. The host loads the entry via `require()` and calls `activate(ctx)` with an `ExtensionMainContext` object.

## Entry Point Format

The main entry must be a CommonJS module exporting `activate` and optionally `deactivate`:

```javascript
'use strict'

async function activate(ctx) {
  // Extension initialization code
  ctx.log.info('Extension activated')
}

function deactivate() {
  // Cleanup code (optional)
  // IPC handlers are auto-unregistered by the host
}

module.exports = { activate, deactivate }
```

## ExtensionMainContext Interface

```typescript
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
```

---

## `ctx.extensionId`

```typescript
extensionId: string
```

The extension's unique manifest ID (e.g., `"com.clearpathai.sdk-example"`). Use this to identify the extension in log messages or storage keys.

---

## `ctx.extensionPath`

```typescript
extensionPath: string
```

Absolute filesystem path to the extension's root directory. Use for accessing bundled assets or data files.

```javascript
const { readFileSync } = require('fs')
const { join } = require('path')

async function activate(ctx) {
  const templatePath = join(ctx.extensionPath, 'assets', 'template.md')
  const template = readFileSync(templatePath, 'utf-8')
}
```

---

## `ctx.registerHandler(channel, handler)`

```typescript
registerHandler(
  channel: string,
  handler: (event: unknown, args: unknown) => Promise<unknown>
): void
```

Register an IPC handler that can be called from the renderer (via MessagePort) or from other extensions (via `ctx.invoke`).

**Rules**:
- The `channel` name **must** start with the extension's `ipcNamespace` followed by `:` (e.g., `"my-ext:get-data"`)
- Attempting to register a channel outside the namespace throws an error
- The handler is wrapped with error handling -- if it throws, the error is logged and a `{ success: false, error: string }` envelope is returned
- All registered handlers are **auto-unregistered** when the extension is deactivated/unloaded

**Best practice**: Always return `{ success: boolean, data?: any, error?: string }` envelopes for consistency.

```javascript
async function activate(ctx) {
  ctx.registerHandler('my-ext:get-data', async (_event, args) => {
    try {
      const data = ctx.store.get('cached-data')
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ctx.registerHandler('my-ext:process', async (_event, args) => {
    const { input } = args || {}
    if (!input) {
      return { success: false, error: 'Missing required field: input' }
    }
    // ... process input ...
    return { success: true, data: { result: 'processed' } }
  })
}
```

---

## `ctx.invoke(channel, ...args)`

```typescript
invoke(channel: string, ...args: unknown[]): Promise<unknown>
```

Call a host IPC channel or another extension's handler. The call is **permission-checked** -- the extension must have the permission that maps to the target channel.

If the channel is not mapped to any permission, the call is denied by default.

```javascript
async function activate(ctx) {
  // Read GitHub data (requires integration:github:read permission)
  const repos = await ctx.invoke('integration:github-repos', { page: 1, perPage: 10 })

  // Read cost data (requires cost:read permission)
  const costSummary = await ctx.invoke('cost:summary')

  // Emit a notification (requires notifications:emit permission)
  await ctx.invoke('extension:notify', {
    extensionId: ctx.extensionId,
    title: 'Hello',
    message: 'Extension loaded successfully',
    severity: 'info',
  })
}
```

See the [permissions reference](permissions-reference.md) for the full channel-to-permission map.

---

## `ctx.store`

Synchronous key-value store scoped to this extension. Backed by electron-store with encryption. Data persists across app restarts.

### `ctx.store.get(key, defaultValue?)`

```typescript
get<T = unknown>(key: string, defaultValue?: T): T
```

Retrieve a stored value. Returns `defaultValue` if the key does not exist.

```javascript
const config = ctx.store.get('config', { greeting: 'Hello', count: 0 })
```

### `ctx.store.set(key, value)`

```typescript
set(key: string, value: unknown): void
```

Store a JSON-serializable value. **Throws** if the write would exceed the storage quota.

Supports dot-notation for nested keys:

```javascript
ctx.store.set('config', { greeting: 'Hello', count: 0 })
ctx.store.set('config.count', 42)  // Updates nested value
```

### `ctx.store.delete(key)`

```typescript
delete(key: string): void
```

Delete a key and its value.

### `ctx.store.keys()`

```typescript
keys(): string[]
```

List all top-level keys stored by this extension.

```javascript
async function activate(ctx) {
  // Initialize default config on first run
  if (!ctx.store.get('config')) {
    ctx.store.set('config', { greeting: 'Hello!', turnCount: 0, verbose: false })
    ctx.log.info('Initialized default config')
  }

  // Update a nested value
  ctx.store.set('config.lastActivated', Date.now())

  // List all keys
  const allKeys = ctx.store.keys() // ['config']
}
```

---

## `ctx.log`

Structured logger that outputs to the host app's log system. All messages are prefixed with `[ext:<extensionId>]`.

### Methods

```typescript
ctx.log.info(...args: unknown[]): void
ctx.log.warn(...args: unknown[]): void
ctx.log.error(...args: unknown[]): void
ctx.log.debug(...args: unknown[]): void
```

`debug` messages are only visible when debug logging is enabled in the app.

```javascript
ctx.log.info('Extension activated')
ctx.log.warn('Deprecated API usage detected')
ctx.log.error('Failed to fetch data:', err.message)
ctx.log.debug('Processing item %s of %d', itemId, total)
```

---

## Lifecycle

### Activation Order

1. Host reads and validates `clearpath-extension.json`
2. Host calls `require(mainPath)` to load the module
3. Host creates the `ExtensionMainContext` with scoped store, logger, and IPC registration
4. Host calls `activate(ctx)` -- extension registers handlers and initializes state
5. Extension is now live and receiving IPC calls

### Deactivation Order

1. Host calls `deactivate()` if exported
2. Host auto-unregisters all IPC handlers registered via `ctx.registerHandler()`
3. Extension module is removed from the loaded map

**Important**: You only need to implement `deactivate()` if your extension creates resources that are not automatically cleaned up (timers, file watchers, external connections). IPC handlers are cleaned up by the host.

---

## Error Handling

The host wraps all registered handlers with error handling. If a handler throws:

1. The error is logged via the host logger
2. The error is recorded via `registry.recordError()` (may trigger auto-disable after repeated failures)
3. A `{ success: false, error: "<message>" }` response is returned to the caller

Even so, handlers should include their own try/catch for better error messages:

```javascript
ctx.registerHandler('my-ext:risky-operation', async (_event, args) => {
  try {
    const result = await someRiskyOperation(args)
    return { success: true, data: result }
  } catch (err) {
    ctx.log.error('Risky operation failed:', err.message)
    return { success: false, error: `Operation failed: ${err.message}` }
  }
})
```
