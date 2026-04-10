import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { addAuditEntryMock, mockStoreConstructor, mockGet, mockSet } = vi.hoisted(() => ({
  addAuditEntryMock: vi.fn(),
  mockStoreConstructor: vi.fn(),
  mockGet: vi.fn().mockReturnValue([]),
  mockSet: vi.fn(),
}))

// Mock electron-store (needed by complianceHandlers transitive import)
vi.mock('electron-store', () => ({
  default: class MockStore {
    constructor(...args: unknown[]) { mockStoreConstructor(...args) }
    get = mockGet
    set = mockSet
    has = vi.fn()
    delete = vi.fn()
  },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('./complianceHandlers', () => ({
  addAuditEntry: addAuditEntryMock,
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockIpcMain() {
  return {
    handle: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
  }
}

function getHandler(ipcMain: ReturnType<typeof createMockIpcMain>, channel: string) {
  const call = ipcMain.handle.mock.calls.find(
    (c: unknown[]) => c[0] === channel,
  )
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

interface AgentDef {
  id: string
  name: string
  description: string
  cli: 'copilot' | 'claude'
  source: 'builtin' | 'file'
  filePath?: string
  model?: string
  tools?: string[]
  prompt?: string
}

interface MockAgentManager {
  listAgents: ReturnType<typeof vi.fn>
  createAgent: ReturnType<typeof vi.fn>
  readAgentFile: ReturnType<typeof vi.fn>
  writeAgentFile: ReturnType<typeof vi.fn>
  deleteAgent: ReturnType<typeof vi.fn>
  getEnabledAgentIds: ReturnType<typeof vi.fn>
  setEnabledAgentIds: ReturnType<typeof vi.fn>
  getActiveAgents: ReturnType<typeof vi.fn>
  setActiveAgent: ReturnType<typeof vi.fn>
  getProfiles: ReturnType<typeof vi.fn>
  saveProfile: ReturnType<typeof vi.fn>
  applyProfile: ReturnType<typeof vi.fn>
  deleteProfile: ReturnType<typeof vi.fn>
}

function createMockAgentManager(): MockAgentManager {
  return {
    listAgents: vi.fn().mockReturnValue([]),
    createAgent: vi.fn().mockReturnValue({ id: 'new-agent', name: 'Test Agent' }),
    readAgentFile: vi.fn().mockReturnValue('# Agent\nPrompt here'),
    writeAgentFile: vi.fn(),
    deleteAgent: vi.fn(),
    getEnabledAgentIds: vi.fn().mockReturnValue([]),
    setEnabledAgentIds: vi.fn(),
    getActiveAgents: vi.fn().mockReturnValue({ copilot: null, claude: null }),
    setActiveAgent: vi.fn(),
    getProfiles: vi.fn().mockReturnValue([]),
    saveProfile: vi.fn().mockReturnValue({ id: 'profile-1', name: 'Default' }),
    applyProfile: vi.fn().mockReturnValue(['agent-1', 'agent-2']),
    deleteProfile: vi.fn(),
  }
}

const mockEvent = {} as unknown

// ── Tests ───────────────────────────────────────────────────────────────────

describe('agentHandlers', () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>
  let agentManager: MockAgentManager

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    ipcMain = createMockIpcMain()
    agentManager = createMockAgentManager()

    const { registerAgentHandlers } = await import('./agentHandlers')
    registerAgentHandlers(ipcMain as never, agentManager as never)
  })

  // ── Registration ──────────────────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC channels', () => {
      const registeredChannels = ipcMain.handle.mock.calls.map(
        (c: unknown[]) => c[0],
      )
      const expectedChannels = [
        'agent:list',
        'agent:create',
        'agent:read-file',
        'agent:write-file',
        'agent:delete',
        'agent:get-enabled',
        'agent:set-enabled',
        'agent:get-active',
        'agent:set-active',
        'agent:get-profiles',
        'agent:save-profile',
        'agent:apply-profile',
        'agent:delete-profile',
      ]
      for (const ch of expectedChannels) {
        expect(registeredChannels).toContain(ch)
      }
    })

    it('registers exactly 13 handlers', () => {
      expect(ipcMain.handle).toHaveBeenCalledTimes(13)
    })
  })

  // ── agent:list ────────────────────────────────────────────────────────────

  describe('agent:list', () => {
    it('lists agents with no workingDir', () => {
      const agents: AgentDef[] = [
        { id: 'a1', name: 'Explore', description: 'Built-in', cli: 'copilot', source: 'builtin' },
      ]
      agentManager.listAgents.mockReturnValue(agents)

      const handler = getHandler(ipcMain, 'agent:list')
      const result = handler(mockEvent, {})

      expect(agentManager.listAgents).toHaveBeenCalledWith(undefined)
      expect(result).toEqual(agents)
    })

    it('lists agents for a specific workingDir', () => {
      agentManager.listAgents.mockReturnValue([])

      const handler = getHandler(ipcMain, 'agent:list')
      handler(mockEvent, { workingDir: '/my/project' })

      expect(agentManager.listAgents).toHaveBeenCalledWith('/my/project')
    })

    it('handles missing args by defaulting to empty object', () => {
      const handler = getHandler(ipcMain, 'agent:list')
      handler(mockEvent)

      expect(agentManager.listAgents).toHaveBeenCalledWith(undefined)
    })
  })

  // ── agent:create ──────────────────────────────────────────────────────────

  describe('agent:create', () => {
    it('creates a new agent and returns the definition', () => {
      const newDef = { name: 'My Agent', description: 'Test', cli: 'copilot' as const }
      const created = { id: 'generated-id', ...newDef, source: 'file', filePath: '/agents/my-agent.md' }
      agentManager.createAgent.mockReturnValue(created)

      const handler = getHandler(ipcMain, 'agent:create')
      const result = handler(mockEvent, { def: newDef, workingDir: '/project' })

      expect(agentManager.createAgent).toHaveBeenCalledWith(newDef, '/project')
      expect(result).toEqual(created)
    })

    it('creates agent without workingDir', () => {
      const handler = getHandler(ipcMain, 'agent:create')
      handler(mockEvent, { def: { name: 'Agent', description: '', cli: 'claude' } })

      expect(agentManager.createAgent).toHaveBeenCalledWith(
        { name: 'Agent', description: '', cli: 'claude' },
        undefined,
      )
    })
  })

  // ── agent:read-file ───────────────────────────────────────────────────────

  describe('agent:read-file', () => {
    it('reads an agent file by path', () => {
      agentManager.readAgentFile.mockReturnValue('---\nname: Test\n---\nPrompt')

      const handler = getHandler(ipcMain, 'agent:read-file')
      const result = handler(mockEvent, { filePath: '/agents/test.md' })

      expect(agentManager.readAgentFile).toHaveBeenCalledWith('/agents/test.md')
      expect(result).toBe('---\nname: Test\n---\nPrompt')
    })

    it('propagates errors from readAgentFile', () => {
      agentManager.readAgentFile.mockImplementation(() => {
        throw new Error('File not found')
      })

      const handler = getHandler(ipcMain, 'agent:read-file')
      expect(() => handler(mockEvent, { filePath: '/nonexistent.md' })).toThrow('File not found')
    })
  })

  // ── agent:write-file ──────────────────────────────────────────────────────

  describe('agent:write-file', () => {
    it('writes content to an agent file', () => {
      const handler = getHandler(ipcMain, 'agent:write-file')
      handler(mockEvent, { filePath: '/agents/test.md', content: '# Updated\nNew content' })

      expect(agentManager.writeAgentFile).toHaveBeenCalledWith(
        '/agents/test.md',
        '# Updated\nNew content',
      )
    })

    it('returns undefined (no return value)', () => {
      const handler = getHandler(ipcMain, 'agent:write-file')
      const result = handler(mockEvent, { filePath: '/agents/test.md', content: 'x' })

      expect(result).toBeUndefined()
    })
  })

  // ── agent:delete ──────────────────────────────────────────────────────────

  describe('agent:delete', () => {
    it('deletes an agent and creates an audit entry', () => {
      const handler = getHandler(ipcMain, 'agent:delete')
      handler(mockEvent, { filePath: '/project/.agents/my-agent.md' })

      expect(agentManager.deleteAgent).toHaveBeenCalledWith('/project/.agents/my-agent.md')
      expect(addAuditEntryMock).toHaveBeenCalledTimes(1)
      expect(addAuditEntryMock).toHaveBeenCalledWith({
        actionType: 'config-change',
        summary: 'Agent deleted: my-agent.md',
        details: JSON.stringify({ filePath: '/project/.agents/my-agent.md' }),
      })
    })

    it('extracts filename from path for audit summary', () => {
      const handler = getHandler(ipcMain, 'agent:delete')
      handler(mockEvent, { filePath: '/deep/nested/path/agent-x.md' })

      expect(addAuditEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({ summary: 'Agent deleted: agent-x.md' }),
      )
    })

    it('returns undefined (fire-and-forget)', () => {
      const handler = getHandler(ipcMain, 'agent:delete')
      const result = handler(mockEvent, { filePath: '/agents/test.md' })

      expect(result).toBeUndefined()
    })
  })

  // ── agent:get-enabled ─────────────────────────────────────────────────────

  describe('agent:get-enabled', () => {
    it('returns the list of enabled agent IDs', () => {
      agentManager.getEnabledAgentIds.mockReturnValue(['a1', 'a2', 'a3'])

      const handler = getHandler(ipcMain, 'agent:get-enabled')
      const result = handler()

      expect(agentManager.getEnabledAgentIds).toHaveBeenCalledTimes(1)
      expect(result).toEqual(['a1', 'a2', 'a3'])
    })

    it('returns empty array when none enabled', () => {
      agentManager.getEnabledAgentIds.mockReturnValue([])

      const handler = getHandler(ipcMain, 'agent:get-enabled')
      expect(handler()).toEqual([])
    })
  })

  // ── agent:set-enabled ─────────────────────────────────────────────────────

  describe('agent:set-enabled', () => {
    it('sets the enabled agent IDs', () => {
      const handler = getHandler(ipcMain, 'agent:set-enabled')
      handler(mockEvent, { ids: ['agent-1', 'agent-3'] })

      expect(agentManager.setEnabledAgentIds).toHaveBeenCalledWith(['agent-1', 'agent-3'])
    })

    it('can set to empty array (disable all)', () => {
      const handler = getHandler(ipcMain, 'agent:set-enabled')
      handler(mockEvent, { ids: [] })

      expect(agentManager.setEnabledAgentIds).toHaveBeenCalledWith([])
    })

    it('returns undefined (fire-and-forget)', () => {
      const handler = getHandler(ipcMain, 'agent:set-enabled')
      const result = handler(mockEvent, { ids: ['a1'] })

      expect(result).toBeUndefined()
    })
  })

  // ── agent:get-active ──────────────────────────────────────────────────────

  describe('agent:get-active', () => {
    it('returns active agents for both CLIs', () => {
      agentManager.getActiveAgents.mockReturnValue({ copilot: 'explore', claude: null })

      const handler = getHandler(ipcMain, 'agent:get-active')
      const result = handler()

      expect(result).toEqual({ copilot: 'explore', claude: null })
    })
  })

  // ── agent:set-active ──────────────────────────────────────────────────────

  describe('agent:set-active', () => {
    it('sets active agent for copilot', () => {
      const handler = getHandler(ipcMain, 'agent:set-active')
      handler(mockEvent, { cli: 'copilot', agentId: 'explore' })

      expect(agentManager.setActiveAgent).toHaveBeenCalledWith('copilot', 'explore')
    })

    it('clears active agent with null', () => {
      const handler = getHandler(ipcMain, 'agent:set-active')
      handler(mockEvent, { cli: 'claude', agentId: null })

      expect(agentManager.setActiveAgent).toHaveBeenCalledWith('claude', null)
    })
  })

  // ── agent:get-profiles ───────────────────────────────────────────────────

  describe('agent:get-profiles', () => {
    it('returns all agent profiles', () => {
      const profiles = [
        { id: 'p1', name: 'Default', enabledAgentIds: ['a1'] },
        { id: 'p2', name: 'Minimal', enabledAgentIds: [] },
      ]
      agentManager.getProfiles.mockReturnValue(profiles)

      const handler = getHandler(ipcMain, 'agent:get-profiles')
      const result = handler()

      expect(agentManager.getProfiles).toHaveBeenCalledTimes(1)
      expect(result).toEqual(profiles)
    })
  })

  // ── agent:save-profile ───────────────────────────────────────────────────

  describe('agent:save-profile', () => {
    it('saves a new agent profile', () => {
      const saved = { id: 'new-p', name: 'My Profile', enabledAgentIds: ['a1', 'a2'] }
      agentManager.saveProfile.mockReturnValue(saved)

      const handler = getHandler(ipcMain, 'agent:save-profile')
      const result = handler(mockEvent, { name: 'My Profile', enabledAgentIds: ['a1', 'a2'] })

      expect(agentManager.saveProfile).toHaveBeenCalledWith('My Profile', ['a1', 'a2'])
      expect(result).toEqual(saved)
    })
  })

  // ── agent:apply-profile ──────────────────────────────────────────────────

  describe('agent:apply-profile', () => {
    it('applies a profile by ID and returns result', () => {
      agentManager.applyProfile.mockReturnValue(['a1', 'a3'])

      const handler = getHandler(ipcMain, 'agent:apply-profile')
      const result = handler(mockEvent, { profileId: 'p1' })

      expect(agentManager.applyProfile).toHaveBeenCalledWith('p1')
      expect(result).toEqual(['a1', 'a3'])
    })
  })

  // ── agent:delete-profile ─────────────────────────────────────────────────

  describe('agent:delete-profile', () => {
    it('deletes a profile by ID', () => {
      const handler = getHandler(ipcMain, 'agent:delete-profile')
      handler(mockEvent, { profileId: 'p1' })

      expect(agentManager.deleteProfile).toHaveBeenCalledWith('p1')
    })

    it('returns undefined (fire-and-forget)', () => {
      const handler = getHandler(ipcMain, 'agent:delete-profile')
      const result = handler(mockEvent, { profileId: 'p1' })

      expect(result).toBeUndefined()
    })
  })
})
