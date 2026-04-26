import type { IpcMain } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { log } from '../utils/logger'
import { McpRegistry } from '../mcp/McpRegistry'
import { McpSyncService } from '../mcp/McpSyncService'
import { getMcpSecretsVault, type McpSecretsVault } from '../mcp/McpSecretsVault'
import { validateMcpServer } from './toolHandlers'
import type {
  McpCatalogEntry,
  McpRegistryAddRequest,
  McpRegistryAddResponse,
  McpRegistryEntry,
  McpRegistryRemoveRequest,
  McpRegistryRemoveResponse,
  McpRegistryToggleRequest,
  McpRegistryToggleResponse,
  McpRegistryUpdateRequest,
  McpRegistryUpdateResponse,
  McpSecretsMeta,
  McpSyncResult,
} from '../../renderer/src/types/mcp'

interface RegisterOptions {
  /** Root working directory; project-scoped entries live beneath this. */
  workingDirectory?: string
  /** Inject a pre-built registry instance (for tests). */
  registry?: McpRegistry
  /** Inject a pre-built sync service (for tests). */
  syncService?: McpSyncService
}

/** Where the bundled catalog lives on disk (co-located with this source file). */
function loadCatalog(): McpCatalogEntry[] {
  try {
    const path = join(__dirname, '..', 'mcp', 'catalog.json')
    const raw = readFileSync(path, 'utf8')
    return JSON.parse(raw) as McpCatalogEntry[]
  } catch (err) {
    // Fall back to looking next to this file (tsc output layout may differ)
    try {
      const fallback = join(__dirname, 'catalog.json')
      const raw = readFileSync(fallback, 'utf8')
      return JSON.parse(raw) as McpCatalogEntry[]
    } catch {
      log.error('[mcpHandlers] Could not load catalog.json: %s', err)
      return []
    }
  }
}

/**
 * Register all `mcp:*` IPC handlers. Returns the registry + sync service so
 * the main process can call `syncService.importExisting()` on startup.
 */
