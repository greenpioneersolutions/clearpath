# @clearpath/extension-sdk

SDK for building ClearPathAI extensions. Extensions add custom pages, widgets, context providers, and integrations to the ClearPathAI desktop application.

**Version:** 0.2.0  
**Peer dependencies:** React 18, React DOM 18

## Quick Start

### Installation

```bash
npm install @clearpath/extension-sdk
```

### Minimal Extension

```tsx
// renderer.tsx
import { createExtension, useSDK } from '@clearpath/extension-sdk'

function MyPage() {
  const sdk = useSDK()
  const [count, setCount] = useState(0)

  useEffect(() => {
    sdk.storage.get<number>('visitCount').then((n) => {
      const next = (n ?? 0) + 1
      setCount(next)
      sdk.storage.set('visitCount', next)
    })
  }, [])

  return <div>You have visited {count} times.</div>
}

export default createExtension({
  components: { MyPage },
  activate: (sdk) => {
    sdk.notifications.emit({
      title: 'Hello',
      message: 'My extension activated!',
      severity: 'info',
    })
  },
})
```

```json
// clearpath-extension.json
{
  "id": "com.example.my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "A minimal example extension",
  "author": "Your Name",
  "permissions": ["storage", "notifications:emit"],
  "renderer": "dist/renderer.js",
  "contributes": {
    "navigation": [
      {
        "id": "main-page",
        "path": "/my-extension",
        "label": "My Extension",
        "icon": "Puzzle"
      }
    ]
  }
}
```

## Architecture

### How Extensions Work

1. Extensions run in **sandboxed iframes** (renderer) and optionally in **Node.js** (main process).
2. Communication between the extension iframe and the host app uses the **MessagePort** protocol (`MessageChannel`).
3. All SDK calls are **permission-gated** -- the host checks the extension's granted permissions before executing any request.
4. Each extension has **isolated encrypted storage** scoped by its ID.
5. HTTP requests are **domain-allowlisted** -- only domains declared in `allowedDomains` are reachable.
6. Extensions are loaded from the `extensions/` directory and validated against the manifest schema before activation.

### Extension Lifecycle

```
Install -> Validate manifest -> Register in store -> Enable
  -> Load main.cjs (Node.js, if present)
  -> Load renderer.js (iframe, if present)
  -> createExtension().mount() called by host
  -> activate(sdk) fires
  -> Extension is live
  -> deactivate() fires on disable/uninstall
```

### Extension Directory Structure

```
extensions/com.company.my-extension/
  clearpath-extension.json    # Manifest (required)
  dist/
    main.cjs                  # Main process entry (Node.js, CommonJS) -- optional
    renderer.js               # Renderer entry (iframe, IIFE or React) -- optional
  assets/
    icon.svg                  # Extension icon -- optional
```

- `clearpath-extension.json` is the only required file. The host reads it to register the extension without executing code.
- `main.cjs` runs in Node.js with access to `ExtensionMainContext` (IPC handlers, store, logging).
- `renderer.js` runs in a sandboxed iframe with access to the SDK via `useSDK()`.
- Either `main` or `renderer` (or both) must be present for the extension to do anything.

## Manifest Reference

