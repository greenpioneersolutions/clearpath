# Full Extension Example

A complete extension using all major SDK features. Based on the bundled `com.clearpathai.sdk-example` reference implementation.

## Directory Structure

```
extensions/com.clearpathai.sdk-example/
  clearpath-extension.json
  dist/
    main.cjs
    renderer.js
  assets/
    icon.svg
```

## clearpath-extension.json

```json
{
  "id": "com.clearpathai.sdk-example",
  "name": "SDK Example",
  "version": "1.0.0",
  "description": "Example extension demonstrating all ClearPathAI Extension SDK capabilities. Ships as a reference implementation with the SDK package.",
  "author": "ClearPathAI",
  "icon": "assets/icon.svg",
  "minAppVersion": "1.8.0",
  "main": "dist/main.cjs",
  "renderer": "dist/renderer.js",
  "permissions": [
    "storage",
    "notifications:emit",
    "sessions:read",
    "cost:read",
    "feature-flags:read",
    "feature-flags:write",
    "context:estimate",
    "navigation",
    "env:read"
  ],
  "ipcNamespace": "sdk-example",
  "ipcChannels": [
    "sdk-example:get-config",
    "sdk-example:set-config",
    "sdk-example:get-demo-data",
    "sdk-example:on-turn-ended",
    "sdk-example:ctx-demo"
  ],
  "storageQuota": 5242880,
  "contributes": {
    "navigation": [
      {
        "id": "sdk-example-page",
        "path": "/sdk-example",
        "label": "SDK Example",
        "icon": "code",
        "position": "after:insights"
      }
    ],
    "panels": [
      {
        "id": "sdk-example-home-widget",
        "slot": "home:widgets",
        "component": "HomeWidget",
        "label": "SDK Example"
      }
    ],
    "featureFlags": ["sdkExampleVerbose"],
    "sessionHooks": [
      {
        "event": "turn:ended",
        "handler": "sdk-example:on-turn-ended"
      }
    ],
    "contextProviders": [
      {
        "id": "sdk-demo-context",
        "label": "SDK Demo Context",
        "description": "Example context provider that returns demo data from the SDK Example extension",
        "parameters": [
          {
            "id": "topic",
            "label": "Topic",
            "type": "text",
            "required": false,
            "placeholder": "e.g. storage, sessions"
          }
        ],
        "handler": "sdk-example:ctx-demo",
        "examples": [
          "Show me SDK example data",
          "What can the SDK do?"
        ],
        "maxTokenEstimate": 1000
      }
    ]
  }
}
```

This manifest demonstrates:
- **9 permissions** covering storage, notifications, sessions, cost, feature flags, context estimation, navigation, and env access
- **5 IPC channels** for config management, demo data, session hooks, and context providers
- **Navigation** -- adds a sidebar item after Insights
- **Panels** -- adds a home screen widget
- **Feature flags** -- declares a `sdkExampleVerbose` flag
- **Session hooks** -- subscribes to `turn:ended` events
- **Context providers** -- supplies demo context for AI sessions

## dist/main.cjs

