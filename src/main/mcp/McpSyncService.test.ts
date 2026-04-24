import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── In-memory electron-store mock (isolated per file via vi.hoisted) ──────────

const { storeData, fakeHome } = vi.hoisted(() => ({
  storeData: {} as Record<string, unknown>,
  fakeHome: { path: '/tmp/mcp-sync-test-default' },
}))

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in storeData)) storeData[k] = JSON.parse(JSON.stringify(v))
          }
        }
      }
      get(key: string, fallback?: unknown): unknown {
        const val = storeData[key]
        if (val === undefined) return fallback
        return JSON.parse(JSON.stringify(val))
      }
      set(key: string, value: unknown): void {
        storeData[key] = JSON.parse(JSON.stringify(value))
      }
      has(key: string): boolean { return key in storeData }
      delete(key: string): void { delete storeData[key] }
    },
  }
})

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-key',
}))

vi.mock('os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('os')>()
  return {
    ...orig,
    homedir: () => fakeHome.path,
  }
})

// McpRegistry + McpSyncService are loaded dynamically in beforeEach after
// vi.resetModules() so the electron-store mock (which is pre-empted by
// src/test/setup-coverage.ts force-loading every source file) is applied.
let McpRegistry: typeof import('./McpRegistry').McpRegistry
let McpSyncService: typeof import('./McpSyncService').McpSyncService
let renderEntryToFileShape: typeof import('./McpSyncService').renderEntryToFileShape
let resolveNativeConfigPath: typeof import('./McpSyncService').resolveNativeConfigPath
import type { McpRegistryEntry, McpRegistryEntryInput } from '../../renderer/src/types/mcp'

// Test vault stub — deterministic, no disk IO.
class StubVault {
  private data = new Map<string, string>()
  set(k: string, v: string) { this.data.set(k, v) }
  get(k: string): string | null { return this.data.has(k) ? this.data.get(k)! : null }
  remove(k: string) { this.data.delete(k) }
  listKeys() { return [...this.data.keys()] }
  isUnsafeMode() { return false }
}

