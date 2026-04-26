import { useCallback, useEffect, useState } from 'react'
import type { McpRegistryEntry, McpRegistryRemoveResponse, McpRegistryToggleResponse } from '../../types/mcp'
import McpEditor from './McpEditor'

interface Props {
  /** Incrementing key — bumping it triggers a refresh (used after catalog install). */
  refreshKey?: number
  onBrowseCatalog: () => void
  onToast: (message: string, type: 'success' | 'error' | 'warning') => void
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'success' }
  | { status: 'error'; message: string }

interface TestServerResponse {
  success: boolean
  stderrSnippet?: string
  error?: string
  durationMs?: number
}

export default function McpRegistryList({ refreshKey = 0, onBrowseCatalog, onToast }: Props): JSX.Element {
  const [entries, setEntries] = useState<McpRegistryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<McpRegistryEntry | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<McpRegistryEntry | null>(null)
  const [testStates, setTestStates] = useState<Record<string, TestState>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const result = (await window.electronAPI.invoke('mcp:registry-list')) as McpRegistryEntry[]
    setEntries(Array.isArray(result) ? result : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const handleToggle = async (entry: McpRegistryEntry) => {
    const next = !entry.enabled
    // Optimistic update
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, enabled: next } : e)))
    try {
      const result = (await window.electronAPI.invoke('mcp:registry-toggle', {
        id: entry.id,
        enabled: next,
      })) as McpRegistryToggleResponse
      if (!result.success) {
        // Rollback
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, enabled: entry.enabled } : e)))
        onToast(result.error ?? 'Failed to update connection.', 'error')
      }
    } catch (e) {
      setEntries((prev) => prev.map((ee) => (ee.id === entry.id ? { ...ee, enabled: entry.enabled } : ee)))
      onToast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const handleRemove = async (entry: McpRegistryEntry) => {
    const result = (await window.electronAPI.invoke('mcp:registry-remove', {
      id: entry.id,
    })) as McpRegistryRemoveResponse
    setConfirmRemove(null)
    if (result.success) {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
      onToast(`Removed ${entry.name}.`, 'success')
    } else {
      onToast('Failed to remove connection.', 'error')
    }
  }

  const handleTest = async (entry: McpRegistryEntry) => {
    // Debounce: ignore click if already testing.
    if (testStates[entry.id]?.status === 'testing') return
    setTestStates((prev) => ({ ...prev, [entry.id]: { status: 'testing' } }))
    try {
      const res = (await window.electronAPI.invoke('mcp:test-server', { id: entry.id })) as TestServerResponse
      if (res.success) {
        setTestStates((prev) => ({ ...prev, [entry.id]: { status: 'success' } }))
        setTimeout(() => {
          setTestStates((prev) => {
            const next = { ...prev }
            if (next[entry.id]?.status === 'success') delete next[entry.id]
            return next
          })
        }, 3000)
      } else {
        const message = res.stderrSnippet || res.error || 'Connection test failed'
        setTestStates((prev) => ({ ...prev, [entry.id]: { status: 'error', message } }))
      }
    } catch (e) {
      setTestStates((prev) => ({
        ...prev,
        [entry.id]: { status: 'error', message: e instanceof Error ? e.message : String(e) },
      }))
    }
  }

  const commandPreview = (e: McpRegistryEntry) =>
    `${e.command}${e.args.length > 0 ? ' ' + e.args.join(' ') : ''}`

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
        <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">No MCPs installed yet</h3>
        <p className="text-xs text-gray-500 mb-4">
          Browse the catalog to add your first one.
        </p>
        <button
          onClick={onBrowseCatalog}
          className="px-4 py-2 bg-[#5B4FC4] text-white text-sm font-medium rounded-lg hover:bg-[#4a41a8] transition-colors"
        >
          Browse catalog
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Command</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Available in</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Scope</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Enabled</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {entries.map((entry) => (
              <tr key={entry.id} className={entry.enabled ? '' : 'opacity-60'}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{entry.name}</span>
                    {entry.source === 'catalog' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1D9E75]/10 text-[#1D9E75] font-medium">
                        Catalog
                      </span>
                    )}
                    {entry.source === 'imported' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        Imported
                      </span>
                    )}
                  </div>
                  {entry.description && (
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-xs">{entry.description}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs text-gray-600 font-mono truncate block max-w-[180px]" title={commandPreview(entry)}>
                    {commandPreview(entry)}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {entry.targets.copilot && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">CoPilot</span>
                    )}
                    {entry.targets.claude && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">Claude</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-600 capitalize">{entry.scope}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => void handleToggle(entry)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      entry.enabled ? 'bg-[#1D9E75]' : 'bg-gray-300'
                    }`}
                    role="switch"
                    aria-checked={entry.enabled}
                    aria-label={`Toggle ${entry.name}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        entry.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {(() => {
                      const state = testStates[entry.id] ?? { status: 'idle' }
                      if (state.status === 'testing') {
                        return (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 px-2 py-1" aria-live="polite">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                            Testing…
                          </span>
                        )
                      }
                      if (state.status === 'success') {
                        return (
                          <span className="inline-flex items-center gap-1 text-xs text-[#1D9E75] px-2 py-1" aria-live="polite">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Connected
                          </span>
                        )
                      }
                      if (state.status === 'error') {
                        return (
                          <button
                            type="button"
                            onClick={() => void handleTest(entry)}
                            title={state.message}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Failed
                          </button>
                        )
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => void handleTest(entry)}
                          className="text-xs text-gray-600 hover:text-[#5B4FC4] px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                        >
                          Test
                        </button>
                      )
                    })()}
                    <button
                      onClick={() => setEditing(entry)}
                      className="text-xs text-gray-600 hover:text-[#5B4FC4] px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmRemove(entry)}
                      className="text-xs text-gray-600 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Remove {confirmRemove.name}?
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              This disconnects it from both CoPilot and Claude Code. You can always re-install from the catalog.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRemove(confirmRemove)}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 font-medium rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <McpEditor
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
            onToast(`Updated ${editing.name}.`, 'success')
          }}
          onError={(msg) => onToast(msg, 'error')}
          onWarning={(msg) => onToast(msg, 'warning')}
        />
      )}
    </>
  )
}