```javascript
'use strict'

const DEFAULT_CONFIG = {
  greeting: 'Hello from SDK Example!',
  turnCount: 0,
  verbose: false,
  lastActivated: null,
}

async function activate(ctx) {
  ctx.log.info('[sdk-example] Activating SDK Example extension...')

  // ── Storage: Initialize config on first run ───────────────────────────
  if (!ctx.store.get('config')) {
    ctx.store.set('config', DEFAULT_CONFIG)
    ctx.log.info('[sdk-example] Initialized default config in storage')
  }
  ctx.store.set('config.lastActivated', Date.now())

  // ── Handler: get-config ───────────────────────────────────────────────
  ctx.registerHandler('sdk-example:get-config', async () => {
    return { success: true, data: ctx.store.get('config') }
  })

  // ── Handler: set-config (merge incoming args into stored config) ──────
  ctx.registerHandler('sdk-example:set-config', async (_e, args) => {
    const current = ctx.store.get('config') || {}
    const updated = { ...current, ...args }
    ctx.store.set('config', updated)
    return { success: true, data: updated }
  })

  // ── Handler: get-demo-data (combines storage + metadata) ─────────────
  ctx.registerHandler('sdk-example:get-demo-data', async () => {
    const config = ctx.store.get('config') || {}
    return {
      success: true,
      data: {
        config,
        extensionId: ctx.extensionId,
        extensionPath: ctx.extensionPath,
        storageKeys: ctx.store.keys(),
        timestamp: Date.now(),
      },
    }
  })

  // ── Session Hook: on-turn-ended ───────────────────────────────────────
  // Tracks a running count of AI turns across all sessions.
  ctx.registerHandler('sdk-example:on-turn-ended', async (_e, args) => {
    const config = ctx.store.get('config') || {}
    const turnCount = (config.turnCount || 0) + 1
    ctx.store.set('config.turnCount', turnCount)

    if (config.verbose) {
      ctx.log.info(
        '[sdk-example] Turn ended in session %s — total turns tracked: %d',
        args?.sessionId,
        turnCount,
      )
    }

    return { success: true, turnCount }
  })

  // ── Context Provider: ctx-demo ────────────────────────────────────────
  // Returns markdown context for injection into AI sessions.
  ctx.registerHandler('sdk-example:ctx-demo', async (_e, args) => {
    const config = ctx.store.get('config') || {}
    const topic = args?.topic || 'overview'

    let context = '## SDK Example Extension Context\n\n'
    context += `**Extension**: ${ctx.extensionId}\n`
    context += `**Greeting**: ${config.greeting}\n`
    context += `**Total turns tracked**: ${config.turnCount || 0}\n`
    context += `**Last activated**: ${config.lastActivated ? new Date(config.lastActivated).toISOString() : 'never'}\n`
    context += `**Topic requested**: ${topic}\n\n`
    context += 'This context was generated by the SDK Example extension.\n'

    return {
      success: true,
      context,
      tokenEstimate: Math.ceil(context.length / 4),
      metadata: { topic, truncated: false },
    }
  })

  ctx.log.info('[sdk-example] SDK Example activated — 5 handlers registered')
}

function deactivate() {
  // Handlers are auto-unregistered by the host.
}

module.exports = { activate, deactivate }
```

## dist/renderer.js (IIFE Pattern)

