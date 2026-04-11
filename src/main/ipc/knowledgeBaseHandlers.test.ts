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

    it('returns "File not found" for other read errors', () => {
      assertPathMock.mockImplementation(() => undefined)
      isSensitiveMock.mockReturnValue(false)
      readFileSyncMock.mockImplementation(() => { throw new Error('ENOENT: file not found') })
      const handler = getHandler('kb:read-file')
      const result = handler(mockEvent, { path: '/workspace/missing.md' }) as { error: string }
      expect(result.error).toBe('File not found')
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

    it('records empty status when agent produces no text output', async () => {
      mockCLIManager.spawnSubAgent.mockResolvedValue({ id: 'agent-2' })
      mockCLIManager.listSubAgents.mockReturnValue([{ id: 'agent-2', status: 'completed' }])
      mockCLIManager.getSubAgentOutput.mockReturnValue([]) // no output

      const handler = getHandler('kb:generate')
      const result = await handler(mockEvent, {
        cwd: '/workspace', sectionIds: ['overview'], cli: 'copilot', depth: 'standard',
      }) as { results: Array<{ sectionId: string; status: string }> }
      expect(result.results[0].status).toBe('empty')
    })

    it('records failed status when spawnSubAgent throws', async () => {
      mockCLIManager.spawnSubAgent.mockRejectedValue(new Error('spawn failed'))

      const handler = getHandler('kb:generate')
      const result = await handler(mockEvent, {
        cwd: '/workspace', sectionIds: ['architecture'], cli: 'claude', depth: 'deep',
      }) as { results: Array<{ sectionId: string; status: string }> }
      expect(result.results[0].status).toBe('failed')
    })

    it('splits maxBudget across sections', async () => {
      mockCLIManager.spawnSubAgent.mockResolvedValue({ id: 'agent-3' })
      mockCLIManager.listSubAgents.mockReturnValue([{ id: 'agent-3', status: 'completed' }])
      mockCLIManager.getSubAgentOutput.mockReturnValue([{ type: 'text', content: 'content' }])

      const handler = getHandler('kb:generate')
      await handler(mockEvent, {
        cwd: '/workspace', sectionIds: ['overview', 'architecture'], cli: 'copilot',
        depth: 'quick', maxBudget: 1.0,
      })
      // maxBudget is split: 1.0 / 2 = 0.5 per section
      expect(mockCLIManager.spawnSubAgent).toHaveBeenCalledWith(expect.objectContaining({
        maxBudget: 0.5,
      }))
    })

    it('uses undefined maxBudget when not provided', async () => {
      mockCLIManager.spawnSubAgent.mockResolvedValue({ id: 'agent-4' })
      mockCLIManager.listSubAgents.mockReturnValue([{ id: 'agent-4', status: 'completed' }])
      mockCLIManager.getSubAgentOutput.mockReturnValue([{ type: 'text', content: 'docs' }])

      const handler = getHandler('kb:generate')
      await handler(mockEvent, {
        cwd: '/workspace', sectionIds: ['overview'], cli: 'copilot', depth: 'quick',
        // maxBudget not provided
      })
      expect(mockCLIManager.spawnSubAgent).toHaveBeenCalledWith(expect.objectContaining({
        maxBudget: undefined,
      }))
    })
  })

  describe('kb:update', () => {
    it('returns error when no KB exists', async () => {
      existsSyncMock.mockReturnValue(false)
      const handler = getHandler('kb:update')
      const result = await handler(mockEvent, { cwd: '/workspace', cli: 'copilot' }) as { error: string }
      expect(result.error).toContain('No knowledge base found')
    })

    it('spawns update agent when KB exists', async () => {
      existsSyncMock.mockReturnValue(true)
      mockCLIManager.spawnSubAgent.mockResolvedValue({ id: 'update-agent' })
      const handler = getHandler('kb:update')
      const result = await handler(mockEvent, { cwd: '/workspace', cli: 'claude' }) as { agentId: string; status: string }
      expect(result.agentId).toBe('update-agent')
      expect(result.status).toBe('started')
      expect(mockCLIManager.spawnSubAgent).toHaveBeenCalledWith(expect.objectContaining({
        name: 'KB: Update',
        cli: 'claude',
        permissionMode: 'acceptEdits',
      }))
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

    it('includes KB context when KB directory exists', async () => {
      existsSyncMock.mockReturnValue(true)
      mockCLIManager.spawnSubAgent.mockResolvedValue({ id: 'qa-2' })
      const handler = getHandler('kb:ask')
      await handler(mockEvent, {
        cwd: '/workspace', question: 'What is the architecture?', cli: 'copilot',
      })
      expect(mockCLIManager.spawnSubAgent).toHaveBeenCalledWith(expect.objectContaining({
        prompt: expect.stringContaining('Use the knowledge base documentation'),
      }))
    })

    it('omits KB context when KB directory does not exist', async () => {
      existsSyncMock.mockReturnValue(false)
      mockCLIManager.spawnSubAgent.mockResolvedValue({ id: 'qa-3' })
      const handler = getHandler('kb:ask')
      await handler(mockEvent, {
        cwd: '/workspace', question: 'How does auth work?', cli: 'copilot',
      })
      const call = mockCLIManager.spawnSubAgent.mock.calls[0][0]
      expect(call.prompt).not.toContain('Use the knowledge base documentation')
      expect(call.prompt).toContain('How does auth work?')
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

    it('returns error when no KB files exist', async () => {
      existsSyncMock.mockReturnValue(false)
      const handler = getHandler('kb:export-file')
      const result = await handler(mockEvent, { cwd: '/workspace' }) as { error: string }
      expect(result.error).toContain('No knowledge base files')
    })

    it('writes merged file and returns path when user picks a location', async () => {
      existsSyncMock.mockReturnValue(true)
      readdirSyncMock.mockReturnValue(['01-overview.md'])
      readFileSyncMock.mockReturnValue('Overview content')
      statSyncMock.mockReturnValue({ mtimeMs: 1000 })
      showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: '/tmp/kb.md' })

      const handler = getHandler('kb:export-file')
      const result = await handler(mockEvent, { cwd: '/workspace' }) as { path: string }
      expect(result.path).toBe('/tmp/kb.md')
      expect(writeFileSyncMock).toHaveBeenCalledWith('/tmp/kb.md', expect.stringContaining('Overview content'), 'utf8')
    })
  })
})
