import { useState, useEffect, useCallback, useMemo } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface BrowseEntity {
  ref: string
  name: string
  kind: string
  owner: string
  lifecycle: string
  type: string
  tags: string[]
  relationsCount: number
  description: string
}

interface EntityDetail {
  ref: string
  name: string
  kind: string
  description: string
  owner: string
  lifecycle: string
  type: string
  system: string | null
  tags: string[]
  metadata: Record<string, unknown>
  relationships: Array<{
    type: string
    targetRef: string
    targetName: string
    targetKind: string
  }>
  techdocs: string | null
  kubernetes: Record<string, unknown> | null
  sessionMentions: Array<{ sessionId: string; count: number; lastMentioned: string }>
  notes: Array<{ id: string; title: string; excerpt: string }>
}

interface BrowseResult {
  success: boolean
  entities: BrowseEntity[]
  total: number
  page: number
  pageSize: number
}

interface OverviewData {
  allKinds: string[]
  allLifecycles: string[]
  allOwners: string[]
  allTags: string[]
}

interface Props {
  initialFilter?: { owner?: string } | null
}

type SortField = 'name' | 'kind' | 'owner' | 'lifecycle' | 'type' | 'relationsCount'
type SortDir = 'asc' | 'desc'

// ── Helpers ──────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }): JSX.Element {
  const colors: Record<string, string> = {
    Component: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    API: 'bg-teal-50 text-teal-700 border-teal-200',
    System: 'bg-purple-50 text-purple-700 border-purple-200',
    Domain: 'bg-amber-50 text-amber-700 border-amber-200',
    Group: 'bg-blue-50 text-blue-700 border-blue-200',
    Resource: 'bg-orange-50 text-orange-700 border-orange-200',
    User: 'bg-gray-50 text-gray-700 border-gray-200',
  }
  const cls = colors[kind] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>{kind}</span>
}

function LifecycleBadge({ lifecycle }: { lifecycle: string }): JSX.Element {
  const colors: Record<string, string> = {
    production: 'bg-green-50 text-green-700 border-green-200',
    experimental: 'bg-amber-50 text-amber-700 border-amber-200',
    deprecated: 'bg-red-50 text-red-700 border-red-200',
  }
  const cls = colors[lifecycle] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>{lifecycle}</span>
}

// ── Detail sub-tabs ──────────────────────────────────────────────────────────

type DetailSubTab = 'overview' | 'relationships' | 'docs' | 'runtime' | 'activity' | 'notes'

// ── Component ────────────────────────────────────────────────────────────────

