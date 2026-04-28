import type { IpcRendererEvent } from 'electron'
import type { BackendId } from '../../../shared/backends'

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
  /**
   * Which backend to route this session through. Uses the 4-backend ids:
   * `copilot-cli` | `copilot-sdk` | `claude-cli` | `claude-sdk`. Call sites
   * that branch on provider should use `providerOf(cli)` from
   * `src/shared/backends.ts`, not string equality.
   */
  cli: BackendId
  mode: 'interactive' | 'prompt'

  // ── Common (both CLIs) ──────────────────────────────────────────────────────
  prompt?: string             // Initial prompt text
  model?: string              // --model
  agent?: string              // --agent
  workingDirectory?: string   // spawn cwd
  additionalDirs?: string[]   // --add-dir (both CLIs)
  pluginDirs?: string[]       // --plugin-dir (both CLIs, repeatable on Claude; Copilot accepts the same shape)
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

  /** Agent system prompt to prepend on the first real user input (set by handler when
   *  user starts a session with an active agent but no initial prompt). */
  agentContext?: string

  /** The user's actual typed message (without injected agent/skill/memory context).
   *  Used for message log display so rehydrated sessions show clean messages. */
  displayPrompt?: string

  /**
   * Notes the user attached when starting this session. Title is captured at
   * attach time and frozen with the user message — the in-chat "shared N notes"
   * chip reads from message metadata, not the notes store, so deleting a note
   * (or flag-toggling Notes off) never breaks old transcripts.
   */
  attachedNotes?: Array<{ id: string; title: string }>
  /** Agent persona attached at session start. Frozen for chip display. */
  attachedAgent?: { id: string; name: string }
  /** Skills the user tagged this chat with. Frozen for chip display. */
  attachedSkills?: Array<{ id: string; name: string }>
}

export interface ParsedOutput {
  type: 'text' | 'tool-use' | 'permission-request' | 'error' | 'status' | 'thinking'
  content: string
  metadata?: Record<string, unknown>
  /**
   * Id of the turn this output belongs to. Main process stamps this on every
   * `cli:output` event between `cli:turn-start` and `cli:turn-end`. The
   * renderer groups consecutive AI text messages sharing the same `turnId`
   * into a single chat bubble regardless of streaming pauses. Undefined for
   * output emitted outside of a turn (rare) and for older persisted sessions
   * that predate this field — `OutputDisplay.groupMessages` falls back to a
   * 2-second timestamp window in that case.
   */
  turnId?: string
}

export interface SessionInfo {
  sessionId: string
  name?: string
  cli: BackendId
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

/**
 * Per-provider auth state grouped by transport.
 *
 * `cli` tracks an installed CLI binary + its auth. `sdk` tracks SDK-style auth
 * (env vars + a cheap HTTP probe). Top-level `installed` / `authenticated` /
 * `binaryPath` / `version` / `tokenSource` / `checkedAt` remain as a
 * **deprecated compat projection** of the CLI state so existing renderer code
 * keeps reading `state.copilot.installed`. Phase 5 cleanup removes them after
 * all call sites migrate to explicit `.cli` / `.sdk`.
 */
export interface ProviderAuthState extends AuthStatus {
  cli: AuthStatus
  sdk: AuthStatus
}

export interface AuthState {
  copilot: ProviderAuthState
  claude:  ProviderAuthState
}

export interface LoginOutputEvent {
  cli: 'copilot' | 'claude'  // login flow only targets the CLI binaries
  line: string
}

export interface LoginCompleteEvent {
  cli: 'copilot' | 'claude'  // login flow only targets the CLI binaries
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
  /** Which backend family this agent targets — typically set by provider (not transport). */
  cli: BackendId
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
  cli: BackendId
  name?: string
  firstPrompt?: string
  startedAt: number
  endedAt?: number
}

export interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (...args: unknown[]) => void): () => void
  off(channel: string, callback: (...args: unknown[]) => void): void
  /** Refresh the preload's extension channel allowlist from the main process.
   *  Called after installing an extension so its IPC channels work immediately. */
  refreshExtensionChannels?: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
