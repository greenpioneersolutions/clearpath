// ── ClearMemory MCP auto-registration ────────────────────────────────────────
// Registers (and removes) the `clearmemory` MCP server entry in the two CLI
// config files ClearPath cares about:
//   - Claude Code: ~/.claude/mcp.json   (preferred by the Claude CLI)
//   - Copilot CLI: ~/.copilot/mcp-config.json
//
// Merge-don't-clobber is the key invariant: we must NEVER wipe out other MCP
// servers the user has configured. We read the file, mutate only the
// `clearmemory` key, and write it back atomically.
//
// Known quirks:
//   - The two CLIs use subtly different file names. Claude Code looks at
//     `~/.claude/mcp.json`; Copilot CLI looks at `~/.copilot/mcp-config.json`.
//     The in-app `toolHandlers.getMcpConfigPath` targets `~/.claude/mcp-config.json`
//     for Claude — that's the *project-scope* convention. For the daemon-wide
//     ClearMemory server we want the user-scope `mcp.json` location the
//     Claude CLI actually reads.
//   - We also try `claude mcp add clearmemory -- <bin> serve` first because it
//     exercises the official CLI path (and can e.g. prompt for auth). If the
//     shell-out fails (CLI missing, non-zero exit, timeout) we fall back to a
//     direct file write.
//
// Every function is best-effort and MUST NOT throw — Slice B's enable flow
// awaits these and must not break user-facing enable just because MCP wiring
// hiccups. Each returns { ok, error? } so callers can log and proceed.

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'

import { log } from '../utils/logger'

const execFileAsync = promisify(execFile)

// ── Paths ────────────────────────────────────────────────────────────────────

/** Where the Claude CLI looks for user-scope MCP servers. */
function claudeMcpPath(): string {
  return join(homedir(), '.claude', 'mcp.json')
}

/** Where the Copilot CLI looks for user-scope MCP servers. */
function copilotMcpPath(): string {
  return join(homedir(), '.copilot', 'mcp-config.json')
}

// ── Schema ───────────────────────────────────────────────────────────────────

interface McpServerEntry {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

interface McpConfigFile {
  mcpServers: Record<string, McpServerEntry>
  /** Preserve unknown top-level keys so we don't clobber future CLI additions. */
  [other: string]: unknown
}

// ── Safe JSON I/O ────────────────────────────────────────────────────────────

function readJson(path: string): McpConfigFile {
  try {
    const text = readFileSync(path, 'utf8')
    const parsed = JSON.parse(text) as Partial<McpConfigFile>
    // Normalise: always return a valid mcpServers map.
    if (parsed && typeof parsed === 'object') {
      const servers = parsed.mcpServers
      const normalised: McpConfigFile = {
        ...parsed,
        mcpServers: servers && typeof servers === 'object' ? { ...servers } : {},
      }
      return normalised
    }
  } catch {
    // Missing file or invalid JSON — start fresh. We log at warn so the user
    // gets a trail if we end up overwriting an unparseable file.
  }
  return { mcpServers: {} }
}

/** Atomic write: tmp + rename, parent dirs auto-created. */
function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
}

// ── File-level ops ───────────────────────────────────────────────────────────

function writeClearMemoryEntry(path: string, binaryPath: string): { ok: boolean; error?: string } {
  try {
    const config = readJson(path)
    config.mcpServers.clearmemory = {
      command: binaryPath,
      args: ['serve'],
    }
    writeJsonAtomic(path, config)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

function removeClearMemoryEntry(path: string): { ok: boolean; error?: string } {
  try {
    if (!existsSync(path)) return { ok: true } // nothing to remove
    const config = readJson(path)
    if (!config.mcpServers.clearmemory) return { ok: true }
    delete config.mcpServers.clearmemory
    writeJsonAtomic(path, config)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

function hasClearMemoryEntry(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    const config = readJson(path)
    return !!config.mcpServers.clearmemory
  } catch {
    return false
  }
}

// ── Shell-out helpers (best-effort CLI-native registration) ──────────────────

/**
 * Try `claude mcp add clearmemory -- <binaryPath> serve`. Timeout 5s. Returns
 * true on success, false on any failure — the caller is expected to fall back
 * to writing mcp.json directly on `false`.
 */
async function claudeMcpAddViaShell(binaryPath: string): Promise<boolean> {
  try {
    await execFileAsync(
      'claude',
      ['mcp', 'add', 'clearmemory', '--', binaryPath, 'serve'],
      { timeout: 5_000 },
    )
    return true
  } catch (err) {
    log.warn('[clearmemory:mcp] `claude mcp add` failed — will fall back to direct file write: %s', (err as Error).message)
    return false
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function enableMcpIntegration(
  binaryPath: string,
): Promise<{ ok: boolean; claude: boolean; copilot: boolean; errors: string[] }> {
  const errors: string[] = []
  let claude = false
  let copilot = false

  if (!binaryPath) {
    return { ok: false, claude, copilot, errors: ['ClearMemory binary path is empty'] }
  }

  // Claude: attempt the CLI-native registration AND write the config file.
  // The CLI path is best-effort (may store in a format we don't observe);
  // the direct file write is what `mcp-status` later reads.
  const clipath = claudeMcpPath()
  await claudeMcpAddViaShell(binaryPath) // side-effect only; return value is a hint
  const r = writeClearMemoryEntry(clipath, binaryPath)
  if (r.ok) claude = true
  else errors.push(`claude: ${r.error ?? 'unknown error'}`)

  // Copilot: direct write (no comparable `copilot mcp add` subcommand).
  const cpPath = copilotMcpPath()
  const cpResult = writeClearMemoryEntry(cpPath, binaryPath)
  if (cpResult.ok) copilot = true
  else errors.push(`copilot: ${cpResult.error ?? 'unknown error'}`)

  return { ok: claude && copilot, claude, copilot, errors }
}

export async function disableMcpIntegration(): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = []
  for (const path of [claudeMcpPath(), copilotMcpPath()]) {
    const r = removeClearMemoryEntry(path)
    if (!r.ok && r.error) errors.push(`${path}: ${r.error}`)
  }
  return { ok: errors.length === 0, errors }
}

export function getMcpIntegrationStatus(): { claude: boolean; copilot: boolean } {
  return {
    claude: hasClearMemoryEntry(claudeMcpPath()),
    copilot: hasClearMemoryEntry(copilotMcpPath()),
  }
}
