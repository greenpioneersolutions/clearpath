import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'

// ── Shared store data via globalThis (same reference across scopes) ──────────

const STORE_KEY = '__costHandlersTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

// ── vi.hoisted mocks ────────────────────────────────────────────────────────

const { mockRandomUUID } = vi.hoisted(() => ({
  mockRandomUUID: vi.fn().mockReturnValue('cost-uuid-1'),
}))

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__costHandlersTestStoreData'] as Record<string, unknown>
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in sd)) {
              sd[k] = JSON.parse(JSON.stringify(v))
            }
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

      has(key: string): boolean {
        return key in sd
      }

      delete(key: string): void {
        delete sd[key]
      }
    },
  }
})

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-encryption-key',
}))

vi.mock('crypto', () => ({
  randomUUID: mockRandomUUID,
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeData = (globalThis as any)[STORE_KEY] as Record<string, unknown>

// ── Helpers ──────────────────────────────────────────────────────────────────

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

const mockEvent = {} as Electron.IpcMainInvokeEvent

function makeCostRecord(overrides: Partial<{
  id: string; sessionId: string; sessionName: string; cli: string; model: string;
  agent: string; inputTokens: number; outputTokens: number; totalTokens: number;
  estimatedCostUsd: number; promptCount: number; timestamp: number
}> = {}) {
  return {
    sessionId: 'sess-1',
    sessionName: 'Test Session',
    cli: 'copilot' as const,
    model: 'claude-sonnet-4.5',
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    estimatedCostUsd: 0.05,
    promptCount: 1,
    timestamp: Date.now(),
    ...overrides,
  }
}

// ── Dynamic import ──────────────────────────────────────────────────────────

let registerCostHandlers: typeof import('./costHandlers').registerCostHandlers

// ── Tests ───────────────────────────────────────────────────────────────────

describe('costHandlers', () => {
  let handlers: HandlerMap
  let mockNotificationManager: { emit: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.clearAllMocks()
    ;(ipcMain.handle as ReturnType<typeof vi.fn>).mockClear()
    mockRandomUUID.mockReturnValue('cost-uuid-1')

    // Reset store data
    for (const key of Object.keys(storeData)) delete storeData[key]

    vi.resetModules()
    const mod = await import('./costHandlers')
    registerCostHandlers = mod.registerCostHandlers

    mockNotificationManager = { emit: vi.fn() }
    registerCostHandlers(ipcMain as unknown as Electron.IpcMain, mockNotificationManager as any)
    handlers = extractHandlers()
  })

  it('registers all expected channels', () => {
    const channels = Object.keys(handlers)
    expect(channels).toContain('cost:record')
    expect(channels).toContain('cost:list')
    expect(channels).toContain('cost:summary')
    expect(channels).toContain('cost:get-budget')
    expect(channels).toContain('cost:set-budget')
    expect(channels).toContain('cost:check-budget')
    expect(channels).toContain('cost:daily-spend')
    expect(channels).toContain('cost:by-model')
    expect(channels).toContain('cost:by-session')
    expect(channels).toContain('cost:by-agent')
    expect(channels).toContain('cost:export-csv')
    expect(channels).toContain('cost:clear')
    expect(channels).toContain('cost:get-display-mode')
    expect(channels).toContain('cost:set-display-mode')
    expect(channels).toContain('cost:turn-breakdown')
  })

  // ── cost:record ─────────────────────────────────────────────────────────

  describe('cost:record', () => {
    it('records a cost entry with generated id', () => {
      const args = makeCostRecord()
      const result = handlers['cost:record'](mockEvent, args) as any
      expect(result.id).toBe('cost-uuid-1')
      expect(result.sessionId).toBe('sess-1')
      expect(result.estimatedCostUsd).toBe(0.05)
    })

    it('persists the record to the store', () => {
      handlers['cost:record'](mockEvent, makeCostRecord())
      const records = storeData['records'] as any[]
      expect(records).toHaveLength(1)
    })

    it('trims records to max 10000', () => {
      // Seed with 10000 records
      const bigList: any[] = []
      for (let i = 0; i < 10000; i++) {
        bigList.push({ ...makeCostRecord(), id: `old-${i}`, timestamp: i })
      }
      storeData['records'] = bigList

      mockRandomUUID.mockReturnValue('new-record-id')
      handlers['cost:record'](mockEvent, makeCostRecord({ timestamp: 99999 }))

      const records = storeData['records'] as any[]
      expect(records.length).toBe(10000)
      expect(records[records.length - 1].id).toBe('new-record-id')
    })
  })

  // ── cost:list ───────────────────────────────────────────────────────────

  describe('cost:list', () => {
    beforeEach(() => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', timestamp: 1000 },
        { ...makeCostRecord(), id: 'r2', timestamp: 2000 },
        { ...makeCostRecord(), id: 'r3', timestamp: 3000 },
      ]
    })

    it('returns all records when no filter', () => {
      const result = handlers['cost:list'](mockEvent) as any[]
      expect(result).toHaveLength(3)
    })

    it('filters by since timestamp', () => {
      const result = handlers['cost:list'](mockEvent, { since: 1500 }) as any[]
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('r2')
    })

    it('filters by until timestamp', () => {
      const result = handlers['cost:list'](mockEvent, { until: 2500 }) as any[]
      expect(result).toHaveLength(2)
      expect(result[1].id).toBe('r2')
    })

    it('combines since and until', () => {
      const result = handlers['cost:list'](mockEvent, { since: 1500, until: 2500 }) as any[]
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('r2')
    })
  })

  // ── cost:summary ────────────────────────────────────────────────────────

  describe('cost:summary', () => {
    it('returns zero totals for empty records', () => {
      const result = handlers['cost:summary'](mockEvent) as any
      expect(result.totalCost).toBe(0)
      expect(result.totalTokens).toBe(0)
      expect(result.totalSessions).toBe(0)
      expect(result.totalPrompts).toBe(0)
    })

    it('computes aggregate statistics correctly', () => {
      const now = Date.now()
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', sessionId: 'a', inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01, promptCount: 1, timestamp: now },
        { ...makeCostRecord(), id: 'r2', sessionId: 'b', inputTokens: 200, outputTokens: 100, totalTokens: 300, estimatedCostUsd: 0.02, promptCount: 2, timestamp: now },
      ]
      const result = handlers['cost:summary'](mockEvent) as any
      expect(result.totalCost).toBeCloseTo(0.03)
      expect(result.totalTokens).toBe(450)
      expect(result.totalInputTokens).toBe(300)
      expect(result.totalOutputTokens).toBe(150)
      expect(result.totalSessions).toBe(2)
      expect(result.totalPrompts).toBe(3)
    })

    it('computes today/week/month spend from recent records', () => {
      const now = Date.now()
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', estimatedCostUsd: 1.00, totalTokens: 1000, timestamp: now },
      ]
      const result = handlers['cost:summary'](mockEvent) as any
      expect(result.todaySpend).toBeCloseTo(1.00)
      expect(result.weekSpend).toBeCloseTo(1.00)
      expect(result.monthSpend).toBeCloseTo(1.00)
      expect(result.todayTokens).toBe(1000)
    })

    it('includes displayMode', () => {
      const result = handlers['cost:summary'](mockEvent) as any
      expect(result.displayMode).toBe('tokens')
    })
  })

  // ── cost:get-budget / cost:set-budget ───────────────────────────────────

  describe('cost:get-budget', () => {
    it('returns default budget config', () => {
      const result = handlers['cost:get-budget'](mockEvent) as any
      expect(result.dailyCeiling).toBeNull()
      expect(result.weeklyCeiling).toBeNull()
      expect(result.monthlyCeiling).toBeNull()
      expect(result.autoPauseAtLimit).toBe(false)
    })
  })

  describe('cost:set-budget', () => {
    it('updates budget config', () => {
      const budget = {
        dailyCeiling: 10, weeklyCeiling: 50, monthlyCeiling: 200,
        dailyTokenCeiling: null, weeklyTokenCeiling: null, monthlyTokenCeiling: null,
        autoPauseAtLimit: true,
      }
      const result = handlers['cost:set-budget'](mockEvent, budget) as any
      expect(result).toEqual(budget)

      const stored = handlers['cost:get-budget'](mockEvent) as any
      expect(stored.dailyCeiling).toBe(10)
      expect(stored.autoPauseAtLimit).toBe(true)
    })

    it('resets fired alerts when budget is updated', () => {
      storeData['firedAlerts'] = { 'daily:50:2026-04-10': Date.now() }
      handlers['cost:set-budget'](mockEvent, {
        dailyCeiling: 20, weeklyCeiling: null, monthlyCeiling: null,
        dailyTokenCeiling: null, weeklyTokenCeiling: null, monthlyTokenCeiling: null,
        autoPauseAtLimit: false,
      })
      expect(storeData['firedAlerts']).toEqual({})
    })
  })

  // ── cost:check-budget ───────────────────────────────────────────────────

  describe('cost:check-budget', () => {
    it('returns no alerts when no budget is set', () => {
      const result = handlers['cost:check-budget'](mockEvent) as any
      expect(result.alerts).toHaveLength(0)
      expect(result.autoPause).toBe(false)
    })

    it('fires alert at 50% threshold', () => {
      const now = Date.now()
      storeData['budget'] = {
        dailyCeiling: 10, weeklyCeiling: null, monthlyCeiling: null,
        dailyTokenCeiling: null, weeklyTokenCeiling: null, monthlyTokenCeiling: null,
        autoPauseAtLimit: false,
      }
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', estimatedCostUsd: 5.50, timestamp: now },
      ]
      storeData['firedAlerts'] = {}

      const result = handlers['cost:check-budget'](mockEvent) as any
      expect(result.alerts.length).toBeGreaterThan(0)
      expect(result.alerts.some((a: any) => a.pct === 50)).toBe(true)
    })

    it('fires alert at 100% when over budget', () => {
      const now = Date.now()
      storeData['budget'] = {
        dailyCeiling: 5, weeklyCeiling: null, monthlyCeiling: null,
        dailyTokenCeiling: null, weeklyTokenCeiling: null, monthlyTokenCeiling: null,
        autoPauseAtLimit: true,
      }
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', estimatedCostUsd: 6.00, timestamp: now },
      ]
      storeData['firedAlerts'] = {}

      const result = handlers['cost:check-budget'](mockEvent) as any
      expect(result.alerts.some((a: any) => a.pct === 100)).toBe(true)
      expect(result.autoPause).toBe(true)
    })

    it('does not re-fire alerts that have already been fired', () => {
      const now = Date.now()
      const dayKey = new Date().toISOString().slice(0, 10)
      storeData['budget'] = {
        dailyCeiling: 10, weeklyCeiling: null, monthlyCeiling: null,
        dailyTokenCeiling: null, weeklyTokenCeiling: null, monthlyTokenCeiling: null,
        autoPauseAtLimit: false,
      }
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', estimatedCostUsd: 6.00, timestamp: now },
      ]
      // Mark the 50% alert as already fired
      storeData['firedAlerts'] = { [`daily:50:${dayKey}`]: now }

      const result = handlers['cost:check-budget'](mockEvent) as any
      // Should NOT include the 50% alert again
      expect(result.alerts.some((a: any) => a.period === 'daily' && a.pct === 50)).toBe(false)
    })

    it('emits notifications for budget alerts', () => {
      const now = Date.now()
      storeData['budget'] = {
        dailyCeiling: 10, weeklyCeiling: null, monthlyCeiling: null,
        dailyTokenCeiling: null, weeklyTokenCeiling: null, monthlyTokenCeiling: null,
        autoPauseAtLimit: false,
      }
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', estimatedCostUsd: 10.50, timestamp: now },
      ]
      storeData['firedAlerts'] = {}

      handlers['cost:check-budget'](mockEvent)
      expect(mockNotificationManager.emit).toHaveBeenCalled()
      // Should emit critical severity for 100%
      const calls = mockNotificationManager.emit.mock.calls
      const criticalCall = calls.find((c: any) => c[0].severity === 'critical')
      expect(criticalCall).toBeDefined()
    })

    it('checks token-based ceilings', () => {
      const now = Date.now()
      storeData['budget'] = {
        dailyCeiling: null, weeklyCeiling: null, monthlyCeiling: null,
        dailyTokenCeiling: 1000, weeklyTokenCeiling: null, monthlyTokenCeiling: null,
        autoPauseAtLimit: false,
      }
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', totalTokens: 600, timestamp: now },
      ]
      storeData['firedAlerts'] = {}

      const result = handlers['cost:check-budget'](mockEvent) as any
      expect(result.alerts.some((a: any) => a.period === 'daily (tokens)' && a.unit === 'tokens')).toBe(true)
    })
  })

  // ── cost:daily-spend ────────────────────────────────────────────────────

  describe('cost:daily-spend', () => {
    it('aggregates spending by day', () => {
      const day1 = new Date('2026-04-08T12:00:00Z').getTime()
      const day2 = new Date('2026-04-09T14:00:00Z').getTime()
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', estimatedCostUsd: 1.00, totalTokens: 100, timestamp: day1 },
        { ...makeCostRecord(), id: 'r2', estimatedCostUsd: 2.00, totalTokens: 200, timestamp: day1 },
        { ...makeCostRecord(), id: 'r3', estimatedCostUsd: 3.00, totalTokens: 300, timestamp: day2 },
      ]

      const result = handlers['cost:daily-spend'](mockEvent, { since: day1 - 1000 }) as any[]
      expect(result).toHaveLength(2)
      expect(result[0].date).toBe('2026-04-08')
      expect(result[0].cost).toBeCloseTo(3.00)
      expect(result[0].tokens).toBe(300)
      expect(result[1].date).toBe('2026-04-09')
      expect(result[1].cost).toBeCloseTo(3.00)
    })

    it('returns sorted by date ascending', () => {
      const day1 = new Date('2026-04-07T12:00:00Z').getTime()
      const day2 = new Date('2026-04-09T12:00:00Z').getTime()
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', timestamp: day2 },
        { ...makeCostRecord(), id: 'r2', timestamp: day1 },
      ]

      const result = handlers['cost:daily-spend'](mockEvent, { since: day1 - 1000 }) as any[]
      expect(result[0].date < result[1].date).toBe(true)
    })

    it('defaults to last 30 days when no since provided', () => {
      const now = Date.now()
      const oldRecord = now - 31 * 86_400_000
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r-old', timestamp: oldRecord },
        { ...makeCostRecord(), id: 'r-new', timestamp: now },
      ]

      const result = handlers['cost:daily-spend'](mockEvent) as any[]
      // Should only include the recent record, not the one >30 days old
      expect(result).toHaveLength(1)
    })
  })

  // ── cost:by-model ───────────────────────────────────────────────────────

  describe('cost:by-model', () => {
    it('groups spending by model', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', model: 'claude-sonnet-4.5', estimatedCostUsd: 1.00, totalTokens: 100 },
        { ...makeCostRecord(), id: 'r2', model: 'gpt-5', estimatedCostUsd: 2.00, totalTokens: 200 },
        { ...makeCostRecord(), id: 'r3', model: 'claude-sonnet-4.5', estimatedCostUsd: 0.50, totalTokens: 50 },
      ]

      const result = handlers['cost:by-model'](mockEvent) as any[]
      expect(result).toHaveLength(2)

      const claude = result.find((r: any) => r.model === 'claude-sonnet-4.5')
      expect(claude.cost).toBeCloseTo(1.50)
      expect(claude.tokens).toBe(150)

      const gpt = result.find((r: any) => r.model === 'gpt-5')
      expect(gpt.cost).toBeCloseTo(2.00)
    })

    it('uses "unknown" for records without model', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', model: '', estimatedCostUsd: 1.00, totalTokens: 100 },
      ]

      const result = handlers['cost:by-model'](mockEvent) as any[]
      expect(result[0].model).toBe('unknown')
    })

    it('filters by since timestamp', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', model: 'gpt-5', timestamp: 1000, estimatedCostUsd: 1.00, totalTokens: 100 },
        { ...makeCostRecord(), id: 'r2', model: 'gpt-5', timestamp: 5000, estimatedCostUsd: 2.00, totalTokens: 200 },
      ]

      const result = handlers['cost:by-model'](mockEvent, { since: 3000 }) as any[]
      expect(result).toHaveLength(1)
      expect(result[0].cost).toBeCloseTo(2.00)
    })
  })

  // ── cost:by-session ─────────────────────────────────────────────────────

  describe('cost:by-session', () => {
    it('groups by session with cost per prompt', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', sessionId: 's1', sessionName: 'Alpha', cli: 'copilot', estimatedCostUsd: 0.10, totalTokens: 100, promptCount: 2, timestamp: 1000 },
        { ...makeCostRecord(), id: 'r2', sessionId: 's1', sessionName: 'Alpha', cli: 'copilot', estimatedCostUsd: 0.20, totalTokens: 200, promptCount: 3, timestamp: 2000 },
        { ...makeCostRecord(), id: 'r3', sessionId: 's2', sessionName: 'Beta', cli: 'claude', estimatedCostUsd: 0.50, totalTokens: 500, promptCount: 1, timestamp: 3000 },
      ]

      const result = handlers['cost:by-session'](mockEvent) as any[]
      expect(result).toHaveLength(2)

      const alpha = result.find((r: any) => r.sessionId === 's1')
      expect(alpha.totalCost).toBeCloseTo(0.30)
      expect(alpha.totalTokens).toBe(300)
      expect(alpha.promptCount).toBe(5)
      expect(alpha.costPerPrompt).toBeCloseTo(0.06)
      expect(alpha.startedAt).toBe(1000)

      const beta = result.find((r: any) => r.sessionId === 's2')
      expect(beta.totalCost).toBeCloseTo(0.50)
      expect(beta.costPerPrompt).toBeCloseTo(0.50)
    })

    it('handles zero prompt count (avoids division by zero)', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', sessionId: 's1', sessionName: 'X', estimatedCostUsd: 0.10, promptCount: 0, timestamp: 1000 },
      ]

      const result = handlers['cost:by-session'](mockEvent) as any[]
      expect(result[0].costPerPrompt).toBe(0)
    })
  })

  // ── cost:by-agent ───────────────────────────────────────────────────────

  describe('cost:by-agent', () => {
    it('groups by agent name', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', agent: 'explorer', inputTokens: 100, outputTokens: 50 },
        { ...makeCostRecord(), id: 'r2', agent: 'reviewer', inputTokens: 200, outputTokens: 100 },
        { ...makeCostRecord(), id: 'r3', agent: 'explorer', inputTokens: 50, outputTokens: 25 },
      ]

      const result = handlers['cost:by-agent'](mockEvent) as any[]
      expect(result).toHaveLength(2)

      const explorer = result.find((r: any) => r.agent === 'explorer')
      expect(explorer.inputTokens).toBe(150)
      expect(explorer.outputTokens).toBe(75)
    })

    it('uses "default" for records without agent', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', inputTokens: 100, outputTokens: 50 },
      ]
      // Remove agent field to test fallback
      delete (storeData['records'] as any[])[0].agent

      const result = handlers['cost:by-agent'](mockEvent) as any[]
      expect(result[0].agent).toBe('default')
    })
  })

  // ── cost:export-csv ─────────────────────────────────────────────────────

  describe('cost:export-csv', () => {
    it('generates CSV with headers and rows', () => {
      storeData['records'] = [
        {
          ...makeCostRecord(), id: 'r1', sessionId: 's1', sessionName: 'My Session',
          cli: 'copilot', model: 'claude-sonnet-4.5', agent: 'explorer',
          inputTokens: 1000, outputTokens: 500, totalTokens: 1500,
          estimatedCostUsd: 0.05, promptCount: 3,
          timestamp: new Date('2026-04-10T10:00:00Z').getTime(),
        },
      ]

      const csv = handlers['cost:export-csv'](mockEvent) as string
      const lines = csv.split('\n')
      expect(lines[0]).toBe('Date,Session,CLI,Model,Agent,Input Tokens,Output Tokens,Total Tokens,Cost (USD),Prompts')
      expect(lines).toHaveLength(2)
      expect(lines[1]).toContain('My Session')
      expect(lines[1]).toContain('copilot')
      expect(lines[1]).toContain('claude-sonnet-4.5')
      expect(lines[1]).toContain('explorer')
    })

    it('escapes double quotes in session names', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', sessionName: 'He said "hello"', timestamp: 1000 },
      ]

      const csv = handlers['cost:export-csv'](mockEvent) as string
      expect(csv).toContain('He said ""hello""')
    })

    it('filters by since timestamp', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', timestamp: 1000 },
        { ...makeCostRecord(), id: 'r2', timestamp: 5000 },
      ]

      const csv = handlers['cost:export-csv'](mockEvent, { since: 3000 }) as string
      const lines = csv.split('\n')
      // Header + 1 data row
      expect(lines).toHaveLength(2)
    })

    it('handles empty agent field', () => {
      storeData['records'] = [
        { ...makeCostRecord(), id: 'r1', timestamp: 1000 },
      ]
      delete (storeData['records'] as any[])[0].agent

      const csv = handlers['cost:export-csv'](mockEvent) as string
      // Should not throw and should contain empty agent field
      expect(csv.split('\n')).toHaveLength(2)
    })
  })

  // ── cost:clear ──────────────────────────────────────────────────────────

  describe('cost:clear', () => {
    it('clears all records and fired alerts', () => {
      storeData['records'] = [makeCostRecord()]
      storeData['firedAlerts'] = { 'daily:50:2026-04-10': Date.now() }

      const result = handlers['cost:clear'](mockEvent) as any
      expect(result.success).toBe(true)
      expect(storeData['records']).toEqual([])
      expect(storeData['firedAlerts']).toEqual({})
    })
  })

  // ── Token Coach Phase 1: per-slice breakdown fields ────────────────────

  describe('cost:record with per-slice fields', () => {
    it('persists optional slice fields when provided', () => {
      const args = makeCostRecord({
        inputTokens: 150, outputTokens: 75, totalTokens: 225,
      })
      // Cast to bypass strict type — these new optional fields aren't in
      // the helper signature.
      const result = handlers['cost:record'](mockEvent, {
        ...args,
        userPromptTokens: 50,
        injectedContextTokens: 100,
        agentPromptTokens: 60,
        notesTokens: 40,
        contextSourcesTokens: 0,
      } as unknown as Parameters<typeof handlers['cost:record']>[1]) as any

      expect(result.userPromptTokens).toBe(50)
      expect(result.injectedContextTokens).toBe(100)
      expect(result.agentPromptTokens).toBe(60)
      expect(result.notesTokens).toBe(40)
      expect(result.contextSourcesTokens).toBe(0)
    })

    it('persists records without slice fields (backward compatible)', () => {
      const result = handlers['cost:record'](mockEvent, makeCostRecord()) as any
      expect(result.userPromptTokens).toBeUndefined()
      expect(result.agentPromptTokens).toBeUndefined()
      expect(result.injectedContextTokens).toBeUndefined()
    })
  })

  describe('cost:summary backward compatibility', () => {
    it('does not break on legacy records missing slice fields', () => {
      storeData['records'] = [
        // Legacy shape — no slice fields.
        { ...makeCostRecord(), id: 'legacy-1', timestamp: Date.now() },
        // New shape — partial slice fields.
        {
          ...makeCostRecord(), id: 'new-1', timestamp: Date.now(),
          userPromptTokens: 100, injectedContextTokens: 50,
          agentPromptTokens: 50, notesTokens: 0, contextSourcesTokens: 0,
        },
      ]
      const result = handlers['cost:summary'](mockEvent) as any
      // Aggregates still compute on existing input/output/total fields.
      expect(result.totalTokens).toBeGreaterThan(0)
    })
  })

  // ── cost:turn-breakdown ─────────────────────────────────────────────────

  describe('cost:turn-breakdown', () => {
    it('returns zeros when the session has no records', () => {
      storeData['records'] = []
      const result = handlers['cost:turn-breakdown'](mockEvent, { sessionId: 'ghost' }) as any
      expect(result.turnCount).toBe(0)
      expect(result.userPromptTokens).toBe(0)
      expect(result.injectedContextTokens).toBe(0)
      expect(result.agentPromptTokens).toBe(0)
      expect(result.notesTokens).toBe(0)
      expect(result.contextSourcesTokens).toBe(0)
      expect(result.cachedInputTokens).toBe(0)
      expect(result.cacheCreationTokens).toBe(0)
      expect(result.outputTokens).toBe(0)
      expect(result.totalTokens).toBe(0)
    })

    it('aggregates per-slice fields across multiple turns of one session', () => {
      storeData['records'] = [
        {
          ...makeCostRecord(), id: 'r1', sessionId: 's1',
          inputTokens: 100, outputTokens: 50, totalTokens: 150,
          userPromptTokens: 30, injectedContextTokens: 70,
          agentPromptTokens: 40, notesTokens: 30, contextSourcesTokens: 0,
          timestamp: 1000,
        },
        {
          ...makeCostRecord(), id: 'r2', sessionId: 's1',
          inputTokens: 200, outputTokens: 80, totalTokens: 280,
          userPromptTokens: 50, injectedContextTokens: 150,
          agentPromptTokens: 100, notesTokens: 50, contextSourcesTokens: 0,
          timestamp: 2000,
        },
        // Different session — should be ignored.
        {
          ...makeCostRecord(), id: 'r3', sessionId: 'other',
          inputTokens: 999, outputTokens: 999, totalTokens: 999,
          userPromptTokens: 999, timestamp: 3000,
        },
      ]
      const result = handlers['cost:turn-breakdown'](mockEvent, { sessionId: 's1' }) as any
      expect(result.turnCount).toBe(2)
      expect(result.userPromptTokens).toBe(80)
      expect(result.injectedContextTokens).toBe(220)
      expect(result.agentPromptTokens).toBe(140)
      expect(result.notesTokens).toBe(80)
      expect(result.contextSourcesTokens).toBe(0)
      expect(result.outputTokens).toBe(130)
      expect(result.totalTokens).toBe(430)
    })

    it('handles legacy records (missing slice fields) by counting them as 0', () => {
      storeData['records'] = [
        // Pre-Phase-1 record — no slice fields at all.
        {
          ...makeCostRecord(), id: 'legacy', sessionId: 's1',
          inputTokens: 100, outputTokens: 50, totalTokens: 150,
          timestamp: 1000,
        },
      ]
      const result = handlers['cost:turn-breakdown'](mockEvent, { sessionId: 's1' }) as any
      expect(result.turnCount).toBe(1)
      // Slice fields missing → treated as 0.
      expect(result.userPromptTokens).toBe(0)
      expect(result.injectedContextTokens).toBe(0)
      // But raw input/output/total still count.
      expect(result.outputTokens).toBe(50)
      expect(result.totalTokens).toBe(150)
    })

    it('hydrates cache slice fields (cachedInputTokens, cacheCreationTokens)', () => {
      // Phase 3 will populate these. Phase 1 just needs to plumb them through.
      storeData['records'] = [
        {
          ...makeCostRecord(), id: 'r1', sessionId: 's1',
          cachedInputTokens: 500, cacheCreationTokens: 200,
          timestamp: 1000,
        },
      ]
      const result = handlers['cost:turn-breakdown'](mockEvent, { sessionId: 's1' }) as any
      expect(result.cachedInputTokens).toBe(500)
      expect(result.cacheCreationTokens).toBe(200)
    })
  })

  // ── cost:get-display-mode / cost:set-display-mode ───────────────────────

  describe('cost:get-display-mode', () => {
    it('returns default display mode (tokens)', () => {
      const result = handlers['cost:get-display-mode'](mockEvent)
      expect(result).toBe('tokens')
    })
  })

  describe('cost:set-display-mode', () => {
    it('sets display mode to monetary', () => {
      const result = handlers['cost:set-display-mode'](mockEvent, { mode: 'monetary' }) as any
      expect(result.success).toBe(true)
      expect(result.mode).toBe('monetary')
      expect(handlers['cost:get-display-mode'](mockEvent)).toBe('monetary')
    })

    it('sets display mode to tokens', () => {
      storeData['analyticsDisplayMode'] = 'monetary'
      const result = handlers['cost:set-display-mode'](mockEvent, { mode: 'tokens' }) as any
      expect(result.success).toBe(true)
      expect(result.mode).toBe('tokens')
    })
  })

  // ── Token Coach Phase 4 — routing fields on CostRecord ──────────────────
  // These are not formally declared on the costHandlers.ts CostRecord
  // interface (kept loose so legacy rows still parse), but CLIManager passes
  // them through and the renderer reads them via `efficiency:*` handlers.
  // Verify the full aggregation surface still works cleanly with them set.

  describe('cost:record with routing fields (Phase 4)', () => {
    it('persists routedModel / userOverride / routedDifficulty when provided', () => {
      const result = handlers['cost:record'](mockEvent, {
        ...makeCostRecord(),
        userPromptTokens: 50, injectedContextTokens: 100,
        agentPromptTokens: 60, notesTokens: 40, contextSourcesTokens: 0,
        routedModel: 'gpt-5-mini',
        userOverride: false,
        routedDifficulty: 'trivial',
      } as unknown as Parameters<typeof handlers['cost:record']>[1]) as any

      expect(result.routedModel).toBe('gpt-5-mini')
      expect(result.userOverride).toBe(false)
      expect(result.routedDifficulty).toBe('trivial')
    })

    it('persists records WITHOUT routing fields (backward compatibility)', () => {
      const result = handlers['cost:record'](mockEvent, makeCostRecord()) as any
      expect(result.routedModel).toBeUndefined()
      expect(result.userOverride).toBeUndefined()
      expect(result.routedDifficulty).toBeUndefined()
    })

    it('persists records where routedModel !== model (routing applied)', () => {
      const result = handlers['cost:record'](mockEvent, {
        ...makeCostRecord({ model: 'claude-opus-4.6' }),
        routedModel: 'gpt-5-mini',   // routed DOWN
        userOverride: false,
        routedDifficulty: 'trivial',
      } as unknown as Parameters<typeof handlers['cost:record']>[1]) as any

      expect(result.model).toBe('claude-opus-4.6')
      expect(result.routedModel).toBe('gpt-5-mini')
    })

    it('persists records where userOverride is true (override picked a different model)', () => {
      const result = handlers['cost:record'](mockEvent, {
        ...makeCostRecord({ model: 'claude-opus-4.6' }),
        routedModel: 'claude-opus-4.6',
        userOverride: true,
        // routedDifficulty intentionally omitted — when the user overrides,
        // the classifier doesn't fire so this stays undefined.
      } as unknown as Parameters<typeof handlers['cost:record']>[1]) as any

      expect(result.userOverride).toBe(true)
      expect(result.routedDifficulty).toBeUndefined()
    })
  })

  describe('cost:by-model with routing fields', () => {
    it('aggregates by the `model` field (NOT routedModel) so the report stays consistent', () => {
      // Two records that share the same `model` but different `routedModel`
      // — they should still aggregate into one bucket keyed by `model`.
      storeData['records'] = [
        {
          ...makeCostRecord(), id: 'r1',
          model: 'claude-opus-4.6',
          routedModel: 'gpt-5-mini',  // routed down
          estimatedCostUsd: 1.00, totalTokens: 100,
        },
        {
          ...makeCostRecord(), id: 'r2',
          model: 'claude-opus-4.6',
          routedModel: 'claude-opus-4.6',  // no routing change
          estimatedCostUsd: 2.00, totalTokens: 200,
        },
        {
          ...makeCostRecord(), id: 'r3',
          model: 'gpt-5-mini',  // genuinely different session model
          routedModel: 'gpt-5-mini',
          estimatedCostUsd: 0.10, totalTokens: 50,
        },
      ]

      const result = handlers['cost:by-model'](mockEvent) as any[]
      // Two buckets: claude-opus-4.6 and gpt-5-mini (keyed by `model`).
      expect(result).toHaveLength(2)

      const opus = result.find((r: any) => r.model === 'claude-opus-4.6')
      expect(opus).toBeDefined()
      expect(opus.cost).toBeCloseTo(3.00)
      expect(opus.tokens).toBe(300)

      const mini = result.find((r: any) => r.model === 'gpt-5-mini')
      expect(mini).toBeDefined()
      expect(mini.cost).toBeCloseTo(0.10)
    })
  })

  describe('cost:by-session backward compatibility with routing-enriched records', () => {
    it('aggregates routing-enriched records cleanly (no schema breakage)', () => {
      storeData['records'] = [
        {
          ...makeCostRecord(), id: 'r1', sessionId: 's1', sessionName: 'Routed session',
          cli: 'copilot', model: 'claude-opus-4.6',
          routedModel: 'gpt-5-mini', userOverride: false, routedDifficulty: 'trivial',
          estimatedCostUsd: 0.10, totalTokens: 100, promptCount: 1, timestamp: 1000,
        },
        {
          ...makeCostRecord(), id: 'r2', sessionId: 's1', sessionName: 'Routed session',
          cli: 'copilot', model: 'claude-opus-4.6',
          routedModel: 'claude-opus-4.6', userOverride: true, routedDifficulty: undefined,
          estimatedCostUsd: 0.50, totalTokens: 500, promptCount: 1, timestamp: 2000,
        },
      ]

      const result = handlers['cost:by-session'](mockEvent) as any[]
      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('s1')
      expect(result[0].totalCost).toBeCloseTo(0.60)
      expect(result[0].totalTokens).toBe(600)
    })
  })

  describe('cost:by-agent backward compatibility with routing-enriched records', () => {
    it('aggregates routing-enriched records cleanly', () => {
      storeData['records'] = [
        {
          ...makeCostRecord(), id: 'r1', agent: 'Coach',
          routedModel: 'gpt-5-mini', userOverride: false,
          inputTokens: 100, outputTokens: 50,
        },
        {
          ...makeCostRecord(), id: 'r2', agent: 'Coach',
          routedModel: 'claude-opus-4.6', userOverride: true,
          inputTokens: 200, outputTokens: 100,
        },
      ]

      const result = handlers['cost:by-agent'](mockEvent) as any[]
      expect(result).toHaveLength(1)
      expect(result[0].agent).toBe('Coach')
      expect(result[0].inputTokens).toBe(300)
      expect(result[0].outputTokens).toBe(150)
    })
  })

  describe('cost:daily-spend backward compatibility with routing-enriched records', () => {
    it('aggregates routing-enriched records into daily totals', () => {
      const day1 = new Date('2026-04-08T12:00:00Z').getTime()
      storeData['records'] = [
        {
          ...makeCostRecord(), id: 'r1', timestamp: day1,
          routedModel: 'gpt-5-mini', userOverride: false, routedDifficulty: 'trivial',
          estimatedCostUsd: 1.00, totalTokens: 100,
        },
        {
          ...makeCostRecord(), id: 'r2', timestamp: day1,
          routedModel: 'claude-opus-4.6', userOverride: true,
          estimatedCostUsd: 2.00, totalTokens: 200,
        },
      ]

      const result = handlers['cost:daily-spend'](mockEvent, { since: day1 - 1000 }) as any[]
      expect(result).toHaveLength(1)
      expect(result[0].date).toBe('2026-04-08')
      expect(result[0].cost).toBeCloseTo(3.00)
      expect(result[0].tokens).toBe(300)
    })
  })

  describe('cost:summary backward compatibility with routing-enriched records', () => {
    it('treats records with routing fields as ordinary cost rows', () => {
      const now = Date.now()
      storeData['records'] = [
        {
          ...makeCostRecord(), id: 'mixed-old', timestamp: now,
          // Legacy row — no routing fields.
          estimatedCostUsd: 0.10, totalTokens: 100,
        },
        {
          ...makeCostRecord(), id: 'mixed-new', timestamp: now,
          // New row — Phase 4 routing fields set.
          routedModel: 'gpt-5-mini', userOverride: false, routedDifficulty: 'trivial',
          estimatedCostUsd: 0.20, totalTokens: 200,
        },
      ]

      const result = handlers['cost:summary'](mockEvent) as any
      expect(result.totalCost).toBeCloseTo(0.30)
      expect(result.totalTokens).toBe(300)
    })
  })

  describe('cost:export-csv handling of new routing fields', () => {
    // The current export-csv handler exports a fixed 10-column schema
    // (Date, Session, CLI, Model, Agent, Input Tokens, Output Tokens, Total
    // Tokens, Cost (USD), Prompts). It does NOT include the new Phase 1
    // slice fields or the Phase 4 routing fields. Verify that choice is
    // intentional — the export keeps its narrow schema so spreadsheets
    // that consumed CSVs before Phase 1 still parse cleanly.

    it('does NOT include slice fields or routing fields in headers or rows', () => {
      storeData['records'] = [
        {
          ...makeCostRecord({
            sessionName: 'Full schema test',
            model: 'claude-opus-4.6',
            agent: 'Coach',
            inputTokens: 1000, outputTokens: 500, totalTokens: 1500,
            estimatedCostUsd: 0.10, promptCount: 1,
            timestamp: new Date('2026-04-10T10:00:00Z').getTime(),
          }),
          id: 'r1',
          // Phase 1 slice fields
          userPromptTokens: 50, injectedContextTokens: 950,
          agentPromptTokens: 600, notesTokens: 350, contextSourcesTokens: 0,
          cachedInputTokens: 200, cacheCreationTokens: 100,
          // Phase 4 routing fields
          routedModel: 'gpt-5-mini', userOverride: false, routedDifficulty: 'trivial',
        },
      ]

      const csv = handlers['cost:export-csv'](mockEvent) as string
      const lines = csv.split('\n')
      const headers = lines[0]

      // Header schema is fixed at 10 columns (Phase-1 narrow export).
      expect(headers).toBe('Date,Session,CLI,Model,Agent,Input Tokens,Output Tokens,Total Tokens,Cost (USD),Prompts')
      expect(headers).not.toContain('userPromptTokens')
      expect(headers).not.toContain('routedModel')
      expect(headers).not.toContain('userOverride')
      expect(headers).not.toContain('routedDifficulty')

      // Data row has exactly 10 columns.
      const dataRow = lines[1]
      const columns = dataRow.split(',')
      expect(columns.length).toBe(10)
    })

    it('does not crash when routing fields are present on the row', () => {
      // The CSV builder maps a fixed list of fields per row. If a future
      // change accidentally accesses an undefined field through the row,
      // we'd throw here. Catch that early.
      storeData['records'] = [
        {
          ...makeCostRecord(), id: 'r1', timestamp: 1000,
          routedModel: 'haiku', userOverride: true, routedDifficulty: 'trivial',
          userPromptTokens: 10, agentPromptTokens: 20, notesTokens: 0,
          contextSourcesTokens: 0, injectedContextTokens: 20,
        },
      ]
      expect(() => handlers['cost:export-csv'](mockEvent)).not.toThrow()
    })

    it('exports the `model` field (not routedModel) in the Model column', () => {
      // Matches the cost:by-model invariant — reports stay consistent across
      // surfaces. Routing decisions are introspectable via the efficiency
      // handlers, not via the CSV export.
      storeData['records'] = [
        {
          ...makeCostRecord({
            model: 'claude-opus-4.6',
            agent: 'Coach',
            timestamp: new Date('2026-04-10T10:00:00Z').getTime(),
          }),
          id: 'r1',
          routedModel: 'gpt-5-mini',  // routed down — but CSV must show claude-opus-4.6
        },
      ]
      const csv = handlers['cost:export-csv'](mockEvent) as string
      // Model column is column index 3 (0-indexed).
      const dataRow = csv.split('\n')[1]
      const columns = dataRow.split(',')
      expect(columns[3]).toBe('claude-opus-4.6')
      // gpt-5-mini (routedModel) should NOT appear anywhere on the row.
      expect(dataRow).not.toContain('gpt-5-mini')
    })
  })
})
