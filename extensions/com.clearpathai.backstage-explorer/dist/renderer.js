// Backstage Explorer — Renderer Entry
// This file is loaded inside the extension iframe via clearpath-ext:// protocol.
// It provides slot widgets (sidebar status, home widget, above-input bar,
// session summary, wizard context picker, and Insights tab).
//
// NOTE: In production, built from src/renderer/ via esbuild/vite.

;(function() {
  'use strict'

  function init(port, extensionId) {
    _boot(port, extensionId)
  }

  if (window.__clearpath_port && window.__clearpath_extension_id) {
    init(window.__clearpath_port, window.__clearpath_extension_id)
  } else {
    const check = setInterval(() => {
      if (window.__clearpath_port && window.__clearpath_extension_id) {
        clearInterval(check)
        init(window.__clearpath_port, window.__clearpath_extension_id)
      }
    }, 50)
    setTimeout(() => clearInterval(check), 10000)
  }

  function _boot(port, extensionId) {

  // ── Minimal SDK Client ─────────────────────────────────────────────────────

  let reqCounter = 0
  const pending = new Map()
  const eventListeners = new Map()

  port.onmessage = (event) => {
    const data = event.data
    if (!data || typeof data !== 'object') return

    if (data.type === 'ext:response') {
      const p = pending.get(data.id)
      if (p) {
        pending.delete(data.id)
        if (data.error) p.reject(new Error(data.error.message || 'SDK error'))
        else p.resolve(data.result)
      }
    }

    if (data.type === 'ext:event') {
      const listeners = eventListeners.get(data.event)
      if (listeners) {
        for (const fn of listeners) {
          try { fn(data.data) } catch (e) { console.error(e) }
        }
      }
    }
  }

  function request(method, params) {
    const id = `req-${++reqCounter}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout')) }, 30000)
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      port.postMessage({ type: 'ext:request', id, method, params })
    })
  }

  function onEvent(event, callback) {
    if (!eventListeners.has(event)) eventListeners.set(event, new Set())
    eventListeners.get(event).add(callback)
    // Subscribe with host
    port.postMessage({ type: 'ext:request', id: `sub-${event}`, method: 'events.subscribe', params: { event } })
    return () => {
      eventListeners.get(event)?.delete(callback)
    }
  }

  // Signal ready
  port.postMessage({ type: 'ext:ready' })

  // ── Utility ────────────────────────────────────────────────────────────────

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag)
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'style' && typeof v === 'object') Object.assign(e.style, v)
        else if (k === 'className') e.className = v
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v)
        else e.setAttribute(k, v)
      }
    }
    for (const child of children) {
      if (typeof child === 'string') e.appendChild(document.createTextNode(child))
      else if (child) e.appendChild(child)
    }
    return e
  }

  function badge(text, color) {
    return el('span', {
      style: {
        fontSize: '10px', fontWeight: '500', padding: '1px 6px',
        borderRadius: '9999px', display: 'inline-block',
        backgroundColor: color === 'green' ? '#dcfce7' : color === 'amber' ? '#fef3c7' : color === 'red' ? '#fee2e2' : color === 'teal' ? '#ccfbf1' : '#f3f4f6',
        color: color === 'green' ? '#166534' : color === 'amber' ? '#92400e' : color === 'red' ? '#991b1b' : color === 'teal' ? '#115e59' : '#4b5563',
      }
    }, text)
  }

  // ── Detect current slot from URL or host message ───────────────────────────

  // The host tells us which slot we're rendering in via the init message.
  // For now, detect from document title or a global set by the host.
  let currentSlot = window.__clearpath_slot || 'unknown'

  // ── Sidebar Status Widget ──────────────────────────────────────────────────

  function renderSidebarWidget(root) {
    root.style.cssText = 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 8px 12px; cursor: pointer;'

    const statusDot = el('span', { style: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#9ca3af', display: 'inline-block', marginRight: '6px' } })
    const countLabel = el('span', { style: { fontSize: '12px', fontWeight: '600', color: '#374151' } }, 'Catalog')
    const metaLabel = el('span', { style: { fontSize: '10px', color: '#9ca3af', display: 'block', marginTop: '2px' } }, 'Loading...')

    root.appendChild(el('div', { style: { display: 'flex', alignItems: 'center' } }, statusDot, countLabel))
    root.appendChild(metaLabel)

    root.addEventListener('click', () => {
      request('navigate', { path: '/backstage-explorer' }).catch(() => {})
    })

    async function refresh() {
      try {
        const result = await request('backstage-explorer:get-index-status')
        if (result && result.success !== false) {
          const status = result.status || result
          if (status.state === 'ready') {
            statusDot.style.backgroundColor = '#34d399'
            countLabel.textContent = `Catalog: ${status.entityCount || '?'}`
            const age = Date.now() - (status.lastRefreshed || 0)
            const ageStr = age < 3600000 ? `${Math.round(age / 60000)}m ago` : `${Math.round(age / 3600000)}h ago`
            metaLabel.textContent = ageStr
          } else if (status.state === 'indexing') {
            statusDot.style.backgroundColor = '#fbbf24'
            countLabel.textContent = 'Indexing...'
            metaLabel.textContent = ''
          } else {
            statusDot.style.backgroundColor = '#9ca3af'
            countLabel.textContent = 'Catalog'
            metaLabel.textContent = 'Not indexed'
          }
        }
      } catch { /* silent */ }
    }

    refresh()
    setInterval(refresh, 30000)
  }

  // ── Home Widget ────────────────────────────────────────────────────────────

  function renderHomeWidget(root) {
    root.style.cssText = 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: white;'

    const title = el('h3', { style: { fontSize: '14px', fontWeight: '600', color: '#111827', margin: '0 0 8px 0' } }, 'Backstage Catalog')
    const stats = el('p', { style: { fontSize: '12px', color: '#6b7280', margin: '0 0 12px 0' } }, 'Loading...')
    const discussed = el('div', { style: { marginBottom: '12px' } })
    const cta = el('button', {
      style: {
        fontSize: '12px', fontWeight: '500', color: '#4f46e5', background: 'none', border: 'none',
        cursor: 'pointer', padding: '0',
      },
      onClick: () => request('navigate', { path: '/backstage-explorer' }).catch(() => {}),
    }, 'Explore Catalog \u2192')

    root.appendChild(title)
    root.appendChild(stats)
    root.appendChild(discussed)
    root.appendChild(cta)

    async function refresh() {
      try {
        const result = await request('backstage-explorer:get-overview')
        if (result && result.success !== false) {
          const ov = result.overview || result
          const entities = ov.totalEntities || 0
          const teams = (ov.topTeams || []).length
          const apis = (ov.countsByKind || {})['API'] || 0
          stats.textContent = `${entities} entities \u00B7 ${teams} teams \u00B7 ${apis} APIs`

          // Show most discussed if available
          discussed.innerHTML = ''
          try {
            const insights = await request('backstage-explorer:get-catalog-insights')
            if (insights && insights.success !== false && insights.mostDiscussed && insights.mostDiscussed.length > 0) {
              const header = el('p', { style: { fontSize: '11px', color: '#9ca3af', margin: '0 0 4px 0' } }, 'Most discussed this week:')
              discussed.appendChild(header)
              for (const item of insights.mostDiscussed.slice(0, 3)) {
                const name = item.ref.split('/').pop() || item.ref
                discussed.appendChild(el('div', { style: { fontSize: '12px', color: '#374151', padding: '2px 0' } },
                  el('span', { style: { fontWeight: '500' } }, name),
                  el('span', { style: { color: '#9ca3af', marginLeft: '6px' } }, `(${item.totalMentions} mentions)`)
                ))
              }
            }
          } catch { /* no insights yet */ }
        }
      } catch {
        stats.textContent = 'Connect Backstage to see catalog data'
      }
    }

    refresh()
  }

  // ── Above-Input Bar (Catalog Mentions) ─────────────────────────────────────

  function renderAboveInputBar(root) {
    root.style.cssText = 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display: none; padding: 4px 12px; background: #f0fdfa; border-radius: 8px; margin-bottom: 4px;'

    const content = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } })
    root.appendChild(content)

    async function refresh() {
      try {
        const result = await request('backstage-explorer:get-session-entities')
        if (result && result.success !== false) {
          const entities = result.entities || []
          if (entities.length === 0) {
            root.style.display = 'none'
            return
          }
          root.style.display = 'block'
          content.innerHTML = ''
          content.appendChild(el('span', { style: { fontSize: '11px', color: '#115e59', fontWeight: '500' } },
            `Backstage: ${entities.length} entit${entities.length === 1 ? 'y' : 'ies'} mentioned`
          ))
          const shown = entities.slice(0, 3)
          for (const e of shown) {
            const name = (e.ref || e.name || '').split('/').pop()
            content.appendChild(badge(name, 'teal'))
          }
          if (entities.length > 3) {
            content.appendChild(badge(`+${entities.length - 3}`, 'teal'))
          }
        }
      } catch { /* silent */ }
    }

    refresh()
    // Refresh on turn:ended events
    onEvent('turn:ended', () => setTimeout(refresh, 500))
  }

  // ── Session Summary Widget ─────────────────────────────────────────────────

  function renderSessionSummaryWidget(root) {
    root.style.cssText = 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 12px 0;'

    async function refresh() {
      try {
        const result = await request('backstage-explorer:get-session-entities')
        if (result && result.success !== false) {
          const entities = result.entities || []
          if (entities.length === 0) {
            root.style.display = 'none'
            return
          }
          root.innerHTML = ''
          root.appendChild(el('p', { style: { fontSize: '12px', fontWeight: '600', color: '#374151', margin: '0 0 6px 0' } },
            `Catalog Entities Referenced (${entities.length})`
          ))
          const badgeRow = el('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } })
          for (const e of entities.slice(0, 8)) {
            const name = (e.ref || e.name || '').split('/').pop()
            badgeRow.appendChild(badge(name, 'teal'))
          }
          if (entities.length > 8) {
            badgeRow.appendChild(badge(`+${entities.length - 8} more`, 'teal'))
          }
          root.appendChild(badgeRow)
        }
      } catch { /* silent */ }
    }

    refresh()
  }

  // ── Wizard Context Picker ──────────────────────────────────────────────────

  function renderWizardContextPicker(root) {
    root.style.cssText = 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 12px; border: 1px solid #ccfbf1; border-radius: 8px; background: #f0fdfa; margin-bottom: 8px;'

    const title = el('p', { style: { fontSize: '12px', fontWeight: '600', color: '#115e59', margin: '0 0 8px 0' } }, 'Pre-load Backstage Context')
    const searchInput = el('input', {
      type: 'text',
      placeholder: 'Search catalog...',
      style: {
        width: '100%', boxSizing: 'border-box', padding: '6px 10px', fontSize: '12px',
        border: '1px solid #d1d5db', borderRadius: '6px', outline: 'none', marginBottom: '8px',
      },
    })
    const suggestions = el('div', {})
    const tokenEstimate = el('p', { style: { fontSize: '10px', color: '#9ca3af', margin: '8px 0 0 0', display: 'none' } })

    root.appendChild(title)
    root.appendChild(searchInput)
    root.appendChild(suggestions)
    root.appendChild(tokenEstimate)

    let selectedRefs = new Set()

    async function loadSuggestions() {
      try {
        const result = await request('backstage-explorer:get-suggestions', {})
        if (result && result.success !== false && result.suggestions) {
          suggestions.innerHTML = ''
          const header = el('p', { style: { fontSize: '11px', color: '#6b7280', margin: '0 0 4px 0' } }, 'Suggested:')
          suggestions.appendChild(header)
          for (const s of result.suggestions.slice(0, 5)) {
            const name = (s.ref || s.name || '').split('/').pop()
            const cb = el('input', { type: 'checkbox' })
            cb.addEventListener('change', () => {
              if (cb.checked) selectedRefs.add(s.ref)
              else selectedRefs.delete(s.ref)
              tokenEstimate.style.display = selectedRefs.size > 0 ? 'block' : 'none'
              tokenEstimate.textContent = `Selected: ${selectedRefs.size} entit${selectedRefs.size === 1 ? 'y' : 'ies'} (~${selectedRefs.size * 400} tokens)`
            })
            const label = el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#374151', padding: '3px 0', cursor: 'pointer' } },
              cb,
              el('span', {}, name),
              badge(s.kind || 'entity', 'teal')
            )
            suggestions.appendChild(label)
          }
        }
      } catch { /* silent */ }
    }

    loadSuggestions()
  }

  // ── Catalog Insights Tab ───────────────────────────────────────────────────

  function renderCatalogInsightsTab(root) {
    root.style.cssText = 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; max-width: 900px;'

    const title = el('h2', { style: { fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 4px 0' } }, 'Catalog Insights')
    const subtitle = el('p', { style: { fontSize: '13px', color: '#6b7280', margin: '0 0 20px 0' } }, 'How your team interacts with the software catalog across AI sessions')
    root.appendChild(title)
    root.appendChild(subtitle)

    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } })
    root.appendChild(grid)

    async function refresh() {
      try {
        const result = await request('backstage-explorer:get-catalog-insights')
        if (result && result.success !== false) {
          grid.innerHTML = ''

          // Most Discussed Entities
          const discussed = el('div', { style: { border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', background: 'white' } })
          discussed.appendChild(el('h3', { style: { fontSize: '13px', fontWeight: '600', color: '#374151', margin: '0 0 10px 0' } }, 'Most Discussed Entities'))
          const list = result.mostDiscussed || []
          if (list.length === 0) {
            discussed.appendChild(el('p', { style: { fontSize: '12px', color: '#9ca3af' } }, 'No entity mentions tracked yet. Start asking about your catalog in AI sessions.'))
          }
          for (const item of list.slice(0, 10)) {
            const name = (item.ref || '').split('/').pop()
            const row = el('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' } },
              el('span', { style: { color: '#374151', fontWeight: '500' } }, name),
              el('span', { style: { color: '#9ca3af' } }, `${item.totalMentions} mentions in ${item.sessionCount} sessions`)
            )
            discussed.appendChild(row)
          }
          grid.appendChild(discussed)

          // Team Activity
          const teamSection = el('div', { style: { border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', background: 'white' } })
          teamSection.appendChild(el('h3', { style: { fontSize: '13px', fontWeight: '600', color: '#374151', margin: '0 0 10px 0' } }, 'Team Activity'))
          const teams = result.teamActivity || []
          if (teams.length === 0) {
            teamSection.appendChild(el('p', { style: { fontSize: '12px', color: '#9ca3af' } }, 'No team activity data yet.'))
          }
          for (const team of teams.slice(0, 10)) {
            const name = (team.teamRef || '').split('/').pop()
            const row = el('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' } },
              el('span', { style: { color: '#374151', fontWeight: '500' } }, name),
              el('span', { style: { color: '#9ca3af' } }, `${team.entityMentions} entity mentions`)
            )
            teamSection.appendChild(row)
          }
          grid.appendChild(teamSection)
        } else {
          grid.appendChild(el('p', { style: { fontSize: '12px', color: '#9ca3af', gridColumn: '1 / -1' } }, 'Connect Backstage and start using AI sessions to see catalog insights.'))
        }
      } catch {
        grid.appendChild(el('p', { style: { fontSize: '12px', color: '#9ca3af', gridColumn: '1 / -1' } }, 'Unable to load catalog insights.'))
      }
    }

    refresh()
  }

  // ── Slot Router ────────────────────────────────────────────────────────────
  // The host tells us which component to render via the slot or component name.

  const root = document.getElementById('root') || document.body

  // Try to detect which widget to render from slot data
  const slotName = window.__clearpath_slot || ''
  const componentName = window.__clearpath_component || ''

  const router = {
    'SidebarWidget': renderSidebarWidget,
    'sidebar:status': renderSidebarWidget,
    'HomeWidget': renderHomeWidget,
    'home:widgets': renderHomeWidget,
    'AboveInputBar': renderAboveInputBar,
    'work:above-input': renderAboveInputBar,
    'SessionSummaryWidget': renderSessionSummaryWidget,
    'session-summary:after-stats': renderSessionSummaryWidget,
    'WizardContextPicker': renderWizardContextPicker,
    'wizard:context': renderWizardContextPicker,
    'CatalogInsightsTab': renderCatalogInsightsTab,
    'insights': renderCatalogInsightsTab,
  }

  const renderFn = router[componentName] || router[slotName]
  if (renderFn) {
    renderFn(root)
  } else {
    // Default: render the home widget as a generic fallback
    renderHomeWidget(root)
  }

  } // end _boot
})()
