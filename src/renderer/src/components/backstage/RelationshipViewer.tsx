import { useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface RelationshipNode {
  ref: string
  name: string
  kind: string
  relationships: Array<{
    type: string
    targetRef: string
    targetName: string
    targetKind: string
  }>
}

interface SearchResult {
  ref: string
  name: string
  kind: string
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RelationshipViewer(): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const [rootEntity, setRootEntity] = useState<RelationshipNode | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Map<string, RelationshipNode>>(new Map())
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set())
  const [maxDepth, setMaxDepth] = useState(2)
  const [loading, setLoading] = useState(false)

  // Search for entities
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (query.length < 2) {
      setSearchResults([])
      setShowResults(false)
      return
    }
    setSearching(true)
    setShowResults(true)
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:search', {
        query,
        limit: 10,
      })) as { success: boolean; results?: SearchResult[] }
      if (result.success && result.results) {
        setSearchResults(result.results)
      }
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  // Load relationships for the root entity
  const selectEntity = async (ref: string) => {
    setShowResults(false)
    setLoading(true)
    setExpandedNodes(new Map())
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:get-relationships', {
        ref,
        depth: 1,
      })) as { success: boolean; root?: RelationshipNode }
      if (result.success && result.root) {
        setRootEntity(result.root)
        setSearchQuery(result.root.name)
      }
    } catch {
      setRootEntity(null)
    } finally {
      setLoading(false)
    }
  }

  // Expand a child node to load its relationships
  const expandNode = async (ref: string) => {
    if (expandedNodes.has(ref)) {
      // Collapse
      const next = new Map(expandedNodes)
      next.delete(ref)
      setExpandedNodes(next)
      return
    }

    setLoadingNodes((prev) => new Set(prev).add(ref))
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:get-relationships', {
        ref,
        depth: 1,
      })) as { success: boolean; root?: RelationshipNode }
      if (result.success && result.root) {
        setExpandedNodes((prev) => new Map(prev).set(ref, result.root!))
      }
    } catch {
      // silent
    } finally {
      setLoadingNodes((prev) => {
        const next = new Set(prev)
        next.delete(ref)
        return next
      })
    }
  }

  // Recursive tree rendering
  const renderNode = (
    node: RelationshipNode,
    depth: number,
    parentRef: string | null,
  ): JSX.Element => {
    // Group relationships by type
    const byType = new Map<string, typeof node.relationships>()
    for (const rel of node.relationships) {
      // Skip the parent to avoid circular display
      if (rel.targetRef === parentRef) continue
      const existing = byType.get(rel.type) ?? []
      existing.push(rel)
      byType.set(rel.type, existing)
    }

    return (
      <div className="space-y-1">
        {Array.from(byType.entries()).map(([type, rels]) => (
          <div key={type} className="ml-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-2 mb-1">
              {type}
            </p>
            {rels.map((rel) => {
              const isExpanded = expandedNodes.has(rel.targetRef)
              const isLoading = loadingNodes.has(rel.targetRef)
              const canExpand = depth < maxDepth

              return (
                <div key={rel.targetRef}>
                  <div className="flex items-center gap-2 py-1 pl-2 rounded-lg hover:bg-gray-50 group">
                    {/* Expand/collapse toggle */}
                    {canExpand ? (
                      <button
                        onClick={() => void expandNode(rel.targetRef)}
                        disabled={isLoading}
                        className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
                      >
                        {isLoading ? (
                          <div className="w-3 h-3 border border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                        ) : (
                          <svg
                            className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                      </div>
                    )}

                    {/* Kind badge */}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${
                      kindColor(rel.targetKind)
                    }`}>
                      {rel.targetKind}
                    </span>

                    {/* Entity name */}
                    <button
                      onClick={() => void selectEntity(rel.targetRef)}
                      className="text-xs text-gray-800 font-medium hover:text-indigo-600 transition-colors truncate"
                    >
                      {rel.targetName}
                    </button>
                  </div>

                  {/* Expanded children */}
                  {isExpanded && expandedNodes.get(rel.targetRef) && (
                    <div className="ml-2 border-l border-gray-200 pl-2">
                      {renderNode(expandedNodes.get(rel.targetRef)!, depth + 1, rel.targetRef)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {byType.size === 0 && (
          <p className="text-xs text-gray-400 ml-4">No relationships</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Entity picker */}
      <div className="relative max-w-md">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => void handleSearch(e.target.value)}
          onFocus={() => { if (searchResults.length > 0) setShowResults(true) }}
          placeholder="Search for an entity to explore..."
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />

        {/* Search results dropdown */}
        {showResults && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {searching ? (
              <div className="px-3 py-2 text-xs text-gray-400">Searching...</div>
            ) : searchResults.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No results</div>
            ) : (
              searchResults.map((r) => (
                <button
                  key={r.ref}
                  onClick={() => void selectEntity(r.ref)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                >
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${kindColor(r.kind)}`}>
                    {r.kind}
                  </span>
                  <span className="text-sm text-gray-800">{r.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Depth selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Max depth:</span>
        {[1, 2, 3].map((d) => (
          <button
            key={d}
            onClick={() => setMaxDepth(d)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              maxDepth === d
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Relationship tree */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : rootEntity ? (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          {/* Root entity */}
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${kindColor(rootEntity.kind)}`}>
              {rootEntity.kind}
            </span>
            <h3 className="text-sm font-semibold text-gray-900">{rootEntity.name}</h3>
            <span className="text-xs text-gray-400">({rootEntity.relationships.length} relationships)</span>
          </div>

          {renderNode(rootEntity, 0, null)}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <p className="text-sm text-gray-500">Select an entity to explore its relationships</p>
          <p className="text-xs text-gray-400 mt-1">Use the search bar above to find an entity</p>
        </div>
      )}
    </div>
  )
}

function kindColor(kind: string): string {
  const colors: Record<string, string> = {
    Component: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    API: 'bg-teal-50 text-teal-700 border-teal-200',
    System: 'bg-purple-50 text-purple-700 border-purple-200',
    Domain: 'bg-amber-50 text-amber-700 border-amber-200',
    Group: 'bg-blue-50 text-blue-700 border-blue-200',
    Resource: 'bg-orange-50 text-orange-700 border-orange-200',
    User: 'bg-gray-50 text-gray-700 border-gray-200',
  }
  return colors[kind] ?? 'bg-gray-50 text-gray-600 border-gray-200'
}
