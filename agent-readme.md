# CoPilot Commander — Agent Navigation Guide

## Project Overview

CoPilot Commander (version 1.7.0) is a desktop GUI wrapper around GitHub Copilot CLI and Claude Code CLI, built with Electron, React, and TypeScript. It provides non-technical users with a polished graphical interface to interact with AI coding agents without touching the terminal. The app spawns, manages, and parses CLI processes, streams output to the UI, persists sessions, tracks costs, enforces compliance policies, and orchestrates multi-agent workflows with handoffs, sub-agents, and scheduled automation.

## Tech Stack

- **Electron 39.8.6** — Two-process desktop app (main + renderer)
- **React 18.3.1** — GUI framework for renderer
- **TypeScript 5.5.4** — Type-safe codebase
- **Tailwind CSS 3.4.10** — Utility-first styling (dark theme default)
- **electron-store 8.2.0** — Encrypted local data persistence
- **electron-updater 6.8.3** — Auto-update mechanism with GitHub Releases
- **node-cron 4.2.1** — Scheduled job execution
- **react-router-dom 6.26.1** — Page routing (SPA)
- **recharts 3.8.1** — Analytics visualizations
- **Octokit 5.0.5** — GitHub API client for PR/issue context
- **@codemirror** — Code editor for config/template editing
- **pull-request-score 2.0.0** — AI-assisted PR code review metrics

## Architecture Overview

### Two-Process Electron Model

The app uses Electron's standard two-process architecture:

1. **Main Process** (`src/main/index.ts`) — Electron app initialization, window creation, singleton service management (CLIManager, AuthManager, AgentManager, NotificationManager, SchedulerService), IPC handler registration, auto-update orchestration, and security policy configuration.

2. **Renderer Process** (`src/renderer/src/`) — React SPA with pages, components, contexts, hooks, and types. Communicates with main process exclusively via IPC channels, enforced by whitelist in preload script.

3. **Preload Script** (`src/preload/index.ts`) — Security boundary. Implements `window.electronAPI.invoke()` and `window.electronAPI.on()` wrappers that validate all IPC channels against explicit allow-lists (170+ invoke channels, 13 receive channels).

### Core Patterns

**Adapter Pattern**: CLI session management uses pluggable adapters (`CopilotAdapter`, `ClaudeCodeAdapter`, `LocalModelAdapter`) that handle CLI-specific argument building, output parsing, and process I/O while exposing a unified `ICLIAdapter` interface.

**Singleton Services**: All long-lived services (CLIManager, AuthManager, AgentManager, NotificationManager, SchedulerService) are instantiated in the main process **before** `app.ready()` to ensure IPC handlers are registered before the renderer window connects.

**Encrypted Persistence**: electron-store with encryption key derived from hostname/username allows all stores to be encrypted at rest without portability concerns.

**IPC-Driven State**: Renderer state is primarily driven by IPC responses and push events from the main process. No Redux; context providers (AccessibilityContext, BrandingContext, FeatureFlagContext) manage global UI state.

## Directory Map

### Main Process (`src/main/`)

| Path | Purpose | Agent README |
|------|---------|--------------|
| `src/main/` | Electron app initialization, window creation, singletons, IPC registration, security CSP, auto-updater | [agent-readme.md](src/main/agent-readme.md) |
| `src/main/auth/` | Auth status checking, login flows for Copilot and Claude | [agent-readme.md](src/main/auth/agent-readme.md) |
| `src/main/cli/` | CLI session management, adapters (Copilot/Claude/Local), cost tracking, audit logging | [agent-readme.md](src/main/cli/agent-readme.md) |
| `src/main/ipc/` | 34+ handler registration modules for IPC channels | [agent-readme.md](src/main/ipc/agent-readme.md) |
| `src/main/agents/` | Agent discovery, CRUD, profile management from user files | [agent-readme.md](src/main/agents/agent-readme.md) |
| `src/main/notifications/` | Multi-channel notification delivery, preferences, history | [agent-readme.md](src/main/notifications/agent-readme.md) |
| `src/main/scheduler/` | Cron-based scheduled job execution with sub-agent spawning | [agent-readme.md](src/main/scheduler/agent-readme.md) |
| `src/main/starter-pack/` | Pre-built agents, skills, memories, prompts, handoff system | [agent-readme.md](src/main/starter-pack/agent-readme.md) |
| `src/main/utils/` | Credential storage, logging, path security, rate limiting, shell env, encryption | [agent-readme.md](src/main/utils/agent-readme.md) |

