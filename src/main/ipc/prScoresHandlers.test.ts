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

// pull-request-score is loaded via new Function('mod', 'return import(mod)') in the source.
// vi.mock() at file scope works here because Vitest intercepts all import() calls regardless
// of how they are constructed. However, vi.resetModules() in beforeEach clears the registry,
// so we also inject the mock package via globalThis so the module can find it after reset.
const PR_SCORE_PKG_KEY = '__prScorePkgMock' as const

vi.mock('pull-request-score', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const injected = (globalThis as any)[PR_SCORE_PKG_KEY]
  if (injected) return injected
  return {
    collectPullRequests: collectPullRequestsMock,
    scorePr: scorePrMock,
    collectPrFiles: collectPrFilesMock,
    analyzePrFiles: analyzePrFilesMock,
    buildAiReviewContext: buildAiReviewContextMock,
    calculateMetrics: calculateMetricsMock,
    scoreMetrics: scoreMetricsMock,
    calculateAuthorMetrics: calculateAuthorMetricsMock,
    computeDeltas: computeDeltasMock,
    defaultScorecard: {},
  }
})

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

    // Inject mock package into globalThis so the dynamic import can find it after resetModules.
    // The source uses new Function('mod', 'return import(mod)') which bypasses static analysis
    // but Vitest still intercepts actual import() calls via its module registry.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any)[PR_SCORE_PKG_KEY] = {
      collectPullRequests: collectPullRequestsMock,
      scorePr: scorePrMock,
      collectPrFiles: collectPrFilesMock,
      analyzePrFiles: analyzePrFilesMock,
      buildAiReviewContext: buildAiReviewContextMock,
      calculateMetrics: calculateMetricsMock,
      scoreMetrics: scoreMetricsMock,
      calculateAuthorMetrics: calculateAuthorMetricsMock,
      computeDeltas: computeDeltasMock,
      defaultScorecard: {},
    }

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

  describe('pr-scores:score-pr', () => {
    it('returns error when no token configured', async () => {
      retrieveSecretMock.mockReturnValue(null)
      const handler = getHandler('pr-scores:score-pr')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r', prNumber: 42 }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('token')
    })

    it.skip('returns error when PR not found', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: getPrScorePackage() uses new Function('mod', 'return import(mod)')
       * which bypasses Vitest's module mocking. The dynamic import fails in the test environment
       * with "A dynamic import callback was not specified."
       */
    })

    it.skip('scores a PR and stores the result', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package to be loaded via dynamic import
       * which cannot be mocked in Vitest test environment.
       */
    })

    it.skip('replaces existing score for same PR', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package to be loaded via dynamic import.
       */
    })

    it.skip('collects file analysis when includeFileAnalysis=true', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package to be loaded via dynamic import.
       */
    })

    it.skip('handles error from collectPullRequests', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package to be loaded via dynamic import.
       */
    })
  })

  describe('pr-scores:score-all', () => {
    it('returns error when no token configured', async () => {
      retrieveSecretMock.mockReturnValue(null)
      const handler = getHandler('pr-scores:score-all')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('token')
    })

    it.skip('scores all collected PRs', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('limits batch size to 100 PRs', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('uses custom since date when provided', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('handles error from collectPullRequests', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })
  })

  describe('pr-scores:collect-prs', () => {
    it.skip('collects PRs successfully', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('uses custom since date when provided', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('handles error from collectPullRequests', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })
  })

  describe('pr-scores:calculate-metrics', () => {
    it('returns error when no token configured', async () => {
      retrieveSecretMock.mockReturnValue(null)
      const handler = getHandler('pr-scores:calculate-metrics')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('token')
    })

    it.skip('calculates metrics and stores snapshot', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('replaces existing snapshot for same repo', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('handles error from calculateMetrics', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })
  })

  describe('pr-scores:compute-deltas', () => {
    it('returns error when no token configured', async () => {
      retrieveSecretMock.mockReturnValue(null)
      const handler = getHandler('pr-scores:compute-deltas')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('token')
    })

    it.skip('computes deltas between current and previous period', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('uses config default period days when not specified', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('handles error from compute-deltas', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })
  })

  describe('pr-scores:build-ai-context', () => {
    it('returns error when no token configured', async () => {
      retrieveSecretMock.mockReturnValue(null)
      const handler = getHandler('pr-scores:build-ai-context')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r', prNumber: 42 }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('token')
    })

    it.skip('returns error when PR not found', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('builds AI review context', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })

    it.skip('handles error from collectPrFiles', async () => {
      /**
       * @see bugs/open/BUG-029-prscores-dynamic-import-not-testable.md
       * Skipped because: requires pull-request-score package via dynamic import.
       */
    })
  })

  describe('pr-scores:get-repo-metrics', () => {
    it('returns stored snapshot for repo', () => {
      storeData['repoSnapshots'] = [
        { repoFullName: 'o/r', metrics: { mergeRate: 0.9 }, repoScore: 82, authorMetrics: [], snapshotAt: 1000 },
      ]
      const handler = getHandler('pr-scores:get-repo-metrics')
      const result = handler(mockEvent, { repoFullName: 'o/r' }) as { repoScore: number }
      expect(result.repoScore).toBe(82)
    })
  })

  describe('pr-scores:set-config', () => {
    it('preserves unchanged fields when merging config', () => {
      const handler = getHandler('pr-scores:set-config')
      handler(mockEvent, { enableAiReview: true })
      const getConfigHandler = getHandler('pr-scores:get-config')
      const config = getConfigHandler(mockEvent) as { enableAiReview: boolean; defaultTimeRangeDays: number }
      expect(config.enableAiReview).toBe(true)
      // Default value should be preserved
      expect(config.defaultTimeRangeDays).toBe(30)
    })

    it('returns merged config', () => {
      const handler = getHandler('pr-scores:set-config')
      const result = handler(mockEvent, { includeCodeAnalysis: true, labelFilters: ['hotfix'] }) as {
        includeCodeAnalysis: boolean; labelFilters: string[]
      }
      expect(result.includeCodeAnalysis).toBe(true)
      expect(result.labelFilters).toEqual(['hotfix'])
    })
  })
})
