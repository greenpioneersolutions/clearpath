# IPC — Main process event handlers for renderer communication

## Purpose
Implements the Electron IPC (Inter-Process Communication) interface between the renderer and main process. Contains 34+ handler registration functions that expose main process services (CLIManager, AuthManager, agents, settings, costs, compliance, notifications, etc.) to the renderer via `ipcMain.handle()` and `ipcMain.on()` patterns.

## Files (34 handler registration modules)
| File | Description | Key Channels |
|------|-------------|--------------|
| handlers.ts | Core CLI session management | cli:check-installed, cli:check-auth, cli:start-session, cli:send-input, cli:stop-session, cli:list-sessions, cli:get-session, cli:get-message-log, cli:get-persisted-sessions, cli:delete-session, cli:search-sessions |
| authHandlers.ts | Auth status and login flows | auth:get-status, auth:refresh, auth:login-start, auth:login-cancel (receives auth:login-output, auth:login-complete push events) |
| agentHandlers.ts | Agent CRUD and state management | agent:list, agent:create, agent:read-file, agent:write-file, agent:delete, agent:get-enabled, agent:set-enabled, agent:get-active, agent:set-active, agent:get-profiles, agent:save-profile, agent:apply-profile, agent:delete-profile |
| settingsHandlers.ts | App settings, env vars, config profiles | settings:get, settings:set, settings:get-profiles, settings:save-profile, settings:load-profile, settings:delete-profile, settings:update-env-vars, settings:store-credential, settings:retrieve-credential |
| costHandlers.ts | Cost tracking and budget enforcement | cost:get-records, cost:get-summary, cost:get-budget, cost:set-budget, cost:get-analytics-mode, cost:set-analytics-mode, cost:clear-records |
| complianceHandlers.ts | Audit logging and security events | compliance:get-audit-log, compliance:add-entry, compliance:clear-log, compliance:export-log, compliance:get-policy, compliance:set-policy |
| notificationHandlers.ts | Notification center (central hub) | notification:get-all, notification:get-unread, notification:mark-read, notification:dismiss, notification:clear-all |
| noteHandlers.ts | Note taking and file attachments | note:create, note:update, note:delete, note:list, note:search, note:get-attachments, note:attach-file, note:detach-file |
| dashboardHandlers.ts | Dashboard layout and widgets | dashboard:get-active-layout, dashboard:set-active-layout, dashboard:save-layout, dashboard:reset-layouts |
| memoryHandlers.ts | Config file discovery (instructions, settings, agents, skills) | memory:list-config-files, memory:read-config-file, memory:write-config-file, memory:delete-config-file |
| templateHandlers.ts | Session templates and quick-start prompts | template:list, template:create, template:update, template:delete, template:use |
| skillHandlers.ts | Skill definitions and marketplace | skill:list, skill:get, skill:enable, skill:disable, skill:install, skill:uninstall |
| teamHandlers.ts | Team management, members, roles | team:get-info, team:list-members, team:add-member, team:remove-member, team:set-role |
| workspaceHandlers.ts | Workspace settings, allowed directories | workspace:get-config, workspace:set-config, workspace:get-allowed-roots, workspace:add-root, workspace:remove-root |
| integrationHandlers.ts | External integrations (Slack, GitHub, etc.) | integration:list, integration:connect, integration:disconnect, integration:test-connection |
| knowledgeBaseHandlers.ts | Knowledge base indexing and search | kb:index-repository, kb:search, kb:list-indexes, kb:delete-index |
| learnHandlers.ts | Learning/onboarding system (large file) | learn:get-modules, learn:mark-complete, learn:get-progress, learn:list-lessons |
| wizardHandlers.ts | Guided setup wizards | wizard:start, wizard:get-step, wizard:complete-step, wizard:cancel |
| toolHandlers.ts | Tool availability and permissions | tool:list-available, tool:check-permission, tool:approve-tool, tool:deny-tool |
| subAgentHandlers.ts | Delegated sub-agent tasks | subagent:start, subagent:get-status, subagent:list, subagent:cancel |
| onboardingHandlers.ts | First-run onboarding flow | onboarding:get-status, onboarding:mark-complete, onboarding:reset |
| featureFlagHandlers.ts | Feature flag evaluation | flag:is-enabled, flag:list-flags, flag:set-flag |
| dataManagementHandlers.ts | Data export, import, purge | data:export-all, data:import-all, data:purge-sessions, data:purge-costs, data:purge-all |
| fileExplorerHandlers.ts | File browser and repo exploration | explorer:list-directory, explorer:get-file-info, explorer:search-files |
| gitHandlers.ts | Git repo operations | git:get-status, git:get-log, git:get-branches, git:create-branch, git:switch-branch |
| policyHandlers.ts | Security/usage policies | policy:get, policy:set, policy:list-violations, policy:check-compliance |
| brandingHandlers.ts | App branding (colors, logos, themes) | branding:get-theme, branding:set-theme, branding:get-custom-config, branding:set-custom-config |
| prScoresHandlers.ts | PR/code review scoring (large file) | pr-score:analyze, pr-score:get-history, pr-score:list-metrics |
| starterPackHandlers.ts | Built-in starter agents and templates | starter-pack:list-agents, starter-pack:list-templates, starter-pack:install-pack |
| accessibilityHandlers.ts | Accessibility settings (screen reader, high contrast) | accessibility:get-settings, accessibility:set-settings |
| workflowHandlers.ts | Workflow automation and scheduling | workflow:list, workflow:create, workflow:update, workflow:delete, workflow:run |
| schedulerHandlers.ts | Task scheduling and cron | scheduler:list-tasks, scheduler:create-task, scheduler:delete-task, scheduler:get-status |
| sessionHistoryHandlers.ts | Session history UI (search, filter, export) | session:export-history, session:filter-history, session:get-timeline |
| localModelHandlers.ts | Local model server detection | local-model:detect-servers, local-model:list-models |

## Architecture Notes
- **Handler pattern**: Each register*Handlers() function exported, called once in index.ts before app.ready(). Takes ipcMain and relevant manager singletons.
- **Response types**: Handlers return promises (via ipcMain.handle()) for async operations; some use ipcMain.on() for one-way messages or push events.
- **Encryption**: All stores (settings, costs, compliance, notes, sessions, etc.) encrypted via getStoreEncryptionKey() derived from hostname/username.
- **Rate limiting**: handlers.ts implements checkRateLimit() to prevent burst requests.
- **Agent resolution**: handlers.ts resolves agent IDs to system prompts from starter pack or user files, injecting them into session prompts.
- **Path security**: Memory, notes, and file handlers use assertPathWithinRoots() and getWorkspaceAllowedRoots() to prevent path traversal.
- **Push events**: auth:login-output, auth:login-complete, updater:status, and notification events sent via webContents.send() (not request/response).

## Business Context
The complete "surface area" of the app. Enables the renderer (React UI) to request/observe all main process state and services: run sessions, authenticate, manage agents/settings, track costs, enforce compliance, manage notes, schedule tasks, explore files, and more.
