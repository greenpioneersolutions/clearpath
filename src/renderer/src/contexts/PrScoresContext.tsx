import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type {
  PrScoreResult, GitHubRepo, GitHubPR, RepoMetrics, AuthorMetric, PrScoresConfig,
} from '../types/prScores'
import { DEFAULT_PR_SCORES_CONFIG } from '../types/prScores'

// ── Helpers (re-exported for use in tab components) ─────────────────────────

export function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export function timeAgo(ts: number | string): string {
  const timestamp = typeof ts === 'string' ? new Date(ts).getTime() : ts
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export const BREAKDOWN_LABELS: Record<string, string> = {
  cycleTimeHours: 'Cycle Time',
  pickupTimeHours: 'Pickup Time',
  ciPassRate: 'CI Pass Rate',
  reviewerCount: 'Reviewer Count',
  linesChanged: 'Lines Changed',
  changeRequestRatio: 'Change Requests',
  idleTimeHours: 'Idle Time',
  revertRate: 'Revert Rate',
  fileRiskScore: 'File Risk',
  testHygieneRatio: 'Test Hygiene',
  securityPatternCount: 'Security Patterns',
}

export const PIE_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444']

// ── Types ───────────────────────────────────────────────────────────────────

export type PrScoresTab = 'repositories' | 'scores' | 'dashboard' | 'authors' | 'settings'

interface PrScoresContextValue {
  // Tab navigation
  activeTab: PrScoresTab
  setActiveTab: (tab: PrScoresTab) => void

  // Data
  repos: GitHubRepo[]
  prs: GitHubPR[]
  scores: PrScoreResult[]
  selectedRepo: { owner: string; repo: string; fullName: string } | null
  selectedPr: PrScoreResult | null
  repoMetrics: RepoMetrics | null
  repoMetricsCache: Record<string, RepoMetrics>
  config: PrScoresConfig
  githubConnected: boolean

  // Favorites
  favorites: string[]
  toggleFavorite: (fullName: string) => void

  // Loading / errors
  loading: boolean
  scoringPr: number | null
  scoreError: string | null
  scoringProgress: { current: number; total: number } | null
  repoError: string | null

  // Actions
  checkGitHub: () => Promise<void>
  loadRepos: () => Promise<void>
  loadConfig: () => Promise<void>
  selectRepo: (repo: GitHubRepo) => Promise<void>
  scoreSinglePr: (prNumber: number) => Promise<void>
  scoreAllPrs: () => Promise<void>
  openDashboard: () => Promise<void>
  saveConfig: (updated: PrScoresConfig) => Promise<void>
  setSelectedPr: (pr: PrScoreResult | null) => void
  setScoreError: (error: string | null) => void
  setGithubConnected: (connected: boolean) => void
  setRepoMetrics: (metrics: RepoMetrics | null) => void
  getScoreForPr: (prNumber: number) => PrScoreResult | undefined
}

const PrScoresContext = createContext<PrScoresContextValue | null>(null)

// ── Provider ────────────────────────────────────────────────────────────────

export function PrScoresProvider({ children }: { children: ReactNode }): JSX.Element {
  const [activeTab, setActiveTab] = useState<PrScoresTab>('repositories')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<{ owner: string; repo: string; fullName: string } | null>(null)
  const [prs, setPrs] = useState<GitHubPR[]>([])
  const [scores, setScores] = useState<PrScoreResult[]>([])
  const [selectedPr, setSelectedPr] = useState<PrScoreResult | null>(null)
  const [repoMetrics, setRepoMetrics] = useState<RepoMetrics | null>(null)
  const [repoMetricsCache, setRepoMetricsCache] = useState<Record<string, RepoMetrics>>({})
  const [loading, setLoading] = useState(false)
  const [scoringPr, setScoringPr] = useState<number | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [scoringProgress, setScoringProgress] = useState<{ current: number; total: number } | null>(null)
  const [config, setConfig] = useState<PrScoresConfig>(DEFAULT_PR_SCORES_CONFIG)
  const [githubConnected, setGithubConnected] = useState(false)
  const [repoError, setRepoError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<string[]>([])

  // ── Check GitHub connection ─────────────────────────────────────────────

  const checkGitHub = useCallback(async () => {
    const status = await window.electronAPI.invoke('integration:get-status') as {
      github: { connected: boolean; username: string } | null
    }
    setGithubConnected(status.github?.connected ?? false)
  }, [])

  const loadRepos = useCallback(async () => {
    setLoading(true)
    setRepoError(null)
    try {
      const result = await window.electronAPI.invoke('integration:github-repos', { perPage: 50 }) as {
        success: boolean; repos?: GitHubRepo[]; error?: string
      }
      if (result.success && result.repos) {
        setRepos(result.repos)
        if (result.repos.length === 0) {
          setRepoError('GitHub returned 0 repositories. Your token may need the "repo" scope (classic PAT) or "metadata: read" permission (fine-grained PAT).')
        }
      } else {
        setRepoError(result.error ?? 'Unknown error fetching repos')
      }
    } catch (err) {
      setRepoError(String(err))
    }
    setLoading(false)
  }, [])

  const loadConfig = useCallback(async () => {
    const cfg = await window.electronAPI.invoke('pr-scores:get-config') as PrScoresConfig
    if (cfg) setConfig(cfg)

    // Load favorites from config
    const stored = cfg as unknown as Record<string, unknown>
    if (stored && Array.isArray(stored['favorites'])) {
      setFavorites(stored['favorites'] as string[])
    }
  }, [])

  useEffect(() => {
    void checkGitHub()
    void loadConfig()
  }, [checkGitHub, loadConfig])

  useEffect(() => {
    if (githubConnected && activeTab === 'repositories' && repos.length === 0) {
      void loadRepos()
    }
  }, [githubConnected, activeTab, loadRepos, repos.length])

  // ── Favorites ───────────────────────────────────────────────────────────

  const toggleFavorite = useCallback((fullName: string) => {
    setFavorites((prev) => {
      const next = prev.includes(fullName)
        ? prev.filter((f) => f !== fullName)
        : [...prev, fullName]
      // Persist favorites alongside config
      void window.electronAPI.invoke('pr-scores:set-config', { ...config, favorites: next } as unknown as PrScoresConfig)
      return next
    })
  }, [config])

  // ── Repo selection handler ──────────────────────────────────────────────

  const selectRepo = useCallback(async (repo: GitHubRepo) => {
    const [owner, name] = repo.fullName.split('/')
    const sel = { owner, repo: name, fullName: repo.fullName }
    setSelectedRepo(sel)
    setLoading(true)
    setPrs([])
    setScores([])

    const [pullsResult, scoresResult] = await Promise.all([
      window.electronAPI.invoke('integration:github-pulls', {
        owner, repo: name, state: 'all', perPage: 50,
      }) as Promise<{ success: boolean; pulls?: GitHubPR[] }>,
      window.electronAPI.invoke('pr-scores:get-scores', {
        repoFullName: repo.fullName,
      }) as Promise<PrScoreResult[]>,
    ])

    if (pullsResult.success && pullsResult.pulls) {
      setPrs(pullsResult.pulls)
    }
    if (Array.isArray(scoresResult)) {
      setScores(scoresResult)
    }

    setLoading(false)
    setActiveTab('scores')
  }, [])

  // ── Score single PR ─────────────────────────────────────────────────────

  const scoreSinglePr = useCallback(async (prNumber: number) => {
    if (!selectedRepo) return
    setScoringPr(prNumber)
    setScoreError(null)
    try {
      const result = await window.electronAPI.invoke('pr-scores:score-pr', {
        owner: selectedRepo.owner,
        repo: selectedRepo.repo,
        prNumber,
        includeFileAnalysis: config.includeCodeAnalysis,
      }) as { success: boolean; score?: PrScoreResult; error?: string }

      if (result.success && result.score) {
        setScores((prev) => {
          const filtered = prev.filter((s) => s.prNumber !== prNumber)
          return [result.score!, ...filtered]
        })
      } else {
        setScoreError(`PR #${prNumber}: ${result.error ?? 'Scoring failed'}`)
      }
    } catch (err) {
      setScoreError(`PR #${prNumber}: ${String(err)}`)
    }
    setScoringPr(null)
  }, [selectedRepo, config.includeCodeAnalysis])

  // ── Score all PRs ───────────────────────────────────────────────────────

  const scoreAllPrs = useCallback(async () => {
    if (!selectedRepo) return
    setScoringProgress({ current: 0, total: prs.length })
    setLoading(true)

    const result = await window.electronAPI.invoke('pr-scores:score-all', {
      owner: selectedRepo.owner,
      repo: selectedRepo.repo,
    }) as { success: boolean; scores?: PrScoreResult[]; error?: string }

    if (result.success && result.scores) {
      setScores(result.scores)
      setScoringProgress({ current: result.scores.length, total: result.scores.length })
    }

    setTimeout(() => setScoringProgress(null), 1500)
    setLoading(false)
  }, [selectedRepo, prs.length])

  // ── Open dashboard ──────────────────────────────────────────────────────

  const openDashboard = useCallback(async () => {
    if (!selectedRepo) return
    setLoading(true)
    try {
      const result = await window.electronAPI.invoke('pr-scores:calculate-metrics', {
        owner: selectedRepo.owner,
        repo: selectedRepo.repo,
      }) as { success: boolean; snapshot?: { metrics: Record<string, unknown>; repoScore: number; authorMetrics: AuthorMetric[]; snapshotAt: number }; error?: string }

      if (result.success && result.snapshot) {
        const snap = result.snapshot
        const m = snap.metrics ?? {}
        const metrics: RepoMetrics = {
          repoFullName: selectedRepo.fullName,
          mergeRate: (m['mergeRate'] as number) ?? 0,
          reviewCoverage: (m['reviewCoverage'] as number) ?? 0,
          buildSuccessRate: (m['buildSuccessRate'] as number) ?? 0,
          stalePrCount: (m['stalePrCount'] as number) ?? 0,
          prBacklog: (m['prBacklog'] as number) ?? 0,
          outsizedPrRatio: (m['outsizedPrRatio'] as number) ?? 0,
          cycleTime: (m['cycleTime'] as { median: number; p95: number }) ?? { median: 0, p95: 0 },
          pickupTime: (m['pickupTime'] as { median: number; p95: number }) ?? { median: 0, p95: 0 },
          repoScore: snap.repoScore ?? 0,
          authorMetrics: (snap.authorMetrics ?? []) as AuthorMetric[],
          snapshotAt: snap.snapshotAt ?? Date.now(),
        }
        setRepoMetrics(metrics)
        setRepoMetricsCache((prev) => ({ ...prev, [selectedRepo.fullName]: metrics }))
      } else {
        setScoreError(result.error ?? 'Failed to load dashboard metrics')
      }
    } catch (err) {
      setScoreError(`Dashboard error: ${String(err)}`)
    }
    setActiveTab('dashboard')
    setLoading(false)
  }, [selectedRepo])

  // ── Save config ─────────────────────────────────────────────────────────

  const saveConfig = useCallback(async (updated: PrScoresConfig) => {
    await window.electronAPI.invoke('pr-scores:set-config', updated)
    setConfig(updated)
  }, [])

  // ── Find score for PR ───────────────────────────────────────────────────

  const getScoreForPr = useCallback((prNumber: number): PrScoreResult | undefined => {
    return scores.find((s) => s.prNumber === prNumber)
  }, [scores])

  // ── Context value ───────────────────────────────────────────────────────

  const value: PrScoresContextValue = {
    activeTab,
    setActiveTab,
    repos,
    prs,
    scores,
    selectedRepo,
    selectedPr,
    repoMetrics,
    repoMetricsCache,
    config,
    githubConnected,
    favorites,
    toggleFavorite,
    loading,
    scoringPr,
    scoreError,
    scoringProgress,
    repoError,
    checkGitHub,
    loadRepos,
    loadConfig,
    selectRepo,
    scoreSinglePr,
    scoreAllPrs,
    openDashboard,
    saveConfig,
    setSelectedPr,
    setScoreError,
    setGithubConnected,
    setRepoMetrics,
    getScoreForPr,
  }

  return (
    <PrScoresContext.Provider value={value}>
      {children}
    </PrScoresContext.Provider>
  )
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePrScores(): PrScoresContextValue {
  const ctx = useContext(PrScoresContext)
  if (!ctx) {
    throw new Error('usePrScores must be used within a PrScoresProvider')
  }
  return ctx
}
