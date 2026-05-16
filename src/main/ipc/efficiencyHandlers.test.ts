import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => undefined,
}))

import type { IpcMain } from 'electron'
import { registerEfficiencyHandlers, type EfficiencyCostRecord } from './efficiencyHandlers'
import type { BackendId } from '../../shared/backends'

/** Lightweight IpcMain mock that records registered handlers and lets tests invoke them. */
function mockIpc(): {
  ipc: IpcMain
  invoke: (channel: string, args?: unknown) => Promise<unknown>
} {
  const handlers = new Map<string, (e: unknown, args?: unknown) => unknown>()
  const ipc = {
    handle: (channel: string, fn: (e: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, fn)
    },
  } as unknown as IpcMain
  return {
    ipc,
    invoke: async (channel: string, args?: unknown) => {
      const fn = handlers.get(channel)
      if (!fn) throw new Error(`No handler registered for ${channel}`)
      return await fn({}, args)
    },
  }
}

// Local alias just for readability — same shape as the exported handler type.
type CostRecordFixture = EfficiencyCostRecord

interface MessageLogEntry {
  type: string
  content: string
  sender?: 'user' | 'ai' | 'system'
  attachedNotes?: Array<{ id: string; title: string }>
  attachedAgent?: { id: string; name: string }
}

interface SessionFixture {
  sessionId: string
  cli: BackendId
  name?: string
  startedAt: number
  messageLog: MessageLogEntry[]
}

const NOW = 1_700_000_000_000

function rec(over: Partial<CostRecordFixture> = {}): CostRecordFixture {
  return {
    id: 'r1',
    sessionId: 's1',
    sessionName: 'Test',
    cli: 'copilot-cli',
    model: 'claude-sonnet-4.5',
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    estimatedCostUsd: 0.01,
    promptCount: 1,
    timestamp: NOW,
    ...over,
  }
}

function sess(over: Partial<SessionFixture> = {}): SessionFixture {
  return {
    sessionId: 's1',
    cli: 'copilot-cli',
    name: 'Test',
    startedAt: NOW,
    messageLog: [],
    ...over,
  }
}

describe('efficiencyHandlers — efficiency:where-did-tokens-go', () => {
  it('returns zero breakdown when no records', async () => {
    const { ipc, invoke } = mockIpc()
    registerEfficiencyHandlers(ipc, { loadRecords: () => [], loadSessions: () => [] })
    const result = await invoke('efficiency:where-did-tokens-go') as { total: number; recordCount: number }
    expect(result.recordCount).toBe(0)
    expect(result.total).toBe(0)
  })

  it('sums per-slice tokens across records in the window', async () => {
    const { ipc, invoke } = mockIpc()
    const records = [
      rec({
        timestamp: NOW,
        inputTokens: 1000, outputTokens: 200, totalTokens: 1200,
        userPromptTokens: 100, agentPromptTokens: 500, notesTokens: 400, contextSourcesTokens: 0,
        cachedInputTokens: 50,
      }),
      rec({
        id: 'r2', sessionId: 's2',
        timestamp: NOW,
        inputTokens: 800, outputTokens: 100, totalTokens: 900,
        userPromptTokens: 50, agentPromptTokens: 500, notesTokens: 250, contextSourcesTokens: 0,
        cachedInputTokens: 100,
      }),
    ]
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => [] })
    const result = await invoke('efficiency:where-did-tokens-go', { since: 0 }) as {
      user: number; agent: number; notes: number; contextSources: number; cached: number; output: number; total: number
    }
    expect(result.user).toBe(150)
    expect(result.agent).toBe(1000)
    expect(result.notes).toBe(650)
    expect(result.contextSources).toBe(0)
    expect(result.cached).toBe(150)
    expect(result.output).toBe(300)
    expect(result.total).toBe(150 + 1000 + 650 + 0 + 150 + 300)
  })

  it('filters by since (default 7 days)', async () => {
    const { ipc, invoke } = mockIpc()
    const TWO_WEEKS_AGO = NOW - 14 * 24 * 60 * 60 * 1000
    const records = [
      rec({ timestamp: NOW, userPromptTokens: 100, agentPromptTokens: 0, notesTokens: 0, contextSourcesTokens: 0 }),
      rec({ id: 'old', timestamp: TWO_WEEKS_AGO, userPromptTokens: 5000 }),  // outside default window
    ]
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => [] })
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const result = await invoke('efficiency:where-did-tokens-go') as { user: number; recordCount: number }
    vi.restoreAllMocks()
    expect(result.recordCount).toBe(1)
    expect(result.user).toBe(100)
  })

  it('attributes the full input to user when slice fields are absent (legacy rows)', async () => {
    const { ipc, invoke } = mockIpc()
    const records = [
      rec({ timestamp: NOW, inputTokens: 1000, outputTokens: 200 }),  // no slice fields
    ]
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => [] })
    const result = await invoke('efficiency:where-did-tokens-go', { since: 0 }) as {
      user: number; agent: number; notes: number; output: number
    }
    expect(result.user).toBe(1000)
    expect(result.agent).toBe(0)
    expect(result.notes).toBe(0)
    expect(result.output).toBe(200)
  })
})