The manifest file is `clearpath-extension.json` at the extension root.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Globally unique reverse-domain ID (e.g., `"com.acme.my-ext"`). Must match pattern `^[a-z0-9]+(\.[a-z0-9-]+){2,}$`. |
| `name` | `string` | Human-readable display name. |
| `version` | `string` | Semver version string (e.g., `"1.0.0"`). |
| `description` | `string` | Short description of what the extension does. |
| `author` | `string` | Author name or organization. |
| `permissions` | `ExtensionPermission[]` | Array of permission strings the extension requires. See [Permissions](#permissions). |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `icon` | `string` | none | Path to icon file relative to extension root, or a bundled icon name. |
| `minAppVersion` | `string` | none | Minimum ClearPathAI app version required (semver). Extension will not load on older versions. |
| `main` | `string` | none | Path to main-process entry (Node.js CommonJS). Omit for renderer-only extensions. |
| `renderer` | `string` | none | Path to renderer entry (React). Omit for main-process-only extensions. |
| `allowedDomains` | `string[]` | `[]` | Domains the extension may fetch via `sdk.http.fetch()`. Required when using `http:fetch` permission. |
| `requires` | `ExtensionRequirement[]` | `[]` | Integrations that must be enabled for this extension to function. |
| `ipcNamespace` | `string` | `id` | Custom IPC namespace prefix. Defaults to the extension `id`. |
| `ipcChannels` | `string[]` | `[]` | IPC channels the main-process entry registers. |
| `storageQuota` | `number` | host-defined | Maximum storage in bytes for `sdk.storage`. |
| `contributes` | `object` | `{}` | UI contributions. See [Contributions](#contributions). |

### ExtensionRequirement

```ts
interface ExtensionRequirement {
  integration: string  // e.g., "github", "atlassian"
  label: string        // e.g., "GitHub Integration"
  message: string      // Shown when the requirement is not met
}
```

### Permissions

Each permission grants access to a specific SDK namespace or capability. Users approve permissions at install time.

| Permission | Grants | SDK Namespace |
|------------|--------|---------------|
| `storage` | Persist key-value data scoped to the extension | `sdk.storage` |
| `notifications:emit` | Emit user-visible notifications | `sdk.notifications` |
| `integration:github:read` | Read-only access to GitHub data (repos, PRs, issues) | `sdk.github` (read methods) |
| `integration:github:write` | Write access to GitHub (create/update PRs, issues) | `sdk.github` (write methods) |
| `env:read` | Read environment variables configured in the app | `sdk.env` |
| `http:fetch` | Make HTTP requests to allowed domains | `sdk.http` |
| `navigation` | Programmatically navigate the app | `sdk.navigate()` |
| `sessions:read` | Read session metadata and message history | `sdk.sessions` |
| `sessions:lifecycle` | Receive session lifecycle hooks (start, stop, turn events) | `sdk.events` (session events) |
| `cost:read` | Read cost and usage analytics | `sdk.cost` |
| `feature-flags:read` | Read feature flag values | `sdk.featureFlags` (read methods) |
| `feature-flags:write` | Toggle feature flags | `sdk.featureFlags.set()` |
| `local-models:access` | Detect and chat with local models (Ollama, LM Studio) | `sdk.localModels` |
| `context:estimate` | Estimate token counts for text | `sdk.context` |
| `compliance:log` | Write entries to the compliance audit log | (main process) |
| `notes:read` | Read knowledge-base notes stored by the app | (main process) |
| `skills:read` | Read registered skills and their metadata | (main process) |

## SDK API Reference

### Exports

```ts
import {
  createExtension,   // Factory to define your renderer entry point
  useSDK,            // React hook to access the SDK
  ClearPathProvider,  // React context provider (used internally)
} from '@clearpath/extension-sdk'

// All types are also exported:
import type {
  ExtensionSDK,
  ExtensionManifest,
  ExtensionPermission,
  ExtensionMainContext,
  ClearPathTheme,
  CreateExtensionOptions,
  NavContribution,
  PanelContribution,
  WidgetContribution,
  TabContribution,
  SidebarWidgetContribution,
  SessionHookContribution,
  ContextProviderContribution,
  ExtensionRequirement,
} from '@clearpath/extension-sdk'
```

### createExtension(options)

Factory function that defines the renderer entry point. Default-export the result from your `renderer.js`.

```ts
function createExtension(options: CreateExtensionOptions): {
  components: Record<string, React.ComponentType>
  activate?: (sdk: ExtensionSDK) => void | Promise<void>
  deactivate?: () => void | Promise<void>
  mount: (rootElement: HTMLElement) => void
}

interface CreateExtensionOptions {
  /** Map of named React components. Keys must match `component` references in the manifest. */
  components: Record<string, React.ComponentType>
  /** Called when the extension is activated. Use for one-time setup. */
  activate?: (sdk: ExtensionSDK) => void | Promise<void>
  /** Called when the extension is deactivated. Use for cleanup. */
  deactivate?: () => void | Promise<void>
}
```

### useSDK()

React hook that returns the `ExtensionSDK` instance. Must be called within a component rendered by `createExtension()`.

```ts
function useSDK(): ExtensionSDK
```

Throws if called outside a ClearPath extension component tree.

---

### SDK Namespaces

The `ExtensionSDK` object returned by `useSDK()` provides the following namespaces:

```ts
interface ExtensionSDK {
  readonly extensionId: string
  github: { ... }
  notifications: { ... }
  storage: { ... }
  env: { ... }
  http: { ... }
  theme: { ... }
  sessions: { ... }
  cost: { ... }
  featureFlags: { ... }
  localModels: { ... }
  context: { ... }
  events: { ... }
  navigate(path: string): Promise<void>
}
```

---

#### sdk.storage

Encrypted per-extension key-value store. Data persists across app restarts within the configured quota.

**Permission:** `storage`

```ts
sdk.storage.get<T = unknown>(key: string): Promise<T | undefined>
sdk.storage.set(key: string, value: unknown): Promise<void>
sdk.storage.delete(key: string): Promise<void>
sdk.storage.keys(): Promise<string[]>
sdk.storage.quota(): Promise<{ used: number; limit: number }>
```

```tsx
// Example: persist user preferences
const prefs = await sdk.storage.get<{ theme: string }>('prefs')
await sdk.storage.set('prefs', { theme: 'dark' })
const { used, limit } = await sdk.storage.quota()
```

---

#### sdk.notifications

Emit user-visible notifications in the app's notification center.

**Permission:** `notifications:emit`

```ts
sdk.notifications.emit(opts: {
  title: string
  message: string
  severity?: 'info' | 'warning'
}): Promise<void>
```

```tsx
await sdk.notifications.emit({
  title: 'Sync Complete',
  message: '42 items synced from your project.',
  severity: 'info',
})
```

---

#### sdk.github

Read and search GitHub data (repositories, pull requests, issues).

**Permission:** `integration:github:read` for read methods, `integration:github:write` for write methods.

```ts
sdk.github.listRepos(opts?: {
  page?: number
  perPage?: number
}): Promise<unknown[]>

sdk.github.listPulls(owner: string, repo: string, opts?: {
  state?: string
}): Promise<unknown[]>

sdk.github.getPull(owner: string, repo: string, pullNumber: number): Promise<unknown>

sdk.github.listIssues(owner: string, repo: string, opts?: {
  state?: string
}): Promise<unknown[]>

sdk.github.search(query: string, type?: 'issues' | 'pulls' | 'code'): Promise<unknown[]>
```

```tsx
// Example: list open PRs
const pulls = await sdk.github.listPulls('acme', 'widgets', { state: 'open' })
```

---

#### sdk.env

Read environment variables configured in the app.

**Permission:** `env:read`

```ts
sdk.env.get(key: string): Promise<string | undefined>
sdk.env.keys(): Promise<string[]>
```

```tsx
const apiKey = await sdk.env.get('MY_SERVICE_KEY')
```

---

#### sdk.http

Make HTTP requests to allowed domains. The host proxies the request and enforces the `allowedDomains` list from the manifest.

**Permission:** `http:fetch`

```ts
sdk.http.fetch(
  url: string,
  opts?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  }
): Promise<{ status: number; headers: Record<string, string>; body: string }>
```

```tsx
// Manifest must include: "allowedDomains": ["api.example.com"]
const res = await sdk.http.fetch('https://api.example.com/data', {
  method: 'GET',
  headers: { Authorization: 'Bearer token' },
})
const data = JSON.parse(res.body)
```

---

#### sdk.theme

Access the host app's current theme and subscribe to changes.

**Permission:** none required.

```ts
interface ClearPathTheme {
  primary: string   // e.g., "#5B4FC4"
  sidebar: string   // e.g., "#1e1b4b"
  accent: string    // e.g., "#1D9E75"
  isDark: boolean
}

sdk.theme.get(): Promise<ClearPathTheme>
sdk.theme.onChange(callback: (theme: ClearPathTheme) => void): () => void  // returns unsubscribe
```

```tsx
const theme = await sdk.theme.get()
const unsub = sdk.theme.onChange((t) => console.log('Dark mode:', t.isDark))
// Later: unsub()
```

---

#### sdk.sessions

Query active AI sessions and their message history.

**Permission:** `sessions:read`

```ts
sdk.sessions.list(): Promise<Array<{
  sessionId: string
  cli: 'copilot' | 'claude'
  name?: string
  status: 'running' | 'stopped'
  startedAt: number
  endedAt?: number
}>>

sdk.sessions.getMessages(sessionId: string): Promise<Array<{
  type: string
  content: string
  sender?: 'user' | 'ai' | 'system'
  timestamp?: number
  metadata?: Record<string, unknown>
}>>

sdk.sessions.getActive(): Promise<string | null>
```

```tsx
const active = await sdk.sessions.getActive()
if (active) {
  const messages = await sdk.sessions.getMessages(active)
  console.log(`Session has ${messages.length} messages`)
}
```

---

#### sdk.cost

Token usage and budget tracking analytics.

**Permission:** `cost:read`

```ts
sdk.cost.summary(): Promise<{
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

sdk.cost.list(opts?: {
  since?: number   // epoch ms
  until?: number   // epoch ms
}): Promise<Array<{
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

sdk.cost.getBudget(): Promise<{
  dailyCeiling: number | null
  weeklyCeiling: number | null
  monthlyCeiling: number | null
  dailyTokenCeiling: number | null
  weeklyTokenCeiling: number | null
  monthlyTokenCeiling: number | null
  autoPauseAtLimit: boolean
}>

sdk.cost.bySession(opts?: {
  since?: number   // epoch ms
}): Promise<Array<{
  sessionId: string
  sessionName: string
  cli: string
  totalCost: number
  totalTokens: number
  promptCount: number
  costPerPrompt: number
}>>
```

```tsx
const { todaySpend, monthSpend } = await sdk.cost.summary()
```

---

#### sdk.featureFlags

Read and write feature flags. Extensions can declare their own flags in the manifest under `contributes.featureFlags`.

**Permission:** `feature-flags:read` for reading, `feature-flags:write` for writing.

```ts
sdk.featureFlags.getAll(): Promise<Record<string, boolean>>
sdk.featureFlags.get(key: string): Promise<boolean>
sdk.featureFlags.set(key: string, value: boolean): Promise<void>
```

```tsx
const verbose = await sdk.featureFlags.get('myExtVerbose')
await sdk.featureFlags.set('myExtVerbose', true)
```

---

#### sdk.localModels

Detect and interact with locally-running AI models (Ollama, LM Studio).

**Permission:** `local-models:access`

```ts
sdk.localModels.detect(): Promise<{
  ollama: {
    connected: boolean
    models: Array<{ name: string; size?: string }>
  }
  lmstudio: {
    connected: boolean
    models: Array<{ name: string }>
  }
}>

sdk.localModels.chat(opts: {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  source?: 'ollama' | 'lmstudio'
}): Promise<{ content: string }>
```

```tsx
const { ollama } = await sdk.localModels.detect()
if (ollama.connected && ollama.models.length > 0) {
  const res = await sdk.localModels.chat({
    model: ollama.models[0].name,
    messages: [{ role: 'user', content: 'Summarize this PR diff.' }],
    source: 'ollama',
  })
  console.log(res.content)
}
```

---

#### sdk.context

Token estimation utilities.

**Permission:** `context:estimate`

```ts
sdk.context.estimateTokens(text: string): Promise<{
  tokens: number
  method: 'heuristic'
}>
```

```tsx
const { tokens } = await sdk.context.estimateTokens(longDocument)
console.log(`Approximately ${tokens} tokens`)
```

---

#### sdk.events

Subscribe to host app events. Event subscriptions are automatically registered with the host.

**Permission:** varies by event (see table below).

```ts
sdk.events.on(event: string, callback: (data: unknown) => void): () => void  // returns unsubscribe
```

| Event | Permission Required | Data |
|-------|-------------------|------|
| `session:started` | `sessions:lifecycle` | Session metadata |
| `session:stopped` | `sessions:lifecycle` | Session metadata |
| `turn:started` | `sessions:lifecycle` | Turn metadata |
| `turn:ended` | `sessions:lifecycle` | Turn metadata |
| `cost:recorded` | `cost:read` | Cost record |
| `budget:alert` | `cost:read` | Alert details |
| `theme-changed` | none | `ClearPathTheme` |
| `slot:data-changed` | none | Slot data from host page |

```tsx
const unsub = sdk.events.on('turn:ended', (data) => {
  console.log('AI turn finished:', data)
})
// Later: unsub()
```

---

#### sdk.navigate()

Programmatically navigate the host app to a route.

**Permission:** `navigation`

```ts
sdk.navigate(path: string): Promise<void>
```

```tsx
await sdk.navigate('/insights')
await sdk.navigate('/my-extension/settings')
```

## Main Process API

If your extension includes a `main` entry (CommonJS), the host calls `activate(ctx)` with an `ExtensionMainContext`.

### ExtensionMainContext

```ts
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

### Main Process Entry Example

```js
// main.cjs
module.exports = {
  activate(ctx) {
    ctx.log.info('Extension activated')

    // Register an IPC handler the renderer can call
    ctx.registerHandler('get-config', async (_event, _args) => {
      return ctx.store.get('config', { enabled: true })
    })

    ctx.registerHandler('set-config', async (_event, args) => {
      ctx.store.set('config', args)
      return { ok: true }
    })
  },

  deactivate(ctx) {
    ctx.log.info('Extension deactivated')
  },
}
```

### ctx.store

Synchronous key-value store backed by electron-store, scoped to this extension. Persists across app restarts.

```ts
ctx.store.get<T>(key: string, defaultValue?: T): T
ctx.store.set(key: string, value: unknown): void
ctx.store.delete(key: string): void
ctx.store.keys(): string[]
```

### ctx.registerHandler(channel, handler)

Register an IPC handler on a channel within this extension's namespace. The channel name is automatically prefixed with the extension's `ipcNamespace`.

Channels must be declared in the manifest's `ipcChannels` array.

```ts
ctx.registerHandler('my-channel', async (event, args) => {
  // args is whatever the caller passed
  return { result: 'ok' }
})
```

### ctx.invoke(channel, ...args)

Invoke an IPC channel registered by the host or another extension.

```ts
const result = await ctx.invoke('some-host-channel', { key: 'value' })
```

### ctx.log

Structured logger prefixed with the extension ID. Output goes to the host app's log system.

```ts
ctx.log.info('Processing started')
ctx.log.warn('Rate limit approaching')
ctx.log.error('Failed to fetch:', errorMessage)
ctx.log.debug('Verbose detail here')  // only visible with debug logging enabled
```

## Contributions

The `contributes` field in the manifest declares UI elements the extension adds to the host app. All contribution IDs are scoped to the extension.

### Navigation

Add items to the app sidebar.

```json
{
  "contributes": {
    "navigation": [
      {
        "id": "main-page",
        "path": "/my-extension",
        "label": "My Extension",
        "icon": "chart-bar-square",
        "position": "after:insights",
        "featureGate": ["myExtEnabled"]
      }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | yes | Unique ID for this nav item. |
| `path` | `string` | yes | Route path the item links to. |
| `label` | `string` | yes | Display label in the sidebar. |
| `icon` | `string` | yes | Icon name or SVG reference. |
| `position` | `string` | no | Position hint (e.g., `"top"`, `"bottom"`, `"after:insights"`). |
| `featureGate` | `string[]` | no | Feature flags that must all be enabled for this item to appear. |

### Panels

Render into named slots in the host UI.

```json
{
  "contributes": {
    "panels": [
      {
        "id": "status-panel",
        "slot": "sidebar:status",
        "label": "My Status",
        "component": "StatusPanel"
      }
    ]
  }
}
```

**Available slots:**

| Slot | Location |
|------|----------|
| `sidebar:status` | Sidebar status area, above the divider. |
| `home:widgets` | Home/Dashboard page, inline panel. |
| `session-summary:after-stats` | Below session statistics in summary view. |

### Widgets

Dashboard widgets for the customizable grid-layout dashboard.

```json
{
  "contributes": {
    "widgets": [
      {
        "id": "metrics-widget",
        "name": "My Metrics",
        "description": "Shows key metrics from my service",
        "defaultSize": { "w": 2, "h": 2 },
        "component": "MetricsWidget"
      }
    ]
  }
}
```

### Tabs

Add tabs to existing tabbed pages.

```json
{
  "contributes": {
    "tabs": [
      {
        "id": "my-insights-tab",
        "page": "insights",
        "label": "My Data",
        "component": "InsightsTab",
        "position": "end"
      }
    ]
  }
}
```

**Supported pages:** `"insights"`

**Position:** `"start"`, `"end"` (default), or a numeric index.

### Sidebar Widgets

Compact widgets rendered directly in the sidebar.

```json
{
  "contributes": {
    "sidebarWidgets": [
      {
        "id": "quick-status",
        "label": "Quick Status",
        "component": "QuickStatus",
        "position": "status"
      }
    ]
  }
}
```

**Position:** `"status"` (above divider, default) or `"bottom"` (above collapse button).

### Session Hooks

Subscribe to session lifecycle events from the manifest. The host calls the named handler on your IPC namespace when the event fires.

**Permission:** `sessions:lifecycle`

```json
{
  "contributes": {
    "sessionHooks": [
      { "event": "turn:ended", "handler": "my-ext:on-turn-ended" }
    ]
  }
}
```

**Available events:** `session:started`, `session:stopped`, `turn:started`, `turn:ended`

The handler must be declared in `ipcChannels` and registered via `ctx.registerHandler()` in the main process entry.

### Context Providers

Declare data sources that users can attach to AI sessions as additional context.

```json
{
  "contributes": {
    "contextProviders": [
      {
        "id": "my-context",
        "label": "My Data Source",
        "description": "Injects project metrics into AI sessions",
        "icon": "database",
        "parameters": [
          {
            "id": "project",
            "label": "Project",
            "type": "text",
            "required": true,
            "placeholder": "e.g. acme-widgets"
          },
          {
            "id": "scope",
            "label": "Scope",
            "type": "select",
            "options": [
              { "value": "summary", "label": "Summary" },
              { "value": "detailed", "label": "Detailed" }
            ]
          }
        ],
        "handler": "my-ext:build-context",
        "examples": ["What are our project metrics?", "Show recent activity"],
        "maxTokenEstimate": 2000
      }
    ]
  }
}
```

**Parameter types:** `"text"`, `"repo-picker"`, `"project-picker"`, `"select"`

The `handler` IPC channel receives the filled parameter values and should return a string of context to inject.

### Feature Flags

Declare feature flags the extension manages. Users can toggle these in the app's feature flags UI.

```json
{
  "contributes": {
    "featureFlags": ["myExtEnabled", "myExtVerboseMode"]
  }
}
```

Read and write these via `sdk.featureFlags.get()` and `sdk.featureFlags.set()`.

## Communication Protocol

Extensions communicate with the host via `MessagePort`. The protocol uses three message types:

### Request (extension -> host)

```ts
{ type: 'ext:request', id: string, method: string, params?: unknown }
```

`method` is a dot-delimited SDK method name (e.g., `"github.listRepos"`, `"storage.get"`).

### Response (host -> extension)

```ts
{ type: 'ext:response', id: string, result?: unknown, error?: { code: string, message: string } }
```

### Event (host -> extension)

```ts
{ type: 'ext:event', event: string, data: unknown }
```

Requests time out after **30 seconds**. Request IDs are correlated between request and response for multiplexing.

## Security Model

Extensions operate under six security layers:

1. **Permission gating** -- Every SDK call is checked against the extension's granted permissions. Unauthorized calls reject with an error.
2. **Sandboxed iframe** -- Renderer code runs in an iframe with a restricted Content Security Policy. No direct access to Node.js or Electron APIs.
3. **Domain allowlisting** -- HTTP requests via `sdk.http.fetch()` are only permitted to domains declared in `allowedDomains`.
4. **Isolated storage** -- Each extension's storage is scoped by its ID and encrypted. Extensions cannot access other extensions' data.
5. **Storage quotas** -- Extensions are limited to their declared `storageQuota` (or the host default). Exceeding the quota rejects writes.
6. **Manifest validation** -- The host validates the manifest schema, file integrity, and path safety before loading any extension code.

## TypeScript Types

All types are exported from the package root:

```ts
import type {
  ExtensionSDK,              // Full renderer SDK interface
  ExtensionManifest,         // clearpath-extension.json schema
  ExtensionPermission,       // Union of all 17 permission strings
  ExtensionMainContext,      // Main process activate(ctx) argument
  ClearPathTheme,            // Theme object { primary, sidebar, accent, isDark }
  CreateExtensionOptions,    // createExtension() options
  NavContribution,           // Navigation item in contributes
  PanelContribution,         // Panel slot in contributes
  WidgetContribution,        // Dashboard widget in contributes
  TabContribution,           // Tab in contributes
  SidebarWidgetContribution, // Sidebar widget in contributes
  SessionHookContribution,   // Session hook in contributes
  ContextProviderContribution, // Context provider in contributes
  ExtensionRequirement,      // Required integration
} from '@clearpath/extension-sdk'
```

## Version

Current: **0.2.0**
