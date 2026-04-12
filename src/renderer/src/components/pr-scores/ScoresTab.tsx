import { useState, useMemo, useCallback } from 'react'
import { usePrScores, timeAgo } from '../../contexts/PrScoresContext'
import { getScoreLabel, DEFAULT_PR_FILTERS } from '../../types/prScores'
import type { PrFilters, GitHubPR } from '../../types/prScores'
import StatCard from './StatCard'
import ScoreBadge from './ScoreBadge'
import ScoreBreakdownPanel from './ScoreBreakdownPanel'
import FilterBar from './FilterBar'

type SortField = 'number' | 'author' | 'state' | 'date' | 'lines' | 'score'
type SortDir = 'asc' | 'desc'

export default function ScoresTab(): JSX.Element {
  const {
    selectedRepo, prs, scores, loading, scoringPr, scoreError,
    scoringProgress, config,
    scoreSinglePr, scoreAllPrs, setActiveTab, setScoreError,
    getScoreForPr,
  } = usePrScores()

  const [expandedPr, setExpandedPr] = useState<number | null>(null)
  const [filters, setFilters] = useState<PrFilters>({ ...DEFAULT_PR_FILTERS })
  const [sortField, setSortField] = useState<SortField>('number')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Unique authors and labels for filter bar
  const uniqueAuthors = useMemo(() => {
    const set = new Set(prs.map((p) => p.author))
    return Array.from(set).sort()
  }, [prs])

  const uniqueLabels = useMemo(() => {
    const set = new Set(prs.flatMap((p) => p.labels))
    return Array.from(set).sort()
  }, [prs])

  // Filter PRs
  const filteredPrs = useMemo(() => {
    return prs.filter((pr) => {
      if (filters.author && pr.author !== filters.author) return false
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!pr.title.toLowerCase().includes(q) && !`#${pr.number}`.includes(q)) return false
      }
      if (filters.state !== 'all') {
        if (filters.state === 'merged') {
          if (!pr.mergedAt) return false
        } else if (filters.state === 'open') {
          if (pr.state !== 'open') return false
        } else if (filters.state === 'closed') {
          if (pr.state !== 'closed' || pr.mergedAt) return false
        }
      }
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom).getTime()
        if (new Date(pr.createdAt).getTime() < from) return false
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo).getTime() + 86400000 // end of day
        if (new Date(pr.createdAt).getTime() > to) return false
      }
      if (filters.labels.length > 0) {
        if (!filters.labels.some((l) => pr.labels.includes(l))) return false
      }
      return true
    })
  }, [prs, filters])

  // Sort PRs
  const sortedPrs = useMemo(() => {
    const sorted = [...filteredPrs]
    const dir = sortDir === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      switch (sortField) {
        case 'number': return (a.number - b.number) * dir
        case 'author': return a.author.localeCompare(b.author) * dir
        case 'state': return a.state.localeCompare(b.state) * dir
        case 'date': {
          const aDate = new Date(a.mergedAt ?? a.updatedAt ?? a.createdAt).getTime()
          const bDate = new Date(b.mergedAt ?? b.updatedAt ?? b.createdAt).getTime()
          return (aDate - bDate) * dir
        }
        case 'lines': return ((a.additions + a.deletions) - (b.additions + b.deletions)) * dir
        case 'score': {
          const aScore = getScoreForPr(a.number)?.score ?? -1
          const bScore = getScoreForPr(b.number)?.score ?? -1
          return (aScore - bScore) * dir
        }
        default: return 0
      }
    })
    return sorted
  }, [filteredPrs, sortField, sortDir, getScoreForPr])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }, [sortField])

  const handleExportCsv = useCallback(async () => {
    if (!selectedRepo) return
    try {
      const result = await window.electronAPI.invoke('pr-scores:export-csv', {
        repoFullName: selectedRepo.fullName,
      }) as { success: boolean; csv?: string; error?: string }
      if (result.success && result.csv) {
        await navigator.clipboard.writeText(result.csv)
        // Brief visual feedback via a temp element is overkill; the user gets clipboard
      }
    } catch {
      // Silently fail
    }
  }, [selectedRepo])

  const SortHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th
      className={`px-4 py-3 font-medium cursor-pointer hover:text-gray-700 select-none transition-colors ${className}`}
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

  // ── No repo selected ────────────────────────────────────────────────────

  if (!selectedRepo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">No Repository Selected</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Select a repository from the Repositories tab to view and score its pull requests.
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

  // ── Loading skeleton ────────────────────────────────────────────────────

  if (loading && !scoringProgress) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  const toggleExpand = (prNumber: number) => {
    setExpandedPr((prev) => (prev === prNumber ? null : prNumber))
  }

  return (
    <div className="space-y-6">
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

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">{selectedRepo.fullName}</h3>
          <span className="text-sm text-gray-500">
            {scores.length} of {prs.length} PRs scored
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleExportCsv()}
            disabled={scores.length === 0}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Export scores as CSV to clipboard"
          >
            Export CSV
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
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

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        authors={uniqueAuthors}
        labels={uniqueLabels}
      />

      {/* Result count */}
      {(filteredPrs.length !== prs.length) && (
        <p className="text-xs text-gray-500">
          Showing {filteredPrs.length} of {prs.length} pull requests
        </p>
      )}

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
                  <SortHeader field="number">PR</SortHeader>
                  <SortHeader field="author">Author</SortHeader>
                  <SortHeader field="state">State</SortHeader>
                  <SortHeader field="date">Date</SortHeader>
                  <SortHeader field="lines" className="text-center">Lines Changed</SortHeader>
                  <SortHeader field="score" className="text-center">Score</SortHeader>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPrs.map((pr: GitHubPR) => {
                  const scored = getScoreForPr(pr.number)
                  const isScoring = scoringPr === pr.number
                  const displayDate = pr.mergedAt ?? pr.updatedAt ?? pr.createdAt
                  const isExpanded = expandedPr === pr.number && scored
                  return (
                    <PrRow
                      key={pr.number}
                      pr={pr}
                      scored={scored}
                      isScoring={isScoring}
                      displayDate={displayDate}
                      isExpanded={!!isExpanded}
                      scoringPr={scoringPr}
                      loading={loading}
                      config={config}
                      selectedRepo={selectedRepo}
                      toggleExpand={toggleExpand}
                      scoreSinglePr={scoreSinglePr}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// Extracted row component to avoid fragment key issues
function PrRow({
  pr, scored, isScoring, displayDate, isExpanded, scoringPr, loading, config, selectedRepo,
  toggleExpand, scoreSinglePr,
}: {
  pr: GitHubPR
  scored: ReturnType<ReturnType<typeof usePrScores>['getScoreForPr']>
  isScoring: boolean
  displayDate: string
  isExpanded: boolean
  scoringPr: number | null
  loading: boolean
  config: ReturnType<typeof usePrScores>['config']
  selectedRepo: NonNullable<ReturnType<typeof usePrScores>['selectedRepo']>
  toggleExpand: (n: number) => void
  scoreSinglePr: (n: number) => Promise<void>
}): JSX.Element {
  return (
    <>
      <tr
        className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isScoring ? 'opacity-60' : ''} ${isExpanded ? 'bg-gray-50' : ''}`}
      >
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
            <button onClick={() => toggleExpand(pr.number)} className="hover:opacity-80 transition-opacity">
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
                onClick={() => toggleExpand(pr.number)}
                className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              >
                {isExpanded ? 'Collapse' : 'Details'}
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

      {/* Inline expanded detail using ScoreBreakdownPanel */}
      {isExpanded && scored && (
        <tr>
          <td colSpan={7} className="px-4 py-4 bg-gray-50 border-b border-gray-100">
            <ScoreBreakdownPanel score={scored} />
            <div className="flex items-center gap-2 pt-3 mt-3 border-t border-gray-200">
              <button
                onClick={() => void scoreSinglePr(scored.prNumber)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
              >
                Re-Score
              </button>
              {config.enableAiReview && selectedRepo && (
                <button
                  onClick={async () => {
                    await window.electronAPI.invoke('pr-scores:build-ai-context', {
                      owner: selectedRepo.owner,
                      repo: selectedRepo.repo,
                      prNumber: scored.prNumber,
                    })
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  AI Review
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
