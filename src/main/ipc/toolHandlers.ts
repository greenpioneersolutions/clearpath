import type { IpcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'

interface McpServerEntry {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

interface McpConfigFile {
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

function safeReadJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function safeWriteJson(path: string, data: unknown): { success: boolean; error?: string } {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

function getMcpConfigPath(cli: 'copilot' | 'claude', scope: 'user' | 'project', workingDirectory?: string): string {
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

function addMcpServer(
  cli: 'copilot' | 'claude',
  scope: 'user' | 'project',
  name: string,
  entry: McpServerEntry,
  workingDirectory?: string,
): { success: boolean; error?: string } {
  const configPath = getMcpConfigPath(cli, scope, workingDirectory)
  const config = safeReadJson<McpConfigFile>(configPath, { mcpServers: {} })
  config.mcpServers[name] = entry
  return safeWriteJson(configPath, config)
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
