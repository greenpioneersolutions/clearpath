import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface EntityRef {
  ref: string
  name: string
  kind: string
  mentions?: number
}

interface Props {
  onInjectContext: (text: string) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BackstageContextPanel({ onInjectContext }: Props): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<EntityRef[]>([])
  const [searching, setSearching] = useState(false)

  const [sessionEntities, setSessionEntities] = useState<EntityRef[]>([])
  const [suggestions, setSuggestions] = useState<EntityRef[]>([])
  const [bookmarks, setBookmarks] = useState<EntityRef[]>([])
  const [recent, setRecent] = useState<EntityRef[]>([])
  const [loading, setLoading] = useState(true)

  // Load all sections
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [sessionRes, suggestRes, bookmarkRes, recentRes] = await Promise.all([
        window.electronAPI.invoke('backstage-explorer:get-session-entities') as Promise<{
          success: boolean; entities?: EntityRef[]
        }>,
        window.electronAPI.invoke('backstage-explorer:get-suggestions') as Promise<{
          success: boolean; entities?: EntityRef[]
        }>,
        window.electronAPI.invoke('backstage-explorer:get-bookmarks') as Promise<{
          success: boolean; bookmarks?: string[]; entities?: EntityRef[]
        }>,
        window.electronAPI.invoke('backstage-explorer:get-recent') as Promise<{
          success: boolean; entities?: EntityRef[]
        }>,
      ])

      if (sessionRes.success && sessionRes.entities) setSessionEntities(sessionRes.entities)
      if (suggestRes.success && suggestRes.entities) setSuggestions(suggestRes.entities)
      if (bookmarkRes.success && bookmarkRes.entities) setBookmarks(bookmarkRes.entities)
      if (recentRes.success && recentRes.entities) setRecent(recentRes.entities)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Search
  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:search', {
        query,
        limit: 8,
      })) as { success: boolean; results?: EntityRef[] }
      if (result.success && result.results) {
        setSearchResults(result.results)
      }
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  // Add entity context to session
  const addEntityContext = async (ref: string) => {
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:build-ai-context', {
        refs: [ref],
      })) as { success: boolean; context?: string }
      if (result.success && result.context) {
        onInjectContext(result.context)
      }
    } catch {
      // silent
    }
  }

  // Add all entities to context
  const addAllToContext = async () => {
    const allRefs = [
      ...sessionEntities.map((e) => e.ref),
      ...suggestions.map((e) => e.ref),
      ...bookmarks.map((e) => e.ref),
    ]
    const uniqueRefs = [...new Set(allRefs)]
    if (uniqueRefs.length === 0) return
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:build-ai-context', {
        refs: uniqueRefs,
      })) as { success: boolean; context?: string }
      if (result.success && result.context) {
        onInjectContext(result.context)
      }
    } catch {
      // silent
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
  }

  const hasAnyData = sessionEntities.length > 0 || suggestions.length > 0 || bookmarks.length > 0 || recent.length > 0

  return (
    <div className="space-y-4">
      {/* Search */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => void handleSearch(e.target.value)}
          placeholder="Search catalog..."
          className="w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        />
        {searching && <p className="text-[10px] text-gray-400 mt-1">Searching...</p>}
        {searchResults.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {searchResults.map((entity) => (
              <EntityRow key={entity.ref} entity={entity} onAdd={() => void addEntityContext(entity.ref)} />
            ))}
          </div>
        )}
      </div>

      {/* IN THIS SESSION */}
      {sessionEntities.length > 0 && (
        <Section title="IN THIS SESSION">
          {sessionEntities.map((entity) => (
            <EntityRow
              key={entity.ref}
              entity={entity}
              onAdd={() => void addEntityContext(entity.ref)}
              subtitle={entity.mentions ? `${entity.mentions} mentions` : 'auto-detected'}
            />
          ))}
        </Section>
      )}

      {/* SUGGESTIONS */}
      {suggestions.length > 0 && (
        <Section title="SUGGESTIONS">
          {suggestions.map((entity) => (
            <EntityRow
              key={entity.ref}
              entity={entity}
              onAdd={() => void addEntityContext(entity.ref)}
              subtitle="related"
            />
          ))}
        </Section>
      )}

      {/* BOOKMARKS */}
      {bookmarks.length > 0 && (
        <Section title="BOOKMARKS">
          {bookmarks.map((entity) => (
            <EntityRow key={entity.ref} entity={entity} onAdd={() => void addEntityContext(entity.ref)} />
          ))}
        </Section>
      )}

      {/* RECENT */}
      {recent.length > 0 && (
        <Section title="RECENT">
          {recent.map((entity) => (
            <EntityRow key={entity.ref} entity={entity} onAdd={() => void addEntityContext(entity.ref)} />
          ))}
        </Section>
      )}

      {/* Empty state */}
      {!hasAnyData && !searchQuery && (
        <div className="text-center py-8 text-gray-400 text-sm space-y-1">
          <p>No catalog entities loaded yet</p>
          <p className="text-xs">Index your catalog in the Backstage Explorer page</p>
        </div>
      )}

      {/* Add all button */}
      {hasAnyData && (
        <button
          onClick={() => void addAllToContext()}
          className="w-full py-2 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          Add all to context
        </button>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{title}</h4>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function EntityRow({
  entity,
  onAdd,
  subtitle,
}: {
  entity: EntityRef
  onAdd: () => void
  subtitle?: string
}): JSX.Element {
  const kindColors: Record<string, string> = {
    Component: 'text-indigo-600',
    API: 'text-teal-600',
    System: 'text-purple-600',
    Group: 'text-blue-600',
  }

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 group transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-medium ${kindColors[entity.kind] ?? 'text-gray-500'}`}>
            {entity.kind?.charAt(0)}
          </span>
          <span className="text-xs font-medium text-gray-800 truncate">{entity.name}</span>
        </div>
        {subtitle && (
          <p className="text-[10px] text-gray-400 ml-4">{subtitle}</p>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onAdd() }}
        className="text-xs text-indigo-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2 w-5 h-5 flex items-center justify-center rounded hover:bg-indigo-100"
        title="Add to context"
      >
        +
      </button>
    </div>
  )
}
