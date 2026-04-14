# SDK API Reference (Renderer)

The `ExtensionSDK` interface is available to renderer code via `useSDK()` (React pattern) or via the MessagePort `ext:request` protocol (IIFE pattern). All methods are async and return Promises.

## Accessing the SDK

**React pattern** (with `@clearpath/extension-sdk`):
```tsx
import { useSDK } from '@clearpath/extension-sdk'

function MyComponent() {
  const sdk = useSDK()
  // sdk.storage.get('key'), sdk.github.listRepos(), etc.
}
```

**IIFE pattern** (no build step):
```js
// The MessagePort-based request() function replaces sdk.* calls:
request('storage.get', { key: 'myKey' })
request('github.listRepos', { page: 1, perPage: 30 })
request('notifications.emit', { title: 'Hello', message: 'World', severity: 'info' })
```

## `sdk.extensionId`

```typescript
readonly extensionId: string
```

The unique identifier of this extension, matching the manifest `id`. No permission required.

---

## `sdk.github`

**Required permission**: `integration:github:read`

### `listRepos(opts?)`
```typescript
listRepos(opts?: { page?: number; perPage?: number }): Promise<unknown[]>
```
List repositories accessible to the authenticated GitHub user.

### `listPulls(owner, repo, opts?)`
```typescript
listPulls(owner: string, repo: string, opts?: { state?: string }): Promise<unknown[]>
```
List pull requests for a repository. Filter by state (`"open"`, `"closed"`, `"all"`).

### `getPull(owner, repo, pullNumber)`
```typescript
getPull(owner: string, repo: string, pullNumber: number): Promise<unknown>
```
Get a single pull request by number with full details.

### `listIssues(owner, repo, opts?)`
```typescript
listIssues(owner: string, repo: string, opts?: { state?: string }): Promise<unknown[]>
```
List issues for a repository.

### `search(query, type?)`
```typescript
search(query: string, type?: 'issues' | 'pulls' | 'code'): Promise<unknown[]>
```
Search across GitHub. Defaults to `'issues'`.

**Example**:
```tsx
const sdk = useSDK()
const repos = await sdk.github.listRepos({ page: 1, perPage: 10 })
const openPRs = await sdk.github.listPulls('owner', 'repo', { state: 'open' })
const results = await sdk.github.search('label:bug is:open', 'issues')
```

---

## `sdk.notifications`

**Required permission**: `notifications:emit`

### `emit(opts)`
```typescript
emit(opts: { title: string; message: string; severity?: 'info' | 'warning' }): Promise<void>
```
Emit a user-visible toast notification.

**Example**:
```tsx
await sdk.notifications.emit({
  title: 'Build Complete',
  message: 'All tests passed successfully.',
  severity: 'info',
})
```

---

## `sdk.storage`

**Required permission**: `storage`

Per-extension encrypted key-value store. Data persists across app restarts.

### `get<T>(key)`
```typescript
get<T = unknown>(key: string): Promise<T | undefined>
```
Retrieve a value by key. Returns `undefined` if the key does not exist.

### `set(key, value)`
```typescript
set(key: string, value: unknown): Promise<void>
```
Store a JSON-serializable value. Overwrites any existing value. Throws if quota is exceeded.

### `delete(key)`
```typescript
delete(key: string): Promise<void>
```
Delete a key and its value.

### `keys()`
```typescript
keys(): Promise<string[]>
```
List all keys currently stored by this extension.

### `quota()`
```typescript
quota(): Promise<{ used: number; limit: number }>
```
Get current storage usage (bytes consumed) and quota limit (max bytes allowed).

**Example**:
```tsx
await sdk.storage.set('config', { theme: 'dark', count: 42 })
const config = await sdk.storage.get<{ theme: string; count: number }>('config')
const { used, limit } = await sdk.storage.quota()
console.log(`Using ${used} of ${limit} bytes`)
```

---

## `sdk.env`

**Required permission**: `env:read`

### `get(key)`
```typescript
get(key: string): Promise<string | undefined>
```
Get the value of an environment variable.

### `keys()`
```typescript
keys(): Promise<string[]>
```
List all available environment variable names.

**Example**:
```tsx
const apiKey = await sdk.env.get('CUSTOM_API_KEY')
const allKeys = await sdk.env.keys()
```

---

## `sdk.http`

**Required permission**: `http:fetch`

### `fetch(url, opts?)`
```typescript
fetch(
  url: string,
  opts?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; headers: Record<string, string>; body: string }>
```
Perform an HTTP request. The domain of `url` must be listed in `allowedDomains` in the manifest. Throws if the domain is not allowed.

**Example**:
```tsx
const resp = await sdk.http.fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'test' }),
})
console.log(resp.status, resp.body)
```

---

## `sdk.theme`

**No permission required.**

### `get()`
```typescript
get(): Promise<ClearPathTheme>
```
Get the current theme. Returns:
```typescript
interface ClearPathTheme {
  primary: string   // e.g., "#5B4FC4"
  sidebar: string   // e.g., "#1e1b4b"
  accent: string    // e.g., "#1D9E75"
  isDark: boolean
}
```

### `onChange(callback)`
```typescript
onChange(callback: (theme: ClearPathTheme) => void): () => void
```
Subscribe to theme changes. Returns an unsubscribe function.