### Renderer Process (`src/renderer/src/`)

| Path | Purpose | Agent README |
|------|---------|--------------|
| `src/preload/` | IPC context bridge, channel whitelisting | [agent-readme.md](src/preload/agent-readme.md) |
| `src/renderer/src/pages/` | 23 page-level React components (Work, Sessions, Agents, Dashboard, etc.) | [agent-readme.md](src/renderer/src/pages/agent-readme.md) |
| `src/renderer/src/contexts/` | Global state providers (Accessibility, Branding, FeatureFlags) | [agent-readme.md](src/renderer/src/contexts/agent-readme.md) |
| `src/renderer/src/hooks/` | Custom React hooks (useFocusTrap, useKeyboardShortcuts) | [agent-readme.md](src/renderer/src/hooks/agent-readme.md) |
| `src/renderer/src/types/` | Shared TypeScript definitions | [agent-readme.md](src/renderer/src/types/agent-readme.md) |
| `src/renderer/src/components/settings/` | Configure page UI and settings components | [agent-readme.md](src/renderer/src/components/settings/agent-readme.md) |
| `src/renderer/src/components/tools/` | MCP servers, tool permissions, permission handling | [agent-readme.md](src/renderer/src/components/tools/agent-readme.md) |
| `src/renderer/src/components/memory/` | Notes, config files, context usage tracking | [agent-readme.md](src/renderer/src/components/memory/agent-readme.md) |
| `src/renderer/src/components/composer/` | Multi-step workflow builder | [agent-readme.md](src/renderer/src/components/composer/agent-readme.md) |
| `src/renderer/src/components/cost/` | Budget alerts, cost charts, analytics | [agent-readme.md](src/renderer/src/components/cost/agent-readme.md) |
| `src/renderer/src/components/wizard/` | Session creation and configuration wizards | [agent-readme.md](src/renderer/src/components/wizard/agent-readme.md) |
| `src/renderer/src/components/shared/` | Reusable foundational components | [agent-readme.md](src/renderer/src/components/shared/agent-readme.md) |
| `src/renderer/src/components/integrations/` | GitHub API integration panel | [agent-readme.md](src/renderer/src/components/integrations/agent-readme.md) |
| `src/renderer/src/components/team/` | Team collaboration and marketplace | [agent-readme.md](src/renderer/src/components/team/agent-readme.md) |
| `src/renderer/src/components/voice/` | Speech-to-text, voice commands, TTS | [agent-readme.md](src/renderer/src/components/voice/agent-readme.md) |
| `src/renderer/src/components/templates/` | Prompt template management | [agent-readme.md](src/renderer/src/components/templates/agent-readme.md) |
| `src/renderer/src/components/skills/` | Skill creation and management | [agent-readme.md](src/renderer/src/components/skills/agent-readme.md) |
| `src/renderer/src/components/subagent/` | Background task delegation and fleet management | [agent-readme.md](src/renderer/src/components/subagent/agent-readme.md) |
| `src/renderer/src/components/notifications/` | Notification center, inbox, webhooks | [agent-readme.md](src/renderer/src/components/notifications/agent-readme.md) |
| `src/renderer/src/components/git/` | Git status, PR builder, worktree manager | [agent-readme.md](src/renderer/src/components/git/agent-readme.md) |
| `src/renderer/src/components/onboarding/` | First-run wizard, guided tasks, skill progression | [agent-readme.md](src/renderer/src/components/onboarding/agent-readme.md) |

## Feature → Code Map