function makeEntry(overrides: Partial<McpRegistryEntry> = {}): McpRegistryEntry {
  return {
    id: overrides.id ?? 'id-' + Math.random(),
    name: 'srv',
    command: 'npx',
    args: ['-y', '@test/mcp'],
    env: {},
    secretRefs: {},
    scope: 'global',
    targets: { copilot: true, claude: true },
    enabled: true,
    source: 'custom',
    createdAt: '2026-04-22T00:00:00.000Z',
    updatedAt: '2026-04-22T00:00:00.000Z',
    ...overrides,
  }
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('McpSyncService', () => {
  let tmpRoot: string
  let projectDir: string

  beforeEach(async () => {
    for (const k of Object.keys(storeData)) delete storeData[k]
    vi.clearAllMocks()
    tmpRoot = mkdtempSync(join(tmpdir(), 'mcp-sync-'))
    fakeHome.path = tmpRoot
    projectDir = join(tmpRoot, 'project')
    mkdirSync(projectDir, { recursive: true })

    // Re-import after reset so the mocks for electron-store + os are honored
    vi.resetModules()
    const regMod = await import('./McpRegistry')
    const syncMod = await import('./McpSyncService')
    McpRegistry = regMod.McpRegistry
    McpSyncService = syncMod.McpSyncService
    renderEntryToFileShape = syncMod.renderEntryToFileShape
    resolveNativeConfigPath = syncMod.resolveNativeConfigPath
  })

  afterEach(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  // ── Pure rendering ────────────────────────────────────────────────────────

  describe('renderEntryToFileShape', () => {
    it('renders command + args with no env when env is empty', () => {
      const shape = renderEntryToFileShape(makeEntry(), new StubVault())
      expect(shape.command).toBe('npx')
      expect(shape.args).toEqual(['-y', '@test/mcp'])
      expect(shape.env).toBeUndefined()
      expect(shape.disabled).toBeUndefined()
    })

    it('includes plain env values', () => {
      const shape = renderEntryToFileShape(
        makeEntry({ env: { FOO: 'bar' } }),
        new StubVault(),
      )
      expect(shape.env).toEqual({ FOO: 'bar' })
    })

    it('resolves secret refs via the vault', () => {
      const vault = new StubVault()
      vault.set('vault-key-123', 'super-secret-token')

      const shape = renderEntryToFileShape(
        makeEntry({
          env: { TEAM_ID: 'T01' },
          secretRefs: { API_TOKEN: 'vault-key-123' },
        }),
        vault,
      )
      expect(shape.env).toEqual({ TEAM_ID: 'T01', API_TOKEN: 'super-secret-token' })
    })

    it('omits missing secrets gracefully (does not crash)', () => {
      const shape = renderEntryToFileShape(
        makeEntry({ secretRefs: { MISSING: 'no-such-key' } }),
        new StubVault(),
      )
      expect(shape.env).toBeUndefined()
    })

    it('sets disabled: true when entry is disabled', () => {
      const shape = renderEntryToFileShape(
        makeEntry({ enabled: false }),
        new StubVault(),
      )
      expect(shape.disabled).toBe(true)
    })

    it('does not set disabled when entry is enabled', () => {
      const shape = renderEntryToFileShape(
        makeEntry({ enabled: true }),
        new StubVault(),
      )
      expect(shape.disabled).toBeUndefined()
    })
  })

  // ── Path resolution ───────────────────────────────────────────────────────

  describe('resolveNativeConfigPath', () => {
    it('resolves global copilot path under ~/.copilot', () => {
      const p = resolveNativeConfigPath('copilot', 'global')
      expect(p).toBe(join(fakeHome.path, '.copilot', 'mcp-config.json'))
    })

    it('resolves global claude path under ~/.claude', () => {
      const p = resolveNativeConfigPath('claude', 'global')
      expect(p).toBe(join(fakeHome.path, '.claude', 'mcp-config.json'))
    })

    it('resolves project copilot path under .github/copilot', () => {
      const p = resolveNativeConfigPath('copilot', 'project', '/my/proj')
      expect(p).toBe('/my/proj/.github/copilot/mcp-config.json')
    })

    it('resolves project claude path under .claude', () => {
      const p = resolveNativeConfigPath('claude', 'project', '/my/proj')
      expect(p).toBe('/my/proj/.claude/mcp-config.json')
    })
  })

  // ── syncAll ───────────────────────────────────────────────────────────────

  describe('syncAll', () => {
    it('writes global config for copilot when targets.copilot = true', () => {
      const registry = new McpRegistry()
      const vault = new StubVault()
      const svc = new McpSyncService(registry, vault as never)
      registry.add(makeInput({
        name: 'github',
        command: 'npx',
        args: ['-y', '@test/github'],
        targets: { copilot: true, claude: false },
      }))

      const result = svc.syncAll([])
      expect(result.success).toBe(true)

      const copilotPath = join(fakeHome.path, '.copilot', 'mcp-config.json')
      expect(existsSync(copilotPath)).toBe(true)
      const copilotConfig = JSON.parse(readFileSync(copilotPath, 'utf8'))
      expect(copilotConfig.mcpServers.github).toBeDefined()
      expect(copilotConfig.mcpServers.github.command).toBe('npx')

      const claudePath = join(fakeHome.path, '.claude', 'mcp-config.json')
      // Claude path should exist but have no entry for 'github'
      const claudeConfig = JSON.parse(readFileSync(claudePath, 'utf8'))
      expect(claudeConfig.mcpServers.github).toBeUndefined()
    })

    it('writes to both CLIs when both targets are true', () => {
      const registry = new McpRegistry()
      const vault = new StubVault()
      const svc = new McpSyncService(registry, vault as never)
      registry.add(makeInput({ name: 'both' }))

      svc.syncAll([])

      const copilotPath = join(fakeHome.path, '.copilot', 'mcp-config.json')
      const claudePath = join(fakeHome.path, '.claude', 'mcp-config.json')
      expect(JSON.parse(readFileSync(copilotPath, 'utf8')).mcpServers.both).toBeDefined()
      expect(JSON.parse(readFileSync(claudePath, 'utf8')).mcpServers.both).toBeDefined()
    })

    it('preserves disabled state as disabled: true in output', () => {
      const registry = new McpRegistry()
      const vault = new StubVault()
      const svc = new McpSyncService(registry, vault as never)
      registry.add(makeInput({ name: 'off', enabled: false }))

      svc.syncAll([])
      const path = join(fakeHome.path, '.copilot', 'mcp-config.json')
      const cfg = JSON.parse(readFileSync(path, 'utf8'))
      expect(cfg.mcpServers.off.disabled).toBe(true)
    })

    it('writes project-scoped entries to .github/copilot/mcp-config.json', () => {
      const registry = new McpRegistry()
      const vault = new StubVault()
      const svc = new McpSyncService(registry, vault as never)
      registry.add(makeInput({
        name: 'proj-srv',
        scope: 'project',
        projectPath: projectDir,
        targets: { copilot: true, claude: false },
      }))

      svc.syncAll([projectDir])

      const path = join(projectDir, '.github', 'copilot', 'mcp-config.json')
      expect(existsSync(path)).toBe(true)
      const cfg = JSON.parse(readFileSync(path, 'utf8'))
      expect(cfg.mcpServers['proj-srv']).toBeDefined()
    })

    it('skips project entries whose projectPath is not in the allowlist', () => {
      const registry = new McpRegistry()
      const vault = new StubVault()
      const svc = new McpSyncService(registry, vault as never)
      registry.add(makeInput({
        name: 'proj-srv',
        scope: 'project',
        projectPath: '/not/in/allowlist',
      }))

      svc.syncAll([projectDir])

      const forbidden = '/not/in/allowlist/.github/copilot/mcp-config.json'
      expect(existsSync(forbidden)).toBe(false)
    })

    it('writes atomically (no .tmp leftovers after success)', () => {
      const registry = new McpRegistry()
      const vault = new StubVault()
      const svc = new McpSyncService(registry, vault as never)
      registry.add(makeInput({ name: 'atom' }))

      svc.syncAll([])

      const path = join(fakeHome.path, '.copilot', 'mcp-config.json')
      expect(existsSync(path)).toBe(true)
      expect(existsSync(path + '.tmp')).toBe(false)
    })

    it('resolves secretRefs at render time and writes plaintext to the native file', () => {
      const registry = new McpRegistry()
      const vault = new StubVault()
      vault.set('key-abc', 'ghp_realtoken')
      const svc = new McpSyncService(registry, vault as never)
      registry.add(makeInput({
        name: 'github',
        secretRefs: { GITHUB_PERSONAL_ACCESS_TOKEN: 'key-abc' },
      }))

      svc.syncAll([])
      const path = join(fakeHome.path, '.copilot', 'mcp-config.json')
      const cfg = JSON.parse(readFileSync(path, 'utf8'))
      expect(cfg.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('ghp_realtoken')
    })
  })

  // ── importExisting ────────────────────────────────────────────────────────

  describe('importExisting', () => {
    function seedNativeFile(path: string, servers: Record<string, unknown>) {
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, JSON.stringify({ mcpServers: servers }, null, 2))
    }

    it('imports global copilot servers into the registry as source: imported', () => {
      const copilotPath = join(fakeHome.path, '.copilot', 'mcp-config.json')
      seedNativeFile(copilotPath, {
        'legacy-srv': { command: 'npx', args: ['-y', '@legacy/srv'] },
      })

      const registry = new McpRegistry()
      const vault = new StubVault()
      const svc = new McpSyncService(registry, vault as never)

      const res = svc.importExisting([])
      expect(res.imported).toBe(1)
      expect(res.skipped).toBe(0)

      const entries = registry.list()
      expect(entries).toHaveLength(1)
      expect(entries[0].name).toBe('legacy-srv')
      expect(entries[0].source).toBe('imported')
      expect(entries[0].scope).toBe('global')
      expect(entries[0].targets.copilot).toBe(true)
      expect(entries[0].targets.claude).toBe(false)
    })

    it('imports global claude servers with claude target set', () => {
      const claudePath = join(fakeHome.path, '.claude', 'mcp-config.json')
      seedNativeFile(claudePath, {
        'cc-srv': { command: 'npx', args: ['x'] },
      })

      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)

      svc.importExisting([])
      const entries = registry.list()
      expect(entries[0].targets.claude).toBe(true)
      expect(entries[0].targets.copilot).toBe(false)
    })

    it('preserves disabled state on import (enabled: false when disabled: true)', () => {
      const path = join(fakeHome.path, '.copilot', 'mcp-config.json')
      seedNativeFile(path, {
        'off-srv': { command: 'npx', args: [], disabled: true },
      })

      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)
      svc.importExisting([])

      expect(registry.list()[0].enabled).toBe(false)
    })

    it('is idempotent — running twice does not double-import', () => {
      const path = join(fakeHome.path, '.copilot', 'mcp-config.json')
      seedNativeFile(path, { 'once': { command: 'npx', args: [] } })

      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)

      const first = svc.importExisting([])
      const second = svc.importExisting([])

      expect(first.imported).toBe(1)
      expect(second.imported).toBe(0)
      expect(second.skipped).toBeGreaterThan(0)
      expect(registry.list()).toHaveLength(1)
    })

    it('imports project-scoped entries when project path is provided', () => {
      const path = join(projectDir, '.claude', 'mcp-config.json')
      seedNativeFile(path, { 'proj-srv': { command: 'npx', args: [] } })

      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)
      svc.importExisting([projectDir])

      const entries = registry.list()
      expect(entries[0].name).toBe('proj-srv')
      expect(entries[0].scope).toBe('project')
      expect(entries[0].projectPath).toBe(projectDir)
      expect(entries[0].targets.claude).toBe(true)
    })

    it('skips entries that fail security validation (e.g. rm command)', () => {
      const path = join(fakeHome.path, '.copilot', 'mcp-config.json')
      seedNativeFile(path, {
        'evil': { command: 'rm', args: ['-rf', '/'] },
        'good': { command: 'npx', args: ['-y', 'ok'] },
      })

      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)
      svc.importExisting([])

      const entries = registry.list()
      expect(entries).toHaveLength(1)
      expect(entries[0].name).toBe('good')
    })

    it('returns {0,0} when no native files exist', () => {
      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)
      const res = svc.importExisting([])
      expect(res).toEqual({ imported: 0, skipped: 0 })
    })
  })

  // ── detectExternalChanges ─────────────────────────────────────────────────

  describe('detectExternalChanges', () => {
    it('returns empty when no files have been synced yet', () => {
      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)
      expect(svc.detectExternalChanges([])).toEqual([])
    })

    it('returns empty immediately after a syncAll (baseline just set)', () => {
      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)
      registry.add(makeInput({ name: 'baseline' }))
      svc.syncAll([])
      expect(svc.detectExternalChanges([])).toEqual([])
    })

    it('flags a file whose mtime has advanced since the last sync', () => {
      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)
      registry.add(makeInput({ name: 'srv', targets: { copilot: true, claude: false } }))
      svc.syncAll([])

      // Externally touch the file — advance its mtime by 10s.
      const copilotPath = join(fakeHome.path, '.copilot', 'mcp-config.json')
      const existing = readFileSync(copilotPath, 'utf8')
      writeFileSync(copilotPath, existing + '\n', 'utf8')
      const futureTime = new Date(Date.now() + 10_000)
      require('fs').utimesSync(copilotPath, futureTime, futureTime)

      const changes = svc.detectExternalChanges([])
      expect(changes.some((c) => c.path === copilotPath)).toBe(true)
    })

    it('clears after a follow-up syncAll refreshes the baseline', () => {
      const registry = new McpRegistry()
      const svc = new McpSyncService(registry, new StubVault() as never)
      registry.add(makeInput({ name: 'srv', targets: { copilot: true, claude: false } }))
      svc.syncAll([])

      const copilotPath = join(fakeHome.path, '.copilot', 'mcp-config.json')
      const existing = readFileSync(copilotPath, 'utf8')
      writeFileSync(copilotPath, existing + '\n', 'utf8')
      const futureTime = new Date(Date.now() + 10_000)
      require('fs').utimesSync(copilotPath, futureTime, futureTime)

      expect(svc.detectExternalChanges([]).length).toBeGreaterThan(0)

      // Re-sync refreshes the baseline → no external changes.
      svc.syncAll([])
      expect(svc.detectExternalChanges([])).toEqual([])
    })
  })
})
