import { useCallback, useEffect, useState } from 'react'
import McpCatalogGrid from './McpCatalogGrid'
import McpRegistryList from './McpRegistryList'
import type { McpSecretsMeta } from '../../types/mcp'
import { useMcpExternalChanges } from '../../hooks/useMcpExternalChanges'

type SubTab = 'catalog' | 'installed' | 'advanced'

const SUB_TABS: { key: SubTab; label: string; description: string }[] = [
  { key: 'catalog', label: 'Catalog', description: 'Browse curated MCP servers and install with one click.' },
  { key: 'installed', label: 'Installed', description: 'Manage the MCP servers you have already added.' },
  { key: 'advanced', label: 'Advanced', description: 'Sync status, secret storage, and manual file locations.' },
]

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'warning'
}

let _toastId = 0

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }): JSX.Element | null {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border ${
            t.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : t.type === 'warning'
                ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                : 'bg-green-50 border-green-200 text-green-800'
          }`}
        >
          <p className="text-sm flex-1">{t.message}</p>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-xs opacity-60 hover:opacity-100 flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}

export default function McpTab(): JSX.Element {
  const [subTab, setSubTab] = useState<SubTab>('catalog')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [secretsMeta, setSecretsMeta] = useState<McpSecretsMeta | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [installedRefreshKey, setInstalledRefreshKey] = useState(0)
  const { changes: externalChanges, adopt, overwrite } = useMcpExternalChanges()

  const pushToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = ++_toastId
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const loadMeta = useCallback(async () => {
    const meta = (await window.electronAPI.invoke('mcp:secrets-get-meta')) as McpSecretsMeta
    setSecretsMeta(meta)
  }, [])

  useEffect(() => {
    void loadMeta()
  }, [loadMeta])

  const handleSyncNow = async () => {
    setSyncing(true)
    const result = (await window.electronAPI.invoke('mcp:sync-now')) as { success: boolean; error?: string }
    setSyncing(false)
    if (result.success) {
      pushToast('Re-synced all CLI config files.', 'success')
    } else {
      pushToast(result.error ?? 'Failed to sync.', 'error')
    }
  }

  const handleCatalogInstallSaved = () => {
    setInstalledRefreshKey((k) => k + 1)
    setSubTab('installed')
  }

  const activeTab = SUB_TABS.find((t) => t.key === subTab)!

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {externalChanges.length > 0 && (
        <div
          role="alert"
          className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3"
        >
          <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-yellow-900">External changes detected</h3>
            <p className="text-xs text-yellow-800 mt-1">
              {externalChanges.length === 1
                ? `External changes detected in ${externalChanges[0].path}.`
                : `External changes detected in ${externalChanges.length} MCP config files.`}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  void adopt().then(() => pushToast('Adopted external changes.', 'success'))
                }}
                className="px-3 py-1.5 bg-[#5B4FC4] text-white text-xs font-medium rounded-lg hover:bg-[#4a41a8] transition-colors"
              >
                Adopt them
              </button>
              <button
                onClick={() => {
                  void overwrite().then(() => pushToast('Overwrote external changes from registry.', 'success'))
                }}
                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="flex gap-6" role="tablist" aria-label="MCP sections">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              role="tab"
              aria-selected={subTab === t.key}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                subTab === t.key
                  ? 'border-[#5B4FC4] text-[#5B4FC4]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <p className="text-xs text-gray-500 -mt-2">{activeTab.description}</p>

      <div role="tabpanel">
        {subTab === 'catalog' && (
          <McpCatalogGrid
            onInstalled={(displayName, targets) => {
              const parts: string[] = []
              if (targets.copilot) parts.push('CoPilot')
              if (targets.claude) parts.push('Claude Code')
              pushToast(`Added ${displayName}. Available in ${parts.join(' and ')}.`, 'success')
              handleCatalogInstallSaved()
            }}
            onWarning={(msg) => pushToast(msg, 'warning')}
            onError={(msg) => pushToast(msg, 'error')}
          />
        )}

        {subTab === 'installed' && (
          <McpRegistryList
            refreshKey={installedRefreshKey}
            onBrowseCatalog={() => setSubTab('catalog')}
            onToast={(msg, type) => pushToast(msg, type)}
          />
        )}

        {subTab === 'advanced' && (
          <div className="space-y-4">
            {secretsMeta?.unsafeMode && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4" role="alert">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-semibold text-yellow-900">Unsafe mode</h3>
                    <p className="text-xs text-yellow-800 mt-1">
                      Your OS keychain isn&apos;t available — secrets are stored in plain text. Install libsecret or equivalent for encrypted storage.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Re-sync CLI config files</h2>
              <p className="text-xs text-gray-500 mb-4">
                Regenerate <code className="text-[11px] px-1 py-0.5 bg-gray-100 rounded">~/.copilot/mcp-config.json</code> and{' '}
                <code className="text-[11px] px-1 py-0.5 bg-gray-100 rounded">~/.claude/mcp-config.json</code> from your connections.
                Useful if a file was deleted or got out of sync.
              </p>
              <button
                onClick={() => void handleSyncNow()}
                disabled={syncing}
                className="px-4 py-2 bg-[#5B4FC4] text-white text-sm font-medium rounded-lg hover:bg-[#4a41a8] disabled:opacity-50 transition-colors"
              >
                {syncing ? 'Syncing...' : 'Re-sync now'}
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Manual edit</h2>
              <p className="text-xs text-gray-500 mb-3">
                ClearPath is the source of truth for MCP setup. If you prefer to edit the CLI files directly, they live at:
              </p>
              <ul className="text-xs font-mono text-gray-700 space-y-1 bg-gray-50 rounded-lg p-3 border border-gray-200">
                <li>~/.copilot/mcp-config.json <span className="text-gray-400 font-sans">— CoPilot, global</span></li>
                <li>~/.claude/mcp-config.json <span className="text-gray-400 font-sans">— Claude Code, global</span></li>
                <li>./.github/copilot/mcp-config.json <span className="text-gray-400 font-sans">— CoPilot, per project</span></li>
                <li>./.claude/mcp-config.json <span className="text-gray-400 font-sans">— Claude Code, per project</span></li>
              </ul>
              <p className="text-[11px] text-gray-400 mt-3">
                Note: changes made outside ClearPath may be overwritten on the next sync.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
