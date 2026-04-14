---
name: extension-sdk
description: ClearPathAI Extension SDK v0.2.0 reference — manifest schema, SDK API surface, permissions, contributions, security model, and patterns. Auto-loads when editing extension code.
user-invocable: false
paths: "**/extensions/**,**/extension-sdk/**,**/clearpath-extension.json,**/ExtensionHost*,**/ExtensionManager*,**/ExtensionRegistry*,**/ExtensionValidator*,**/ExtensionMainLoader*,**/ExtensionStore*,**/extensionHandlers*"
---

# ClearPathAI Extension SDK Reference

Standing guidance for building and maintaining ClearPathAI extensions. This skill auto-loads when you edit extension-related files.

**SDK Version**: 0.2.0
**Package**: `@clearpath/extension-sdk`
**Min App Version**: 1.8.0

## Quick Facts

- Extensions run in **sandboxed iframes** (renderer) + **Node.js** (main process)
- Communication via **MessagePort** protocol with 30s timeout
- **17 permissions** gate all SDK calls
- Each extension has **encrypted isolated storage** (default 5 MB, max 50 MB)
- Extension IDs use **reverse-domain format**: `com.company.extension-name`
- Versions must be **semver**: `MAJOR.MINOR.PATCH`

## Extension Directory Structure

```
extensions/com.company.my-extension/
  clearpath-extension.json    # Manifest (required)
  dist/
    main.cjs               # Main process (Node.js, CommonJS)
    renderer.js            # Renderer (iframe, IIFE or React)
  assets/
    icon.svg
```

## Core Patterns

### Main Process (main.cjs)
- Export `{ activate, deactivate }` via `module.exports`
- `activate(ctx)` receives `ExtensionMainContext` with `store`, `log`, `registerHandler`, `invoke`
- All IPC handlers must use the extension's `ipcNamespace` prefix
- Return `{ success: boolean, data?: any, error?: string }` envelopes
- Handlers are auto-unregistered on deactivate -- only clean up timers/watchers

### Renderer (renderer.js)
Two patterns are supported:

**IIFE (no build step)**:
- Self-contained JavaScript wrapped in `(function() { ... })()`
- Bootstrap via `window.__clearpath_port` and `window.__clearpath_extension_id`
- Use MessagePort `ext:request`/`ext:response` protocol directly
- Route components via `window.__clearpath_component`
- **Root element is `ext-root`** -- use `document.getElementById('ext-root')` with fallback chain: `|| document.getElementById('root') || document.body`

**React (with SDK package)**:
- Import `createExtension`, `useSDK`, `ClearPathProvider` from `@clearpath/extension-sdk`
- Default-export result of `createExtension({ components, activate?, deactivate? })`
- Components access SDK via `useSDK()` hook

### Manifest (clearpath-extension.json)
- Required fields: `id`, `name`, `version`, `description`, `author`, `permissions`
- All `ipcChannels` entries must start with `ipcNamespace:`
- `contributes` supports: navigation, panels, widgets, tabs, sidebarWidgets, sessionHooks, contextProviders, featureFlags

## SDK Namespaces (Renderer)

| Namespace | Permission | Key Methods |
|-----------|-----------|-------------|
| `sdk.github` | `integration:github:read` | `listRepos`, `listPulls`, `getPull`, `listIssues`, `search` |
| `sdk.notifications` | `notifications:emit` | `emit` |
| `sdk.storage` | `storage` | `get`, `set`, `delete`, `keys`, `quota` |
| `sdk.env` | `env:read` | `get`, `keys` |
| `sdk.http` | `http:fetch` | `fetch` (allowedDomains only) |
| `sdk.theme` | none | `get`, `onChange` |
| `sdk.sessions` | `sessions:read` | `list`, `getMessages`, `getActive` |
| `sdk.cost` | `cost:read` | `summary`, `list`, `getBudget`, `bySession` |
| `sdk.featureFlags` | `feature-flags:read`/`write` | `getAll`, `get`, `set` |
| `sdk.localModels` | `local-models:access` | `detect`, `chat` |
| `sdk.context` | `context:estimate` | `estimateTokens` |
| `sdk.events` | varies by event | `on` |
| `sdk.navigate()` | `navigation` | direct call |

## Main Process Context (ctx)

| Property/Method | Description |
|----------------|-------------|
| `ctx.extensionId` | Extension's manifest ID |
| `ctx.extensionPath` | Absolute path to extension root |
| `ctx.registerHandler(channel, handler)` | Register IPC handler (must use namespace prefix) |
| `ctx.invoke(channel, ...args)` | Call host IPC channels (permission-checked) |
| `ctx.store.get(key, default?)` | Synchronous storage read |
| `ctx.store.set(key, value)` | Synchronous storage write |
| `ctx.store.delete(key)` | Delete storage key |
| `ctx.store.keys()` | List all keys |
| `ctx.log.info/warn/error/debug(...)` | Structured logging |

## Reference Materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/manifest-reference.md](references/manifest-reference.md) | Complete manifest field reference | Writing or validating clearpath-extension.json |
| [references/permissions-reference.md](references/permissions-reference.md) | All 17 permissions with SDK mapping | Choosing permissions for an extension |
| [references/sdk-api-reference.md](references/sdk-api-reference.md) | Full SDK API -- all 13 namespaces | Using any sdk.* method in renderer code |
| [references/main-process-api.md](references/main-process-api.md) | ExtensionMainContext API | Writing main.cjs activate/deactivate |
| [references/contributions-reference.md](references/contributions-reference.md) | Navigation, panels, widgets, tabs, hooks, providers | Adding UI contributions to manifest |
| [references/security-model.md](references/security-model.md) | 6 security layers, CSP, domain allowlist | Understanding security constraints |
| [references/communication-protocol.md](references/communication-protocol.md) | MessagePort protocol, message types, timeouts | Debugging communication issues |
| [references/storage-system.md](references/storage-system.md) | Storage API, quotas, encryption | Using persistent storage |

## Packaging & Installation

Extensions are distributed as `.clear.ext` files. The SDK includes a packaging script:

```bash
# Package a single extension
node extension-sdk/scripts/package-extension.js extensions/com.company.my-ext

# Package with custom output directory
node extension-sdk/scripts/package-extension.js extensions/com.company.my-ext --output dist-extensions/

# Package all bundled extensions (root convenience script)
npm run package:extensions
```

The script validates the manifest, zips all files (excluding `node_modules/`, `.git/`, `package-lock.json`), and outputs `<id>-v<version>.clear.ext`.

Users install extensions via Configure > Extensions > Install, which accepts `.clear.ext` files.

## Examples

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/minimal-extension.md](examples/minimal-extension.md) | Bare minimum extension | Starting a new extension from scratch |
| [examples/full-extension.md](examples/full-extension.md) | Complete extension with all features | Need a comprehensive reference |
| [examples/context-provider.md](examples/context-provider.md) | AI context provider pattern | Building context injection for AI sessions |
| [examples/session-hooks.md](examples/session-hooks.md) | Session lifecycle hooks | Tracking session events |
| [examples/renderer-patterns.md](examples/renderer-patterns.md) | Renderer UI patterns (IIFE + React) | Building extension UIs |
