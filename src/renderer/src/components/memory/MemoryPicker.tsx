import { useState, useEffect, useCallback, useRef } from 'react'

interface NoteAttachment {
  id: string; path: string; name: string; sizeBytes: number; addedAt: number
}

interface Note {
  id: string; title: string; content: string; tags: string[]; category: string
  source?: string; sessionName?: string; attachments?: NoteAttachment[]
  createdAt: number; updatedAt: number; pinned: boolean
}

interface Props {
  selectedIds: Set<string>
  onToggle: (noteId: string) => void
  onClear: () => void
}

const CATEGORY_COLORS: Record<string, string> = {
  meeting: 'bg-blue-900/30 text-blue-400',
  conversation: 'bg-green-900/30 text-green-400',
  reference: 'bg-purple-900/30 text-purple-400',
  outcome: 'bg-amber-900/30 text-amber-400',
  idea: 'bg-pink-900/30 text-pink-400',
  custom: 'bg-gray-800 text-gray-400',
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function MemoryPicker({ selectedIds, onToggle, onClear }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('notes:list', search ? { search } : undefined) as Note[]
    setNotes(result)
    setLoading(false)
  }, [search])

  useEffect(() => { if (open) void load() }, [open, load])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
          selectedIds.size > 0
            ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/50'
            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
        }`}
        title="Attach memories to your next prompt"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        {selectedIds.size > 0 ? (
          <span>{selectedIds.size} memor{selectedIds.size === 1 ? 'y' : 'ies'}</span>
        ) : (
          <span>Memories</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-40 overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-300">Attach Memories</span>
              {selectedIds.size > 0 && (
                <button onClick={onClear} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                  Clear all
                </button>
              )}
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          {/* Note list */}
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-gray-500 text-center py-4">Loading...</p>
            ) : notes.length === 0 ? (
              <div className="text-center py-6 px-4">
                <p className="text-xs text-gray-500">No memories yet</p>
                <p className="text-[10px] text-gray-600 mt-1">Save AI responses as memories, or create them in Configure → Memory</p>
              </div>
            ) : notes.map((note) => {
              const isSelected = selectedIds.has(note.id)
              return (
                <button
                  key={note.id}
                  onClick={() => onToggle(note.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-800/50 transition-colors ${
                    isSelected ? 'bg-indigo-900/20' : 'hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                      isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'
                    }`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {note.pinned && <span className="text-[10px]">📌</span>}
                        <span className="text-xs font-medium text-gray-200 truncate">{note.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] px-1 py-0.5 rounded ${CATEGORY_COLORS[note.category] ?? CATEGORY_COLORS.custom}`}>
                          {note.category}
                        </span>
                        {note.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-[9px] text-gray-600">#{t}</span>
                        ))}
                        <span className="text-[9px] text-gray-600">{timeAgo(note.updatedAt)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[10px] text-gray-500 truncate flex-1">{note.content.slice(0, 80)}</p>
                        {(note.attachments?.length ?? 0) > 0 && (
                          <span className="text-[9px] text-gray-500 flex items-center gap-0.5 flex-shrink-0">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            {note.attachments!.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer with selected count */}
          {selectedIds.size > 0 && (
            <div className="px-3 py-2 border-t border-gray-800 bg-gray-900/80">
              <p className="text-[10px] text-gray-400">
                {selectedIds.size} memor{selectedIds.size === 1 ? 'y' : 'ies'} will be included as context in your next prompt
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
