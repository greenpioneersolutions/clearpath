import type { SessionOptions, ParsedOutput, SessionInfo } from '../../renderer/src/types/ipc'
import type { BackendId } from '../../shared/backends'

/**
 * Minimal interface an adapter's session must satisfy. `ChildProcess` structurally
 * satisfies this, so spawn-based adapters don't need to change. SDK adapters that
 * wrap HTTP streams / async generators construct their own `SessionHandle` from
 * `PassThrough` streams + an `EventEmitter`.
 */
export interface SessionHandle {
  readonly pid?: number
  readonly stdout: NodeJS.ReadableStream | null
  readonly stderr: NodeJS.ReadableStream | null
  readonly stdin?: NodeJS.WritableStream | null
  kill(signal?: NodeJS.Signals | number): boolean
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
}

export interface ICLIAdapter {
  readonly cliName: string
  binaryPath: string

  isInstalled(): Promise<boolean>
  isAuthenticated(): Promise<boolean>

  buildArgs(options: SessionOptions): string[]
  parseOutput(data: string): ParsedOutput

  startSession(options: SessionOptions): SessionHandle
  sendInput(proc: SessionHandle, input: string): void
  sendSlashCommand(proc: SessionHandle, command: string): void
}

export interface ActiveSession {
  info: SessionInfo
  /** The session handle for the current in-flight turn. Null between turns. */
  process: SessionHandle | null
  adapter: ICLIAdapter
  /** Partial line buffer for the current turn's stdout. */
  buffer: string
  /** Original options used to start the session — re-used for each subsequent turn. */
  originalOptions: SessionOptions
  /** How many turns have been completed. Used to decide whether to pass --continue. */
  turnCount: number
  /** True while a process is running for the current turn. */
  processingTurn: boolean
  /** Bytes of output received in the current turn (for cost estimation). */
  turnOutputBytes: number
  /** The prompt text sent for the current turn. */
  lastPrompt: string
  /** Full message history for this session (for rehydration when UI remounts). */
  messageLog: Array<{ type: string; content: string; metadata?: unknown; sender?: 'user' | 'ai' | 'system'; timestamp?: number; attachedNotes?: Array<{ id: string; title: string }>; attachedAgent?: { id: string; name: string }; attachedSkills?: Array<{ id: string; name: string }> }>
  /**
   * Id for the turn currently streaming. Set on `cli:turn-start`, cleared on
   * `cli:turn-end`. Threaded onto every `cli:output` event so the renderer
   * can group fragments of a single turn into one bubble regardless of
   * streaming pauses.
   */
  currentTurnId?: string
}

// ── Sub-agent / delegated task types ─────────────────────────────────────────

export type SubAgentStatus = 'running' | 'completed' | 'failed' | 'killed'

export interface SubAgentInfo {
  id: string
  name: string
  cli: BackendId
  status: SubAgentStatus
  prompt: string
  model?: string
  workingDirectory?: string
  permissionMode?: string
  startedAt: number
  endedAt?: number
  exitCode?: number
  pid?: number
}

export interface SubAgentProcess {
  info: SubAgentInfo
  process: SessionHandle | null
  adapter: ICLIAdapter
  buffer: string
  /** Accumulated output lines for this sub-agent. */
  outputLog: ParsedOutput[]
}

export type { SessionOptions, ParsedOutput, SessionInfo }
