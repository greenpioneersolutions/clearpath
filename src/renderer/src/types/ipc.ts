import type { IpcRendererEvent } from 'electron'

export interface AgentConfig {
  description: string
  prompt?: string
  tools?: string[]
  model?: string
}

/**
 * Unified session options covering all flags for both Copilot CLI and Claude Code CLI.
 * Each adapter reads only the fields it understands; unknown fields are ignored.
 */
export interface SessionOptions {
  // ── Required ────────────────────────────────────────────────────────────────
  cli: 'copilot' | 'claude'
  mode: 'interactive' | 'prompt'

  // ── Common (both CLIs) ──────────────────────────────────────────────────────
  prompt?: string             // Initial prompt text
  model?: string              // --model
  agent?: string              // --agent
  workingDirectory?: string   // spawn cwd
  additionalDirs?: string[]   // --add-dir (both CLIs)
  pluginDir?: string          // --plugin-dir (both CLIs)
  mcpConfig?: string          // Claude: --mcp-config  |  Copilot: --additional-mcp-config
  allowedTools?: string[]     // Claude: --allowedTools  |  Copilot: --allow-tool (repeated)
  outputFormat?: string       // --output-format (both CLIs, different valid values)
  resume?: string             // --resume [SESSION_ID]
  continue?: boolean          // --continue

  // ── Copilot-specific ────────────────────────────────────────────────────────
  /** --yolo  Auto-approve ALL tool permissions */
  yolo?: boolean
  /** --allow-all  Enable all permissions */
  allowAll?: boolean
  /** --allow-all-tools  Auto-approve all file system paths in prompt mode */
  allowAllTools?: boolean
  /** --deny-tool PATTERN (repeatable) */
  deniedTools?: string[]
  /** --available-tools TOOL1,TOOL2,... */
  availableTools?: string[]
  /** --excluded-tools TOOL1,TOOL2,... */
  excludedTools?: string[]
  /** true→--experimental  false→--no-experimental */
  experimental?: boolean
  /** --alt-screen [on|off] */
  altScreen?: boolean | 'on' | 'off'
  /** --config-dir PATH */
  configDir?: string
  /** --disable-builtin-mcps */
  disableBuiltinMcps?: boolean
  /** --disable-mcp-server NAME */
  disableMcpServer?: string
  /** --enable-all-github-mcp-tools */
  enableAllGithubMcpTools?: boolean
  /** --stream */
  stream?: boolean
  /** --save-gist */
  saveGist?: boolean
  /** --bash-env */
  bashEnv?: boolean
  /** --banner */
  banner?: boolean
  /** --acp  Start as Agent Client Protocol server */
  acp?: boolean
  /** --screen-reader */
  screenReader?: boolean
  /** --streamer-mode */
  streamerMode?: boolean

  // ── Claude Code-specific ────────────────────────────────────────────────────
  /** --permission-mode MODE */
  permissionMode?: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'auto'
  /** --disallowedTools TOOLS */
  disallowedTools?: string[]
  /** --tools TOOLS  (pass "" to disable all built-in tools) */
  tools?: string
  /** --input-format FORMAT */
  inputFormat?: 'text' | 'stream-json'
  /** --include-partial-messages */
  includePartialMessages?: boolean
  /** --json-schema SCHEMA */
  jsonSchema?: string
  /** --system-prompt TEXT */
  systemPrompt?: string
  /** --system-prompt-file PATH */
  systemPromptFile?: string
  /** --append-system-prompt TEXT */
  appendSystemPrompt?: string
  /** --append-system-prompt-file PATH */
  appendSystemPromptFile?: string
  /** --session-id UUID */
  sessionId?: string
  /** --fork-session */
  forkSession?: boolean
  /** --no-session-persistence */
  noSessionPersistence?: boolean
  /** --remote */
  remote?: boolean
  /** --teleport */
  teleport?: boolean
  /** --name NAME */
  name?: string
  /** --fallback-model NAME */
  fallbackModel?: string
  /** --betas LIST */
  betas?: string
  /** --max-budget-usd AMOUNT */
  maxBudget?: number
  /** --max-turns NUMBER */
  maxTurns?: number
  /** --worktree */
  worktree?: boolean
  /** true→--chrome  false→--no-chrome */
  chrome?: boolean
  /** --ide */
  ide?: boolean
  /** --debug CATEGORIES */
  debug?: string
  /** --settings PATH|JSON */
  settings?: string
  /** --setting-sources LIST */
  settingSources?: string[]
  /** --disable-slash-commands */
  disableSlashCommands?: boolean
  /** --permission-prompt-tool TOOL */
  permissionPromptTool?: string
  /** --strict-mcp-config */
  strictMcpConfig?: boolean
  /** --verbose */
  verbose?: boolean
  /** --init */
  init?: boolean
  /** --init-only */
  initOnly?: boolean
  /** --maintenance */
  maintenance?: boolean
  /** --teammate-mode MODE */
  teammateMode?: 'auto' | 'in-process' | 'tmux'
  /** --agents JSON (custom sub-agent definitions) */
  agents?: Record<string, AgentConfig>
  /** --from-pr NUMBER|URL */
  fromPr?: string

  /** Catch-all for any flag not explicitly modelled above */
  flags?: Record<string, string | boolean>
}

export interface ParsedOutput {
  type: 'text' | 'tool-use' | 'permission-request' | 'error' | 'status' | 'thinking'
  content: string
  metadata?: Record<string, unknown>
}

export interface SessionInfo {
  sessionId: string
  name?: string
  cli: 'copilot' | 'claude'
  status: 'running' | 'stopped'
  startedAt: number
}

// ── Auth types ───────────────────────────────────────────────────────────────

export type TokenSource = 'env-var' | 'config-file' | 'auth-status'

export interface AuthStatus {
  installed: boolean
  authenticated: boolean
  binaryPath?: string
  version?: string
  tokenSource?: TokenSource
  checkedAt: number
}

export interface AuthState {
  copilot: AuthStatus
  claude: AuthStatus
}

export interface LoginOutputEvent {
  cli: 'copilot' | 'claude'
  line: string
}

export interface LoginCompleteEvent {
  cli: 'copilot' | 'claude'
  success: boolean
  error?: string
}

// ── Agent types ───────────────────────────────────────────────────────────────

export interface AgentDef {
  /** Stable slug used as map key and for --agent flag values */
  id: string
  name: string
  description: string
  model?: string
  /** List of allowed tool names */
  tools?: string[]
  /** System / agent prompt body */
  prompt?: string
  /** 'builtin' = ships with the CLI, no file on disk */
  source: 'builtin' | 'file'
  cli: 'copilot' | 'claude'
  /** Absolute path to the markdown file (file-based agents only) */
  filePath?: string
}

export interface AgentProfile {
  id: string
  name: string
  /** IDs of agents that are toggled ON in this preset */
  enabledAgentIds: string[]
  createdAt: number
}

export interface AgentListResult {
  copilot: AgentDef[]
  claude: AgentDef[]
}

export interface ActiveAgents {
  /** Agent ID to pass via --agent when starting a Copilot session (null = none) */
  copilot: string | null
  /** Agent ID to pass via --agent / --agents when starting a Claude session (null = none) */
  claude: string | null
}

// ── Session history types ─────────────────────────────────────────────────────

export interface HistoricalSession {
  sessionId: string
  cli: 'copilot' | 'claude'
  name?: string
  firstPrompt?: string
  startedAt: number
  endedAt?: number
}

export interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (...args: unknown[]) => void): () => void
  off(channel: string, callback: (...args: unknown[]) => void): void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
