import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  existsSyncMock, readdirSyncMock, statSyncMock,
  readFileSyncMock, writeFileSyncMock, mkdirSyncMock,
  assertPathMock, getAllowedRootsMock, isSensitiveMock,
  checkRateLimitMock,
  showSaveDialogMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn().mockReturnValue(false),
  readdirSyncMock: vi.fn().mockReturnValue([]),
  statSyncMock: vi.fn().mockReturnValue({ mtimeMs: 1000 }),
  readFileSyncMock: vi.fn().mockReturnValue(''),
  writeFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  assertPathMock: vi.fn(),
  getAllowedRootsMock: vi.fn().mockReturnValue(['/workspace']),
  isSensitiveMock: vi.fn().mockReturnValue(false),
  checkRateLimitMock: vi.fn().mockReturnValue({ allowed: true }),
  showSaveDialogMock: vi.fn().mockResolvedValue({ canceled: true }),
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readdirSync: readdirSyncMock,
  statSync: statSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
  mkdirSync: mkdirSyncMock,
}))

vi.mock('electron', async (importOriginal) => {
  const orig = await importOriginal() as Record<string, unknown>
  return {
    ...orig,
    dialog: {
      showSaveDialog: showSaveDialogMock,
    },
  }
})

vi.mock('../utils/pathSecurity', () => ({
  assertPathWithinRoots: assertPathMock,
  getWorkspaceAllowedRoots: getAllowedRootsMock,
  isSensitiveSystemPath: isSensitiveMock,
}))

