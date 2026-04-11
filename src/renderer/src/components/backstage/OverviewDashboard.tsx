import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

interface OverviewData {
  totalEntities: number
  components: number
  apis: number
  systems: number
  teams: number
  byKind: Array<{ kind: string; count: number }>
  byLifecycle: Array<{ lifecycle: string; count: number }>
  topTeams: Array<{ team: string; components: number; apis: number; total: number }>
  tagCloud: Array<{ tag: string; count: number }>
  allKinds: string[]
  allLifecycles: string[]
  allOwners: string[]
  allTags: string[]
}

interface Props {
  onNavigateToTeam: (owner: string) => void
}

const PIE_COLORS = ['#5B4FC4', '#7F77DD', '#1D9E75', '#5DCAA5', '#85B7EB', '#F59E0B', '#EF4444', '#8B5CF6']

function StatCard({ label, value }: { label: string; value: number | string }): JSX.Element {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
      <p className="text-2xl font-bold text-indigo-600">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}

export default function OverviewDashboard({ onNavigateToTeam }: Props): JSX.Element {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [indexing, setIndexing] = useState(false)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:get-overview')) as {
        success: boolean
        overview?: {
          totalEntities: number
          countsByKind: Record<string, number>
          countsByLifecycle: Record<string, number>
          teamCount: number
          topTeams: Array<{ ref: string; name: string; displayName?: string; ownedByKind?: Record<string, number>; ownedEntities?: string[] }>
          allKinds: string[]
          topTags: string[]
          capabilities: Record<string, boolean> | null
          lastRefreshed: number | null
          mostDiscussed?: Array<{ ref: string; name: string; mentions: number }>
        }
        error?: string
      }
      if (result.success && result.overview) {
        const ov = result.overview
        const countsByKind = ov.countsByKind || {}
        const countsByLifecycle = ov.countsByLifecycle || {}
        setData({
          totalEntities: ov.totalEntities || 0,
          components: countsByKind['Component'] || 0,
          apis: countsByKind['API'] || 0,
          systems: countsByKind['System'] || 0,
          teams: ov.teamCount || 0,
          byKind: Object.entries(countsByKind).map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
          byLifecycle: Object.entries(countsByLifecycle).map(([lifecycle, count]) => ({ lifecycle, count })).sort((a, b) => b.count - a.count),
          topTeams: (ov.topTeams || []).map((t: Record<string, unknown>) => {
            const byKind = (t.ownedByKind || t.kindCounts || {}) as Record<string, number>
            const ownerStr = String(t.owner || t.ref || t.name || t.displayName || 'unknown')
            const teamName = ownerStr.includes('/') ? ownerStr.split('/').pop()! : ownerStr
            const entityList = (t.ownedEntities || t.entities || []) as unknown[]
            return {
              team: teamName,
              components: byKind['Component'] || 0,
              apis: byKind['API'] || 0,
              total: entityList.length || Object.values(byKind).reduce((s, n) => s + n, 0),
            }
          }),
          tagCloud: (ov.topTags || []).map(tag => ({ tag, count: 0 })),
          allKinds: ov.allKinds || [],
          allLifecycles: Object.keys(countsByLifecycle),
          allOwners: (ov.topTeams || []).map((t: Record<string, unknown>) => String(t.owner || t.ref || '')),
          allTags: ov.topTags || [],
        })
      } else {
        setData(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const handleIndexCatalog = async () => {
    setIndexing(true)
    try {
      await window.electronAPI.invoke('backstage-explorer:refresh-index')
      await loadOverview()
    } finally {
      setIndexing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-3">Loading overview...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => void loadOverview()} className="mt-2 text-sm text-indigo-600 hover:text-indigo-500">
            Retry
          </button>
        </div>
      </div>
    )
  }

  // First-run CTA: no index yet
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Welcome to Backstage Explorer</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-md">
          Index your Backstage catalog to browse entities, explore relationships, and get AI-powered insights about your software architecture.
        </p>
        <button
          onClick={() => void handleIndexCatalog()}
          disabled={indexing}
          className="mt-4 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {indexing ? 'Indexing Catalog...' : 'Index Your Catalog'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stat cards row */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="Total Entities" value={data.totalEntities} />
        <StatCard label="Components" value={data.components} />
        <StatCard label="APIs" value={data.apis} />
        <StatCard label="Systems" value={data.systems} />
        <StatCard label="Teams" value={data.teams} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Entities by Kind */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Entities by Kind</h3>
          {data.byKind.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.byKind} layout="vertical" margin={{ left: 60, right: 16, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="kind" tick={{ fontSize: 11 }} width={55} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" fill="#5B4FC4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400 text-center py-8">No kind data available</p>
          )}
        </div>

        {/* Lifecycle Distribution */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Lifecycle Distribution</h3>
          {data.byLifecycle.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.byLifecycle}
                  dataKey="count"
                  nameKey="lifecycle"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ lifecycle, count }: { lifecycle: string; count: number }) => `${lifecycle} (${count})`}
                  labelLine={false}
                  fontSize={11}
                >
                  {data.byLifecycle.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400 text-center py-8">No lifecycle data available</p>
          )}
        </div>
      </div>

      {/* Top Teams table */}
      {data.topTeams.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Teams</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 pb-2">Team</th>
                <th className="text-right text-xs font-medium text-gray-500 pb-2">Components</th>
                <th className="text-right text-xs font-medium text-gray-500 pb-2">APIs</th>
                <th className="text-right text-xs font-medium text-gray-500 pb-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.topTeams.map((team) => (
                <tr
                  key={team.team}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onNavigateToTeam(team.team)}
                >
                  <td className="py-2 text-gray-800 font-medium">{team.team}</td>
                  <td className="py-2 text-right text-gray-600">{team.components}</td>
                  <td className="py-2 text-right text-gray-600">{team.apis}</td>
                  <td className="py-2 text-right text-gray-900 font-medium">{team.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tag cloud */}
      {data.tagCloud.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {data.tagCloud.map((t) => (
              <span
                key={t.tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs text-gray-700"
              >
                {t.tag}
                <span className="text-gray-400">({t.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
