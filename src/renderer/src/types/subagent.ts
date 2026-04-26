import type { ParsedOutput } from './ipc'
import type { BackendId } from '../../../shared/backends'

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

export interface QueuedTask {
  id: string
  prompt: string
  priority: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rate-limited'
  estimatedTokens?: number
  cli: BackendId
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