vi.mock('../utils/rateLimiter', () => ({
  checkRateLimit: checkRateLimitMock,
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => unknown
const mockEvent = {} as Electron.IpcMainInvokeEvent

// Mock CLIManager
const mockCLIManager = {
  spawnSubAgent: vi.fn().mockResolvedValue({ id: 'agent-1' }),
  listSubAgents: vi.fn().mockReturnValue([]),
  getSubAgentOutput: vi.fn().mockReturnValue([]),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

// ── Tests ───────────────────────────────────────────────────────────────────

describe('knowledgeBaseHandlers', () => {
  let getHandler: (channel: string) => HandlerFn

  beforeEach(async () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(false)
    readdirSyncMock.mockReturnValue([])
    checkRateLimitMock.mockReturnValue({ allowed: true })
    assertPathMock.mockImplementation(() => undefined)
    isSensitiveMock.mockReturnValue(false)

    // Reset modules to ensure vi.mock factories are applied
    // (setup-coverage.ts pre-loads modules defeating standard vi.mock)
    vi.resetModules()
    const { ipcMain } = await import('electron')
    const mod = await import('./knowledgeBaseHandlers')
    mod.registerKnowledgeBaseHandlers(ipcMain, mockCLIManager)

    getHandler = (channel: string): HandlerFn => {
      const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === channel,
      )
      if (calls.length === 0) throw new Error(`No handler registered for channel: ${channel}`)
      return calls[calls.length - 1][1] as HandlerFn
    }
  })

  it('registers all expected channels', () => {
    // Verify each expected channel has a handler registered
    expect(() => getHandler('kb:list-files')).not.toThrow()
    expect(() => getHandler('kb:read-file')).not.toThrow()
    expect(() => getHandler('kb:search')).not.toThrow()
    expect(() => getHandler('kb:get-sections')).not.toThrow()
    expect(() => getHandler('kb:generate')).not.toThrow()
    expect(() => getHandler('kb:update')).not.toThrow()
    expect(() => getHandler('kb:ask')).not.toThrow()
    expect(() => getHandler('kb:export-merged')).not.toThrow()
    expect(() => getHandler('kb:export-file')).not.toThrow()
  })

  describe('kb:list-files', () => {
    it('returns empty array when KB directory does not exist', () => {
      existsSyncMock.mockReturnValue(false)
      const handler = getHandler('kb:list-files')
      const result = handler(mockEvent, { cwd: '/workspace' })
      expect(result).toEqual([])
    })

    it('returns markdown files from KB directory', () => {
      existsSyncMock.mockReturnValue(true)
      readdirSyncMock.mockReturnValue(['01-overview.md', '02-architecture.md', 'readme.txt'])
      readFileSyncMock.mockReturnValue('# Overview content')
      statSyncMock.mockReturnValue({ mtimeMs: 1000 })

      const handler = getHandler('kb:list-files')
      const result = handler(mockEvent, { cwd: '/workspace' }) as Array<{ name: string }>
      // Only .md files
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('overview')
    })
  })

  describe('kb:read-file', () => {
    it('returns file content for allowed path', () => {
      readFileSyncMock.mockReturnValue('# Hello')
      const handler = getHandler('kb:read-file')
      const result = handler(mockEvent, { path: '/workspace/.clear-path/knowledge-base/01-overview.md' }) as { content: string }
      expect(result.content).toBe('# Hello')
    })

    it('returns error for sensitive path', () => {
      isSensitiveMock.mockReturnValue(true)
      const handler = getHandler('kb:read-file')
      const result = handler(mockEvent, { path: '/root/.ssh/id_rsa' }) as { error: string }
      expect(result.error).toBe('Access denied')
    })

    it('returns error for path outside allowed roots', () => {
      assertPathMock.mockImplementation(() => { throw new Error('Path not allowed') })
      const handler = getHandler('kb:read-file')
      const result = handler(mockEvent, { path: '/etc/passwd' }) as { error: string }
      expect(result.error).toBe('Path not allowed')
    })
  })

  describe('kb:search', () => {
    it('returns empty array when no KB exists', () => {
      existsSyncMock.mockReturnValue(false)
      const handler = getHandler('kb:search')
      const result = handler(mockEvent, { cwd: '/workspace', query: 'test' })
      expect(result).toEqual([])
    })

    it('finds matching lines in KB files', () => {
      existsSyncMock.mockReturnValue(true)
      readdirSyncMock.mockReturnValue(['01-overview.md'])
      readFileSyncMock.mockReturnValue('Line 1\nThis is a test line\nLine 3')
      statSyncMock.mockReturnValue({ mtimeMs: 1000 })

      const handler = getHandler('kb:search')
      const result = handler(mockEvent, { cwd: '/workspace', query: 'test' }) as Array<{ file: string; line: number }>
      expect(result.length).toBe(1)
      expect(result[0].line).toBe(2)
    })
  })

  describe('kb:get-sections', () => {
    it('returns section definitions', () => {
      const handler = getHandler('kb:get-sections')
      const result = handler(mockEvent) as Array<{ id: string; label: string }>
      expect(result.length).toBe(10)
      expect(result[0].id).toBe('overview')
    })
  })

  describe('kb:generate', () => {
    it('returns rate limit error when throttled', async () => {
      checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterMs: 5000 })
      const handler = getHandler('kb:generate')
      const result = await handler(mockEvent, {
        cwd: '/workspace', sectionIds: ['overview'], cli: 'copilot', depth: 'quick',
      }) as { error: string }
      expect(result.error).toContain('Rate limited')
    })

    it('spawns sub-agents for each section', async () => {
      mockCLIManager.spawnSubAgent.mockResolvedValue({ id: 'agent-1' })
      mockCLIManager.listSubAgents.mockReturnValue([{ id: 'agent-1', status: 'completed' }])
      mockCLIManager.getSubAgentOutput.mockReturnValue([{ type: 'text', content: '# Docs' }])

      const handler = getHandler('kb:generate')
      const result = await handler(mockEvent, {
        cwd: '/workspace', sectionIds: ['overview'], cli: 'copilot', depth: 'quick',
      }) as { results: Array<{ sectionId: string; status: string }>; kbDir: string }
      expect(result.results).toHaveLength(1)
      expect(mockCLIManager.spawnSubAgent).toHaveBeenCalled()
    })
  })

  describe('kb:update', () => {
    it('returns error when no KB exists', async () => {
      existsSyncMock.mockReturnValue(false)
      const handler = getHandler('kb:update')
      const result = await handler(mockEvent, { cwd: '/workspace', cli: 'copilot' }) as { error: string }
      expect(result.error).toContain('No knowledge base found')
    })
  })

  describe('kb:ask', () => {
    it('spawns a sub-agent for the question', async () => {
      mockCLIManager.spawnSubAgent.mockResolvedValue({ id: 'qa-1' })
      const handler = getHandler('kb:ask')
      const result = await handler(mockEvent, {
        cwd: '/workspace', question: 'What does this do?', cli: 'claude',
      }) as { agentId: string }
      expect(result.agentId).toBe('qa-1')
    })
  })

  describe('kb:export-merged', () => {
    it('returns error when no files exist', () => {
      existsSyncMock.mockReturnValue(false)
      const handler = getHandler('kb:export-merged')
      const result = handler(mockEvent, { cwd: '/workspace' }) as { error: string }
      expect(result.error).toContain('No knowledge base files')
    })

    it('returns merged content from all KB files', () => {
      existsSyncMock.mockReturnValue(true)
      readdirSyncMock.mockReturnValue(['01-overview.md', '02-arch.md'])
      readFileSyncMock.mockImplementation((path: string) => {
        if (path.includes('overview')) return 'Overview content'
        return 'Architecture content'
      })
      statSyncMock.mockReturnValue({ mtimeMs: 1000 })

      const handler = getHandler('kb:export-merged')
      const result = handler(mockEvent, { cwd: '/workspace' }) as { content: string }
      expect(result.content).toContain('Overview content')
      expect(result.content).toContain('Architecture content')
    })
  })

  describe('kb:export-file', () => {
    it('returns canceled when user cancels save dialog', async () => {
      existsSyncMock.mockReturnValue(true)
      readdirSyncMock.mockReturnValue(['01-overview.md'])
      readFileSyncMock.mockReturnValue('content')
      statSyncMock.mockReturnValue({ mtimeMs: 1000 })
      showSaveDialogMock.mockResolvedValue({ canceled: true })

      const handler = getHandler('kb:export-file')
      const result = await handler(mockEvent, { cwd: '/workspace' }) as { canceled: boolean }
      expect(result.canceled).toBe(true)
    })
  })
})
