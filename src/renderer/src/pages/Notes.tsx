import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFlag } from '../contexts/FeatureFlagContext'
import { NOTE_CATEGORIES, categoryColorClass } from '../lib/noteCategoryColors'
import NoteEditorModal from '../components/notes/NoteEditorModal'
import type { Note } from '../types/note'

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Notes(): JSX.Element {
  const showNotes = useFlag('showNotes')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Flag-off enable card ────────────────────────────────────────────────
  // Mirrors ClearMemory's EnableGate but without a daemon — Notes has no
  // back-end work to start, so we just point users at the flag toggle.
  if (!showNotes) {
    return (
      <div className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: 'var(--brand-dark-page)' }}>
        <div className="max-w-2xl mx-auto mt-12">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 space-y-5">
            <h2 className="text-2xl font-bold text-white">Notes are off</h2>
            <p className="text-sm text-gray-400">
              Turn on Notes in Feature Flags to capture and curate context for your AI sessions.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/configure?tab=settings')}
                className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Open Feature Flags
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <NotesContent searchParams={searchParams} setSearchParams={setSearchParams} />
}

// Body extracted so the flag-off branch can short-circuit hooks cleanly.
function NotesContent({
  searchParams,
  setSearchParams,
}: {
  searchParams: URLSearchParams
  setSearchParams: (init: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams), opts?: { replace?: boolean }) => void
}): JSX.Element {
  const navigate = useNavigate()

  const [notes, setNotes] = useState<Note[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  // `initialized` flips to true after the FIRST notes:list resolves and stays
  // true. We deliberately don't toggle a `loading` flag on subsequent
  // refreshes — otherwise the "Loading notes…" message flashes over the list
  // every time the editor's debounced save calls `onChange()` to re-sync.
  const [initialized, setInitialized] = useState(false)

  // Filter state
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  // Selection
  const selectedId = searchParams.get('id')
  const setSelectedId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('id', id)
          else next.delete('id')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // Bulk-select state (toolbar only appears with ≥1 selected)
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    const [list, tags] = await Promise.all([
      window.electronAPI.invoke('notes:list') as Promise<Note[]>,
      window.electronAPI.invoke('notes:tags') as Promise<string[]>,
    ])
    // Normalize legacy notes that pre-date the attachments field — the store
    // can return entries without `tags` or `attachments` arrays defined.
    const normalized = (list ?? []).map((n) => ({
      ...n,
      tags: n.tags ?? [],
      attachments: n.attachments ?? [],
    }))
    setNotes(normalized)
    setAllTags(tags ?? [])
    setInitialized(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // ── Client-side filtering ─────────────────────────────────────────────
  // Counts come from the same source so they match the rendered list.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes.filter((n) => {
      if (pinnedOnly && !n.pinned) return false
      if (categoryFilter && n.category !== categoryFilter) return false
      if (tagFilters.size > 0 && !n.tags.some((t) => tagFilters.has(t))) return false
      if (q) {
        const hay = `${n.title} ${n.content} ${n.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [notes, pinnedOnly, categoryFilter, tagFilters, search])

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return b.updatedAt - a.updatedAt
      }),
    [filtered],
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of notes) counts[n.category] = (counts[n.category] ?? 0) + 1
    return counts
  }, [notes])

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of notes) for (const t of n.tags) counts[t] = (counts[t] ?? 0) + 1
    return counts
  }, [notes])

  const pinnedCount = useMemo(() => notes.filter((n) => n.pinned).length, [notes])

  const selectedNote = useMemo(
    () => (selectedId ? notes.find((n) => n.id === selectedId) ?? null : null),
    [notes, selectedId],
  )

  // ── Mutators ──────────────────────────────────────────────────────────

  const handleNew = useCallback(async () => {
    const created = (await window.electronAPI.invoke('notes:create', {
      title: 'Untitled note',
      content: '',
      category: 'reference',
      tags: [],
      source: 'manual',
    })) as Note
    // Optimistic insert — render the new note IMMEDIATELY so the editor
    // drawer opens against a populated list. A blocking `refresh()` here
    // would let the "Loading notes…" message flash over the user's typing.
    const normalizedCreated: Note = {
      ...created,
      tags: created.tags ?? [],
      attachments: created.attachments ?? [],
    }
    setNotes((prev) => [normalizedCreated, ...prev])
    setSelectedId(created.id)
    // Background sync to pick up any server-side normalization (sort order,
    // tag autocomplete cache). No loading flicker because `refresh()` no
    // longer toggles a global flag.
    void refresh()
  }, [refresh, setSelectedId])

  const handleUseInNextSession = useCallback(
    (id: string) => {
      // Pre-seed Work's selectedNoteIds via location state. Work picks this up
      // on mount and pre-selects the note in the chat input.
      navigate('/work', { state: { preSelectedNoteIds: [id] } })
    },
    [navigate],
  )

  const toggleTagFilter = useCallback((tag: string) => {
    setTagFilters((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }, [])

  const toggleBulk = useCallback((id: string) => {
    setBulkIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleBulkDelete = useCallback(async () => {
    if (bulkIds.size === 0) return
    if (!confirm(`Delete ${bulkIds.size} note${bulkIds.size === 1 ? '' : 's'}? This cannot be undone.`)) return
    for (const id of bulkIds) {
      await window.electronAPI.invoke('notes:delete', { id })
    }
    setBulkIds(new Set())
    if (selectedId && bulkIds.has(selectedId)) setSelectedId(null)
    await refresh()
  }, [bulkIds, refresh, selectedId, setSelectedId])

  const handleBulkTag = useCallback(async () => {
    if (bulkIds.size === 0) return
    const tag = prompt('Add tag to selected notes (comma-separate to add multiple):')
    if (!tag) return
    const newTags = tag.split(',').map((t) => t.trim()).filter(Boolean)
    for (const id of bulkIds) {
      const note = notes.find((n) => n.id === id)
      if (!note) continue
      const merged = Array.from(new Set([...note.tags, ...newTags]))
      await window.electronAPI.invoke('notes:update', { id, tags: merged })
    }
    setBulkIds(new Set())
    await refresh()
  }, [bulkIds, notes, refresh])

  // ── Empty state ───────────────────────────────────────────────────────
  const hasNoNotes = initialized && notes.length === 0

  return (
    <div className="flex h-full overflow-hidden" style={{ backgroundColor: 'var(--brand-dark-page)' }}>
      {/* Left pane — filters */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-gray-800 overflow-y-auto">
        <div className="p-4 space-y-5">
          <div className="space-y-1">
            <button
              onClick={() => { setPinnedOnly(false); setCategoryFilter(''); setTagFilters(new Set()) }}
              className={`w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors ${
                !pinnedOnly && !categoryFilter && tagFilters.size === 0
                  ? 'bg-indigo-900/40 text-indigo-200'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              All <span className="float-right text-gray-500">{notes.length}</span>
            </button>
            <button
              onClick={() => setPinnedOnly((v) => !v)}
              className={`w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors ${
                pinnedOnly ? 'bg-indigo-900/40 text-indigo-200' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              📌 Pinned <span className="float-right text-gray-500">{pinnedCount}</span>
            </button>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Categories</h3>
            <div className="space-y-1">
              {NOTE_CATEGORIES.map((c) => {
                const count = categoryCounts[c] ?? 0
                if (count === 0) return null
                return (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter((cur) => (cur === c ? '' : c))}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors capitalize ${
                      categoryFilter === c
                        ? 'bg-indigo-900/40 text-indigo-200'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    }`}
                  >
                    {c} <span className="float-right text-gray-500">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {allTags.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTagFilter(t)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      tagFilters.has(t)
                        ? 'bg-indigo-900/40 text-indigo-200 border-indigo-700/60'
                        : 'bg-gray-800/60 text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    #{t}
                    <span className="ml-1 text-gray-500">{tagCounts[t]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-auto p-4 border-t border-gray-800">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </aside>

      {/* Middle pane — note list */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 px-6 py-4 border-b border-gray-800 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Notes</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Capture context once, attach it to any session.
            </p>
          </div>
          <button
            onClick={() => void handleNew()}
            data-testid="notes-new-button"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New note
          </button>
        </header>

        {/* Bulk-select toolbar */}
        {bulkIds.size > 0 && (
          <div className="px-6 py-2 border-b border-gray-800 bg-gray-900/60 flex items-center gap-3">
            <span className="text-xs text-gray-300">{bulkIds.size} selected</span>
            <button
              onClick={() => void handleBulkTag()}
              className="text-xs text-indigo-300 hover:text-indigo-200 px-2 py-1"
            >
              Tag…
            </button>
            <button
              onClick={() => void handleBulkDelete()}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
            >
              Delete
            </button>
            <button
              onClick={() => setBulkIds(new Set())}
              className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 ml-auto"
            >
              Clear
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!initialized ? (
            <p className="text-sm text-gray-500 text-center py-8">Loading notes…</p>
          ) : hasNoNotes ? (
            <EmptyState onNew={() => void handleNew()} onSeeExamples={() => navigate('/learn?path=notes')} />
          ) : sorted.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No notes match your filters.</p>
          ) : (
            <div className="space-y-2 max-w-3xl">
              {sorted.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  selected={n.id === selectedId}
                  bulkSelected={bulkIds.has(n.id)}
                  onClick={() => setSelectedId(n.id)}
                  onToggleBulk={() => toggleBulk(n.id)}
                />
              ))}
              <p className="text-[11px] text-gray-500 pt-2">
                Showing {sorted.length} of {notes.length} note{notes.length === 1 ? '' : 's'}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Full-screen editor overlay */}
      {selectedNote && (
        <NoteEditorModal
          key={selectedNote.id}
          note={selectedNote}
          onChange={() => void refresh()}
          onClose={() => setSelectedId(null)}
          onUseInNextSession={() => handleUseInNextSession(selectedNote.id)}
        />
      )}
    </div>
  )
}

// ── Note card (middle pane) ──────────────────────────────────────────────────

function NoteCard({
  note,
  selected,
  bulkSelected,
  onClick,
  onToggleBulk,
}: {
  note: Note
  selected: boolean
  bulkSelected: boolean
  onClick: () => void
  onToggleBulk: () => void
}): JSX.Element {
  const sourceLabel =
    note.source && note.source !== 'manual'
      ? `Source: session "${note.sessionName ?? note.source.replace(/^session:/, '')}"`
      : 'Manual'

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`notes-card-${note.id}`}
      className={`w-full text-left rounded-xl border p-4 transition-all ${
        selected
          ? 'border-indigo-500/60 bg-indigo-900/10'
          : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={bulkSelected}
          onChange={onToggleBulk}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${note.title}`}
          className="mt-1 accent-indigo-500"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {note.pinned && <span className="text-[10px]" aria-hidden>📌</span>}
            <h4 className="text-sm font-medium text-white truncate">{note.title}</h4>
          </div>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-3 whitespace-pre-wrap">
            {note.content || <span className="italic text-gray-600">(empty)</span>}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${categoryColorClass(note.category)}`}>
              {note.category}
            </span>
            {note.tags.slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] text-gray-500">#{t}</span>
            ))}
            {note.tags.length > 4 && <span className="text-[10px] text-gray-500">+{note.tags.length - 4}</span>}
            <span className="text-[10px] text-gray-500">{timeAgo(note.updatedAt)}</span>
            <span className="text-[10px] text-gray-500">{sourceLabel}</span>
            {note.attachments.length > 0 && (
              <span className="text-[10px] text-gray-500">📎 {note.attachments.length}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onNew, onSeeExamples }: { onNew: () => void; onSeeExamples: () => void }): JSX.Element {
  return (
    <div className="text-center py-16 max-w-md mx-auto">
      <div className="w-14 h-14 mx-auto bg-gray-800 rounded-2xl flex items-center justify-center mb-3">
        <svg className="w-7 h-7 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-gray-200">No notes yet</h3>
      <p className="text-xs text-gray-500 mt-1">
        A note is a piece of context you want to share with AI later — meeting takeaways,
        recurring instructions, file snippets you keep referencing.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          onClick={onNew}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          + New note
        </button>
        <button
          onClick={onSeeExamples}
          className="px-4 py-2 text-indigo-300 hover:text-indigo-200 text-xs font-medium transition-colors"
        >
          See examples
        </button>
      </div>
    </div>
  )
}