**Example**:
```tsx
const theme = await sdk.theme.get()
const unsub = sdk.theme.onChange((newTheme) => {
  document.body.style.background = newTheme.isDark ? '#111' : '#fff'
})
// Later: unsub()
```

---

## `sdk.sessions`

**Required permission**: `sessions:read`

### `list()`
```typescript
list(): Promise<Array<{
  sessionId: string
  cli: 'copilot' | 'claude'
  name?: string
  status: 'running' | 'stopped'
  startedAt: number
  endedAt?: number
}>>
```
List all sessions (running and stopped).

### `getMessages(sessionId)`
```typescript
getMessages(sessionId: string): Promise<Array<{
  type: string
  content: string
  sender?: 'user' | 'ai' | 'system'
  timestamp?: number
  metadata?: Record<string, unknown>
}>>
```
Get the message history for a session.

### `getActive()`
```typescript
getActive(): Promise<string | null>
```
Get the ID of the currently active session, or `null`.

**Example**:
```tsx
const sessions = await sdk.sessions.list()
const running = sessions.filter(s => s.status === 'running')
if (running.length > 0) {
  const msgs = await sdk.sessions.getMessages(running[0].sessionId)
}
```

---

## `sdk.cost`

**Required permission**: `cost:read`

### `summary()`
```typescript
summary(): Promise<{
  totalCost: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalSessions: number
  totalPrompts: number
  todaySpend: number
  weekSpend: number
  monthSpend: number
  todayTokens: number
  weekTokens: number
  monthTokens: number
  displayMode: 'tokens' | 'monetary'
}>
```
Get aggregate cost summary across all sessions.

### `list(opts?)`
```typescript
list(opts?: { since?: number; until?: number }): Promise<Array<{
  id: string
  sessionId: string
  sessionName: string
  cli: 'copilot' | 'claude'
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  promptCount: number
  timestamp: number
}>>
```
List individual cost records, optionally filtered by epoch-ms time range.

### `getBudget()`
```typescript
getBudget(): Promise<{
  dailyCeiling: number | null
  weeklyCeiling: number | null
  monthlyCeiling: number | null
  dailyTokenCeiling: number | null
  weeklyTokenCeiling: number | null
  monthlyTokenCeiling: number | null
  autoPauseAtLimit: boolean
}>
```
Get budget configuration. `null` values mean no limit is set.

### `bySession(opts?)`
```typescript
bySession(opts?: { since?: number }): Promise<Array<{
  sessionId: string
  sessionName: string
  cli: string
  totalCost: number
  totalTokens: number
  promptCount: number
  costPerPrompt: number
}>>
```
Get cost data aggregated by session.

---

## `sdk.featureFlags`

**Required permission**: `feature-flags:read` for reading, `feature-flags:write` for `set()`.

### `getAll()`
```typescript
getAll(): Promise<Record<string, boolean>>
```
Get all feature flags and their current values.

### `get(key)`
```typescript
get(key: string): Promise<boolean>
```
Get the value of a single flag. Returns `false` if the flag does not exist.

### `set(key, value)`
```typescript
set(key: string, value: boolean): Promise<void>
```
Set the value of a feature flag. Requires `feature-flags:write`.

---

## `sdk.localModels`

**Required permission**: `local-models:access`

### `detect()`
```typescript
detect(): Promise<{
  ollama: { connected: boolean; models: Array<{ name: string; size?: string }> }
  lmstudio: { connected: boolean; models: Array<{ name: string }> }
}>
```
Detect locally-running model servers and their available models.

### `chat(opts)`
```typescript
chat(opts: {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  source?: 'ollama' | 'lmstudio'
}): Promise<{ content: string }>
```
Send a chat completion request to a local model.

**Example**:
```tsx
const servers = await sdk.localModels.detect()
if (servers.ollama.connected && servers.ollama.models.length > 0) {
  const response = await sdk.localModels.chat({
    model: servers.ollama.models[0].name,
    messages: [{ role: 'user', content: 'Summarize this PR' }],
    source: 'ollama',
  })
}
```

---

## `sdk.context`

**Required permission**: `context:estimate`

### `estimateTokens(text)`
```typescript
estimateTokens(text: string): Promise<{ tokens: number; method: 'heuristic' }>
```
Estimate the token count for a string. Uses a heuristic (approximately `text.length / 4`).

---

## `sdk.events`

Permissions vary by event type (see `EVENT_PERMISSION_MAP` in ExtensionHost):

| Event | Required Permission |
|-------|-------------------|
| `session:started` | `sessions:lifecycle` |
| `session:stopped` | `sessions:lifecycle` |
| `turn:started` | `sessions:lifecycle` |
| `turn:ended` | `sessions:lifecycle` |
| `cost:recorded` | `cost:read` |
| `budget:alert` | `cost:read` |
| `slot:data-changed` | none |

### `on(event, callback)`
```typescript
on(event: string, callback: (data: unknown) => void): () => void
```
Subscribe to a named event. Returns an unsubscribe function. The SDK client automatically registers/unregisters the subscription with the host.

**Example**:
```tsx
const unsub = sdk.events.on('turn:ended', (data) => {
  console.log('Turn ended:', data)
})
// Later: unsub()
```

---

## `sdk.navigate(path)`

**Required permission**: `navigation`

```typescript
navigate(path: string): Promise<void>
```
Navigate the host app to a given route path.

**Example**:
```tsx
await sdk.navigate('/insights')
await sdk.navigate('/my-extension/settings')
```
