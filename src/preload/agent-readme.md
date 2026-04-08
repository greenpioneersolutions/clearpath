# Preload — Electron context bridge to main process

## Purpose
This folder contains the preload script that establishes secure IPC communication between the renderer process (GUI) and the main process (Electron backend). The preload script implements a security-hardened channel whitelist preventing XSS attacks from accessing arbitrary IPC handlers.

## Files
| File | Description | Key Exports / Interfaces |
|------|-------------|------------------------|
| index.ts | IPC channel whitelist, context bridge setup, invoke/on wrappers | ALLOWED_INVOKE_CHANNELS (Set), ALLOWED_RECEIVE_CHANNELS (Set), window.electronAPI |

## Architecture Notes

### Security Model
- **Whitelist approach**: Only explicitly allowed channels are accessible from renderer
- **Channel validation**: Both `invoke()` and `on()` check against allow-lists before executing
- **Error handling**: Unknown `invoke` channels reject with error; unknown `on` channels warn to console
- **XSS protection**: Compromised renderer code cannot access arbitrary IPC handlers

### ALLOWED_INVOKE_CHANNELS (Main -> Renderer request-response)
170+ channels organized by domain:

**App & Auth** (6 channels)
- `app:get-cwd` — current working directory
- `auth:get-status`, `auth:refresh`, `auth:login-start`, `auth:login-cancel` — authentication

**CLI Sessions** (10 channels)
- `cli:check-installed`, `cli:check-auth`
- `cli:start-session`, `cli:send-input`, `cli:send-slash-command`, `cli:stop-session`
- `cli:list-sessions`, `cli:get-session`, `cli:get-message-log`, `cli:get-persisted-sessions`, `cli:delete-session`

**Agents** (7 channels)
- `agent:list`, `agent:create`, `agent:read-file`, `agent:write-file`, `agent:delete`
- `agent:get-enabled`, `agent:set-enabled`, `agent:get-active`, `agent:set-active`, `agent:get-profiles`, `agent:save-profile`, `agent:apply-profile`, `agent:delete-profile`

**Cost & Budget** (9 channels)
- `cost:summary`, `cost:daily-spend`, `cost:by-session`, `cost:by-model`, `cost:by-agent`
- `cost:set-display-mode`, `cost:export-csv`, `cost:clear`, `cost:check-budget`

**Tools & MCP** (5 channels)
- `tools:list-mcp-servers`, `tools:add-mcp-server`, `tools:remove-mcp-server`, `tools:toggle-mcp-server`, `tools:get-settings`, `tools:save-settings`

**Policies & Compliance** (8 channels)
- `policy:get-active`, `policy:set-active`, `policy:list-presets`, `policy:save-preset`, `policy:delete-preset`, `policy:check-action`, `policy:get-violations`
- `compliance:log-event`, `compliance:get-log`, `compliance:scan-text`, `compliance:get-file-patterns`, `compliance:set-file-patterns`, `compliance:export-snapshot`

**Settings & Configurations** (15 channels)
- `settings:get`, `settings:set`, `settings:update-flag`, `settings:reset-flag`, `settings:reset-all`
- `settings:set-model`, `settings:set-budget`, `settings:get-env-vars`, `settings:set-env-var`
- `settings:list-profiles`, `settings:save-profile`, `settings:load-profile`, `settings:delete-profile`, `settings:export-profile`, `settings:import-profile`

**Learning & Onboarding** (15 channels)
- `learn:get-paths`, `learn:select-path`, `learn:get-progress`, `learn:complete-lesson`, `learn:dismiss`, `learn:unlock-achievement`, `learn:get-achievements`
- `onboarding:get-state`, `onboarding:complete-guided-task`, `onboarding:record-feature`, `onboarding:complete`, `onboarding:set-training-mode`, `onboarding:reset`

**Sub-Agents** (8 channels)
- `subagent:list`, `subagent:spawn`, `subagent:get-output`, `subagent:kill`, `subagent:pause`, `subagent:resume`, `subagent:kill-all`, `subagent:fleet-status`

**Team & Integrations** (10 channels)
- `integration:get-status`, `integration:github-connect`, `integration:github-disconnect`, `integration:github-repos`, `integration:github-pulls`, `integration:github-issues`, `integration:github-search`
- `team:set-shared-folder`, `team:get-shared-folder`, `team:import-bundle`, `team:export-bundle`

**PR Scores (Experimental)** (9 channels)
- `pr-scores:get-config`, `pr-scores:set-config`, `pr-scores:collect-prs`, `pr-scores:score-pr`, `pr-scores:score-all`, `pr-scores:get-scores`, `pr-scores:get-score-detail`, `pr-scores:calculate-metrics`, `pr-scores:export-csv`

**Other** (scheduler, dashboard, branding, accessibility, updater, knowledge base, data management, file explorer, git, workspaces, skills, templates, notifications, feature flags)

### ALLOWED_RECEIVE_CHANNELS (Renderer listener channels)
13 channels for main -> renderer push events:
- `auth:login-output`, `auth:login-complete`, `auth:status-changed` — authentication events
- `cli:output`, `cli:error`, `cli:exit`, `cli:turn-start`, `cli:turn-end` — session streaming
- `cli:permission-request`, `cli:usage` — permission and usage reporting
- `files:changed` — file system change notifications
- `notification:new` — incoming notifications
- `subagent:output`, `subagent:spawned`, `subagent:status-changed` — sub-agent updates
- `updater:status` — auto-updater status

### window.electronAPI Implementation
```typescript
invoke(channel: string, ...args: unknown[]): Promise<unknown>
  // Validates channel against ALLOWED_INVOKE_CHANNELS
  // Delegates to ipcRenderer.invoke()
  
on(channel: string, callback: (...args: unknown[]) => void): (() => void)
  // Validates channel against ALLOWED_RECEIVE_CHANNELS
  // Wraps callback to strip IpcRendererEvent (Electron 39+ sandbox limitation)
  // Returns cleanup function to remove listener
```

## Business Context
- **Security**: Prevents XSS exploitation by strictly controlling what main-process APIs are accessible
- **Separation of concerns**: Clear protocol between GUI (renderer) and backend (main process)
- **IPC contract**: Serves as documentation for all available main-process handlers
- **Scalability**: Whitelist-first approach makes it easy to audit and add new channels
