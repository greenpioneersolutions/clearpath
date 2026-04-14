import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { retrieveSecret } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'

// ── Schema ───────────────────────────────────────────────────────────────────

interface PrScoresConfig {
  defaultTimeRangeDays: number
  labelFilters: string[]
  includeCodeAnalysis: boolean
  enableAiReview: boolean
}

interface ScoredPr {
  id: string
  repoFullName: string
  prNumber: number
  title: string
  author: string
  state: string
  score: number
  breakdown: Record<string, unknown>
  scoredAt: number
  fileAnalysis?: Record<string, unknown>
}

interface RepoSnapshot {
  repoFullName: string
  metrics: Record<string, unknown>
  repoScore: number
  authorMetrics: unknown[]
  snapshotAt: number
}

interface PrScoresStoreSchema {
  config: PrScoresConfig
  scores: ScoredPr[]
  repoSnapshots: RepoSnapshot[]
}

const DEFAULT_CONFIG: PrScoresConfig = {
  defaultTimeRangeDays: 30,
  labelFilters: [],
  includeCodeAnalysis: false,
  enableAiReview: false,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore(): Store<PrScoresStoreSchema> {
  return new Store<PrScoresStoreSchema>({
    name: 'clear-path-pr-scores',
    encryptionKey: getStoreEncryptionKey(),
    defaults: {
      config: DEFAULT_CONFIG,
      scores: [],
      repoSnapshots: [],
    },
  })
}

function getGitHubToken(): string | null {
  return retrieveSecret('env-GH_TOKEN') || retrieveSecret('env-GITHUB_TOKEN') || null
}

/** Dynamic import for the optional pull-request-score extension package. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPrScorePackage(): Promise<any | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return await new Function('mod', 'return import(mod)')('pull-request-score')
  } catch {
    return null
  }
}

function escapeCsv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerPrScoresHandlers(ipcMain: IpcMain): void {
  const store = makeStore()

  // ── Config ──────────────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:get-config', () => {
    return store.get('config')
  })

  ipcMain.handle('pr-scores:set-config', (_e, overrides: Partial<PrScoresConfig>) => {
    const current = store.get('config')
    const updated = { ...current, ...overrides }
    store.set('config', updated)
    return updated
  })

  // ── Score CRUD ───────────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:get-scores', (_e, args?: { repoFullName?: string; limit?: number }) => {
    const scores = store.get('scores')
    let filtered = args?.repoFullName
      ? scores.filter((s) => s.repoFullName === args.repoFullName)
      : scores
    filtered = [...filtered].sort((a, b) => b.scoredAt - a.scoredAt)
    if (args?.limit) filtered = filtered.slice(0, args.limit)
    return filtered
  })

  ipcMain.handle('pr-scores:get-score-detail', (_e, args: { repoFullName: string; prNumber: number }) => {
    const scores = store.get('scores')
    return scores.find((s) => s.repoFullName === args.repoFullName && s.prNumber === args.prNumber) ?? null
  })

  ipcMain.handle('pr-scores:clear-scores', (_e, args?: { repoFullName?: string }) => {
    if (args?.repoFullName) {
      store.set('scores', store.get('scores').filter((s) => s.repoFullName !== args.repoFullName))
      store.set('repoSnapshots', store.get('repoSnapshots').filter((s) => s.repoFullName !== args.repoFullName))
    } else {
      store.set('scores', [])
      store.set('repoSnapshots', [])
    }
    return { success: true }
  })

  ipcMain.handle('pr-scores:list-scored-repos', () => {
    const scores = store.get('scores')
    const counts: Record<string, number> = {}
    for (const s of scores) {
      counts[s.repoFullName] = (counts[s.repoFullName] ?? 0) + 1
    }
    return Object.entries(counts).map(([repoFullName, count]) => ({ repoFullName, count }))
  })

  ipcMain.handle('pr-scores:export-csv', (_e, args?: { repoFullName?: string }) => {
    const scores = store.get('scores')
    const filtered = args?.repoFullName
      ? scores.filter((s) => s.repoFullName === args.repoFullName)
      : scores
    const header = 'Scored At,Repo,PR Number,Title,Author,State,Score'
    if (filtered.length === 0) return header
    const rows = filtered.map((s) =>
      `${new Date(s.scoredAt).toISOString()},${escapeCsv(s.repoFullName)},${s.prNumber},${escapeCsv(s.title)},${escapeCsv(s.author)},${escapeCsv(s.state)},${s.score}`
    )
    return [header, ...rows].join('\n')
  })

  // ── Repo snapshots ───────────────────────────────────────────────────────

  ipcMain.handle('pr-scores:get-repo-metrics', (_e, args: { repoFullName: string }) => {
    const snapshots = store.get('repoSnapshots')
    return snapshots.find((s) => s.repoFullName === args.repoFullName) ?? null
  })

  // ── Operations requiring GitHub token ────────────────────────────────────

  ipcMain.handle('pr-scores:collect-prs', async (_e, args: { owner: string; repo: string; sinceDate?: string }) => {
    const token = getGitHubToken()
    if (!token) return { success: false, error: 'No GitHub token configured' }

    try {
      const pkg = await getPrScorePackage()
      if (!pkg) return { success: false, error: 'pull-request-score package not available' }
      const prs = await pkg.collectPullRequests({ owner: args.owner, repo: args.repo, token, since: args.sinceDate })
      return { success: true, prs }
    } catch (err) {
      log.error('[pr-scores] collect-prs error', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('pr-scores:score-pr', async (_e, args: { owner: string; repo: string; prNumber: number; includeFileAnalysis?: boolean }) => {
    const token = getGitHubToken()
    if (!token) return { success: false, error: 'No GitHub token configured' }

    try {
      const pkg = await getPrScorePackage()
      if (!pkg) return { success: false, error: 'pull-request-score package not available' }

      const prs = await pkg.collectPullRequests({ owner: args.owner, repo: args.repo, token, prNumber: args.prNumber })
      const pr = prs?.[0]
      if (!pr) return { success: false, error: `PR #${args.prNumber} not found` }

      let fileAnalysis: Record<string, unknown> | undefined
      if (args.includeFileAnalysis) {
        const files = await pkg.collectPrFiles({ owner: args.owner, repo: args.repo, token, prNumber: args.prNumber })
        fileAnalysis = pkg.analyzePrFiles(files)
      }

      const scored = pkg.scorePr(pr, pkg.defaultScorecard, fileAnalysis) as ScoredPr
      const id = randomUUID()
      const repoFullName = `${args.owner}/${args.repo}`
      const existing = store.get('scores').filter((s) => !(s.repoFullName === repoFullName && s.prNumber === args.prNumber))
      existing.push({ ...scored, id, repoFullName, scoredAt: Date.now(), fileAnalysis })
      store.set('scores', existing)
      return { success: true, score: scored }
    } catch (err) {
      log.error('[pr-scores] score-pr error', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('pr-scores:score-all', async (_e, args: { owner: string; repo: string; sinceDate?: string }) => {
    const token = getGitHubToken()
    if (!token) return { success: false, error: 'No GitHub token configured' }

    try {
      const pkg = await getPrScorePackage()
      if (!pkg) return { success: false, error: 'pull-request-score package not available' }

      const prs = await pkg.collectPullRequests({ owner: args.owner, repo: args.repo, token, since: args.sinceDate })
      const repoFullName = `${args.owner}/${args.repo}`
      const batch = (prs as ScoredPr[]).slice(0, 100)
      const scored: ScoredPr[] = []
      for (const pr of batch) {
        try {
          const s = pkg.scorePr(pr, pkg.defaultScorecard) as ScoredPr
          scored.push({ ...s, id: randomUUID(), repoFullName, scoredAt: Date.now() })
        } catch { /* skip individual failures */ }
      }
      const existing = store.get('scores').filter((s) => s.repoFullName !== repoFullName)
      store.set('scores', [...existing, ...scored])
      return { success: true, count: scored.length }
    } catch (err) {
      log.error('[pr-scores] score-all error', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('pr-scores:calculate-metrics', async (_e, args: { owner: string; repo: string }) => {
    const token = getGitHubToken()
    if (!token) return { success: false, error: 'No GitHub token configured' }

    try {
      const pkg = await getPrScorePackage()
      if (!pkg) return { success: false, error: 'pull-request-score package not available' }

      const repoFullName = `${args.owner}/${args.repo}`
      const scores = store.get('scores').filter((s) => s.repoFullName === repoFullName)
      const metrics = pkg.calculateMetrics(scores) as Record<string, unknown>
      const repoScore = pkg.scoreMetrics(metrics) as number
      const authorMetrics = pkg.calculateAuthorMetrics(scores) as unknown[]
      const snapshot: RepoSnapshot = { repoFullName, metrics, repoScore, authorMetrics, snapshotAt: Date.now() }
      const existing = store.get('repoSnapshots').filter((s) => s.repoFullName !== repoFullName)
      existing.push(snapshot)
      store.set('repoSnapshots', existing)
      return { success: true, snapshot }
    } catch (err) {
      log.error('[pr-scores] calculate-metrics error', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('pr-scores:compute-deltas', async (_e, args: { owner: string; repo: string; periodDays?: number }) => {
    const token = getGitHubToken()
    if (!token) return { success: false, error: 'No GitHub token configured' }

    try {
      const pkg = await getPrScorePackage()
      if (!pkg) return { success: false, error: 'pull-request-score package not available' }

      const config = store.get('config')
      const periodDays = args.periodDays ?? config.defaultTimeRangeDays
      const deltas = await pkg.computeDeltas({ owner: args.owner, repo: args.repo, token, periodDays })
      return { success: true, deltas }
    } catch (err) {
      log.error('[pr-scores] compute-deltas error', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('pr-scores:build-ai-context', async (_e, args: { owner: string; repo: string; prNumber: number }) => {
    const token = getGitHubToken()
    if (!token) return { success: false, error: 'No GitHub token configured' }

    try {
      const pkg = await getPrScorePackage()
      if (!pkg) return { success: false, error: 'pull-request-score package not available' }

      const files = await pkg.collectPrFiles({ owner: args.owner, repo: args.repo, token, prNumber: args.prNumber })
      if (!files || files.length === 0) return { success: false, error: `PR #${args.prNumber} not found or has no files` }
      const context = pkg.buildAiReviewContext(files) as string
      return { success: true, context }
    } catch (err) {
      log.error('[pr-scores] build-ai-context error', err)
      return { success: false, error: String(err) }
    }
  })
}
