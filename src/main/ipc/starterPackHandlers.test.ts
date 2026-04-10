import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { checkForHandoffMock, buildHandoffContextMock, getAgentSystemPromptMock } = vi.hoisted(() => ({
  checkForHandoffMock: vi.fn().mockReturnValue(null),
  buildHandoffContextMock: vi.fn().mockReturnValue({ summary: 'test' }),
  getAgentSystemPromptMock: vi.fn().mockReturnValue('system prompt'),
}))

vi.mock('../starter-pack', () => ({
  STARTER_AGENTS: [
    { id: 'agent-1', name: 'Agent 1', category: 'spotlight', description: 'Spotlight agent' },
    { id: 'agent-2', name: 'Agent 2', category: 'workflow', description: 'Workflow agent' },
  ],
  STARTER_SKILLS: [
    { id: 'skill-1', name: 'Skill 1' },
  ],
  STARTER_MEMORIES: [
    { id: 'work-profile', name: 'Work Profile', fields: [] },
    { id: 'communication-preferences', name: 'Communication', fields: [] },
    { id: 'current-priorities', name: 'Priorities', fields: [] },
    { id: 'working-preferences', name: 'Working Prefs', fields: [] },
    { id: 'stakeholder-map', name: 'Stakeholder Map', fields: [] },
  ],
  STARTER_PROMPTS: [
    { id: 'prompt-1', text: 'Hello', category: 'spotlight' },
    { id: 'prompt-2', text: 'Advanced', category: 'workflow' },
  ],
  AgentHandoffService: class MockHandoffService {
    checkForHandoff = checkForHandoffMock
    buildHandoffContext = buildHandoffContextMock
    getAgentSystemPrompt = getAgentSystemPromptMock
  },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-key',
}))

// ── Store mock ──────────────────────────────────────────────────────────────

const STORE_KEY = '__starterPackTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__starterPackTestStoreData'] as Record<string, unknown>
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeData = (globalThis as any)[STORE_KEY] as Record<string, unknown>

import { ipcMain } from 'electron'

// ── Helpers ─────────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => unknown
function getHandler(channel: string): HandlerFn {
  const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c: unknown[]) => c[0] === channel,
  )
  if (calls.length === 0) throw new Error(`No handler registered for channel: ${channel}`)
  return calls[calls.length - 1][1] as HandlerFn
}

const mockEvent = {} as Electron.IpcMainInvokeEvent

// ── Tests ───────────────────────────────────────────────────────────────────