| Feature | Main Process | Renderer | Key IPC Channels |
|---------|-------------|----------|------------------|
| **CLI Sessions** | `src/main/cli/CLIManager.ts` | `Work.tsx`, `Sessions.tsx` | `cli:start-session`, `cli:send-input`, `cli:output` |
| **Authentication** | `src/main/auth/AuthManager.ts` | `Dashboard.tsx` | `auth:get-status`, `auth:login-start`, `auth:login-complete` |
| **Agents** | `src/main/agents/AgentManager.ts` | `Agents.tsx` | `agent:list`, `agent:create`, `agent:set-enabled` |
| **Cost Tracking** | CLIManager cost callback | `Analytics.tsx`, cost components | `cost:get-summary`, `cost:set-budget`, `cost:check-budget` |
| **Compliance** | CLIManager audit callback | `Compliance.tsx` | `compliance:get-audit-log`, `compliance:set-policy` |
| **Notifications** | `src/main/notifications/NotificationManager.ts` | Notification components | `notifications:list`, `notifications:mark-read` |
| **Scheduled Jobs** | `src/main/scheduler/SchedulerService.ts` | `ScheduledTasks.tsx` | `scheduler:list-tasks`, `scheduler:run-now` |
| **Settings** | IPC handlers | `Settings.tsx`, settings components | `settings:get`, `settings:set`, `settings:save-profile` |
| **Git** | Git CLI bindings | `GitWorkflow.tsx`, git components | `git:status`, `git:log`, `git:create-worktree` |
| **Templates** | electron-store | `Templates.tsx`, template components | `template:list`, `template:create`, `template:delete` |
| **Skills** | electron-store | `SkillsManagement.tsx`, skill components | `skill:list`, `skill:enable`, `skill:save` |
| **Sub-Agents** | CLIManager.spawnSubAgent() | `SubAgents.tsx`, subagent components | `subagent:spawn`, `subagent:get-output` |
| **Team** | Bundle serialization | `TeamHub.tsx`, team components | `team:export-bundle`, `team:git-activity` |
| **Memory** | electron-store + file I/O | `Memory.tsx`, memory components | `memory:list-files`, `notes:list`, `notes:create` |
| **Voice** | Web Speech API (browser) | `voice/` components | N/A (client-side only) |
| **Workflows** | CLIManager | `Composer.tsx` | `workflow:estimate-cost`, `subagent:spawn` |

## Key IPC Channels (Grouped by Domain)

### CLI Sessions (`cli:*`)
- `cli:check-installed` — Check if CLI binary exists
- `cli:check-auth` — Verify user is authenticated
- `cli:start-session` — Spawn new interactive session (returns SessionInfo)
- `cli:send-input` — Send user prompt to active session
- `cli:send-slash-command` — Send CLI slash command (`/help`, `/cost`, etc.)
- `cli:stop-session` — Terminate session
- `cli:list-sessions` — Fetch all persisted sessions
- `cli:get-session` — Get single session metadata
- `cli:get-message-log` — Fetch conversation history
- `cli:get-persisted-sessions` — Load sessions from store on app startup
- `cli:delete-session` — Delete session and history
- `cli:search-sessions` — Search sessions by text query
- `cli:output` **(push)** — Stream CLI output line in real-time
- `cli:error` **(push)** — Stream CLI error output
- `cli:exit` **(push)** — Signal CLI process termination
- `cli:turn-start` **(push)** — Signal turn start (user input sent)
- `cli:turn-end` **(push)** — Signal turn complete (all output received)
- `cli:permission-request` **(push)** — Notify of pending permission prompt
- `cli:usage` **(push)** — Report token/cost usage per turn

### Authentication (`auth:*`)
- `auth:get-status` — Check install/auth status for both CLIs
- `auth:refresh` — Force re-check (bypass cache)
- `auth:login-start` — Initiate browser login flow
- `auth:login-cancel` — Cancel ongoing login
- `auth:login-output` **(push)** — Stream login output lines
- `auth:login-complete` **(push)** — Signal login success/failure
- `auth:status-changed` **(push)** — Auth state changed event

