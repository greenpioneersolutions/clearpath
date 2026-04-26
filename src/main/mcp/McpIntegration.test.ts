/**
 * End-to-end integration test for the MCP management system.
 *
 * Unlike the unit tests in this directory, this file uses REAL instances of
 * `McpRegistry` (backed by a real `electron-store`), `McpSyncService` (writing
 * to a real tmp filesystem), and `McpSecretsVault` (operating in `unsafeMode`
 * because Electron's `safeStorage.isEncryptionAvailable()` returns false in
 * the electron-mock used by Vitest). IPC handlers are registered against a
 * fake `ipcMain` that captures each `handle(channel, fn)` call into a map so
 * the test can invoke them the way the renderer would.
 *
 * If this file passes, the whole MCP management system works end-to-end —
 * from IPC request, through registry mutation, through sync, to files on disk.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Store from 'electron-store'

// The vitest electron alias resolves `electron` to src/test/electron-mock.ts,
// whose `safeStorage.isEncryptionAvailable()` returns false by default —
// causing `McpSecretsVault.set` to fall back to plaintext and flip unsafeMode
// to true. That's exactly what we want for this test so we don't need a real
// OS keychain.

// NOTE: we intentionally do NOT mock electron-store here. The registry writes
// to a real store file under a tmp cwd so we can read raw bytes off disk.

import type { IpcMain } from 'electron'
import type {
  McpRegistryEntry,
  McpRegistryEntryInput,
  McpCatalogEntry,
} from '../../renderer/src/types/mcp'

// Modules are re-imported in beforeEach after vi.resetModules() so that
// setup-coverage.ts's pre-load doesn't cache a version of the vault singleton
// or the registry store from an unrelated test.
let McpRegistry: typeof import('./McpRegistry').McpRegistry
let McpSyncService: typeof import('./McpSyncService').McpSyncService
let McpSecretsVault: typeof import('./McpSecretsVault').McpSecretsVault
let __setMcpSecretsVaultForTesting: typeof import('./McpSecretsVault').__setMcpSecretsVaultForTesting
let registerMcpHandlers: typeof import('../ipc/mcpHandlers').registerMcpHandlers

// ── Fake IpcMain that captures handlers into a map ────────────────────────────

type Handler = (event: unknown, ...args: unknown[]) => unknown

interface FakeIpcMain {
  handle: (channel: string, fn: Handler) => void
  on: (channel: string, fn: Handler) => void
  once: (channel: string, fn: Handler) => void
  removeHandler: (channel: string) => void
  removeListener: (channel: string, fn: Handler) => void
  removeAllListeners: (channel?: string) => void
  handlers: Record<string, Handler>
  invoke: (channel: string, arg?: unknown) => Promise<unknown>
}

function makeFakeIpcMain(): FakeIpcMain {
  const handlers: Record<string, Handler> = {}
  const ipc: FakeIpcMain = {
    handlers,
    handle: (channel, fn) => {
      handlers[channel] = fn
    },
    on: () => {},
    once: () => {},
    removeHandler: (channel) => {
      delete handlers[channel]
    },
    removeListener: () => {},
    removeAllListeners: () => {},
    invoke: async (channel, arg) => {
      const fn = handlers[channel]
      if (!fn) throw new Error(`No handler registered for channel "${channel}"`)
      return await fn({} as unknown, arg)
    },
  }
  return ipc
}

function makeInput(overrides: Partial<McpRegistryEntryInput> = {}): McpRegistryEntryInput {
  return {
    name: 'srv',
    command: 'npx',
    args: ['-y', '@test/mcp'],
    env: {},
    secretRefs: {},
    scope: 'global',
    targets: { copilot: true, claude: true },
    enabled: true,
    source: 'custom',
    ...overrides,
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('MCP integration (real registry + sync + vault + IPC)', () => {
  let tmpRoot: string
  let tmpHome: string
  let storeCwd: string
  let vaultPath: string
  let ipc: FakeIpcMain
  let registry: InstanceType<typeof McpRegistry>
  let syncService: InstanceType<typeof McpSyncService>
  let vault: InstanceType<typeof McpSecretsVault>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    tmpRoot = mkdtempSync(join(tmpdir(), 'mcp-integration-'))
    tmpHome = join(tmpRoot, 'home')
    storeCwd = join(tmpRoot, 'store')
    vaultPath = join(tmpRoot, 'vault', 'mcp-secrets.json')
    mkdirSync(tmpHome, { recursive: true })
    mkdirSync(storeCwd, { recursive: true })

    // Re-import after reset so the vault singleton setter is the freshly-loaded one
    const regMod = await import('./McpRegistry')
    const syncMod = await import('./McpSyncService')
    const vaultMod = await import('./McpSecretsVault')
    const handlersMod = await import('../ipc/mcpHandlers')
    McpRegistry = regMod.McpRegistry
    McpSyncService = syncMod.McpSyncService
    McpSecretsVault = vaultMod.McpSecretsVault
    __setMcpSecretsVaultForTesting = vaultMod.__setMcpSecretsVaultForTesting
    registerMcpHandlers = handlersMod.registerMcpHandlers

    // Real electron-store, pointed at the tmp cwd.
    const store = new Store({
      cwd: storeCwd,
      name: 'clear-path-mcps',
      // Explicitly unencrypted so scenario 2's raw-bytes grep can inspect the
      // serialized JSON. In production the store IS encrypted; we're testing
      // the in-memory data model here (no plaintext in `entries`), not the
      // encryption layer itself.
      defaults: { entries: [] },
    } as ConstructorParameters<typeof Store>[0])
    registry = new McpRegistry(store as never)

    // Real vault, pointed at a tmp file. Because electron-mock's
    // safeStorage.isEncryptionAvailable() returns false, the very first `set`
    // call flips this instance into unsafeMode: true. We force that up-front
    // by calling set/remove on a throwaway key so isUnsafeMode() is true from
    // the start for handlers that read it before any mutation.
    vault = new McpSecretsVault(vaultPath)
    vault.set('__bootstrap__', 'x')
    vault.remove('__bootstrap__')
    __setMcpSecretsVaultForTesting(vault)

    // Real sync service, with home override so writes go under tmpHome.
    syncService = new McpSyncService(registry, vault, { homedirOverride: tmpHome })

    // Register IPC handlers with the injected registry + syncService so every
    // handler uses the same instances we're asserting on.
    ipc = makeFakeIpcMain()
    registerMcpHandlers(ipc as unknown as IpcMain, { registry, syncService })
  })

  afterEach(() => {
    __setMcpSecretsVaultForTesting(null)
    try { rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  // ── Path helpers for assertions ─────────────────────────────────────────────

  const copilotGlobalPath = () => join(tmpHome, '.copilot', 'mcp-config.json')
  const claudeGlobalPath = () => join(tmpHome, '.claude', 'mcp-config.json')
  const copilotProjectPath = (proj: string) => join(proj, '.github', 'copilot', 'mcp-config.json')
  const claudeProjectPath = (proj: string) => join(proj, '.claude', 'mcp-config.json')
  const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as { mcpServers: Record<string, unknown> }

  // Load the bundled catalog the same way the handler does.
  async function getCatalog(): Promise<McpCatalogEntry[]> {
    const result = (await ipc.invoke('mcp:catalog-list')) as McpCatalogEntry[]
    return result
  }

  // ── Scenarios ──────────────────────────────────────────────────────────────

  it('1. catalog install round-trip: filesystem entry reaches both global files, no project files created', async () => {
    const catalog = await getCatalog()
    const fsEntry = catalog.find((c) => c.id === 'filesystem')
    expect(fsEntry).toBeDefined()

    // Renderer-style invocation: build an input from the catalog entry + a path arg.
    const input: McpRegistryEntryInput = {
      name: fsEntry!.id,
      command: fsEntry!.command,
      args: [...fsEntry!.args, '/tmp/some-dir'],
      env: {},
      secretRefs: {},
      scope: 'global',
      targets: { copilot: true, claude: true },
      enabled: true,
      source: 'catalog',
      catalogId: fsEntry!.id,
    }

    const res = (await ipc.invoke('mcp:registry-add', { entry: input })) as { success: boolean; id?: string }
    expect(res.success).toBe(true)
    expect(res.id).toBeTruthy()

    // Both global rendered files should contain the filesystem entry.
    expect(existsSync(copilotGlobalPath())).toBe(true)
    expect(existsSync(claudeGlobalPath())).toBe(true)
    const copilotCfg = readJson(copilotGlobalPath())
    const claudeCfg = readJson(claudeGlobalPath())
    expect(copilotCfg.mcpServers.filesystem).toBeDefined()
    expect(claudeCfg.mcpServers.filesystem).toBeDefined()
    expect((copilotCfg.mcpServers.filesystem as { command: string }).command).toBe('npx')
    expect((copilotCfg.mcpServers.filesystem as { args: string[] }).args).toEqual([
      ...fsEntry!.args,
      '/tmp/some-dir',
    ])

    // No project-scoped files should have been created anywhere under tmpRoot.
    // (Nothing was added with scope: 'project', so there should be no .github
    // or project-scoped .claude paths on disk.)
    const stray = [
      join(tmpRoot, '.github', 'copilot', 'mcp-config.json'),
      join(tmpRoot, '.claude', 'mcp-config.json'),
    ]
    for (const p of stray) {
      expect(existsSync(p)).toBe(false)
    }
  })

  it('2. secret resolution round-trip: plaintext token reaches rendered file but never the store', async () => {
    const catalog = await getCatalog()
    const gh = catalog.find((c) => c.id === 'github')
    expect(gh).toBeDefined()

    const token = 'ghp_test_12345'
    const input: McpRegistryEntryInput = {
      name: gh!.id,
      command: gh!.command,
      args: [...gh!.args],
      env: {},
      secretRefs: {}, // filled in by the handler from `secrets`
      scope: 'global',
      targets: { copilot: true, claude: true },
      enabled: true,
      source: 'catalog',
      catalogId: gh!.id,
    }

    const res = (await ipc.invoke('mcp:registry-add', {
      entry: input,
      secrets: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
    })) as { success: boolean; id?: string }
    expect(res.success).toBe(true)

    // Rendered file should contain the plaintext token in env.
    const copilotCfg = readJson(copilotGlobalPath())
    const ghServer = copilotCfg.mcpServers.github as { env: Record<string, string> }
    expect(ghServer.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(token)

    // Registry entry should hold only a secretRef, never the plaintext.
    const entries = registry.list()
    expect(entries).toHaveLength(1)
    const stored = entries[0] as McpRegistryEntry
    expect(stored.secretRefs.GITHUB_PERSONAL_ACCESS_TOKEN).toBeTruthy()
    expect(JSON.stringify(stored)).not.toContain(token)

    // Raw store bytes must not contain the literal token string anywhere.
    const storeFile = join(storeCwd, 'clear-path-mcps.json')
    expect(existsSync(storeFile)).toBe(true)
    const rawStoreBytes = readFileSync(storeFile, 'utf8')
    expect(rawStoreBytes).not.toContain(token)
  })

  it('3. toggle OFF preserves the entry with disabled: true (not deleted)', async () => {
    const input = makeInput({ name: 'toggle-me', targets: { copilot: true, claude: false } })
    const addRes = (await ipc.invoke('mcp:registry-add', { entry: input })) as { id: string }

    // Now toggle OFF.
    const toggleRes = (await ipc.invoke('mcp:registry-toggle', {
      id: addRes.id,
      enabled: false,
    })) as { success: boolean }
    expect(toggleRes.success).toBe(true)

    // Rendered file should still have the entry, now with disabled: true.
    const cfg = readJson(copilotGlobalPath())
    const entry = cfg.mcpServers['toggle-me'] as { disabled?: boolean; command?: string } | undefined
    expect(entry).toBeDefined()
    expect(entry!.disabled).toBe(true)
    expect(entry!.command).toBe('npx')

    // Registry should still contain it (enabled: false, not removed).
    const regEntries = registry.list()
    expect(regEntries).toHaveLength(1)
    expect(regEntries[0].enabled).toBe(false)
  })

  it('4. remove cleans the entry from BOTH rendered files AND from the registry', async () => {
    const input = makeInput({ name: 'gonna-die', targets: { copilot: true, claude: true } })
    const { id } = (await ipc.invoke('mcp:registry-add', { entry: input })) as { id: string }

    // Sanity: both files have it before remove.
    expect(readJson(copilotGlobalPath()).mcpServers['gonna-die']).toBeDefined()
    expect(readJson(claudeGlobalPath()).mcpServers['gonna-die']).toBeDefined()

    const rmRes = (await ipc.invoke('mcp:registry-remove', { id })) as { success: boolean }
    expect(rmRes.success).toBe(true)

    // Registry is empty.
    expect(registry.list()).toHaveLength(0)

    // Both rendered files still exist but no longer contain the entry.
    expect(readJson(copilotGlobalPath()).mcpServers['gonna-die']).toBeUndefined()
    expect(readJson(claudeGlobalPath()).mcpServers['gonna-die']).toBeUndefined()
  })

  it('5. importExisting is idempotent — running twice does not duplicate', () => {
    // Pre-seed a native file with a server ClearPath has never seen.
    const preSeedPath = copilotGlobalPath()
    mkdirSync(join(preSeedPath, '..'), { recursive: true })
    writeFileSync(
      preSeedPath,
      JSON.stringify({ mcpServers: { 'pre-existing': { command: 'npx', args: ['-y', '@pre/mcp'] } } }, null, 2),
    )

    // Fresh services against the same store/home so they see the seed.
    const freshStore = new Store({
      cwd: storeCwd,
      name: 'clear-path-mcps',
      defaults: { entries: [] },
    } as ConstructorParameters<typeof Store>[0])
    const freshRegistry = new McpRegistry(freshStore as never)
    const freshSync = new McpSyncService(freshRegistry, vault, { homedirOverride: tmpHome })

    const first = freshSync.importExisting([])
    expect(first.imported).toBe(1)
    expect(freshRegistry.list()).toHaveLength(1)
    expect(freshRegistry.list()[0].source).toBe('imported')

    const second = freshSync.importExisting([])
    expect(second.imported).toBe(0)
    expect(freshRegistry.list()).toHaveLength(1)
  })

  it('6. project-scope write gating: entries outside the allowlist are skipped, entries inside are written', () => {
    const projA = join(tmpRoot, 'projA')
    const projB = join(tmpRoot, 'projB')
    mkdirSync(projA, { recursive: true })
    mkdirSync(projB, { recursive: true })

    registry.add(makeInput({
      name: 'proj-srv',
      scope: 'project',
      projectPath: projA,
      targets: { copilot: true, claude: false },
    }))

    // allowlist = [projB] → projA is NOT allowed, entry is filtered out.
    syncService.syncAll([projB])
    expect(existsSync(copilotProjectPath(projA))).toBe(false)
    expect(existsSync(claudeProjectPath(projA))).toBe(false)

    // Now put projA in the allowlist → entry renders into projA's copilot path.
    syncService.syncAll([projA])
    expect(existsSync(copilotProjectPath(projA))).toBe(true)
    expect(readJson(copilotProjectPath(projA)).mcpServers['proj-srv']).toBeDefined()
    // Claude target was false, so the Claude project file should have no entry
    // (it may exist as an empty shell due to bucket enumeration — assert absence
    // of the specific server either way).
    if (existsSync(claudeProjectPath(projA))) {
      expect(readJson(claudeProjectPath(projA)).mcpServers['proj-srv']).toBeUndefined()
    }
  })

  it('7. detectExternalChanges flags files whose mtime advanced since last sync, then clears on re-sync', () => {
    registry.add(makeInput({ name: 'watched', targets: { copilot: true, claude: false } }))
    syncService.syncAll([])

    const copilotPath = copilotGlobalPath()
    expect(existsSync(copilotPath)).toBe(true)

    // Baseline: no external changes right after sync.
    expect(syncService.detectExternalChanges([])).toEqual([])

    // Advance mtime by 10 seconds.
    const future = new Date(Date.now() + 10_000)
    utimesSync(copilotPath, future, future)

    const detected = syncService.detectExternalChanges([])
    expect(detected.some((c) => c.path === copilotPath)).toBe(true)

    // After a re-sync, the baseline refreshes and the file is no longer flagged.
    syncService.syncAll([])
    expect(syncService.detectExternalChanges([])).toEqual([])
  })
})