export function registerMcpHandlers(
  ipcMain: IpcMain,
  opts: RegisterOptions = {},
): { registry: McpRegistry; syncService: McpSyncService } {
  const registry = opts.registry ?? new McpRegistry()
  const vault = getMcpSecretsVault()
  const syncService = opts.syncService ?? new McpSyncService(registry, vault)

  const projectPaths = (): string[] => (opts.workingDirectory ? [opts.workingDirectory] : [])

  const runSync = (): McpSyncResult => {
    try {
      return syncService.syncAll(projectPaths())
    } catch (err) {
      log.error('[mcpHandlers] syncAll failed: %s', err)
      return { success: false, filesWritten: [], errors: [{ path: '', error: String(err) }] }
    }
  }

  // ── Registry CRUD ───────────────────────────────────────────────────────────

  ipcMain.handle('mcp:registry-list', (): McpRegistryEntry[] => registry.list())

  ipcMain.handle(
    'mcp:registry-add',
    (_e, req: McpRegistryAddRequest): McpRegistryAddResponse => {
      if (!req?.entry) {
        return { success: false, error: 'Missing entry' }
      }

      // Validate command before persisting (reusing the existing security checks)
      const validation = validateMcpServer({
        command: req.entry.command,
        args: req.entry.args,
        env: req.entry.env,
      })
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // Persist any provided secrets to the vault, then rewrite secretRefs
      const secretRefs: Record<string, string> = { ...(req.entry.secretRefs ?? {}) }
      if (req.secrets) {
        for (const [envVarName, plaintext] of Object.entries(req.secrets)) {
          const vaultKey = `mcp:${req.entry.name}:${envVarName}:${Date.now()}`
          vault.set(vaultKey, plaintext)
          secretRefs[envVarName] = vaultKey
        }
      }

      const added = registry.add({ ...req.entry, secretRefs })
      const syncResult = runSync()

      const response: McpRegistryAddResponse = { success: true, id: added.id }
      if (validation.warning) response.warning = validation.warning
      if (!syncResult.success && syncResult.errors[0]) {
        response.warning = [response.warning, `Sync warning: ${syncResult.errors[0].error}`]
          .filter(Boolean)
          .join(' | ')
      }
      return response
    },
  )

  ipcMain.handle(
    'mcp:registry-update',
    (_e, req: McpRegistryUpdateRequest): McpRegistryUpdateResponse => {
      if (!req?.id) return { success: false, error: 'Missing id' }
      const existing = registry.get(req.id)
      if (!existing) return { success: false, error: `Entry "${req.id}" not found` }

      // Re-validate if command or args changed
      const nextCommand = req.partial?.command ?? existing.command
      const nextArgs = req.partial?.args ?? existing.args
      const nextEnv = req.partial?.env ?? existing.env
      const validation = validateMcpServer({
        command: nextCommand,
        args: nextArgs,
        env: nextEnv,
      })
      if (!validation.valid) return { success: false, error: validation.error }

      // Merge secrets: add any new ones, preserve existing refs unless overridden
      const nextSecretRefs: Record<string, string> = {
        ...(existing.secretRefs ?? {}),
        ...(req.partial?.secretRefs ?? {}),
      }
      if (req.secrets) {
        for (const [envVarName, plaintext] of Object.entries(req.secrets)) {
          const vaultKey = nextSecretRefs[envVarName] ?? `mcp:${existing.name}:${envVarName}:${Date.now()}`
          vault.set(vaultKey, plaintext)
          nextSecretRefs[envVarName] = vaultKey
        }
      }

      registry.update(req.id, { ...req.partial, secretRefs: nextSecretRefs })
      const syncResult = runSync()

      const response: McpRegistryUpdateResponse = { success: true }
      if (validation.warning) response.warning = validation.warning
      if (!syncResult.success && syncResult.errors[0]) {
        response.warning = [response.warning, `Sync warning: ${syncResult.errors[0].error}`]
          .filter(Boolean)
          .join(' | ')
      }
      return response
    },
  )

  ipcMain.handle(
    'mcp:registry-remove',
    (_e, req: McpRegistryRemoveRequest): McpRegistryRemoveResponse => {
      if (!req?.id) return { success: false, error: 'Missing id' }
      const existing = registry.get(req.id)
      if (!existing) return { success: false, error: `Entry "${req.id}" not found` }

      // Remove associated secrets from the vault
      for (const vaultKey of Object.values(existing.secretRefs ?? {})) {
        vault.remove(vaultKey)
      }
      registry.remove(req.id)
      runSync()
      return { success: true }
    },
  )

  ipcMain.handle(
    'mcp:registry-toggle',
    (_e, req: McpRegistryToggleRequest): McpRegistryToggleResponse => {
      if (!req?.id) return { success: false, error: 'Missing id' }
      const updated = registry.toggle(req.id, !!req.enabled)
      if (!updated) return { success: false, error: `Entry "${req.id}" not found` }
      runSync()
      return { success: true }
    },
  )

  // ── Catalog ─────────────────────────────────────────────────────────────────

  ipcMain.handle('mcp:catalog-list', (): McpCatalogEntry[] => loadCatalog())

  // ── Secrets meta (never exposes plaintext) ──────────────────────────────────

  ipcMain.handle('mcp:secrets-get-meta', (): McpSecretsMeta => ({
    keys: vault.listKeys(),
    unsafeMode: vault.isUnsafeMode(),
  }))

  // ── Manual sync ─────────────────────────────────────────────────────────────

  ipcMain.handle('mcp:sync-now', (_e, req?: { reimport?: boolean }): McpSyncResult => {
    if (req?.reimport) {
      try {
        syncService.importExisting(projectPaths())
      } catch (err) {
        log.error('[mcpHandlers] importExisting failed during sync-now(reimport): %s', err)
      }
    }
    return runSync()
  })

  // ── Test connection ────────────────────────────────────────────────────────

  ipcMain.handle(
    'mcp:test-server',
    async (_e, req: { id: string }): Promise<McpTestServerResponse> => {
      return testMcpServer(req?.id, registry, vault)
    },
  )

  return { registry, syncService }
}