### Agents (`agent:*`)
- `agent:list` — List user-created agents
- `agent:create`, `agent:read-file`, `agent:write-file`, `agent:delete`
- `agent:get-enabled`, `agent:set-enabled` — Control enabled agents
- `agent:get-active`, `agent:set-active` — Set active agent per CLI
- `agent:get-profiles`, `agent:save-profile`, `agent:apply-profile`, `agent:delete-profile`

### Cost Tracking (`cost:*`)
- `cost:get-records` — Fetch cost records by filter
- `cost:get-summary` — Get daily/weekly/monthly spend totals
- `cost:get-budget` — Retrieve budget config
- `cost:set-budget` — Update budget limits
- `cost:get-analytics-mode` — Get display mode (tokens vs USD)
- `cost:set-analytics-mode` — Toggle analytics mode
- `cost:check-budget` — Poll for budget alerts
- `cost:clear-records` — Wipe cost database
- `cost:export-csv` — Export as CSV file

### Notifications (`notifications:*`)
- `notifications:list` — Fetch all notifications
- `notifications:unread-count` — Get unread count
- `notifications:mark-read`, `notifications:mark-all-read`
- `notifications:dismiss`, `notifications:clear-all`
- `notifications:emit` — Emit a new notification
- `notification:new` **(push)** — Push event for incoming notification

### Scheduler (`scheduler:*`)
- `scheduler:list-tasks` — Fetch scheduled jobs
- `scheduler:create-task`, `scheduler:update-task`, `scheduler:delete-task`
- `scheduler:run-now` — Execute job immediately
- `scheduler:get-status` — Poll job status
- `scheduler:list-templates` — Fetch pre-built cron templates

### Sub-Agents (`subagent:*`)
- `subagent:spawn` — Start background task (returns SubAgentInfo)
- `subagent:list` — List running processes
- `subagent:get-status`, `subagent:get-output` — Fetch metadata and logs
- `subagent:kill`, `subagent:pause`, `subagent:resume`, `subagent:kill-all`
- `subagent:fleet-status` — Query Copilot's `/fleet` command
- `subagent:output` **(push)** — Stream sub-agent output
- `subagent:spawned` **(push)** — Sub-agent started event
- `subagent:status-changed` **(push)** — Status change event

### Settings & Config (`settings:*`)
- `settings:get`, `settings:set` — Get/update full AppSettings
- `settings:update-flag`, `settings:reset-flag`, `settings:reset-all`
- `settings:set-model`, `settings:set-budget`
- `settings:get-env-vars`, `settings:set-env-var`
- `settings:list-profiles`, `settings:save-profile`, `settings:load-profile`, `settings:delete-profile`
- `settings:export-profile`, `settings:import-profile`

### Compliance & Policies (`compliance:*`, `policy:*`)
- `compliance:get-audit-log`, `compliance:add-entry`, `compliance:clear-log`, `compliance:export-log`
- `compliance:get-policy`, `compliance:set-policy`
- `policy:get`, `policy:set`, `policy:list-violations`, `policy:check-compliance`

### Memory (`memory:*`, `notes:*`)
- `memory:list-config-files`, `memory:read-config-file`, `memory:write-config-file`, `memory:delete-config-file`
- `notes:list`, `notes:create`, `notes:update`, `notes:delete`, `notes:search`
- `notes:get-attachments`, `notes:attach-file`, `notes:detach-file`

### Git (`git:*`)
- `git:status` — Branch, ahead/behind, staged/modified/untracked files
- `git:log` — Commit history with AI commit detection
- `git:get-branches`, `git:create-branch`, `git:switch-branch`
- `git:get-file-diff`, `git:revert-file`
- `git:worktrees`, `git:create-worktree`, `git:remove-worktree`, `git:branch-protection`

### Templates & Skills
- `template:list`, `template:create`, `template:update`, `template:delete`, `template:use`, `template:export`, `template:import`
- `skill:list`, `skill:get`, `skill:enable`, `skill:disable`, `skill:install`, `skill:uninstall`, `skill:record-usage`

