import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { useFlag } from '../contexts/FeatureFlagContext'
import {
  NOTE_CATEGORIES,
  categoryColorClass,
  type NoteCategory,
} from '../lib/noteCategoryColors'

// ── Types (mirror noteHandlers.ts) ───────────────────────────────────────────

interface NoteAttachment {
  id: string
  path: string
  name: string
  sizeBytes: number
  addedAt: number
}

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  category: string
  source?: string
  sessionName?: string
  attachments: NoteAttachment[]
  createdAt: number
  updatedAt: number
  pinned: boolean
}

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
  const [loading, setLoading] = useState(true)

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
    setLoading(true)
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
    setLoading(false)
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
    await refresh()
    setSelectedId(created.id)
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
  const hasNoNotes = !loading && notes.length === 0

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
          {loading ? (
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

      {/* Right pane — editor drawer */}
      {selectedNote && (
        <NoteEditor
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

// ── Editor drawer (right pane) ──────────────────────────────────────────────

function NoteEditor({
  note,
  onChange,
  onClose,
  onUseInNextSession,
}: {
  note: Note
  onChange: () => void
  onClose: () => void
  onUseInNextSession: () => void
}): JSX.Element {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [category, setCategory] = useState<NoteCategory | string>(note.category)
  const [tags, setTags] = useState<string[]>(note.tags)
  const [pinned, setPinned] = useState(note.pinned)
  const [attachments, setAttachments] = useState<NoteAttachment[]>(note.attachments)
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [attachError, setAttachError] = useState('')

  // Debounced save — keeps the list in sync without firing on every keystroke.
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialMount = useRef(true)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => {
      void (async () => {
        await window.electronAPI.invoke('notes:update', {
          id: note.id,
          title: title.trim() || 'Untitled note',
          content,
          category,
          tags,
          pinned,
          attachments,
        })
        onChange()
      })()
    }, 350)
    return () => {
      if (saveRef.current) clearTimeout(saveRef.current)
    }
  }, [title, content, category, tags, pinned, attachments, note.id, onChange])

  // Tag autocomplete — fetched once per drawer instance.
  useEffect(() => {
    void (async () => {
      const all = (await window.electronAPI.invoke('notes:tags')) as string[]
      setTagSuggestions(all)
    })()
  }, [note.id])

  const addTag = useCallback(
    (raw: string) => {
      const t = raw.trim().replace(/^#/, '')
      if (!t || tags.includes(t)) return
      setTags((prev) => [...prev, t])
      setTagInput('')
    },
    [tags],
  )

  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter((x) => x !== t))
  }, [])

  const handleAttachFiles = useCallback(async () => {
    setAttachError('')
    const result = (await window.electronAPI.invoke('notes:pick-files')) as {
      canceled?: boolean
      attachments?: NoteAttachment[]
      errors?: string[]
    }
    if (result.canceled) return
    if (result.attachments) setAttachments((prev) => [...prev, ...result.attachments!])
    if (result.errors?.length) setAttachError(result.errors.join('; '))
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this note? This cannot be undone.')) return
    await window.electronAPI.invoke('notes:delete', { id: note.id })
    onChange()
    onClose()
  }, [note.id, onChange, onClose])

  return (
    <aside
      data-testid="notes-editor-drawer"
      className="w-[480px] flex-shrink-0 flex flex-col border-l border-gray-800 overflow-hidden"
      style={{ backgroundColor: 'var(--brand-dark-card)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Editing</span>
        <button
          onClick={onClose}
          aria-label="Close editor"
          className="text-gray-400 hover:text-gray-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title…"
          aria-label="Note title"
          className="w-full bg-transparent text-base font-semibold text-white border-0 border-b border-gray-700 pb-2 focus:outline-none focus:border-indigo-500"
        />

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            className="text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {NOTE_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="accent-indigo-500"
            />
            Pin to top
          </label>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((t) => (
              <span
                key={t}
                className="text-[11px] bg-gray-800 border border-gray-700 rounded-full px-2 py-0.5 text-gray-300 flex items-center gap-1"
              >
                #{t}
                <button onClick={() => removeTag(t)} aria-label={`Remove tag ${t}`} className="text-gray-500 hover:text-red-400">×</button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addTag(tagInput)
              }
            }}
            list={`tag-suggestions-${note.id}`}
            placeholder="Add tag and press Enter"
            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <datalist id={`tag-suggestions-${note.id}`}>
            {tagSuggestions.filter((t) => !tags.includes(t)).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        {/* Body */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wider text-gray-500">Body</label>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-[10px] text-indigo-300 hover:text-indigo-200"
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {showPreview ? (
            <div className="prose prose-invert prose-sm max-w-none bg-gray-900 border border-gray-800 rounded-md p-3 min-h-[200px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {content || '_(empty)_'}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              aria-label="Note body"
              placeholder="Markdown is supported."
              className="w-full bg-gray-900 border border-gray-800 rounded-md p-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            />
          )}
        </div>

        {/* Attachments */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wider text-gray-500">
              Attachments {attachments.length > 0 && `(${attachments.length})`}
            </label>
            <button
              type="button"
              onClick={() => void handleAttachFiles()}
              className="text-[10px] text-indigo-300 hover:text-indigo-200"
            >
              + Add files
            </button>
          </div>
          {attachError && <p className="text-[10px] text-red-400 mb-1">{attachError}</p>}
          {attachments.length === 0 ? (
            <p className="text-[11px] italic text-gray-500">No files attached.</p>
          ) : (
            <ul className="space-y-1.5">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-md px-2 py-1.5"
                >
                  <span className="text-xs text-gray-300 flex-1 truncate">{a.name}</span>
                  <span className="text-[10px] text-gray-500">{(a.sizeBytes / 1024).toFixed(1)}KB</span>
                  <button
                    onClick={() => removeAttachment(a.id)}
                    aria-label={`Remove attachment ${a.name}`}
                    className="text-gray-500 hover:text-red-400 text-xs"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 px-5 py-3 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onUseInNextSession}
          data-testid="notes-use-in-session"
          className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Use in next session →
        </button>
        <button
          onClick={() => void handleDelete()}
          className="px-3 py-2 text-red-400 hover:text-red-300 text-xs font-medium border border-red-900/40 hover:border-red-800 rounded-lg transition-colors"
        >
          Delete
        </button>
      </div>
    </aside>
  )
}
