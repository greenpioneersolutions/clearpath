# Storage System

Each extension has an isolated, encrypted, quota-limited key-value store backed by electron-store. Storage persists across app restarts.

## Architecture

- Each extension gets its own electron-store file: `clear-path-ext-<extensionId>.json`
- Files are stored in the OS-standard config directory:
  - macOS: `~/Library/Application Support/clear-path/`
  - Linux: `~/.config/clear-path/`
  - Windows: `%APPDATA%/clear-path/`
- Storage is encrypted using a derived key from `getStoreEncryptionKey()`
- Data is nested under a `data` key in the store file: `{ "data": { "key1": "value1", ... } }`

## Quota System

| Setting | Value |
|---------|-------|
| Default quota | 5 MB (5,242,880 bytes) |
| Maximum quota | 50 MB (52,428,800 bytes) |
| Configurable via | `storageQuota` in manifest |

Quota is checked on every `set()` call. The check serializes the entire `data` object (including the proposed write) to JSON and measures the byte length. If the result exceeds the quota, the write is rejected with an error:

```
Storage quota exceeded for extension "com.example.my-ext":
6000000 bytes exceeds 5242880 byte limit
```

## Main Process API (Synchronous)

Available via `ctx.store` in the `activate(ctx)` function. All operations are synchronous.

### `ctx.store.get(key, defaultValue?)`

```javascript
const config = ctx.store.get('config')              // undefined if not set
const config = ctx.store.get('config', { count: 0 }) // returns default if not set
```

### `ctx.store.set(key, value)`

```javascript
ctx.store.set('config', { greeting: 'Hello', count: 42 })

// Dot notation for nested updates (electron-store feature):
ctx.store.set('config.count', 43)
ctx.store.set('config.lastUpdated', Date.now())
```

Values must be JSON-serializable. Throws if quota is exceeded.

### `ctx.store.delete(key)`

```javascript
ctx.store.delete('config')
```

### `ctx.store.keys()`

```javascript
const keys = ctx.store.keys() // ['config', 'cache', 'state']
```

Returns top-level keys only.

## Renderer API (Async)

Available via `sdk.storage` in renderer code. All operations are async because they cross the MessagePort boundary.

**Required permission**: `storage`

### `sdk.storage.get(key)`

```typescript
const value = await sdk.storage.get<MyType>('config')
// Returns undefined if key does not exist
```

### `sdk.storage.set(key, value)`

```typescript
await sdk.storage.set('config', { greeting: 'Hello', count: 42 })
```

### `sdk.storage.delete(key)`

```typescript
await sdk.storage.delete('config')
```

### `sdk.storage.keys()`

```typescript
const keys = await sdk.storage.keys() // string[]
```

### `sdk.storage.quota()`

```typescript
const { used, limit } = await sdk.storage.quota()
// used: current bytes consumed
// limit: maximum bytes allowed
```

## Storage Isolation

Each extension's store is completely isolated:

- Different electron-store files on disk
- Different encryption keys (derived from the extension ID)
- No cross-extension access -- one extension cannot read another's store
- The `ExtensionStoreFactory` manages instances: one `ExtensionStorage` per extension ID, lazily created

## Storage Lifecycle

| Event | Effect |
|-------|--------|
| Extension first loaded | Store file created with `{ data: {} }` defaults |
| `set()` called | Value written to store, quota checked |
| Extension disabled | Store file remains (data preserved) |
| Extension re-enabled | Same store file reopened with existing data |
| Extension uninstalled | `store.destroy()` called -- store file cleared |
| App uninstalled | All store files removed with app data |

## Implementation Details

The `ExtensionStorage` class wraps electron-store:

```typescript
class ExtensionStorage {
  constructor(extensionId: string, quotaBytes?: number)
  get<T>(key: string): T | undefined
  set(key: string, value: unknown): void      // Throws on quota exceeded
  delete(key: string): void
  keys(): string[]
  getUsedBytes(): number
  getQuota(): { used: number; limit: number }
  destroy(): void                               // Wipe all data (uninstall)
}
```

The `ExtensionStoreFactory` manages instances:

```typescript
class ExtensionStoreFactory {
  getStore(extensionId: string, quotaBytes?: number): ExtensionStorage
  destroyStore(extensionId: string): void
  destroyAll(): void
}
```

## Best Practices

1. **Initialize defaults on first run**: Check if a key exists before assuming it has data.
   ```javascript
   if (!ctx.store.get('config')) {
     ctx.store.set('config', DEFAULT_CONFIG)
   }
   ```

2. **Monitor quota usage**: Call `quota()` periodically if you store growing data (logs, caches).

3. **Clean up stale data**: Delete old cache entries to stay within quota.

4. **Use structured keys**: Organize data under logical top-level keys (`config`, `cache`, `state`) rather than many flat keys.

5. **Handle quota errors**: Wrap `set()` in try/catch and handle the quota-exceeded case gracefully.