### Team & Integrations (`team:*`, `integration:*`)
- `team:get-info`, `team:list-members`, `team:add-member`, `team:remove-member`, `team:set-role`
- `team:export-bundle`, `team:import-bundle`
- `team:get-shared-folder`, `team:set-shared-folder`, `team:list-shared-configs`, `team:apply-shared-config`
- `team:git-activity`, `team:list-marketplace`, `team:install-marketplace-agent`, `team:uninstall-marketplace-agent`
- `integration:get-status`, `integration:github-connect`, `integration:github-disconnect`
- `integration:github-repos`, `integration:github-pulls`, `integration:github-issues`, `integration:github-search`

### Other Domains
- `updater:check`, `updater:install`, `updater:status` **(push)** — Auto-update management
- `files:changed` **(push)** — File system change notifications
- `wizard:start`, `wizard:get-step`, `wizard:complete-step`, `wizard:cancel` — Session wizards
- `kb:index-repository`, `kb:search`, `kb:list-indexes` — Knowledge base
- `data:export-all`, `data:import-all`, `data:purge-sessions`, `data:purge-costs`, `data:purge-all` — Data management
- `feature-flags:get`, `feature-flags:set`, `feature-flags:apply-preset` — Feature toggles
- `accessibility:get-settings`, `accessibility:set-settings`, `accessibility:reset` — Accessibility config
- `branding:get-theme`, `branding:set-theme` — Theming
- `pr-score:analyze`, `pr-score:get-scores`, `pr-score:export-csv` — PR analysis

## Data Persistence

All data encrypted via electron-store (key derived from hostname/username):

| Store Name | Contents | Max Size |
|------------|----------|----------|
| `clear-path-sessions` | CLI sessions (50 max), message history (500 per session) | 50 MB |
| `clear-path-settings` | AppSettings: flags, models, budget, env vars, plugins, feature flags | 1 MB |
| `clear-path-costs` | Cost records, daily/weekly/monthly spend | 5 MB |
| `clear-path-compliance` | Audit log, policy violations, prompt hashes | 10 MB |
| `clear-path-agents` | Agent profiles, enabled IDs, active agents, presets (500 max) | 500 KB |
| `clear-path-notifications` | Inbox (500 max), webhooks, preferences, quiet hours | 2 MB |
| `clear-path-scheduler` | Scheduled jobs, execution history (50 per job) | 5 MB |
| `clear-path-notes` | User notes, tags, categories, attachments | 10 MB |
| `clear-path-credentials` | Encrypted API keys via OS keychain | 100 KB |
| `clear-path-templates` | Prompt templates, variables, usage stats | 2 MB |
| `clear-path-skills` | Skill definitions, auto-invoke config, tools | 2 MB |

**Allowed config paths**: `~/.claude/`, `~/.copilot/`, `~/.github/`, cwd, `~/.config/clear-path/`

**Sensitive paths (never written)**: `~/.ssh/`, `~/.aws/`, `~/.gnupg/`, `/etc/`, `/usr/`, `/bin/`

## Navigation Guide for Agents

### Adding a New IPC Handler
1. Create handler function in `src/main/ipc/[domain]Handlers.ts`
2. Export `register*Handlers(ipcMain, manager)` function
3. Import and call in `src/main/index.ts` before `app.ready()`
4. Add channel to `ALLOWED_INVOKE_CHANNELS` in `src/preload/index.ts`
5. Add to `ALLOWED_RECEIVE_CHANNELS` if sending push events
6. Define types in `src/renderer/src/types/` (ipc.ts or domain-specific)
7. Use in renderer: `window.electronAPI.invoke(channel, args)`

### Adding a New Page/Route
1. Create `src/renderer/src/pages/NewPage.tsx` component
2. Add route in app routing config
3. Import contexts: `useFeatureFlags()`, `useBranding()`, etc.
4. Add feature flag in `types/settings.ts` if visibility should be toggled
5. Use IPC calls for data: `window.electronAPI.invoke(channel, args)`
6. Subscribe to push events: `window.electronAPI.on(channel, callback)`

