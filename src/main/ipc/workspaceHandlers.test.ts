/**
 * Unit tests for workspaceHandlers.ts — workspace management, repo info,
 * activity feed, clone, and broadcast prompts.
 */

// ── Shared store data via globalThis ─────────────────────────────────────────

const STORE_KEY = '__workspaceHandlersTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockExecFile, mockAssertPath, mockGetWsRoots, mockIsSensitive, mockCheckRateLimit, mockGetScopedSpawnEnv } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockAssertPath: vi.fn().mockImplementation((p: string) => p),
  mockGetWsRoots: vi.fn().mockReturnValue(['/home/user']),
  mockIsSensitive: vi.fn().mockReturnValue(false),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  mockGetScopedSpawnEnv: vi.fn().mockReturnValue({}),
}))

// ── vi.mock declarations ────────────────────────────────────────────────────

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__workspaceHandlersTestStoreData'] as Record<string, unknown>
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

vi.mock('../utils/pathSecurity', () => ({
  assertPathWithinRoots: (...args: unknown[]) => mockAssertPath(...args),
  getWorkspaceAllowedRoots: () => mockGetWsRoots(),
  isSensitiveSystemPath: (...args: unknown[]) => mockIsSensitive(...args),
}))

vi.mock('../utils/shellEnv', () => ({
  getScopedSpawnEnv: (...args: unknown[]) => mockGetScopedSpawnEnv(...args),
}))

vi.mock('../utils/rateLimiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}))

vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs')>()
  return {
    ...orig,
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    mkdirSync: vi.fn(),
  }
})

// ── Imports & helpers ───────────────────────────────────────────────────────

import { existsSync } from 'fs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeData = (globalThis as any)[STORE_KEY] as Record<string, unknown>

function resetStore(): void {
  for (const key of Object.keys(storeData)) delete storeData[key]
  storeData.workspaces = []
  storeData.activeWorkspaceId = null
}

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(mockIpcMain: { handle: ReturnType<typeof vi.fn> }): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of mockIpcMain.handle.mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

