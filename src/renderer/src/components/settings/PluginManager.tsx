import { useState, useEffect, useCallback } from 'react'
import type { PluginInfo } from '../../types/settings'

interface Props {
  cli: 'copilot' | 'claude'
}

export default function PluginManager({ cli }: Props): JSX.Element {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showInstall, setShowInstall] = useState(false)
  const [installInput, setInstallInput] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('settings:list-plugins', { cli }) as PluginInfo[]
    setPlugins(result)
    setLoading(false)
  }, [cli])

  useEffect(() => { void load() }, [load])

  const installCommand = cli === 'copilot'
    ? `copilot /plugin install ${installInput}`
    : `claude mcp add ${installInput}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Plugins</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Installed plugins for {cli === 'copilot' ? 'Copilot' : 'Claude Code'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowInstall(!showInstall)}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {showInstall ? 'Cancel' : '+ Install Plugin'}
          </button>
        </div>
      </div>

      {/* Install form */}
      {showInstall && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {cli === 'copilot' ? 'Plugin (owner/repo or path)' : 'Plugin directory path'}
            </label>
            <input
              type="text"
              value={installInput}
              onChange={(e) => setInstallInput(e.target.value)}
              placeholder={cli === 'copilot' ? 'e.g. owner/repo or /path/to/plugin' : 'e.g. /path/to/plugin'}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {installInput.trim() && (
            <div className="bg-gray-900 rounded-lg px-4 py-2.5">
              <p className="text-xs text-gray-500 mb-1">Run this command:</p>
              <code className="text-sm text-green-400 font-mono">{installCommand}</code>
              <button
                onClick={() => void navigator.clipboard.writeText(installCommand)}
                className="ml-3 text-xs text-gray-500 hover:text-gray-300"
              >
                Copy
              </button>
            </div>
          )}
        </div>
      )}

      {/* Plugin list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : plugins.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-400">No plugins installed</p>
          <p className="text-xs text-gray-400 mt-1">
            Plugins are loaded from {cli === 'copilot' ? '~/.copilot/plugins/' : '~/.claude/plugins/'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {plugins.map((plugin) => (
            <div key={plugin.name} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{plugin.name}</span>
                    {plugin.version && (
                      <span className="text-xs text-gray-400">v{plugin.version}</span>
                    )}
                  </div>
                  {plugin.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{plugin.description}</p>
                  )}
                  <p className="text-xs text-gray-400 font-mono mt-1 truncate">{plugin.source}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      plugin.enabled ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                    role="switch"
                    aria-checked={plugin.enabled}
                    aria-label={`Toggle plugin ${plugin.name}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      plugin.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
