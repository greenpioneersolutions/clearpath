import type { IpcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'

export interface McpServerEntry {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerEntry>
}

interface McpServerInfo {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  source: 'user' | 'project'
  cli: 'copilot' | 'claude'
}

export function safeReadJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function safeWriteJson(path: string, data: unknown): { success: boolean; error?: string } {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function getMcpConfigPath(cli: 'copilot' | 'claude', scope: 'user' | 'project', workingDirectory?: string): string {
  const home = homedir()
  if (scope === 'user') {
    return cli === 'copilot'
      ? join(home, '.copilot', 'mcp-config.json')
      : join(home, '.claude', 'mcp-config.json')
  }
  const dir = workingDirectory || process.cwd()
  return cli === 'copilot'
    ? join(dir, '.github', 'copilot', 'mcp-config.json')
    : join(dir, '.claude', 'mcp-config.json')
}

function listMcpServers(cli: 'copilot' | 'claude', workingDirectory?: string): McpServerInfo[] {
  const servers: McpServerInfo[] = []

  for (const scope of ['user', 'project'] as const) {
    const configPath = getMcpConfigPath(cli, scope, workingDirectory)
    if (!existsSync(configPath)) continue

    const config = safeReadJson<McpConfigFile>(configPath, { mcpServers: {} })
    for (const [name, entry] of Object.entries(config.mcpServers ?? {})) {
      servers.push({
        id: `${scope}:${name}`,
        name,
        command: entry.command,
        args: entry.args ?? [],
        env: entry.env ?? {},
        enabled: !entry.disabled,
        source: scope,
        cli,
      })
    }
  }

  return servers
}

// ── MCP Server Command Security ─────────────────────────────────────────────

/** Known-safe MCP command patterns. Commands not matching trigger a warning. */
export const KNOWN_SAFE_MCP_COMMANDS = new Set([
  'npx', 'node', 'python', 'python3', 'uvx', 'docker', 'deno',
])

/** Commands that should be blocked outright — high risk of damage. */
export const BLOCKED_MCP_COMMANDS = /^(rm|del|format|mkfs|dd|shutdown|reboot|kill|killall|pkill|curl|wget|nc|ncat|bash|sh|zsh|cmd|powershell)$/i

/** Shell metacharacters that suggest injection attempts in args. */
export const SHELL_META_RE = /[;&|`$(){}!<>]/

export function validateMcpServer(entry: McpServerEntry): { valid: boolean; error?: string; warning?: string } {
  const cmd = entry.command.trim()

  // Block empty commands
  if (!cmd) return { valid: false, error: 'Command cannot be empty' }

  // Extract the base command name (last path segment)
  const baseName = cmd.split('/').pop()?.split('\\').pop() ?? cmd

  // Block known-dangerous commands
  if (BLOCKED_MCP_COMMANDS.test(baseName)) {
    return { valid: false, error: `Command "${baseName}" is blocked — it poses a high risk of data loss or system damage` }
  }

  // Check for shell metacharacters in arguments
  if (entry.args?.some((a) => SHELL_META_RE.test(a))) {
    return { valid: false, error: 'MCP server arguments contain shell metacharacters — this may indicate a command injection attempt' }
  }

  // Warn if command is not in the known-safe list
  let warning: string | undefined
  if (!KNOWN_SAFE_MCP_COMMANDS.has(baseName) && !cmd.startsWith('/') && !cmd.startsWith('.')) {
    warning = `Command "${baseName}" is not in the known-safe list. Verify this is a trusted MCP server before enabling.`
  }

  return { valid: true, warning }
}

function addMcpServer(
  cli: 'copilot' | 'claude',
  scope: 'user' | 'project',
  name: string,
  entry: McpServerEntry,
  workingDirectory?: string,
): { success: boolean; error?: string; warning?: string } {
  // Validate command before persisting
  const validation = validateMcpServer(entry)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  const configPath = getMcpConfigPath(cli, scope, workingDirectory)
  const config = safeReadJson<McpConfigFile>(configPath, { mcpServers: {} })
  config.mcpServers[name] = entry
  const result = safeWriteJson(configPath, config)
  return { ...result, warning: validation.warning }
}

function removeMcpServer(
  cli: 'copilot' | 'claude',
  scope: 'user' | 'project',
  name: string,
  workingDirectory?: string,
): { success: boolean; error?: string } {
  const configPath = getMcpConfigPath(cli, scope, workingDirectory)
  const config = safeReadJson<McpConfigFile>(configPath, { mcpServers: {} })
  delete config.mcpServers[name]
  return safeWriteJson(configPath, config)
}

function toggleMcpServer(
  cli: 'copilot' | 'claude',
  scope: 'user' | 'project',
  name: string,
  enabled: boolean,
  workingDirectory?: string,
): { success: boolean; error?: string } {
  const configPath = getMcpConfigPath(cli, scope, workingDirectory)
  const config = safeReadJson<McpConfigFile>(configPath, { mcpServers: {} })
  const entry = config.mcpServers[name]
  if (!entry) return { success: false, error: `MCP server "${name}" not found` }
  if (enabled) {
    delete entry.disabled
  } else {
    entry.disabled = true
  }
  return safeWriteJson(configPath, config)
}

function getClaudeSettings(workingDirectory?: string): Record<string, unknown> {
  const dir = workingDirectory || process.cwd()
  const projectPath = join(dir, '.claude', 'settings.json')
  return safeReadJson<Record<string, unknown>>(projectPath, {})
}

function saveClaudeSettings(settings: Record<string, unknown>, workingDirectory?: string): { success: boolean; error?: string } {
  const dir = workingDirectory || process.cwd()
  const projectPath = join(dir, '.claude', 'settings.json')
  return safeWriteJson(projectPath, settings)
}

function getCopilotSettings(workingDirectory?: string): Record<string, unknown> {
  const dir = workingDirectory || process.cwd()
  const settingsPath = join(dir, '.github', 'copilot', 'settings.json')
  return safeReadJson<Record<string, unknown>>(settingsPath, {})
}

function saveCopilotSettings(settings: Record<string, unknown>, workingDirectory?: string): { success: boolean; error?: string } {
  const dir = workingDirectory || process.cwd()
  const settingsPath = join(dir, '.github', 'copilot', 'settings.json')
  return safeWriteJson(settingsPath, settings)
}

export function registerToolHandlers(ipcMain: IpcMain): void {
  // ── MCP Server Management ──────────────────────────────────────────────────

  ipcMain.handle(
    'tools:list-mcp-servers',
    (_e, args: { cli: 'copilot' | 'claude'; workingDirectory?: string }) =>
      listMcpServers(args.cli, args.workingDirectory),
  )

  ipcMain.handle(
    'tools:add-mcp-server',
    (_e, args: {
      cli: 'copilot' | 'claude'
      scope: 'user' | 'project'
      name: string
      command: string
      args: string[]
      env?: Record<string, string>
      workingDirectory?: string
    }) =>
      addMcpServer(args.cli, args.scope, args.name, {
        command: args.command,
        args: args.args,
        env: args.env,
      }, args.workingDirectory),
  )

  ipcMain.handle(
    'tools:remove-mcp-server',
    (_e, args: {
      cli: 'copilot' | 'claude'
      scope: 'user' | 'project'
      name: string
      workingDirectory?: string
    }) =>
      removeMcpServer(args.cli, args.scope, args.name, args.workingDirectory),
  )

  ipcMain.handle(
    'tools:toggle-mcp-server',
    (_e, args: {
      cli: 'copilot' | 'claude'
      scope: 'user' | 'project'
      name: string
      enabled: boolean
      workingDirectory?: string
    }) =>
      toggleMcpServer(args.cli, args.scope, args.name, args.enabled, args.workingDirectory),
  )

  // ── Settings (for permission/tool config stored in settings files) ─────────

  ipcMain.handle(
    'tools:get-settings',
    (_e, args: { cli: 'copilot' | 'claude'; workingDirectory?: string }) =>
      args.cli === 'claude'
        ? getClaudeSettings(args.workingDirectory)
        : getCopilotSettings(args.workingDirectory),
  )

  ipcMain.handle(
    'tools:save-settings',
    (_e, args: { cli: 'copilot' | 'claude'; settings: Record<string, unknown>; workingDirectory?: string }) =>
      args.cli === 'claude'
        ? saveClaudeSettings(args.settings, args.workingDirectory)
        : saveCopilotSettings(args.settings, args.workingDirectory),
  )
}
