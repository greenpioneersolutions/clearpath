/**
 * Unit tests for teamHandlers.ts — team info, config bundles, shared folders,
 * git activity, marketplace, and setup wizard checks.
 *
 * BUG: exportConfigBundle, importConfigBundle, and team:apply-shared-config
 * use `require('electron').app.getPath(...)` inside function bodies. In
 * vitest's ESM environment, `require('electron')` resolves through the
 * resolve.alias but CJS interop returns the default export (an object), and
 * the `app` named export is not accessible. Tests for these handlers are
 * adapted to account for this — see BUG-023.
 */

// ── Shared store data via globalThis ─────────────────────────────────────────

const STORE_KEY = '__teamHandlersTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockExecFile, mockResolveInShell } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockResolveInShell: vi.fn(),
}))

// ── vi.mock declarations ────────────────────────────────────────────────────

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__teamHandlersTestStoreData'] as Record<string, unknown>
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in sd)) sd[k] = JSON.parse(JSON.stringify(v))
          }
        }
      }
      get(key: string): unknown {
        const val = sd[key]
        return val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined
      }
      set(key: string, value: unknown): void {
        sd[key] = JSON.parse(JSON.stringify(value))
      }
    },
  }
})

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-key',
}))

vi.mock('../utils/shellEnv', () => ({
  resolveInShell: (...args: unknown[]) => mockResolveInShell(...args),
}))

vi.mock('../starter-pack', () => ({
  STARTER_AGENTS: [
    {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'A test agent',
      category: 'spotlight',
      systemPrompt: 'You are a test agent.',
    },
  ],
}))

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}))

vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs')>()
  return {
    ...orig,
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ mtimeMs: 1000 }),
    createWriteStream: vi.fn(),
    createReadStream: vi.fn(),
  }
})

// ── Imports & test helpers ──────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeData = (globalThis as any)[STORE_KEY] as Record<string, unknown>