function makeWorkspace(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'ws-1',
    name: 'Test Workspace',
    description: 'A test workspace',
    repoPaths: [],
    createdAt: 1000,
    ...overrides,
  }
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('workspaceHandlers', () => {
  let handlers: HandlerMap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let electronMod: any

  beforeAll(async () => {
    vi.resetModules()
    electronMod = await import('electron')
    const mod = await import('./workspaceHandlers')
    mod.registerWorkspaceHandlers(electronMod.ipcMain)
    handlers = extractHandlers(electronMod.ipcMain)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mockAssertPath.mockImplementation((p: string) => p)
    mockIsSensitive.mockReturnValue(false)
    mockCheckRateLimit.mockReturnValue({ allowed: true })
  })

  // ── Handler registration ──────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC channels', () => {
      const expected = [
        'workspace:list', 'workspace:get-active', 'workspace:create',
        'workspace:set-active', 'workspace:add-repo', 'workspace:remove-repo',
        'workspace:delete', 'workspace:get-repo-info', 'workspace:activity-feed',
        'workspace:clone-repo', 'workspace:update',
      ]
      for (const ch of expected) {
        expect(handlers[ch]).toBeDefined()
      }
    })
  })

  // ── workspace:list ────────────────────────────────────────────────────

  describe('workspace:list', () => {
    it('returns empty array when no workspaces exist', async () => {
      const result = await handlers['workspace:list']()
      expect(result).toEqual([])
    })

    it('returns all workspaces', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'a' }), makeWorkspace({ id: 'b' })]
      const result = await handlers['workspace:list']() as unknown[]
      expect(result).toHaveLength(2)
    })
  })

  // ── workspace:get-active ──────────────────────────────────────────────

  describe('workspace:get-active', () => {
    it('returns null when no active workspace', async () => {
      const result = await handlers['workspace:get-active']()
      expect(result).toBeNull()
    })

    it('returns active workspace id', async () => {
      storeData.activeWorkspaceId = 'ws-1'
      const result = await handlers['workspace:get-active']()
      expect(result).toBe('ws-1')
    })
  })

  // ── workspace:create ──────────────────────────────────────────────────

  describe('workspace:create', () => {
    it('creates a workspace with name and description', async () => {
      const result = await handlers['workspace:create'](
        {}, { name: 'My Project', description: 'Work stuff' },
      ) as Record<string, unknown>

      expect(result.name).toBe('My Project')
      expect(result.description).toBe('Work stuff')
      expect(result.id).toBeDefined()
      expect(result.repoPaths).toEqual([])
      expect(storeData.workspaces).toHaveLength(1)
    })

    it('defaults description to empty string', async () => {
      const result = await handlers['workspace:create'](
        {}, { name: 'Minimal' },
      ) as Record<string, unknown>
      expect(result.description).toBe('')
    })
  })

  // ── workspace:set-active ──────────────────────────────────────────────

  describe('workspace:set-active', () => {
    it('sets active workspace id', async () => {
      const result = await handlers['workspace:set-active'](
        {}, { id: 'ws-abc' },
      ) as Record<string, unknown>
      expect(result.success).toBe(true)
      expect(storeData.activeWorkspaceId).toBe('ws-abc')
    })

    it('sets active workspace to null', async () => {
      storeData.activeWorkspaceId = 'ws-abc'
      await handlers['workspace:set-active']({}, { id: null })
      expect(storeData.activeWorkspaceId).toBeNull()
    })
  })

  // ── workspace:add-repo ────────────────────────────────────────────────

  describe('workspace:add-repo', () => {
    it('returns canceled when dialog is canceled', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1' })]
      electronMod.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
      const result = await handlers['workspace:add-repo'](
        {}, { workspaceId: 'ws-1' },
      ) as Record<string, unknown>
      expect(result.canceled).toBe(true)
    })

    it('adds a repo path to a workspace', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1', repoPaths: [] })]
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/home/user/project'],
      })
      const result = await handlers['workspace:add-repo'](
        {}, { workspaceId: 'ws-1' },
      ) as Record<string, unknown>
      expect(result.path).toBe('/home/user/project')
      const ws = (storeData.workspaces as Array<Record<string, unknown>>)[0]
      expect(ws.repoPaths).toContain('/home/user/project')
    })

    it('does not add duplicate repo paths', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1', repoPaths: ['/existing'] })]
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/existing'],
      })
      await handlers['workspace:add-repo']({}, { workspaceId: 'ws-1' })
      const ws = (storeData.workspaces as Array<Record<string, unknown>>)[0]
      expect((ws.repoPaths as string[]).filter((p) => p === '/existing')).toHaveLength(1)
    })

    it('returns error for non-existent workspace', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path'],
      })
      const result = await handlers['workspace:add-repo'](
        {}, { workspaceId: 'nonexistent' },
      ) as Record<string, unknown>
      expect(result.error).toBe('Workspace not found')
    })
  })

  // ── workspace:remove-repo ─────────────────────────────────────────────

  describe('workspace:remove-repo', () => {
    it('removes a repo path from a workspace', async () => {
      storeData.workspaces = [makeWorkspace({
        id: 'ws-1', repoPaths: ['/a', '/b'],
      })]
      const result = await handlers['workspace:remove-repo'](
        {}, { workspaceId: 'ws-1', path: '/a' },
      ) as Record<string, unknown>
      expect(result.success).toBe(true)
      const ws = (storeData.workspaces as Array<Record<string, unknown>>)[0]
      expect(ws.repoPaths).toEqual(['/b'])
    })

    it('succeeds even for non-existent workspace (no-op)', async () => {
      const result = await handlers['workspace:remove-repo'](
        {}, { workspaceId: 'missing', path: '/a' },
      ) as Record<string, unknown>
      expect(result.success).toBe(true)
    })
  })

  // ── workspace:delete ──────────────────────────────────────────────────

  describe('workspace:delete', () => {
    it('deletes a workspace', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1' }), makeWorkspace({ id: 'ws-2' })]
      const result = await handlers['workspace:delete'](
        {}, { id: 'ws-1' },
      ) as Record<string, unknown>
      expect(result.success).toBe(true)
      expect(storeData.workspaces).toHaveLength(1)
    })

    it('clears active workspace if deleted workspace was active', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1' })]
      storeData.activeWorkspaceId = 'ws-1'
      await handlers['workspace:delete']({}, { id: 'ws-1' })
      expect(storeData.activeWorkspaceId).toBeNull()
    })

    it('does not clear active workspace if different workspace deleted', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1' }), makeWorkspace({ id: 'ws-2' })]
      storeData.activeWorkspaceId = 'ws-2'
      await handlers['workspace:delete']({}, { id: 'ws-1' })
      expect(storeData.activeWorkspaceId).toBe('ws-2')
    })
  })

  // ── workspace:get-repo-info ───────────────────────────────────────────

  describe('workspace:get-repo-info', () => {
    it('returns repo info for valid git repos', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
          if (args.includes('rev-parse')) cb(null, { stdout: 'main\n', stderr: '' })
          else if (args.includes('log')) cb(null, { stdout: 'Fix bug|||Alice\n', stderr: '' })
          else if (args.includes('status')) cb(null, { stdout: 'M file.ts\n', stderr: '' })
          else cb(null, { stdout: '', stderr: '' })
        },
      )

      const result = await handlers['workspace:get-repo-info'](
        {}, { paths: ['/home/user/project'] },
      ) as Array<Record<string, unknown>>

      expect(result).toHaveLength(1)
      expect(result[0].branch).toBe('main')
      expect(result[0].lastCommit).toBe('Fix bug')
      expect(result[0].lastAuthor).toBe('Alice')
      expect(result[0].uncommittedCount).toBe(1)
    })

    it('returns null entries for non-existent paths', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await handlers['workspace:get-repo-info'](
        {}, { paths: ['/nonexistent'] },
      ) as unknown[]

      // null entries are filtered out
      expect(result).toHaveLength(0)
    })
  })

  // ── workspace:activity-feed ───────────────────────────────────────────

  describe('workspace:activity-feed', () => {
    it('returns sorted git log entries across repos', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(null, {
            stdout: 'abc|||Fix|||Alice|||2025-01-02T00:00:00Z\ndef|||Add|||Bob|||2025-01-01T00:00:00Z\n',
            stderr: '',
          })
        },
      )

      const result = await handlers['workspace:activity-feed'](
        {}, { paths: ['/project'], limit: 10 },
      ) as Array<Record<string, unknown>>

      expect(result).toHaveLength(2)
      // Should be sorted by date descending
      expect(result[0].hash).toBe('abc')
    })

    it('returns empty array on git error', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(new Error('not a git repo'))
        },
      )

      const result = await handlers['workspace:activity-feed'](
        {}, { paths: ['/not-a-repo'] },
      ) as unknown[]
      expect(result).toEqual([])
    })
  })

  // ── workspace:clone-repo ──────────────────────────────────────────────

  describe('workspace:clone-repo', () => {
    it('rejects when rate limited', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 5000 })

      const result = await handlers['workspace:clone-repo'](
        {}, { workspaceId: 'ws-1', url: 'https://github.com/org/repo.git' },
      ) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('Rate limited')
    })

    it('returns error for non-existent workspace', async () => {
      const result = await handlers['workspace:clone-repo'](
        {}, { workspaceId: 'missing', url: 'https://github.com/org/repo.git' },
      ) as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toContain('Workspace not found')
    })

    it('rejects cloning into sensitive system directory', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1' })]
      mockIsSensitive.mockReturnValue(true)

      const result = await handlers['workspace:clone-repo'](
        {}, { workspaceId: 'ws-1', url: 'https://github.com/org/repo.git', targetDir: '/home/user/.ssh' },
      ) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('sensitive system directory')
    })

    it('rejects targetDir outside allowed roots', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1' })]
      mockAssertPath.mockImplementation(() => {
        throw new Error('Path not allowed')
      })

      const result = await handlers['workspace:clone-repo'](
        {}, { workspaceId: 'ws-1', url: 'https://github.com/org/repo.git', targetDir: '/etc/repos' },
      ) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('Path not allowed')
    })

    it('returns already-existed when directory exists with same remote', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1' })]
      vi.mocked(existsSync).mockReturnValue(true)
      mockExecFile.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
          if (args.includes('get-url')) {
            cb(null, { stdout: 'https://github.com/org/repo.git\n', stderr: '' })
          } else {
            cb(null, { stdout: '', stderr: '' })
          }
        },
      )

      const result = await handlers['workspace:clone-repo'](
        {}, { workspaceId: 'ws-1', url: 'https://github.com/org/repo.git', targetDir: '/home/user/repo' },
      ) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(result.alreadyExisted).toBe(true)
    })

    it('clones successfully into default directory', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1', name: 'My Workspace' })]
      vi.mocked(existsSync).mockReturnValue(false)
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(null, { stdout: '', stderr: '' })
        },
      )

      const result = await handlers['workspace:clone-repo'](
        {}, { workspaceId: 'ws-1', url: 'https://github.com/org/myrepo.git' },
      ) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(result.path).toBeDefined()
    })

    it('returns error on clone failure', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1', name: 'Test' })]
      vi.mocked(existsSync).mockReturnValue(false)
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          cb(new Error('clone failed: permission denied'))
        },
      )

      const result = await handlers['workspace:clone-repo'](
        {}, { workspaceId: 'ws-1', url: 'https://github.com/org/repo.git' },
      ) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('clone failed')
    })
  })

  // ── workspace:update ──────────────────────────────────────────────────

  describe('workspace:update', () => {
    it('updates workspace name and description', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1' })]
      const result = await handlers['workspace:update'](
        {}, { id: 'ws-1', name: 'Updated', description: 'New desc' },
      ) as Record<string, unknown>

      expect(result.success).toBe(true)
      const ws = (storeData.workspaces as Array<Record<string, unknown>>)[0]
      expect(ws.name).toBe('Updated')
      expect(ws.description).toBe('New desc')
    })

    it('returns error for non-existent workspace', async () => {
      const result = await handlers['workspace:update'](
        {}, { id: 'missing', name: 'x' },
      ) as Record<string, unknown>
      expect(result.error).toBe('Workspace not found')
    })

    it('updates only provided fields', async () => {
      storeData.workspaces = [makeWorkspace({ id: 'ws-1', name: 'Original', description: 'Keep this' })]
      await handlers['workspace:update']({}, { id: 'ws-1', name: 'Changed' })

      const ws = (storeData.workspaces as Array<Record<string, unknown>>)[0]
      expect(ws.name).toBe('Changed')
      expect(ws.description).toBe('Keep this')
    })
  })
})
