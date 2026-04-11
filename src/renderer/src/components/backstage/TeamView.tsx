import { useState, useEffect, useCallback } from 'react'

interface TeamData {
  ref: string
  name: string
  ownedCounts: Record<string, number>
  total: number
}

interface Props {
  onSelectTeam: (ownerRef: string) => void
}

const KIND_COLORS: Record<string, string> = {
  Component: 'bg-indigo-100 text-indigo-700',
  API: 'bg-teal-100 text-teal-700',
  System: 'bg-purple-100 text-purple-700',
  Resource: 'bg-orange-100 text-orange-700',
  Domain: 'bg-amber-100 text-amber-700',
}

export default function TeamView({ onSelectTeam }: Props): JSX.Element {
  const [teams, setTeams] = useState<TeamData[]>([])
  const [loading, setLoading] = useState(true)

  const loadTeams = useCallback(async () => {
    setLoading(true)
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:get-team-view')) as {
        success: boolean
        teams?: Array<Record<string, unknown>>
      }
      if (result.success && result.teams) {
        setTeams(result.teams.map((t) => {
          const ownerStr = String(t.owner || t.ref || t.name || 'unknown')
          const name = ownerStr.includes('/') ? ownerStr.split('/').pop()! : ownerStr
          const ownedCounts = (t.ownedCounts || t.kindCounts || {}) as Record<string, number>
          const total = (t.total as number) || (t.entityCount as number) || Object.values(ownedCounts).reduce((s, n) => s + n, 0)
          return { ref: ownerStr, name, ownedCounts, total }
        }))
      }
    } catch {
      setTeams([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTeams()
  }, [loadTeams])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-gray-400">No teams found in your catalog</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {teams.map((team) => (
        <button
          key={team.ref}
          onClick={() => onSelectTeam(team.ref)}
          className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
              {team.name}
            </h3>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {team.total}
            </span>
          </div>

          {/* Owned entity counts by kind */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(team.ownedCounts).map(([kind, count]) => (
              <span
                key={kind}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  KIND_COLORS[kind] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {count} {kind}{count !== 1 ? 's' : ''}
              </span>
            ))}
          </div>

          {/* Visual bar showing distribution */}
          <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden flex">
            {Object.entries(team.ownedCounts).map(([kind, count]) => {
              const pct = team.total > 0 ? (count / team.total) * 100 : 0
              const barColors: Record<string, string> = {
                Component: 'bg-indigo-400',
                API: 'bg-teal-400',
                System: 'bg-purple-400',
                Resource: 'bg-orange-400',
                Domain: 'bg-amber-400',
              }
              return (
                <div
                  key={kind}
                  className={`h-full ${barColors[kind] ?? 'bg-gray-300'}`}
                  style={{ width: `${pct}%` }}
                  title={`${kind}: ${count}`}
                />
              )
            })}
          </div>
        </button>
      ))}
    </div>
  )
}
