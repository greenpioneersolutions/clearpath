import { describe, it, expect, vi } from 'vitest'
import type { IpcMain } from 'electron'
import type { BackendId } from '../../shared/backends'

vi.mock('../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => undefined,
}))

import { registerEfficiencyHandlers, type EfficiencyCostRecord } from './efficiencyHandlers'

/**
 * Scenario G — Efficiency tab on real data.
 *
 * Exercises the three Phase-5 IPC handlers end-to-end against a realistic
 * 7-day fixture (≈30 records spanning all relevant slice / routing shapes).
 * We're not testing handler internals — that's covered by efficiencyHandlers.test.ts.
 * We're testing the integration math the Efficiency tab actually depends on:
 *
 *   1. `efficiency:where-did-tokens-go` slice sums equal the seeded sums.
 *   2. `efficiency:top-context-bloat` surfaces a heavily-repeated note at the top.
 *   3. `efficiency:savings-suggestions` produces ≥ 1 suggestion with positive
 *      estimatedSavingsUsd when the data is shaped to trigger one.
 */

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

// ── Fixture builders ───────────────────────────────────────────────────────

const NOW = 1_700_000_000_000  // Sat Nov 14 2023 (anchor, doesn't matter for math)
const ONE_DAY = 24 * 60 * 60 * 1000

function seedCostRecords(): EfficiencyCostRecord[] {
  const recs: EfficiencyCostRecord[] = []

  // Day 0-6: produce ~30 records across 7 days, mixing slice shapes:
  //   - 18 records on sonnet/opus with full slice breakdown
  //   - 6 records with the "huge note" attached repeatedly (5000 tok notes)
  //   - 6 trivial-looking opus records (cheap-route candidates) to trigger
  //     the auto-routing savings card
  for (let day = 0; day < 7; day++) {
    const dayTs = NOW - day * ONE_DAY
    // 4 typical sonnet turns per day with realistic slice splits
    for (let t = 0; t < 4; t++) {
      recs.push({
        id: `typ-${day}-${t}`,
        sessionId: `sess-typ-${day}`,
        sessionName: `Daily session ${day}`,
        cli: 'copilot-cli',
        model: 'claude-sonnet-4.5',
        agent: 'Coach',
        inputTokens: 1500,
        outputTokens: 400,
        totalTokens: 1900,
        estimatedCostUsd: 0.012,
        promptCount: 1,
        timestamp: dayTs,
        userPromptTokens: 200,
        injectedContextTokens: 1300,
        agentPromptTokens: 800,
        notesTokens: 500,
        contextSourcesTokens: 0,
      })
    }
  }
  return recs
}

function seedHugeNoteRecords(): {
  records: EfficiencyCostRecord[]
  sessions: SessionFixture[]
} {
  // 6 sessions each with the same "huge-style-guide" note attached, each
  // contributing 5000+ note tokens — should rank #1 in top-context-bloat
  // AND trigger the trim-large-note suggestion (>= 5 sessions, > 4000 avg).
  const records: EfficiencyCostRecord[] = []
  const sessions: SessionFixture[] = []
  for (let i = 0; i < 6; i++) {
    records.push({
      id: `huge-${i}`,
      sessionId: `huge-sess-${i}`,
      sessionName: `Huge note session ${i}`,
      cli: 'copilot-cli',
      model: 'claude-sonnet-4.5',
      inputTokens: 5500,
      outputTokens: 200,
      totalTokens: 5700,
      estimatedCostUsd: 0.06,
      promptCount: 1,
      timestamp: NOW - i * ONE_DAY,
      userPromptTokens: 200,
      injectedContextTokens: 5300,
      agentPromptTokens: 300,
      notesTokens: 5000,
      contextSourcesTokens: 0,
    })
    sessions.push({
      sessionId: `huge-sess-${i}`,
      cli: 'copilot-cli',
      name: `Huge note session ${i}`,
      startedAt: NOW - i * ONE_DAY,
      messageLog: [{
        type: 'text',
        content: 'use this style guide',
        sender: 'user',
        attachedNotes: [{ id: 'huge-style-guide', title: 'Style guide (huge)' }],
      }],
    })
  }
  return { records, sessions }
}