describe('starterPackHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()

    // Module-level singleton (handoffService + store) requires fresh import
    vi.resetModules()
    const mod = await import('./starterPackHandlers')
    mod.registerStarterPackHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('starter-pack:get-agents')
    expect(channels).toContain('starter-pack:get-agent')
    expect(channels).toContain('starter-pack:get-visible-agents')
    expect(channels).toContain('starter-pack:get-skills')
    expect(channels).toContain('starter-pack:get-skill')
    expect(channels).toContain('starter-pack:get-memories')
    expect(channels).toContain('starter-pack:get-memory')
    expect(channels).toContain('starter-pack:get-memory-data')
    expect(channels).toContain('starter-pack:save-memory-data')
    expect(channels).toContain('starter-pack:get-prompts')
    expect(channels).toContain('starter-pack:get-all-prompts')
    expect(channels).toContain('starter-pack:get-setup-state')
    expect(channels).toContain('starter-pack:record-interaction')
    expect(channels).toContain('starter-pack:dismiss-memory-prompt')
    expect(channels).toContain('starter-pack:should-prompt-memory')
    expect(channels).toContain('starter-pack:check-handoff')
    expect(channels).toContain('starter-pack:build-handoff-context')
    expect(channels).toContain('starter-pack:get-agent-prompt')
  })

  describe('starter-pack:get-agents', () => {
    it('returns all starter agents', () => {
      const handler = getHandler('starter-pack:get-agents')
      const result = handler(mockEvent) as Array<{ id: string }>
      expect(result).toHaveLength(2)
    })
  })

  describe('starter-pack:get-agent', () => {
    it('returns matching agent', () => {
      const handler = getHandler('starter-pack:get-agent')
      const result = handler(mockEvent, { id: 'agent-1' }) as { id: string; name: string }
      expect(result.name).toBe('Agent 1')
    })

    it('returns null for unknown agent', () => {
      const handler = getHandler('starter-pack:get-agent')
      const result = handler(mockEvent, { id: 'nonexistent' })
      expect(result).toBeNull()
    })
  })

  describe('starter-pack:get-visible-agents', () => {
    it('returns only spotlight agents before first interaction', () => {
      const handler = getHandler('starter-pack:get-visible-agents')
      const result = handler(mockEvent) as Array<{ category: string }>
      expect(result.every((a) => a.category === 'spotlight')).toBe(true)
    })

    it('returns all agents after first interaction', () => {
      const recordHandler = getHandler('starter-pack:record-interaction')
      recordHandler(mockEvent)

      const handler = getHandler('starter-pack:get-visible-agents')
      const result = handler(mockEvent) as Array<{ id: string }>
      expect(result).toHaveLength(2)
    })
  })

  describe('starter-pack:get-skills', () => {
    it('returns all starter skills', () => {
      const handler = getHandler('starter-pack:get-skills')
      const result = handler(mockEvent) as Array<{ id: string }>
      expect(result).toHaveLength(1)
    })
  })

  describe('starter-pack:get-memories', () => {
    it('returns all memory definitions', () => {
      const handler = getHandler('starter-pack:get-memories')
      const result = handler(mockEvent) as Array<{ id: string }>
      expect(result.length).toBe(5)
    })
  })

  describe('starter-pack:get-memory-data', () => {
    it('returns null for unsaved memory', () => {
      const handler = getHandler('starter-pack:get-memory-data')
      const result = handler(mockEvent, { id: 'work-profile' })
      expect(result).toBeNull()
    })
  })

  describe('starter-pack:save-memory-data', () => {
    it('saves memory data and updates setup state', () => {
      const handler = getHandler('starter-pack:save-memory-data')
      const result = handler(mockEvent, { id: 'work-profile', data: { role: 'Engineer' } }) as { success: boolean }
      expect(result.success).toBe(true)

      // Verify data saved
      const getData = getHandler('starter-pack:get-memory-data')
      const data = getData(mockEvent, { id: 'work-profile' }) as { role: string }
      expect(data.role).toBe('Engineer')

      // Verify setup state updated
      const getState = getHandler('starter-pack:get-setup-state')
      const state = getState(mockEvent) as { workProfileComplete: boolean }
      expect(state.workProfileComplete).toBe(true)
    })

    it('tracks stakeholder map entries count', () => {
      const handler = getHandler('starter-pack:save-memory-data')
      handler(mockEvent, { id: 'stakeholder-map', data: { entries: [{ name: 'A' }, { name: 'B' }] } })

      const getState = getHandler('starter-pack:get-setup-state')
      const state = getState(mockEvent) as { stakeholderMapEntries: number }
      expect(state.stakeholderMapEntries).toBe(2)
    })
  })

  describe('starter-pack:get-prompts', () => {
    it('returns only spotlight prompts before first interaction', () => {
      const handler = getHandler('starter-pack:get-prompts')
      const result = handler(mockEvent) as Array<{ category: string }>
      expect(result.every((p) => p.category === 'spotlight')).toBe(true)
    })

    it('returns all prompts after first interaction', () => {
      const recordHandler = getHandler('starter-pack:record-interaction')
      recordHandler(mockEvent)

      const handler = getHandler('starter-pack:get-prompts')
      const result = handler(mockEvent) as Array<{ id: string }>
      expect(result).toHaveLength(2)
    })
  })

  describe('starter-pack:record-interaction', () => {
    it('increments interaction count and sets first interaction flag', () => {
      const handler = getHandler('starter-pack:record-interaction')
      const result = handler(mockEvent) as { interactionCount: number; hasCompletedFirstInteraction: boolean }
      expect(result.interactionCount).toBe(1)
      expect(result.hasCompletedFirstInteraction).toBe(true)
    })
  })

  describe('starter-pack:dismiss-memory-prompt', () => {
    it('increments dismiss count for communication preferences', () => {
      const handler = getHandler('starter-pack:dismiss-memory-prompt')
      handler(mockEvent, { memoryId: 'communication-preferences' })

      const getState = getHandler('starter-pack:get-setup-state')
      const state = getState(mockEvent) as { communicationPreferencesDismissCount: number; communicationPreferencesPrompted: boolean }
      expect(state.communicationPreferencesDismissCount).toBe(1)
      expect(state.communicationPreferencesPrompted).toBe(true)
    })
  })

  describe('starter-pack:should-prompt-memory', () => {
    it('does not prompt communication-preferences before first interaction', () => {
      const handler = getHandler('starter-pack:should-prompt-memory')
      const result = handler(mockEvent, { memoryId: 'communication-preferences' })
      expect(result).toBe(false)
    })

    it('prompts communication-preferences after first interaction', () => {
      const recordHandler = getHandler('starter-pack:record-interaction')
      recordHandler(mockEvent)

      const handler = getHandler('starter-pack:should-prompt-memory')
      const result = handler(mockEvent, { memoryId: 'communication-preferences' })
      expect(result).toBe(true)
    })

    it('stops prompting after 2 dismissals', () => {
      const recordHandler = getHandler('starter-pack:record-interaction')
      recordHandler(mockEvent)

      const dismissHandler = getHandler('starter-pack:dismiss-memory-prompt')
      dismissHandler(mockEvent, { memoryId: 'communication-preferences' })
      dismissHandler(mockEvent, { memoryId: 'communication-preferences' })

      const handler = getHandler('starter-pack:should-prompt-memory')
      const result = handler(mockEvent, { memoryId: 'communication-preferences' })
      expect(result).toBe(false)
    })

    it('does not prompt current-priorities until 3rd interaction', () => {
      const recordHandler = getHandler('starter-pack:record-interaction')
      recordHandler(mockEvent) // 1st
      recordHandler(mockEvent) // 2nd

      const handler = getHandler('starter-pack:should-prompt-memory')
      expect(handler(mockEvent, { memoryId: 'current-priorities' })).toBe(false)

      recordHandler(mockEvent) // 3rd
      expect(handler(mockEvent, { memoryId: 'current-priorities' })).toBe(true)
    })
  })

  describe('starter-pack:check-handoff', () => {
    it('delegates to handoff service', () => {
      const handler = getHandler('starter-pack:check-handoff')
      handler(mockEvent, { currentAgentId: 'a1', responseContent: 'test', userRequest: 'do stuff' })
      expect(checkForHandoffMock).toHaveBeenCalledWith('a1', 'test', 'do stuff')
    })
  })

  describe('starter-pack:build-handoff-context', () => {
    it('delegates to handoff service', () => {
      const handler = getHandler('starter-pack:build-handoff-context')
      handler(mockEvent, {
        fromAgentId: 'a1', toAgentId: 'a2',
        previousOutput: 'output', originalRequest: 'request', reason: 'better fit',
      })
      expect(buildHandoffContextMock).toHaveBeenCalledWith('a1', 'a2', 'output', 'request', 'better fit')
    })
  })

  describe('starter-pack:get-agent-prompt', () => {
    it('delegates to handoff service', () => {
      const handler = getHandler('starter-pack:get-agent-prompt')
      handler(mockEvent, { agentId: 'a1' })
      expect(getAgentSystemPromptMock).toHaveBeenCalledWith('a1', undefined)
    })
  })
})
