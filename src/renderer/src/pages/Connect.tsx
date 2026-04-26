import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFeatureFlags } from '../contexts/FeatureFlagContext'
import IntegrationsTab from '../components/integrations/IntegrationsTab'
import EnvVarsTab from '../components/settings/EnvVarsTab'
import PluginsManagement from './PluginsManagement'
import WebhookManager from '../components/notifications/WebhookManager'

// Build-time-gated lazy imports. Each conditional is statically replaced by
// Vite (see `__FEATURES__` define in electron.vite.config.ts), so when a flag
// is compiled out the expression becomes `false ? lazy(...) : null` and
// Rollup drops the dynamic `import()` along with every transitive chunk
// it would have emitted. Already-installed extensions continue to render in
// the /ext/:id/* route via ExtensionPage — only the management UI is gated.
declare const __FEATURES__: import('../../../shared/featureFlags.generated').FeatureFlags
const McpTab = __FEATURES__.showMcpServers
  ? lazy(() => import('../components/mcp/McpTab'))
  : null
const ExtensionManager = __FEATURES__.showExtensions
  ? lazy(() => import('../components/extensions/ExtensionManager'))
  : null

type SubTab = 'integrations' | 'extensions' | 'mcp' | 'environment' | 'plugins' | 'webhooks'

const SUB_TABS: { key: SubTab; label: string; description: string }[] = [
  { key: 'integrations', label: 'Integrations', description: 'Connect external services like GitHub, Jira, and ServiceNow' },
  { key: 'extensions', label: 'Extensions', description: 'Add capabilities and custom widgets' },
  { key: 'mcp', label: 'MCP Servers', description: 'Add MCP servers that both CoPilot and Claude Code can use' },
  { key: 'environment', label: 'Environment', description: 'Manage environment variables the CLIs inherit at launch' },
  { key: 'plugins', label: 'Plugins', description: 'Toggle CLI plugins and add local plugin directories' },
  { key: 'webhooks', label: 'Webhooks', description: 'Deliver notifications to external services like Slack and Discord' },
]

export default function Connect(): JSX.Element {
  const { flags } = useFeatureFlags()
  const [tab, setTab] = useState<SubTab>('integrations')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [extensionPendingRestart, setExtensionPendingRestart] = useState(false)
  const [showRestartModal, setShowRestartModal] = useState(false)
  const pendingTabRef = useRef<SubTab | null>(null)

  // Hide tabs whose feature flag is off. `clampToCompiledIn` keeps these
  // flags false in builds where the chunk was tree-shaken, so this single
  // check covers both compile-out and runtime-off cases.
  const isTabVisible = useCallback(
    (key: SubTab) => {
      if (key === 'mcp') return flags.showMcpServers
      if (key === 'extensions') return flags.showExtensions
      return true
    },
    [flags.showMcpServers, flags.showExtensions],
  )
  const visibleTabs = SUB_TABS.filter((t) => isTabVisible(t.key))

  useEffect(() => {
    const urlTab = searchParams.get('tab') as SubTab | null
    if (!urlTab) return
    if (SUB_TABS.some((t) => t.key === urlTab) && isTabVisible(urlTab)) {
      setTab(urlTab)
    } else if (urlTab === 'mcp' || urlTab === 'extensions') {
      // /connections still redirects here with ?tab=mcp; deep links to
      // ?tab=extensions exist in the wild too. Fall back to integrations
      // when the requested tab is gated off in this build.
      setTab('integrations')
      setSearchParams({ tab: 'integrations' }, { replace: true })
    }
  }, [searchParams, isTabVisible, setSearchParams])

  const handlePendingRestartChange = useCallback((pending: boolean) => {
    setExtensionPendingRestart(pending)
  }, [])

  function handleRestart() {
    window.electronAPI.invoke('app:restart')
  }

  function handleTabChange(newTab: SubTab) {
    if (extensionPendingRestart && tab === 'extensions' && newTab !== 'extensions') {
      pendingTabRef.current = newTab
      setShowRestartModal(true)
      return
    }
    setTab(newTab)
    setSearchParams({ tab: newTab }, { replace: true })
  }

  function handleContinueWithoutRestart() {
    setShowRestartModal(false)
    if (pendingTabRef.current) {
      setTab(pendingTabRef.current)
      setSearchParams({ tab: pendingTabRef.current }, { replace: true })
      pendingTabRef.current = null
    }
  }

  function handleStayOnExtensions() {
    setShowRestartModal(false)
    pendingTabRef.current = null
  }

  const activeTab = SUB_TABS.find((t) => t.key === tab)!

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {showRestartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Extension changes pending</h3>
            <p className="text-sm text-gray-300 mb-6">
              You have extension changes that require a restart to take full effect.
              Would you like to restart now, or continue without restarting?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={handleStayOnExtensions}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
                Stay here
              </button>
              <button onClick={handleContinueWithoutRestart}
                className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 text-gray-200 rounded">
                Continue without restart
              </button>
              <button onClick={handleRestart}
                className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded font-medium">
                Restart now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with sub-tab toggle */}
      <div className="flex-shrink-0 border-b border-gray-700 bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Connect</h1>
            <p className="text-xs text-gray-400 mt-0.5">{activeTab.description}</p>
          </div>
          <button onClick={() => navigate('/configure')}
            className="text-xs text-gray-500 hover:text-indigo-400 transition-colors">
            Settings →
          </button>
        </div>

        <div className="flex gap-1 mt-4 bg-gray-800 rounded-lg p-1 w-fit" role="tablist" aria-label="Connect sections">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              role="tab"
              aria-selected={tab === t.key}
              id={`connect-tab-${t.key}`}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === t.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6" role="tabpanel" aria-labelledby={`connect-tab-${tab}`}>
        {tab === 'integrations' && <IntegrationsTab />}
        {tab === 'extensions' && ExtensionManager && (
          <Suspense fallback={null}>
            <ExtensionManager onPendingRestartChange={handlePendingRestartChange} />
          </Suspense>
        )}
        {tab === 'mcp' && McpTab && (
          <Suspense fallback={null}>
            <McpTab />
          </Suspense>
        )}
        {tab === 'environment' && <EnvVarsTab />}
        {tab === 'plugins' && <PluginsManagement />}
        {tab === 'webhooks' && <WebhookManager />}
      </div>
    </div>
  )
}
