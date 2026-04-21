/**
 * SDK Example — Renderer Entry Point
 *
 * Uses `createExtension()` from the SDK to register all UI components
 * and lifecycle hooks. The host calls `mount()` on the returned object
 * to bootstrap the extension inside a sandboxed iframe.
 *
 * Components are keyed by the names referenced in the manifest's
 * `contributes` section (panels, sidebarWidgets, navigation).
 *
 * This file also manually bootstraps React when running inside the iframe,
 * using the MessagePort protocol to create the SDK client and render the
 * appropriate component.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { createExtension, ClearPathProvider } from '@clearpath/extension-sdk'
import type { ExtensionSDK } from '@clearpath/extension-sdk'
import { App } from './App'
import { HomeWidget } from './widgets/HomeWidget'
import { StatusWidget } from './widgets/SidebarWidget'

// ── Lightweight SDK client factory ─────────────────────────────────────────
// We re-implement a minimal version here because the SDK only exports
// createSDKClient from its internal client.ts (not a public sub-path).
// In a real extension, createExtension().mount() handles this automatically.
// For our manual React mount we need direct access to the SDK instance.

import type { ClearPathTheme } from '@clearpath/extension-sdk'

function buildSDKClient(port: MessagePort, extensionId: string): ExtensionSDK {
  let reqCounter = 0
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const themeListeners = new Set<(theme: ClearPathTheme) => void>()
  const eventListeners = new Map<string, Set<(data: unknown) => void>>()

  port.onmessage = (event: MessageEvent) => {
    const data = event.data
    if (!data || typeof data !== 'object') return

    if (data.type === 'ext:response') {
      const p = pending.get(data.id)
      if (p) {
        pending.delete(data.id)
        if (data.error) {
          p.reject(new Error(data.error.message ?? 'SDK call failed'))
        } else {
          p.resolve(data.result)
        }
      }
    }

    if (data.type === 'ext:event') {
      const listeners = eventListeners.get(data.event)
      if (listeners) {
        for (const cb of listeners) {
          try { cb(data.data) } catch { /* ignore */ }
        }
      }
      if (data.event === 'theme-changed') {
        for (const cb of themeListeners) {
          cb(data.data as ClearPathTheme)
        }
      }
    }
  }

  function request(method: string, params?: unknown): Promise<unknown> {
    const id = `req-${++reqCounter}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`SDK call "${method}" timed out after 30s`))
      }, 30000)
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      port.postMessage({ type: 'ext:request', id, method, params })
    })
  }

  function unwrap(result: unknown): unknown {
    if (result && typeof result === 'object' && 'success' in result) {
      const r = result as { success: boolean; data?: unknown; error?: string }
      if (!r.success) throw new Error(r.error ?? 'Operation failed')
      return r.data
    }
    return result
  }

  return {
    extensionId,
    github: {
      listRepos: async (opts) => unwrap(await request('github.listRepos', opts)) as unknown[],
      listPulls: async (owner, repo, opts) => unwrap(await request('github.listPulls', { owner, repo, ...opts })) as unknown[],
      getPull: async (owner, repo, pullNumber) => unwrap(await request('github.getPull', { owner, repo, pullNumber })),
      listIssues: async (owner, repo, opts) => unwrap(await request('github.listIssues', { owner, repo, ...opts })) as unknown[],
      search: async (query, type) => unwrap(await request('github.search', { query, type })) as unknown[],
    },
    notifications: {
      emit: async (opts) => { unwrap(await request('notifications.emit', opts)) },
    },
    storage: {
      get: async <T = unknown>(key: string) => unwrap(await request('storage.get', { key })) as T | undefined,
      set: async (key, value) => { unwrap(await request('storage.set', { key, value })) },
      delete: async (key) => { unwrap(await request('storage.delete', { key })) },
      keys: async () => unwrap(await request('storage.keys')) as string[],
      quota: async () => unwrap(await request('storage.quota')) as { used: number; limit: number },
    },
    env: {
      get: async (key) => unwrap(await request('env.get', { key })) as string | undefined,
      keys: async () => unwrap(await request('env.keys')) as string[],
    },
    http: {
      fetch: async (url, opts) => unwrap(await request('http.fetch', { url, ...opts })) as { status: number; headers: Record<string, string>; body: string },
    },
    theme: {
      get: async () => unwrap(await request('theme.get')) as ClearPathTheme,
      onChange: (callback) => {
        themeListeners.add(callback)
        return () => themeListeners.delete(callback)
      },
    },
    sessions: {
      list: async () => unwrap(await request('sessions.list')) as Awaited<ReturnType<ExtensionSDK['sessions']['list']>>,
      getMessages: async (sessionId) => unwrap(await request('sessions.getMessages', { sessionId })) as Awaited<ReturnType<ExtensionSDK['sessions']['getMessages']>>,
      getActive: async () => unwrap(await request('sessions.getActive')) as string | null,
    },
    cost: {
      summary: async () => unwrap(await request('cost.summary')) as Awaited<ReturnType<ExtensionSDK['cost']['summary']>>,
      list: async (opts) => unwrap(await request('cost.list', opts)) as Awaited<ReturnType<ExtensionSDK['cost']['list']>>,
      getBudget: async () => unwrap(await request('cost.getBudget')) as Awaited<ReturnType<ExtensionSDK['cost']['getBudget']>>,
      bySession: async (opts) => unwrap(await request('cost.bySession', opts)) as Awaited<ReturnType<ExtensionSDK['cost']['bySession']>>,
    },
    featureFlags: {
      getAll: async () => unwrap(await request('featureFlags.getAll')) as Record<string, boolean>,
      get: async (key) => unwrap(await request('featureFlags.get', { key })) as boolean,
      set: async (key, value) => { unwrap(await request('featureFlags.set', { key, value })) },
    },
    localModels: {
      detect: async () => unwrap(await request('localModels.detect')) as Awaited<ReturnType<ExtensionSDK['localModels']['detect']>>,
      chat: async (opts) => unwrap(await request('localModels.chat', opts)) as { content: string },
    },
    context: {
      estimateTokens: async (text) => unwrap(await request('context.estimateTokens', { text })) as { tokens: number; method: 'heuristic' },
    },
    events: {
      on: (event: string, callback: (data: unknown) => void) => {
        void request('events.subscribe', { event })
        if (!eventListeners.has(event)) eventListeners.set(event, new Set())
        eventListeners.get(event)!.add(callback)
        return () => {
          eventListeners.get(event)?.delete(callback)
          if (eventListeners.get(event)?.size === 0) {
            eventListeners.delete(event)
            void request('events.unsubscribe', { event })
          }
        }
      },
    },
    navigate: async (path) => { unwrap(await request('navigate', { path })) },
  }
}

// ── Extension definition ───────────────────────────────────────────────────

const extension = createExtension({
  components: {
    // Main navigation page — the tabbed SDK explorer
    App,
    // Panel contribution: home:widgets slot
    HomeWidget,
    // Sidebar widget contribution
    StatusWidget,
  },

  activate: async (sdk: ExtensionSDK) => {
    console.log(`[SDK Example] Renderer activated for extension: ${sdk.extensionId}`)

    // Subscribe to session lifecycle events to demonstrate sdk.events
    const unsub = sdk.events.on('session:started', (data) => {
      console.log('[SDK Example] Session started event received:', data)
    })

    // Store the unsubscribe function for cleanup
    ;(window as unknown as Record<string, unknown>).__sdkExampleCleanup = unsub
  },

  deactivate: async () => {
    console.log('[SDK Example] Renderer deactivating')
    const cleanup = (window as unknown as Record<string, unknown>).__sdkExampleCleanup as
      | (() => void)
      | undefined
    if (cleanup) cleanup()
  },
})

// ── Bootstrap ──────────────────────────────────────────────────────────────
// When running inside the host iframe, create the SDK client from the
// injected MessagePort and mount the appropriate component.

;(function bootstrap() {
  const port = (window as unknown as { __clearpath_port?: MessagePort }).__clearpath_port
  const extId = (window as unknown as { __clearpath_extension_id?: string }).__clearpath_extension_id
  const componentName = (window as unknown as { __clearpath_component?: string }).__clearpath_component

  console.log(`[ClearPath:Renderer] bootstrap() called — port=${port ? 'present' : 'MISSING'}, extId=${extId ?? 'MISSING'}, componentName=${componentName ?? '(default)'}`)

  if (!port) {
    console.error('[ClearPath:Renderer] No MessagePort on window.__clearpath_port — cannot bootstrap. Is this running outside the ClearPathAI host?')
    return
  }
  if (!extId) {
    console.error('[ClearPath:Renderer] No extension ID on window.__clearpath_extension_id — cannot bootstrap.')
    return
  }

  // Build SDK client from the MessagePort
  const sdk = buildSDKClient(port, extId)

  // Call activate lifecycle
  console.log(`[ClearPath:Renderer] calling activate() for extension "${extId}"`)
  if (extension.activate) {
    Promise.resolve(extension.activate(sdk)).then(() => {
      console.log(`[ClearPath:Renderer] activate() resolved for extension "${extId}"`)
    }).catch((err) => {
      console.error('[ClearPath:Renderer] activate() failed:', err)
    })
  }

  // NOTE: ext:ready was already sent by the inline srcdoc onInit handler before
  // this bundle was even loaded. Do NOT send it again here — that would be a
  // duplicate that triggers a second ext:init from the host.

  // Determine which component to render
  const Component = extension.components[componentName || 'App'] || App

  // Mount React into the extension root element
  const rootEl =
    document.getElementById('ext-root') ||
    document.getElementById('root') ||
    document.body

  if (!rootEl) {
    console.error('[ClearPath:Renderer] Could not find #ext-root, #root, or document.body — cannot mount React')
    return
  }

  console.log(`[ClearPath:Renderer] mounting component "${componentName || 'App'}" into`, rootEl)
  const root = ReactDOM.createRoot(rootEl)
  root.render(
    React.createElement(
      ClearPathProvider,
      { sdk },
      React.createElement(Component),
    ),
  )
  console.log(`[ClearPath:Renderer] ReactDOM.createRoot().render() called for extension "${extId}"`)
})()

export default extension