// ── Test-connection implementation ───────────────────────────────────────────

export interface McpTestServerResponse {
  success: boolean
  stderrSnippet?: string
  error?: string
  durationMs?: number
}

/**
 * Spawn the MCP server with the registry entry's command/args/env, write an
 * `initialize` JSON-RPC request to stdin, and wait up to 5s for a valid
 * response on stdout. Always kills the child (SIGTERM → SIGKILL) before
 * returning. Exported so tests can drive it directly without going through IPC.
 */
export async function testMcpServer(
  id: string | undefined,
  registry: McpRegistry,
  vault: Pick<McpSecretsVault, 'get'>,
): Promise<McpTestServerResponse> {
  if (!id) return { success: false, error: 'Missing id' }
  const entry = registry.get(id)
  if (!entry) return { success: false, error: `Entry "${id}" not found` }

  // Belt-and-suspenders: re-validate at test time even though it was checked at save.
  const validation = validateMcpServer({
    command: entry.command,
    args: entry.args,
    env: entry.env,
  })
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  // Resolve secret refs into plaintext env for the spawn only.
  const env: Record<string, string> = { ...process.env as Record<string, string>, ...(entry.env ?? {}) }
  for (const [envVarName, vaultKey] of Object.entries(entry.secretRefs ?? {})) {
    const plaintext = vault.get(vaultKey)
    if (plaintext !== null) env[envVarName] = plaintext
  }

  const started = Date.now()
  let child: ChildProcess
  try {
    child = spawn(entry.command, entry.args ?? [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err) {
    return { success: false, error: String(err), durationMs: Date.now() - started }
  }

  const stderrChunks: string[] = []
  child.stderr?.on('data', (buf: Buffer) => {
    stderrChunks.push(buf.toString())
  })

  let stdoutBuf = ''
  const waitForResponse = new Promise<boolean>((resolve) => {
    const onData = (buf: Buffer) => {
      stdoutBuf += buf.toString()
      // MCP JSON-RPC responses are newline-delimited
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed) as { jsonrpc?: string; id?: unknown }
          if (parsed.jsonrpc === '2.0' && parsed.id === 1) {
            resolve(true)
            return
          }
        } catch {
          // Not JSON — keep waiting
        }
      }
    }
    child.stdout?.on('data', onData)
    child.on('error', () => resolve(false))
    child.on('exit', () => resolve(false))
  })

  // Send the initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'clearpath', version: 'test' },
    },
  }
  try {
    child.stdin?.write(JSON.stringify(initRequest) + '\n')
  } catch (err) {
    // If stdin is already closed or errored, fall through and let the timeout handle it.
    log.warn('[mcpHandlers] testMcpServer stdin.write failed: %s', err)
  }

  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), 5000)
  })

  const gotResponse = await Promise.race([waitForResponse, timeout])
  const durationMs = Date.now() - started

  // Always kill the child. SIGTERM first, then SIGKILL after 1s if still alive.
  try {
    if (!child.killed) child.kill('SIGTERM')
  } catch { /* ignore */ }
  setTimeout(() => {
    try {
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL')
    } catch { /* ignore */ }
  }, 1000)

  if (gotResponse) {
    return { success: true, durationMs }
  }

  const stderrSnippet = stderrChunks.join('').slice(0, 500).trim() || undefined
  return {
    success: false,
    stderrSnippet,
    error: stderrSnippet ? undefined : 'No valid MCP initialize response within 5s',
    durationMs,
  }
}
