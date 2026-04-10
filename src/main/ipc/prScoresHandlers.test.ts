import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  retrieveSecretMock, randomUUIDMock,
  collectPullRequestsMock, scorePrMock, collectPrFilesMock,
  analyzePrFilesMock, buildAiReviewContextMock,
  calculateMetricsMock, scoreMetricsMock, calculateAuthorMetricsMock,
  computeDeltasMock,
} = vi.hoisted(() => ({
  retrieveSecretMock: vi.fn().mockReturnValue('ghp_testtoken'),
  randomUUIDMock: vi.fn().mockReturnValue('test-uuid'),
  collectPullRequestsMock: vi.fn().mockResolvedValue([]),
  scorePrMock: vi.fn().mockReturnValue({ prNumber: 1, title: 'test', author: 'user', score: 85, breakdown: {} }),
  collectPrFilesMock: vi.fn().mockResolvedValue([]),
  analyzePrFilesMock: vi.fn().mockReturnValue({}),
  buildAiReviewContextMock: vi.fn().mockReturnValue('AI context'),
  calculateMetricsMock: vi.fn().mockReturnValue({}),
  scoreMetricsMock: vi.fn().mockReturnValue(80),
  calculateAuthorMetricsMock: vi.fn().mockReturnValue([]),
  computeDeltasMock: vi.fn().mockReturnValue({}),
}))

vi.mock('../utils/credentialStore', () => ({
  retrieveSecret: retrieveSecretMock,
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-key',
}))

vi.mock('../utils/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('crypto', () => ({
  randomUUID: randomUUIDMock,
}))

// ── Store mock ──────────────────────────────────────────────────────────────

const STORE_KEY = '__prScoresTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__prScoresTestStoreData'] as Record<string, unknown>
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

