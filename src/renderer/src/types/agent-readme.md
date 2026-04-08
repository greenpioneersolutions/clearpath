# Types — Shared TypeScript type definitions

## Purpose
This folder contains type definitions for data structures, configuration, and IPC communication contracts used throughout the renderer process. Types enable type safety across pages, components, and IPC boundaries.

## Files
| File | Description | Key Exports / Interfaces |
|------|-------------|------------------------|
| accessibility.ts | Accessibility feature configuration | FocusStyle, AccessibilitySettings, DEFAULT_ACCESSIBILITY |
| cost.ts | Cost tracking, budget, token usage, analytics | CostRecord, DailySpend, SessionCostSummary, ModelBreakdown, AgentTokens, BudgetConfig, AnalyticsDisplayMode, DateRange, MODEL_PRICING, estimateCost() |
| ipc.ts | Unified session options for both Copilot and Claude CLIs | AgentConfig, SessionOptions |
| memory.ts | Config files and memory entries | ConfigFile, MemoryEntry |
| notification.ts | Notification types, severity, webhooks | NotificationType, NotificationSeverity, NotificationAction, AppNotification, WebhookEndpoint, NotificationPrefs, ALL_NOTIFICATION_TYPES, SEVERITY_STYLES, TYPE_LABELS |
| prScores.ts | GitHub PR scoring and metrics | PrScoreBreakdown, PrScoreResult, FileAnalysisResult, RepoMetrics, AuthorMetric, PrScoresConfig, GitHubRepo, GitHubPR, getScoreColor(), getScoreLabel(), DEFAULT_PR_SCORES_CONFIG |
| settings.ts | App-wide settings and configuration | FlagType, FlagDef, AppSettings, ConfigProfile, PluginInfo, ModelDef, EnvVarDef, COPILOT_MODELS, CLAUDE_MODELS, ENV_VARS, DEFAULT_SETTINGS |
| starter-pack.ts | Agent/skill/memory/prompt definitions for onboarding | StarterAgentDefinition, StarterSkillDefinition, MemoryFieldDef, StarterMemoryDefinition, PromptSuggestion, HandoffContext, HandoffSuggestion, MemorySetupState |
| subagent.ts | Sub-agent process management | SubAgentStatus, SubAgentInfo, QueuedTask, FleetAgent |
| template.ts | Prompt template library | PromptTemplate, TemplateUsageStat, TEMPLATE_CATEGORIES, TemplateCategory |
| tools.ts | Tool permissions, MCP server configuration | ClaudePermissionMode, CopilotPermissionPreset, ToolPermissionConfig, McpServerConfig, McpConfigFile, PermissionRequest, createDefaultPermissionConfig() |

## Architecture Notes

### Type Organization
1. **IPC contracts** (ipc.ts, accessibility.ts, cost.ts, notification.ts) — used by both renderer and main processes
2. **UI state** (template.ts, prScores.ts, subagent.ts) — specific to renderer pages/components
3. **Configuration** (settings.ts, tools.ts, starter-pack.ts) — persisted app state and defaults
4. **Constants** — helper functions and default values exported alongside types

### Key Type Hierarchies
- **SessionOptions** — unified CLI session configuration (covers 100+ flags across Copilot and Claude CLIs)
- **FeatureFlags** (in FeatureFlagContext) — 40+ toggles controlling feature visibility
- **NotificationType** — 9 types: session-complete, permission-request, rate-limit, budget-alert, security-event, policy-violation, agent-status, schedule-result, error
- **ModelDef** — model configuration with provider, cost tier, description for UI selection

### Defaults & Constants
- `DEFAULT_ACCESSIBILITY` — base accessibility settings
- `DEFAULT_SETTINGS` — app settings defaults
- `DEFAULT_PR_SCORES_CONFIG` — PR scoring defaults
- `MODEL_PRICING` — estimated cost per 1M tokens for 20+ models (Claude, GPT, Gemini variants)
- `COPILOT_MODELS`, `CLAUDE_MODELS` — curated model lists per CLI
- `ALL_NOTIFICATION_TYPES`, `SEVERITY_STYLES`, `TYPE_LABELS` — notification constants
- `TEMPLATE_CATEGORIES` — 13 predefined template categories

### IPC Type Contracts
**SessionOptions** covers:
- Common: mode, prompt, model, agent, workingDirectory, additionalDirs, mcpConfig, outputFormat, resume
- Copilot-specific: yolo, allowAll, experimental, configDir, disableMcpServer, screenReader, streamerMode
- Claude-specific: permissionMode, disallowedTools, systemPrompt, sessionId, noSessionPersistence

## Business Context
- **Cost tracking**: MODEL_PRICING enables real-time cost estimation for sessions and analytics
- **Accessibility**: AccessibilitySettings enables WCAG 2.1 compliance across the app
- **Tool permissions**: ToolPermissionConfig abstracts CLI differences for unified permission handling
- **Starter pack**: Onboarding definitions drive guided setup and agent/skill recommendations
- **Templates**: PromptTemplate supports power-user workflows and team knowledge sharing
