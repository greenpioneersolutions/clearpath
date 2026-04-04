import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface StoreStats {
  id: string
  label: string
  description: string
  sizeBytes: number
  sizeFormatted: string
  entryCount: number
}

interface StorageStats {
  stores: StoreStats[]
  totalSizeBytes: number
  totalSizeFormatted: string
  knowledgeBase: { files: number; sizeBytes: number; sizeFormatted: string }
}

interface CompactNote {
  id: string
  title: string
  contentLength: number
  tags: string[]
  category: string
  updatedAt: number
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DataManagement(): JSX.Element {
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState<string | null>(null)
  const [section, setSection] = useState<'overview' | 'compact'>('overview')

  // Compact state
  const [compactNotes, setCompactNotes] = useState<CompactNote[]>([])
  const [selectedForCompact, setSelectedForCompact] = useState<Set<string>>(new Set())
  const [compactTitle, setCompactTitle] = useState('')
  const [compacting, setCompacting] = useState(false)
  const [compactResult, setCompactResult] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('data:get-storage-stats') as StorageStats
    setStats(result)
    setLoading(false)
  }, [])

  useEffect(() => { void loadStats() }, [loadStats])

  const handleClearStore = async (storeId: string, label: string) => {
    if (!confirm(`Clear all ${label} data? This cannot be undone.`)) return
    setClearing(storeId)
    await window.electronAPI.invoke('data:clear-store', { storeId })
    setClearing(null)
    void loadStats()
  }

  const handleClearAll = async () => {
    if (!confirm('Reset ALL app data? This will clear sessions, memories, settings, cost data, and everything else. This cannot be undone.')) return
    if (!confirm('Are you absolutely sure? This is a full factory reset.')) return
    setClearing('all')
    await window.electronAPI.invoke('data:clear-all')
    setClearing(null)
    void loadStats()
  }

  // ── Compact helpers ────────────────────────────────────────────────────────

  const loadCompactNotes = useCallback(async () => {
    const notes = await window.electronAPI.invoke('data:get-notes-for-compact') as CompactNote[]
    setCompactNotes(notes)
  }, [])

  const toggleCompactNote = (id: string) => {
    setSelectedForCompact((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleCompact = async () => {
    if (selectedForCompact.size < 2 || !compactTitle.trim()) return
    setCompacting(true)
    setCompactResult(null)
    const result = await window.electronAPI.invoke('data:compact-notes', {
      noteIds: [...selectedForCompact],
      newTitle: compactTitle.trim(),
    }) as { success?: boolean; error?: string; removedCount?: number }

    if (result.success) {
      setCompactResult(`Merged ${result.removedCount} memories into "${compactTitle.trim()}"`)
      setSelectedForCompact(new Set())
      setCompactTitle('')
      void loadCompactNotes()
      void loadStats()
    } else {
      setCompactResult(`Error: ${result.error}`)
    }
    setCompacting(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading || !stats) {
    return <div className="text-sm text-gray-400 py-8 text-center">Loading storage data...</div>
  }

  // Find the top stores by size for the visual breakdown
  const sortedStores = [...stats.stores].sort((a, b) => b.sizeBytes - a.sizeBytes)
  const maxSize = Math.max(...stats.stores.map((s) => s.sizeBytes), 1)

  return (
    <div className="space-y-6">
      {/* Section tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200 pb-3">
        <button
          onClick={() => setSection('overview')}
          className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
            section === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Storage Overview
        </button>
        <button
          onClick={() => { setSection('compact'); void loadCompactNotes() }}
          className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
            section === 'compact' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Compact Memories
        </button>
      </div>

      {/* ── Overview section ──────────────────────────────────────────────── */}
      {section === 'overview' && (
        <>
          {/* Storage summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.totalSizeFormatted}</p>
              <p className="text-xs text-gray-500 mt-1">Total App Data</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.stores.filter((s) => s.sizeBytes > 0).length}</p>
              <p className="text-xs text-gray-500 mt-1">Active Stores</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.knowledgeBase.files}</p>
              <p className="text-xs text-gray-500 mt-1">Knowledge Base Files ({stats.knowledgeBase.sizeFormatted})</p>
            </div>
          </div>

          {/* Visual bar chart of storage by store */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Storage Breakdown</h3>
            <div className="space-y-2">
              {sortedStores.filter((s) => s.sizeBytes > 0).map((store) => {
                const pct = Math.max(2, (store.sizeBytes / maxSize) * 100)
                return (
                  <div key={store.id} className="flex items-center gap-3">
                    <div className="w-32 text-xs text-gray-600 truncate text-right">{store.label}</div>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-20 text-xs text-gray-500 text-right">{store.sizeFormatted}</div>
                    <div className="w-16 text-[10px] text-gray-400 text-right">{store.entryCount} items</div>
                  </div>
                )
              })}
              {sortedStores.every((s) => s.sizeBytes === 0) && (
                <p className="text-xs text-gray-400 text-center py-4">No data stored yet</p>
              )}
            </div>
          </div>

          {/* Individual reset buttons */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Clear Individual Data</h3>
            <div className="grid grid-cols-2 gap-2">
              {stats.stores.filter((s) => s.sizeBytes > 0).map((store) => (
                <div key={store.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700">{store.label}</p>
                    <p className="text-[10px] text-gray-400 truncate">{store.description}</p>
                  </div>
                  <button
                    onClick={() => void handleClearStore(store.id, store.label)}
                    disabled={clearing === store.id}
                    className="ml-3 px-2.5 py-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    {clearing === store.id ? 'Clearing...' : 'Clear'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Factory reset */}
          <div className="border-t border-gray-200 pt-5">
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-red-800">Factory Reset</h3>
                <p className="text-xs text-red-600 mt-0.5">Clear all app data and return to defaults. This cannot be undone.</p>
              </div>
              <button
                onClick={() => void handleClearAll()}
                disabled={clearing === 'all'}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {clearing === 'all' ? 'Resetting...' : 'Reset Everything'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Compact Memories section ─────────────────────────────────────── */}
      {section === 'compact' && (
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <p className="text-xs text-blue-700">
              Select two or more memories to merge into a single note. The content will be combined with section headers preserved. Original notes will be removed.
            </p>
          </div>

          {compactNotes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No memories to compact. Create notes in the Memory tab first.</p>
          ) : (
            <>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {compactNotes.map((note) => {
                  const isSelected = selectedForCompact.has(note.id)
                  return (
                    <button key={note.id} onClick={() => toggleCompactNote(note.id)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        isSelected ? 'bg-indigo-50 border border-indigo-300' : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                      }`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                      }`}>
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-gray-800">{note.title}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400">{note.category}</span>
                          <span className="text-[10px] text-gray-400">{Math.round(note.contentLength / 1024 * 10) / 10} KB</span>
                          {note.tags.slice(0, 2).map((t) => <span key={t} className="text-[10px] text-gray-400">#{t}</span>)}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedForCompact.size >= 2 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Title for compacted memory
                    </label>
                    <input
                      type="text"
                      value={compactTitle}
                      onChange={(e) => setCompactTitle(e.target.value)}
                      placeholder="e.g. Combined Meeting Notes — Q1"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {selectedForCompact.size} memories selected
                    </span>
                    <button
                      onClick={() => void handleCompact()}
                      disabled={compacting || !compactTitle.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                    >
                      {compacting ? 'Compacting...' : 'Compact into One'}
                    </button>
                  </div>
                </div>
              )}

              {selectedForCompact.size === 1 && (
                <p className="text-xs text-gray-400 text-center">Select at least one more memory to compact</p>
              )}

              {compactResult && (
                <div className={`text-xs px-3 py-2 rounded-lg ${
                  compactResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                  {compactResult}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
