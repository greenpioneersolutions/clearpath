import { useState, useEffect } from 'react'
import { usePrScores } from '../../contexts/PrScoresContext'
import ScoreBadge from './ScoreBadge'

interface ScoredRepoInfo {
  repoFullName: string
  scoredCount: number
}

export default function RepositoriesTab(): JSX.Element {
  const {
    repos, loading, repoError, favorites, toggleFavorite,
    selectRepo, loadRepos, setGithubConnected, repoMetricsCache,
  } = usePrScores()

  const [search, setSearch] = useState('')
  const [scoredRepos, setScoredRepos] = useState<Record<string, number>>({})

  // Load scored repo counts on mount
  useEffect(() => {
    async function loadScoredRepos() {
      try {
        const result = await window.electronAPI.invoke('pr-scores:list-scored-repos') as ScoredRepoInfo[] | null
        if (Array.isArray(result)) {
          const map: Record<string, number> = {}
          for (const r of result) {
            map[r.repoFullName] = r.scoredCount
          }
          setScoredRepos(map)
        }
      } catch {
        // Non-critical, ignore
      }
    }
    void loadScoredRepos()
  }, [])

  const filtered = repos.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.fullName.toLowerCase().includes(q) ||
      (r.description?.toLowerCase().includes(q) ?? false)
    )
  })

  const favorited = filtered.filter((r) => favorites.includes(r.fullName))
  const rest = filtered.filter((r) => !favorites.includes(r.fullName))

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (repos.length === 0) {
    return (
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
    )
  }

  const renderRepoCard = (repo: typeof repos[number]) => {
    const isFav = favorites.includes(repo.fullName)
    const cachedMetrics = repoMetricsCache[repo.fullName]
    const scored = scoredRepos[repo.fullName] ?? 0
    return (
      <div
        key={repo.id}
        className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition-all group relative"
      >
        {/* Star button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(repo.fullName)
          }}
          className={`absolute top-3 right-3 p-1 rounded transition-colors ${
            isFav
              ? 'text-amber-400 hover:text-amber-500'
              : 'text-gray-300 hover:text-gray-400'
          }`}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isFav ? 0 : 1.5}>
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>

        <button
          onClick={() => void selectRepo(repo)}
          className="w-full text-left"
        >
          <div className="flex items-start justify-between pr-8">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 truncate transition-colors">
                  {repo.fullName}
                </h3>
                {scored > 0 && (
                  <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">
                    {scored} scored
                  </span>
                )}
              </div>
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

          {/* Bottom row: language, date, health badge */}
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
            {cachedMetrics && (
              <span className="ml-auto">
                <ScoreBadge score={cachedMetrics.repoScore} />
              </span>
            )}
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repositories by name or description..."
          className="w-full max-w-md px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Favorites section */}
      {favorited.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Favorites
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {favorited.map(renderRepoCard)}
          </div>
        </div>
      )}

      {/* All repos */}
      <div>
        {favorited.length > 0 && (
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">All Repositories</h3>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rest.map(renderRepoCard)}
        </div>
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No repositories match your search.</p>
        )}
      </div>
    </div>
  )
}
