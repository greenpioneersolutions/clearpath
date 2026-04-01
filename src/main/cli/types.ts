import type { ChildProcess } from 'child_process'
import type { SessionOptions, ParsedOutput, SessionInfo } from '../../renderer/src/types/ipc'

export interface ICLIAdapter {
  readonly cliName: string
  binaryPath: string

  isInstalled(): Promise<boolean>
  isAuthenticated(): Promise<boolean>

  buildArgs(options: SessionOptions): string[]
  parseOutput(data: string): ParsedOutput

  startSession(options: SessionOptions): ChildProcess
  sendInput(proc: ChildProcess, input: string): void
  sendSlashCommand(proc: ChildProcess, command: string): void
}

export interface ActiveSession {
  info: SessionInfo
  process: ChildProcess
  adapter: ICLIAdapter
  /** Partial line buffer — accumulates bytes until newline */
  buffer: string
}

export type { SessionOptions, ParsedOutput, SessionInfo }
