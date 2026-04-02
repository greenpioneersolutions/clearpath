import { useState, useEffect, useCallback } from 'react'

interface SessionEntry {
  sessionId: string
  cli: 'copilot' | 'claude'
  name?: string
  firstPrompt?: string
  startedAt: number
  endedAt?: number
  archived?: boolean
  messageCount: number
}

interface SearchResult {
  sessionId: string
  name?: string
  cli: string
  startedAt: number
  archived?: boolean
  matches: Array<{ content: string; sender?: string; lineIndex: number }>
}

interface Props {
  onClose: () => void
  onSelectSession: (sessionId: string) => void
  currentSessionId: string | null
}

type Tab = 'all' | 'archived' | 'search'
type SortBy = 'recent' | 'oldest' | 'name'

export default function SessionManager({ onClose, onSelectSession, currentSessionId }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('all')
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [cliFilter, setCliFilter] = useState<'all' | 'copilot' | 'claude'>('all')

  // Load sessions
  const loadSessions = useCallback(async () => {
    const persisted = await window.electronAPI.invoke('cli:get-persisted-sessions') as
      Array<{ sessionId: string; cli: 'copilot' | 'claude'; name?: string; firstPrompt?: string; startedAt: number; endedAt?: number; archived?: boolean; messageLog: unknown[] }>
    setSessions(persisted.map((s) => ({
      sessionId: s.sessionId,
      cli: s.cli,
      name: s.name,
      firstPrompt: s.firstPrompt,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      archived: s.archived,
      messageCount: s.messageLog?.length ?? 0,
    })))
  }, [])

  useEffect(() => { void loadSessions() }, [loadSessions])

  // Filter and sort
  const filtered = sessions
    .filter((s) => {
      if (tab === 'archived') return s.archived
      if (tab === 'all') return !s.archived
      return true
    })
    .filter((s) => {
      if (cliFilter === 'all') return true
      return s.cli === cliFilter
    })
    .sort((a, b) => {
      if (sortBy === 'recent') return b.startedAt - a.startedAt
      if (sortBy === 'oldest') return a.startedAt - b.startedAt
      return (a.name ?? a.sessionId).localeCompare(b.name ?? b.sessionId)
    })

  // Search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const results = await window.electronAPI.invoke('cli:search-sessions', { query: searchQuery, useRegex }) as SearchResult[]
      setSearchResults(results ?? [])
    } catch (err) {
      console.error('[SessionManager] search failed:', err)
      setSearchResults([])
    }
    setSearching(false)
  }, [searchQuery, useRegex])

  useEffect(() => {
    if (tab !== 'search') return
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const timer = setTimeout(() => { void handleSearch() }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, useRegex, tab, handleSearch])

  // Actions
  const handleDelete = async (sessionId: string) => {
    await window.electronAPI.invoke('cli:delete-session', { sessionId })
    setConfirmDelete(null)
    setSelected((prev) => { const next = new Set(prev); next.delete(sessionId); return next })
    void loadSessions()
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    await window.electronAPI.invoke('cli:delete-sessions', { sessionIds: Array.from(selected) })
    setSelected(new Set())
    void loadSessions()
  }

  const handleArchive = async (sessionId: string, archived: boolean) => {
    await window.electronAPI.invoke('cli:archive-session', { sessionId, archived })
    void loadSessions()
  }

  const handleRename = async (sessionId: string) => {
    if (!renameValue.trim()) { setRenaming(null); return }
    await window.electronAPI.invoke('cli:rename-session', { sessionId, name: renameValue.trim() })
    setRenaming(null)
    void loadSessions()
  }

  const toggleSelect = (sessionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((s) => s.sessionId)))
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - ts
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return 'Yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

  const formatDuration = (start: number, end?: number) => {
    const ms = (end ?? Date.now()) - start
    const secs = Math.floor(ms / 1000)
    if (secs < 60) return `${secs}s`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  const allCount = sessions.filter((s) => !s.archived).length
  const archivedCount = sessions.filter((s) => s.archived).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">Sessions</h2>
            <p className="text-gray-500 text-xs mt-0.5">{sessions.length} total sessions</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs + filters */}
        <div className="px-5 py-3 border-b border-gray-800 space-y-3 flex-shrink-0">
          <div className="flex items-center gap-1">
            <TabButton label={`Active (${allCount})`} active={tab === 'all'} onClick={() => setTab('all')} />
            <TabButton label={`Archived (${archivedCount})`} active={tab === 'archived'} onClick={() => setTab('archived')} />
            <TabButton label="Search" active={tab === 'search'} onClick={() => setTab('search')} />
            <div className="flex-1" />
            {tab !== 'search' && (
              <div className="flex items-center gap-2">
                <select value={cliFilter} onChange={(e) => setCliFilter(e.target.value as typeof cliFilter)}
                  className="bg-gray-800 border border-gray-700 text-gray-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none">
                  <option value="all">All CLIs</option>
                  <option value="copilot">Copilot</option>
                  <option value="claude">Claude</option>
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="bg-gray-800 border border-gray-700 text-gray-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none">
                  <option value="recent">Most Recent</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name">Name A-Z</option>
                </select>
              </div>
            )}
          </div>

          {/* Search bar */}
          {tab === 'search' && (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 focus-within:border-indigo-500/50">
                <svg className="w-3.5 h-3.5 text-gray-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search across all sessions..."
                  className="flex-1 bg-transparent text-gray-200 text-sm outline-none placeholder-gray-500"
                  autoFocus
                />
              </div>
              <button
                onClick={() => setUseRegex(!useRegex)}
                className={`px-2 py-1.5 text-[11px] font-mono rounded-lg border transition-colors ${
                  useRegex ? 'bg-indigo-900/40 border-indigo-600 text-indigo-300' : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                }`}
                title="Toggle regex search"
              >.*</button>
            </div>
          )}

          {/* Bulk actions */}
          {selected.size > 0 && tab !== 'search' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">{selected.size} selected</span>
              <button onClick={handleBulkDelete} className="text-red-400 hover:text-red-300 transition-colors">Delete</button>
              <button onClick={() => setSelected(new Set())} className="text-gray-500 hover:text-gray-300 transition-colors">Clear</button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'search' ? (
            // Search results
            <div className="p-4 space-y-3">
              {searching && <p className="text-gray-500 text-sm text-center py-4">Searching...</p>}
              {!searching && searchQuery && searchResults.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-8">No matches found</p>
              )}
              {!searching && !searchQuery && (
                <p className="text-gray-600 text-sm text-center py-8">
                  Type to search across all session conversations.
                  <br />
                  <span className="text-gray-700">Toggle <span className="font-mono bg-gray-800 px-1 rounded">.*</span> for regex.</span>
                </p>
              )}
              {searchResults.map((result) => (
                <div key={result.sessionId} className="bg-gray-800/50 border border-gray-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => { onSelectSession(result.sessionId); onClose() }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CliDot cli={result.cli as 'copilot' | 'claude'} />
                        <span className="text-gray-200 text-sm font-medium">{result.name ?? result.sessionId.slice(0, 8)}</span>
                        {result.archived && <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">archived</span>}
                      </div>
                      <span className="text-gray-500 text-xs">{result.matches.length} matches</span>
                    </div>
                  </button>
                  <div className="border-t border-gray-800 px-4 py-2 space-y-1.5">
                    {result.matches.map((m, i) => (
                      <div key={i} className="text-xs flex gap-2">
                        <span className={`flex-shrink-0 w-10 text-right ${m.sender === 'user' ? 'text-indigo-400' : 'text-gray-500'}`}>
                          {m.sender === 'user' ? 'You' : 'AI'}
                        </span>
                        <span className="text-gray-400 truncate">{m.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Session list
            <div>
              {filtered.length === 0 && (
                <p className="text-gray-600 text-sm text-center py-12">
                  {tab === 'archived' ? 'No archived sessions' : 'No sessions yet'}
                </p>
              )}
              {filtered.map((session) => (
                <div
                  key={session.sessionId}
                  className={`flex items-center gap-3 px-5 py-3 border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors group ${
                    session.sessionId === currentSessionId ? 'bg-indigo-950/20' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selected.has(session.sessionId)}
                    onChange={() => toggleSelect(session.sessionId)}
                    className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 accent-indigo-500 flex-shrink-0"
                  />

                  {/* Session info */}
                  <button
                    onClick={() => { onSelectSession(session.sessionId); onClose() }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <CliDot cli={session.cli} />
                      {renaming === session.sessionId ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(session.sessionId); if (e.key === 'Escape') setRenaming(null) }}
                          onBlur={() => void handleRename(session.sessionId)}
                          className="bg-gray-800 border border-indigo-500 rounded px-2 py-0.5 text-sm text-gray-200 outline-none w-40"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-gray-200 text-sm font-medium truncate">
                          {session.name ?? session.sessionId.slice(0, 8)}
                        </span>
                      )}
                      {session.sessionId === currentSessionId && (
                        <span className="text-[10px] text-indigo-400 bg-indigo-900/30 px-1.5 py-0.5 rounded-full">current</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-gray-600 text-[11px]">{formatDate(session.startedAt)}</span>
                      {session.endedAt && <span className="text-gray-700 text-[11px]">{formatDuration(session.startedAt, session.endedAt)}</span>}
                      <span className="text-gray-700 text-[11px]">{session.messageCount} messages</span>
                      {session.firstPrompt && (
                        <span className="text-gray-600 text-[11px] truncate max-w-[200px]">{session.firstPrompt}</span>
                      )}
                    </div>
                  </button>

                  {/* Actions (visible on hover) */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <ActionBtn
                      icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                      title="Rename"
                      onClick={() => { setRenaming(session.sessionId); setRenameValue(session.name ?? '') }}
                    />
                    <ActionBtn
                      icon={
                        session.archived
                          ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                          : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                      }
                      title={session.archived ? 'Unarchive' : 'Archive'}
                      onClick={() => void handleArchive(session.sessionId, !session.archived)}
                    />
                    {confirmDelete === session.sessionId ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => void handleDelete(session.sessionId)} className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 bg-red-900/30 rounded">Yes</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5">No</button>
                      </div>
                    ) : (
                      <ActionBtn
                        icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                        title="Delete"
                        onClick={() => setConfirmDelete(session.sessionId)}
                        danger
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {tab !== 'search' && filtered.length > 0 && (
              <button onClick={toggleSelectAll} className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
                {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Small helper components ─────────────────────────────────────────────────

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        active ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
      }`}
    >{label}</button>
  )
}

function CliDot({ cli }: { cli: 'copilot' | 'claude' }): JSX.Element {
  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cli === 'copilot' ? 'bg-green-500' : 'bg-orange-500'}`} title={cli} />
  )
}

function ActionBtn({ icon, title, onClick, danger }: { icon: JSX.Element; title: string; onClick: () => void; danger?: boolean }): JSX.Element {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`p-1.5 rounded-lg transition-colors ${
        danger ? 'text-gray-500 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
      }`}
      title={title}
    >{icon}</button>
  )
}
