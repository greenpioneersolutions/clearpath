import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { usePrScores, formatHours, timeAgo, PIE_COLORS } from '../../contexts/PrScoresContext'
import { getScoreLabel } from '../../types/prScores'
import type { ScoreDelta } from '../../types/prScores'
import StatCard from './StatCard'
import ScoreBadge from './ScoreBadge'

const PERIOD_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

export default function DashboardTab(): JSX.Element {
  const {
    selectedRepo, repoMetrics, scores, loading,
    openDashboard, setActiveTab,
  } = usePrScores()

  const [period, setPeriod] = useState(30)
  const [deltas, setDeltas] = useState<Record<string, ScoreDelta>>({})
  const [loadingDeltas, setLoadingDeltas] = useState(false)
  // Track which repo+period combo we've already fetched deltas for
  const [deltasFetchedFor, setDeltasFetchedFor] = useState<string | null>(null)

  // Auto-load metrics on mount if a repo is selected but no metrics yet
  useEffect(() => {
    if (selectedRepo && !repoMetrics && !loading) {
      void openDashboard()
    }
  }, [selectedRepo, repoMetrics, loading, openDashboard])

  // Fetch deltas only when repo or period actually changes (not on re-mount)
  useEffect(() => {
    if (!selectedRepo || !repoMetrics) return
    const key = `${selectedRepo.fullName}:${period}`
    if (deltasFetchedFor === key) return

    let cancelled = false
    async function fetchDeltas() {
      setLoadingDeltas(true)
      try {
        const result = await window.electronAPI.invoke('pr-scores:compute-deltas', {
          owner: selectedRepo!.owner,
          repo: selectedRepo!.repo,
          periodDays: period,
        }) as { success: boolean; deltas?: ScoreDelta[] }
        if (!cancelled && result.success && result.deltas) {
          const map: Record<string, ScoreDelta> = {}
          for (const d of result.deltas) {
            map[d.metric] = d
          }
          setDeltas(map)
          setDeltasFetchedFor(key)
        }
      } catch {
        // Non-critical
      }
      if (!cancelled) setLoadingDeltas(false)
    }
    void fetchDeltas()
    return () => { cancelled = true }
  }, [selectedRepo?.fullName, period, repoMetrics, deltasFetchedFor])

  // Change period — the delta effect above will re-fetch automatically
  const handlePeriodChange = useCallback((days: number) => {
    setPeriod(days)
    setDeltasFetchedFor(null) // Force delta re-fetch for new period
  }, [])

  // ── No repo or metrics ──────────────────────────────────────────────────

  if (!selectedRepo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">No Dashboard Data</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Select a repository and score some PRs first, then come back here for the dashboard.
        </p>
        <button
          onClick={() => setActiveTab('repositories')}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go to Repositories
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!repoMetrics) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-gray-500">Loading dashboard metrics...</p>
      </div>
    )
  }

  // ── Delta helper ────────────────────────────────────────────────────────

  const DeltaIndicator = ({ metric }: { metric: string }) => {
    const d = deltas[metric]
    if (!d || d.direction === 'flat') return null
    const isUp = d.direction === 'up'
    const pct = d.previous !== 0 ? Math.abs(d.delta / d.previous * 100).toFixed(1) : '--'
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${isUp ? 'text-green-600' : 'text-red-500'}`}>
        <svg className={`w-3 h-3 ${isUp ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 4.414l-3.293 3.293a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        {pct}%
      </span>
    )
  }

  // ── Chart data ──────────────────────────────────────────────────────────

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

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{selectedRepo.fullName}</h3>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => void handlePeriodChange(opt.days)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === opt.days
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {loadingDeltas && (
            <span className="text-[10px] text-gray-400 ml-2 animate-pulse">Loading deltas...</span>
          )}
        </div>
      </div>

      {/* Repo health summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 font-medium">Repo Score</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-gray-900 mt-1">{Math.round(repoMetrics.repoScore)}</p>
            <DeltaIndicator metric="repoScore" />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{getScoreLabel(repoMetrics.repoScore)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 font-medium">Merge Rate</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-gray-900 mt-1">{Math.round(repoMetrics.mergeRate * 100)}%</p>
            <DeltaIndicator metric="mergeRate" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 font-medium">Review Coverage</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-gray-900 mt-1">{Math.round(repoMetrics.reviewCoverage * 100)}%</p>
            <DeltaIndicator metric="reviewCoverage" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 font-medium">Build Success</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-gray-900 mt-1">{Math.round(repoMetrics.buildSuccessRate * 100)}%</p>
            <DeltaIndicator metric="buildSuccessRate" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 font-medium">Cycle Time (median)</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-gray-900 mt-1">{formatHours(repoMetrics.cycleTime?.median ?? 0)}</p>
            <DeltaIndicator metric="cycleTimeMedian" />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">p95: {formatHours(repoMetrics.cycleTime?.p95 ?? 0)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 font-medium">Pickup Time (median)</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-gray-900 mt-1">{formatHours(repoMetrics.pickupTime?.median ?? 0)}</p>
            <DeltaIndicator metric="pickupTimeMedian" />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">p95: {formatHours(repoMetrics.pickupTime?.p95 ?? 0)}</p>
        </div>
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={({ name, count }: any) => count > 0 ? `${name}: ${count}` : ''}
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
      {(repoMetrics.authorMetrics?.length ?? 0) > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Author Breakdown</h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Author bar chart */}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={(repoMetrics.authorMetrics ?? []).slice(0, 10).map((a) => ({
                  name: a.author ?? 'unknown',
                  score: Math.round(a.averageScore ?? 0),
                  prs: a.prCount ?? 0,
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
                  {(repoMetrics.authorMetrics ?? []).map((a) => (
                    <tr key={a.author} className="border-b border-gray-50">
                      <td className="py-2 text-gray-800 font-medium">{a.author ?? 'unknown'}</td>
                      <td className="py-2 text-right text-gray-600">{a.prCount ?? 0}</td>
                      <td className="py-2 text-right">
                        <ScoreBadge score={a.averageScore ?? 0} />
                      </td>
                      <td className="py-2 text-right text-gray-600">{formatHours(a.avgCycleTime ?? 0)}</td>
                      <td className="py-2 text-right font-mono text-gray-600">
                        {(a.totalLinesChanged ?? 0).toLocaleString()}
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
      <p className="text-xs text-gray-400 text-right">
        Snapshot taken {timeAgo(repoMetrics.snapshotAt)}
      </p>
    </div>
  )
}
