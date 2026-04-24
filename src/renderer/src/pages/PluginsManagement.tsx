import { useCallback, useEffect, useMemo, useState } from 'react'

interface PluginEntry {
  id: string
  name: string
  version?: string
  description?: string
  cli: 'copilot' | 'claude'
  source: 'discovered' | 'custom'
  enabled: boolean
  path: string
  manifestPath: string
}

type AddCustomResult =
  | { entry: PluginEntry; canceled?: undefined; error?: undefined }
  | { canceled: true; entry?: undefined; error?: undefined }
  | { error: string; entry?: undefined; canceled?: undefined }

export default function PluginsManagement(): JSX.Element {
  const [plugins, setPlugins] = useState<PluginEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = (await window.electronAPI.invoke('plugins:list')) as PluginEntry[]
      setPlugins(Array.isArray(list) ? list : [])
    } catch (err) {
      setMessage({ kind: 'error', text: `Failed to load plugins: ${(err as Error).message}` })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Auto-clear info messages after a few seconds; errors stay until next action.
  useEffect(() => {
    if (!message || message.kind !== 'info') return
    const t = setTimeout(() => setMessage(null), 3000)
    return () => clearTimeout(t)
  }, [message])

  const handleRescan = async () => {
    setLoading(true)
    try {
      const list = (await window.electronAPI.invoke('plugins:rescan')) as PluginEntry[]
      setPlugins(Array.isArray(list) ? list : [])
      setMessage({ kind: 'info', text: 'Rescan complete' })
    } catch (err) {
      setMessage({ kind: 'error', text: `Rescan failed: ${(err as Error).message}` })
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (plugin: PluginEntry) => {
    const current = plugins.filter((p) => p.cli === plugin.cli && p.enabled).map((p) => p.path)
    const next = plugin.enabled
      ? current.filter((p) => p !== plugin.path)
      : Array.from(new Set([...current, plugin.path]))
    try {
      await window.electronAPI.invoke('plugins:set-enabled', { cli: plugin.cli, paths: next })
      setPlugins((prev) =>
        prev.map((p) => (p.path === plugin.path ? { ...p, enabled: !plugin.enabled } : p)),
      )
    } catch (err) {
      setMessage({ kind: 'error', text: `Toggle failed: ${(err as Error).message}` })
    }
  }

  const handleRemoveCustom = async (plugin: PluginEntry) => {
    if (!confirm(`Remove "${plugin.name}" from your custom plugin list?\n\nThis does not delete files on disk.`)) return
    try {
      await window.electronAPI.invoke('plugins:remove-custom', { path: plugin.path })
      setMessage({ kind: 'info', text: `Removed "${plugin.name}"` })
      void load()
    } catch (err) {
      setMessage({ kind: 'error', text: `Remove failed: ${(err as Error).message}` })
    }
  }

  const handleOpenFolder = async (plugin: PluginEntry) => {
    try {
      const res = (await window.electronAPI.invoke('plugins:open-folder', { path: plugin.path })) as
        | { success: true }
        | { error: string }
      if ('error' in res) setMessage({ kind: 'error', text: res.error })
    } catch (err) {
      setMessage({ kind: 'error', text: `Open folder failed: ${(err as Error).message}` })
    }
  }

  const handleAddCustom = async (cli: 'auto' | 'copilot' | 'claude') => {
    setShowAddModal(false)
    try {
      const res = (await window.electronAPI.invoke('plugins:add-custom', { cli })) as AddCustomResult
      if (res.canceled) return
      if (res.error) {
        setMessage({ kind: 'error', text: res.error })
        return
      }
      if (res.entry) {
        setMessage({ kind: 'info', text: `Added "${res.entry.name}" (${res.entry.cli})` })
        void load()
      }
    } catch (err) {
      setMessage({ kind: 'error', text: `Add failed: ${(err as Error).message}` })
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return plugins
    const q = search.toLowerCase()
    return plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q),
    )
  }, [plugins, search])

  const copilotPlugins = filtered.filter((p) => p.cli === 'copilot')
  const claudePlugins = filtered.filter((p) => p.cli === 'claude')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">CLI Plugins</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Toggle CLI plugins on or off. Enabled plugins are auto-loaded into every matching session.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void handleRescan()}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? 'Scanning...' : 'Rescan'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700"
          >
            + Add Custom Path
          </button>
        </div>
      </div>

      {/* Inline help */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        <p className="font-medium mb-1">How to install plugins:</p>
        <ul className="list-disc ml-5 space-y-0.5">
          <li>
            Copilot: run <code className="px-1 py-0.5 bg-white rounded text-blue-700">copilot</code> then{' '}
            <code className="px-1 py-0.5 bg-white rounded text-blue-700">/plugin install &lt;owner/repo&gt;</code>
          </li>
          <li>
            Claude Code: run <code className="px-1 py-0.5 bg-white rounded text-blue-700">claude</code> then{' '}
            <code className="px-1 py-0.5 bg-white rounded text-blue-700">/plugin install &lt;owner/repo&gt;</code>
          </li>
          <li>Then click <strong>Rescan</strong> here to pick up the new plugin.</li>
        </ul>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`text-xs px-3 py-2 rounded-lg ${
            message.kind === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700'
          }`}
        >
          <span className="flex items-center justify-between gap-2">
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100" aria-label="Dismiss">
              x
            </button>
          </span>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search plugins..."
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {/* Copilot section */}
      <PluginSection
        title="GitHub Copilot CLI"
        emptyHint="No Copilot plugins found. They live in ~/.copilot/installed-plugins/."
        plugins={copilotPlugins}
        loading={loading}
        onToggle={(p) => void handleToggle(p)}
        onRemoveCustom={(p) => void handleRemoveCustom(p)}
        onOpenFolder={(p) => void handleOpenFolder(p)}
      />

      {/* Claude section */}
      <PluginSection
        title="Claude Code CLI"
        emptyHint="No Claude plugins found. They live in ~/.claude/plugins/."
        plugins={claudePlugins}
        loading={loading}
        onToggle={(p) => void handleToggle(p)}
        onRemoveCustom={(p) => void handleRemoveCustom(p)}
        onOpenFolder={(p) => void handleOpenFolder(p)}
      />

      {/* Add custom path modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowAddModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add custom plugin path"
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Add a custom plugin path</h3>
            <p className="text-sm text-gray-600 mb-5">
              Choose how the plugin should be classified. We&apos;ll pick the matching manifest:{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">plugin.json</code> for Copilot or{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">.claude-plugin/plugin.json</code> for Claude.
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => void handleAddCustom('auto')}
                className="px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-left"
              >
                Auto-detect from manifest
                <div className="text-xs opacity-80">Recommended — picks the CLI that matches the manifest at the path</div>
              </button>
              <button
                onClick={() => void handleAddCustom('copilot')}
                className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-left text-gray-800"
              >
                Force Copilot
                <div className="text-xs text-gray-500">Requires plugin.json at the directory root</div>
              </button>
              <button
                onClick={() => void handleAddCustom('claude')}
                className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-left text-gray-800"
              >
                Force Claude
                <div className="text-xs text-gray-500">Requires .claude-plugin/plugin.json</div>
              </button>
            </div>
            <div className="flex justify-end mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Plugin section ──────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  emptyHint: string
  plugins: PluginEntry[]
  loading: boolean
  onToggle: (p: PluginEntry) => void
  onRemoveCustom: (p: PluginEntry) => void
  onOpenFolder: (p: PluginEntry) => void
}

function PluginSection({
  title,
  emptyHint,
  plugins,
  loading,
  onToggle,
  onRemoveCustom,
  onOpenFolder,
}: SectionProps): JSX.Element {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          {title}
          <span className="text-xs font-normal text-gray-400 ml-2 normal-case">
            {plugins.length} plugin{plugins.length !== 1 ? 's' : ''}
          </span>
        </h3>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : plugins.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">{emptyHint}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{plugin.name}</span>
                  {plugin.version && <span className="text-[10px] text-gray-400">v{plugin.version}</span>}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      plugin.source === 'custom' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {plugin.source === 'custom' ? 'custom path' : 'discovered'}
                  </span>
                </div>
                {plugin.description && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{plugin.description}</p>
                )}
                <p className="text-[11px] text-gray-400 font-mono mt-1 truncate" title={plugin.path}>
                  {plugin.path}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onOpenFolder(plugin)}
                  className="text-[11px] text-indigo-600 hover:underline"
                  title="Open in file manager"
                >
                  Open folder
                </button>
                {plugin.source === 'custom' && (
                  <button
                    onClick={() => onRemoveCustom(plugin)}
                    className="text-[11px] text-red-500 hover:underline"
                    title="Remove from custom paths"
                  >
                    Remove
                  </button>
                )}
                <button
                  onClick={() => onToggle(plugin)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    plugin.enabled ? 'bg-indigo-600' : 'bg-gray-300'
                  }`}
                  role="switch"
                  aria-checked={plugin.enabled}
                  aria-label={`Toggle plugin ${plugin.name}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      plugin.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