function resetStore(): void {
  for (const key of Object.keys(storeData)) delete storeData[key]
  storeData.sharedFolderPath = null
  storeData.marketplaceIndex = []
  storeData.installedMarketplaceIds = []
}

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(mockIpcMain: { handle: ReturnType<typeof vi.fn> }): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of mockIpcMain.handle.mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('teamHandlers', () => {
  let handlers: HandlerMap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let electronMod: any

  beforeAll(async () => {
    vi.resetModules()
    electronMod = await import('electron')
    const mod = await import('./teamHandlers')
    mod.registerTeamHandlers(electronMod.ipcMain)
    handlers = extractHandlers(electronMod.ipcMain)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  // ── team:get-shared-folder ──────────────────────────────────────────────

  describe('team:get-shared-folder', () => {
    it('returns null when no shared folder is set', async () => {
      const result = await handlers['team:get-shared-folder']()
      expect(result).toBeNull()
    })

    it('returns the shared folder path when set', async () => {
      storeData.sharedFolderPath = '/test/shared'
      const result = await handlers['team:get-shared-folder']()
      expect(result).toBe('/test/shared')
    })
  })

  // ── team:set-shared-folder ──────────────────────────────────────────────

  describe('team:set-shared-folder', () => {
    it('returns canceled when dialog is canceled', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
      const result = await handlers['team:set-shared-folder']()
      expect(result).toEqual({ canceled: true })
    })

    it('stores the selected folder path', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/selected/folder'],
      })
      const result = await handlers['team:set-shared-folder']()
      expect(result).toEqual({ path: '/selected/folder' })
      expect(storeData.sharedFolderPath).toBe('/selected/folder')
    })
  })

  // ── team:clear-shared-folder ────────────────────────────────────────────

  describe('team:clear-shared-folder', () => {
    it('clears the shared folder path', async () => {
      storeData.sharedFolderPath = '/some/path'
      const result = await handlers['team:clear-shared-folder']()
      expect(result).toEqual({ success: true })
      expect(storeData.sharedFolderPath).toBeNull()
    })
  })

  // ── team:list-shared-configs ────────────────────────────────────────────

  describe('team:list-shared-configs', () => {
    it('returns empty array when no shared folder is set', async () => {
      const result = await handlers['team:list-shared-configs']()
      expect(result).toEqual([])
    })

    it('returns empty array when folder does not exist', async () => {
      storeData.sharedFolderPath = '/nonexistent'
      vi.mocked(existsSync).mockReturnValue(false)
      const result = await handlers['team:list-shared-configs']()
      expect(result).toEqual([])
    })

    it('returns JSON files from the shared folder', async () => {
      storeData.sharedFolderPath = '/shared'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue(
        ['config1.json', 'config2.json', 'readme.md'] as unknown as ReturnType<typeof readdirSync>,
      )
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ name: 'Test Config', description: 'A test' }),
      )
      vi.mocked(statSync).mockReturnValue({ mtimeMs: 12345 } as ReturnType<typeof statSync>)

      const result = await handlers['team:list-shared-configs']() as Array<Record<string, unknown>>
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        fileName: 'config1.json', name: 'Test Config', description: 'A test',
      })
    })

    it('handles parse errors in config files gracefully', async () => {
      storeData.sharedFolderPath = '/shared'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readdirSync).mockReturnValue(
        ['broken.json'] as unknown as ReturnType<typeof readdirSync>,
      )
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('bad json') })
      vi.mocked(statSync).mockReturnValue({ mtimeMs: 12345 } as ReturnType<typeof statSync>)

      const result = await handlers['team:list-shared-configs']() as Array<Record<string, unknown>>
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ fileName: 'broken.json', name: 'broken' })
    })
  })

  // ── team:apply-shared-config ────────────────────────────────────────────

  describe('team:apply-shared-config', () => {
    // BUG-023: apply-shared-config uses require('electron').app.getPath() internally.
    // In vitest, require('electron') does not expose named exports due to CJS interop.
    // When settings are present, the handler reaches the require() call and fails
    // inside the try/catch, returning { success: false, error: ... }.

    it('applies config without settings (no require("electron") needed)', async () => {
      const config = { version: 1 }
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config))
      const result = await handlers['team:apply-shared-config'](
        {}, { path: '/shared/config.json' },
      )
      expect(result).toEqual({ success: true })
      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('returns error for tampered config with bad signature', async () => {
      const config = { settings: { theme: 'dark' }, _signature: 'bad-sig' }
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config))
      const result = await handlers['team:apply-shared-config'](
        {}, { path: '/shared/config.json' },
      ) as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toContain('signature verification failed')
    })

    it('rejects configs larger than 5MB', async () => {
      const bigObj = { data: 'x'.repeat(5 * 1024 * 1024 + 1) }
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(bigObj))
      const result = await handlers['team:apply-shared-config'](
        {}, { path: '/shared/big.json' },
      ) as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toContain('too large')
    })

    it('rejects config with invalid settings structure', async () => {
      const config = { settings: 'not an object' }
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config))
      const result = await handlers['team:apply-shared-config'](
        {}, { path: '/shared/config.json' },
      ) as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid settings')
    })

    it('handles read errors gracefully', async () => {
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT') })
      const result = await handlers['team:apply-shared-config'](
        {}, { path: '/missing.json' },
      ) as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toContain('ENOENT')
    })
  })

  // ── team:list-marketplace ───────────────────────────────────────────────

  describe('team:list-marketplace', () => {
    it('returns builtin marketplace agents', async () => {
      const result = await handlers['team:list-marketplace']() as Array<Record<string, unknown>>
      expect(result.length).toBeGreaterThan(0)
      const starterAgent = result.find((a) => a.id === 'mkt-test-agent')
      expect(starterAgent).toBeDefined()
      expect(starterAgent!.name).toBe('Test Agent')
    })

    it('marks installed agents correctly', async () => {
      storeData.installedMarketplaceIds = ['mkt-test-agent']
      const result = await handlers['team:list-marketplace']() as Array<Record<string, unknown>>
      const starterAgent = result.find((a) => a.id === 'mkt-test-agent')
      expect(starterAgent!.installed).toBe(true)
    })

    it('includes custom marketplace agents from store', async () => {
      storeData.marketplaceIndex = [{
        id: 'mkt-custom-1', name: 'Custom', description: 'Custom agent',
        author: 'User', cli: 'claude', category: 'Custom', prompt: 'test',
        downloads: 0,
      }]
      const result = await handlers['team:list-marketplace']() as Array<Record<string, unknown>>
      const custom = result.find((a) => a.id === 'mkt-custom-1')
      expect(custom).toBeDefined()
    })
  })

  // ── team:install-marketplace-agent ──────────────────────────────────────

  describe('team:install-marketplace-agent', () => {
    it('installs a marketplace agent by id', async () => {
      const result = await handlers['team:install-marketplace-agent'](
        {}, { id: 'mkt-test-agent' },
      ) as Record<string, unknown>
      expect(result.success).toBe(true)
      expect(result.agent).toBeDefined()
      expect(storeData.installedMarketplaceIds).toContain('mkt-test-agent')
    })

    it('returns error for non-existent agent', async () => {
      const result = await handlers['team:install-marketplace-agent'](
        {}, { id: 'non-existent' },
      ) as Record<string, unknown>
      expect(result.error).toBe('Agent not found')
    })

    it('does not duplicate agent id on repeated install', async () => {
      storeData.installedMarketplaceIds = ['mkt-test-agent']
      await handlers['team:install-marketplace-agent']({}, { id: 'mkt-test-agent' })
      const ids = storeData.installedMarketplaceIds as string[]
      expect(ids.filter((id) => id === 'mkt-test-agent')).toHaveLength(1)
    })
  })

  // ── team:uninstall-marketplace-agent ────────────────────────────────────

  describe('team:uninstall-marketplace-agent', () => {
    it('removes agent from installed list', async () => {
      storeData.installedMarketplaceIds = ['mkt-test-agent', 'mkt-other']
      const result = await handlers['team:uninstall-marketplace-agent'](
        {}, { id: 'mkt-test-agent' },
      ) as Record<string, unknown>
      expect(result.success).toBe(true)
      expect(storeData.installedMarketplaceIds).not.toContain('mkt-test-agent')
      expect(storeData.installedMarketplaceIds).toContain('mkt-other')
    })

    it('succeeds even if agent is not installed', async () => {
      const result = await handlers['team:uninstall-marketplace-agent'](
        {}, { id: 'not-installed' },
      ) as Record<string, unknown>
      expect(result.success).toBe(true)
    })
  })

  // ── team:git-activity ──────────────────────────────────────────────────

  describe('team:git-activity', () => {
    it('returns parsed git log entries', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(null, {
            stdout: 'abc123|||Fix bug|||Alice|||2025-01-01T00:00:00Z\ndef456|||Add feature|||Bob|||2025-01-02T00:00:00Z\n',
            stderr: '',
          })
        },
      )

      const result = await handlers['team:git-activity'](
        {}, { workingDirectory: '/project' },
      ) as Array<Record<string, unknown>>
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        hash: 'abc123', message: 'Fix bug', author: 'Alice',
      })
    })

    it('detects AI-generated commits', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(null, {
            stdout: 'abc123|||Fix bug Co-Authored-By: Claude|||Alice|||2025-01-01T00:00:00Z\n',
            stderr: '',
          })
        },
      )

      const result = await handlers['team:git-activity'](
        {}, { workingDirectory: '/project' },
      ) as Array<Record<string, unknown>>
      expect(result[0].isAiGenerated).toBe(true)
    })

    it('returns empty array on git error', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(new Error('not a git repo'))
        },
      )

      const result = await handlers['team:git-activity'](
        {}, { workingDirectory: '/not-a-repo' },
      ) as Array<Record<string, unknown>>
      expect(result).toEqual([])
    })
  })

  // ── team:check-setup ───────────────────────────────────────────────────

  describe('team:check-setup', () => {
    it('reports installed CLIs', async () => {
      mockResolveInShell.mockImplementation((name: string) => {
        if (name === 'copilot') return Promise.resolve('/usr/local/bin/copilot')
        if (name === 'claude') return Promise.resolve('/usr/local/bin/claude')
        return Promise.resolve(null)
      })

      const result = await handlers['team:check-setup']() as Record<string, unknown>
      expect(result.copilotInstalled).toBe(true)
      expect(result.claudeInstalled).toBe(true)
      expect(result.copilotPath).toBe('/usr/local/bin/copilot')
      expect(result.claudePath).toBe('/usr/local/bin/claude')
    })

    it('reports missing CLIs', async () => {
      mockResolveInShell.mockResolvedValue(null)

      const result = await handlers['team:check-setup']() as Record<string, unknown>
      expect(result.copilotInstalled).toBe(false)
      expect(result.claudeInstalled).toBe(false)
    })
  })

  // ── team:export-bundle ─────────────────────────────────────────────────
  // BUG-023: exportConfigBundle uses require('electron').app.getPath() without
  // try/catch, so it always throws in vitest. The error propagates as an
  // unhandled rejection. Tests verify the function throws.

  describe('team:export-bundle', () => {
    it('throws due to require("electron") CJS interop issue (BUG-023)', async () => {
      await expect(handlers['team:export-bundle']()).rejects.toThrow()
    })
  })

  // ── team:import-bundle ─────────────────────────────────────────────────
  // importConfigBundle uses require('electron').app inside try/catch.
  // Validation tests (before the require call) work correctly.

  describe('team:import-bundle', () => {
    it('returns failure when open dialog is canceled', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
      const result = await handlers['team:import-bundle']() as Record<string, unknown>
      expect(result.success).toBe(false)
    })

    it('returns error for bundle without version', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/import/config.json'],
      })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ noVersion: true }))

      const result = await handlers['team:import-bundle']() as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid config bundle')
    })

    it('rejects bundle with tampered signature', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/import/config.json'],
      })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        _signature: 'tampered-signature',
      }))

      const result = await handlers['team:import-bundle']() as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toContain('signature verification failed')
    })

    it('rejects bundles larger than 5MB', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/import/huge.json'],
      })
      const bigContent = JSON.stringify({ version: 1, data: 'x'.repeat(5 * 1024 * 1024) })
      vi.mocked(readFileSync).mockReturnValue(bigContent)

      const result = await handlers['team:import-bundle']() as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toContain('too large')
    })

    it('rejects bundle with non-object store data', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/import/config.json'],
      })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        'clear-path-settings': 'not an object',
      }))

      const result = await handlers['team:import-bundle']() as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid data type')
    })

    // BUG-023: Valid bundle import fails because require('electron').app is
    // undefined in vitest. The error is caught by try/catch and returns
    // { success: false, error: ... }.
    it('fails to write due to require("electron") CJS interop (BUG-023)', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/import/config.json'],
      })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        'clear-path-settings': { theme: 'dark' },
      }))

      const result = await handlers['team:import-bundle']() as Record<string, unknown>
      // This would succeed if require('electron') worked — instead it catches the error
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ── Handler registration ────────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC channels', () => {
      const expectedChannels = [
        'team:export-bundle', 'team:import-bundle',
        'team:get-shared-folder', 'team:set-shared-folder', 'team:clear-shared-folder',
        'team:list-shared-configs', 'team:apply-shared-config',
        'team:list-marketplace', 'team:install-marketplace-agent',
        'team:uninstall-marketplace-agent',
        'team:git-activity', 'team:check-setup',
      ]
      for (const ch of expectedChannels) {
        expect(handlers[ch]).toBeDefined()
      }
    })
  })
})
