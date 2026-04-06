import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useFeatureFlags } from '../contexts/FeatureFlagContext'
import type {
  PrScoreResult, GitHubRepo, GitHubPR, RepoMetrics, AuthorMetric, PrScoresConfig,
} from '../types/prScores'
import { getScoreColor, getScoreLabel, DEFAULT_PR_SCORES_CONFIG } from '../types/prScores'

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const BREAKDOWN_LABELS: Record<string, string> = {
  cycleTimeHours: 'Cycle Time',
  pickupTimeHours: 'Pickup Time',
  ciPassRate: 'CI Pass Rate',
  reviewerCount: 'Reviewer Count',
  linesChanged: 'Lines Changed',
}

const PIE_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444']

// ── StatCard (matches Analytics.tsx) ────────────────────────────────────────

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }): JSX.Element {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ── ScoreBadge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }): JSX.Element {
  const color = getScoreColor(score)
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: color }}
      title={`${Math.round(score)} - ${getScoreLabel(score)}`}
    >
      {Math.round(score)}
      <span className="sr-only"> - {getScoreLabel(score)}</span>
    </span>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

type ViewState = 'repos' | 'prs' | 'detail' | 'dashboard'

export default function PrScores(): JSX.Element {
  const { flags } = useFeatureFlags()

  const [view, setView] = useState<ViewState>('repos')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<{ owner: string; repo: string; fullName: string } | null>(null)
  const [prs, setPrs] = useState<GitHubPR[]>([])
  const [scores, setScores] = useState<PrScoreResult[]>([])
  const [selectedPr, setSelectedPr] = useState<PrScoreResult | null>(null)
  const [repoMetrics, setRepoMetrics] = useState<RepoMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [scoringPr, setScoringPr] = useState<number | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [scoringProgress, setScoringProgress] = useState<{ current: number; total: number } | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [config, setConfig] = useState<PrScoresConfig>(DEFAULT_PR_SCORES_CONFIG)
  const [repoError, setRepoError] = useState<string | null>(null)

  // ── Feature gate ────────────────────────────────────────────────────────

  if (!flags.enableExperimentalFeatures || !flags.showPrScores) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">PR Scores is Disabled</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Enable experimental features and the PR Scores flag in Settings &gt; Feature Flags to use this feature.
        </p>
      </div>
    )
  }

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
  }, [])

  useEffect(() => {
    void checkGitHub()
    void loadConfig()
  }, [checkGitHub, loadConfig])

  useEffect(() => {
    if (githubConnected && view === 'repos') {
      void loadRepos()
    }
  }, [githubConnected, view, loadRepos])

  // ── GitHub not connected prompt ─────────────────────────────────────────

  if (!githubConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PR Scores</h1>
          <p className="text-sm text-gray-500 mt-0.5">Score and analyze your pull requests</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Connect GitHub</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            PR Scores requires a GitHub connection to fetch repositories and pull requests.
            Connect your account in Settings &gt; Integrations.
          </p>
          <button
            onClick={() => window.electronAPI.invoke('navigate:configure-integrations')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go to Integrations
          </button>
        </div>
      </div>
    )
  }

  // ── Repo selection handler ──────────────────────────────────────────────

  const selectRepo = async (repo: GitHubRepo) => {
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
    setView('prs')
  }

  // ── Score single PR ─────────────────────────────────────────────────────

  const scoreSinglePr = async (prNumber: number) => {
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
  }

  // ── Score all PRs ───────────────────────────────────────────────────────

  const scoreAllPrs = async () => {
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
  }

  // ── View detail ─────────────────────────────────────────────────────────

  const viewDetail = (pr: PrScoreResult) => {
    setSelectedPr(pr)
    setView('detail')
  }

  // ── Open dashboard ──────────────────────────────────────────────────────

  const openDashboard = async () => {
    if (!selectedRepo) return
    setLoading(true)
    const result = await window.electronAPI.invoke('pr-scores:calculate-metrics', {
      owner: selectedRepo.owner,
      repo: selectedRepo.repo,
    }) as { success: boolean; snapshot?: { metrics: Record<string, unknown>; repoScore: number; authorMetrics: AuthorMetric[]; snapshotAt: number } }

    if (result.success && result.snapshot) {
      const snap = result.snapshot
      setRepoMetrics({
        repoFullName: selectedRepo.fullName,
        mergeRate: (snap.metrics['mergeRate'] as number) ?? 0,
        reviewCoverage: (snap.metrics['reviewCoverage'] as number) ?? 0,
        buildSuccessRate: (snap.metrics['buildSuccessRate'] as number) ?? 0,
        stalePrCount: (snap.metrics['stalePrCount'] as number) ?? 0,
        prBacklog: (snap.metrics['prBacklog'] as number) ?? 0,
        outsizedPrRatio: (snap.metrics['outsizedPrRatio'] as number) ?? 0,
        cycleTime: (snap.metrics['cycleTime'] as { median: number; p95: number }) ?? { median: 0, p95: 0 },
        pickupTime: (snap.metrics['pickupTime'] as { median: number; p95: number }) ?? { median: 0, p95: 0 },
        repoScore: snap.repoScore,
        authorMetrics: snap.authorMetrics as AuthorMetric[],
        snapshotAt: snap.snapshotAt,
      })
    }
    setView('dashboard')
    setLoading(false)
  }

  // ── Save config ─────────────────────────────────────────────────────────

  const saveConfig = async (updated: PrScoresConfig) => {
    await window.electronAPI.invoke('pr-scores:set-config', updated)
    setConfig(updated)
    setShowConfig(false)
  }

  // ── Back navigation ─────────────────────────────────────────────────────

  const goBack = () => {
    if (view === 'detail') {
      setSelectedPr(null)
      setView('prs')
    } else if (view === 'dashboard') {
      setRepoMetrics(null)
      setView('prs')
    } else if (view === 'prs') {
      setSelectedRepo(null)
      setPrs([])
      setScores([])
      setView('repos')
    }
  }

  // ── Find score for PR ───────────────────────────────────────────────────

  const getScoreForPr = (prNumber: number): PrScoreResult | undefined => {
    return scores.find((s) => s.prNumber === prNumber)
  }

  // ── Breadcrumbs ─────────────────────────────────────────────────────────

  const breadcrumbs: Array<{ label: string; onClick?: () => void }> = [
    { label: 'PR Scores', onClick: view !== 'repos' ? () => { setSelectedRepo(null); setPrs([]); setScores([]); setView('repos') } : undefined },
  ]
  if (selectedRepo && view !== 'repos') {
    breadcrumbs.push({
      label: selectedRepo.fullName,
      onClick: view !== 'prs' ? () => { setSelectedPr(null); setRepoMetrics(null); setView('prs') } : undefined,
    })
  }
  if (view === 'detail' && selectedPr) {
    breadcrumbs.push({ label: `PR #${selectedPr.prNumber}` })
  }
  if (view === 'dashboard') {
    breadcrumbs.push({ label: 'Dashboard' })
  }

  // ── Dashboard chart data ────────────────────────────────────────────────

  const scoreDistributionData = (() => {
    if (scores.length === 0) return []
    const buckets = [
      { name: 'Excellent (80+)', range: [80, 100], count: 0 },
      { name: 'Good (60-79)', range: [60, 79], count: 0 },
      { name: 'Fair (40-59)', range: [40, 59], count: 0 },
      { name: 'Needs Work (<40)', range: [0, 39], count: 0 },
    ]
    for (const s of scores) {
      for (const b of buckets) {
        if (s.score >= b.range[0] && s.score <= b.range[1]) {
          b.count++
          break
        }
      }
    }
    return buckets
  })()

  const scoreTrendData = (() => {
    if (scores.length === 0) return []
    const sorted = [...scores].sort((a, b) => a.scoredAt - b.scoredAt)
    return sorted.map((s) => ({
      name: `#${s.prNumber}`,
      score: Math.round(s.score),
      date: new Date(s.scoredAt).toLocaleDateString(),
    }))
  })()

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-sm mb-1">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-300">/</span>}
                {crumb.onClick ? (
                  <button
                    onClick={crumb.onClick}
                    className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="text-gray-900 font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-500">
            {view === 'repos' && 'Select a repository to score its pull requests'}
            {view === 'prs' && `${prs.length} pull requests found`}
            {view === 'detail' && selectedPr && `Score: ${Math.round(selectedPr.score)} - ${getScoreLabel(selectedPr.score)}`}
            {view === 'dashboard' && repoMetrics && `Repo health score: ${Math.round(repoMetrics.repoScore)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
            Experimental
          </span>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Configuration"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">PR Scores Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Default Time Range (days)</label>
              <input
                type="number"
                value={config.defaultTimeRangeDays}
                onChange={(e) => setConfig({ ...config, defaultTimeRangeDays: parseInt(e.target.value) || 30 })}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label Filters (comma-separated)</label>
              <input
                type="text"
                value={config.labelFilters.join(', ')}
                onChange={(e) => setConfig({ ...config, labelFilters: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. bug, feature"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Exclude Labels (comma-separated)</label>
              <input
                type="text"
                value={config.excludeLabels.join(', ')}
                onChange={(e) => setConfig({ ...config, excludeLabels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. wip, do-not-merge"
              />
            </div>
            <div className="flex items-center gap-6 pt-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includeCodeAnalysis}
                  onChange={(e) => setConfig({ ...config, includeCodeAnalysis: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Include Code Analysis
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enableAiReview}
                  onChange={(e) => setConfig({ ...config, enableAiReview: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Enable AI Review
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowConfig(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void saveConfig(config)}
              className="px-4 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Back button for non-repos views */}
      {view !== 'repos' && (
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      )}

      {/* Loading skeleton */}
      {loading && !scoringProgress && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Scoring progress */}
      {scoringProgress && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-indigo-800">
              Scoring PRs... {scoringProgress.current} / {scoringProgress.total}
            </span>
            <span className="text-xs text-indigo-600">
              {scoringProgress.total > 0 ? Math.round((scoringProgress.current / scoringProgress.total) * 100) : 0}%
            </span>
          </div>
          <div className="w-full bg-indigo-100 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${scoringProgress.total > 0 ? (scoringProgress.current / scoringProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* ── REPOS VIEW ─────────────────────────────────────────────────────── */}
      {view === 'repos' && !loading && (
        <>
          {repos.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto space-y-3">
              <p className="text-sm text-gray-500">No repositories found.</p>
              {repoError && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-left">
                  <p className="text-xs font-medium text-amber-800 mb-1">Details</p>
                  <p className="text-xs text-amber-700 break-words">{repoError}</p>
                </div>
              )}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => void loadRepos()}
                  className="text-xs text-indigo-600 hover:text-indigo-500 font-medium"
                >Retry</button>
                {repoError && repoError.includes('disconnect') && (
                  <button
                    onClick={async () => {
                      await window.electronAPI.invoke('integration:github-disconnect')
                      setGithubConnected(false)
                    }}
                    className="text-xs text-red-500 hover:text-red-400 font-medium"
                  >Disconnect &amp; Reconnect</button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {repos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => void selectRepo(repo)}
                  className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 truncate transition-colors">
                        {repo.fullName}
                      </h3>
                      {repo.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{repo.description}</p>
                      )}
                    </div>
                    {repo.private && (
                      <span className="ml-2 flex-shrink-0">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    {repo.language && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                        {repo.language}
                      </span>
                    )}
                    {repo.pushedAt && (
                      <span className="text-xs text-gray-400">
                        Updated {new Date(repo.pushedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── PRS VIEW ───────────────────────────────────────────────────────── */}
      {view === 'prs' && !loading && selectedRepo && (
        <>
          {/* Action bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {scores.length} of {prs.length} PRs scored
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void openDashboard()}
                className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                Dashboard
              </button>
              <button
                onClick={() => void scoreAllPrs()}
                disabled={loading || prs.length === 0}
                className="px-4 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Score All PRs
              </button>
            </div>
          </div>

          {/* Summary stats */}
          {scores.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Average Score"
                value={String(Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length))}
                subtitle={getScoreLabel(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)}
              />
              <StatCard
                label="PRs Scored"
                value={`${scores.length}`}
                subtitle={`of ${prs.length} total`}
              />
              <StatCard
                label="Highest Score"
                value={String(Math.round(Math.max(...scores.map((s) => s.score))))}
              />
              <StatCard
                label="Lowest Score"
                value={String(Math.round(Math.min(...scores.map((s) => s.score))))}
              />
            </div>
          )}

          {/* PR list */}
          {prs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">No pull requests found in this repository.</p>
            </div>
          ) : (
            <>
            {scoreError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center justify-between">
                <p className="text-xs text-red-700">{scoreError}</p>
                <button onClick={() => setScoreError(null)} className="text-xs text-red-400 hover:text-red-600 ml-3">Dismiss</button>
              </div>
            )}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 font-medium">PR</th>
                    <th className="px-4 py-3 font-medium">Author</th>
                    <th className="px-4 py-3 font-medium">State</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium text-center">Lines Changed</th>
                    <th className="px-4 py-3 font-medium text-center">Score</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {prs.map((pr) => {
                    const scored = getScoreForPr(pr.number)
                    const isScoring = scoringPr === pr.number
                    const displayDate = pr.mergedAt ?? pr.updatedAt ?? pr.createdAt
                    return (
                      <tr key={pr.number} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isScoring ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <div>
                            <span className="font-medium text-gray-900">#{pr.number}</span>
                            <span className="text-gray-600 ml-2 truncate">{pr.title}</span>
                          </div>
                          {pr.labels.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {pr.labels.slice(0, 3).map((label) => (
                                <span key={label} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{pr.author}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            pr.state === 'open'
                              ? 'bg-green-50 text-green-700'
                              : pr.mergedAt
                                ? 'bg-purple-50 text-purple-700'
                                : 'bg-red-50 text-red-700'
                          }`}>
                            {pr.mergedAt ? 'merged' : pr.state}
                          </span>
                          {pr.draft && <span className="ml-1 text-xs text-gray-400">draft</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-600">
                            {new Date(displayDate).toLocaleDateString()}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {pr.mergedAt ? 'merged' : pr.state === 'open' ? 'opened' : 'closed'} {timeAgo(displayDate)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {pr.additions != null ? (
                          <>
                          <div className="flex items-center justify-center gap-1.5 text-xs">
                            <span className="text-green-600" title="Lines added">+{pr.additions.toLocaleString()}</span>
                            <span className="text-gray-300">/</span>
                            <span className="text-red-600" title="Lines deleted">-{(pr.deletions ?? 0).toLocaleString()}</span>
                          </div>
                          {(pr.changedFiles ?? 0) > 0 && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {pr.changedFiles} file{pr.changedFiles !== 1 ? 's' : ''}
                            </div>
                          )}
                          </>
                          ) : (
                            <span className="text-xs text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {scored ? (
                            <button onClick={() => viewDetail(scored)} className="hover:opacity-80 transition-opacity">
                              <ScoreBadge score={scored.score} />
                            </button>
                          ) : isScoring ? (
                            <span className="text-xs text-indigo-500 animate-pulse">Scoring...</span>
                          ) : (
                            <span className="text-xs text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {scored ? (
                              <button
                                onClick={() => viewDetail(scored)}
                                className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              >
                                Details
                              </button>
                            ) : (
                              <button
                                onClick={() => void scoreSinglePr(pr.number)}
                                disabled={isScoring || scoringPr !== null}
                                className="px-2 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50 transition-colors"
                              >
                                {isScoring ? 'Scoring...' : 'Score'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}

      {/* ── DETAIL VIEW ────────────────────────────────────────────────────── */}
      {view === 'detail' && selectedPr && (
        <>
          {/* Score header */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  #{selectedPr.prNumber} {selectedPr.title}
                </h2>
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                  <span>by {selectedPr.author}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    selectedPr.state === 'open'
                      ? 'bg-green-50 text-green-700'
                      : selectedPr.state === 'closed'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-purple-50 text-purple-700'
                  }`}>
                    {selectedPr.state}
                  </span>
                  <span>Scored {timeAgo(selectedPr.scoredAt)}</span>
                </div>
              </div>
              <div className="text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold"
                  style={{ backgroundColor: getScoreColor(selectedPr.score) }}
                >
                  {Math.round(selectedPr.score)}
                </div>
                <p className="text-xs text-gray-500 mt-1 font-medium">{getScoreLabel(selectedPr.score)}</p>
              </div>
            </div>
          </div>

          {/* Breakdown bars */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Score Breakdown</h3>
            <div className="space-y-4">
              {Object.entries(selectedPr.breakdown).map(([key, val]) => {
                const label = BREAKDOWN_LABELS[key] || key
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          Raw: {typeof val.raw === 'number' ? val.raw.toFixed(1) : val.raw}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {(val.weighted).toFixed(1)}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(val.normalized * 100, 100)}%`,
                          backgroundColor: getScoreColor(val.normalized * 100),
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* File analysis (if available) */}
          {selectedPr.fileAnalysis && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">File Analysis</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Risk Score"
                  value={String(Math.round(selectedPr.fileAnalysis.riskScore))}
                />
                <StatCard
                  label="Review Depth"
                  value={selectedPr.fileAnalysis.reviewDepthSignal}
                />
                <StatCard
                  label="Complexity"
                  value={selectedPr.fileAnalysis.reviewDepthSignal === 'simple' ? 'Low' : selectedPr.fileAnalysis.reviewDepthSignal === 'complex' ? 'Medium' : 'High'}
                />
              </div>
            </div>
          )}

          {/* AI review button */}
          {config.enableAiReview && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">AI Review</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Send this PR to your active CLI agent for a detailed code review
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!selectedRepo) return
                    await window.electronAPI.invoke('pr-scores:build-ai-context', {
                      owner: selectedRepo.owner,
                      repo: selectedRepo.repo,
                      prNumber: selectedPr.prNumber,
                    })
                  }}
                  className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Generate AI Review
                </button>
              </div>
            </div>
          )}

          {/* Re-score button */}
          <div className="flex justify-end">
            <button
              onClick={() => void scoreSinglePr(selectedPr.prNumber)}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
            >
              Re-Score This PR
            </button>
          </div>
        </>
      )}

      {/* ── DASHBOARD VIEW ─────────────────────────────────────────────────── */}
      {view === 'dashboard' && !loading && selectedRepo && (
        <>
          {/* Repo health summary */}
          {repoMetrics && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Repo Score"
                  value={String(Math.round(repoMetrics.repoScore))}
                  subtitle={getScoreLabel(repoMetrics.repoScore)}
                />
                <StatCard
                  label="Merge Rate"
                  value={`${Math.round(repoMetrics.mergeRate * 100)}%`}
                />
                <StatCard
                  label="Review Coverage"
                  value={`${Math.round(repoMetrics.reviewCoverage * 100)}%`}
                />
                <StatCard
                  label="Build Success"
                  value={`${Math.round(repoMetrics.buildSuccessRate * 100)}%`}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Cycle Time (median)"
                  value={formatHours(repoMetrics.cycleTime.median)}
                  subtitle={`p95: ${formatHours(repoMetrics.cycleTime.p95)}`}
                />
                <StatCard
                  label="Pickup Time (median)"
                  value={formatHours(repoMetrics.pickupTime.median)}
                  subtitle={`p95: ${formatHours(repoMetrics.pickupTime.p95)}`}
                />
                <StatCard
                  label="Stale PRs"
                  value={String(repoMetrics.stalePrCount)}
                />
                <StatCard
                  label="PR Backlog"
                  value={String(repoMetrics.prBacklog)}
                  subtitle={`${Math.round(repoMetrics.outsizedPrRatio * 100)}% outsized`}
                />
              </div>
            </>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Score Distribution */}
            {scoreDistributionData.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Score Distribution</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={scoreDistributionData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, count }) => count > 0 ? `${name}: ${count}` : ''}
                      labelLine={false}
                    >
                      {scoreDistributionData.map((_entry, index) => (
                        <Cell key={index} fill={PIE_COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Score Trend */}
            {scoreTrendData.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Score Trend</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={scoreTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#5B4FC4"
                      strokeWidth={2}
                      dot={{ fill: '#5B4FC4', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Author Breakdown */}
          {repoMetrics && repoMetrics.authorMetrics.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Author Breakdown</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Author bar chart */}
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={repoMetrics.authorMetrics.slice(0, 10).map((a) => ({
                      name: a.author,
                      score: Math.round(a.averageScore),
                      prs: a.prCount,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fontSize: 11 }}
                      stroke="#9ca3af"
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Legend />
                    <Bar dataKey="score" fill="#5B4FC4" name="Avg Score" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Author table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">Author</th>
                        <th className="pb-2 font-medium text-right">PRs</th>
                        <th className="pb-2 font-medium text-right">Avg Score</th>
                        <th className="pb-2 font-medium text-right">Cycle Time</th>
                        <th className="pb-2 font-medium text-right">Lines</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repoMetrics.authorMetrics.map((a) => (
                        <tr key={a.author} className="border-b border-gray-50">
                          <td className="py-2 text-gray-800 font-medium">{a.author}</td>
                          <td className="py-2 text-right text-gray-600">{a.prCount}</td>
                          <td className="py-2 text-right">
                            <ScoreBadge score={a.averageScore} />
                          </td>
                          <td className="py-2 text-right text-gray-600">{formatHours(a.avgCycleTime)}</td>
                          <td className="py-2 text-right font-mono text-gray-600">
                            {a.totalLinesChanged.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Snapshot time */}
          {repoMetrics && (
            <p className="text-xs text-gray-400 text-right">
              Snapshot taken {timeAgo(repoMetrics.snapshotAt)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
