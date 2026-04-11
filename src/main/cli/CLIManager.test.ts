import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockGet,
  mockSet,
  mockCopilotAdapter,
  mockClaudeAdapter,
} = vi.hoisted(() => {
  const mockCopilotAdapter = {
    cliName: 'copilot',
    binaryPath: '/usr/bin/copilot',
    isInstalled: vi.fn(),
    isAuthenticated: vi.fn(),
    buildArgs: vi.fn(),
    parseOutput: vi.fn(),
    startSession: vi.fn(),
    sendInput: vi.fn(),
    sendSlashCommand: vi.fn(),
  }
  const mockClaudeAdapter = {
    cliName: 'claude',
    binaryPath: '/usr/bin/claude',
    isInstalled: vi.fn(),
    isAuthenticated: vi.fn(),
    buildArgs: vi.fn(),
    parseOutput: vi.fn(),
    startSession: vi.fn(),
    sendInput: vi.fn(),
    sendSlashCommand: vi.fn(),
  }
  return {
    mockGet: vi.fn(),
    mockSet: vi.fn(),
    mockCopilotAdapter,
    mockClaudeAdapter,
  }
})

vi.mock('electron-store', () => ({
  default: class MockStore {
    get = mockGet
    set = mockSet
    has = vi.fn()
    delete = vi.fn()
  },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('mock-encryption-key'),
}))

vi.mock('../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('./CopilotAdapter', () => ({
  CopilotAdapter: class {
    cliName = mockCopilotAdapter.cliName
    binaryPath = mockCopilotAdapter.binaryPath
    isInstalled = mockCopilotAdapter.isInstalled
    isAuthenticated = mockCopilotAdapter.isAuthenticated
    buildArgs = mockCopilotAdapter.buildArgs
    parseOutput = mockCopilotAdapter.parseOutput
    startSession = mockCopilotAdapter.startSession
    sendInput = mockCopilotAdapter.sendInput
    sendSlashCommand = mockCopilotAdapter.sendSlashCommand
  },
}))

vi.mock('./ClaudeCodeAdapter', () => ({
  ClaudeCodeAdapter: class {
    cliName = mockClaudeAdapter.cliName
    binaryPath = mockClaudeAdapter.binaryPath
    isInstalled = mockClaudeAdapter.isInstalled
    isAuthenticated = mockClaudeAdapter.isAuthenticated
    buildArgs = mockClaudeAdapter.buildArgs
    parseOutput = mockClaudeAdapter.parseOutput
    startSession = mockClaudeAdapter.startSession
    sendInput = mockClaudeAdapter.sendInput
    sendSlashCommand = mockClaudeAdapter.sendSlashCommand
  },
}))

// ── Dynamic import with resetModules ──────────────────────────────────────────

let CLIManager: typeof import('./CLIManager').CLIManager

// ── Helpers ───────────────────────────────────────────────────────────────────

function recentTs(daysAgo = 0): number {
  return Date.now() - daysAgo * 24 * 60 * 60 * 1000
}

interface PersistedSession {
  sessionId: string
  cli: 'copilot' | 'claude'
  name?: string
  firstPrompt?: string
  startedAt: number
  endedAt?: number
  archived?: boolean
  messageLog: Array<{ type: string; content: string; metadata?: unknown; sender?: string; timestamp?: number }>
}

/**
 * Configure mockGet to return the given sessions, and mockSet to update the
 * return value when 'sessions' key is written. This simulates a real store.
 */
function setupStore(sessions: PersistedSession[] = []): { getSessions: () => PersistedSession[] } {
  let currentSessions = [...sessions]
  mockGet.mockImplementation((key: string) => {
    if (key === 'sessions') return currentSessions
    return undefined
  })
  mockSet.mockImplementation((key: string, value: unknown) => {
    if (key === 'sessions') currentSessions = value as PersistedSession[]
  })
  return {
    getSessions: () => currentSessions,
  }
}

function createMockProcess() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  return {
    pid: 12345,
    stdout: {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[`stdout:${event}`]) listeners[`stdout:${event}`] = []
        listeners[`stdout:${event}`].push(cb)
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[`stderr:${event}`]) listeners[`stderr:${event}`] = []
        listeners[`stderr:${event}`].push(cb)
      }),
    },
    stdin: { write: vi.fn() },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
    }),
    kill: vi.fn(),
    _listeners: listeners,
    _emit(event: string, ...args: unknown[]) {
      for (const cb of listeners[event] ?? []) cb(...args)
    },
  }
}