describe('prScoresHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    retrieveSecretMock.mockReturnValue('ghp_testtoken')

    // The prScoresHandlers uses new Function('mod', 'return import(mod)') for dynamic import.
    // We need to reset modules to get fresh module state.
    vi.resetModules()
    const mod = await import('./prScoresHandlers')
    mod.registerPrScoresHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('pr-scores:get-config')
    expect(channels).toContain('pr-scores:set-config')
    expect(channels).toContain('pr-scores:collect-prs')
    expect(channels).toContain('pr-scores:score-pr')
    expect(channels).toContain('pr-scores:score-all')
    expect(channels).toContain('pr-scores:get-scores')
    expect(channels).toContain('pr-scores:get-score-detail')
    expect(channels).toContain('pr-scores:calculate-metrics')
    expect(channels).toContain('pr-scores:get-repo-metrics')
    expect(channels).toContain('pr-scores:compute-deltas')
    expect(channels).toContain('pr-scores:build-ai-context')
    expect(channels).toContain('pr-scores:clear-scores')
    expect(channels).toContain('pr-scores:list-scored-repos')
    expect(channels).toContain('pr-scores:export-csv')
  })

  describe('pr-scores:get-config', () => {
    it('returns default config', () => {
      const handler = getHandler('pr-scores:get-config')
      const result = handler(mockEvent) as { defaultTimeRangeDays: number }
      expect(result.defaultTimeRangeDays).toBe(30)
      expect(result).toHaveProperty('labelFilters')
      expect(result).toHaveProperty('includeCodeAnalysis')
    })
  })

  describe('pr-scores:set-config', () => {
    it('merges config overrides', () => {
      const handler = getHandler('pr-scores:set-config')
      const result = handler(mockEvent, { defaultTimeRangeDays: 60 }) as { defaultTimeRangeDays: number }
      expect(result.defaultTimeRangeDays).toBe(60)
    })
  })

  describe('pr-scores:get-scores', () => {
    it('returns empty array for repo with no scores', () => {
      const handler = getHandler('pr-scores:get-scores')
      const result = handler(mockEvent, { repoFullName: 'owner/repo' })
      expect(result).toEqual([])
    })

    it('returns cached scores sorted by date', () => {
      storeData['scores'] = [
        { id: '1', repoFullName: 'o/r', prNumber: 1, scoredAt: 1000, score: 80, title: 'PR1', author: 'a', state: 'open', breakdown: {} },
        { id: '2', repoFullName: 'o/r', prNumber: 2, scoredAt: 2000, score: 90, title: 'PR2', author: 'a', state: 'open', breakdown: {} },
        { id: '3', repoFullName: 'other/repo', prNumber: 1, scoredAt: 3000, score: 70, title: 'PR3', author: 'b', state: 'open', breakdown: {} },
      ]
      const handler = getHandler('pr-scores:get-scores')
      const result = handler(mockEvent, { repoFullName: 'o/r' }) as Array<{ prNumber: number }>
      expect(result).toHaveLength(2)
      // Should be sorted newest first
      expect(result[0].prNumber).toBe(2)
    })

    it('respects limit parameter', () => {
      storeData['scores'] = [
        { id: '1', repoFullName: 'o/r', prNumber: 1, scoredAt: 1000, score: 80, title: 'PR1', author: 'a', state: 'open', breakdown: {} },
        { id: '2', repoFullName: 'o/r', prNumber: 2, scoredAt: 2000, score: 90, title: 'PR2', author: 'a', state: 'open', breakdown: {} },
      ]
      const handler = getHandler('pr-scores:get-scores')
      const result = handler(mockEvent, { repoFullName: 'o/r', limit: 1 }) as unknown[]
      expect(result).toHaveLength(1)
    })
  })

  describe('pr-scores:get-score-detail', () => {
    it('returns null when score not found', () => {
      const handler = getHandler('pr-scores:get-score-detail')
      const result = handler(mockEvent, { repoFullName: 'o/r', prNumber: 999 })
      expect(result).toBeNull()
    })

    it('returns score detail when found', () => {
      storeData['scores'] = [
        { id: '1', repoFullName: 'o/r', prNumber: 42, scoredAt: 1000, score: 85, title: 'Fix bug', author: 'dev', state: 'closed', breakdown: { size: 10 } },
      ]
      const handler = getHandler('pr-scores:get-score-detail')
      const result = handler(mockEvent, { repoFullName: 'o/r', prNumber: 42 }) as { score: number }
      expect(result.score).toBe(85)
    })
  })

  describe('pr-scores:collect-prs', () => {
    it('returns error when no token configured', async () => {
      retrieveSecretMock.mockReturnValue(null)
      const handler = getHandler('pr-scores:collect-prs')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('token')
    })
  })

  describe('pr-scores:get-repo-metrics', () => {
    it('returns null when no snapshot exists', () => {
      const handler = getHandler('pr-scores:get-repo-metrics')
      const result = handler(mockEvent, { repoFullName: 'o/r' })
      expect(result).toBeNull()
    })
  })

  describe('pr-scores:clear-scores', () => {
    it('clears all scores when no repo specified', () => {
      storeData['scores'] = [{ id: '1', repoFullName: 'o/r', prNumber: 1, scoredAt: 1000, score: 80, title: '', author: '', state: '', breakdown: {} }]
      storeData['repoSnapshots'] = [{ repoFullName: 'o/r', metrics: {}, repoScore: 80, authorMetrics: [], snapshotAt: 1000 }]

      const handler = getHandler('pr-scores:clear-scores')
      handler(mockEvent)

      expect(storeData['scores']).toEqual([])
      expect(storeData['repoSnapshots']).toEqual([])
    })

    it('clears only specified repo scores', () => {
      storeData['scores'] = [
        { id: '1', repoFullName: 'o/r1', prNumber: 1, scoredAt: 1000, score: 80, title: '', author: '', state: '', breakdown: {} },
        { id: '2', repoFullName: 'o/r2', prNumber: 1, scoredAt: 1000, score: 90, title: '', author: '', state: '', breakdown: {} },
      ]
      storeData['repoSnapshots'] = [
        { repoFullName: 'o/r1', metrics: {}, repoScore: 80, authorMetrics: [], snapshotAt: 1000 },
        { repoFullName: 'o/r2', metrics: {}, repoScore: 90, authorMetrics: [], snapshotAt: 1000 },
      ]

      const handler = getHandler('pr-scores:clear-scores')
      handler(mockEvent, { repoFullName: 'o/r1' })

      const scores = storeData['scores'] as Array<{ repoFullName: string }>
      expect(scores).toHaveLength(1)
      expect(scores[0].repoFullName).toBe('o/r2')
    })
  })

  describe('pr-scores:list-scored-repos', () => {
    it('returns empty array when no scores exist', () => {
      const handler = getHandler('pr-scores:list-scored-repos')
      const result = handler(mockEvent) as unknown[]
      expect(result).toEqual([])
    })

    it('returns repo names with counts', () => {
      storeData['scores'] = [
        { id: '1', repoFullName: 'o/r1', prNumber: 1, scoredAt: 1000, score: 80, title: '', author: '', state: '', breakdown: {} },
        { id: '2', repoFullName: 'o/r1', prNumber: 2, scoredAt: 2000, score: 90, title: '', author: '', state: '', breakdown: {} },
        { id: '3', repoFullName: 'o/r2', prNumber: 1, scoredAt: 3000, score: 70, title: '', author: '', state: '', breakdown: {} },
      ]

      const handler = getHandler('pr-scores:list-scored-repos')
      const result = handler(mockEvent) as Array<{ repoFullName: string; count: number }>
      expect(result).toHaveLength(2)
      const r1 = result.find((r) => r.repoFullName === 'o/r1')
      expect(r1?.count).toBe(2)
    })
  })

  describe('pr-scores:export-csv', () => {
    it('returns CSV with headers for empty scores', () => {
      const handler = getHandler('pr-scores:export-csv')
      const result = handler(mockEvent) as string
      expect(result).toBe('Scored At,Repo,PR Number,Title,Author,State,Score')
    })

    it('generates valid CSV rows', () => {
      storeData['scores'] = [
        { id: '1', repoFullName: 'o/r', prNumber: 1, scoredAt: 1000, score: 85, title: 'Fix "bug"', author: 'dev', state: 'closed', breakdown: {} },
      ]

      const handler = getHandler('pr-scores:export-csv')
      const result = handler(mockEvent) as string
      const lines = result.split('\n')
      expect(lines).toHaveLength(2)
      // Title with quotes should be escaped
      expect(lines[1]).toContain('""bug""')
    })

    it('filters by repo when specified', () => {
      storeData['scores'] = [
        { id: '1', repoFullName: 'o/r1', prNumber: 1, scoredAt: 1000, score: 80, title: '', author: '', state: '', breakdown: {} },
        { id: '2', repoFullName: 'o/r2', prNumber: 1, scoredAt: 2000, score: 90, title: '', author: '', state: '', breakdown: {} },
      ]

      const handler = getHandler('pr-scores:export-csv')
      const result = handler(mockEvent, { repoFullName: 'o/r1' }) as string
      const lines = result.split('\n')
      expect(lines).toHaveLength(2) // header + 1 row
    })
  })
})
