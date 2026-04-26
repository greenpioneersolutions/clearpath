/**
 * Unit tests for mcpHandlers.ts — registry CRUD IPC + catalog + secrets-meta.
 *
 * The handler layer is thin: most real work is delegated to McpRegistry and
 * McpSyncService, which have their own tests. These tests verify:
 *   1. security validation runs before persistence
 *   2. syncAll is invoked after every mutation
 *   3. secrets flow from the request into the vault, and secretRefs are filled
 *   4. the catalog JSON is loaded and returned
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── In-memory electron-store mock (isolated per file via vi.hoisted) ──────────

const { storeData, spawnState } = vi.hoisted(() => ({
  storeData: {} as Record<string, unknown>,
  spawnState: {
    spawn: null as null | ((cmd: string, args: string[], opts: unknown) => unknown),
  },
}))

vi.mock('child_process', () => ({
  spawn: (cmd: string, args: string[], opts: unknown) => {
    if (!spawnState.spawn) throw new Error('spawn mock not set for this test')
    return spawnState.spawn(cmd, args, opts)
  },
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

import type { IpcMain } from 'electron'
// These modules are re-imported in beforeEach after vi.resetModules() because
// src/test/setup-coverage.ts force-loads every source file BEFORE the per-file
// mock for electron-store is applied.
type McpRegistryType = import('../mcp/McpRegistry').McpRegistry
let McpRegistry: typeof import('../mcp/McpRegistry').McpRegistry
let McpSyncService: typeof import('../mcp/McpSyncService').McpSyncService
let registerMcpHandlers: typeof import('./mcpHandlers').registerMcpHandlers
let testMcpServer: typeof import('./mcpHandlers').testMcpServer
let __setMcpSecretsVaultForTesting: typeof import('../mcp/McpSecretsVault').__setMcpSecretsVaultForTesting

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(mockIpcMain: { handle: ReturnType<typeof vi.fn> }): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of mockIpcMain.handle.mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

// ── Vault stub ────────────────────────────────────────────────────────────────

class StubVault {
  private data = new Map<string, string>()
  setCount = 0
  removeCount = 0
  set(k: string, v: string) { this.data.set(k, v); this.setCount++ }
  get(k: string) { return this.data.has(k) ? this.data.get(k)! : null }
  remove(k: string) { this.data.delete(k); this.removeCount++ }
  listKeys() { return [...this.data.keys()] }
  isUnsafeMode() { return false }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mcpHandlers', () => {
  let handlers: HandlerMap
  let ipcMainMock: { handle: ReturnType<typeof vi.fn> }
  let registry: McpRegistryType
  let vault: StubVault
  let syncSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    for (const k of Object.keys(storeData)) delete storeData[k]
    vi.clearAllMocks()
    vi.resetModules()

    const regMod = await import('../mcp/McpRegistry')
    const syncMod = await import('../mcp/McpSyncService')
    const vaultMod = await import('../mcp/McpSecretsVault')
    const handlerMod = await import('./mcpHandlers')
    McpRegistry = regMod.McpRegistry
    McpSyncService = syncMod.McpSyncService
    __setMcpSecretsVaultForTesting = vaultMod.__setMcpSecretsVaultForTesting
    registerMcpHandlers = handlerMod.registerMcpHandlers
    testMcpServer = handlerMod.testMcpServer

    vault = new StubVault()
    __setMcpSecretsVaultForTesting(vault as never)

    registry = new McpRegistry()
    const syncService = new McpSyncService(registry, vault as never)
    syncSpy = vi.spyOn(syncService, 'syncAll').mockReturnValue({
      success: true, filesWritten: [], errors: [],
    })

    ipcMainMock = { handle: vi.fn() }
    registerMcpHandlers(ipcMainMock as unknown as IpcMain, { registry, syncService })
    handlers = extractHandlers(ipcMainMock)
  })

  // ── Handler registration ────────────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers every expected channel', () => {
      const expected = [
        'mcp:registry-list',
        'mcp:registry-add',
        'mcp:registry-update',
        'mcp:registry-remove',
        'mcp:registry-toggle',
        'mcp:catalog-list',
        'mcp:secrets-get-meta',
        'mcp:sync-now',
      ]
      for (const ch of expected) {
        expect(handlers[ch]).toBeDefined()
      }
    })
  })

  // ── registry-list ──────────────────────────────────────────────────────────

  describe('mcp:registry-list', () => {
    it('returns empty array when registry is empty', () => {
      expect(handlers['mcp:registry-list']({})).toEqual([])
    })

    it('returns current registry contents', () => {
      registry.add({
        name: 'a', command: 'npx', args: [], env: {}, secretRefs: {},
        scope: 'global', targets: { copilot: true, claude: false },
        enabled: true, source: 'custom',
      })
      const list = handlers['mcp:registry-list']({}) as unknown[]
      expect(list).toHaveLength(1)
    })
  })

  // ── registry-add ───────────────────────────────────────────────────────────

  describe('mcp:registry-add', () => {
    const validEntry = {
      name: 'github',
      command: 'npx',
      args: ['-y', '@test/github'],
      env: {},
      secretRefs: {},
      scope: 'global' as const,
      targets: { copilot: true, claude: true },
      enabled: true,
      source: 'catalog' as const,
    }

    it('adds an entry and triggers sync', () => {
      const result = handlers['mcp:registry-add']({}, { entry: validEntry }) as {
        success: boolean; id?: string
      }
      expect(result.success).toBe(true)
      expect(result.id).toBeTruthy()
      expect(registry.list()).toHaveLength(1)
      expect(syncSpy).toHaveBeenCalled()
    })

    it('stores secrets in the vault and fills secretRefs', () => {
      const result = handlers['mcp:registry-add']({}, {
        entry: validEntry,
        secrets: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_realtoken' },
      }) as { success: boolean; id?: string }

      expect(result.success).toBe(true)
      expect(vault.setCount).toBe(1)
      const added = registry.get(result.id!)
      expect(added).toBeDefined()
      expect(added!.secretRefs.GITHUB_PERSONAL_ACCESS_TOKEN).toBeTruthy()
      // Vault should have the plaintext under the generated key
      expect(vault.get(added!.secretRefs.GITHUB_PERSONAL_ACCESS_TOKEN)).toBe('ghp_realtoken')
    })

    it('rejects entries with blocked commands (rm) and does not persist', () => {
      const result = handlers['mcp:registry-add']({}, {
        entry: { ...validEntry, command: 'rm', args: ['-rf', '/'] },
      }) as { success: boolean; error?: string }

      expect(result.success).toBe(false)
      expect(result.error).toContain('blocked')
      expect(registry.list()).toHaveLength(0)
      expect(syncSpy).not.toHaveBeenCalled()
    })

    it('rejects shell metacharacters in args', () => {
      const result = handlers['mcp:registry-add']({}, {
        entry: { ...validEntry, args: ['pkg; rm -rf /'] },
      }) as { success: boolean; error?: string }

      expect(result.success).toBe(false)
      expect(result.error).toContain('metacharacter')
      expect(registry.list()).toHaveLength(0)
    })

    it('rejects empty command', () => {
      const result = handlers['mcp:registry-add']({}, {
        entry: { ...validEntry, command: '' },
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('returns warning for unknown-but-not-blocked commands', () => {
      const result = handlers['mcp:registry-add']({}, {
        entry: { ...validEntry, command: 'my-custom-binary' },
      }) as { success: boolean; warning?: string }
      expect(result.success).toBe(true)
      expect(result.warning).toBeTruthy()
    })

    it('returns error when entry is missing', () => {
      const result = handlers['mcp:registry-add']({}, {}) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('Missing')
    })
  })

  // ── registry-update ─────────────────────────────────────────────────────────

  describe('mcp:registry-update', () => {
    it('updates an existing entry and triggers sync', () => {
      const added = registry.add({
        name: 'orig', command: 'npx', args: [], env: {}, secretRefs: {},
        scope: 'global', targets: { copilot: true, claude: false },
        enabled: true, source: 'custom',
      })
      syncSpy.mockClear()

      const result = handlers['mcp:registry-update']({}, {
        id: added.id,
        partial: { name: 'renamed' },
      }) as { success: boolean }

      expect(result.success).toBe(true)
      expect(registry.get(added.id)!.name).toBe('renamed')
      expect(syncSpy).toHaveBeenCalled()
    })

    it('rejects updates that introduce a blocked command', () => {
      const added = registry.add({
        name: 'srv', command: 'npx', args: [], env: {}, secretRefs: {},
        scope: 'global', targets: { copilot: true, claude: false },
        enabled: true, source: 'custom',
      })
      const result = handlers['mcp:registry-update']({}, {
        id: added.id,
        partial: { command: 'rm', args: ['-rf'] },
      }) as { success: boolean; error?: string }

      expect(result.success).toBe(false)
      expect(result.error).toContain('blocked')
      expect(registry.get(added.id)!.command).toBe('npx')
    })

    it('returns error for unknown id', () => {
      const result = handlers['mcp:registry-update']({}, {
        id: 'nonexistent', partial: { name: 'x' },
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('persists new secrets to the vault on update', () => {
      const added = registry.add({
        name: 'srv', command: 'npx', args: [], env: {}, secretRefs: {},
        scope: 'global', targets: { copilot: true, claude: false },
        enabled: true, source: 'custom',
      })
      handlers['mcp:registry-update']({}, {
        id: added.id,
        partial: {},
        secrets: { API_KEY: 'new-token-value' },
      })
      const updated = registry.get(added.id)!
      expect(updated.secretRefs.API_KEY).toBeTruthy()
      expect(vault.get(updated.secretRefs.API_KEY)).toBe('new-token-value')
    })
  })

  // ── registry-remove ────────────────────────────────────────────────────────

  describe('mcp:registry-remove', () => {
    it('removes an entry, its secrets, and triggers sync', () => {
      const vaultKey = 'mcp:srv:TOKEN:123'
      vault.set(vaultKey, 'plaintext')
      const added = registry.add({
        name: 'srv', command: 'npx', args: [], env: {},
        secretRefs: { TOKEN: vaultKey },
        scope: 'global', targets: { copilot: true, claude: false },
        enabled: true, source: 'custom',
      })
      syncSpy.mockClear()

      const result = handlers['mcp:registry-remove']({}, { id: added.id }) as {
        success: boolean
      }
      expect(result.success).toBe(true)
      expect(registry.list()).toHaveLength(0)
      expect(vault.get(vaultKey)).toBeNull()
      expect(vault.removeCount).toBe(1)
      expect(syncSpy).toHaveBeenCalled()
    })

    it('returns error for unknown id', () => {
      const result = handlers['mcp:registry-remove']({}, { id: 'ghost' }) as {
        success: boolean; error?: string
      }
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
      expect(syncSpy).not.toHaveBeenCalled()
    })
  })

  // ── registry-toggle ────────────────────────────────────────────────────────

  describe('mcp:registry-toggle', () => {
    it('flips enabled and triggers sync', () => {
      const added = registry.add({
        name: 'srv', command: 'npx', args: [], env: {}, secretRefs: {},
        scope: 'global', targets: { copilot: true, claude: false },
        enabled: true, source: 'custom',
      })
      syncSpy.mockClear()

      const result = handlers['mcp:registry-toggle']({}, {
        id: added.id, enabled: false,
      }) as { success: boolean }
      expect(result.success).toBe(true)
      expect(registry.get(added.id)!.enabled).toBe(false)
      expect(syncSpy).toHaveBeenCalled()
    })

    it('returns error for unknown id', () => {
      const result = handlers['mcp:registry-toggle']({}, { id: 'ghost', enabled: true }) as {
        success: boolean; error?: string
      }
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  // ── catalog-list ───────────────────────────────────────────────────────────

  describe('mcp:catalog-list', () => {
    it('returns the bundled catalog entries', () => {
      const catalog = handlers['mcp:catalog-list']({}) as Array<Record<string, unknown>>
      expect(Array.isArray(catalog)).toBe(true)
      expect(catalog.length).toBeGreaterThan(0)
      // Spot-check a known entry
      const github = catalog.find((c) => c.id === 'github')
      expect(github).toBeDefined()
      expect(github!.command).toBe('npx')
    })
  })

  // ── secrets-get-meta ───────────────────────────────────────────────────────

  describe('mcp:secrets-get-meta', () => {
    it('returns keys and unsafeMode', () => {
      vault.set('k1', 'v1')
      vault.set('k2', 'v2')

      const meta = handlers['mcp:secrets-get-meta']({}) as {
        keys: string[]; unsafeMode: boolean
      }
      expect(meta.keys.sort()).toEqual(['k1', 'k2'])
      expect(meta.unsafeMode).toBe(false)
    })

    it('never exposes plaintext values', () => {
      vault.set('sensitive', 'never-leak-this')
      const meta = handlers['mcp:secrets-get-meta']({}) as { keys: string[] }
      expect(JSON.stringify(meta)).not.toContain('never-leak-this')
    })
  })

  // ── sync-now ───────────────────────────────────────────────────────────────

  describe('mcp:sync-now', () => {
    it('invokes syncAll and reports the result', () => {
      syncSpy.mockClear()
      const result = handlers['mcp:sync-now']({}) as { success: boolean }
      expect(result.success).toBe(true)
      expect(syncSpy).toHaveBeenCalled()
    })
  })

  // ── testMcpServer ──────────────────────────────────────────────────────────

  describe('testMcpServer', () => {
    /**
     * Minimal fake ChildProcess — just enough surface to satisfy
     * `testMcpServer`: stdout/stderr emitters, writable stdin, kill, exit/error
     * event hookup. Tests toggle its behavior via control methods.
     */
    function makeFakeChild() {
      const stdoutListeners: Array<(buf: Buffer) => void> = []
      const stderrListeners: Array<(buf: Buffer) => void> = []
      const exitListeners: Array<(code: number | null) => void> = []
      const errorListeners: Array<(err: Error) => void> = []
      const child = {
        killed: false,
        exitCode: null as number | null,
        stdout: {
          on: (evt: string, cb: (buf: Buffer) => void) => {
            if (evt === 'data') stdoutListeners.push(cb)
          },
        },
        stderr: {
          on: (evt: string, cb: (buf: Buffer) => void) => {
            if (evt === 'data') stderrListeners.push(cb)
          },
        },
        stdin: {
          write: vi.fn(),
        },
        on: (evt: string, cb: (...a: unknown[]) => void) => {
          if (evt === 'exit') exitListeners.push(cb as (code: number | null) => void)
          if (evt === 'error') errorListeners.push(cb as (err: Error) => void)
        },
        kill: vi.fn(function (this: { killed: boolean }) {
          (this as { killed: boolean }).killed = true
          return true
        }),
        // Test helpers (not part of ChildProcess interface)
        _emitStdout: (line: string) => {
          for (const l of stdoutListeners) l(Buffer.from(line))
        },
        _emitStderr: (line: string) => {
          for (const l of stderrListeners) l(Buffer.from(line))
        },
        _emitExit: (code: number | null) => {
          for (const l of exitListeners) l(code)
        },
      }
      return child
    }

    it('returns success when the server sends a valid initialize response', async () => {
      const added = registry.add({
        name: 'srv', command: 'npx', args: ['-y', '@test/mcp'], env: {}, secretRefs: {},
        scope: 'global', targets: { copilot: true, claude: false },
        enabled: true, source: 'custom',
      })
      const fake = makeFakeChild()
      spawnState.spawn = () => fake
      const promise = testMcpServer(added.id, registry, vault as never)
      // Emit a valid JSON-RPC response on stdout
      setTimeout(() => {
        fake._emitStdout(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n')
      }, 5)
      const result = await promise
      expect(result.success).toBe(true)
      expect(fake.stdin.write).toHaveBeenCalled()
      expect(fake.kill).toHaveBeenCalled()
      spawnState.spawn = null
    })

    it('returns failure with stderrSnippet when the server exits without responding', async () => {
      const added = registry.add({
        name: 'srv', command: 'npx', args: [], env: {}, secretRefs: {},
        scope: 'global', targets: { copilot: true, claude: false },
        enabled: true, source: 'custom',
      })
      const fake = makeFakeChild()
      spawnState.spawn = () => fake
      const promise = testMcpServer(added.id, registry, vault as never)
      setTimeout(() => {
        fake._emitStderr('boom: bad config\n')
        fake._emitExit(1)
      }, 5)
      const result = await promise
      expect(result.success).toBe(false)
      expect(result.stderrSnippet).toContain('boom: bad config')
      expect(fake.kill).toHaveBeenCalled()
      spawnState.spawn = null
    })

    it('times out after ~5 seconds when no response arrives', async () => {
      vi.useFakeTimers()
      try {
        const added = registry.add({
          name: 'srv', command: 'npx', args: [], env: {}, secretRefs: {},
          scope: 'global', targets: { copilot: true, claude: false },
          enabled: true, source: 'custom',
        })
        const fake = makeFakeChild()
        spawnState.spawn = () => fake
        const promise = testMcpServer(added.id, registry, vault as never)
        // Advance past the 5s timeout
        await vi.advanceTimersByTimeAsync(5100)
        const result = await promise
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/5s|No valid/i)
        expect(fake.kill).toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
        spawnState.spawn = null
      }
    })

    it('rejects entries with blocked commands before spawning', async () => {
      // Inject a malformed entry directly into the registry, bypassing the add handler.
      // We need to get around validation; use the store-data mock directly.
      const entry = {
        id: 'evil-id', name: 'evil', command: 'rm', args: ['-rf'],
        env: {}, secretRefs: {}, scope: 'global',
        targets: { copilot: true, claude: false }, enabled: true, source: 'custom',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }
      storeData['entries'] = [entry]
      spawnState.spawn = () => {
        throw new Error('spawn should NOT be called for a blocked command')
      }
      const result = await testMcpServer('evil-id', registry, vault as never)
      expect(result.success).toBe(false)
      expect(result.error).toContain('blocked')
      spawnState.spawn = null
    })

    it('returns an error when id is missing', async () => {
      const result = await testMcpServer(undefined, registry, vault as never)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Missing')
    })

    it('returns an error when id is not in the registry', async () => {
      const result = await testMcpServer('ghost', registry, vault as never)
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })
})
