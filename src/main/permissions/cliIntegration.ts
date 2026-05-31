// ── Wiring the PermissionBroker into each CLI ─────────────────────────────────
// Resolves the bundled client scripts and builds the per-CLI config that points
// them at the broker:
//   • Claude — adds a `clearpath_permission` MCP server (carrying the broker env)
//     to --mcp-config, and uses --permission-prompt-tool.
//   • Copilot — registers a `permissionRequest` hook in the user's ~/.copilot/
//     settings.json (merge-don't-clobber). The broker env is injected into the
//     copilot SPAWN env per session, which the hook child inherits; for the
//     user's own terminal copilot (no broker env) the hook is a no-op allow.

import { app } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'

export const CLAUDE_PERMISSION_SERVER = 'clearpath_permission'
export const CLAUDE_PERMISSION_TOOL = `mcp__${CLAUDE_PERMISSION_SERVER}__permission_prompt`

export interface BrokerEnv {
  BROKER_URL: string
  BROKER_TOKEN: string
  BROKER_SESSION: string
}

/** Absolute path to a bundled permission client script (dev or packaged). */
export function resolvePermissionResource(name: 'claude-mcp-server.mjs' | 'copilot-hook.mjs'): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'permission')
    : join(app.getAppPath(), 'resources', 'permission')
  return join(base, name)
}

/**
 * Merge the ClearPath permission MCP server into an existing --mcp-config value
 * (JSON string or undefined) and return the combined JSON string. Carries the
 * broker env on the server entry so the spawned MCP server can reach the broker.
 */
export function buildClaudeMcpConfig(existing: string | undefined, scriptPath: string, env: BrokerEnv): string {
  let base: { mcpServers?: Record<string, unknown> } = {}
  if (existing && existing.trim().startsWith('{')) {
    try { base = JSON.parse(existing) as typeof base } catch { base = {} }
  } else if (existing && existsSync(existing)) {
    try { base = JSON.parse(readFileSync(existing, 'utf8')) as typeof base } catch { base = {} }
  }
  const servers = { ...(base.mcpServers ?? {}) }
  servers[CLAUDE_PERMISSION_SERVER] = {
    command: 'node',
    args: [scriptPath],
    env: { ...env },
  }
  return JSON.stringify({ ...base, mcpServers: servers })
}

// ── Copilot hook (global settings.json, merge-don't-clobber) ───────────────────

function copilotSettingsPath(): string {
  const home = process.env['COPILOT_HOME'] || join(homedir(), '.copilot')
  return join(home, 'settings.json')
}

interface CopilotSettings {
  version?: number
  hooks?: { permissionRequest?: Array<Record<string, unknown>>; [k: string]: unknown }
  [k: string]: unknown
}

const HOOK_MARKER = 'clearpath-permission'

/** Build the hook entry that runs our bundled hook script via node. */
function hookEntry(scriptPath: string): Record<string, unknown> {
  return {
    type: 'command',
    // `bash` is the command Copilot runs; quote the path for spaces.
    bash: `node '${scriptPath}'`,
    timeoutSec: 180,
    // Marker so we can find + remove only our entry on teardown.
    name: HOOK_MARKER,
  }
}

function readCopilotSettings(path: string): CopilotSettings {
  if (!existsSync(path)) return {}
  try { return JSON.parse(readFileSync(path, 'utf8')) as CopilotSettings } catch { return {} }
}

function writeCopilotSettings(path: string, data: CopilotSettings): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, path)
}

/**
 * Ensure exactly one ClearPath permissionRequest hook is registered in the
 * user's Copilot settings.json. Idempotent; never clobbers other hooks/keys.
 * Returns the settings path written (or null if already present).
 */
export function ensureCopilotHook(scriptPath: string, path = copilotSettingsPath()): string | null {
  const settings = readCopilotSettings(path)
  const hooks = settings.hooks ?? {}
  const list = Array.isArray(hooks.permissionRequest) ? hooks.permissionRequest : []
  const others = list.filter((h) => h?.['name'] !== HOOK_MARKER)
  const next: CopilotSettings = {
    ...settings,
    version: settings.version ?? 1,
    hooks: { ...hooks, permissionRequest: [...others, hookEntry(scriptPath)] },
  }
  writeCopilotSettings(path, next)
  return path
}

/** Remove only ClearPath's hook entry (teardown). Leaves everything else intact. */
export function removeCopilotHook(path = copilotSettingsPath()): void {
  if (!existsSync(path)) return
  const settings = readCopilotSettings(path)
  const list = settings.hooks?.permissionRequest
  if (!Array.isArray(list)) return
  const others = list.filter((h) => h?.['name'] !== HOOK_MARKER)
  const hooks: Record<string, unknown> = { ...settings.hooks }
  if (others.length === 0) delete hooks['permissionRequest']
  else hooks['permissionRequest'] = others
  writeCopilotSettings(path, { ...settings, hooks })
}