export default function EntityBrowser({ initialFilter }: Props): JSX.Element {
  // Filter state
  const [kindFilter, setKindFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState(initialFilter?.owner ?? '')
  const [lifecycleFilter, setLifecycleFilter] = useState('')
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Data state
  const [entities, setEntities] = useState<BrowseEntity[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [loading, setLoading] = useState(true)

  // Sort
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Filter options from overview
  const [filterOptions, setFilterOptions] = useState<OverviewData>({
    allKinds: [],
    allLifecycles: [],
    allOwners: [],
    allTags: [],
  })

  // Detail panel
  const [selectedEntity, setSelectedEntity] = useState<EntityDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailSubTab, setDetailSubTab] = useState<DetailSubTab>('overview')
  const [bookmarked, setBookmarked] = useState(false)
  const [bookmarks, setBookmarks] = useState<string[]>([])

  // Apply initial filter
  useEffect(() => {
    if (initialFilter?.owner) {
      setOwnerFilter(initialFilter.owner)
    }
  }, [initialFilter])

  // Load filter options
  useEffect(() => {
    void (async () => {
      try {
        const result = (await window.electronAPI.invoke('backstage-explorer:get-overview')) as {
          success: boolean
          data?: OverviewData
        }
        if (result.success && result.data) {
          setFilterOptions({
            allKinds: result.data.allKinds ?? [],
            allLifecycles: result.data.allLifecycles ?? [],
            allOwners: result.data.allOwners ?? [],
            allTags: result.data.allTags ?? [],
          })
        }
      } catch {
        // silent
      }
    })()
  }, [])

  // Load bookmarks
  useEffect(() => {
    void (async () => {
      try {
        const result = (await window.electronAPI.invoke('backstage-explorer:get-bookmarks')) as {
          success: boolean
          bookmarks?: string[]
        }
        if (result.success && result.bookmarks) setBookmarks(result.bookmarks)
      } catch {
        // silent
      }
    })()
  }, [])

  // Load entities
  const loadEntities = useCallback(async () => {
    setLoading(true)
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:browse-entities', {
        kind: kindFilter || undefined,
        owner: ownerFilter || undefined,
        lifecycle: lifecycleFilter || undefined,
        tags: tagFilters.length > 0 ? tagFilters : undefined,
        search: searchText || undefined,
        sort: sortField,
        sortDir,
        page,
        pageSize,
      })) as BrowseResult
      if (result.success) {
        setEntities(result.entities)
        setTotal(result.total)
      }
    } catch {
      setEntities([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [kindFilter, ownerFilter, lifecycleFilter, tagFilters, searchText, sortField, sortDir, page, pageSize])

  useEffect(() => {
    void loadEntities()
  }, [loadEntities])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [kindFilter, ownerFilter, lifecycleFilter, tagFilters, searchText])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Load entity detail
  const openDetail = async (ref: string) => {
    setDetailLoading(true)
    setDetailSubTab('overview')
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:get-entity-detail', {
        ref,
      })) as { success: boolean; entity?: EntityDetail }
      if (result.success && result.entity) {
        setSelectedEntity(result.entity)
        setBookmarked(bookmarks.includes(result.entity.ref))
      }
    } catch {
      setSelectedEntity(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const toggleBookmark = async () => {
    if (!selectedEntity) return
    const ref = selectedEntity.ref
    let newBookmarks: string[]
    if (bookmarked) {
      newBookmarks = bookmarks.filter((b) => b !== ref)
    } else {
      newBookmarks = [...bookmarks, ref]
    }
    setBookmarks(newBookmarks)
    setBookmarked(!bookmarked)
    try {
      await window.electronAPI.invoke('backstage-explorer:set-bookmarks', { bookmarks: newBookmarks })
    } catch {
      // revert on failure
      setBookmarks(bookmarks)
      setBookmarked(bookmarked)
    }
  }

  const addToChat = async () => {
    if (!selectedEntity) return
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:build-ai-context', {
        refs: [selectedEntity.ref],
      })) as { success: boolean; context?: string }
      if (result.success && result.context) {
        await window.electronAPI.invoke('session:inject-context', { text: result.context })
      }
    } catch {
      // silent
    }
  }

  const copyRef = () => {
    if (!selectedEntity) return
    void navigator.clipboard.writeText(selectedEntity.ref)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' \u2191' : ' \u2193'
  }

  // Group relationships by type for detail panel
  const groupedRelationships = useMemo(() => {
    if (!selectedEntity) return new Map<string, EntityDetail['relationships']>()
    const map = new Map<string, EntityDetail['relationships']>()
    for (const rel of selectedEntity.relationships) {
      const existing = map.get(rel.type) ?? []
      existing.push(rel)
      map.set(rel.type, existing)
    }
    return map
  }, [selectedEntity])

  const toggleTag = (tag: string) => {
    setTagFilters((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  return (
    <div className="flex gap-0 -mx-6 -mb-6" style={{ height: 'calc(100vh - 280px)' }}>
      {/* Left sidebar: filters */}
      {sidebarOpen && (
        <div className="w-60 flex-shrink-0 border-r border-gray-200 p-4 overflow-y-auto bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filters</h3>
            <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600 text-xs">
              Hide
            </button>
          </div>

          {/* Search */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-600 block mb-1">Search</label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search entities..."
              className="w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Kind */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-600 block mb-1">Kind</label>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            >
              <option value="">All kinds</option>
              {filterOptions.allKinds.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          {/* Owner */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-600 block mb-1">Owner</label>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            >
              <option value="">All owners</option>
              {filterOptions.allOwners.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* Lifecycle */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-600 block mb-1">Lifecycle</label>
            <select
              value={lifecycleFilter}
              onChange={(e) => setLifecycleFilter(e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            >
              <option value="">All lifecycles</option>
              {filterOptions.allLifecycles.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          {filterOptions.allTags.length > 0 && (
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-600 block mb-1">Tags</label>
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {filterOptions.allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      tagFilters.includes(tag)
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear filters */}
          {(kindFilter || ownerFilter || lifecycleFilter || tagFilters.length > 0 || searchText) && (
            <button
              onClick={() => {
                setKindFilter('')
                setOwnerFilter('')
                setLifecycleFilter('')
                setTagFilters([])
                setSearchText('')
              }}
              className="text-xs text-indigo-600 hover:text-indigo-500 font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Main: Entity table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!sidebarOpen && (
          <div className="px-4 pt-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-xs text-gray-500 hover:text-gray-700 mb-2"
            >
              Show Filters
            </button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : entities.length === 0 ? (
            <div className="text-center py-20 text-sm text-gray-400">No entities match your filters</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
                <tr>
                  {([
                    ['name', 'Name'],
                    ['kind', 'Kind'],
                    ['owner', 'Owner'],
                    ['lifecycle', 'Lifecycle'],
                    ['type', 'Type'],
                    ['relationsCount', 'Relations'],
                  ] as [SortField, string][]).map(([field, label]) => (
                    <th
                      key={field}
                      onClick={() => handleSort(field)}
                      className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 cursor-pointer hover:text-gray-700 select-none"
                    >
                      {label}{sortIndicator(field)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entities.map((entity) => (
                  <tr
                    key={entity.ref}
                    onClick={() => void openDetail(entity.ref)}
                    className={`border-b border-gray-50 hover:bg-indigo-50/50 cursor-pointer transition-colors ${
                      selectedEntity?.ref === entity.ref ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div>
                        <p className="font-medium text-gray-800">{entity.name}</p>
                        {entity.description && (
                          <p className="text-xs text-gray-400 truncate max-w-xs">{entity.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><KindBadge kind={entity.kind} /></td>
                    <td className="px-4 py-2.5 text-gray-600">{entity.owner}</td>
                    <td className="px-4 py-2.5">{entity.lifecycle && <LifecycleBadge lifecycle={entity.lifecycle} />}</td>
                    <td className="px-4 py-2.5 text-gray-500">{entity.type}</td>
                    <td className="px-4 py-2.5 text-gray-500">{entity.relationsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-white">
            <span className="text-xs text-gray-500">{total} entities total</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-xs text-gray-500 px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Entity Detail Panel */}
      <div
        className={`border-l border-gray-200 bg-white overflow-y-auto transition-all duration-200 ${
          selectedEntity ? 'w-[480px]' : 'w-0'
        }`}
      >
        {detailLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}

        {selectedEntity && !detailLoading && (
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <KindBadge kind={selectedEntity.kind} />
                  <h3 className="text-base font-semibold text-gray-900">{selectedEntity.name}</h3>
                </div>
                {selectedEntity.description && (
                  <p className="text-xs text-gray-500">{selectedEntity.description}</p>
                )}
              </div>
              <button onClick={() => setSelectedEntity(null)} className="text-gray-400 hover:text-gray-600 text-xs">
                Close
              </button>
            </div>

            {/* Metadata cards */}
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Owner', selectedEntity.owner],
                ['Lifecycle', selectedEntity.lifecycle],
                ['Type', selectedEntity.type],
                ['System', selectedEntity.system ?? '-'],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
                  <p className="text-sm text-gray-800 font-medium">{value || '-'}</p>
                </div>
              ))}
            </div>

            {/* Tags */}
            {selectedEntity.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedEntity.tags.map((tag) => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full border border-gray-200">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => void toggleBookmark()}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  bookmarked
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {bookmarked ? 'Bookmarked' : 'Bookmark'}
              </button>
              <button
                onClick={() => void addToChat()}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Add to Chat Context
              </button>
              <button
                onClick={copyRef}
                className="px-3 py-1.5 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Copy Ref
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="border-b border-gray-200">
              <nav className="flex gap-4">
                {([
                  ['overview', 'Overview'],
                  ['relationships', 'Relationships'],
                  ['docs', 'Documentation'],
                  ['runtime', 'Runtime'],
                  ['activity', 'Activity'],
                  ['notes', 'Notes'],
                ] as [DetailSubTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setDetailSubTab(key)}
                    className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                      detailSubTab === key
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Sub-tab content */}
            <div className="min-h-[200px]">
              {detailSubTab === 'overview' && (
                <div className="space-y-2 text-sm">
                  {Object.entries(selectedEntity.metadata).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-1 border-b border-gray-50">
                      <span className="text-gray-500 text-xs">{key}</span>
                      <span className="text-gray-800 text-xs font-medium">{String(value)}</span>
                    </div>
                  ))}
                  {Object.keys(selectedEntity.metadata).length === 0 && (
                    <p className="text-xs text-gray-400">No additional metadata</p>
                  )}
                </div>
              )}

              {detailSubTab === 'relationships' && (
                <div className="space-y-3">
                  {groupedRelationships.size === 0 ? (
                    <p className="text-xs text-gray-400">No relationships</p>
                  ) : (
                    Array.from(groupedRelationships.entries()).map(([type, rels]) => (
                      <div key={type}>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{type}</h4>
                        <div className="space-y-1">
                          {rels.map((rel) => (
                            <button
                              key={rel.targetRef}
                              onClick={() => void openDetail(rel.targetRef)}
                              className="w-full text-left px-2.5 py-1.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2"
                            >
                              <KindBadge kind={rel.targetKind} />
                              <span className="text-xs text-gray-800 font-medium">{rel.targetName}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailSubTab === 'docs' && (
                <div>
                  {selectedEntity.techdocs ? (
                    <div className="prose prose-sm max-w-none text-xs text-gray-700"
                      dangerouslySetInnerHTML={{ __html: selectedEntity.techdocs }}
                    />
                  ) : (
                    <p className="text-xs text-gray-400">No TechDocs available for this entity</p>
                  )}
                </div>
              )}

              {detailSubTab === 'runtime' && (
                <div>
                  {selectedEntity.kubernetes ? (
                    <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 overflow-auto max-h-64">
                      {JSON.stringify(selectedEntity.kubernetes, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs text-gray-400">No runtime information available</p>
                  )}
                </div>
              )}

              {detailSubTab === 'activity' && (
                <div className="space-y-2">
                  {selectedEntity.sessionMentions.length === 0 ? (
                    <p className="text-xs text-gray-400">No session mentions found</p>
                  ) : (
                    selectedEntity.sessionMentions.map((m) => (
                      <div key={m.sessionId} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                        <span className="text-xs text-gray-700 truncate">{m.sessionId}</span>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
                          <span>{m.count} mentions</span>
                          <span>{new Date(m.lastMentioned).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailSubTab === 'notes' && (
                <div className="space-y-2">
                  {selectedEntity.notes.length === 0 ? (
                    <p className="text-xs text-gray-400">No related notes found</p>
                  ) : (
                    selectedEntity.notes.map((note) => (
                      <div key={note.id} className="bg-gray-50 rounded-lg p-2.5">
                        <p className="text-xs font-medium text-gray-800">{note.title}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{note.excerpt}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
