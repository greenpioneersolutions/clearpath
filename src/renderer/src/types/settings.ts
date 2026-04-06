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
  provider: string
  cli: 'copilot' | 'claude'
  isDefault?: boolean
  /** Cost tier for Copilot: 'free' (included), '1x', '2x', '3x', etc. For Claude: $/1M tokens */
  costTier: string
  /** Brief description of strengths */
  description: string
}

export const COPILOT_MODELS: ModelDef[] = [
  // ── Free models (included in Copilot subscription) ──
  { id: 'gpt-5-mini', label: 'GPT-5 Mini', provider: 'OpenAI', cli: 'copilot', isDefault: true, costTier: 'Free', description: 'Fast, free, great for simple tasks' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI', cli: 'copilot', costTier: 'Free', description: 'Reliable general-purpose model' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', cli: 'copilot', costTier: 'Free', description: 'Fast multimodal model' },

  // ── 0.33x models ──
  { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', provider: 'Anthropic', cli: 'copilot', costTier: '0.33x', description: 'Budget Anthropic model, quick tasks' },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash', provider: 'Google', cli: 'copilot', costTier: '0.33x', description: 'Fast and lightweight' },

  // ── 1x models ──
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', provider: 'Anthropic', cli: 'copilot', costTier: '1x', description: 'Balanced coding model' },
  { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', cli: 'copilot', costTier: '1x', description: 'Latest Sonnet, strong at code' },
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', provider: 'Anthropic', cli: 'copilot', costTier: '1x', description: 'Previous gen balanced model' },
  { id: 'gpt-5.1', label: 'GPT-5.1', provider: 'OpenAI', cli: 'copilot', costTier: '1x', description: 'Latest general-purpose GPT' },
  { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex', provider: 'OpenAI', cli: 'copilot', costTier: '1x', description: 'Code-specialized GPT' },
  { id: 'gpt-5', label: 'GPT-5', provider: 'OpenAI', cli: 'copilot', costTier: '1x', description: 'Powerful general-purpose' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', provider: 'OpenAI', cli: 'copilot', costTier: '1x', description: 'Code-specialized GPT variant' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', cli: 'copilot', costTier: '1x', description: 'Strong reasoning and code' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro', provider: 'Google', cli: 'copilot', costTier: '1x', description: 'Latest Google flagship' },

  // ── 3x models ──
  { id: 'claude-opus-4.5', label: 'Claude Opus 4.5', provider: 'Anthropic', cli: 'copilot', costTier: '3x', description: 'Deep reasoning, complex architecture' },
  { id: 'claude-opus-4.6', label: 'Claude Opus 4.6', provider: 'Anthropic', cli: 'copilot', costTier: '3x', description: 'Most capable, 1M context' },

  // ── Other ──
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'OpenAI', cli: 'copilot', costTier: '1x', description: 'Lightweight GPT variant' },
]

export const CLAUDE_MODELS: ModelDef[] = [
  { id: 'sonnet', label: 'Sonnet', subtitle: 'claude-sonnet-4-6', provider: 'Anthropic', cli: 'claude', isDefault: true, costTier: '$3 / $15', description: 'Best balance of speed and capability' },
  { id: 'haiku', label: 'Haiku', subtitle: 'claude-haiku-4-5', provider: 'Anthropic', cli: 'claude', costTier: '$1 / $5', description: 'Cheapest, fast for simple tasks' },
  { id: 'opus', label: 'Opus', subtitle: 'claude-opus-4-6', provider: 'Anthropic', cli: 'claude', costTier: '$5 / $25', description: 'Most capable, 1M context, deep reasoning' },
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
