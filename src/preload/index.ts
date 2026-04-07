import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// ── IPC Channel Whitelist ──────────────────────────────────────────────────────
// Security: Only channels explicitly listed here can be invoked from the renderer.
// This prevents XSS or compromised renderer code from calling arbitrary IPC handlers.

const ALLOWED_INVOKE_CHANNELS = new Set([
  // App
  'app:get-cwd',

  // Auth
  'auth:get-status', 'auth:refresh', 'auth:login-start', 'auth:login-cancel',

  // CLI Sessions
  'cli:check-installed', 'cli:check-auth',
  'cli:start-session', 'cli:send-input', 'cli:send-slash-command', 'cli:stop-session',
  'cli:list-sessions', 'cli:get-session', 'cli:get-message-log',
  'cli:get-persisted-sessions', 'cli:delete-session', 'cli:delete-sessions',
  'cli:archive-session', 'cli:rename-session', 'cli:search-sessions',

  // Agents
  'agent:list', 'agent:create', 'agent:read-file', 'agent:write-file', 'agent:delete',
  'agent:get-enabled', 'agent:set-enabled', 'agent:get-active', 'agent:set-active',
  'agent:get-profiles', 'agent:save-profile', 'agent:apply-profile', 'agent:delete-profile',

  // Session History
  'session-history:add', 'session-history:list', 'session-history:clear', 'session-history:update',

  // Memory & Notes
  'memory:list-files', 'memory:read-file', 'memory:write-file', 'memory:delete-file',
  'memory:list-memory-entries',
  'notes:list', 'notes:get', 'notes:create', 'notes:update', 'notes:delete',
  'notes:tags', 'notes:stats', 'notes:pick-files', 'notes:read-attachment', 'notes:get-full-content',

  // File Explorer
  'files:list', 'files:is-protected', 'files:watch', 'files:unwatch',

  // Git
  'git:status', 'git:log', 'git:diff', 'git:file-diff', 'git:revert-file',
  'git:worktrees', 'git:create-worktree', 'git:remove-worktree', 'git:branch-protection',

  // Workspaces
  'workspace:list', 'workspace:get-active', 'workspace:set-active',
  'workspace:create', 'workspace:delete', 'workspace:update',
  'workspace:add-repo', 'workspace:remove-repo', 'workspace:get-repo-info',
  'workspace:activity-feed', 'workspace:clone-repo',

  // Settings
  'settings:get', 'settings:set', 'settings:update-flag', 'settings:reset-flag', 'settings:reset-all',
  'settings:set-model', 'settings:set-budget',
  'settings:get-env-vars', 'settings:set-env-var',
  'settings:list-profiles', 'settings:save-profile', 'settings:load-profile',
  'settings:delete-profile', 'settings:export-profile', 'settings:import-profile',
  'settings:list-plugins', 'settings:open-terminal',

  // Cost & Budget
  'cost:list', 'cost:record', 'cost:check-budget', 'cost:get-budget', 'cost:set-budget',
  'cost:summary', 'cost:daily-spend', 'cost:by-session', 'cost:by-agent', 'cost:by-model',
  'cost:export-csv', 'cost:clear',
  'cost:get-display-mode', 'cost:set-display-mode',

  // Tools & MCP
  'tools:list-mcp-servers', 'tools:add-mcp-server', 'tools:remove-mcp-server',
  'tools:toggle-mcp-server', 'tools:get-settings', 'tools:save-settings',

  // Skills
  'skills:list', 'skills:get', 'skills:save', 'skills:toggle', 'skills:delete',
  'skills:record-usage', 'skills:get-usage-stats', 'skills:get-starters',
  'skills:export', 'skills:import',

  // Templates & Workflows
  'templates:list', 'templates:get', 'templates:save', 'templates:delete',
  'templates:import', 'templates:export', 'templates:record-usage', 'templates:usage-stats',
  'workflow:list', 'workflow:get', 'workflow:save', 'workflow:delete',
  'workflow:estimate-cost', 'workflow:record-usage',

  // Notifications & Webhooks
  'notifications:emit', 'notifications:list', 'notifications:unread-count',
  'notifications:mark-read', 'notifications:mark-all-read', 'notifications:dismiss',
  'notifications:clear-all', 'notifications:get-prefs', 'notifications:set-prefs',
  'notifications:list-webhooks', 'notifications:save-webhook',
  'notifications:delete-webhook', 'notifications:test-webhook',

  // Compliance & Audit
  'compliance:log-event', 'compliance:get-log', 'compliance:scan-text',
  'compliance:get-file-patterns', 'compliance:set-file-patterns',
  'compliance:check-file', 'compliance:security-events',
  'compliance:export-snapshot',

  // Policy
  'policy:get-active', 'policy:set-active', 'policy:list-presets',
  'policy:save-preset', 'policy:delete-preset', 'policy:check-action',
  'policy:get-violations', 'policy:import', 'policy:export',

  // Data Management
  'data:get-storage-stats', 'data:clear-store', 'data:clear-all',
  'data:get-notes-for-compact', 'data:compact-notes',

  // Knowledge Base
  'kb:list-files', 'kb:read-file', 'kb:search', 'kb:get-sections',
  'kb:update', 'kb:generate', 'kb:export-file', 'kb:export-merged', 'kb:ask',

  // Learning & Onboarding
  'learn:get-paths', 'learn:select-path', 'learn:get-progress', 'learn:complete-lesson',
  'learn:dismiss', 'learn:unlock-achievement', 'learn:get-achievements',
  'learn:get-help-clicked', 'learn:record-help-click', 'learn:reset',
  'onboarding:get-state', 'onboarding:complete-guided-task', 'onboarding:record-feature',
  'onboarding:complete', 'onboarding:set-training-mode', 'onboarding:reset',

  // Dashboard & Branding
  'dashboard:get-active-layout', 'dashboard:list-layouts', 'dashboard:set-active',
  'dashboard:save-layout', 'dashboard:reset-layout',
  'branding:get', 'branding:set', 'branding:apply-preset', 'branding:reset', 'branding:get-presets',
  'feature-flags:get', 'feature-flags:set', 'feature-flags:reset',
  'feature-flags:apply-preset', 'feature-flags:get-presets',

  // Team & Integrations
  'integration:get-status', 'integration:github-connect', 'integration:github-disconnect',
  'integration:github-repos', 'integration:github-pulls', 'integration:github-pull-detail',
  'integration:github-issues', 'integration:github-search',
  'team:set-shared-folder', 'team:get-shared-folder', 'team:clear-shared-folder',
  'team:list-shared-configs', 'team:apply-shared-config', 'team:git-activity',
  'team:import-bundle', 'team:export-bundle', 'team:check-setup',
  'team:list-marketplace', 'team:install-marketplace-agent', 'team:uninstall-marketplace-agent',

  // Scheduler
  'scheduler:list', 'scheduler:get', 'scheduler:save', 'scheduler:delete',
  'scheduler:duplicate', 'scheduler:toggle', 'scheduler:run-now', 'scheduler:templates',

  // Sub-Agents
  'subagent:list', 'subagent:spawn', 'subagent:get-output',
  'subagent:kill', 'subagent:pause', 'subagent:resume',
  'subagent:kill-all', 'subagent:check-queue-installed',
  'subagent:pop-out', 'subagent:fleet-status',

  // Local Models
  'local-models:is-available', 'local-models:detect',

  // Auto-updater
  'updater:check', 'updater:install',

  // Accessibility
  'accessibility:get', 'accessibility:set', 'accessibility:reset',

  // Wizards
  'wizard:get-config', 'wizard:save-config', 'wizard:reset-config',
  'wizard:get-state', 'wizard:mark-completed',
  'wizard:get-context-settings', 'wizard:set-context-settings', 'wizard:build-prompt',
  'setup-wizard:is-complete', 'setup-wizard:get-state', 'setup-wizard:update-step',

  // Starter Pack (agents, skills, memories, prompts, handoffs)
  'starter-pack:get-agents', 'starter-pack:get-agent', 'starter-pack:get-visible-agents',
  'starter-pack:get-skills', 'starter-pack:get-skill',
  'starter-pack:get-memories', 'starter-pack:get-memory',
  'starter-pack:get-memory-data', 'starter-pack:save-memory-data',
  'starter-pack:get-prompts', 'starter-pack:get-all-prompts',
  'starter-pack:get-setup-state', 'starter-pack:record-interaction',
  'starter-pack:dismiss-memory-prompt', 'starter-pack:should-prompt-memory',
  'starter-pack:check-handoff', 'starter-pack:build-handoff-context',
  'starter-pack:get-agent-prompt',

  // PR Scores (experimental)
  'pr-scores:get-config', 'pr-scores:set-config',
  'pr-scores:collect-prs', 'pr-scores:score-pr', 'pr-scores:score-all',
  'pr-scores:get-scores', 'pr-scores:get-score-detail',
  'pr-scores:calculate-metrics', 'pr-scores:get-repo-metrics',
  'pr-scores:compute-deltas', 'pr-scores:build-ai-context',
  'pr-scores:clear-scores', 'pr-scores:list-scored-repos',
  'pr-scores:export-csv',
])

// Channels the main process pushes to the renderer via webContents.send()
const ALLOWED_RECEIVE_CHANNELS = new Set([
  'auth:login-output', 'auth:login-complete', 'auth:status-changed',
  'cli:output', 'cli:error', 'cli:exit', 'cli:turn-start', 'cli:turn-end',
  'cli:permission-request', 'cli:usage',
  'files:changed',
  'notification:new',
  'subagent:output', 'subagent:spawned', 'subagent:status-changed',
  'updater:status',
])

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked listener for unknown channel: ${channel}`)
      return () => {}
    }
    // Wrap callback to avoid passing IpcRendererEvent across context bridge
    // (Electron 39+ sandbox can't serialize the event object)
    const wrapped = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  },

  off: (channel: string, _callback: (...args: unknown[]) => void): void => {
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) return
    ipcRenderer.removeAllListeners(channel)
  },
})
