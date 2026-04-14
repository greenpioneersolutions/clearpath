# Renderer Patterns

Two patterns are supported for building extension renderer UIs. Choose based on your needs.

## Pattern 1: IIFE (No Build Step)

The simplest approach. A self-contained JavaScript file with no external dependencies. No build tools, bundlers, or transpilers needed.

### When to Use
- Simple extensions with minimal UI
- Quick prototyping
- When you want zero build configuration
- Extensions that primarily render data from main process handlers

### Template

```javascript
;(function () {
  'use strict'

  // ── Bootstrap ─────────────────────────────────────────────────────────
  // The host sets window.__clearpath_port and window.__clearpath_extension_id
  // before loading this script.

  function init(port, extensionId) {
    boot(port, extensionId)
  }

  if (window.__clearpath_port && window.__clearpath_extension_id) {
    init(window.__clearpath_port, window.__clearpath_extension_id)
  } else {
    // Poll briefly in case of race condition
    var check = setInterval(function () {
      if (window.__clearpath_port && window.__clearpath_extension_id) {
        clearInterval(check)
        init(window.__clearpath_port, window.__clearpath_extension_id)
      }
    }, 50)
    setTimeout(function () { clearInterval(check) }, 10000)
  }

  function boot(port, extensionId) {

    // ── SDK Client ────────────────────────────────────────────────────────
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

      // Handle pushed events
      if (data.type === 'ext:event') {
        handleEvent(data.event, data.data)
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

    // Signal ready to host
    port.postMessage({ type: 'ext:ready' })

    // ── Event Handling ──────────────────────────────────────────────────
    function handleEvent(event, data) {
      // Handle events pushed by the host (slot:data-changed, session events, etc.)
      if (event === 'slot:data-changed') {
        onSlotDataChanged(data)
      }
    }

    function onSlotDataChanged(data) {
      // React to slot data changes (for panel contributions)
    }

    // ── Component Router ────────────────────────────────────────────────
    var root = document.getElementById('root')
      || document.getElementById('ext-root')
      || document.body

    var componentName = window.__clearpath_component

    switch (componentName) {
      case 'HomeWidget':
        renderHomeWidget(root, request)
        break
      case 'SidebarStatus':
        renderSidebarStatus(root, request)
        break
      default:
        renderMainPage(root, request, extensionId)
    }

    // ── Component Implementations ───────────────────────────────────────

    function renderMainPage(root, request, extensionId) {
      root.innerHTML = [
        '<div style="padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#e5e7eb">',
        '  <h1 style="font-size:24px;font-weight:700;color:#f3f4f6">My Extension</h1>',
        '  <p style="color:#9ca3af">Extension ID: ' + extensionId + '</p>',
        '  <div id="content">Loading...</div>',
        '</div>',
      ].join('\n')

      // Load data from main process handler
      request('my-ext:get-data').then(function (result) {
        var data = result && result.data ? result.data : result
        document.getElementById('content').textContent = JSON.stringify(data, null, 2)
      }).catch(function (err) {
        document.getElementById('content').textContent = 'Error: ' + err.message
      })
    }

    function renderHomeWidget(root, request) {
      root.innerHTML = [
        '<div style="padding:12px;font-family:system-ui;color:#e5e7eb">',
        '  <span style="font-weight:600;color:#f3f4f6">My Widget</span>',
        '  <div id="status" style="font-size:12px;color:#9ca3af;margin-top:4px">Loading...</div>',
        '</div>',
      ].join('\n')

      request('my-ext:get-status').then(function (result) {
        document.getElementById('status').textContent = result?.data?.message || 'Active'
      })
    }

    function renderSidebarStatus(root, request) {
      root.innerHTML = '<div style="padding:4px 8px;font-size:11px;color:#9ca3af">--</div>'
      request('my-ext:get-status').then(function (result) {
        root.querySelector('div').textContent = result?.data?.shortStatus || 'OK'
      })
    }

  } // end boot
})()
```

### Styling Tips for IIFE

- Use inline styles -- the CSP blocks external stylesheets
- The iframe body has `background: transparent` and `color: #e2e8f0` by default
- Use the brand colors: `#5B4FC4` (primary purple), `#1D9E75` (teal accent), `#7F77DD` (light purple)
- Keep dark theme in mind -- the host is always dark mode

---

## Pattern 2: React with SDK Package

A full React-based approach using `@clearpath/extension-sdk`. Requires a build step (Vite, webpack, esbuild, etc.) to produce a bundled IIFE output.

### When to Use
- Complex UIs with multiple components and state management
- When you want React lifecycle management (hooks, effects, etc.)
- Extensions with rich interactivity
- Team projects where React conventions are preferred

### Setup

1. Install the SDK:
```bash
npm install @clearpath/extension-sdk react react-dom
```

2. Create the entry point (`src/renderer.tsx`):

