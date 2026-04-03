import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface NoteAttachment {
  id: string; path: string; name: string; sizeBytes: number; addedAt: number
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

const CATEGORIES = ['meeting', 'conversation', 'reference', 'outcome', 'idea', 'custom'] as const

const CATEGORY_STYLES: Record<string, { badge: string; dot: string }> = {
  meeting:      { badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  conversation: { badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  reference:    { badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  outcome:      { badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  idea:         { badge: 'bg-pink-100 text-pink-700',   dot: 'bg-pink-500' },
  custom:       { badge: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400' },
}

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

// ── Main component ───────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'edit'

export default function NotesManager(): JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')

  // Filters & pagination
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  // Editor state (shared between create and edit)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<string>('reference')
  const [tagsInput, setTagsInput] = useState('')
  const [pinned, setPinned] = useState(false)
  const [editSource, setEditSource] = useState<string | undefined>()
  const [editSessionName, setEditSessionName] = useState<string | undefined>()
  const [editCreatedAt, setEditCreatedAt] = useState<number>(0)
  const [attachments, setAttachments] = useState<NoteAttachment[]>([])
  const [attachError, setAttachError] = useState('')

  // ── Data loading ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const args: Record<string, unknown> = {}
    if (search) args.search = search
    if (filterCat) args.category = filterCat
    if (filterTag) args.tag = filterTag

    const [result, tags] = await Promise.all([
      window.electronAPI.invoke('notes:list', Object.keys(args).length > 0 ? args : undefined) as Promise<Note[]>,
      window.electronAPI.invoke('notes:tags') as Promise<string[]>,
    ])
    setNotes(result)
    setAllTags(tags)
    setLoading(false)
  }, [search, filterCat, filterTag])

  useEffect(() => { setPage(0); void load() }, [load])

  // ── Actions ──────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditId(null)
    setTitle('')
    setContent('')
    setCategory('reference')
    setTagsInput('')
    setPinned(false)
    setEditSource(undefined)
    setEditSessionName(undefined)
    setAttachments([])
    setAttachError('')
    setView('create')
  }

  const openEdit = (note: Note) => {
    setEditId(note.id)
    setTitle(note.title)
    setContent(note.content)
    setCategory(note.category)
    setTagsInput(note.tags.join(', '))
    setPinned(note.pinned)
    setEditSource(note.source)
    setEditSessionName(note.sessionName)
    setEditCreatedAt(note.createdAt)
    setAttachments(note.attachments ?? [])
    setAttachError('')
    setView('edit')
  }

  const handleAttachFiles = async () => {
    setAttachError('')
    const result = await window.electronAPI.invoke('notes:pick-files') as { canceled?: boolean; attachments?: NoteAttachment[]; errors?: string[] }
    if (result.canceled) return
    if (result.attachments) setAttachments((prev) => [...prev, ...result.attachments!])
    if (result.errors && result.errors.length > 0) setAttachError(result.errors.join('; '))
  }

  const handleRemoveAttachment = (attId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attId))
  }

  const handleSave = async () => {
    const parsedTags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)

    if (view === 'create') {
      if (!title.trim()) return
      await window.electronAPI.invoke('notes:create', {
        title: title.trim(),
        content,
        category,
        tags: parsedTags,
        pinned,
        attachments,
        source: 'manual',
      })
    } else if (view === 'edit' && editId) {
      await window.electronAPI.invoke('notes:update', {
        id: editId,
        title: title.trim(),
        content,
        category,
        tags: parsedTags,
        pinned,
        attachments,
      })
    }

    setView('list')
    void load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note? This cannot be undone.')) return
    await window.electronAPI.invoke('notes:delete', { id })
    if (editId === id) setView('list')
    void load()
  }

  const handleTogglePin = async (note: Note) => {
    await window.electronAPI.invoke('notes:update', { id: note.id, pinned: !note.pinned })
    void load()
  }

  // ── Editor view (create + edit) ────────────────────────────────────────────

  if (view === 'create' || view === 'edit') {
    return (
      <div className="space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button onClick={() => setView('list')}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex items-center gap-2">
            {view === 'edit' && editId && (
              <button onClick={() => void handleDelete(editId)}
                className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                Delete
              </button>
            )}
            <button onClick={() => void handleSave()} disabled={!title.trim()}
              className="px-5 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors">
              {view === 'create' ? 'Create Note' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title — e.g., Sprint planning notes, Migration decision..."
          className="w-full text-lg font-semibold text-gray-900 border-0 border-b-2 border-gray-200 pb-2 focus:outline-none focus:border-indigo-500 transition-colors"
          autoFocus
        />

        {/* Metadata row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Tags</label>
            <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Comma separated — e.g., q2, migration, auth"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>

          <div className="pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <span className="text-xs text-gray-600">Pin to top</span>
            </label>
          </div>
        </div>

        {/* Content editor */}
        <div>
          <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            placeholder="Meeting notes, conversation highlights, reference material, ideas, anything you want to remember and reference later in AI sessions..."
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </div>

        {/* File attachments */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[10px] text-gray-400 uppercase tracking-wider">
              Attachments {attachments.length > 0 && `(${attachments.length})`}
            </label>
            <button onClick={() => void handleAttachFiles()}
              className="text-xs text-indigo-600 hover:text-indigo-500 font-medium flex items-center gap-1 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Attach text file
            </button>
          </div>

          {attachError && (
            <p className="text-xs text-red-500 mb-2">{attachError}</p>
          )}

          {attachments.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No files attached. Attach .txt, .md, .csv, .json, code files, and other text files to include their content when this note is used as session context.</p>
          ) : (
            <div className="space-y-1.5">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-700 truncate block">{att.name}</span>
                    <span className="text-[10px] text-gray-400">{(att.sizeBytes / 1024).toFixed(1)}KB</span>
                  </div>
                  <button onClick={() => handleRemoveAttachment(att.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0" title="Remove attachment">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Metadata footer (edit mode only) */}
        {view === 'edit' && (
          <div className="flex items-center gap-4 text-[10px] text-gray-400 border-t border-gray-100 pt-3">
            <span>Created {new Date(editCreatedAt).toLocaleString()}</span>
            {editSource && editSource !== 'manual' && <span>Source: {editSource}</span>}
            {editSessionName && <span>Session: {editSessionName}</span>}
          </div>
        )}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Your Notes</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Meeting notes, conversation highlights, reference material. Attach these to AI sessions for context.
          </p>
        </div>
        <button onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 transition-colors flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Note
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setFilterTag('') }}
            placeholder="Search notes by title, content, or tags..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Tag filter pills */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button key={tag}
              onClick={() => { setFilterTag(filterTag === tag ? '' : tag); setSearch('') }}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                filterTag === tag
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading notes...</p>
      ) : notes.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="w-14 h-14 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">No notes yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Create notes to store meeting summaries, conversation highlights, and reference material.
              You can also save AI responses directly from sessions using the bookmark button.
            </p>
          </div>
          <button onClick={openCreate}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors">
            Create Your First Note
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((note) => {
            const style = CATEGORY_STYLES[note.category] ?? CATEGORY_STYLES.custom
            return (
              <div key={note.id}
                onClick={() => openEdit(note)}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  {/* Category dot */}
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${style.dot}`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {note.pinned && <span className="text-[10px]">📌</span>}
                      <h4 className="text-sm font-medium text-gray-900 truncate">{note.title}</h4>
                    </div>

                    {/* Preview */}
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {note.content.slice(0, 200)}
                    </p>

                    {/* Meta row */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${style.badge}`}>
                        {note.category}
                      </span>
                      {note.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] text-gray-400">#{t}</span>
                      ))}
                      {note.tags.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{note.tags.length - 3} more</span>
                      )}
                      <span className="text-[10px] text-gray-400">{timeAgo(note.updatedAt)}</span>
                      {(note.attachments?.length ?? 0) > 0 && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {note.attachments.length} file{note.attachments.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {note.sessionName && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          {note.sessionName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Hover actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleTogglePin(note) }}
                      className={`p-1.5 rounded-lg transition-colors ${note.pinned ? 'text-indigo-500 bg-indigo-50' : 'text-gray-400 hover:text-indigo-500 hover:bg-gray-50'}`}
                      title={note.pinned ? 'Unpin' : 'Pin to top'}
                    >
                      <svg className="w-3.5 h-3.5" fill={note.pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(note.id) }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete note"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Pagination */}
          {notes.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, notes.length)} of {notes.length} notes
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2.5 py-1 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >Prev</button>
                {Array.from({ length: Math.ceil(notes.length / PAGE_SIZE) }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                      page === i ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >{i + 1}</button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(Math.ceil(notes.length / PAGE_SIZE) - 1, p + 1))}
                  disabled={page >= Math.ceil(notes.length / PAGE_SIZE) - 1}
                  className="px-2.5 py-1 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
