import { useState, useEffect, useCallback } from 'react'

interface ActivityEntry {
  hash: string
  message: string
  author: string
  date: string
  repo: string
  isAiGenerated: boolean
}

interface Props {
  workingDirectory: string
}

export default function ActivityFeed({ workingDirectory }: Props): JSX.Element {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('team:git-activity', {
      workingDirectory,
      limit: 40,
    }) as ActivityEntry[]
    setEntries(result)
    setLoading(false)
  }, [workingDirectory])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Team Activity Feed</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Recent commits from the working directory — AI-assisted commits are highlighted
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-400">No git history found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => (
            <div key={entry.hash} className={`flex items-start gap-3 px-3 py-2 rounded-lg transition-colors ${
              entry.isAiGenerated ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-gray-50'
            }`}>
              {/* Timeline dot */}
              <div className="mt-1.5 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${entry.isAiGenerated ? 'bg-indigo-400' : 'bg-gray-300'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-800 truncate">{entry.message}</span>
                  {entry.isAiGenerated && (
                    <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded flex-shrink-0">
                      AI
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                  <span>{entry.author}</span>
                  <span className="font-mono">{entry.hash.slice(0, 7)}</span>
                  <span>{new Date(entry.date).toLocaleDateString()}</span>
                  <span>{new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