function makeManager(): InstanceType<typeof CLIManager> {
  const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
  return new CLIManager(() => mockWc as never)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CLIManager', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Re-establish default mock implementations after clearAllMocks
    mockCopilotAdapter.isInstalled.mockResolvedValue(true)
    mockCopilotAdapter.isAuthenticated.mockResolvedValue(true)
    mockCopilotAdapter.buildArgs.mockReturnValue([])
    mockCopilotAdapter.parseOutput.mockImplementation((data: string) => ({ type: 'text' as const, content: data }))
    mockClaudeAdapter.isInstalled.mockResolvedValue(true)
    mockClaudeAdapter.isAuthenticated.mockResolvedValue(true)
    mockClaudeAdapter.buildArgs.mockReturnValue([])
    mockClaudeAdapter.parseOutput.mockImplementation((data: string) => ({ type: 'text' as const, content: data }))

    // Default: empty session store
    setupStore([])

    const mod = await import('./CLIManager')
    CLIManager = mod.CLIManager
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // Callback registration
  // ═════════════════════════════════════════════════════════════════════════════

  describe('callback registration', () => {
    it('setNotifyCallback stores the callback', () => {
      const mgr = makeManager()
      mgr.setNotifyCallback(vi.fn())
    })

    it('setCostRecordCallback stores the callback', () => {
      const mgr = makeManager()
      mgr.setCostRecordCallback(vi.fn())
    })

    it('setAuditCallback stores the callback', () => {
      const mgr = makeManager()
      mgr.setAuditCallback(vi.fn())
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // checkInstalled / checkAuth
  // ═════════════════════════════════════════════════════════════════════════════

  describe('checkInstalled', () => {
    it('delegates to both adapters and returns results', async () => {
      mockCopilotAdapter.isInstalled.mockResolvedValue(true)
      mockClaudeAdapter.isInstalled.mockResolvedValue(false)
      const mgr = makeManager()
      const result = await mgr.checkInstalled()
      expect(result).toEqual({ copilot: true, claude: false })
    })

    it('handles both false', async () => {
      mockCopilotAdapter.isInstalled.mockResolvedValue(false)
      mockClaudeAdapter.isInstalled.mockResolvedValue(false)
      const mgr = makeManager()
      const result = await mgr.checkInstalled()
      expect(result).toEqual({ copilot: false, claude: false })
    })
  })

  describe('checkAuth', () => {
    it('delegates to both adapters and returns results', async () => {
      mockCopilotAdapter.isAuthenticated.mockResolvedValue(false)
      mockClaudeAdapter.isAuthenticated.mockResolvedValue(true)
      const mgr = makeManager()
      const result = await mgr.checkAuth()
      expect(result).toEqual({ copilot: false, claude: true })
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // In-memory session listing
  // ═════════════════════════════════════════════════════════════════════════════

  describe('listSessions / getSession / getSessionMessageLog', () => {
    it('listSessions returns empty array initially', () => {
      expect(makeManager().listSessions()).toEqual([])
    })

    it('getSession returns undefined for nonexistent session', () => {
      expect(makeManager().getSession('nonexistent')).toBeUndefined()
    })

    it('getSessionMessageLog returns empty array for nonexistent session', () => {
      expect(makeManager().getSessionMessageLog('nonexistent')).toEqual([])
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // Persisted session helpers
  // ═════════════════════════════════════════════════════════════════════════════

  describe('getPersistedSessions', () => {
    it('returns empty array when no sessions persisted', () => {
      setupStore([])
      const mgr = makeManager()
      expect(mgr.getPersistedSessions()).toEqual([])
    })

    it('returns seeded sessions', () => {
      setupStore([
        { sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), messageLog: [] },
        { sessionId: 's2', cli: 'claude', startedAt: recentTs(2), messageLog: [] },
      ])
      const mgr = makeManager()
      const result = mgr.getPersistedSessions()
      expect(result).toHaveLength(2)
      expect(result[0].sessionId).toBe('s1')
    })
  })

  describe('getPersistedMessageLog', () => {
    it('returns empty array for nonexistent session', () => {
      setupStore([])
      expect(makeManager().getPersistedMessageLog('nonexistent')).toEqual([])
    })

    it('returns message log for an existing session', () => {
      const msgs = [{ type: 'text', content: 'hello', sender: 'user', timestamp: recentTs() }]
      setupStore([{ sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), messageLog: msgs }])
      const mgr = makeManager()
      const result = mgr.getPersistedMessageLog('s1')
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('hello')
    })
  })

  describe('deletePersistedSession', () => {
    it('removes a session from the store', () => {
      const store = setupStore([
        { sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), messageLog: [] },
        { sessionId: 's2', cli: 'claude', startedAt: recentTs(2), messageLog: [] },
      ])
      const mgr = makeManager()
      mgr.deletePersistedSession('s1')
      const remaining = store.getSessions()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].sessionId).toBe('s2')
    })

    it('is a no-op for nonexistent session', () => {
      const store = setupStore([{ sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), messageLog: [] }])
      const mgr = makeManager()
      mgr.deletePersistedSession('nonexistent')
      expect(store.getSessions()).toHaveLength(1)
    })
  })

  describe('deletePersistedSessions', () => {
    it('removes multiple sessions at once', () => {
      const store = setupStore([
        { sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), messageLog: [] },
        { sessionId: 's2', cli: 'claude', startedAt: recentTs(2), messageLog: [] },
        { sessionId: 's3', cli: 'copilot', startedAt: recentTs(3), messageLog: [] },
      ])
      const mgr = makeManager()
      mgr.deletePersistedSessions(['s1', 's3'])
      const remaining = store.getSessions()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].sessionId).toBe('s2')
    })
  })

  describe('archivePersistedSession', () => {
    it('sets archived flag to true', () => {
      const store = setupStore([{ sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), messageLog: [] }])
      const mgr = makeManager()
      mgr.archivePersistedSession('s1', true)
      expect(store.getSessions()[0].archived).toBe(true)
    })

    it('sets archived flag to false (unarchive)', () => {
      const store = setupStore([{ sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), archived: true, messageLog: [] }])
      const mgr = makeManager()
      mgr.archivePersistedSession('s1', false)
      expect(store.getSessions()[0].archived).toBe(false)
    })

    it('is a no-op for nonexistent session', () => {
      const store = setupStore([{ sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), messageLog: [] }])
      const mgr = makeManager()
      mgr.archivePersistedSession('nonexistent', true)
      expect(store.getSessions()[0].archived).toBeUndefined()
    })
  })

  describe('renamePersistedSession', () => {
    it('renames a persisted session', () => {
      const store = setupStore([{ sessionId: 's1', cli: 'copilot', name: 'Old Name', startedAt: recentTs(1), messageLog: [] }])
      const mgr = makeManager()
      mgr.renamePersistedSession('s1', 'New Name')
      expect(store.getSessions()[0].name).toBe('New Name')
    })

    it('is a no-op for nonexistent session', () => {
      const store = setupStore([{ sessionId: 's1', cli: 'copilot', name: 'Original', startedAt: recentTs(1), messageLog: [] }])
      const mgr = makeManager()
      mgr.renamePersistedSession('nonexistent', 'Should Not Apply')
      expect(store.getSessions()[0].name).toBe('Original')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // Session purge (constructor triggers purgeExpiredSessions)
  // ═════════════════════════════════════════════════════════════════════════════

  describe('purgeExpiredSessions (constructor)', () => {
    it('removes sessions older than 30 days on construction', () => {
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000
      const recent = Date.now() - 1000
      const store = setupStore([
        { sessionId: 'old', cli: 'copilot', startedAt: thirtyOneDaysAgo, messageLog: [] },
        { sessionId: 'recent', cli: 'claude', startedAt: recent, messageLog: [] },
      ])
      makeManager()
      const sessions = store.getSessions()
      expect(sessions).toHaveLength(1)
      expect(sessions[0].sessionId).toBe('recent')
    })

    it('keeps sessions near the boundary', () => {
      // Use a small buffer to avoid test flakiness from Date.now() drift between setup and constructor
      const nearBoundary = Date.now() - 30 * 24 * 60 * 60 * 1000 + 5000
      const store = setupStore([
        { sessionId: 'boundary', cli: 'copilot', startedAt: nearBoundary, messageLog: [] },
      ])
      makeManager()
      expect(store.getSessions()).toHaveLength(1)
    })

    it('uses endedAt for retention check when available', () => {
      const fortyDaysAgo = Date.now() - 40 * 24 * 60 * 60 * 1000
      const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000
      const store = setupStore([
        { sessionId: 'old-start-recent-end', cli: 'copilot', startedAt: fortyDaysAgo, endedAt: fiveDaysAgo, messageLog: [] },
      ])
      makeManager()
      expect(store.getSessions()).toHaveLength(1)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // searchSessions
  // ═════════════════════════════════════════════════════════════════════════════

  describe('searchSessions', () => {
    it('returns empty array when no sessions match', () => {
      setupStore([{ sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), messageLog: [] }])
      const mgr = makeManager()
      expect(mgr.searchSessions('zzz_not_found', false)).toEqual([])
    })

    it('matches session name (plain text)', () => {
      setupStore([
        { sessionId: 's1', cli: 'copilot', name: 'My Refactor Session', startedAt: recentTs(1), messageLog: [] },
      ])
      const mgr = makeManager()
      const results = mgr.searchSessions('Refactor', false)
      expect(results).toHaveLength(1)
      expect(results[0].sessionId).toBe('s1')
    })

    it('matches firstPrompt', () => {
      setupStore([
        { sessionId: 's1', cli: 'copilot', firstPrompt: 'Fix the login bug', startedAt: recentTs(1), messageLog: [] },
      ])
      const mgr = makeManager()
      expect(mgr.searchSessions('login bug', false)).toHaveLength(1)
    })

    it('matches message content', () => {
      setupStore([{
        sessionId: 's1', cli: 'claude', startedAt: recentTs(1),
        messageLog: [{ type: 'text', content: 'The function handleClick needs refactoring', sender: 'ai' }],
      }])
      const mgr = makeManager()
      const results = mgr.searchSessions('handleClick', false)
      expect(results).toHaveLength(1)
      expect(results[0].matches).toHaveLength(1)
      expect(results[0].matches[0].lineIndex).toBe(0)
    })

    it('case-insensitive plain text search', () => {
      setupStore([
        { sessionId: 's1', cli: 'copilot', name: 'DEBUG Session', startedAt: recentTs(1), messageLog: [] },
      ])
      expect(makeManager().searchSessions('debug', false)).toHaveLength(1)
    })

    it('supports regex search', () => {
      setupStore([{
        sessionId: 's1', cli: 'copilot', startedAt: recentTs(1),
        messageLog: [
          { type: 'text', content: 'Error code: ERR_401', sender: 'ai' },
          { type: 'text', content: 'All good', sender: 'ai' },
        ],
      }])
      const results = makeManager().searchSessions('ERR_\\d+', true)
      expect(results).toHaveLength(1)
      expect(results[0].matches).toHaveLength(1)
    })

    it('falls back to literal match on invalid regex', () => {
      setupStore([{
        sessionId: 's1', cli: 'copilot', startedAt: recentTs(1),
        messageLog: [{ type: 'text', content: 'some [invalid regex', sender: 'ai' }],
      }])
      expect(makeManager().searchSessions('[invalid', true)).toHaveLength(1)
    })

    it('limits matches to 10 per session', () => {
      const messageLog = Array.from({ length: 20 }, (_, i) => ({
        type: 'text', content: `match keyword ${i}`, sender: 'ai' as const,
      }))
      setupStore([{ sessionId: 's1', cli: 'copilot', startedAt: recentTs(1), messageLog }])
      const results = makeManager().searchSessions('keyword', false)
      expect(results).toHaveLength(1)
      expect(results[0].matches.length).toBeLessThanOrEqual(10)
    })

    it('truncates match content to 200 chars', () => {
      setupStore([{
        sessionId: 's1', cli: 'copilot', startedAt: recentTs(1),
        messageLog: [{ type: 'text', content: 'x'.repeat(500), sender: 'ai' }],
      }])
      const results = makeManager().searchSessions('xxx', false)
      expect(results).toHaveLength(1)
      expect(results[0].matches[0].content.length).toBe(200)
    })

    it('includes archived status in results', () => {
      setupStore([
        { sessionId: 's1', cli: 'copilot', name: 'Archived One', startedAt: recentTs(1), archived: true, messageLog: [] },
      ])
      const results = makeManager().searchSessions('Archived', false)
      expect(results).toHaveLength(1)
      expect(results[0].archived).toBe(true)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // Sub-agent listing and management
  // ═════════════════════════════════════════════════════════════════════════════

  describe('sub-agent management', () => {
    it('listSubAgents returns empty array initially', () => {
      expect(makeManager().listSubAgents()).toEqual([])
    })

    it('getSubAgentOutput returns empty array for nonexistent', () => {
      expect(makeManager().getSubAgentOutput('nonexistent')).toEqual([])
    })

    it('killSubAgent returns false for nonexistent', () => {
      expect(makeManager().killSubAgent('nonexistent')).toBe(false)
    })

    it('pauseSubAgent returns false for nonexistent', () => {
      expect(makeManager().pauseSubAgent('nonexistent')).toBe(false)
    })

    it('resumeSubAgent returns false for nonexistent', () => {
      expect(makeManager().resumeSubAgent('nonexistent')).toBe(false)
    })

    it('killAllSubAgents returns 0 when none exist', () => {
      expect(makeManager().killAllSubAgents()).toBe(0)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // Cost estimation (via startSession + simulated process exit)
  // ═════════════════════════════════════════════════════════════════════════════

  describe('cost estimation via session turn', () => {
    it('invokes costRecordCallback on turn completion', async () => {
      const costCb = vi.fn()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const mgr = makeManager()
      mgr.setCostRecordCallback(costCb)

      await mgr.startSession({
        cli: 'copilot', mode: 'prompt',
        prompt: 'Hello, tell me about this project',
        model: 'gpt-5-mini',
      })

      // Simulate stdout
      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('This is a response from the AI.\n'))
      }

      // Simulate clean exit
      mockProc._emit('exit', 0, null)

      expect(costCb).toHaveBeenCalledTimes(1)
      const record = costCb.mock.calls[0][0]
      expect(record.cli).toBe('copilot')
      expect(record.model).toBe('gpt-5-mini')
      expect(record.inputTokens).toBeGreaterThan(0)
      expect(record.outputTokens).toBeGreaterThan(0)
      expect(record.totalTokens).toBe(record.inputTokens + record.outputTokens)
      expect(record.estimatedCostUsd).toBeGreaterThan(0)
      expect(record.promptCount).toBe(1)
      expect(record.timestamp).toBeGreaterThan(0)
    })

    it('uses correct pricing for claude-sonnet-4.5 model', async () => {
      const costCb = vi.fn()
      const mockProc = createMockProcess()
      mockClaudeAdapter.startSession.mockReturnValue(mockProc)

      const mgr = makeManager()
      mgr.setCostRecordCallback(costCb)

      await mgr.startSession({ cli: 'claude', mode: 'prompt', prompt: 'Test prompt', model: 'claude-sonnet-4.5' })
      mockProc._emit('exit', 0, null)

      expect(costCb).toHaveBeenCalledTimes(1)
      const record = costCb.mock.calls[0][0]
      expect(record.model).toBe('claude-sonnet-4.5')
      expect(record.inputTokens).toBe(Math.ceil(11 / 4))
      expect(record.estimatedCostUsd).toBeGreaterThanOrEqual(0)
    })

    it('defaults to gpt-5-mini for copilot when no model specified', async () => {
      const costCb = vi.fn()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const mgr = makeManager()
      mgr.setCostRecordCallback(costCb)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'Hi' })
      mockProc._emit('exit', 0, null)

      expect(costCb).toHaveBeenCalledTimes(1)
      expect(costCb.mock.calls[0][0].model).toBe('gpt-5-mini')
    })

    it('defaults to sonnet for claude when no model specified', async () => {
      const costCb = vi.fn()
      const mockProc = createMockProcess()
      mockClaudeAdapter.startSession.mockReturnValue(mockProc)

      const mgr = makeManager()
      mgr.setCostRecordCallback(costCb)

      await mgr.startSession({ cli: 'claude', mode: 'prompt', prompt: 'Hi' })
      mockProc._emit('exit', 0, null)

      expect(costCb).toHaveBeenCalledTimes(1)
      expect(costCb.mock.calls[0][0].model).toBe('sonnet')
    })

    it('does not invoke costRecordCallback on non-zero exit', async () => {
      const costCb = vi.fn()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const mgr = makeManager()
      mgr.setCostRecordCallback(costCb)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'Hello' })
      mockProc._emit('exit', 1, null)

      expect(costCb).not.toHaveBeenCalled()
    })

    it('does not throw when no costRecordCallback is set', async () => {
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const mgr = makeManager()
      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'Hello' })
      mockProc._emit('exit', 0, null)
    })

    it('falls back to default pricing for unknown model', async () => {
      const costCb = vi.fn()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const mgr = makeManager()
      mgr.setCostRecordCallback(costCb)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'Hello world', model: 'unknown-model-xyz' })
      mockProc._emit('exit', 0, null)

      expect(costCb).toHaveBeenCalledTimes(1)
      const record = costCb.mock.calls[0][0]
      expect(record.model).toBe('unknown-model-xyz')
      expect(record.estimatedCostUsd).toBeGreaterThanOrEqual(0)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // Audit logging
  // ═════════════════════════════════════════════════════════════════════════════

  describe('audit logging via session start', () => {
    it('invokes auditCallback on session start with hashed prompt', async () => {
      const auditCb = vi.fn()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const mgr = makeManager()
      mgr.setAuditCallback(auditCb)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'audit test', model: 'gpt-5' })

      expect(auditCb).toHaveBeenCalled()

      const sessionCall = auditCb.mock.calls.find(
        (c: unknown[]) => (c[0] as { actionType: string }).actionType === 'session'
      )
      expect(sessionCall).toBeDefined()
      expect(sessionCall![0].summary).toContain('copilot')

      const promptCall = auditCb.mock.calls.find(
        (c: unknown[]) => (c[0] as { actionType: string }).actionType === 'prompt'
      )
      expect(promptCall).toBeDefined()
      // Prompt content is hashed, not stored in plaintext
      expect(promptCall![0].details).not.toContain('audit test')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // startSession metadata
  // ═════════════════════════════════════════════════════════════════════════════

  describe('startSession metadata', () => {
    it('returns a session ID and adds to listSessions', async () => {
      mockCopilotAdapter.startSession.mockReturnValue(createMockProcess())
      const mgr = makeManager()
      const { sessionId } = await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'hello' })

      expect(typeof sessionId).toBe('string')
      const sessions = mgr.listSessions()
      expect(sessions).toHaveLength(1)
      expect(sessions[0].sessionId).toBe(sessionId)
      expect(sessions[0].cli).toBe('copilot')
      expect(sessions[0].status).toBe('running')
    })

    it('getSession returns session info after start', async () => {
      mockClaudeAdapter.startSession.mockReturnValue(createMockProcess())
      const mgr = makeManager()
      const { sessionId } = await mgr.startSession({
        cli: 'claude', mode: 'prompt', prompt: 'test', name: 'My Claude Session',
      })

      const info = mgr.getSession(sessionId)
      expect(info).toBeDefined()
      expect(info!.name).toBe('My Claude Session')
      expect(info!.cli).toBe('claude')
    })

    it('logs user prompt to message log', async () => {
      mockCopilotAdapter.startSession.mockReturnValue(createMockProcess())
      const mgr = makeManager()
      const { sessionId } = await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'Explain this code' })

      const log = mgr.getSessionMessageLog(sessionId)
      const userMsg = log.find((m) => (m as { sender?: string }).sender === 'user')
      expect(userMsg).toBeDefined()
      expect(userMsg!.content).toBe('Explain this code')
    })

    it('uses displayPrompt for message log when different from prompt', async () => {
      mockCopilotAdapter.startSession.mockReturnValue(createMockProcess())
      const mgr = makeManager()
      const { sessionId } = await mgr.startSession({
        cli: 'copilot', mode: 'prompt',
        prompt: '[SYSTEM CONTEXT] ... Explain this code',
        displayPrompt: 'Explain this code',
      })

      const log = mgr.getSessionMessageLog(sessionId)
      const userMsg = log.find((m) => (m as { sender?: string }).sender === 'user')
      expect(userMsg!.content).toBe('Explain this code')
    })

    it('adds context status message when displayPrompt differs from prompt', async () => {
      mockCopilotAdapter.startSession.mockReturnValue(createMockProcess())
      const mgr = makeManager()
      const { sessionId } = await mgr.startSession({
        cli: 'copilot', mode: 'prompt',
        prompt: '[AGENT CONTEXT]\nUser prompt here',
        displayPrompt: 'User prompt here',
      })

      const log = mgr.getSessionMessageLog(sessionId)
      expect(log.find((m) => m.type === 'status' && m.content.includes('context'))).toBeDefined()
    })

    it('persists session to store on creation', async () => {
      mockCopilotAdapter.startSession.mockReturnValue(createMockProcess())
      const mgr = makeManager()
      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })

      // persistSession calls mockSet — verify it was called with sessions key
      expect(mockSet).toHaveBeenCalledWith('sessions', expect.any(Array))
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // stopSession
  // ═════════════════════════════════════════════════════════════════════════════

  describe('stopSession', () => {
    it('marks session as stopped', async () => {
      mockCopilotAdapter.startSession.mockReturnValue(createMockProcess())
      const mgr = makeManager()
      const { sessionId } = await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })

      await mgr.stopSession(sessionId)
      expect(mgr.getSession(sessionId)!.status).toBe('stopped')
    })

    it('is a no-op for nonexistent session', async () => {
      await makeManager().stopSession('nonexistent')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // attachListeners — stdout parsing
  // ═════════════════════════════════════════════════════════════════════════════

  describe('attachListeners — stdout parsing', () => {
    function makeManagerWithWc() {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      return { mgr, mockWc }
    }

    it('parses stdout data line by line and sends cli:output', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation((line: string) => ({ type: 'text', content: line }))

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('Hello world\n'))
      }

      const outputCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:output')
      expect(outputCalls.length).toBeGreaterThanOrEqual(1)
      const lastOutput = outputCalls[outputCalls.length - 1]
      expect(lastOutput[1].output.content).toBe('Hello world')
    })

    it('sends permission-request type via cli:permission-request channel', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation(() => ({ type: 'permission-request', content: 'Allow file write?' }))

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('permission line\n'))
      }

      const permCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:permission-request')
      expect(permCalls.length).toBeGreaterThanOrEqual(1)
      expect(permCalls[0][1].request.content).toBe('Allow file write?')
    })

    it('stores parsed output in session messageLog', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation((line: string) => ({ type: 'text', content: line }))

      const { sessionId } = await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })

      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('Stored message\n'))
      }

      const log = mgr.getSessionMessageLog(sessionId)
      const aiMsg = log.find((m) => m.content === 'Stored message' && (m as { sender?: string }).sender === 'ai')
      expect(aiMsg).toBeDefined()
    })

    it('buffers partial lines until a newline arrives', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation((line: string) => ({ type: 'text', content: line }))

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      // Send partial line (no newline)
      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('partial'))
      }

      // No cli:output should have been emitted for the partial
      const outputCalls1 = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:output')
      expect(outputCalls1.length).toBe(0)

      // Now send the rest with a newline
      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from(' complete\n'))
      }

      const outputCalls2 = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:output')
      expect(outputCalls2.length).toBeGreaterThanOrEqual(1)
      expect(outputCalls2[0][1].output.content).toBe('partial complete')
    })

    it('skips empty/blank lines', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation((line: string) => ({ type: 'text', content: line }))

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('\n   \n\n'))
      }

      const outputCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:output')
      expect(outputCalls.length).toBe(0)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // attachListeners — stderr handling
  // ═════════════════════════════════════════════════════════════════════════════

  describe('attachListeners — stderr handling', () => {
    function makeManagerWithWc() {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      return { mgr, mockWc }
    }

    it('sends usage stats via cli:usage, not cli:error', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      for (const cb of mockProc._listeners['stderr:data'] ?? []) {
        cb(Buffer.from('Total usage est: 1500 tokens\n'))
      }

      const usageCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:usage')
      expect(usageCalls.length).toBe(1)
      const errorCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:error')
      expect(errorCalls.length).toBe(0)
    })

    it('sends agent-not-found as cli:output status, not error', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      for (const cb of mockProc._listeners['stderr:data'] ?? []) {
        cb(Buffer.from('No such agent "my-agent" found\n'))
      }

      const outputCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:output')
      expect(outputCalls.length).toBe(1)
      expect(outputCalls[0][1].output.type).toBe('status')
      expect(outputCalls[0][1].output.content).toContain('Agent not found')
      const errorCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:error')
      expect(errorCalls.length).toBe(0)
    })

    it('sends policy/MCP warning as cli:output with metadata.source=policy', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      for (const cb of mockProc._listeners['stderr:data'] ?? []) {
        cb(Buffer.from('MCP server "custom" disabled by organization policy\n'))
      }

      const outputCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:output')
      expect(outputCalls.length).toBe(1)
      expect(outputCalls[0][1].output.type).toBe('status')
      expect(outputCalls[0][1].output.metadata.source).toBe('policy')
    })

    it('sends regular stderr as cli:error', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      for (const cb of mockProc._listeners['stderr:data'] ?? []) {
        cb(Buffer.from('Something went wrong\n'))
      }

      const errorCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:error')
      expect(errorCalls.length).toBe(1)
      expect(errorCalls[0][1].error).toBe('Something went wrong')
    })

    it('suppresses duplicate stderr messages within the window', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      // Send the same message twice
      for (const cb of mockProc._listeners['stderr:data'] ?? []) {
        cb(Buffer.from('Repeated error message\n'))
      }
      for (const cb of mockProc._listeners['stderr:data'] ?? []) {
        cb(Buffer.from('Repeated error message\n'))
      }

      const errorCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:error')
      expect(errorCalls.length).toBe(1)
    })

    it('ignores empty/blank stderr', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      for (const cb of mockProc._listeners['stderr:data'] ?? []) {
        cb(Buffer.from('   \n'))
      }

      const errorCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:error')
      expect(errorCalls.length).toBe(0)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // attachListeners — error event
  // ═════════════════════════════════════════════════════════════════════════════

  describe('attachListeners — error event', () => {
    function makeManagerWithWc() {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      return { mgr, mockWc }
    }

    it('sends cli:error and cli:turn-end on process error', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      mockProc._emit('error', new Error('ENOENT: copilot not found'))

      const errorCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:error')
      expect(errorCalls.length).toBe(1)
      expect(errorCalls[0][1].error).toContain('ENOENT')

      const turnEndCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:turn-end')
      expect(turnEndCalls.length).toBe(1)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // attachListeners — exit event
  // ═════════════════════════════════════════════════════════════════════════════

  describe('attachListeners — exit event', () => {
    function makeManagerWithWc() {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      return { mgr, mockWc }
    }

    it('sends cli:turn-end and calls estimateCostFromOutput on exit code 0', async () => {
      const costCb = vi.fn()
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      mgr.setCostRecordCallback(costCb)
      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      mockProc._emit('exit', 0, null)

      const turnEndCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:turn-end')
      expect(turnEndCalls.length).toBe(1)
      expect(costCb).toHaveBeenCalledTimes(1)
    })

    it('sends cli:turn-end but does NOT call cost callback on non-zero exit', async () => {
      const costCb = vi.fn()
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      mgr.setCostRecordCallback(costCb)
      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockWc.send.mockClear()

      mockProc._emit('exit', 1, null)

      const turnEndCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:turn-end')
      expect(turnEndCalls.length).toBe(1)
      expect(costCb).not.toHaveBeenCalled()
    })

    it('triggers onNotify on first-turn failure (code !== 0, turnCount === 1)', async () => {
      const notifyCb = vi.fn()
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      mgr.setNotifyCallback(notifyCb)
      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })

      mockProc._emit('exit', 1, null)

      expect(notifyCb).toHaveBeenCalledTimes(1)
      expect(notifyCb.mock.calls[0][0].type).toBe('error')
      expect(notifyCb.mock.calls[0][0].severity).toBe('warning')
    })

    it('flushes remaining buffer content on exit', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation((line: string) => ({ type: 'text', content: line }))

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })

      // Send a partial line (no newline — stays in buffer)
      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('buffered content'))
      }
      mockWc.send.mockClear()

      // Exit should flush the buffer
      mockProc._emit('exit', 0, null)

      const outputCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'cli:output')
      expect(outputCalls.length).toBeGreaterThanOrEqual(1)
      expect(outputCalls[0][1].output.content).toBe('buffered content')
    })

    it('persists session after exit', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      mockSet.mockClear()

      mockProc._emit('exit', 0, null)

      expect(mockSet).toHaveBeenCalledWith('sessions', expect.any(Array))
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // sendInput
  // ═════════════════════════════════════════════════════════════════════════════

  describe('sendInput', () => {
    function makeManagerWithWc() {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      return { mgr, mockWc }
    }

    it('ignores input when session does not exist', () => {
      const { mgr } = makeManagerWithWc()
      // Should not throw
      mgr.sendInput('nonexistent', 'hello')
    })

    it('ignores input when session is stopped', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const { sessionId } = await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })
      await mgr.stopSession(sessionId)

      // Should not throw or start a new turn
      mgr.sendInput(sessionId, 'hello after stop')
    })

    it('ignores input when processingTurn is true', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const { sessionId } = await mgr.startSession({ cli: 'copilot', mode: 'prompt', prompt: 'test' })

      // processingTurn is true because initial prompt started a turn
      // Trying to send input should be ignored
      const startSessionCallCount = mockCopilotAdapter.startSession.mock.calls.length
      mgr.sendInput(sessionId, 'should be ignored')

      // No new process should have been spawned
      expect(mockCopilotAdapter.startSession.mock.calls.length).toBe(startSessionCallCount)
    })

    it('logs user input to messageLog for normal text', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const { sessionId } = await mgr.startSession({ cli: 'copilot', mode: 'interactive' })

      // Complete the first turn so processingTurn = false
      mockProc._emit('exit', 0, null)

      const mockProc2 = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc2)

      mgr.sendInput(sessionId, 'Hello from user')

      const log = mgr.getSessionMessageLog(sessionId)
      const userMsg = log.find((m) => m.content === 'Hello from user' && (m as { sender?: string }).sender === 'user')
      expect(userMsg).toBeDefined()
    })

    it('does NOT log "y", "n", or escape sequences to messageLog', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const { sessionId } = await mgr.startSession({ cli: 'copilot', mode: 'interactive' })
      mockProc._emit('exit', 0, null)

      const mockProc2 = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc2)
      mgr.sendInput(sessionId, 'y')

      mockProc2._emit('exit', 0, null)
      const mockProc3 = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc3)
      mgr.sendInput(sessionId, 'n')

      mockProc3._emit('exit', 0, null)
      const mockProc4 = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc4)
      mgr.sendInput(sessionId, '\x1b[A')

      const log = mgr.getSessionMessageLog(sessionId)
      const userMessages = log.filter((m) => (m as { sender?: string }).sender === 'user')
      for (const msg of userMessages) {
        expect(msg.content).not.toBe('y')
        expect(msg.content).not.toBe('n')
        expect(msg.content).not.toMatch(/^\x1b/)
      }
    })

    it('injects agentContext on first turn and clears it', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const { sessionId } = await mgr.startSession({
        cli: 'copilot',
        mode: 'interactive',
        agentContext: 'You are a code reviewer.',
      })

      // No initial prompt, so no turn was started. processingTurn is false.
      // turnCount is 0.
      const mockProc2 = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc2)

      mgr.sendInput(sessionId, 'Review my code')

      // The adapter.startSession should have been called with a prompt that includes agentContext
      const lastCall = mockCopilotAdapter.startSession.mock.calls[mockCopilotAdapter.startSession.mock.calls.length - 1]
      const promptArg = lastCall[0].prompt
      expect(promptArg).toContain('You are a code reviewer.')
      expect(promptArg).toContain('Review my code')

      // After injection, complete the turn
      mockProc2._emit('exit', 0, null)

      // Second input should NOT include agentContext
      const mockProc3 = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc3)
      mgr.sendInput(sessionId, 'Another message')

      const lastCall2 = mockCopilotAdapter.startSession.mock.calls[mockCopilotAdapter.startSession.mock.calls.length - 1]
      expect(lastCall2[0].prompt).toBe('Another message')
      expect(lastCall2[0].prompt).not.toContain('You are a code reviewer.')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // sendSlashCommand
  // ═════════════════════════════════════════════════════════════════════════════

  describe('sendSlashCommand', () => {
    it('delegates to sendInput', async () => {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const { sessionId } = await mgr.startSession({ cli: 'copilot', mode: 'interactive' })
      mockProc._emit('exit', 0, null)

      const mockProc2 = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc2)

      mgr.sendSlashCommand(sessionId, '/clear')

      // Should have spawned a new process for the slash command turn
      expect(mockCopilotAdapter.startSession).toHaveBeenCalled()
      const lastCall = mockCopilotAdapter.startSession.mock.calls[mockCopilotAdapter.startSession.mock.calls.length - 1]
      expect(lastCall[0].prompt).toBe('/clear')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // spawnSubAgent
  // ═════════════════════════════════════════════════════════════════════════════

  describe('spawnSubAgent', () => {
    function makeManagerWithWc() {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      return { mgr, mockWc }
    }

    it('returns SubAgentInfo with correct fields', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({
        name: 'Test Agent',
        cli: 'copilot',
        prompt: 'Do something',
        model: 'gpt-5',
      })

      expect(info.name).toBe('Test Agent')
      expect(info.cli).toBe('copilot')
      expect(info.status).toBe('running')
      expect(info.prompt).toBe('Do something')
      expect(info.model).toBe('gpt-5')
      expect(info.id).toBeDefined()
      expect(info.startedAt).toBeGreaterThan(0)
    })

    it('adds sub-agent to listSubAgents', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.spawnSubAgent({ name: 'Agent 1', cli: 'copilot', prompt: 'task 1' })

      expect(mgr.listSubAgents()).toHaveLength(1)
      expect(mgr.listSubAgents()[0].name).toBe('Agent 1')
    })

    it('sets yolo for copilot when permissionMode is "yolo"', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.spawnSubAgent({
        name: 'Yolo Agent',
        cli: 'copilot',
        prompt: 'do it all',
        permissionMode: 'yolo',
      })

      const lastCall = mockCopilotAdapter.startSession.mock.calls[mockCopilotAdapter.startSession.mock.calls.length - 1]
      expect(lastCall[0].yolo).toBe(true)
    })

    it('notifies renderer via subagent:spawned', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.spawnSubAgent({ name: 'Notify Agent', cli: 'copilot', prompt: 'test' })

      const spawnedCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'subagent:spawned')
      expect(spawnedCalls.length).toBe(1)
      expect(spawnedCalls[0][1].name).toBe('Notify Agent')
    })

    it('sets permissionMode for claude adapter', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockClaudeAdapter.startSession.mockReturnValue(mockProc)

      await mgr.spawnSubAgent({
        name: 'Claude Agent',
        cli: 'claude',
        prompt: 'something',
        permissionMode: 'plan',
      })

      const lastCall = mockClaudeAdapter.startSession.mock.calls[mockClaudeAdapter.startSession.mock.calls.length - 1]
      expect(lastCall[0].permissionMode).toBe('plan')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // attachSubAgentListeners
  // ═════════════════════════════════════════════════════════════════════════════

  describe('attachSubAgentListeners', () => {
    function makeManagerWithWc() {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      return { mgr, mockWc }
    }

    it('parses stdout and adds to outputLog', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation((line: string) => ({ type: 'text', content: line }))

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('Sub-agent output\n'))
      }

      const output = mgr.getSubAgentOutput(info.id)
      const textEntries = output.filter((o) => o.content === 'Sub-agent output')
      expect(textEntries.length).toBeGreaterThanOrEqual(1)
    })

    it('sends stdout to renderer via subagent:output', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation((line: string) => ({ type: 'text', content: line }))

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })
      mockWc.send.mockClear()

      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('Output line\n'))
      }

      const outputCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'subagent:output')
      expect(outputCalls.length).toBeGreaterThanOrEqual(1)
      expect(outputCalls[0][1].id).toBe(info.id)
    })

    it('stderr adds error-type entry to outputLog', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      for (const cb of mockProc._listeners['stderr:data'] ?? []) {
        cb(Buffer.from('error message\n'))
      }

      const output = mgr.getSubAgentOutput(info.id)
      const errorEntries = output.filter((o) => o.type === 'error')
      expect(errorEntries.length).toBeGreaterThanOrEqual(1)
    })

    it('process error sets status to failed', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      mockProc._emit('error', new Error('spawn failure'))

      const agents = mgr.listSubAgents()
      const sa = agents.find((a) => a.id === info.id)
      expect(sa!.status).toBe('failed')
    })

    it('exit with SIGTERM sets status to killed', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      mockProc._emit('exit', null, 'SIGTERM')

      const agents = mgr.listSubAgents()
      const sa = agents.find((a) => a.id === info.id)
      expect(sa!.status).toBe('killed')
    })

    it('exit with non-zero code sets status to failed', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      mockProc._emit('exit', 1, null)

      const agents = mgr.listSubAgents()
      const sa = agents.find((a) => a.id === info.id)
      expect(sa!.status).toBe('failed')
    })

    it('exit with code 0 sets status to completed', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      mockProc._emit('exit', 0, null)

      const agents = mgr.listSubAgents()
      const sa = agents.find((a) => a.id === info.id)
      expect(sa!.status).toBe('completed')
    })

    it('records cost on successful completion (code 0)', async () => {
      const costCb = vi.fn()
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation((line: string) => ({ type: 'text', content: line }))

      mgr.setCostRecordCallback(costCb)
      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test', model: 'gpt-5' })

      // Generate some output so cost is non-zero
      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('Some output content\n'))
      }

      mockProc._emit('exit', 0, null)

      expect(costCb).toHaveBeenCalledTimes(1)
      expect(costCb.mock.calls[0][0].sessionId).toBe(info.id)
    })

    it('flushes remaining buffer on exit', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)
      mockCopilotAdapter.parseOutput.mockImplementation((line: string) => ({ type: 'text', content: line }))

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      // Send partial line (no newline)
      for (const cb of mockProc._listeners['stdout:data'] ?? []) {
        cb(Buffer.from('partial buffer'))
      }

      mockProc._emit('exit', 0, null)

      const output = mgr.getSubAgentOutput(info.id)
      const bufferEntry = output.find((o) => o.content === 'partial buffer')
      expect(bufferEntry).toBeDefined()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // Sub-agent lifecycle (kill, pause, resume, killAll) with real agents
  // ═════════════════════════════════════════════════════════════════════════════

  describe('sub-agent lifecycle with real agents', () => {
    function makeManagerWithWc() {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      return { mgr, mockWc }
    }

    it('killSubAgent sends SIGTERM and returns true', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      const result = mgr.killSubAgent(info.id)
      expect(result).toBe(true)
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('pauseSubAgent sends SIGINT and returns true', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      const result = mgr.pauseSubAgent(info.id)
      expect(result).toBe(true)
      expect(mockProc.kill).toHaveBeenCalledWith('SIGINT')
    })

    it('resumeSubAgent writes "continue" to stdin by default', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      const result = mgr.resumeSubAgent(info.id)
      expect(result).toBe(true)
      expect(mockProc.stdin.write).toHaveBeenCalledWith('continue\n')
    })

    it('resumeSubAgent writes custom prompt to stdin', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      const info = await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })

      mgr.resumeSubAgent(info.id, 'try a different approach')
      expect(mockProc.stdin.write).toHaveBeenCalledWith('try a different approach\n')
    })

    it('killAllSubAgents kills all running sub-agents and returns count', async () => {
      const { mgr } = makeManagerWithWc()
      const mockProc1 = createMockProcess()
      const mockProc2 = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2)

      await mgr.spawnSubAgent({ name: 'SA1', cli: 'copilot', prompt: 'task1' })
      await mgr.spawnSubAgent({ name: 'SA2', cli: 'copilot', prompt: 'task2' })

      const count = mgr.killAllSubAgents()
      expect(count).toBe(2)
      expect(mockProc1.kill).toHaveBeenCalledWith('SIGTERM')
      expect(mockProc2.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // updateSubAgentStatus — notifications
  // ═════════════════════════════════════════════════════════════════════════════

  describe('updateSubAgentStatus notifications', () => {
    function makeManagerWithWc() {
      const mockWc = { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
      const mgr = new CLIManager(() => mockWc as never)
      return { mgr, mockWc }
    }

    it('sends subagent:status-changed on completion', async () => {
      const { mgr, mockWc } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      await mgr.spawnSubAgent({ name: 'SA', cli: 'copilot', prompt: 'test' })
      mockWc.send.mockClear()

      mockProc._emit('exit', 0, null)

      const statusCalls = mockWc.send.mock.calls.filter((c: unknown[]) => c[0] === 'subagent:status-changed')
      expect(statusCalls.length).toBeGreaterThanOrEqual(1)
      expect(statusCalls[statusCalls.length - 1][1].status).toBe('completed')
    })

    it('triggers onNotify for completed status', async () => {
      const notifyCb = vi.fn()
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      mgr.setNotifyCallback(notifyCb)
      const info = await mgr.spawnSubAgent({ name: 'SA Complete', cli: 'copilot', prompt: 'test' })

      mockProc._emit('exit', 0, null)

      const completedCalls = notifyCb.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === 'session-complete'
      )
      expect(completedCalls.length).toBe(1)
      expect(completedCalls[0][0].title).toContain('SA Complete')
    })

    it('triggers onNotify for failed status', async () => {
      const notifyCb = vi.fn()
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      mgr.setNotifyCallback(notifyCb)
      await mgr.spawnSubAgent({ name: 'SA Failed', cli: 'copilot', prompt: 'test' })

      mockProc._emit('exit', 1, null)

      const failedCalls = notifyCb.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === 'error'
      )
      expect(failedCalls.length).toBe(1)
      expect(failedCalls[0][0].title).toContain('SA Failed')
    })

    it('does NOT trigger onNotify for killed status', async () => {
      const notifyCb = vi.fn()
      const { mgr } = makeManagerWithWc()
      const mockProc = createMockProcess()
      mockCopilotAdapter.startSession.mockReturnValue(mockProc)

      mgr.setNotifyCallback(notifyCb)
      await mgr.spawnSubAgent({ name: 'SA Killed', cli: 'copilot', prompt: 'test' })
      notifyCb.mockClear()

      mockProc._emit('exit', null, 'SIGTERM')

      // Killed status should not produce any notifications
      expect(notifyCb).not.toHaveBeenCalled()
    })
  })
})
