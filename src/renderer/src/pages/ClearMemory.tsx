import { useCallback, useEffect, useRef, useState } from 'react'
import { useFeatureFlags } from '../contexts/FeatureFlagContext'
import EnableGate from '../components/clearmemory/EnableGate'
import MemoryList from '../components/clearmemory/MemoryList'
import SearchBar, { type SearchBarHandle } from '../components/clearmemory/SearchBar'
import RetainModal from '../components/clearmemory/RetainModal'
import MemoryDrawer from '../components/clearmemory/MemoryDrawer'
import TagsManager from '../components/clearmemory/TagsManager'
import StreamsManager from '../components/clearmemory/StreamsManager'
import ImportWizard from '../components/clearmemory/ImportWizard'
import ReflectPanel from '../components/clearmemory/ReflectPanel'
import StatusDashboard from '../components/clearmemory/StatusDashboard'
import ConfigEditor from '../components/clearmemory/ConfigEditor'
import BackupPanel from '../components/clearmemory/BackupPanel'
import ToastHost from '../components/clearmemory/ToastHost'
import { streamsList } from '../lib/clearmemoryClient'

// Compose is a page-level action ("New memory") rather than a tab because the
// retain UI is already a modal — a tab that immediately opens a modal reads
// awkwardly. Browse/Search share the same list+input pair.

type Tab =
  | 'browse'
  | 'tags'
  | 'streams'
  | 'import'
  | 'reflect'
  | 'status'
  | 'config'
  | 'backup'

const TABS: { key: Tab; label: string }[] = [
  { key: 'browse', label: 'Browse' },
  { key: 'tags', label: 'Tags' },
  { key: 'streams', label: 'Streams' },
  { key: 'import', label: 'Import' },
  { key: 'reflect', label: 'Reflect' },
  { key: 'status', label: 'Status' },
  { key: 'config', label: 'Config' },
  { key: 'backup', label: 'Backup' },
]

export default function ClearMemory(): JSX.Element {
  const { flags } = useFeatureFlags()
  const [tab, setTab] = useState<Tab>('browse')
  const enabled = flags.showClearMemory

  // Shared state across Browse / drawer / compose.
  const [query, setQuery] = useState('')
  const [streamFilter, setStreamFilter] = useState<string | undefined>(undefined)
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [retainOpen, setRetainOpen] = useState(false)

  const searchRef = useRef<SearchBarHandle>(null)
  const [activeStream, setActiveStream] = useState<string | null>(null)

  const bumpRefresh = useCallback(() => setRefreshKey((n) => n + 1), [])

  // Surface the currently-switched stream in the header. The service-level
  // tracking lives in the main process, so we re-fetch on enable changes,
  // initial mount, and whenever something in-app creates/switches a stream.
  const refreshActiveStream = useCallback(async () => {
    if (!enabled) { setActiveStream(null); return }
    const result = await streamsList()
    if (!result.ok) return
    setActiveStream(result.data.active ?? null)
  }, [enabled])

  useEffect(() => { void refreshActiveStream() }, [refreshActiveStream, refreshKey])

  // React to service state changes — restart after enable should re-fetch.
  useEffect(() => {
    const off = window.electronAPI.on('clearmemory:state-change', () => {
      void refreshActiveStream()
    })
    return () => { off?.() }
  }, [refreshActiveStream])

  const handleStreamsChanged = useCallback(() => {
    bumpRefresh()
    void refreshActiveStream()
  }, [bumpRefresh, refreshActiveStream])

  const handleToggleTag = useCallback((tag: string) => {
    setTagFilters((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }, [])

  // "/" focuses the search input, scoped to the Clear Memory page. Skip when
  // the user is already typing in a form field or the retain modal is open
  // (it manages its own focus).
  useEffect(() => {
    if (!enabled) return
    function onKey(e: KeyboardEvent): void {
      if (e.key !== '/') return
      if (retainOpen) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || target.isContentEditable
      if (editable) return
      if (tab !== 'browse') return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, retainOpen, tab])

  return (
    <div className="space-y-6 relative">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clear Memory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cross-session AI memory engine. Runs locally.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {enabled && activeStream && (
            <button
              onClick={() => setTab('streams')}
              title="Click to manage streams"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium hover:bg-indigo-500/20"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Stream: {activeStream}
            </button>
          )}
          {enabled && (
            <button
              onClick={() => setRetainOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            >
              + New memory
            </button>
          )}
          <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${
              enabled
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                : 'bg-gray-800 border-gray-700 text-gray-500'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-teal-400' : 'bg-gray-600'}`} />
            {enabled ? 'On' : 'Off'}
          </span>
        </div>
      </div>

      <EnableGate>
        {/* Tabs */}
        <div className="border-b border-gray-700">
          <nav className="flex gap-6 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
          <div className="p-6">
            {tab === 'browse' && (
              <div className="space-y-4">
                <SearchBar
                  ref={searchRef}
                  query={query}
                  onQueryChange={setQuery}
                  streamFilter={streamFilter}
                  onStreamFilterChange={setStreamFilter}
                  tagFilters={tagFilters}
                  onToggleTag={handleToggleTag}
                  knownTags={[]}
                />
                <MemoryList
                  query={query}
                  streamFilter={streamFilter}
                  tagFilters={tagFilters}
                  refreshKey={refreshKey}
                  onSelect={setSelectedId}
                  onCompose={() => setRetainOpen(true)}
                />
              </div>
            )}
            {tab === 'tags' && <TagsManager onChange={bumpRefresh} />}
            {tab === 'streams' && <StreamsManager onChange={handleStreamsChanged} />}
            {tab === 'import' && <ImportWizard onChange={bumpRefresh} />}
            {tab === 'reflect' && <ReflectPanel />}
            {tab === 'status' && <StatusDashboard />}
            {tab === 'config' && <ConfigEditor />}
            {tab === 'backup' && <BackupPanel />}
          </div>
        </div>
      </EnableGate>

      {/* Page-level overlays */}
      <MemoryDrawer
        memoryId={selectedId}
        onClose={() => setSelectedId(null)}
        onForgotten={() => bumpRefresh()}
      />
      <RetainModal
        open={retainOpen}
        onClose={() => setRetainOpen(false)}
        onSaved={() => bumpRefresh()}
      />
      <ToastHost />
    </div>
  )
}
