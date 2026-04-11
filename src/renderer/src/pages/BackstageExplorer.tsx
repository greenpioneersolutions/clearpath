import { useState, useEffect, useCallback } from 'react'
import OverviewDashboard from '../components/backstage/OverviewDashboard'
import EntityBrowser from '../components/backstage/EntityBrowser'
import TeamView from '../components/backstage/TeamView'
import RelationshipViewer from '../components/backstage/RelationshipViewer'
import AskAI from '../components/backstage/AskAI'

type TabId = 'overview' | 'browse' | 'teams' | 'relationships' | 'ask-ai'

const TABS: { key: TabId; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'browse', label: 'Browse' },
  { key: 'teams', label: 'Teams' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'ask-ai', label: 'Ask AI' },
]

interface StatusInfo {
  connected: boolean
  url: string | null
  indexAge: number | string | null
  entityCount: number
  capabilities: {
    catalog: boolean
    search: boolean
    kubernetes: boolean
    techdocs: boolean
    localAi: boolean
  }
}

function CapBadge({ label, active }: { label: string; active: boolean }): JSX.Element {
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
        active
          ? 'bg-teal-50 text-teal-700 border border-teal-200'
          : 'bg-gray-50 text-gray-400 border border-gray-200'
      }`}
    >
      {label} {active ? '\u2713' : '\u2717'}
    </span>
  )
}

function timeAgoShort(ts: number | string | null): string {
  if (!ts) return 'never'
  const epoch = typeof ts === 'number' ? ts : new Date(ts).getTime()
  const diff = Date.now() - epoch
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function BackstageExplorer(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [status, setStatus] = useState<StatusInfo | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [browseFilter, setBrowseFilter] = useState<{ owner?: string } | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const [integrationStatus, indexStatus] = await Promise.all([
        window.electronAPI.invoke('integration:get-status') as Promise<Record<string, unknown>>,
        window.electronAPI.invoke('backstage-explorer:get-index-status') as Promise<{
          state: string
          lastRefreshed: string | null
          entityCount: number
        } | null>,
      ])

      const backstage = (integrationStatus as Record<string, { connected: boolean; baseUrl?: string; capabilities?: Record<string, boolean> }>)
        ?.backstage

      // Detect local AI availability
      let localAiAvailable = false
      try {
        const localModels = (await window.electronAPI.invoke('local-models:detect')) as {
          ollama?: { connected: boolean }; lmstudio?: { connected: boolean }
        } | null
        localAiAvailable = !!(localModels?.ollama?.connected || localModels?.lmstudio?.connected)
      } catch {
        // local models not available
      }

      // Get capabilities from the Backstage integration status (probed on connect)
      const bsCaps = backstage?.capabilities || {}
      const capabilities = {
        catalog: bsCaps['catalog'] ?? !!backstage?.connected,
        search: bsCaps['search'] ?? false,
        kubernetes: bsCaps['kubernetes'] ?? false,
        techdocs: bsCaps['techdocs'] ?? false,
        localAi: localAiAvailable,
      }

      setStatus({
        connected: !!backstage?.connected,
        url: backstage?.baseUrl ?? null,
        indexAge: indexStatus?.lastRefreshed ?? null,
        entityCount: indexStatus?.entityCount ?? 0,
        capabilities,
      })
    } catch {
      setStatus({
        connected: false,
        url: null,
        indexAge: null,
        entityCount: 0,
        capabilities: { catalog: false, search: false, kubernetes: false, techdocs: false, localAi: false },
      })
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await window.electronAPI.invoke('backstage-explorer:refresh-index')
      await loadStatus()
    } finally {
      setRefreshing(false)
    }
  }

  const navigateToBrowseWithOwner = (owner: string) => {
    setBrowseFilter({ owner })
    setActiveTab('browse')
  }

  // ── Not connected prompt ────────────────────────────────────────────────

  if (status !== null && !status.connected) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Backstage Explorer</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-powered exploration of your software catalog</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Connect Backstage</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            Backstage Explorer requires a Backstage connection to browse your software catalog.
            Connect your instance in Settings &gt; Integrations.
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

  // ── Main layout with tabs ───────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Backstage Explorer</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-powered exploration of your software catalog</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Status bar */}
      {status && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${status.connected ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-gray-700 font-medium">
                {status.connected ? `Connected to ${status.url ?? 'Backstage'}` : 'Disconnected'}
              </span>
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">Indexed {timeAgoShort(status.indexAge)}</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{status.entityCount} entities</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CapBadge label="Catalog" active={status.capabilities.catalog} />
            <CapBadge label="Search" active={status.capabilities.search} />
            <CapBadge label="K8s" active={status.capabilities.kubernetes} />
            <CapBadge label="TechDocs" active={status.capabilities.techdocs} />
            <CapBadge label="Local AI" active={status.capabilities.localAi} />
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewDashboard onNavigateToTeam={navigateToBrowseWithOwner} />}
      {activeTab === 'browse' && <EntityBrowser initialFilter={browseFilter} />}
      {activeTab === 'teams' && <TeamView onSelectTeam={navigateToBrowseWithOwner} />}
      {activeTab === 'relationships' && <RelationshipViewer />}
      {activeTab === 'ask-ai' && <AskAI />}
    </div>
  )
}
