'use strict'

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  autoRefreshMinutes: 60,
  maxIndexEntities: 10000,
  defaultPageSize: 25,
  relationshipMaxDepth: 4,
  summaryTtlMs: 24 * 60 * 60 * 1000,
}

const MAX_SESSION_TRACKING = 100
const MAX_RECENT = 20
const MAX_INDEX_ENTITIES = 10000

// ── Context Builder Helpers ─────────────────────────────────────────────────

/**
 * Build a catalog overview markdown context from the index.
 */
function buildCatalogOverviewContext(index) {
  if (!index || !index.entities || index.entities.length === 0) {
    return '## Backstage Catalog Overview\n\n*No entities indexed yet.*'
  }

  const lines = ['## Backstage Catalog Overview', '']
  lines.push(`**Total Entities**: ${index.entities.length}`)
  lines.push(`**Last Indexed**: ${index.lastRefreshed ? new Date(index.lastRefreshed).toISOString() : 'Unknown'}`)
  lines.push('')

  // Counts by kind
  if (index.countsByKind && Object.keys(index.countsByKind).length > 0) {
    lines.push('### Entities by Kind')
    lines.push('| Kind | Count |')
    lines.push('|------|-------|')
    const sorted = Object.entries(index.countsByKind).sort((a, b) => b[1] - a[1])
    for (const [kind, count] of sorted) {
      lines.push(`| ${kind} | ${count} |`)
    }
    lines.push('')
  }

  // Counts by lifecycle
  if (index.countsByLifecycle && Object.keys(index.countsByLifecycle).length > 0) {
    lines.push('### Entities by Lifecycle')
    lines.push('| Lifecycle | Count |')
    lines.push('|-----------|-------|')
    for (const [lifecycle, count] of Object.entries(index.countsByLifecycle)) {
      lines.push(`| ${lifecycle} | ${count} |`)
    }
    lines.push('')
  }

  // Top teams
  if (index.teams && index.teams.length > 0) {
    lines.push('### Teams (Top 10 by owned entities)')
    lines.push('| Team | Entities Owned | Kinds |')
    lines.push('|------|---------------|-------|')
    const topTeams = index.teams.slice(0, 10)
    for (const team of topTeams) {
      const kindList = team.kindCounts
        ? Object.entries(team.kindCounts).map(([k, c]) => `${k}:${c}`).join(', ')
        : ''
      lines.push(`| ${team.owner} | ${team.entityCount} | ${kindList} |`)
    }
    lines.push('')
  }

  // Top tags
  if (index.allTags && index.allTags.length > 0) {
    const tagDisplay = index.allTags.slice(0, 20).join(', ')
    lines.push(`### Common Tags`)
    lines.push(tagDisplay)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Build entity detail markdown context.
 */
function buildEntityDetailContext(index, entityRef, liveEntity) {
  const lines = ['## Entity Detail', '']

  // Use live entity if available, otherwise find in index
  const indexEntry = index
    ? (index.entities || []).find((e) => e.ref === entityRef)
    : null

  const entity = liveEntity || null

  if (entity) {
    const meta = entity.metadata || {}
    const spec = entity.spec || {}
    lines.push(`**Name**: ${meta.name || 'Unknown'}`)
    lines.push(`**Kind**: ${entity.kind || 'Unknown'}`)
    lines.push(`**Namespace**: ${meta.namespace || 'default'}`)
    if (meta.description) lines.push(`**Description**: ${meta.description}`)
    if (spec.owner) lines.push(`**Owner**: ${spec.owner}`)
    if (spec.lifecycle) lines.push(`**Lifecycle**: ${spec.lifecycle}`)
    if (spec.type) lines.push(`**Type**: ${spec.type}`)
    if (spec.system) lines.push(`**System**: ${spec.system}`)
    if (meta.tags && meta.tags.length > 0) lines.push(`**Tags**: ${meta.tags.join(', ')}`)
    lines.push('')

    // Relationships from live entity
    if (entity.relations && entity.relations.length > 0) {
      lines.push('### Relationships')
      lines.push('| Type | Target |')
      lines.push('|------|--------|')
      for (const rel of entity.relations) {
        lines.push(`| ${rel.type} | ${rel.targetRef} |`)
      }
      lines.push('')
    }
  } else if (indexEntry) {
    lines.push(`**Name**: ${indexEntry.name}`)
    lines.push(`**Kind**: ${indexEntry.kind}`)
    lines.push(`**Namespace**: ${indexEntry.namespace}`)
    if (indexEntry.description) lines.push(`**Description**: ${indexEntry.description}`)
    if (indexEntry.owner) lines.push(`**Owner**: ${indexEntry.owner}`)
    if (indexEntry.lifecycle) lines.push(`**Lifecycle**: ${indexEntry.lifecycle}`)
    if (indexEntry.type) lines.push(`**Type**: ${indexEntry.type}`)
    if (indexEntry.system) lines.push(`**System**: ${indexEntry.system}`)
    if (indexEntry.tags && indexEntry.tags.length > 0) lines.push(`**Tags**: ${indexEntry.tags.join(', ')}`)
    lines.push('')
  } else {
    lines.push(`*Entity "${entityRef}" not found in index.*`)
    return lines.join('\n')
  }

  // Related entities from index
  if (index && index.relationships) {
    const related = index.relationships.filter(
      (r) => r.sourceRef === entityRef || r.targetRef === entityRef
    )
    if (related.length > 0) {
      lines.push('### Related Entities (from catalog index)')
      lines.push('| Relationship | Entity |')
      lines.push('|-------------|--------|')
      for (const rel of related.slice(0, 30)) {
        const otherRef = rel.sourceRef === entityRef ? rel.targetRef : rel.sourceRef
        const direction = rel.sourceRef === entityRef ? `--[${rel.type}]-->` : `<--[${rel.type}]--`
        lines.push(`| ${direction} | ${otherRef} |`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Build team context markdown.
 */
function buildTeamContext(index, teamRef) {
  if (!index || !index.entities) {
    return `## Team: ${teamRef}\n\n*No index available.*`
  }

  const normalizedTeam = teamRef.toLowerCase()
  const teamEntities = index.entities.filter((e) => {
    if (!e.owner) return false
    const ownerLower = e.owner.toLowerCase()
    return ownerLower === normalizedTeam
      || ownerLower === `group:default/${normalizedTeam}`
      || ownerLower === `group:${normalizedTeam}`
      || ownerLower.includes(normalizedTeam)
  })

  const lines = [`## Team: ${teamRef}`, '']
  lines.push(`**Owned Entities**: ${teamEntities.length}`)
  lines.push('')

  if (teamEntities.length === 0) {
    lines.push(`*No entities found for team "${teamRef}". Try a different name or check team ownership in Backstage.*`)
    return lines.join('\n')
  }

  // Group by kind
  const byKind = {}
  for (const e of teamEntities) {
    const kind = e.kind || 'Unknown'
    if (!byKind[kind]) byKind[kind] = []
    byKind[kind].push(e)
  }

  for (const [kind, entities] of Object.entries(byKind)) {
    lines.push(`### ${kind}s (${entities.length})`)
    lines.push('| Name | Lifecycle | Type | Description |')
    lines.push('|------|-----------|------|-------------|')
    for (const e of entities) {
      const desc = e.description ? e.description.slice(0, 80) : ''
      lines.push(`| ${e.name} | ${e.lifecycle || 'N/A'} | ${e.type || 'N/A'} | ${desc} |`)
    }
    lines.push('')
  }

  // Inter-entity relationships
  if (index.relationships) {
    const entityRefs = new Set(teamEntities.map((e) => e.ref))
    const internalRels = index.relationships.filter(
      (r) => entityRefs.has(r.sourceRef) || entityRefs.has(r.targetRef)
    )
    if (internalRels.length > 0) {
      lines.push('### Relationships')
      lines.push('| Source | Type | Target |')
      lines.push('|--------|------|--------|')
      for (const r of internalRels.slice(0, 40)) {
        lines.push(`| ${r.sourceRef} | ${r.type} | ${r.targetRef} |`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Build system architecture markdown context.
 */
function buildSystemContext(index, systemRef) {
  if (!index || !index.entities) {
    return `## System: ${systemRef}\n\n*No index available.*`
  }

  const normalizedSystem = systemRef.toLowerCase()
  const systemEntities = index.entities.filter((e) => {
    if (!e.system) return false
    const sysLower = e.system.toLowerCase()
    return sysLower === normalizedSystem
      || sysLower === `system:default/${normalizedSystem}`
      || sysLower === `system:${normalizedSystem}`
      || sysLower.includes(normalizedSystem)
  })

  // Also find the system entity itself
  const systemEntity = index.entities.find((e) => {
    return e.kind === 'System' && e.name.toLowerCase() === normalizedSystem
  })

  const lines = [`## System Architecture: ${systemRef}`, '']

  if (systemEntity) {
    if (systemEntity.description) lines.push(`**Description**: ${systemEntity.description}`)
    if (systemEntity.owner) lines.push(`**Owner**: ${systemEntity.owner}`)
    if (systemEntity.lifecycle) lines.push(`**Lifecycle**: ${systemEntity.lifecycle}`)
    lines.push('')
  }

  lines.push(`**Components in System**: ${systemEntities.length}`)
  lines.push('')

  if (systemEntities.length === 0) {
    lines.push(`*No components found for system "${systemRef}". Try a different name.*`)
    return lines.join('\n')
  }

  // Group by kind
  const byKind = {}
  for (const e of systemEntities) {
    const kind = e.kind || 'Unknown'
    if (!byKind[kind]) byKind[kind] = []
    byKind[kind].push(e)
  }

  for (const [kind, entities] of Object.entries(byKind)) {
    lines.push(`### ${kind}s (${entities.length})`)
    lines.push('| Name | Owner | Lifecycle | Type | Description |')
    lines.push('|------|-------|-----------|------|-------------|')
    for (const e of entities) {
      const desc = e.description ? e.description.slice(0, 60) : ''
      lines.push(`| ${e.name} | ${e.owner || 'N/A'} | ${e.lifecycle || 'N/A'} | ${e.type || 'N/A'} | ${desc} |`)
    }
    lines.push('')
  }

  // Dependencies between system components
  if (index.relationships) {
    const entityRefs = new Set(systemEntities.map((e) => e.ref))
    if (systemEntity) entityRefs.add(systemEntity.ref)

    const systemRels = index.relationships.filter(
      (r) => entityRefs.has(r.sourceRef) || entityRefs.has(r.targetRef)
    )
    if (systemRels.length > 0) {
      lines.push('### Dependency Chain')
      lines.push('| Source | Relationship | Target |')
      lines.push('|--------|-------------|--------|')
      for (const r of systemRels.slice(0, 50)) {
        lines.push(`| ${r.sourceRef} | ${r.type} | ${r.targetRef} |`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Build search results markdown context.
 */
function buildSearchContext(index, results) {
  const lines = ['## Catalog Search Results', '']

  if (!results || results.length === 0) {
    lines.push('*No results found.*')
    return lines.join('\n')
  }

  lines.push(`**Results**: ${results.length}`)
  lines.push('')
  lines.push('| Name | Kind | Owner | Lifecycle | Description |')
  lines.push('|------|------|-------|-----------|-------------|')

  for (const r of results.slice(0, 25)) {
    const desc = r.description ? r.description.slice(0, 60) : ''
    lines.push(`| ${r.name} | ${r.kind || 'N/A'} | ${r.owner || 'N/A'} | ${r.lifecycle || 'N/A'} | ${desc} |`)
  }

  lines.push('')

  if (results.length > 25) {
    lines.push(`*Showing 25 of ${results.length} results.*`)
  }

  return lines.join('\n')
}

/**
 * Simple fuzzy match scoring: how well does a query match a string?
 * Returns 0 (no match) to 1 (exact match).
 */
function fuzzyScore(query, text) {
  if (!query || !text) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t === q) return 1
  if (t.includes(q)) return 0.8
  if (q.includes(t)) return 0.6

  // Check if all words in query appear in text
  const words = q.split(/\s+/)
  const matchedWords = words.filter((w) => t.includes(w))
  if (matchedWords.length === words.length) return 0.7
  if (matchedWords.length > 0) return 0.3 * (matchedWords.length / words.length)

  return 0
}

/**
 * Parse an entity ref string like "kind:namespace/name" into parts.
 */
function parseEntityRef(ref) {
  if (!ref) return { kind: '', namespace: 'default', name: '' }

  // Format: kind:namespace/name OR kind:name OR just name
  const colonIdx = ref.indexOf(':')
  if (colonIdx === -1) {
    return { kind: '', namespace: 'default', name: ref }
  }

  const kind = ref.slice(0, colonIdx)
  const rest = ref.slice(colonIdx + 1)
  const slashIdx = rest.indexOf('/')
  if (slashIdx === -1) {
    return { kind, namespace: 'default', name: rest }
  }

  return { kind, namespace: rest.slice(0, slashIdx), name: rest.slice(slashIdx + 1) }
}

/**
 * Scan text for entity name mentions against the index.
 * Returns array of matched entity refs.
 */
function scanForEntityMentions(text, index) {
  if (!text || !index || !index.entities) return []
  const lower = text.toLowerCase()
  const matches = []

  for (const entity of index.entities) {
    // Match on name (must be at least 3 chars to avoid false positives)
    if (entity.name && entity.name.length >= 3) {
      const nameLower = entity.name.toLowerCase()
      if (lower.includes(nameLower)) {
        matches.push(entity.ref)
      }
    }
  }

  return [...new Set(matches)]
}

// ── Extension Lifecycle ─────────────────────────────────────────────────────

async function activate(ctx) {
  ctx.log.info('Backstage Explorer extension activating...')

  // Initialize stores with defaults
  if (!ctx.store.get('config')) {
    ctx.store.set('config', DEFAULT_CONFIG)
  }
  if (!ctx.store.get('bookmarks')) {
    ctx.store.set('bookmarks', [])
  }
  if (!ctx.store.get('recent')) {
    ctx.store.set('recent', [])
  }
  if (!ctx.store.get('session-tracking')) {
    ctx.store.set('session-tracking', {})
  }
  if (!ctx.store.get('summaries')) {
    ctx.store.set('summaries', {})
  }
  if (!ctx.store.get('insights-cache')) {
    ctx.store.set('insights-cache', null)
  }

  // ────────────────────────────────────────────────────────────────────────
  // INDEX MANAGEMENT (3 handlers)
  // ────────────────────────────────────────────────────────────────────────

  // ── 1. Get index ──────────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-index', async () => {
    return ctx.store.get('index', null)
  })

  // ── 2. Refresh index ──────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:refresh-index', async () => {
    ctx.log.info('Starting catalog index refresh...')
    const startTime = Date.now()

    ctx.store.set('index-status', {
      state: 'indexing',
      lastRefreshed: null,
      duration: null,
      entityCount: 0,
      error: null,
    })

    try {
      // Check connection + capabilities
      let status
      try {
        status = await ctx.invoke('integration:get-status')
      } catch (err) {
        ctx.log.error('Failed to get integration status: %s', err)
        throw new Error('Could not reach Backstage. Check your connection in Configure > Integrations.')
      }

      const backstage = status?.backstage
      if (!backstage || !backstage.connected) {
        throw new Error('Backstage is not connected. Please connect via Configure > Integrations.')
      }

      const capabilities = backstage.capabilities || { catalog: true }

      // Paginated entity crawl
      const allEntities = []
      const pageSize = 100
      let offset = 0
      let hasMore = true

      while (hasMore && allEntities.length < MAX_INDEX_ENTITIES) {
        ctx.log.debug('Fetching entities: offset=%d limit=%d', offset, pageSize)

        let result
        try {
          result = await ctx.invoke('integration:backstage-entities', {
            limit: pageSize,
            offset,
          })
        } catch (err) {
          ctx.log.error('Entity fetch failed at offset %d: %s', offset, err)
          throw new Error(`Failed to fetch entities at offset ${offset}: ${err}`)
        }

        if (!result || !result.success || !result.entities) {
          const errMsg = result?.error || 'Unknown error fetching entities'
          throw new Error(errMsg)
        }

        const batch = result.entities
        allEntities.push(...batch)

        ctx.log.debug('Received %d entities (total: %d)', batch.length, allEntities.length)

        // Update progress
        ctx.store.set('index-status', {
          state: 'indexing',
          lastRefreshed: null,
          duration: null,
          entityCount: allEntities.length,
          error: null,
        })

        if (batch.length < pageSize) {
          hasMore = false
        } else {
          offset += pageSize
        }
      }

      ctx.log.info('Crawled %d entities from Backstage', allEntities.length)

      // Build lightweight index entries
      const indexedEntities = []
      const teamMap = {}
      const relationships = []
      const countsByKind = {}
      const countsByLifecycle = {}
      const allKindsSet = new Set()
      const allTagsMap = {}

      for (const entity of allEntities) {
        const meta = entity.metadata || {}
        const spec = entity.spec || {}
        const kind = entity.kind || 'Unknown'
        const name = meta.name || ''
        const namespace = meta.namespace || 'default'
        const ref = `${kind.toLowerCase()}:${namespace}/${name}`

        // Determine owner from spec.owner or relations
        let owner = spec.owner ? String(spec.owner) : null
        if (!owner && entity.relations) {
          const ownerRel = entity.relations.find((r) => r.type === 'ownedBy')
          if (ownerRel) owner = ownerRel.targetRef
        }

        // Determine system from spec.system or relations
        let system = spec.system ? String(spec.system) : null
        if (!system && entity.relations) {
          const partOfRel = entity.relations.find((r) => r.type === 'partOf')
          if (partOfRel) system = partOfRel.targetRef
        }

        const entry = {
          ref,
          kind,
          name,
          namespace,
          description: meta.description || null,
          owner,
          lifecycle: spec.lifecycle ? String(spec.lifecycle) : null,
          type: spec.type ? String(spec.type) : null,
          tags: meta.tags || [],
          system,
          relationCount: entity.relations ? entity.relations.length : 0,
        }

        indexedEntities.push(entry)

        // Counts by kind
        countsByKind[kind] = (countsByKind[kind] || 0) + 1
        allKindsSet.add(kind)

        // Counts by lifecycle
        if (entry.lifecycle) {
          countsByLifecycle[entry.lifecycle] = (countsByLifecycle[entry.lifecycle] || 0) + 1
        }

        // Tag tracking
        for (const tag of entry.tags) {
          allTagsMap[tag] = (allTagsMap[tag] || 0) + 1
        }

        // Team grouping
        if (owner) {
          if (!teamMap[owner]) {
            teamMap[owner] = { owner, entityCount: 0, entities: [], kindCounts: {} }
          }
          teamMap[owner].entityCount++
          teamMap[owner].entities.push(ref)
          teamMap[owner].kindCounts[kind] = (teamMap[owner].kindCounts[kind] || 0) + 1
        }

        // Collect relationships
        if (entity.relations) {
          for (const rel of entity.relations) {
            relationships.push({
              sourceRef: ref,
              type: rel.type,
              targetRef: rel.targetRef,
            })
          }
        }
      }

      // Sort teams by entity count descending
      const teams = Object.values(teamMap).sort((a, b) => b.entityCount - a.entityCount)

      // Sort tags by frequency
      const allTags = Object.entries(allTagsMap)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag)

      const allKinds = [...allKindsSet].sort()

      const index = {
        entities: indexedEntities,
        teams,
        relationships,
        countsByKind,
        countsByLifecycle,
        allKinds,
        allTags,
        totalEntities: indexedEntities.length,
        lastRefreshed: Date.now(),
        capabilities,
      }

      ctx.store.set('index', index)

      const duration = Date.now() - startTime
      ctx.store.set('index-status', {
        state: 'ready',
        lastRefreshed: Date.now(),
        duration,
        entityCount: indexedEntities.length,
        error: null,
      })

      ctx.log.info(
        'Index refresh complete: %d entities, %d teams, %d relationships in %dms',
        indexedEntities.length,
        teams.length,
        relationships.length,
        duration
      )

      // Emit notification
      try {
        await ctx.invoke('notifications:emit', {
          title: 'Backstage Catalog Indexed',
          body: `${indexedEntities.length} entities from ${teams.length} teams indexed in ${(duration / 1000).toFixed(1)}s`,
          severity: 'success',
          source: 'backstage-explorer',
        })
      } catch (notifErr) {
        ctx.log.debug('Notification emit failed (non-critical): %s', notifErr)
      }

      return index
    } catch (err) {
      const errMsg = String(err.message || err)
      ctx.log.error('Index refresh failed: %s', errMsg)

      ctx.store.set('index-status', {
        state: 'error',
        lastRefreshed: ctx.store.get('index-status')?.lastRefreshed || null,
        duration: Date.now() - startTime,
        entityCount: ctx.store.get('index-status')?.entityCount || 0,
        error: errMsg,
      })

      return { success: false, error: errMsg }
    }
  })

  // ── 3. Get index status ───────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-index-status', async () => {
    return ctx.store.get('index-status', {
      state: 'none',
      lastRefreshed: null,
      duration: null,
      entityCount: 0,
      error: null,
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // BROWSING (5 handlers)
  // ────────────────────────────────────────────────────────────────────────

  // ── 4. Browse entities ────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:browse-entities', async (_e, args) => {
    try {
      const index = ctx.store.get('index')
      if (!index || !index.entities) {
        return { success: true, entities: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }
      }

      const {
        kind,
        owner,
        lifecycle,
        tags,
        search,
        sortBy = 'name',
        sortDir = 'asc',
        page = 1,
        pageSize = 25,
      } = args || {}

      let filtered = index.entities

      // Filter by kind
      if (kind) {
        const kindLower = kind.toLowerCase()
        filtered = filtered.filter((e) => e.kind.toLowerCase() === kindLower)
      }

      // Filter by owner
      if (owner) {
        const ownerLower = owner.toLowerCase()
        filtered = filtered.filter((e) => {
          if (!e.owner) return false
          return e.owner.toLowerCase().includes(ownerLower)
        })
      }

      // Filter by lifecycle
      if (lifecycle) {
        const lcLower = lifecycle.toLowerCase()
        filtered = filtered.filter((e) => {
          if (!e.lifecycle) return false
          return e.lifecycle.toLowerCase() === lcLower
        })
      }

      // Filter by tags (any match)
      if (tags && tags.length > 0) {
        const tagSet = new Set(tags.map((t) => t.toLowerCase()))
        filtered = filtered.filter((e) => {
          return e.tags && e.tags.some((t) => tagSet.has(t.toLowerCase()))
        })
      }

      // Search (fuzzy match on name, description, owner)
      if (search) {
        const searchLower = search.toLowerCase()
        filtered = filtered.filter((e) => {
          return (
            (e.name && e.name.toLowerCase().includes(searchLower)) ||
            (e.description && e.description.toLowerCase().includes(searchLower)) ||
            (e.owner && e.owner.toLowerCase().includes(searchLower)) ||
            (e.tags && e.tags.some((t) => t.toLowerCase().includes(searchLower)))
          )
        })
      }

      // Sort
      const dir = sortDir === 'desc' ? -1 : 1
      filtered.sort((a, b) => {
        const aVal = a[sortBy] || ''
        const bVal = b[sortBy] || ''
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return (aVal - bVal) * dir
        }
        return String(aVal).localeCompare(String(bVal)) * dir
      })

      const total = filtered.length
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const startIdx = (page - 1) * pageSize
      const paged = filtered.slice(startIdx, startIdx + pageSize)

      return { success: true, entities: paged, total, page, pageSize, totalPages }
    } catch (err) {
      ctx.log.error('browse-entities failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 5. Get entity detail ──────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-entity-detail', async (_e, args) => {
    try {
      if (!args || !args.ref) {
        return { success: false, error: 'Entity ref is required' }
      }

      const parsed = parseEntityRef(args.ref)
      const kind = parsed.kind || 'component'
      const namespace = parsed.namespace || 'default'
      const name = parsed.name

      if (!name) {
        return { success: false, error: 'Could not parse entity name from ref' }
      }

      // Fetch live entity from Backstage
      let liveEntity = null
      try {
        const result = await ctx.invoke('integration:backstage-entity-detail', {
          kind,
          namespace,
          name,
        })
        if (result && result.success && result.entity) {
          liveEntity = result.entity
        }
      } catch (fetchErr) {
        ctx.log.warn('Live entity fetch failed for %s (will use index): %s', args.ref, fetchErr)
      }

      // Enrich with related entities from index
      const index = ctx.store.get('index')
      let relatedEntities = []
      if (index && index.relationships) {
        const relatedRefs = new Set()
        for (const rel of index.relationships) {
          if (rel.sourceRef === args.ref) relatedRefs.add(rel.targetRef)
          if (rel.targetRef === args.ref) relatedRefs.add(rel.sourceRef)
        }
        relatedEntities = (index.entities || []).filter((e) => relatedRefs.has(e.ref))
      }

      // Optionally fetch TechDocs if capabilities support it
      let techdocs = null
      if (index && index.capabilities && index.capabilities.techdocs) {
        try {
          const tdResult = await ctx.invoke('integration:backstage-techdocs', {
            kind,
            namespace,
            name,
          })
          if (tdResult && tdResult.success) {
            techdocs = tdResult.techdocs
          }
        } catch (tdErr) {
          ctx.log.debug('TechDocs fetch failed for %s (non-critical): %s', args.ref, tdErr)
        }
      }

      // Optionally fetch K8s data if capabilities support it
      let kubernetes = null
      if (index && index.capabilities && index.capabilities.kubernetes) {
        try {
          const k8sResult = await ctx.invoke('integration:backstage-kubernetes', {
            entityRef: args.ref,
          })
          if (k8sResult && k8sResult.success) {
            kubernetes = k8sResult.data
          }
        } catch (k8sErr) {
          ctx.log.debug('K8s fetch failed for %s (non-critical): %s', args.ref, k8sErr)
        }
      }

      // Track as recently viewed
      try {
        const recent = ctx.store.get('recent', [])
        const filtered = recent.filter((r) => r.ref !== args.ref)
        filtered.unshift({ ref: args.ref, viewedAt: Date.now() })
        ctx.store.set('recent', filtered.slice(0, MAX_RECENT))
      } catch (recentErr) {
        ctx.log.debug('Failed to update recent: %s', recentErr)
      }

      return {
        success: true,
        entity: liveEntity,
        indexEntry: index ? (index.entities || []).find((e) => e.ref === args.ref) : null,
        relatedEntities,
        techdocs,
        kubernetes,
      }
    } catch (err) {
      ctx.log.error('get-entity-detail failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 6. Get relationships ──────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-relationships', async (_e, args) => {
    try {
      const index = ctx.store.get('index')
      if (!index || !index.relationships) {
        return { success: true, nodes: [], edges: [] }
      }

      const {
        entityRef,
        depth = 1,
        kinds,
      } = args || {}

      const maxDepth = Math.min(depth || 1, 4)
      const kindFilter = kinds ? new Set(kinds.map((k) => k.toLowerCase())) : null

      // BFS graph walk
      const visited = new Set()
      const nodes = []
      const edges = []
      const queue = []

      if (entityRef) {
        queue.push({ ref: entityRef, currentDepth: 0 })
        visited.add(entityRef)
      } else {
        // No starting entity — return all relationships (limited)
        const allEdges = index.relationships.slice(0, 500)
        const allRefs = new Set()
        for (const rel of allEdges) {
          allRefs.add(rel.sourceRef)
          allRefs.add(rel.targetRef)
          edges.push({ source: rel.sourceRef, target: rel.targetRef, type: rel.type })
        }
        for (const ref of allRefs) {
          const entity = (index.entities || []).find((e) => e.ref === ref)
          nodes.push({
            ref,
            kind: entity?.kind || parseEntityRef(ref).kind || 'Unknown',
            name: entity?.name || parseEntityRef(ref).name || ref,
            owner: entity?.owner || null,
          })
        }
        return { success: true, nodes, edges }
      }

      while (queue.length > 0) {
        const { ref, currentDepth } = queue.shift()

        // Add node
        const entity = (index.entities || []).find((e) => e.ref === ref)
        if (entity) {
          if (kindFilter && currentDepth > 0 && !kindFilter.has(entity.kind.toLowerCase())) {
            continue
          }
          nodes.push({
            ref,
            kind: entity.kind,
            name: entity.name,
            owner: entity.owner,
            depth: currentDepth,
          })
        } else if (currentDepth === 0) {
          // Starting node may not be in index by exact ref match — add placeholder
          nodes.push({
            ref,
            kind: parseEntityRef(ref).kind || 'Unknown',
            name: parseEntityRef(ref).name || ref,
            owner: null,
            depth: 0,
          })
        }

        // Find edges
        if (currentDepth < maxDepth) {
          for (const rel of index.relationships) {
            let neighborRef = null
            if (rel.sourceRef === ref) {
              neighborRef = rel.targetRef
              edges.push({ source: ref, target: neighborRef, type: rel.type })
            } else if (rel.targetRef === ref) {
              neighborRef = rel.sourceRef
              edges.push({ source: neighborRef, target: ref, type: rel.type })
            }

            if (neighborRef && !visited.has(neighborRef)) {
              visited.add(neighborRef)
              queue.push({ ref: neighborRef, currentDepth: currentDepth + 1 })
            }
          }
        }
      }

      return { success: true, nodes, edges }
    } catch (err) {
      ctx.log.error('get-relationships failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 7. Get team view ──────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-team-view', async (_e, args) => {
    try {
      const index = ctx.store.get('index')
      if (!index) {
        return { success: true, teams: [] }
      }

      const { teamRef } = args || {}

      if (teamRef) {
        // Single team detail
        const normalizedTeam = teamRef.toLowerCase()
        const team = (index.teams || []).find((t) => {
          const ownerLower = t.owner.toLowerCase()
          return ownerLower === normalizedTeam
            || ownerLower === `group:default/${normalizedTeam}`
            || ownerLower === `group:${normalizedTeam}`
            || ownerLower.includes(normalizedTeam)
        })

        if (!team) {
          return { success: true, team: null, entities: [] }
        }

        const teamEntities = (index.entities || []).filter((e) => {
          if (!e.owner) return false
          const ownerLower = e.owner.toLowerCase()
          return ownerLower === team.owner.toLowerCase()
        })

        return { success: true, team, entities: teamEntities }
      }

      // All teams summary
      return { success: true, teams: index.teams || [] }
    } catch (err) {
      ctx.log.error('get-team-view failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 8. Search ─────────────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:search', async (_e, args) => {
    try {
      const { query, kinds, limit = 25 } = args || {}

      if (!query) {
        return { success: true, results: [] }
      }

      // Try live Backstage search first
      let liveResults = null
      try {
        const index = ctx.store.get('index')
        if (index && index.capabilities && index.capabilities.search) {
          const searchResult = await ctx.invoke('integration:backstage-search', {
            term: query,
            types: kinds || undefined,
            limit,
          })
          if (searchResult && searchResult.success && searchResult.results) {
            liveResults = searchResult.results.map((r) => ({
              ref: r.document?.location || r.document?.name || '',
              name: r.document?.title || r.document?.name || '',
              kind: r.document?.kind || r.type || '',
              description: r.document?.text || r.document?.description || '',
              owner: r.document?.owner || null,
              lifecycle: r.document?.lifecycle || null,
              source: 'live',
            }))
          }
        }
      } catch (searchErr) {
        ctx.log.debug('Live search failed, falling back to index: %s', searchErr)
      }

      if (liveResults && liveResults.length > 0) {
        return { success: true, results: liveResults.slice(0, limit), source: 'live' }
      }

      // Fall back to fuzzy index search
      const index = ctx.store.get('index')
      if (!index || !index.entities) {
        return { success: true, results: [], source: 'none' }
      }

      const scored = []
      for (const entity of index.entities) {
        if (kinds && kinds.length > 0) {
          if (!kinds.some((k) => k.toLowerCase() === entity.kind.toLowerCase())) continue
        }

        const nameScore = fuzzyScore(query, entity.name) * 2
        const descScore = fuzzyScore(query, entity.description || '')
        const ownerScore = fuzzyScore(query, entity.owner || '') * 0.5
        const tagScore = entity.tags
          ? Math.max(0, ...entity.tags.map((t) => fuzzyScore(query, t))) * 0.8
          : 0
        const totalScore = nameScore + descScore + ownerScore + tagScore

        if (totalScore > 0) {
          scored.push({
            ref: entity.ref,
            name: entity.name,
            kind: entity.kind,
            description: entity.description,
            owner: entity.owner,
            lifecycle: entity.lifecycle,
            score: totalScore,
            source: 'index',
          })
        }
      }

      scored.sort((a, b) => b.score - a.score)

      return { success: true, results: scored.slice(0, limit), source: 'index' }
    } catch (err) {
      ctx.log.error('search failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ────────────────────────────────────────────────────────────────────────
  // OVERVIEW & STATE (5 handlers)
  // ────────────────────────────────────────────────────────────────────────

  // ── 9. Get overview ───────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-overview', async () => {
    try {
      const index = ctx.store.get('index')
      if (!index) {
        return {
          success: true,
          overview: {
            totalEntities: 0,
            countsByKind: {},
            countsByLifecycle: {},
            teamCount: 0,
            topTeams: [],
            allKinds: [],
            topTags: [],
            capabilities: null,
            lastRefreshed: null,
          },
        }
      }

      // Merge in session activity data
      const tracking = ctx.store.get('session-tracking', {})
      const entityMentionCounts = {}
      for (const sessionData of Object.values(tracking)) {
        for (const entity of (sessionData.entities || [])) {
          entityMentionCounts[entity.ref] = (entityMentionCounts[entity.ref] || 0) + entity.mentions
        }
      }

      const mostDiscussed = Object.entries(entityMentionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ref, mentions]) => {
          const entity = (index.entities || []).find((e) => e.ref === ref)
          return { ref, name: entity?.name || parseEntityRef(ref).name, mentions }
        })

      return {
        success: true,
        overview: {
          totalEntities: index.totalEntities || 0,
          countsByKind: index.countsByKind || {},
          countsByLifecycle: index.countsByLifecycle || {},
          teamCount: (index.teams || []).length,
          topTeams: (index.teams || []).slice(0, 10),
          allKinds: index.allKinds || [],
          topTags: (index.allTags || []).slice(0, 20),
          capabilities: index.capabilities || null,
          lastRefreshed: index.lastRefreshed || null,
          mostDiscussed,
        },
      }
    } catch (err) {
      ctx.log.error('get-overview failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 10. Get bookmarks ─────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-bookmarks', async () => {
    return ctx.store.get('bookmarks', [])
  })

  // ── 11. Set bookmarks ─────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:set-bookmarks', async (_e, args) => {
    if (!args || !Array.isArray(args.bookmarks)) {
      return { success: false, error: 'bookmarks array is required' }
    }
    ctx.store.set('bookmarks', args.bookmarks)
    return { success: true, bookmarks: args.bookmarks }
  })

  // ── 12. Get recent ────────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-recent', async () => {
    return ctx.store.get('recent', [])
  })

  // ── 13/14. Get/Set config ─────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-config', async () => {
    return ctx.store.get('config', DEFAULT_CONFIG)
  })

  ctx.registerHandler('backstage-explorer:set-config', async (_e, args) => {
    const current = ctx.store.get('config', DEFAULT_CONFIG)
    const merged = { ...current, ...args }
    ctx.store.set('config', merged)
    return merged
  })

  // ────────────────────────────────────────────────────────────────────────
  // AI & CONTEXT (3 handlers)
  // ────────────────────────────────────────────────────────────────────────

  // ── 15. Build AI context ──────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:build-ai-context', async (_e, args) => {
    try {
      const index = ctx.store.get('index')
      if (!index) {
        return {
          success: false,
          context: '',
          tokenEstimate: 0,
          error: 'No catalog index available. Refresh the index first.',
        }
      }

      const { query, entityRefs, includeRelationships, maxTokens = 8000 } = args || {}
      const sections = []

      // If specific entity refs requested, include their detail
      if (entityRefs && entityRefs.length > 0) {
        for (const ref of entityRefs) {
          sections.push(buildEntityDetailContext(index, ref, null))
        }
      }

      // If query provided, search and include results
      if (query) {
        const searchLower = query.toLowerCase()
        const matches = (index.entities || []).filter((e) => {
          return (
            (e.name && e.name.toLowerCase().includes(searchLower)) ||
            (e.description && e.description.toLowerCase().includes(searchLower)) ||
            (e.tags && e.tags.some((t) => t.toLowerCase().includes(searchLower)))
          )
        })
        if (matches.length > 0) {
          sections.push(buildSearchContext(index, matches.slice(0, 15)))
        }
      }

      // If no specific query or refs, include overview
      if ((!entityRefs || entityRefs.length === 0) && !query) {
        sections.push(buildCatalogOverviewContext(index))
      }

      // Optionally include relationship data
      if (includeRelationships && entityRefs && entityRefs.length > 0) {
        const relLines = ['### Relationships']
        for (const ref of entityRefs) {
          const rels = (index.relationships || []).filter(
            (r) => r.sourceRef === ref || r.targetRef === ref
          )
          for (const rel of rels.slice(0, 20)) {
            const other = rel.sourceRef === ref ? rel.targetRef : rel.sourceRef
            relLines.push(`- ${ref} --[${rel.type}]--> ${other}`)
          }
        }
        if (relLines.length > 1) {
          sections.push(relLines.join('\n'))
        }
      }

      let context = sections.join('\n\n---\n\n')

      // Truncate to max tokens (rough: 1 token ~ 4 chars)
      const maxChars = maxTokens * 4
      if (context.length > maxChars) {
        context = context.slice(0, maxChars) + '\n\n*[Context truncated to fit token budget]*'
      }

      return {
        success: true,
        context,
        tokenEstimate: Math.ceil(context.length / 4),
        metadata: {
          entityRefsIncluded: entityRefs?.length || 0,
          queryMatches: query ? 'included' : 'none',
          truncated: context.length >= maxChars,
        },
      }
    } catch (err) {
      ctx.log.error('build-ai-context failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 16. Ask local AI ──────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:ask-local-ai', async (_e, args) => {
    try {
      const { question, scope } = args || {}
      if (!question) {
        return { success: false, error: 'A question is required.' }
      }

      // Detect local models
      let models
      try {
        models = await ctx.invoke('local-models:detect')
      } catch (detectErr) {
        ctx.log.debug('Local model detection failed: %s', detectErr)
        return { success: false, error: 'No local AI models available. Install Ollama or LM Studio for local AI.' }
      }

      const available = models?.ollama?.connected || models?.lmstudio?.connected
      if (!available) {
        return { success: false, error: 'No local AI models available. Install Ollama or LM Studio for local AI.' }
      }

      const model = models?.ollama?.models?.[0] || models?.lmstudio?.models?.[0] || null
      if (!model) {
        return { success: false, error: 'Local AI server is running but no models are loaded.' }
      }

      const modelName = model.name || model

      // Build context from index
      const index = ctx.store.get('index')
      let catalogContext = ''

      if (index) {
        if (scope === 'overview' || !scope) {
          catalogContext = buildCatalogOverviewContext(index)
        } else if (scope?.startsWith('team:')) {
          catalogContext = buildTeamContext(index, scope.slice(5))
        } else if (scope?.startsWith('system:')) {
          catalogContext = buildSystemContext(index, scope.slice(7))
        } else if (scope?.startsWith('entity:')) {
          catalogContext = buildEntityDetailContext(index, scope.slice(7), null)
        } else {
          catalogContext = buildCatalogOverviewContext(index)
        }
      } else {
        catalogContext = 'No catalog index is available. The user should refresh the Backstage index first.'
      }

      // Send to local LLM
      const result = await ctx.invoke('local-models:chat', {
        model: modelName,
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that answers questions about a software catalog (Backstage). Use the following catalog data to answer accurately. If the data does not contain the answer, say so.\n\n${catalogContext}`,
          },
          {
            role: 'user',
            content: question,
          },
        ],
        source: 'backstage-explorer',
      })

      return {
        success: true,
        answer: result.content || result.message || '',
        model: modelName,
        scope: scope || 'overview',
      }
    } catch (err) {
      ctx.log.error('ask-local-ai failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 17. Generate summary ──────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:generate-summary', async (_e, args) => {
    try {
      const { scope = 'full-catalog' } = args || {}

      // Check summary cache
      const summaries = ctx.store.get('summaries', {})
      const cached = summaries[scope]
      const config = ctx.store.get('config', DEFAULT_CONFIG)
      if (cached && (Date.now() - cached.generatedAt) < config.summaryTtlMs) {
        return { success: true, summary: cached.text, model: cached.model, cached: true }
      }

      // Detect local models
      let models
      try {
        models = await ctx.invoke('local-models:detect')
      } catch (detectErr) {
        return { success: false, error: 'No local AI models available. Install Ollama or LM Studio.' }
      }

      const available = models?.ollama?.connected || models?.lmstudio?.connected
      if (!available) {
        return { success: false, error: 'No local AI models available.' }
      }

      const model = models?.ollama?.models?.[0] || models?.lmstudio?.models?.[0] || null
      if (!model) {
        return { success: false, error: 'No models loaded in local AI server.' }
      }

      const modelName = model.name || model

      // Build context based on scope
      const index = ctx.store.get('index')
      if (!index) {
        return { success: false, error: 'No catalog index available. Refresh the index first.' }
      }

      let catalogContext = ''
      let prompt = ''

      if (scope === 'full-catalog') {
        catalogContext = buildCatalogOverviewContext(index)
        prompt = 'Generate a comprehensive, executive-friendly summary of this software catalog. Cover: total landscape, key teams and their responsibilities, service distribution by lifecycle stage, notable patterns, and any potential concerns (e.g., many deprecated services, concentration of ownership). Format as a document suitable for sharing in a meeting.'
      } else if (scope.startsWith('team:')) {
        catalogContext = buildTeamContext(index, scope.slice(5))
        prompt = `Generate a summary of this team's service portfolio. Cover: what they own, how their services connect, lifecycle status of each, and any observations about their architecture or areas of concern.`
      } else if (scope.startsWith('system:')) {
        catalogContext = buildSystemContext(index, scope.slice(7))
        prompt = `Generate a summary of this system's architecture. Cover: what components it includes, how they connect, who owns what, and any architectural observations.`
      } else {
        catalogContext = buildCatalogOverviewContext(index)
        prompt = 'Summarize this software catalog for a non-technical audience.'
      }

      const result = await ctx.invoke('local-models:chat', {
        model: modelName,
        messages: [
          {
            role: 'system',
            content: `You are a technical writer creating clear, professional summaries of software catalogs. Use the provided catalog data.\n\n${catalogContext}`,
          },
          { role: 'user', content: prompt },
        ],
        source: 'backstage-explorer',
      })

      const summaryText = result.content || result.message || ''

      // Cache the summary
      summaries[scope] = {
        text: summaryText,
        generatedAt: Date.now(),
        model: modelName,
      }
      ctx.store.set('summaries', summaries)

      return { success: true, summary: summaryText, model: modelName, cached: false }
    } catch (err) {
      ctx.log.error('generate-summary failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ────────────────────────────────────────────────────────────────────────
  // CONTEXT SOURCE PROVIDERS (5 handlers)
  // ────────────────────────────────────────────────────────────────────────

  // ── 18. ctx-catalog-overview ──────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:ctx-catalog-overview', async () => {
    try {
      const index = ctx.store.get('index')
      if (!index) {
        return { success: false, context: '', tokenEstimate: 0, error: 'No catalog index. Refresh first.' }
      }

      const context = buildCatalogOverviewContext(index)
      return {
        success: true,
        context,
        tokenEstimate: Math.ceil(context.length / 4),
        metadata: { itemCount: index.totalEntities || 0, truncated: false },
      }
    } catch (err) {
      ctx.log.error('ctx-catalog-overview failed: %s', err.message || err)
      return { success: false, context: '', tokenEstimate: 0, error: String(err.message || err) }
    }
  })

  // ── 19. ctx-entity-detail ─────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:ctx-entity-detail', async (_e, args) => {
    try {
      const { entity: entityQuery } = args || {}
      if (!entityQuery) {
        return { success: false, context: '', tokenEstimate: 0, error: 'Entity name is required.' }
      }

      const index = ctx.store.get('index')
      if (!index || !index.entities) {
        return { success: false, context: '', tokenEstimate: 0, error: 'No catalog index. Refresh first.' }
      }

      // Fuzzy match entity name against index
      const queryLower = entityQuery.toLowerCase()
      let bestMatch = null
      let bestScore = 0

      for (const e of index.entities) {
        const nameScore = fuzzyScore(entityQuery, e.name) * 2
        const refScore = fuzzyScore(entityQuery, e.ref)
        const score = Math.max(nameScore, refScore)
        if (score > bestScore) {
          bestScore = score
          bestMatch = e
        }
      }

      if (!bestMatch || bestScore < 0.3) {
        return {
          success: false,
          context: `No entity matching "${entityQuery}" found in catalog.`,
          tokenEstimate: 10,
          error: `Entity "${entityQuery}" not found`,
        }
      }

      // Try to fetch live detail
      let liveEntity = null
      try {
        const parsed = parseEntityRef(bestMatch.ref)
        const result = await ctx.invoke('integration:backstage-entity-detail', {
          kind: parsed.kind || bestMatch.kind,
          namespace: parsed.namespace || bestMatch.namespace || 'default',
          name: parsed.name || bestMatch.name,
        })
        if (result && result.success && result.entity) {
          liveEntity = result.entity
        }
      } catch (fetchErr) {
        ctx.log.debug('Live fetch failed for ctx-entity-detail, using index: %s', fetchErr)
      }

      const context = buildEntityDetailContext(index, bestMatch.ref, liveEntity)
      return {
        success: true,
        context,
        tokenEstimate: Math.ceil(context.length / 4),
        metadata: { itemCount: 1, truncated: false },
      }
    } catch (err) {
      ctx.log.error('ctx-entity-detail failed: %s', err.message || err)
      return { success: false, context: '', tokenEstimate: 0, error: String(err.message || err) }
    }
  })

  // ── 20. ctx-team-services ─────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:ctx-team-services', async (_e, args) => {
    try {
      const { team: teamQuery } = args || {}
      if (!teamQuery) {
        return { success: false, context: '', tokenEstimate: 0, error: 'Team name is required.' }
      }

      const index = ctx.store.get('index')
      if (!index) {
        return { success: false, context: '', tokenEstimate: 0, error: 'No catalog index. Refresh first.' }
      }

      const context = buildTeamContext(index, teamQuery)
      const normalizedTeam = teamQuery.toLowerCase()
      const teamEntities = (index.entities || []).filter((e) => {
        if (!e.owner) return false
        return e.owner.toLowerCase().includes(normalizedTeam)
      })

      return {
        success: true,
        context,
        tokenEstimate: Math.ceil(context.length / 4),
        metadata: { itemCount: teamEntities.length, truncated: false },
      }
    } catch (err) {
      ctx.log.error('ctx-team-services failed: %s', err.message || err)
      return { success: false, context: '', tokenEstimate: 0, error: String(err.message || err) }
    }
  })

  // ── 21. ctx-system-architecture ───────────────────────────────────────

  ctx.registerHandler('backstage-explorer:ctx-system-architecture', async (_e, args) => {
    try {
      const { system: systemQuery } = args || {}
      if (!systemQuery) {
        return { success: false, context: '', tokenEstimate: 0, error: 'System name is required.' }
      }

      const index = ctx.store.get('index')
      if (!index) {
        return { success: false, context: '', tokenEstimate: 0, error: 'No catalog index. Refresh first.' }
      }

      const context = buildSystemContext(index, systemQuery)
      const normalizedSystem = systemQuery.toLowerCase()
      const systemEntities = (index.entities || []).filter((e) => {
        if (!e.system) return false
        return e.system.toLowerCase().includes(normalizedSystem)
      })

      return {
        success: true,
        context,
        tokenEstimate: Math.ceil(context.length / 4),
        metadata: { itemCount: systemEntities.length, truncated: false },
      }
    } catch (err) {
      ctx.log.error('ctx-system-architecture failed: %s', err.message || err)
      return { success: false, context: '', tokenEstimate: 0, error: String(err.message || err) }
    }
  })

  // ── 22. ctx-catalog-search ────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:ctx-catalog-search', async (_e, args) => {
    try {
      const { query } = args || {}
      if (!query) {
        return { success: false, context: '', tokenEstimate: 0, error: 'Search query is required.' }
      }

      const index = ctx.store.get('index')
      if (!index || !index.entities) {
        return { success: false, context: '', tokenEstimate: 0, error: 'No catalog index. Refresh first.' }
      }

      // Search the index
      const searchLower = query.toLowerCase()
      const matches = []

      for (const entity of index.entities) {
        const nameScore = fuzzyScore(query, entity.name) * 2
        const descScore = fuzzyScore(query, entity.description || '')
        const tagScore = entity.tags
          ? Math.max(0, ...entity.tags.map((t) => fuzzyScore(query, t))) * 0.8
          : 0
        const ownerScore = fuzzyScore(query, entity.owner || '') * 0.3
        const total = nameScore + descScore + tagScore + ownerScore

        if (total > 0) {
          matches.push({ ...entity, _score: total })
        }
      }

      matches.sort((a, b) => b._score - a._score)
      const top = matches.slice(0, 15)

      // Also try live search
      let liveExtra = []
      try {
        if (index.capabilities && index.capabilities.search) {
          const liveResult = await ctx.invoke('integration:backstage-search', {
            term: query,
            limit: 10,
          })
          if (liveResult && liveResult.success && liveResult.results) {
            liveExtra = liveResult.results.map((r) => ({
              ref: r.document?.location || '',
              name: r.document?.title || r.document?.name || '',
              kind: r.document?.kind || '',
              description: r.document?.text || '',
              owner: r.document?.owner || null,
              lifecycle: r.document?.lifecycle || null,
            }))
          }
        }
      } catch (searchErr) {
        ctx.log.debug('Live search for context failed (non-critical): %s', searchErr)
      }

      // Merge: add live results not already in top
      const topRefs = new Set(top.map((e) => e.ref))
      for (const live of liveExtra) {
        if (!topRefs.has(live.ref) && top.length < 20) {
          top.push(live)
        }
      }

      const context = buildSearchContext(index, top)
      return {
        success: true,
        context,
        tokenEstimate: Math.ceil(context.length / 4),
        metadata: { itemCount: top.length, truncated: matches.length > 15 },
      }
    } catch (err) {
      ctx.log.error('ctx-catalog-search failed: %s', err.message || err)
      return { success: false, context: '', tokenEstimate: 0, error: String(err.message || err) }
    }
  })

  // ────────────────────────────────────────────────────────────────────────
  // SESSION INTEGRATION (3 handlers)
  // ────────────────────────────────────────────────────────────────────────

  // ── 23. Get suggestions ───────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-suggestions', async (_e, args) => {
    try {
      const index = ctx.store.get('index')
      if (!index || !index.entities) {
        return { success: true, suggestions: [] }
      }

      const { chatContext } = args || {}
      if (!chatContext) {
        // Return bookmarks + recent as default suggestions
        const bookmarks = ctx.store.get('bookmarks', [])
        const recent = ctx.store.get('recent', [])

        const suggestions = []
        for (const ref of bookmarks.slice(0, 5)) {
          const entity = (index.entities || []).find((e) => e.ref === ref)
          if (entity) {
            suggestions.push({ ref, name: entity.name, kind: entity.kind, reason: 'bookmarked' })
          }
        }
        for (const r of recent.slice(0, 5)) {
          if (!suggestions.some((s) => s.ref === r.ref)) {
            const entity = (index.entities || []).find((e) => e.ref === r.ref)
            if (entity) {
              suggestions.push({ ref: r.ref, name: entity.name, kind: entity.kind, reason: 'recently viewed' })
            }
          }
        }

        return { success: true, suggestions }
      }

      // Extract keywords from chat context and match against index
      const keywords = chatContext
        .toLowerCase()
        .split(/[\s,.;:!?()[\]{}"'`]+/)
        .filter((w) => w.length >= 3)

      const scored = []
      for (const entity of index.entities) {
        let matchScore = 0
        const matchedKeywords = []

        for (const kw of keywords) {
          if (entity.name.toLowerCase().includes(kw)) {
            matchScore += 3
            matchedKeywords.push(kw)
          } else if (entity.description && entity.description.toLowerCase().includes(kw)) {
            matchScore += 1
            matchedKeywords.push(kw)
          } else if (entity.tags && entity.tags.some((t) => t.toLowerCase().includes(kw))) {
            matchScore += 2
            matchedKeywords.push(kw)
          }
        }

        if (matchScore > 0) {
          scored.push({
            ref: entity.ref,
            name: entity.name,
            kind: entity.kind,
            reason: `matches: ${[...new Set(matchedKeywords)].slice(0, 3).join(', ')}`,
            score: matchScore,
          })
        }
      }

      scored.sort((a, b) => b.score - a.score)
      return { success: true, suggestions: scored.slice(0, 10) }
    } catch (err) {
      ctx.log.error('get-suggestions failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 24. Get session entities ──────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-session-entities', async (_e, args) => {
    try {
      const { sessionId } = args || {}
      const tracking = ctx.store.get('session-tracking', {})

      if (sessionId) {
        const sessionData = tracking[sessionId]
        if (!sessionData) {
          return { success: true, entities: [] }
        }
        return { success: true, entities: sessionData.entities || [] }
      }

      // Return all tracked sessions
      return { success: true, tracking }
    } catch (err) {
      ctx.log.error('get-session-entities failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 25. Get catalog insights ──────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-catalog-insights', async () => {
    try {
      // Check cache
      const cached = ctx.store.get('insights-cache')
      if (cached && (Date.now() - cached.builtAt) < 5 * 60 * 1000) {
        return { success: true, insights: cached }
      }

      const tracking = ctx.store.get('session-tracking', {})
      const index = ctx.store.get('index')

      // Aggregate entity mention counts across all sessions
      const entityMentionCounts = {}
      const entitySessionCounts = {}
      let totalSessions = 0

      for (const [sessionId, sessionData] of Object.entries(tracking)) {
        totalSessions++
        for (const entity of (sessionData.entities || [])) {
          entityMentionCounts[entity.ref] = (entityMentionCounts[entity.ref] || 0) + entity.mentions
          entitySessionCounts[entity.ref] = (entitySessionCounts[entity.ref] || 0) + 1
        }
      }

      // Most discussed entities
      const mostDiscussed = Object.entries(entityMentionCounts)
        .map(([ref, totalMentions]) => ({
          ref,
          name: index ? ((index.entities || []).find((e) => e.ref === ref)?.name || parseEntityRef(ref).name) : parseEntityRef(ref).name,
          totalMentions,
          sessionCount: entitySessionCounts[ref] || 0,
        }))
        .sort((a, b) => b.totalMentions - a.totalMentions)
        .slice(0, 20)

      // Team activity (group entity mentions by owner)
      const teamActivity = {}
      if (index && index.entities) {
        for (const [ref, mentions] of Object.entries(entityMentionCounts)) {
          const entity = (index.entities || []).find((e) => e.ref === ref)
          const teamRef = entity?.owner || 'unknown'
          if (!teamActivity[teamRef]) {
            teamActivity[teamRef] = { teamRef, entityMentions: 0, sessionCount: 0, entities: new Set() }
          }
          teamActivity[teamRef].entityMentions += mentions
          teamActivity[teamRef].entities.add(ref)
        }
      }

      const teamActivityList = Object.values(teamActivity)
        .map((t) => ({
          teamRef: t.teamRef,
          entityMentions: t.entityMentions,
          sessionCount: t.entities.size,
        }))
        .sort((a, b) => b.entityMentions - a.entityMentions)
        .slice(0, 15)

      // Try to get cost data
      let costByDomain = []
      try {
        const costData = await ctx.invoke('cost:get-records')
        if (costData && Array.isArray(costData)) {
          // Group costs by session, cross-reference with entity tracking
          const sessionCosts = {}
          for (const record of costData) {
            if (record.sessionId) {
              sessionCosts[record.sessionId] = (sessionCosts[record.sessionId] || 0) + (record.estimatedCost || 0)
            }
          }

          const domainCosts = {}
          for (const [sessionId, sessionData] of Object.entries(tracking)) {
            const cost = sessionCosts[sessionId] || 0
            if (cost === 0) continue
            for (const entity of (sessionData.entities || [])) {
              const indexEntity = index ? (index.entities || []).find((e) => e.ref === entity.ref) : null
              const domain = indexEntity?.system || indexEntity?.owner || 'unknown'
              domainCosts[domain] = (domainCosts[domain] || 0) + cost
            }
          }

          costByDomain = Object.entries(domainCosts)
            .map(([domain, cost]) => ({ domain, cost }))
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 10)
        }
      } catch (costErr) {
        ctx.log.debug('Cost data fetch failed (non-critical): %s', costErr)
      }

      // Catalog coverage
      const totalCatalogEntities = index ? (index.totalEntities || 0) : 0
      const discussedEntityCount = Object.keys(entityMentionCounts).length
      const coveragePercent = totalCatalogEntities > 0
        ? Math.round((discussedEntityCount / totalCatalogEntities) * 100)
        : 0

      const insights = {
        mostDiscussed,
        teamActivity: teamActivityList,
        costByDomain,
        totalSessions,
        discussedEntityCount,
        totalCatalogEntities,
        coveragePercent,
        builtAt: Date.now(),
      }

      ctx.store.set('insights-cache', insights)

      return { success: true, insights }
    } catch (err) {
      ctx.log.error('get-catalog-insights failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ────────────────────────────────────────────────────────────────────────
  // CROSS-REFERENCING (1 handler)
  // ────────────────────────────────────────────────────────────────────────

  // ── 26. Get entity notes ──────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:get-entity-notes', async (_e, args) => {
    try {
      const { ref } = args || {}
      if (!ref) {
        return { success: true, notes: [] }
      }

      const parsed = parseEntityRef(ref)
      const entityName = parsed.name || ref
      const searchTerms = [entityName]

      // Also search by full ref
      if (ref !== entityName) {
        searchTerms.push(ref)
      }

      // Get all notes
      let allNotes = []
      try {
        const notesList = await ctx.invoke('notes:list')
        if (Array.isArray(notesList)) {
          allNotes = notesList
        } else if (notesList && Array.isArray(notesList.notes)) {
          allNotes = notesList.notes
        }
      } catch (notesErr) {
        ctx.log.debug('Notes list failed: %s', notesErr)
        return { success: true, notes: [] }
      }

      const matchingNotes = []

      for (const note of allNotes) {
        // Try to get full content
        let content = note.content || note.body || note.text || ''
        const title = note.title || note.name || ''

        if (!content && note.id) {
          try {
            const fullNote = await ctx.invoke('notes:get-full-content', { id: note.id })
            content = fullNote?.content || fullNote?.body || fullNote?.text || ''
          } catch (fetchErr) {
            ctx.log.debug('Note content fetch failed for %s: %s', note.id, fetchErr)
          }
        }

        const fullText = `${title} ${content}`.toLowerCase()
        const matched = searchTerms.some((term) => fullText.includes(term.toLowerCase()))

        if (matched) {
          // Extract a snippet around the first mention
          let excerpt = ''
          const lowerContent = content.toLowerCase()
          for (const term of searchTerms) {
            const idx = lowerContent.indexOf(term.toLowerCase())
            if (idx !== -1) {
              const start = Math.max(0, idx - 50)
              const end = Math.min(content.length, idx + term.length + 100)
              excerpt = (start > 0 ? '...' : '') + content.slice(start, end).trim() + (end < content.length ? '...' : '')
              break
            }
          }

          matchingNotes.push({
            id: note.id,
            title,
            excerpt: excerpt || content.slice(0, 150),
            matchedTerm: searchTerms.find((term) => fullText.includes(term.toLowerCase())),
            updatedAt: note.updatedAt || note.createdAt,
          })
        }
      }

      return { success: true, notes: matchingNotes }
    } catch (err) {
      ctx.log.error('get-entity-notes failed: %s', err.message || err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ────────────────────────────────────────────────────────────────────────
  // SESSION HOOKS (2 internal handlers)
  // ────────────────────────────────────────────────────────────────────────

  // ── on-turn-ended ─────────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:on-turn-ended', async (_e, args) => {
    try {
      const index = ctx.store.get('index')
      if (!index || !index.entities || index.entities.length === 0) {
        return { success: true }
      }

      const sessionId = args?.sessionId
      if (!sessionId) {
        return { success: true }
      }

      // Scan messages for entity mentions
      const messages = args?.messages || []
      const allText = messages
        .map((m) => {
          if (typeof m === 'string') return m
          return (m.content || m.text || m.body || '')
        })
        .join(' ')

      if (!allText) {
        return { success: true }
      }

      const mentionedRefs = scanForEntityMentions(allText, index)
      if (mentionedRefs.length === 0) {
        return { success: true }
      }

      // Update session tracking
      const tracking = ctx.store.get('session-tracking', {})
      if (!tracking[sessionId]) {
        tracking[sessionId] = { entities: [], lastUpdated: Date.now() }
      }

      const sessionData = tracking[sessionId]
      const existingRefs = new Set(sessionData.entities.map((e) => e.ref))

      for (const ref of mentionedRefs) {
        if (existingRefs.has(ref)) {
          const entry = sessionData.entities.find((e) => e.ref === ref)
          if (entry) entry.mentions++
        } else {
          sessionData.entities.push({
            ref,
            mentions: 1,
            firstMentionedAt: Date.now(),
          })
        }
      }

      sessionData.lastUpdated = Date.now()

      // FIFO cleanup: keep only last MAX_SESSION_TRACKING sessions
      const sessionIds = Object.keys(tracking)
      if (sessionIds.length > MAX_SESSION_TRACKING) {
        const sorted = sessionIds.sort((a, b) => {
          return (tracking[a].lastUpdated || 0) - (tracking[b].lastUpdated || 0)
        })
        for (const oldId of sorted.slice(0, sessionIds.length - MAX_SESSION_TRACKING)) {
          delete tracking[oldId]
        }
      }

      ctx.store.set('session-tracking', tracking)

      return { success: true, detectedEntities: mentionedRefs.length }
    } catch (err) {
      ctx.log.error('on-turn-ended hook failed: %s', err.message || err)
      return { success: true } // Don't fail the session for a hook error
    }
  })

  // ── on-session-started ────────────────────────────────────────────────

  ctx.registerHandler('backstage-explorer:on-session-started', async (_e, args) => {
    try {
      const index = ctx.store.get('index')
      if (!index || !index.entities || index.entities.length === 0) {
        return { success: true }
      }

      const sessionId = args?.sessionId
      const workingDirectory = args?.workingDirectory || ''
      const sessionName = args?.sessionName || args?.name || ''

      if (!sessionId) {
        return { success: true }
      }

      // Try to match working directory or session name to catalog entities
      const hints = [workingDirectory, sessionName].filter(Boolean)
      if (hints.length === 0) {
        return { success: true }
      }

      const suggestions = []
      for (const hint of hints) {
        const hintLower = hint.toLowerCase()
        // Extract the last path segment or the full name
        const segments = hintLower.split(/[/\\]/).filter(Boolean)
        const lastSegment = segments[segments.length - 1] || hintLower

        for (const entity of index.entities) {
          if (entity.name.length < 3) continue
          if (
            lastSegment.includes(entity.name.toLowerCase()) ||
            entity.name.toLowerCase().includes(lastSegment)
          ) {
            suggestions.push({
              ref: entity.ref,
              name: entity.name,
              kind: entity.kind,
              reason: 'matches workspace',
            })
          }
        }
      }

      // Deduplicate
      const seen = new Set()
      const unique = suggestions.filter((s) => {
        if (seen.has(s.ref)) return false
        seen.add(s.ref)
        return true
      })

      // Store suggestions for this session
      if (unique.length > 0) {
        const tracking = ctx.store.get('session-tracking', {})
        if (!tracking[sessionId]) {
          tracking[sessionId] = { entities: [], lastUpdated: Date.now() }
        }
        tracking[sessionId].initialSuggestions = unique.slice(0, 10)
        ctx.store.set('session-tracking', tracking)
      }

      return { success: true, suggestions: unique.slice(0, 10) }
    } catch (err) {
      ctx.log.error('on-session-started hook failed: %s', err.message || err)
      return { success: true }
    }
  })

  ctx.log.info('Backstage Explorer extension activated — 28 handlers registered (26 IPC + 2 session hooks)')
}

function deactivate() {
  // Handlers are automatically unregistered by the ExtensionMainLoader
}

module.exports = { activate, deactivate }