### Adding a New CLI Flag
1. Add definition to `src/renderer/src/components/settings/flagDefs.ts` (COPILOT_FLAGS or CLAUDE_FLAGS array with id, label, type, category, description, defaultValue)
2. Update `AppSettings` type in `src/renderer/src/types/settings.ts`
3. Update adapter (`CopilotAdapter.ts` or `ClaudeCodeAdapter.ts`) `buildArgs()` to recognize flag
4. FlagBuilder component auto-renders; flag value persists via `settings:set`

### Modifying Session Persistence
1. Update `ActiveSession` interface in `src/main/cli/types.ts` if adding metadata
2. Sessions stored in electron-store (max 50, each max 500 messages)
3. `CLIManager.persistSession()` called after each turn
4. `CLIManager.rehydrateSessions()` called on app startup
5. Pruning: 30+ day-old sessions purged; message logs truncated to 500 entries

### Adding a New Notification Type
1. Add to `NotificationType` union in `src/main/notifications/NotificationManager.ts`
2. Add to `ALL_NOTIFICATION_TYPES` const and `TYPE_LABELS` map in `src/renderer/src/types/notification.ts`
3. Add severity in `SEVERITY_STYLES` map (info/warning/critical)
4. Emit: `notificationManager.emit({ type: 'new-type', severity: 'info', title, message })`
5. Add preference toggle in `NotificationPreferences` component

### Rate Limiting
Use `src/main/utils/rateLimiter.ts`:
```typescript
import { checkRateLimit } from '../utils/rateLimiter';
const limit = checkRateLimit('operation:name', 5); // 5 per minute
if (!limit.allowed) throw new Error(`Rate limited. Retry after ${limit.retryAfterMs}ms`);
```
Pre-configured: `cli:start-session` (5/min), `subagent:spawn` (10/min), `git:log` (30/min).

### Shell Environment Setup
CLIs may not be in PATH from Electron. Use `src/main/utils/shellEnv.ts`:
```typescript
import { initShellEnv, getScopedSpawnEnv } from '../utils/shellEnv';
await initShellEnv(); // reads login shell PATH once at app startup
const env = getScopedSpawnEnv('claude'); // Gets scoped env vars for spawning
```

### Path Validation (Prevent Traversal)
Use `src/main/utils/pathSecurity.ts`:
```typescript
import { assertPathWithinRoots, getWorkspaceAllowedRoots } from '../utils/pathSecurity';
const roots = getWorkspaceAllowedRoots();
assertPathWithinRoots(userPath, roots); // Throws if path escapes allowed roots
```

### Secrets Storage (OS Keychain)
Use `src/main/utils/credentialStore.ts`:
```typescript
import { storeSecret, retrieveSecret, getSecretPreview } from '../utils/credentialStore';
await storeSecret('key-name', 'value'); // Encrypted in OS keychain
const value = await retrieveSecret('key-name');
const masked = getSecretPreview('key-name'); // "sk_****AB3F" for UI display
```

## Brand & Styling

### Colors
- **Primary**: Indigo-600 (`#4F46E5`) — buttons, active states
- **Background**: Gray-900 (`#111827`) — dark theme default
- **Surface**: Gray-800 (`#1F2937`) — cards, panels
- **Text**: Gray-100 (`#F3F4F6`) — body on dark background
- **Accents**: Green (success), Red (error), Yellow (warning), Blue (info)

All configurable via `BrandingContext` (supports light/dark mode, white-label theming).

### Tailwind Conventions
- Spacing: `space-*`, `p-*`, `m-*`
- Typography: `text-sm`/`text-lg`, `font-semibold`, `font-mono`
- Layout: `flex`, `grid`, `relative`/`absolute`, `max-w-*`
- States: `hover:`, `focus:`, `disabled:`, `transition` for smoothness
- Accessibility: `sr-only` for screen readers, `focus-visible:ring` for keyboard nav

### Icons
- **Heroicons**: Inline SVGs (24×24) from `@heroicons/react`
- **Emoji**: Unicode badges (🚀, 📋, ✓) for visual affordance
- **Status dots**: Colored (green=success, red=error, gray=pending)

---

*For deeper exploration, follow the agent-readme.md links in the Directory Map above. Each subsystem README contains detailed architecture, IPC calls, type definitions, and business context.*
