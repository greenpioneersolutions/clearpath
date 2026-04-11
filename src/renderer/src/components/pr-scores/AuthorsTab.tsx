import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { usePrScores, formatHours } from '../../contexts/PrScoresContext'
import type { AuthorMetric } from '../../types/prScores'
import ScoreBadge from './ScoreBadge'

type SortField = 'author' | 'prCount' | 'averageScore' | 'avgCycleTime' | 'totalLinesChanged'
type SortDir = 'asc' | 'desc'

export default function AuthorsTab(): JSX.Element {
  const {
    selectedRepo, repoMetrics, loading, config, setActiveTab,
  } = usePrScores()

  const [authorMetrics, setAuthorMetrics] = useState<AuthorMetric[]>([])
  const [sortField, setSortField] = useState<SortField>('averageScore')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [groupByTeam, setGroupByTeam] = useState(false)
  const [metricsLoading, setMetricsLoading] = useState(false)

  // Load author metrics
  useEffect(() => {
    if (repoMetrics?.authorMetrics) {
      setAuthorMetrics(repoMetrics.authorMetrics)
      return
    }
    if (!selectedRepo || loading) return

    async function loadMetrics() {
      setMetricsLoading(true)
      try {
        const result = await window.electronAPI.invoke('pr-scores:calculate-metrics', {
          owner: selectedRepo!.owner,
          repo: selectedRepo!.repo,
        }) as { success: boolean; snapshot?: { authorMetrics: AuthorMetric[] } }
        if (result.success && result.snapshot?.authorMetrics) {
          setAuthorMetrics(result.snapshot.authorMetrics)
        }
      } catch {
        // Non-critical
      }
      setMetricsLoading(false)
    }
    void loadMetrics()
  }, [selectedRepo, repoMetrics, loading])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }, [sortField])

  const sortedAuthors = useMemo(() => {
    const sorted = [...authorMetrics]
    const dir = sortDir === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      switch (sortField) {
        case 'author': return a.author.localeCompare(b.author) * dir
        case 'prCount': return ((a.prCount ?? 0) - (b.prCount ?? 0)) * dir
        case 'averageScore': return ((a.averageScore ?? 0) - (b.averageScore ?? 0)) * dir
        case 'avgCycleTime': return ((a.avgCycleTime ?? 0) - (b.avgCycleTime ?? 0)) * dir
        case 'totalLinesChanged': return ((a.totalLinesChanged ?? 0) - (b.totalLinesChanged ?? 0)) * dir
        default: return 0
      }
    })
    return sorted
  }, [authorMetrics, sortField, sortDir])

  // Team grouping
  const teamMapping = config.teamMapping ?? {}
  const hasTeams = Object.keys(teamMapping).length > 0

  const groupedByTeam = useMemo(() => {
    if (!groupByTeam || !hasTeams) return null
    const groups: Record<string, AuthorMetric[]> = {}
    for (const a of sortedAuthors) {
      const team = teamMapping[a.author] ?? 'Unassigned'
      if (!groups[team]) groups[team] = []
      groups[team].push(a)
    }
    return groups
  }, [sortedAuthors, groupByTeam, hasTeams, teamMapping])

  const top10Chart = useMemo(() => {
    return [...authorMetrics]
      .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0))
      .slice(0, 10)
      .map((a) => ({
        name: a.author ?? 'unknown',
        score: Math.round(a.averageScore ?? 0),
        prs: a.prCount ?? 0,
      }))
  }, [authorMetrics])

  const SortHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th
      className={`pb-2 font-medium cursor-pointer hover:text-gray-700 select-none transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field && (
          <svg className={`w-3 h-3 transition-transform ${sortDir === 'asc' ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 4.414l-3.293 3.293a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </span>
    </th>
  )

  // ── No repo ─────────────────────────────────────────────────────────────

  if (!selectedRepo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Author Analytics</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Select a repository from the Repositories tab to view author analytics.
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

  if (metricsLoading || loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (authorMetrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-lg font-semibold text-gray-900">No Author Data</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Score some PRs first to see author analytics. Go to the Scores tab and click "Score All PRs".
        </p>
        <button
          onClick={() => setActiveTab('scores')}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go to Scores
        </button>
      </div>
    )
  }

  const renderAuthorTable = (authors: AuthorMetric[]) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
          <SortHeader field="author">Author</SortHeader>
          <SortHeader field="prCount" className="text-right">PRs</SortHeader>
          <SortHeader field="averageScore" className="text-right">Avg Score</SortHeader>
          <SortHeader field="avgCycleTime" className="text-right">Cycle Time</SortHeader>
          <SortHeader field="totalLinesChanged" className="text-right">Lines Changed</SortHeader>
        </tr>
      </thead>
      <tbody>
        {authors.map((a) => (
          <tr key={a.author} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
            <td className="py-2.5 text-gray-800 font-medium">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {a.author.charAt(0).toUpperCase()}
                </div>
                {a.author}
                {hasTeams && teamMapping[a.author] && (
                  <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                    {teamMapping[a.author]}
                  </span>
                )}
              </div>
            </td>
            <td className="py-2.5 text-right text-gray-600">{a.prCount ?? 0}</td>
            <td className="py-2.5 text-right">
              <ScoreBadge score={a.averageScore ?? 0} />
            </td>
            <td className="py-2.5 text-right text-gray-600">{formatHours(a.avgCycleTime ?? 0)}</td>
            <td className="py-2.5 text-right font-mono text-gray-600">
              {(a.totalLinesChanged ?? 0).toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="space-y-6">
      {/* Header with team toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Author Analytics</h3>
          <p className="text-xs text-gray-500 mt-0.5">{authorMetrics.length} contributors in {selectedRepo.fullName}</p>
        </div>
        {hasTeams && (
          <button
            onClick={() => setGroupByTeam(!groupByTeam)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              groupByTeam
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Group by Team
          </button>
        )}
      </div>

      {/* Top 10 bar chart */}
      {top10Chart.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Top 10 Authors by Average Score</h4>
          <ResponsiveContainer width="100%" height={Math.max(200, top10Chart.length * 35)}>
            <BarChart
              data={top10Chart}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [
                  name === 'score' ? `${value}/100` : value,
                  name === 'score' ? 'Avg Score' : 'PR Count'
                ]}
              />
              <Bar dataKey="score" fill="#5B4FC4" name="score" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Author table */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
        {groupByTeam && groupedByTeam ? (
          <div className="space-y-6">
            {Object.entries(groupedByTeam).sort(([a], [b]) => a.localeCompare(b)).map(([team, members]) => (
              <div key={team}>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {team} ({members.length})
                </h4>
                {renderAuthorTable(members)}
              </div>
            ))}
          </div>
        ) : (
          renderAuthorTable(sortedAuthors)
        )}
      </div>
    </div>
  )
}