describe('efficiencyHandlers — efficiency:top-context-bloat', () => {
  it('returns empty when no sessions / records', async () => {
    const { ipc, invoke } = mockIpc()
    registerEfficiencyHandlers(ipc, { loadRecords: () => [], loadSessions: () => [] })
    const result = await invoke('efficiency:top-context-bloat', { since: 0 }) as unknown[]
    expect(result).toEqual([])
  })

  it('aggregates notes attached across multiple sessions, sorted by tokens desc', async () => {
    const { ipc, invoke } = mockIpc()
    const records = [
      rec({ sessionId: 'sA', timestamp: NOW, notesTokens: 1000, inputTokens: 1500, totalTokens: 2000 }),
      rec({ id: 'r2', sessionId: 'sB', timestamp: NOW, notesTokens: 500, inputTokens: 800, totalTokens: 1000 }),
    ]
    const sessions = [
      sess({
        sessionId: 'sA',
        messageLog: [
          { type: 'text', content: 'q', sender: 'user', attachedNotes: [{ id: 'note1', title: 'Big note' }] },
        ],
      }),
      sess({
        sessionId: 'sB',
        messageLog: [
          { type: 'text', content: 'q', sender: 'user', attachedNotes: [{ id: 'note1', title: 'Big note' }, { id: 'note2', title: 'Small note' }] },
        ],
      }),
    ]
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => sessions })
    const result = await invoke('efficiency:top-context-bloat', { since: 0 }) as Array<{
      kind: string; id: string; title: string; sessions: number; totalTokens: number; avgTokens: number
    }>
    // note1: 1000 (sA) + 250 (half of sB's 500) = 1250
    // note2: 250 (other half of sB's 500) = 250
    expect(result.length).toBe(2)
    expect(result[0].id).toBe('note1')
    expect(result[0].sessions).toBe(2)
    expect(result[0].totalTokens).toBe(1250)
    expect(result[1].id).toBe('note2')
  })

  it('respects the limit parameter', async () => {
    const { ipc, invoke } = mockIpc()
    const records: ReturnType<typeof rec>[] = []
    const sessions: ReturnType<typeof sess>[] = []
    for (let i = 0; i < 15; i++) {
      records.push(rec({ id: `r${i}`, sessionId: `s${i}`, timestamp: NOW, notesTokens: 1000, inputTokens: 1500, totalTokens: 2000 }))
      sessions.push(sess({
        sessionId: `s${i}`,
        messageLog: [{ type: 'text', content: 'q', attachedNotes: [{ id: `note${i}`, title: `N${i}` }] }],
      }))
    }
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => sessions })
    const result = await invoke('efficiency:top-context-bloat', { since: 0, limit: 5 }) as unknown[]
    expect(result.length).toBe(5)
  })

  it('includes agents (when attachedAgent is present in the session log)', async () => {
    const { ipc, invoke } = mockIpc()
    const records = [
      rec({ sessionId: 'sA', timestamp: NOW, agentPromptTokens: 2000, inputTokens: 2500, totalTokens: 3000 }),
    ]
    const sessions = [
      sess({
        sessionId: 'sA',
        messageLog: [
          { type: 'text', content: 'q', sender: 'user', attachedAgent: { id: 'coach', name: 'Coach' } },
        ],
      }),
    ]
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => sessions })
    const result = await invoke('efficiency:top-context-bloat', { since: 0 }) as Array<{
      kind: string; id: string; title: string
    }>
    expect(result.length).toBe(1)
    expect(result[0].kind).toBe('agent')
    expect(result[0].id).toBe('coach')
    expect(result[0].title).toBe('Coach')
  })

  it('drops entries with zero token contribution (no notes_tokens on the row)', async () => {
    const { ipc, invoke } = mockIpc()
    const records = [
      rec({ sessionId: 'sA', timestamp: NOW, notesTokens: 0, inputTokens: 500, totalTokens: 800 }),
    ]
    const sessions = [
      sess({
        sessionId: 'sA',
        messageLog: [{ type: 'text', content: 'q', attachedNotes: [{ id: 'ghost', title: 'No tokens' }] }],
      }),
    ]
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => sessions })
    const result = await invoke('efficiency:top-context-bloat', { since: 0 }) as unknown[]
    expect(result).toEqual([])
  })
})

