import { useState, useEffect, useCallback } from 'react'
import type { MemoryEntry } from '../../types/memory'

const TYPE_COLORS: Record<string, string> = {
  user: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  feedback: 'bg-green-500/20 text-green-300 border-green-500/30',
  project: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  reference: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  unknown: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

interface Props {
  cli: 'copilot' | 'claude'
}

export default function MemoryViewer({ cli }: Props): JSX.Element {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('memory:list-memory-entries', { cli }) as MemoryEntry[]
    setEntries(result)
    setLoading(false)
  }, [cli])

  useEffect(() => { void load() }, [load])

  const deleteEntry = async (entry: MemoryEntry) => {
    if (!confirm(`Delete memory entry "${entry.name}"?`)) return
    setDeleting(entry.id)
    const result = await window.electronAPI.invoke('memory:delete-file', { path: entry.path }) as
      | { success: boolean }
      | { error: string }
    setDeleting(null)
    if ('success' in result && result.success) {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    }
  }

  const allTypes = ['all', ...Array.from(new Set(entries.map((e) => e.type)))]

  const filtered = entries.filter((e) => {
    if (filterType !== 'all' && e.type !== filterType) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memories…"
          className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          {allTypes.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All types' : t}
            </option>
          ))}
        </select>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-md transition-colors flex-shrink-0"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {/* Count */}
      <div className="text-xs text-gray-500">
        {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        {entries.length !== filtered.length && ` (of ${entries.length})`}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          {entries.length === 0
            ? cli === 'claude'
              ? 'No Claude memory entries found in ~/.claude/projects/*/memory/'
              : 'No Copilot memory files found in ~/.copilot/'
            : 'No entries match your search'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const isExpanded = expanded === entry.id
            const preview = stripFrontmatter(entry.content)
            const typeClass = TYPE_COLORS[entry.type] ?? TYPE_COLORS['unknown']

            return (
              <div
                key={entry.id}
                className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden"
              >
                {/* Card header */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : entry.id)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-200">{entry.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${typeClass}`}>
                        {entry.type}
                      </span>
                    </div>
                    {entry.description && (
                      <div className="text-xs text-gray-400">{entry.description}</div>
                    )}
                    <div className="text-xs text-gray-600 mt-1 font-mono truncate">
                      {entry.projectPath} · {timeAgo(entry.modifiedAt)}
                    </div>
                  </button>
                  <button
                    onClick={() => void deleteEntry(entry)}
                    disabled={deleting === entry.id}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 mt-0.5"
                    title="Delete entry"
                  >
                    {deleting === entry.id ? '…' : '✕'}
                  </button>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-700 px-4 py-3">
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">
                      {preview || entry.content}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
