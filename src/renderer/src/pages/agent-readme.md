# Pages — Top-level application screens

## Purpose
This folder contains all page-level React components that represent complete screens within the ClearPath GUI. Each page corresponds to a distinct section of the application and manages its own data fetching, state, and layout. Pages are rendered by the router and typically compose smaller component libraries and context providers.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| Agents.tsx | Manage agent creation, editing, profiles, and templates | Agents (default) |
| Analytics.tsx | Cost/token analytics with daily spend, sessions, models breakdown, budget tracking | Analytics (default), StatCard(), formatTokens() |
| Compliance.tsx | Audit log, security events, file protection patterns, compliance exports | Compliance (default) |
| Configure.tsx | Settings hub with tabs for accessibility, policies, integrations, agents, skills, branding | Configure (default), IntegrationsTab() |
| CustomDashboard.tsx | Widget-based customizable dashboard layout selection and management | CustomDashboard (default) |
| Dashboard.tsx | Auth status cards for Copilot and Claude, login modal integration | Dashboard (default), RefreshIcon() |
| FileExplorer.tsx | Browse workspace files, watch for changes, AI action context menu (explain, review, refactor) | FileExplorer (default) |
| GitWorkflow.tsx | Git status panel, PR builder, worktree management | GitWorkflow (default) |
| Home.tsx | Entry point that switches between HomeHub and CustomDashboard based on feature flags | Home (default) |
| Insights.tsx | Analytics tab container routing to Analytics, Compliance, UsageAnalytics | Insights (default) |
| KnowledgeBase.tsx | Browse KB files, search, generate docs with AI, Q&A against project knowledge | KnowledgeBase (default) |
| Learn.tsx | Learning paths, lessons, guided tasks, knowledge checks, achievements, progress tracking | Learn (default) |
| Memory.tsx | Notes, config files, CLI memory, context usage monitoring | Memory (default) |
| Onboarding.tsx | First-run setup wizard, guided tasks, skill progression levels | Onboarding (default) |
| Policies.tsx | Policy preset management, active policy selection, violation monitoring | Policies (default) |
| PrScores.tsx | GitHub PR scoring, repo metrics, author breakdowns, AI code review | PrScores (default) |
| ScheduledTasks.tsx | Cron job creation/management, execution history, results review | ScheduledTasks (default) |
| Sessions.tsx | Active CLI sessions display, input/output streaming, mode indicator, history | Sessions (default) |
| Settings.tsx | App-wide settings tabs: CLI flags, models, budget, plugins, profiles, env vars, notifications | Settings (default) |
| SkillsManagement.tsx | Skill list, editor, walkthrough onboarding, agent recommendations | SkillsManagement (default) |
| SubAgentPopout.tsx | Minimal popout window for sub-agent process output | SubAgentPopout (default) |
| SubAgents.tsx | Sub-agent dashboard, delegate tasks, task queue, fleet status monitoring | SubAgents (default) |
| TeamHub.tsx | Config bundle sharing, shared folder sync, team setup wizard, agent marketplace | TeamHub (default) |
| Templates.tsx | Prompt template library, form composition, editor, usage statistics | Templates (default) |
| Tools.tsx | Permission mode selector, tool toggles, MCP server management | Tools (default) |
| UsageAnalytics.tsx | Cost and token analytics over time, session metrics, model breakdown | UsageAnalytics (default) |
| Work.tsx | Main workspace: active sessions, composer, tools, agents, templates, skills, sub-agents | Work (default) |
| Workspaces.tsx | Multi-repo workspace management, activity feeds, git operations | Workspaces (default) |

## Architecture Notes

### IPC Events & Handlers
Pages use `window.electronAPI.invoke()` to call main-process handlers. Key patterns:
- **Agent management**: `agent:list`, `agent:create`, `agent:set-enabled`, `agent:set-active`, `agent:get-profiles`, `agent:save-profile`, `agent:apply-profile`
- **Cost tracking**: `cost:summary`, `cost:daily-spend`, `cost:by-session`, `cost:by-model`, `cost:by-agent`, `cost:set-display-mode`
- **Sessions**: `cli:list-sessions`, `cli:start-session`, `cli:send-input`, `cli:stop-session`
- **Compliance**: `compliance:get-log`, `compliance:security-events`, `compliance:get-file-patterns`, `compliance:set-file-patterns`, `compliance:export-snapshot`
- **Settings**: `settings:get`, `settings:set`, `settings:update-flag`, `settings:list-profiles`, `settings:load-profile`
- **Workspaces**: `workspace:list`, `workspace:get-active`, `workspace:activity-feed`, `workspace:clone-repo`
- **Skills/Templates**: `skills:list`, `templates:list`, `starter-pack:get-visible-agents`

### Listener Patterns
Pages subscribe to real-time events:
- `auth:status-changed` — auth state updates in Dashboard
- `files:changed` — file system changes in FileExplorer
- `cli:output`, `cli:error`, `cli:exit` — session streaming in Sessions and Work
- `subagent:spawned`, `subagent:status-changed` — sub-agent updates in SubAgents
- `notification:new` — incoming notifications

### State Management
- Local state via `useState()` for UI and temporary data
- Context providers: `useFeatureFlags()`, `useAccessibility()`, `useBranding()`
- No Redux; IPC events drive reactive updates

### Feature Flags
Pages respect `FeatureFlagContext`:
- `showHomeHub` — determines Home page behavior
- `showPrScores`, `enableExperimentalFeatures` — control PrScores visibility
- `showAgentSelection`, `showTemplates`, `showSkillsManagement`, `showSubAgents` — panel visibility in Work page

## Business Context
- **Agents**: Powers agent creation and management, core to multi-CLI orchestration
- **Analytics & Compliance**: Tracks costs, tokens, security events, and compliance
- **Configure**: Central hub for all app-wide settings, integrations, and policies
- **Work**: Primary workspace where users interact with CLI sessions, templates, and skills
- **Team Hub**: Enables team collaboration through config sharing and marketplace
- **Memory**: Manages session memory, context files, and structured knowledge
- **Learn**: Educational onboarding and skill progression tracking
- **Dashboard**: Authentication and quick-access status overview
