import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { retrieveSecret } from '../utils/credentialStore'
import { log } from '../utils/logger'

// ── Types ────────────────────────────────────────────────────────────────────

interface PrScoreRecord {
  id: string
  repoFullName: string
  prNumber: number
  title: string
  author: string
  state: string
  score: number
  breakdown: Record<string, unknown>
  fileAnalysis?: Record<string, unknown>
  scoredAt: number
}

interface RepoMetricsSnapshot {
  repoFullName: string
  metrics: Record<string, unknown>
  repoScore: number
  authorMetrics: Array<Record<string, unknown>>
  snapshotAt: number
}

interface PrScoresConfig {
  defaultTimeRangeDays: number
  labelFilters: string[]
  excludeLabels: string[]
  includeCodeAnalysis: boolean
  enableAiReview: boolean
}

interface PrScoresStoreSchema {
  scores: PrScoreRecord[]
  repoSnapshots: RepoMetricsSnapshot[]
  config: PrScoresConfig
}

const DEFAULT_CONFIG: PrScoresConfig = {
  defaultTimeRangeDays: 30,
  labelFilters: [],
  excludeLabels: [],
  includeCodeAnalysis: false,
  enableAiReview: false,
}

const store = new Store<PrScoresStoreSchema>({
  name: 'clear-path-pr-scores',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    scores: [],
    repoSnapshots: [],
    config: DEFAULT_CONFIG,
  },
})

// ── Helpers ──────────────────────────────────────────────────────────────────

// Cache the pull-request-score package (ESM-only, so require() won't work).
// We use new Function() to create the import() call at runtime — this is
// completely invisible to Vite's static analysis, preventing it from
// code-splitting the import into a chunk that re-evaluates IPC registrations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _dynamicImport = new Function('mod', 'return import(mod)') as (mod: string) => Promise<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _prScorePkg: any = null
async function getPrScorePackage(): Promise<typeof import('pull-request-score')> {
  if (!_prScorePkg) {
    log.info('[pr-scores] Loading pull-request-score package...')
    _prScorePkg = await _dynamicImport('pull-request-score')
    log.info('[pr-scores] Package loaded OK (exports: %s)', Object.keys(_prScorePkg).join(', '))
  }
  return _prScorePkg
}

function getGitHubToken(): string {
  const token = retrieveSecret('github-token')
  if (!token) {
    throw new Error('GitHub token not configured. Store a token via Settings > Credentials with the key "github-token".')
  }
  return token
}