```tsx
import React, { useState, useEffect } from 'react'
import { createExtension, useSDK } from '@clearpath/extension-sdk'
import type { ExtensionSDK, ClearPathTheme } from '@clearpath/extension-sdk'

// ── Main Page Component ─────────────────────────────────────────────────

function MainPage() {
  const sdk = useSDK()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [theme, setTheme] = useState<ClearPathTheme | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load initial data
    sdk.storage.get<Record<string, unknown>>('config')
      .then(setData)
      .catch(err => setError(err.message))

    // Subscribe to theme changes
    sdk.theme.get().then(setTheme)
    const unsub = sdk.theme.onChange(setTheme)
    return unsub
  }, [sdk])

  if (error) {
    return <div style={{ color: '#ef4444', padding: 24 }}>Error: {error}</div>
  }

  return (
    <div style={{
      padding: 24,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#e5e7eb',
    }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f3f4f6' }}>
        My Extension
      </h1>
      <p style={{ color: '#9ca3af' }}>
        Extension ID: {sdk.extensionId}
      </p>

      {data && (
        <pre style={{
          background: '#111827',
          padding: 12,
          borderRadius: 6,
          fontSize: 13,
          color: '#d1d5db',
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}

      <button
        onClick={async () => {
          await sdk.notifications.emit({
            title: 'My Extension',
            message: 'Button clicked!',
            severity: 'info',
          })
        }}
        style={{
          marginTop: 8,
          padding: '6px 16px',
          background: theme?.primary || '#5B4FC4',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Send Notification
      </button>
    </div>
  )
}

// ── Dashboard Widget Component ──────────────────────────────────────────

function DashboardWidget() {
  const sdk = useSDK()
  const [turnCount, setTurnCount] = useState(0)

  useEffect(() => {
    // Listen for turn:ended events
    const unsub = sdk.events.on('turn:ended', () => {
      setTurnCount(prev => prev + 1)
    })
    return unsub
  }, [sdk])

  return (
    <div style={{ padding: 12, fontFamily: 'system-ui', color: '#e5e7eb' }}>
      <strong style={{ color: '#f3f4f6' }}>My Widget</strong>
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
        Turns this session: {turnCount}
      </div>
    </div>
  )
}

// ── Extension Entry Point ───────────────────────────────────────────────

export default createExtension({
  components: {
    MainPage,          // Default page (matched to navigation contribution)
    DashboardWidget,   // Matched to widget/panel component name in manifest
  },

  activate: async (sdk: ExtensionSDK) => {
    console.log('Extension activated:', sdk.extensionId)

    // One-time setup: subscribe to events, load initial data, etc.
    const theme = await sdk.theme.get()
    console.log('Current theme:', theme.isDark ? 'dark' : 'light')
  },

  deactivate: async () => {
    console.log('Extension deactivated')
    // Clean up subscriptions, timers, etc.
  },
})
```

3. Build configuration (Vite example -- `vite.config.ts`):

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/renderer.tsx',
      name: 'MyExtension',
      formats: ['iife'],
      fileName: () => 'renderer.js',
    },
    outDir: 'dist',
    rollupOptions: {
      // React is NOT externalized -- it must be bundled into the IIFE
      // because the iframe has no access to the host's React instance
    },
  },
})
```

**Important**: The output must be a self-contained IIFE. The iframe cannot load external modules. All dependencies (including React and ReactDOM) must be bundled.

### The `components` Map

The `components` object passed to `createExtension()` maps component names to React components. These names must match the `component` field in manifest `contributes` entries:

```json
{
  "contributes": {
    "navigation": [{ "id": "main", "path": "/my-ext", "label": "My Ext", "icon": "Puzzle" }],
    "panels": [{ "id": "widget", "slot": "home:widgets", "component": "DashboardWidget", "label": "My Widget" }]
  }
}
```

The host sets `window.__clearpath_component` to tell the renderer which component to render. When using `createExtension()`, the SDK handles this routing internally.

---

## Comparison

| Feature | IIFE Pattern | React Pattern |
|---------|-------------|---------------|
| Build step required | No | Yes |
| Dependencies | None | React, SDK package |
| Component reuse | Manual | React components |
| State management | Manual DOM updates | React hooks |
| Type safety | Optional (JSDoc) | TypeScript |
| Bundle size | Tiny | Larger (includes React) |
| Best for | Simple UIs, prototypes | Complex UIs, teams |

## Common Pitfalls

1. **Do not use external CDN scripts** -- the CSP blocks them. All code must be bundled.
2. **Do not use `fetch()` or `XMLHttpRequest`** -- `connect-src 'none'` blocks network requests. Use `sdk.http.fetch()` instead.
3. **The iframe has no access to the host's React** -- you must bundle React yourself in the IIFE output.
4. **`window.__clearpath_component`** tells you which UI to render. Always check it and route accordingly.
5. **The root element** is `<div id="ext-root">` in the srcdoc. The IIFE pattern may also find `document.getElementById('root')`.
