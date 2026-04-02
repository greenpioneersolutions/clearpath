export interface ConfigFile {
  path: string
  name: string
  exists: boolean
  category: 'instructions' | 'settings' | 'agent' | 'skill' | 'command' | 'rule'
  cli: 'copilot' | 'claude' | 'both'
  isGlobal: boolean
}

export interface MemoryEntry {
  id: string
  path: string
  name: string
  content: string
  type: string
  description: string
  projectPath: string
  modifiedAt: number
}
