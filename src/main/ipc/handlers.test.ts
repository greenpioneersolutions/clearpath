import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockGet,
  mockSet,
  checkRateLimitMock,
  existsSyncMock,
  readFileSyncMock,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  checkRateLimitMock: vi.fn().mockReturnValue({ allowed: true }),
  existsSyncMock: vi.fn().mockReturnValue(false),
  readFileSyncMock: vi.fn().mockReturnValue(''),
}))

vi.mock('electron-store', () => ({
  default: class MockStore {
    constructor() {}
    get = mockGet
    set = mockSet
  },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('../utils/rateLimiter', () => ({
  checkRateLimit: checkRateLimitMock,
}))

vi.mock('../starter-pack/agents', () => ({
  STARTER_AGENTS: [
    {
      id: 'communication-coach',
      name: 'Communication Coach',
      systemPrompt: 'You are the Communication Coach agent.',
    },
    {
      id: 'research-analyst',
      name: 'Research Analyst',
      systemPrompt: 'You are the Research Analyst agent.',
    },
  ],
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => unknown

function extractHandlers(ipcMainMock: { handle: ReturnType<typeof vi.fn> }): Map<string, HandlerFn> {
  const map = new Map<string, HandlerFn>()
  for (const call of ipcMainMock.handle.mock.calls) {
    map.set(call[0] as string, call[1] as HandlerFn)
  }
  return map
}

const mockEvent = {}

function makeMockCLIManager() {
  return {
    checkInstalled: vi.fn().mockResolvedValue({ copilot: true, claude: false }),
    checkAuth: vi.fn().mockResolvedValue({ copilot: true, claude: false }),
    startSession: vi.fn().mockResolvedValue({ sessionId: 'session-123' }),
    sendInput: vi.fn(),
    sendSlashCommand: vi.fn(),
    stopSession: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockReturnValue([]),
    getSession: vi.fn().mockReturnValue(null),
    getSessionMessageLog: vi.fn().mockReturnValue([]),
    getPersistedMessageLog: vi.fn().mockReturnValue([]),
    getPersistedSessions: vi.fn().mockReturnValue([]),
    deletePersistedSession: vi.fn(),
    deletePersistedSessions: vi.fn(),
    archivePersistedSession: vi.fn(),
    renamePersistedSession: vi.fn(),
    searchSessions: vi.fn().mockReturnValue([]),
  }
}

function makeMockAgentManager() {
  return {
    getActiveAgents: vi.fn().mockReturnValue({ copilot: null, claude: null }),
    listAgents: vi.fn().mockReturnValue({ copilot: [], claude: [] }),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handlers (registerIpcHandlers)', () => {
  let handlers: Map<string, HandlerFn>
  let ipcMainMock: { handle: ReturnType<typeof vi.fn> }
  let cliManager: ReturnType<typeof makeMockCLIManager>
  let agentManager: ReturnType<typeof makeMockAgentManager>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    checkRateLimitMock.mockReturnValue({ allowed: true })
    existsSyncMock.mockReturnValue(false)
    mockGet.mockReturnValue(undefined)

    cliManager = makeMockCLIManager()
    agentManager = makeMockAgentManager()
    ipcMainMock = { handle: vi.fn() }

    const mod = await import('./handlers')
    mod.registerIpcHandlers(ipcMainMock as never, cliManager as never, agentManager as never)
    handlers = extractHandlers(ipcMainMock)
  })

  // ── Registration ──────────────────────────────────────────────────────────

  it('registers all expected IPC channels', () => {
    const expected = [
      'cli:check-installed',
      'cli:check-auth',
      'cli:start-session',
      'cli:send-input',
      'cli:send-slash-command',
      'cli:stop-session',
      'cli:list-sessions',
      'cli:get-session',
      'cli:get-message-log',
      'cli:get-persisted-sessions',
      'cli:delete-session',
      'cli:delete-sessions',
      'cli:archive-session',
      'cli:rename-session',
      'cli:search-sessions',
      'app:get-cwd',
    ]
    for (const channel of expected) {
      expect(handlers.has(channel), `missing handler for ${channel}`).toBe(true)
    }
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(expected.length)
  })

  // ── cli:check-installed ───────────────────────────────────────────────────

  describe('cli:check-installed', () => {
    it('delegates to cliManager.checkInstalled', async () => {
      const result = await handlers.get('cli:check-installed')!(mockEvent)
      expect(cliManager.checkInstalled).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ copilot: true, claude: false })
    })
  })

  // ── cli:check-auth ────────────────────────────────────────────────────────

  describe('cli:check-auth', () => {
    it('delegates to cliManager.checkAuth', async () => {
      const result = await handlers.get('cli:check-auth')!(mockEvent)
      expect(cliManager.checkAuth).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ copilot: true, claude: false })
    })
  })

  // ── cli:start-session ─────────────────────────────────────────────────────

  describe('cli:start-session', () => {
    it('returns rate-limit error when rate limit is hit', async () => {
      checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterMs: 30000 })

      const result = await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
      })

      expect(result).toEqual({ error: 'Rate limited — try again in 30s' })
      expect(cliManager.startSession).not.toHaveBeenCalled()
    })

    it('calls cliManager.startSession with original options when no agent and no model override', async () => {
      // Settings store returns no settings
      mockGet.mockReturnValue(undefined)

      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        model: 'gpt-5',
        prompt: 'Hello',
      })

      expect(cliManager.startSession).toHaveBeenCalledTimes(1)
      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.model).toBe('gpt-5')
      expect(passedOptions.prompt).toBe('Hello')
    })

    it('injects default model when none specified', async () => {
      // Settings store returns no saved model
      mockGet.mockReturnValue(undefined)

      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      // Default copilot model is 'gpt-5-mini'
      expect(passedOptions.model).toBe('gpt-5-mini')
    })

    it('injects default claude model when none specified', async () => {
      mockGet.mockReturnValue(undefined)

      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'claude',
        mode: 'interactive',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.model).toBe('sonnet')
    })

    it('uses saved model from settings store', async () => {
      mockGet.mockReturnValue({ model: { copilot: 'gpt-5', claude: 'opus' } })

      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.model).toBe('gpt-5')
    })

    it('does not override explicitly provided model', async () => {
      mockGet.mockReturnValue({ model: { copilot: 'gpt-5' } })

      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        model: 'claude-sonnet-4',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.model).toBe('claude-sonnet-4')
    })

    // ── Agent resolution: stored active agent ───────────────────────────────

    it('resolves active agent from agentManager when no explicit agent', async () => {
      agentManager.getActiveAgents.mockReturnValue({ copilot: 'communication-coach', claude: null })

      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        prompt: 'Help me write an email',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      // Agent resolved via starter pack — prompt should be prepended with system prompt
      expect(passedOptions.prompt).toContain('You are the Communication Coach agent.')
      expect(passedOptions.prompt).toContain('Help me write an email')
      // agent flag should be cleared (undefined) to avoid passing bad --agent
      expect(passedOptions.agent).toBeUndefined()
    })

    // ── Agent resolution: starter pack by ID ────────────────────────────────

    it('resolves starter pack agent by ID', async () => {
      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        agent: 'research-analyst',
        prompt: 'Find data on topic X',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.prompt).toContain('You are the Research Analyst agent.')
      expect(passedOptions.prompt).toContain('Find data on topic X')
      expect(passedOptions.agent).toBeUndefined()
    })

    it('resolves starter pack agent by name', async () => {
      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        agent: 'Communication Coach',
        prompt: 'Draft message',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.prompt).toContain('You are the Communication Coach agent.')
      expect(passedOptions.agent).toBeUndefined()
    })

    // ── Agent resolution: file-based agent ──────────────────────────────────

    it('resolves file-based agent from agent file on disk', async () => {
      const agentFileContent = '---\nname: Custom Agent\n---\nYou are a custom file-based agent.'
      agentManager.listAgents.mockReturnValue({
        copilot: [{ id: 'copilot:file:custom', filePath: '/agents/custom.agent.md' }],
        claude: [],
      })
      existsSyncMock.mockImplementation((p: string) =>
        p === '/agents/custom.agent.md',
      )
      readFileSyncMock.mockReturnValue(agentFileContent)

      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        agent: 'copilot:file:custom',
        prompt: 'Do something custom',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.prompt).toContain('You are a custom file-based agent.')
      expect(passedOptions.prompt).toContain('Do something custom')
      expect(passedOptions.agent).toBeUndefined()
    })

    it('falls back to starter pack when file-based agent file is missing', async () => {
      // Agent ID format: "copilot:file:communication-coach"
      agentManager.listAgents.mockReturnValue({ copilot: [], claude: [] })
      existsSyncMock.mockReturnValue(false)

      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        agent: 'copilot:file:communication-coach',
        prompt: 'Help me',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      // Should fall back to the starter agent with matching slug
      expect(passedOptions.prompt).toContain('You are the Communication Coach agent.')
      expect(passedOptions.agent).toBeUndefined()
    })

    // ── Agent resolution: agentContext (no user prompt) ─────────────────────

    it('stores agentContext when agent resolved but no user prompt', async () => {
      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        agent: 'communication-coach',
        // No prompt provided
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      // When no prompt, agent system prompt goes to agentContext
      expect(passedOptions.agentContext).toBe('You are the Communication Coach agent.')
      expect(passedOptions.prompt).toBeUndefined()
      expect(passedOptions.agent).toBeUndefined()
    })

    it('stores agentContext when agent resolved and prompt is empty string', async () => {
      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        agent: 'communication-coach',
        prompt: '',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.agentContext).toBe('You are the Communication Coach agent.')
      expect(passedOptions.prompt).toBeUndefined()
    })

    it('stores agentContext when prompt is whitespace-only', async () => {
      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        agent: 'communication-coach',
        prompt: '   ',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.agentContext).toBe('You are the Communication Coach agent.')
      expect(passedOptions.prompt).toBeUndefined()
    })

    // ── Agent resolution: unresolved agent ──────────────────────────────────

    it('clears agent flag when agent ID is unresolved', async () => {
      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        agent: 'completely-unknown-agent-id',
        prompt: 'Hello',
      })

      const passedOptions = cliManager.startSession.mock.calls[0][0]
      expect(passedOptions.agent).toBeUndefined()
      // Prompt should remain unchanged since agent wasn't resolved
      expect(passedOptions.prompt).toBe('Hello')
    })

    // ── No agentManager provided ────────────────────────────────────────────

    it('works without agentManager', async () => {
      vi.clearAllMocks()
      vi.resetModules()
      checkRateLimitMock.mockReturnValue({ allowed: true })
      mockGet.mockReturnValue(undefined)

      const newCliManager = makeMockCLIManager()
      const newIpcMainMock = { handle: vi.fn() }

      const mod = await import('./handlers')
      // Pass undefined for agentManager
      mod.registerIpcHandlers(newIpcMainMock as never, newCliManager as never, undefined)
      const newHandlers = extractHandlers(newIpcMainMock)

      await newHandlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
        agent: 'communication-coach',
        prompt: 'Hello',
      })

      const passedOptions = newCliManager.startSession.mock.calls[0][0]
      // Still resolves via starter pack even without agentManager
      expect(passedOptions.prompt).toContain('You are the Communication Coach agent.')
    })

    it('rate limit check uses correct operation name', async () => {
      await handlers.get('cli:start-session')!(mockEvent, {
        cli: 'copilot',
        mode: 'interactive',
      })

      expect(checkRateLimitMock).toHaveBeenCalledWith('cli:start-session')
    })
  })

  // ── cli:send-input ────────────────────────────────────────────────────────

  describe('cli:send-input', () => {
    it('delegates to cliManager.sendInput', () => {
      handlers.get('cli:send-input')!(mockEvent, { sessionId: 's1', input: 'hello' })
      expect(cliManager.sendInput).toHaveBeenCalledWith('s1', 'hello')
    })
  })

  // ── cli:send-slash-command ────────────────────────────────────────────────

  describe('cli:send-slash-command', () => {
    it('delegates to cliManager.sendSlashCommand', () => {
      handlers.get('cli:send-slash-command')!(mockEvent, { sessionId: 's1', command: '/help' })
      expect(cliManager.sendSlashCommand).toHaveBeenCalledWith('s1', '/help')
    })
  })

  // ── cli:stop-session ──────────────────────────────────────────────────────

  describe('cli:stop-session', () => {
    it('delegates to cliManager.stopSession', async () => {
      await handlers.get('cli:stop-session')!(mockEvent, { sessionId: 's1' })
      expect(cliManager.stopSession).toHaveBeenCalledWith('s1')
    })
  })

  // ── cli:list-sessions ─────────────────────────────────────────────────────

  describe('cli:list-sessions', () => {
    it('delegates to cliManager.listSessions', () => {
      cliManager.listSessions.mockReturnValue([{ id: 's1', cli: 'copilot' }])
      const result = handlers.get('cli:list-sessions')!(mockEvent)
      expect(result).toEqual([{ id: 's1', cli: 'copilot' }])
    })
  })

  // ── cli:get-session ───────────────────────────────────────────────────────

  describe('cli:get-session', () => {
    it('delegates to cliManager.getSession', () => {
      cliManager.getSession.mockReturnValue({ id: 's1', status: 'active' })
      const result = handlers.get('cli:get-session')!(mockEvent, { sessionId: 's1' })
      expect(result).toEqual({ id: 's1', status: 'active' })
    })

    it('returns null for unknown session', () => {
      cliManager.getSession.mockReturnValue(null)
      const result = handlers.get('cli:get-session')!(mockEvent, { sessionId: 'unknown' })
      expect(result).toBeNull()
    })
  })

  // ── cli:get-message-log ───────────────────────────────────────────────────

  describe('cli:get-message-log', () => {
    it('returns in-memory log when available', () => {
      cliManager.getSessionMessageLog.mockReturnValue([
        { type: 'text', content: 'Hello', sender: 'user' },
      ])

      const result = handlers.get('cli:get-message-log')!(mockEvent, { sessionId: 's1' })
      expect(result).toEqual([{ type: 'text', content: 'Hello', sender: 'user' }])
      // Should NOT call getPersistedMessageLog since in-memory returned results
      expect(cliManager.getPersistedMessageLog).not.toHaveBeenCalled()
    })

    it('falls back to persisted log when in-memory is empty', () => {
      cliManager.getSessionMessageLog.mockReturnValue([])
      cliManager.getPersistedMessageLog.mockReturnValue([
        { type: 'text', content: 'Old message', sender: 'ai' },
      ])

      const result = handlers.get('cli:get-message-log')!(mockEvent, { sessionId: 's1' })
      expect(result).toEqual([{ type: 'text', content: 'Old message', sender: 'ai' }])
      expect(cliManager.getPersistedMessageLog).toHaveBeenCalledWith('s1')
    })
  })

  // ── cli:get-persisted-sessions ────────────────────────────────────────────

  describe('cli:get-persisted-sessions', () => {
    it('delegates to cliManager.getPersistedSessions', () => {
      const sessions = [{ sessionId: 's1', cli: 'copilot', startedAt: 1000 }]
      cliManager.getPersistedSessions.mockReturnValue(sessions)

      const result = handlers.get('cli:get-persisted-sessions')!(mockEvent)
      expect(result).toEqual(sessions)
    })
  })

  // ── cli:delete-session ────────────────────────────────────────────────────

  describe('cli:delete-session', () => {
    it('delegates to cliManager.deletePersistedSession', () => {
      handlers.get('cli:delete-session')!(mockEvent, { sessionId: 's1' })
      expect(cliManager.deletePersistedSession).toHaveBeenCalledWith('s1')
    })
  })

  // ── cli:delete-sessions ───────────────────────────────────────────────────

  describe('cli:delete-sessions', () => {
    it('delegates to cliManager.deletePersistedSessions', () => {
      handlers.get('cli:delete-sessions')!(mockEvent, { sessionIds: ['s1', 's2'] })
      expect(cliManager.deletePersistedSessions).toHaveBeenCalledWith(['s1', 's2'])
    })
  })

  // ── cli:archive-session ───────────────────────────────────────────────────

  describe('cli:archive-session', () => {
    it('archives a session', () => {
      handlers.get('cli:archive-session')!(mockEvent, { sessionId: 's1', archived: true })
      expect(cliManager.archivePersistedSession).toHaveBeenCalledWith('s1', true)
    })

    it('unarchives a session', () => {
      handlers.get('cli:archive-session')!(mockEvent, { sessionId: 's1', archived: false })
      expect(cliManager.archivePersistedSession).toHaveBeenCalledWith('s1', false)
    })
  })

  // ── cli:rename-session ────────────────────────────────────────────────────

  describe('cli:rename-session', () => {
    it('delegates to cliManager.renamePersistedSession', () => {
      handlers.get('cli:rename-session')!(mockEvent, { sessionId: 's1', name: 'New Name' })
      expect(cliManager.renamePersistedSession).toHaveBeenCalledWith('s1', 'New Name')
    })
  })

  // ── cli:search-sessions ───────────────────────────────────────────────────

  describe('cli:search-sessions', () => {
    it('delegates to cliManager.searchSessions with text search', () => {
      cliManager.searchSessions.mockReturnValue([{
        sessionId: 's1',
        matches: [{ content: 'hello world', sender: 'user', lineIndex: 0 }],
      }])

      const result = handlers.get('cli:search-sessions')!(mockEvent, {
        query: 'hello',
      })

      expect(cliManager.searchSessions).toHaveBeenCalledWith('hello', false)
      expect(result).toHaveLength(1)
    })

    it('passes useRegex flag when provided', () => {
      handlers.get('cli:search-sessions')!(mockEvent, {
        query: 'hello.*world',
        useRegex: true,
      })

      expect(cliManager.searchSessions).toHaveBeenCalledWith('hello.*world', true)
    })

    it('defaults useRegex to false when not provided', () => {
      handlers.get('cli:search-sessions')!(mockEvent, {
        query: 'test',
      })

      expect(cliManager.searchSessions).toHaveBeenCalledWith('test', false)
    })
  })

  // ── app:get-cwd ───────────────────────────────────────────────────────────

  describe('app:get-cwd', () => {
    it('returns process.cwd()', () => {
      const result = handlers.get('app:get-cwd')!(mockEvent)
      expect(result).toBe(process.cwd())
    })
  })
})
