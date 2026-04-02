/** Permission mode for Claude Code CLI */
export type ClaudePermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'auto'

/** Permission preset for Copilot CLI */
export type CopilotPermissionPreset = 'default' | 'allow-all' | 'allow-all-tools' | 'yolo'

/** Unified tool permission configuration for a session */
export interface ToolPermissionConfig {
  cli: 'copilot' | 'claude'

  // Claude-specific
  claudePermissionMode?: ClaudePermissionMode
  allowedTools: string[]
  disallowedTools: string[]

  // Copilot-specific
  copilotPreset?: CopilotPermissionPreset
  deniedTools: string[]
  availableTools: string[]
  excludedTools: string[]
}

/** MCP server entry as stored in config files */
export interface McpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
  source: 'user' | 'project' | 'flag'
  cli: 'copilot' | 'claude'
}

/** MCP config file structure (both CLIs use similar JSON) */
export interface McpConfigFile {
  mcpServers: Record<string, {
    command: string
    args?: string[]
    env?: Record<string, string>
    disabled?: boolean
  }>
}

/** A pending permission request from a running CLI session */
export interface PermissionRequest {
  sessionId: string
  id: string
  cli: 'copilot' | 'claude'
  tool: string
  description: string
  timestamp: number
  status: 'pending' | 'approved' | 'denied'
}

export function createDefaultPermissionConfig(cli: 'copilot' | 'claude'): ToolPermissionConfig {
  return {
    cli,
    claudePermissionMode: cli === 'claude' ? 'default' : undefined,
    copilotPreset: cli === 'copilot' ? 'default' : undefined,
    allowedTools: [],
    disallowedTools: [],
    deniedTools: [],
    availableTools: [],
    excludedTools: [],
  }
}