function pruneScoresForRepo(scores: PrScoreRecord[], repoFullName: string, max: number): PrScoreRecord[] {
  const repoScores = scores.filter((s) => s.repoFullName === repoFullName)
  if (repoScores.length <= max) return scores

  // Sort repo scores oldest-first, keep only the newest `max`
  repoScores.sort((a, b) => a.scoredAt - b.scoredAt)
  const toRemove = new Set(repoScores.slice(0, repoScores.length - max).map((s) => s.id))
  return scores.filter((s) => !toRemove.has(s.id))
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerPrScoresHandlers(ipcMain: IpcMain): void {
  // ── 1. Get config ─────────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:get-config', () => {
    return store.get('config')
  })

  // ── 2. Set config ─────────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:set-config', (_e, args: Partial<PrScoresConfig>) => {
    const current = store.get('config')
    const merged = { ...current, ...args }
    store.set('config', merged)
    return merged
  })

  // ── 3. Collect PRs ────────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:collect-prs', async (_e, args: { owner: string; repo: string; since?: string }) => {
    try {
      const auth = getGitHubToken()
      const { collectPullRequests } = await getPrScorePackage()
      const config = store.get('config')
      const since = args.since ?? new Date(Date.now() - config.defaultTimeRangeDays * 86_400_000).toISOString()
      const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since, auth })
      return { success: true, prs }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  // ── 4. Score single PR ────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:score-pr', async (_e, args: { owner: string; repo: string; prNumber: number; includeFileAnalysis?: boolean }) => {
    log.info('[pr-scores] score-pr: Scoring %s/%s #%d (fileAnalysis=%s)', args.owner, args.repo, args.prNumber, args.includeFileAnalysis ?? false)
    try {
      const auth = getGitHubToken()
      log.debug('[pr-scores] score-pr: Token OK, importing pull-request-score package')
      const pkg = await getPrScorePackage()
      const { collectPullRequests, scorePr, collectPrFiles, analyzePrFiles } = pkg

      // Collect PRs and find the specific one
      log.info('[pr-scores] score-pr: Collecting PRs from GitHub for %s/%s to find #%d...', args.owner, args.repo, args.prNumber)
      const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: '1970-01-01T00:00:00Z', auth })
      log.info('[pr-scores] score-pr: Collected %d PRs, searching for #%d', prs.length, args.prNumber)
      const pr = prs.find((p) => p.number === args.prNumber)
      if (!pr) {
        log.warn('[pr-scores] score-pr: PR #%d not found in %d collected PRs', args.prNumber, prs.length)
        return { success: false, error: `PR #${args.prNumber} not found in ${args.owner}/${args.repo} (searched ${prs.length} PRs)` }
      }

      log.info('[pr-scores] score-pr: Found PR #%d "%s" — running scorePr()', pr.number, pr.title)
      const scored = scorePr(pr)
      log.info('[pr-scores] score-pr: PR #%d scored: %d/100', pr.number, Math.round(scored.score))
      let fileAnalysis: Record<string, unknown> | undefined

      if (args.includeFileAnalysis) {
        log.info('[pr-scores] score-pr: Collecting file analysis for #%d...', args.prNumber)
        const files = await collectPrFiles({ owner: args.owner, repo: args.repo, prNumber: args.prNumber, auth })
        fileAnalysis = analyzePrFiles(files) as unknown as Record<string, unknown>
        log.info('[pr-scores] score-pr: File analysis complete (%d files)', files.length)
      }

      const repoFullName = `${args.owner}/${args.repo}`
      const record: PrScoreRecord = {
        id: randomUUID(),
        repoFullName,
        prNumber: scored.prNumber,
        title: scored.title,
        author: scored.author ?? 'unknown',
        state: pr.state,
        score: scored.score,
        breakdown: scored.breakdown as unknown as Record<string, unknown>,
        fileAnalysis,
        scoredAt: Date.now(),
      }

      // Store the record, replacing any existing record for the same PR
      let scores = store.get('scores')
      scores = scores.filter((s) => !(s.repoFullName === repoFullName && s.prNumber === args.prNumber))
      scores.push(record)
      scores = pruneScoresForRepo(scores, repoFullName, 1000)
      store.set('scores', scores)

      log.info('[pr-scores] score-pr: Stored score for #%d (total cached: %d)', args.prNumber, scores.length)
      return { success: true, score: record }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('[pr-scores] score-pr: Failed for %s/%s #%d —', args.owner, args.repo, args.prNumber, message)
      return { success: false, error: message }
    }
  })

  // ── 5. Score all PRs ──────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:score-all', async (_e, args: { owner: string; repo: string; since?: string }) => {
    log.info('[pr-scores] score-all: Batch scoring %s/%s', args.owner, args.repo)
    try {
      const auth = getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, scorePr } = pkg

      const config = store.get('config')
      const since = args.since ?? new Date(Date.now() - config.defaultTimeRangeDays * 86_400_000).toISOString()
      log.info('[pr-scores] score-all: Collecting PRs since %s...', since)
      let prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since, auth })
      log.info('[pr-scores] score-all: Collected %d PRs', prs.length)

      // Limit to 100 PRs at a time
      if (prs.length > 100) {
        log.info('[pr-scores] score-all: Limiting to 100 PRs (had %d)', prs.length)
        prs = prs.slice(0, 100)
      }

      const repoFullName = `${args.owner}/${args.repo}`
      const results: PrScoreRecord[] = []

      for (const pr of prs) {
        const scored = scorePr(pr)
        const record: PrScoreRecord = {
          id: randomUUID(),
          repoFullName,
          prNumber: scored.prNumber,
          title: scored.title,
          author: scored.author ?? 'unknown',
          state: pr.state,
          score: scored.score,
          breakdown: scored.breakdown as unknown as Record<string, unknown>,
          scoredAt: Date.now(),
        }
        results.push(record)
      }

      log.info('[pr-scores] score-all: Scored %d PRs (avg: %d)', results.length,
        results.length > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0)

      // Replace all existing scores for these PR numbers, then add new ones
      let scores = store.get('scores')
      const scoredNumbers = new Set(results.map((r) => r.prNumber))
      scores = scores.filter((s) => !(s.repoFullName === repoFullName && scoredNumbers.has(s.prNumber)))
      scores.push(...results)
      scores = pruneScoresForRepo(scores, repoFullName, 1000)
      store.set('scores', scores)

      return { success: true, scores: results }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('[pr-scores] score-all: Failed for %s/%s —', args.owner, args.repo, message)
      return { success: false, error: message }
    }
  })

  // ── 6. Get cached scores ──────────────────────────────────────────────────

  ipcMain.handle('pr-scores:get-scores', (_e, args: { repoFullName: string; limit?: number }) => {
    const allScores = store.get('scores')
    let repoScores = allScores.filter((s) => s.repoFullName === args.repoFullName)
    repoScores.sort((a, b) => b.scoredAt - a.scoredAt)
    if (args.limit && args.limit > 0) {
      repoScores = repoScores.slice(0, args.limit)
    }
    return repoScores
  })

  // ── 7. Get single score detail ────────────────────────────────────────────

  ipcMain.handle('pr-scores:get-score-detail', (_e, args: { repoFullName: string; prNumber: number }) => {
    const scores = store.get('scores')
    const found = scores.find((s) => s.repoFullName === args.repoFullName && s.prNumber === args.prNumber)
    return found ?? null
  })

  // ── 8. Calculate metrics ──────────────────────────────────────────────────

  ipcMain.handle('pr-scores:calculate-metrics', async (_e, args: { owner: string; repo: string; since?: string }) => {
    try {
      const auth = getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, calculateMetrics, scoreMetrics, calculateAuthorMetrics, defaultScorecard } = pkg

      const config = store.get('config')
      const since = args.since ?? new Date(Date.now() - config.defaultTimeRangeDays * 86_400_000).toISOString()
      const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since, auth })

      const metrics = calculateMetrics(prs)
      const repoScore = scoreMetrics(metrics as unknown as Record<string, number>, defaultScorecard as unknown as Parameters<typeof scoreMetrics>[1])
      const authorMetrics = calculateAuthorMetrics(prs)

      const repoFullName = `${args.owner}/${args.repo}`
      const snapshot: RepoMetricsSnapshot = {
        repoFullName,
        metrics: metrics as unknown as Record<string, unknown>,
        repoScore,
        authorMetrics: authorMetrics as unknown as Array<Record<string, unknown>>,
        snapshotAt: Date.now(),
      }

      // Replace existing snapshot for this repo
      const snapshots = store.get('repoSnapshots').filter((s) => s.repoFullName !== repoFullName)
      snapshots.push(snapshot)
      store.set('repoSnapshots', snapshots)

      return { success: true, snapshot }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  // ── 9. Get cached repo metrics ────────────────────────────────────────────

  ipcMain.handle('pr-scores:get-repo-metrics', (_e, args: { repoFullName: string }) => {
    const snapshots = store.get('repoSnapshots')
    const found = snapshots.find((s) => s.repoFullName === args.repoFullName)
    return found ?? null
  })

  // ── 10. Compute deltas ────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:compute-deltas', async (_e, args: { owner: string; repo: string; periodDays?: number }) => {
    try {
      const auth = getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, calculateMetrics, computeDeltas } = pkg

      const config = store.get('config')
      const periodDays = args.periodDays ?? config.defaultTimeRangeDays
      const periodMs = periodDays * 86_400_000

      const now = Date.now()
      const currentSince = new Date(now - periodMs).toISOString()
      const previousSince = new Date(now - periodMs * 2).toISOString()
      const previousUntil = new Date(now - periodMs).toISOString()

      const currentPrs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: currentSince, auth })
      const allPreviousPrs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: previousSince, auth })
      // Filter to only PRs in the previous period (before the current period start)
      const previousPrs = allPreviousPrs.filter((pr) => {
        return pr.createdAt && new Date(pr.createdAt).toISOString() < previousUntil
      })

      const currentMetrics = calculateMetrics(currentPrs)
      const previousMetrics = calculateMetrics(previousPrs)

      const deltas = computeDeltas(
        currentMetrics as unknown as Record<string, unknown>,
        previousMetrics as unknown as Record<string, unknown>,
      )

      return {
        success: true,
        deltas,
        currentMetrics: currentMetrics as unknown as Record<string, unknown>,
        previousMetrics: previousMetrics as unknown as Record<string, unknown>,
        periodDays,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  // ── 11. Build AI review context ───────────────────────────────────────────

  ipcMain.handle('pr-scores:build-ai-context', async (_e, args: { owner: string; repo: string; prNumber: number }) => {
    try {
      const auth = getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, collectPrFiles, analyzePrFiles, buildAiReviewContext } = pkg

      const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: '1970-01-01T00:00:00Z', auth })
      const pr = prs.find((p) => p.number === args.prNumber)
      if (!pr) {
        return { success: false, error: `PR #${args.prNumber} not found in ${args.owner}/${args.repo}` }
      }

      const files = await collectPrFiles({ owner: args.owner, repo: args.repo, prNumber: args.prNumber, auth })
      const analysis = analyzePrFiles(files)
      const context = buildAiReviewContext(pr, files, analysis)

      return { success: true, context }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  // ── 12. Clear scores ──────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:clear-scores', (_e, args?: { repoFullName?: string }) => {
    if (args?.repoFullName) {
      const scores = store.get('scores').filter((s) => s.repoFullName !== args.repoFullName)
      store.set('scores', scores)
      const snapshots = store.get('repoSnapshots').filter((s) => s.repoFullName !== args.repoFullName)
      store.set('repoSnapshots', snapshots)
    } else {
      store.set('scores', [])
      store.set('repoSnapshots', [])
    }
    return { success: true }
  })

  // ── 13. List scored repos ─────────────────────────────────────────────────

  ipcMain.handle('pr-scores:list-scored-repos', () => {
    const scores = store.get('scores')
    const counts: Record<string, number> = {}
    for (const s of scores) {
      counts[s.repoFullName] = (counts[s.repoFullName] || 0) + 1
    }
    return Object.entries(counts).map(([repoFullName, count]) => ({ repoFullName, count }))
  })

  // ── 14. Export CSV ────────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:export-csv', (_e, args?: { repoFullName?: string }) => {
    let scores = store.get('scores')
    if (args?.repoFullName) {
      scores = scores.filter((s) => s.repoFullName === args.repoFullName)
    }
    scores.sort((a, b) => b.scoredAt - a.scoredAt)

    const headers = 'Scored At,Repo,PR Number,Title,Author,State,Score'
    const rows = scores.map((s) =>
      [
        new Date(s.scoredAt).toISOString(),
        s.repoFullName,
        s.prNumber,
        `"${s.title.replace(/"/g, '""')}"`,
        s.author,
        s.state,
        s.score,
      ].join(',')
    )
    return [headers, ...rows].join('\n')
  })
}