function seedTrivialOpusRecords(): EfficiencyCostRecord[] {
  // 6 opus turns with user-prompt < 50 tok and high cost per token → should
  // trigger the "enable auto-routing" savings card. Effective rate must be
  // > $2/Mtok per the handler's heuristic.
  const recs: EfficiencyCostRecord[] = []
  for (let i = 0; i < 6; i++) {
    recs.push({
      id: `trivopus-${i}`,
      sessionId: `triv-sess-${i}`,
      sessionName: `Trivial opus ${i}`,
      cli: 'copilot-cli',
      model: 'claude-opus-4.6',
      inputTokens: 30,
      outputTokens: 200,
      totalTokens: 230,
      estimatedCostUsd: 0.0055,  // (0.0055 / 230) * 1M ≈ $24/Mtok → expensive
      promptCount: 1,
      timestamp: NOW - i * ONE_DAY,
      userPromptTokens: 20,
      injectedContextTokens: 10,
      agentPromptTokens: 10,
      notesTokens: 0,
      contextSourcesTokens: 0,
      routedDifficulty: 'trivial',
      userOverride: false,
    })
  }
  return recs
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Scenario G — Efficiency tab integration on realistic 7-day fixture', () => {
  // Anchor Date.now so the default-7-day window in handlers is deterministic.
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('efficiency:where-did-tokens-go slice sums equal the seeded sums', async () => {
    const { ipc, invoke } = mockIpc()
    const typical = seedCostRecords()  // 28 records (7 days × 4)
    // Compute the expected sums directly from the seed so the assertion is
    // a real "math the tab depends on" check, not a magic-number check.
    const expected = typical.reduce((acc, r) => ({
      user: acc.user + (r.userPromptTokens ?? 0),
      agent: acc.agent + (r.agentPromptTokens ?? 0),
      notes: acc.notes + (r.notesTokens ?? 0),
      contextSources: acc.contextSources + (r.contextSourcesTokens ?? 0),
      cached: acc.cached + (r.cachedInputTokens ?? 0),
      output: acc.output + r.outputTokens,
    }), { user: 0, agent: 0, notes: 0, contextSources: 0, cached: 0, output: 0 })

    registerEfficiencyHandlers(ipc, {
      loadRecords: () => typical,
      loadSessions: () => [],
    })

    const result = await invoke('efficiency:where-did-tokens-go', {
      since: NOW - 8 * ONE_DAY,
    }) as {
      total: number; user: number; agent: number; notes: number
      contextSources: number; cached: number; output: number; recordCount: number
    }

    expect(result.recordCount).toBe(typical.length)
    expect(result.user).toBe(expected.user)
    expect(result.agent).toBe(expected.agent)
    expect(result.notes).toBe(expected.notes)
    expect(result.contextSources).toBe(expected.contextSources)
    expect(result.cached).toBe(expected.cached)
    expect(result.output).toBe(expected.output)
    expect(result.total).toBe(
      expected.user + expected.agent + expected.notes +
      expected.contextSources + expected.cached + expected.output,
    )
  })

  it('efficiency:top-context-bloat surfaces the repeated huge-style-guide note at #1', async () => {
    const { ipc, invoke } = mockIpc()
    const typical = seedCostRecords()
    const { records: hugeRecs, sessions: hugeSessions } = seedHugeNoteRecords()
    registerEfficiencyHandlers(ipc, {
      loadRecords: () => [...typical, ...hugeRecs],
      loadSessions: () => hugeSessions,
    })

    const result = await invoke('efficiency:top-context-bloat', {
      since: NOW - 8 * ONE_DAY,
      limit: 5,
    }) as Array<{ kind: string; id: string; title: string; sessions: number; totalTokens: number }>

    expect(result.length).toBeGreaterThanOrEqual(1)
    // Sorted by totalTokens desc — the huge note appears in 6 sessions × 5000 tok
    // each, so it must be the top entry.
    expect(result[0].kind).toBe('note')
    expect(result[0].id).toBe('huge-style-guide')
    expect(result[0].sessions).toBe(6)
    // 6 sessions × 5000 tok = 30,000 tok of bloat
    expect(result[0].totalTokens).toBe(30_000)
    expect(result[0].title).toContain('Style guide')
  })

  it('efficiency:savings-suggestions returns a positive-USD suggestion when Opus is used on trivial-looking prompts', async () => {
    const { ipc, invoke } = mockIpc()
    const trivialOpus = seedTrivialOpusRecords()
    registerEfficiencyHandlers(ipc, {
      loadRecords: () => trivialOpus,
      loadSessions: () => [],
    })

    const result = await invoke('efficiency:savings-suggestions', {
      since: NOW - 8 * ONE_DAY,
      cachePolicyEnabled: true,   // suppress the prompt-cache card to isolate routing
      routingEnabled: false,
    }) as Array<{
      cardId: string; estimatedSavingsUsd: number; title: string; ctaLabel: string
    }>

    const routing = result.find((s) => s.cardId === 'enable-auto-routing')
    expect(routing).toBeDefined()
    expect(routing!.estimatedSavingsUsd).toBeGreaterThan(0)
    expect(routing!.title.toLowerCase()).toContain('auto-routing')
    expect(routing!.ctaLabel).toBeTruthy()
  })

  it('efficiency:savings-suggestions surfaces the trim-large-note card for the repeated huge note', async () => {
    const { ipc, invoke } = mockIpc()
    const typical = seedCostRecords()
    const { records: hugeRecs, sessions: hugeSessions } = seedHugeNoteRecords()
    registerEfficiencyHandlers(ipc, {
      loadRecords: () => [...typical, ...hugeRecs],
      loadSessions: () => hugeSessions,
    })

    const result = await invoke('efficiency:savings-suggestions', {
      since: NOW - 8 * ONE_DAY,
      cachePolicyEnabled: true,
      routingEnabled: true,
    }) as Array<{
      id: string; cardId: string; estimatedSavingsUsd: number; title: string; ctaLink: string
    }>

    const trim = result.find((s) => s.cardId === 'trim-large-note')
    expect(trim).toBeDefined()
    expect(trim!.title).toContain('Style guide')
    expect(trim!.ctaLink).toContain('/notes')
    expect(trim!.estimatedSavingsUsd).toBeGreaterThan(0)
  })
})