describe('efficiencyHandlers — efficiency:savings-suggestions', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  it('returns empty when no records', async () => {
    const { ipc, invoke } = mockIpc()
    registerEfficiencyHandlers(ipc, { loadRecords: () => [], loadSessions: () => [] })
    const result = await invoke('efficiency:savings-suggestions', { since: 0 }) as unknown[]
    expect(result).toEqual([])
  })

  it('suggests prompt caching when phase 3 is off AND agent prompt was sent >= 5 times >= 1024 tok', async () => {
    const { ipc, invoke } = mockIpc()
    const records: ReturnType<typeof rec>[] = []
    for (let i = 0; i < 6; i++) {
      records.push(rec({
        id: `r${i}`,
        sessionId: `s${i}`,
        timestamp: NOW,
        agentPromptTokens: 2000,
        userPromptTokens: 100,
        inputTokens: 2200,
        outputTokens: 500,
        totalTokens: 2700,
        estimatedCostUsd: 0.01,
      }))
    }
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => [] })
    const result = await invoke('efficiency:savings-suggestions', {
      since: 0, cachePolicyEnabled: false, routingEnabled: true,
    }) as Array<{ cardId: string; estimatedSavingsUsd: number }>
    const cache = result.find((c) => c.cardId === 'enable-prompt-cache')
    expect(cache).toBeDefined()
    expect(cache!.estimatedSavingsUsd).toBeGreaterThan(0)
  })

  it('does NOT suggest prompt caching when fewer than 5 agent-heavy turns', async () => {
    const { ipc, invoke } = mockIpc()
    const records = [
      rec({ timestamp: NOW, agentPromptTokens: 2000, inputTokens: 2200, totalTokens: 2700, estimatedCostUsd: 0.01 }),
      rec({ id: 'r2', sessionId: 's2', timestamp: NOW, agentPromptTokens: 2000, inputTokens: 2200, totalTokens: 2700, estimatedCostUsd: 0.01 }),
    ]
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => [] })
    const result = await invoke('efficiency:savings-suggestions', { since: 0, cachePolicyEnabled: false, routingEnabled: true }) as Array<{ cardId: string }>
    expect(result.find((c) => c.cardId === 'enable-prompt-cache')).toBeUndefined()
  })

  it('does NOT suggest prompt caching when phase 3 is already ON', async () => {
    const { ipc, invoke } = mockIpc()
    const records: ReturnType<typeof rec>[] = []
    for (let i = 0; i < 6; i++) {
      records.push(rec({ id: `r${i}`, sessionId: `s${i}`, timestamp: NOW, agentPromptTokens: 2000, inputTokens: 2200, totalTokens: 2700, estimatedCostUsd: 0.01 }))
    }
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => [] })
    const result = await invoke('efficiency:savings-suggestions', { since: 0, cachePolicyEnabled: true, routingEnabled: false }) as Array<{ cardId: string }>
    expect(result.find((c) => c.cardId === 'enable-prompt-cache')).toBeUndefined()
  })

  it('suggests auto-routing when 5+ simple prompts hit expensive models', async () => {
    const { ipc, invoke } = mockIpc()
    const records: ReturnType<typeof rec>[] = []
    for (let i = 0; i < 6; i++) {
      records.push(rec({
        id: `r${i}`, sessionId: `s${i}`, timestamp: NOW,
        model: 'claude-opus-4.6',
        userPromptTokens: 20,
        inputTokens: 20, outputTokens: 200, totalTokens: 220,
        estimatedCostUsd: 0.005,  // 0.005 / 220 * 1M = $22/Mtok → expensive
      }))
    }
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => [] })
    const result = await invoke('efficiency:savings-suggestions', { since: 0, cachePolicyEnabled: true, routingEnabled: false }) as Array<{ cardId: string; estimatedSavingsUsd: number }>
    const routing = result.find((c) => c.cardId === 'enable-auto-routing')
    expect(routing).toBeDefined()
    expect(routing!.estimatedSavingsUsd).toBeGreaterThan(0)
  })

  it('does NOT suggest auto-routing when phase 4 is already ON', async () => {
    const { ipc, invoke } = mockIpc()
    const records: ReturnType<typeof rec>[] = []
    for (let i = 0; i < 6; i++) {
      records.push(rec({
        id: `r${i}`, sessionId: `s${i}`, timestamp: NOW,
        model: 'claude-opus-4.6', userPromptTokens: 20,
        inputTokens: 20, outputTokens: 200, totalTokens: 220, estimatedCostUsd: 0.005,
      }))
    }
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => [] })
    const result = await invoke('efficiency:savings-suggestions', { since: 0, cachePolicyEnabled: true, routingEnabled: true }) as Array<{ cardId: string }>
    expect(result.find((c) => c.cardId === 'enable-auto-routing')).toBeUndefined()
  })

  it('suggests trimming a large note attached >= 5 times averaging > 4000 tok', async () => {
    const { ipc, invoke } = mockIpc()
    const records: ReturnType<typeof rec>[] = []
    const sessions: ReturnType<typeof sess>[] = []
    for (let i = 0; i < 6; i++) {
      records.push(rec({
        id: `r${i}`, sessionId: `s${i}`, timestamp: NOW,
        notesTokens: 5000, inputTokens: 5100, totalTokens: 5500, estimatedCostUsd: 0.02,
      }))
      sessions.push(sess({
        sessionId: `s${i}`,
        messageLog: [
          { type: 'text', content: 'q', attachedNotes: [{ id: 'huge-note', title: 'Style guide' }] },
        ],
      }))
    }
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => sessions })
    const result = await invoke('efficiency:savings-suggestions', { since: 0, cachePolicyEnabled: true, routingEnabled: true }) as Array<{ cardId: string; title: string; ctaLink: string; estimatedSavingsUsd: number }>
    const trim = result.find((c) => c.cardId === 'trim-large-note')
    expect(trim).toBeDefined()
    expect(trim!.title).toContain('Style guide')
    expect(trim!.ctaLink).toContain('/notes')
    expect(trim!.estimatedSavingsUsd).toBeGreaterThan(0)
  })

  it('returns suggestions sorted by savings desc', async () => {
    const { ipc, invoke } = mockIpc()
    // Need to trigger BOTH caching + routing cards with different magnitudes.
    const records: ReturnType<typeof rec>[] = []
    // 6 routing-eligible expensive turns ($0.005 each = $0.03 total, savings ~$0.024)
    for (let i = 0; i < 6; i++) {
      records.push(rec({
        id: `route${i}`, sessionId: `route-s${i}`, timestamp: NOW,
        model: 'claude-opus-4.6', userPromptTokens: 20,
        inputTokens: 20, outputTokens: 200, totalTokens: 220, estimatedCostUsd: 0.005,
      }))
    }
    // 6 cache-eligible turns w/ huge agent prompts and HIGH cost
    for (let i = 0; i < 6; i++) {
      records.push(rec({
        id: `cache${i}`, sessionId: `cache-s${i}`, timestamp: NOW,
        agentPromptTokens: 5000, userPromptTokens: 100,
        inputTokens: 5100, outputTokens: 200, totalTokens: 5300, estimatedCostUsd: 0.5,
      }))
    }
    registerEfficiencyHandlers(ipc, { loadRecords: () => records, loadSessions: () => [] })
    const result = await invoke('efficiency:savings-suggestions', { since: 0, cachePolicyEnabled: false, routingEnabled: false }) as Array<{ cardId: string; estimatedSavingsUsd: number }>
    expect(result.length).toBe(2)
    // Cache savings should dwarf routing — appears first.
    expect(result[0].cardId).toBe('enable-prompt-cache')
    expect(result[1].cardId).toBe('enable-auto-routing')
    expect(result[0].estimatedSavingsUsd).toBeGreaterThan(result[1].estimatedSavingsUsd)
  })
})
