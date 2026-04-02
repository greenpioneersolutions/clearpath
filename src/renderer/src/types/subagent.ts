import type { ParsedOutput } from './ipc'

export type SubAgentStatus = 'running' | 'completed' | 'failed' | 'killed'

export interface SubAgentInfo {
  id: string
  name: string
  cli: 'copilot' | 'claude'
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

export interface QueuedTask {
  id: string
  prompt: string
  priority: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rate-limited'
  estimatedTokens?: number
  cli: 'copilot' | 'claude'
  model?: string
  createdAt: number
  startedAt?: number
  endedAt?: number
}

export interface FleetAgent {
  name: string
  status: 'working' | 'idle' | 'done' | 'error'
  task: string
  progress?: string
}
