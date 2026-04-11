// AI Efficiency Coach — Renderer Entry
// This file is loaded inside the extension iframe via clearpath-ext:// protocol.
// It registers all components with the host via createExtension().
//
// NOTE: In production, this would be built from src/renderer/ via esbuild/vite.
// For now, this is a self-contained CJS bundle that works with the iframe bootstrap.

;(function() {
  'use strict'

  // The renderer script loads before the host transfers the MessagePort.
  // We need to wait for the port to arrive, or pick it up if it's already set.
  function init(port, extensionId) {
    _boot(port, extensionId)
  }

  // Check if the bootstrap already set the port (race condition: port may arrive first)
  if (window.__clearpath_port && window.__clearpath_extension_id) {
    init(window.__clearpath_port, window.__clearpath_extension_id)
  } else {
    // Wait for the bootstrap to set the globals after receiving the port
    const check = setInterval(() => {
      if (window.__clearpath_port && window.__clearpath_extension_id) {
        clearInterval(check)
        init(window.__clearpath_port, window.__clearpath_extension_id)
      }
    }, 50)
    // Give up after 10 seconds
    setTimeout(() => clearInterval(check), 10000)
  }

  function _boot(port, extensionId) {

  // ── Minimal SDK Client (inline) ────────────────────────────────────────────
  // This is a lightweight version of the SDK client for the renderer.

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
          try { fn(data.data) } catch {}
        }
      }
    }

    if (data.type === 'ext:init') {
      // Theme and config received
      window.__clearpath_theme = data.theme
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

  function unwrap(result) {
    if (result && typeof result === 'object' && 'success' in result) {
      if (!result.success) throw new Error(result.error || 'Failed')
      return result.data
    }
    return result
  }

  // Signal ready
  port.postMessage({ type: 'ext:ready' })

  // ── Render the Dashboard ───────────────────────────────────────────────────
  // Since we're in an iframe without React bundled, we use plain DOM rendering.
  // This is the initial implementation — a production version would use React.

  const root = document.getElementById('ext-root')
  if (!root) return

  root.innerHTML = `
    <style>
      .ec-container { padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0; }
      .ec-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
      .ec-score-ring { position: relative; width: 120px; height: 120px; margin: 0 auto 12px; }
      .ec-score-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
      .ec-score-ring circle { fill: none; stroke-width: 8; }
      .ec-score-ring .bg { stroke: #334155; }
      .ec-score-ring .fg { stroke-dasharray: 339.292; stroke-linecap: round; transition: stroke-dashoffset 0.8s ease; }
      .ec-score-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 28px; font-weight: 700; }
      .ec-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 12px; }
      .ec-stat { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 10px; text-align: center; }
      .ec-stat-value { font-size: 22px; font-weight: 600; }
      .ec-stat-label { font-size: 11px; color: #94a3b8; margin-top: 2px; }
      .ec-btn { background: #1D9E75; color: white; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 500; }
      .ec-btn:hover { background: #178a65; }
      .ec-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .ec-rec { background: #0f172a; border-left: 3px solid; border-radius: 4px; padding: 10px 12px; margin-bottom: 8px; }
      .ec-rec.info { border-color: #3b82f6; }
      .ec-rec.warning { border-color: #f59e0b; }
      .ec-rec.critical { border-color: #ef4444; }
      .ec-rec-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
      .ec-rec-desc { font-size: 12px; color: #94a3b8; }
      .ec-rec-badge { display: inline-block; font-size: 10px; background: #1D9E75; color: white; padding: 2px 6px; border-radius: 10px; margin-left: 6px; }
      .ec-h2 { font-size: 15px; font-weight: 600; margin-bottom: 8px; color: #f1f5f9; }
      .ec-h3 { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #cbd5e1; }
      .ec-loading { text-align: center; padding: 40px; color: #64748b; }
      .ec-empty { text-align: center; padding: 20px; color: #64748b; font-size: 13px; }
      .ec-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .ec-table th { text-align: left; padding: 6px 8px; color: #94a3b8; font-weight: 500; border-bottom: 1px solid #334155; }
      .ec-table td { padding: 6px 8px; border-bottom: 1px solid #1e293b; }
      .ec-mode-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #064e3b; border: 1px solid #059669; border-radius: 8px; margin-bottom: 12px; font-size: 12px; }
      .ec-toggle { position: relative; width: 36px; height: 20px; background: #475569; border-radius: 10px; cursor: pointer; transition: background 0.2s; }
      .ec-toggle.on { background: #1D9E75; }
      .ec-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: white; border-radius: 50%; transition: transform 0.2s; }
      .ec-toggle.on::after { transform: translateX(16px); }
    </style>

    <div class="ec-container" id="ec-dashboard">
      <div class="ec-loading" id="ec-loading">Loading Efficiency Coach...</div>
    </div>
  `

  // ── Dashboard Rendering ────────────────────────────────────────────────────

  async function renderDashboard() {
    const container = document.getElementById('ec-dashboard')
    const loading = document.getElementById('ec-loading')

    try {
      const [scoreData, modeState] = await Promise.all([
        request('efficiency-coach:get-overall-score'),
        request('efficiency-coach:get-mode-state'),
      ])

      const score = scoreData?.score ?? null
      const cats = scoreData?.categoryScores ?? null
      const mode = modeState?.enabled ?? false

      loading.style.display = 'none'

      // Mode bar
      const modeBar = document.createElement('div')
      modeBar.className = 'ec-mode-bar'
      modeBar.innerHTML = `
        <span style="font-size: 16px;">&#9889;</span>
        <span style="flex: 1; font-weight: 500;">Efficiency Mode</span>
        <div class="ec-toggle ${mode ? 'on' : ''}" id="ec-mode-toggle"></div>
      `
      container.appendChild(modeBar)

      document.getElementById('ec-mode-toggle').onclick = async () => {
        const toggle = document.getElementById('ec-mode-toggle')
        const isOn = toggle.classList.contains('on')
        toggle.classList.toggle('on')
        await request(isOn ? 'efficiency-coach:disable-efficiency-mode' : 'efficiency-coach:enable-efficiency-mode')
      }

      // Score card
      const scoreCard = document.createElement('div')
      scoreCard.className = 'ec-card'
      const scoreColor = score === null ? '#64748b' : score >= 70 ? '#1D9E75' : score >= 40 ? '#f59e0b' : '#ef4444'
      const dashOffset = score === null ? 339.292 : 339.292 * (1 - score / 100)
      scoreCard.innerHTML = `
        <div class="ec-score-ring">
          <svg viewBox="0 0 120 120">
            <circle class="bg" cx="60" cy="60" r="54"/>
            <circle class="fg" cx="60" cy="60" r="54" style="stroke: ${scoreColor}; stroke-dashoffset: ${dashOffset}"/>
          </svg>
          <div class="ec-score-label" style="color: ${scoreColor}">${score ?? '--'}</div>
        </div>
        <div style="text-align: center; font-size: 13px; color: #94a3b8;">Overall Efficiency Score</div>
      `
      container.appendChild(scoreCard)

      // Category breakdown
      if (cats) {
        const catCard = document.createElement('div')
        catCard.className = 'ec-card'
        catCard.innerHTML = `<div class="ec-h2">Category Breakdown</div>`
        const grid = document.createElement('div')
        grid.className = 'ec-grid'

        const categories = [
          { label: 'Context Efficiency', value: cats.contextEfficiency },
          { label: 'Prompt Quality', value: cats.promptQuality },
          { label: 'Model Selection', value: cats.modelSelection },
          { label: 'Cost Optimization', value: cats.costOptimization },
        ]
        for (const cat of categories) {
          const color = cat.value >= 70 ? '#1D9E75' : cat.value >= 40 ? '#f59e0b' : '#ef4444'
          grid.innerHTML += `<div class="ec-stat"><div class="ec-stat-value" style="color: ${color}">${cat.value}</div><div class="ec-stat-label">${cat.label}</div></div>`
        }
        catCard.appendChild(grid)
        container.appendChild(catCard)
      }

      // Analyze button
      const analyzeCard = document.createElement('div')
      analyzeCard.className = 'ec-card'
      analyzeCard.style.textAlign = 'center'
      analyzeCard.innerHTML = `
        <button class="ec-btn" id="ec-analyze-btn">Run Full Analysis</button>
        <div id="ec-analyze-status" style="margin-top: 8px; font-size: 12px; color: #64748b;"></div>
      `
      container.appendChild(analyzeCard)

      document.getElementById('ec-analyze-btn').onclick = async () => {
        const btn = document.getElementById('ec-analyze-btn')
        const status = document.getElementById('ec-analyze-status')
        btn.disabled = true
        status.textContent = 'Analyzing session data...'

        try {
          const report = await request('efficiency-coach:analyze-all')
          status.textContent = `Analysis complete! Score: ${report.overallScore}/100 (${report.sessionCount} sessions)`
          // Re-render dashboard with new data
          setTimeout(() => {
            container.innerHTML = '<div class="ec-loading" id="ec-loading">Refreshing...</div>'
            renderDashboard()
          }, 1500)
        } catch (err) {
          status.textContent = 'Analysis failed: ' + (err.message || err)
          btn.disabled = false
        }
      }

      // Recommendations
      try {
        const recs = await request('efficiency-coach:get-recommendations')
        if (recs && recs.length > 0) {
          const recCard = document.createElement('div')
          recCard.className = 'ec-card'
          recCard.innerHTML = '<div class="ec-h2">Recommendations</div>'

          for (const rec of recs.slice(0, 5)) {
            recCard.innerHTML += `
              <div class="ec-rec ${rec.severity || 'info'}">
                <div class="ec-rec-title">${rec.title || 'Recommendation'}${rec.estimatedSavingsPercent ? `<span class="ec-rec-badge">~${rec.estimatedSavingsPercent}% savings</span>` : ''}</div>
                <div class="ec-rec-desc">${rec.description || ''}</div>
              </div>
            `
          }
          container.appendChild(recCard)
        }
      } catch {}

      // Model comparison
      try {
        const models = await request('efficiency-coach:get-model-comparison')
        if (models && models.length > 0) {
          const modelCard = document.createElement('div')
          modelCard.className = 'ec-card'
          modelCard.innerHTML = `
            <div class="ec-h2">Model Comparison</div>
            <table class="ec-table">
              <thead><tr><th>Model</th><th>Turns</th><th>Avg Tokens</th><th>Error Rate</th><th>Score</th></tr></thead>
              <tbody>
                ${models.map((m) => `
                  <tr>
                    <td>${m.model}</td>
                    <td>${m.turnCount}</td>
                    <td>${m.avgTokensPerTurn?.toLocaleString?.() ?? '-'}</td>
                    <td>${Math.round((m.errorRate || 0) * 100)}%</td>
                    <td>${Math.round(m.efficiencyScore)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `
          container.appendChild(modelCard)
        }
      } catch {}

      // Pattern alerts
      try {
        const patterns = await request('efficiency-coach:get-patterns')
        if (patterns && patterns.length > 0) {
          const patternCard = document.createElement('div')
          patternCard.className = 'ec-card'
          patternCard.innerHTML = `<div class="ec-h2">Detected Patterns</div>`
          for (const p of patterns.slice(0, 5)) {
            patternCard.innerHTML += `
              <div class="ec-rec ${p.severity || 'info'}">
                <div class="ec-rec-title">${p.label} <span style="font-weight: normal; color: #94a3b8;">(${p.occurrences}x)</span></div>
                <div class="ec-rec-desc">${p.description}</div>
              </div>
            `
          }
          container.appendChild(patternCard)
        }
      } catch {}

      // Report history
      try {
        const reports = await request('efficiency-coach:get-reports')
        if (reports && reports.length > 1) {
          const histCard = document.createElement('div')
          histCard.className = 'ec-card'
          histCard.innerHTML = `<div class="ec-h2">Report History</div>`
          for (const r of reports.slice(0, 5)) {
            const date = new Date(r.createdAt).toLocaleDateString()
            histCard.innerHTML += `
              <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1e293b; font-size: 12px;">
                <span>${date}</span>
                <span style="color: ${r.overallScore >= 70 ? '#1D9E75' : r.overallScore >= 40 ? '#f59e0b' : '#ef4444'}; font-weight: 600;">${r.overallScore}/100</span>
                <span style="color: #64748b;">${r.sessionCount} sessions</span>
              </div>
            `
          }
          container.appendChild(histCard)
        }
      } catch {}

      if (score === null) {
        const emptyCard = document.createElement('div')
        emptyCard.className = 'ec-card ec-empty'
        emptyCard.innerHTML = 'No efficiency data yet. Run some sessions and click "Run Full Analysis" to get started.'
        container.appendChild(emptyCard)
      }

    } catch (err) {
      loading.textContent = 'Error loading dashboard: ' + (err.message || err)
    }
  }

  // Start rendering
  renderDashboard()

  // Signal activated
  port.postMessage({ type: 'ext:activated' })
  } // end _boot
})()
