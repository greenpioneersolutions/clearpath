import { useCallback, useEffect, useState } from 'react'
import type { McpCatalogEntry, McpRegistryTargets } from '../../types/mcp'
import McpInstallWizard from './McpInstallWizard'

interface Props {
  onInstalled: (displayName: string, targets: McpRegistryTargets) => void
  onWarning: (message: string) => void
  onError: (message: string) => void
}

export default function McpCatalogGrid({ onInstalled, onWarning, onError }: Props): JSX.Element {
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<McpCatalogEntry | null>(null)
  const [customOpen, setCustomOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = (await window.electronAPI.invoke('mcp:catalog-list')) as McpCatalogEntry[]
    setCatalog(Array.isArray(result) ? result : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const secretCount = (entry: McpCatalogEntry): number =>
    entry.envSchema.filter((v) => v.secret).length

  const handleSaved = (displayName: string, targets: McpRegistryTargets) => {
    onInstalled(displayName, targets)
    setSelected(null)
    setCustomOpen(false)
  }

  return (
    <>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalog.map((entry) => {
            const secrets = secretCount(entry)
            return (
              <div
                key={entry.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-[#5B4FC4]/40 transition-all flex flex-col"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">{entry.displayName}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono flex-shrink-0">
                    {entry.command}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-3 flex-1 mb-3">
                  {entry.description}
                </p>
                {secrets > 0 && (
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0h-2m5-8a5 5 0 00-10 0v3h10V7z" />
                      </svg>
                      {secrets} secret{secrets === 1 ? '' : 's'} required
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setSelected(entry)}
                  className="mt-auto w-full px-3 py-2 bg-[#5B4FC4] text-white text-xs font-medium rounded-lg hover:bg-[#4a41a8] transition-colors"
                >
                  Install
                </button>
              </div>
            )
          })}

          {/* Custom server card */}
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 hover:border-[#5B4FC4] transition-all flex flex-col items-center justify-center text-center">
            <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Custom server</h3>
            <p className="text-xs text-gray-500 mb-3">
              Add any MCP server by providing its command and args.
            </p>
            <button
              onClick={() => setCustomOpen(true)}
              className="px-3 py-2 bg-white text-[#5B4FC4] border border-[#5B4FC4] text-xs font-medium rounded-lg hover:bg-[#5B4FC4]/5 transition-colors"
            >
              Add custom
            </button>
          </div>
        </div>
      )}

      {selected && (
        <McpInstallWizard
          catalogEntry={selected}
          onClose={() => setSelected(null)}
          onSaved={(name, targets) => handleSaved(name, targets)}
          onWarning={onWarning}
          onError={onError}
        />
      )}

      {customOpen && (
        <McpInstallWizard
          onClose={() => setCustomOpen(false)}
          onSaved={(name, targets) => handleSaved(name, targets)}
          onWarning={onWarning}
          onError={onError}
        />
      )}
    </>
  )
}
