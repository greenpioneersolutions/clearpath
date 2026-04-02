// ── Flag definitions ────────────────────────────────────────────────────────

export type FlagType = 'boolean' | 'string' | 'enum' | 'tags' | 'number'

export interface FlagDef {
  key: string
  flag: string
  label: string
  description: string
  type: FlagType
  enumValues?: string[]
  defaultValue?: unknown
  category: string
  cli: 'copilot' | 'claude'
}

// ── Settings store ──────────────────────────────────────────────────────────

export interface AppSettings {
  /** All flag overrides keyed by "cli:flagKey" */
  flags: Record<string, unknown>
  /** Selected model per CLI */
  model: { copilot: string; claude: string }
  /** Budget / limits (Claude -p mode) */
  maxBudgetUsd: number | null
  maxTurns: number | null
  verbose: boolean
  /** Custom env vars injected into child processes */
  envVars: Record<string, string>
}

export const DEFAULT_SETTINGS: AppSettings = {
  flags: {},
  model: { copilot: '', claude: '' },
  maxBudgetUsd: null,
  maxTurns: null,
  verbose: false,
  envVars: {},
}

// ── Configuration profiles ──────────────────────────────────────────────────

export interface ConfigProfile {
  id: string
  name: string
  description: string
  createdAt: number
  settings: AppSettings
  /** Which agents are enabled (from agent profiles) */
  enabledAgentIds?: string[]
  /** Tool permission overrides */
  permissionConfig?: {
    claudeMode?: string
    copilotPreset?: string
    allowedTools?: string[]
    disallowedTools?: string[]
  }
}

// ── Plugin info ─────────────────────────────────────────────────────────────

export interface PluginInfo {
  name: string
  source: string
  version?: string
  description?: string
  enabled: boolean
  cli: 'copilot' | 'claude'
  path?: string
}

// ── Model definitions ───────────────────────────────────────────────────────

export interface ModelDef {
  id: string
  label: string
  subtitle?: string
  cli: 'copilot' | 'claude'
  isDefault?: boolean
}

export const COPILOT_MODELS: ModelDef[] = [
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', subtitle: 'Default', cli: 'copilot', isDefault: true },
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', cli: 'copilot' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', cli: 'copilot' },
  { id: 'gpt-5', label: 'GPT-5', cli: 'copilot' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', cli: 'copilot' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro', cli: 'copilot' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', cli: 'copilot' },
]

export const CLAUDE_MODELS: ModelDef[] = [
  { id: 'sonnet', label: 'Sonnet', subtitle: 'claude-sonnet-4-6', cli: 'claude', isDefault: true },
  { id: 'opus', label: 'Opus', subtitle: 'claude-opus-4-6', cli: 'claude' },
  { id: 'haiku', label: 'Haiku', subtitle: 'claude-haiku-4-5-20251001', cli: 'claude' },
]

// ── Env var definitions ─────────────────────────────────────────────────────

export interface EnvVarDef {
  key: string
  label: string
  description: string
  isSensitive: boolean
  cli: 'copilot' | 'claude' | 'both'
}

export const ENV_VARS: EnvVarDef[] = [
  { key: 'GH_TOKEN', label: 'GH_TOKEN', description: 'GitHub personal access token', isSensitive: true, cli: 'copilot' },
  { key: 'GITHUB_TOKEN', label: 'GITHUB_TOKEN', description: 'GitHub token (alternative)', isSensitive: true, cli: 'copilot' },
  { key: 'GITHUB_ASKPASS', label: 'GITHUB_ASKPASS', description: 'Executable returning token for CI/CD auth', isSensitive: false, cli: 'copilot' },
  { key: 'ANTHROPIC_API_KEY', label: 'ANTHROPIC_API_KEY', description: 'Anthropic API key for Claude Code', isSensitive: true, cli: 'claude' },
  { key: 'CLAUDE_CODE_MODEL', label: 'CLAUDE_CODE_MODEL', description: 'Default model for Claude Code', isSensitive: false, cli: 'claude' },
  { key: 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS', label: 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS', description: 'Additional directories for custom instructions', isSensitive: false, cli: 'copilot' },
  { key: 'ENABLE_TOOL_SEARCH', label: 'ENABLE_TOOL_SEARCH', description: 'Auto-defer tool definitions (e.g. auto:5)', isSensitive: false, cli: 'claude' },
]
