# Extension Permissions Reference

Extensions declare required permissions in the manifest `permissions` array. User-installed extensions require user consent at install time; bundled extensions are auto-granted.

## All 17 Permissions

| Permission | SDK Namespace / Method | Grants | Typical Use Case |
|------------|----------------------|--------|-----------------|
| `storage` | `sdk.storage.*` | Encrypted key-value store (default 5 MB, max 50 MB) | Persisting config, caches, state |
| `notifications:emit` | `sdk.notifications.emit()` | Send user-visible toast notifications | Alerting users of events, status changes |
| `integration:github:read` | `sdk.github.listRepos/listPulls/getPull/listIssues/search` | Read repos, PRs, issues via GitHub API | Displaying GitHub data |
| `integration:github:write` | via `ctx.invoke()` in main process | Create/modify issues, comments, PRs | Automating GitHub workflows |
| `integration:backstage:read` | via `ctx.invoke()` in main process | Read Backstage catalog entities | Exploring service catalog |
| `env:read` | `sdk.env.get()`, `sdk.env.keys()` | Read environment variable names/values | Accessing app configuration |
| `http:fetch` | `sdk.http.fetch()` | HTTP requests to `allowedDomains` only | Calling external APIs |
| `navigation` | `sdk.navigate()` | Programmatic app navigation | Linking between views |
| `compliance:log` | via `ctx.invoke()` in main process | Write audit log entries | Compliance tracking |
| `sessions:read` | `sdk.sessions.list/getMessages/getActive` | Query session list, messages, active session | Analyzing conversation data |
| `sessions:lifecycle` | Session hooks + `sdk.events.on('session:*', 'turn:*')` | Subscribe to session/turn start/stop events | Tracking real-time activity |
| `cost:read` | `sdk.cost.summary/list/getBudget/bySession` | View cost summaries, records, budgets | Usage analytics |
| `feature-flags:read` | `sdk.featureFlags.getAll()`, `sdk.featureFlags.get()` | Read feature toggle state | Conditional features |
| `feature-flags:write` | `sdk.featureFlags.set()` | Modify feature toggles | Enabling/disabling features |
| `local-models:access` | `sdk.localModels.detect()`, `sdk.localModels.chat()` | Detect and chat with Ollama/LM Studio | Local AI processing |
| `context:estimate` | `sdk.context.estimateTokens()` | Estimate token counts for text | Context size management |
| `notes:read` | via `ctx.invoke()` in main process | Read knowledge-base notes | Accessing annotations |
| `skills:read` | via `ctx.invoke()` in main process | List available skills and metadata | Skill-aware features |

## Permission Enforcement Layers

Permissions are enforced at four levels:

### 1. Manifest Declaration
The extension must list the permission in its `permissions[]` array. Unknown permission strings cause a validation error at load time.

### 2. User Consent (User-Installed Extensions)
When a user installs an extension, the permission list is shown for review. The extension cannot load until all permissions are approved. Bundled extensions (shipped with the app) skip this step.

### 3. Renderer Runtime Check
When an extension sends an `ext:request` via MessagePort, the `ExtensionHost` component validates that the extension has the permission required for the requested SDK method before forwarding to the main process.

### 4. Main Process Double-Check
For `ctx.invoke()` calls from main process extensions, the `ExtensionMainLoader.checkInvokePermission()` method validates the extension's permissions against a channel-to-permission map. Unmapped channels are denied by default.

## Host IPC Channel to Permission Map

The main process maps IPC channels to required permissions:

```
integration:github-repos        -> integration:github:read
integration:github-pulls        -> integration:github:read
integration:github-pull-detail  -> integration:github:read
integration:github-issues       -> integration:github:read
integration:github-search       -> integration:github:read
integration:backstage-entities  -> integration:backstage:read
sessions:list / cli:list-sessions -> sessions:read
sessions:get-messages / cli:get-message-log -> sessions:read
cost:summary / cost:list / cost:get-budget / cost:by-session -> cost:read
feature-flags:get               -> feature-flags:read
feature-flags:set               -> feature-flags:write
local-models:detect / local-models:chat -> local-models:access
notes:list / notes:get          -> notes:read
skills:list / skills:get        -> skills:read
context:estimate-tokens         -> context:estimate
extension:notify / notifications:emit -> notifications:emit
```

## Choosing Permissions

Follow the **principle of least privilege**:

1. Only request permissions your extension actually uses.
2. If you only need to read GitHub data, use `integration:github:read` -- do not also request `integration:github:write`.
3. `feature-flags:read` and `feature-flags:write` are separate -- only request write if you need to toggle flags.
4. `sessions:read` gives access to conversation content -- consider the privacy implications.
5. `http:fetch` requires `allowedDomains` in the manifest -- the host rejects requests to unlisted domains.