```javascript
;(function () {
  'use strict'

  function init(port, extensionId) {
    _boot(port, extensionId)
  }

  // Wait for port to be available
  if (window.__clearpath_port && window.__clearpath_extension_id) {
    init(window.__clearpath_port, window.__clearpath_extension_id)
  } else {
    var check = setInterval(function () {
      if (window.__clearpath_port && window.__clearpath_extension_id) {
        clearInterval(check)
        init(window.__clearpath_port, window.__clearpath_extension_id)
      }
    }, 50)
    setTimeout(function () { clearInterval(check) }, 10000)
  }

  function _boot(port, extensionId) {
    // ── MessagePort SDK Client ──────────────────────────────────────────
    var reqCounter = 0
    var pending = new Map()

    port.onmessage = function (event) {
      var data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'ext:response') {
        var p = pending.get(data.id)
        if (p) {
          pending.delete(data.id)
          if (data.error) p.reject(new Error(data.error.message || 'SDK error'))
          else p.resolve(data.result)
        }
      }
    }

    function request(method, params) {
      var id = 'req-' + (++reqCounter)
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          pending.delete(id)
          reject(new Error('Request "' + method + '" timed out'))
        }, 15000)
        pending.set(id, {
          resolve: function (v) { clearTimeout(timer); resolve(v) },
          reject: function (e) { clearTimeout(timer); reject(e) },
        })
        port.postMessage({ type: 'ext:request', id: id, method: method, params: params })
      })
    }

    port.postMessage({ type: 'ext:ready' })

    // ── Component Router ────────────────────────────────────────────────
    // IMPORTANT: The host srcdoc uses <div id="ext-root">, NOT "root".
    var root = document.getElementById('ext-root')
      || document.getElementById('root')
      || document.body
    var componentName = window.__clearpath_component

    if (componentName === 'HomeWidget') {
      renderHomeWidget(root, request)
    } else {
      renderMainPage(root, request, extensionId)
    }

    // ── Main Page ───────────────────────────────────────────────────────
    function renderMainPage(root, request, extensionId) {
      root.innerHTML = '<div style="padding:24px;font-family:system-ui;color:#e5e7eb">'
        + '<h1 style="font-size:24px;font-weight:700;color:#f3f4f6">SDK Example</h1>'
        + '<div id="demo-output" style="background:#111827;padding:12px;border-radius:6px;'
        + 'font-family:monospace;font-size:13px;color:#d1d5db;white-space:pre-wrap">Loading...</div>'
        + '<button id="btn-refresh" style="margin-top:8px;padding:6px 16px;background:#5B4FC4;'
        + 'color:white;border:none;border-radius:6px;cursor:pointer">Refresh</button>'
        + '<button id="btn-notify" style="margin:8px 0 0 8px;padding:6px 16px;background:#1D9E75;'
        + 'color:white;border:none;border-radius:6px;cursor:pointer">Send Notification</button>'
        + '</div>'

      function loadData() {
        request('sdk-example:get-demo-data').then(function (result) {
          var data = result && result.data ? result.data : result
          document.getElementById('demo-output').textContent = JSON.stringify(data, null, 2)
        }).catch(function (err) {
          document.getElementById('demo-output').textContent = 'Error: ' + err.message
        })
      }

      loadData()
      document.getElementById('btn-refresh').onclick = loadData

      document.getElementById('btn-notify').onclick = function () {
        request('notifications.emit', {
          title: 'SDK Example',
          message: 'Hello from the SDK Example extension!',
          severity: 'info',
        })
      }
    }

    // ── Home Widget ─────────────────────────────────────────────────────
    function renderHomeWidget(root, request) {
      root.innerHTML = '<div style="padding:12px;font-family:system-ui;color:#e5e7eb">'
        + '<span style="font-size:14px;font-weight:600;color:#f3f4f6">SDK Example</span>'
        + '<div id="widget-status" style="font-size:12px;color:#9ca3af;margin-top:4px">Loading...</div>'
        + '</div>'

      request('sdk-example:get-config').then(function (result) {
        var config = (result && result.data) ? result.data : (result || {})
        document.getElementById('widget-status').innerHTML =
          '<span style="color:#1D9E75;font-weight:500">Active</span>'
          + ' &middot; ' + (config.turnCount || 0) + ' turns tracked'
      }).catch(function () {
        document.getElementById('widget-status').textContent = 'Not available'
      })
    }

  } // end _boot
})()
```

## What This Demonstrates

| Feature | Where |
|---------|-------|
| Storage (read/write/keys) | `main.cjs`: all handlers use `ctx.store` |
| Structured logging | `main.cjs`: `ctx.log.info/warn/error` throughout |
| IPC handler registration | `main.cjs`: 5 handlers via `ctx.registerHandler` |
| Extension metadata | `main.cjs`: `ctx.extensionId`, `ctx.extensionPath` |
| Session hooks | Manifest `sessionHooks` + `on-turn-ended` handler |
| Context providers | Manifest `contextProviders` + `ctx-demo` handler |
| Feature flags | Manifest `featureFlags` + verbose mode check |
| Notification emission | `renderer.js`: `notifications.emit` request |
| MessagePort communication | `renderer.js`: full request/response client |
| Component routing | `renderer.js`: `window.__clearpath_component` switch |
| Navigation contribution | Manifest `navigation` entry |
| Panel contribution | Manifest `panels` entry (HomeWidget) |
