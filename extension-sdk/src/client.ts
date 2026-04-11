import type { ExtensionSDK, ClearPathTheme } from './types'

/**
 * Creates an SDK client that communicates with the host app via MessagePort.
 * This runs inside the extension iframe.
 */
export function createSDKClient(port: MessagePort, extensionId: string): ExtensionSDK {
  let requestCounter = 0
  const pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const themeListeners = new Set<(theme: ClearPathTheme) => void>()
  const eventListeners = new Map<string, Set<(data: unknown) => void>>()

  // Listen for responses and events from the host
  port.onmessage = (event: MessageEvent) => {
    const data = event.data
    if (!data || typeof data !== 'object') return

    if (data.type === 'ext:response') {
      const pending = pendingRequests.get(data.id)
      if (pending) {
        pendingRequests.delete(data.id)
        if (data.error) {
          pending.reject(new Error(data.error.message ?? 'SDK call failed'))
        } else {
          pending.resolve(data.result)
        }
      }
    }

    if (data.type === 'ext:event') {
      // Dispatch to general event listeners
      const listeners = eventListeners.get(data.event)
      if (listeners) {
        for (const listener of listeners) {
          try {
            listener(data.data)
          } catch {
            // Don't let listener errors break the event loop
          }
        }
      }

      // Backward compat: theme-changed still fires theme listeners
      if (data.event === 'theme-changed') {
        for (const listener of themeListeners) {
          listener(data.data as ClearPathTheme)
        }
      }
    }
  }

  function request(method: string, params?: unknown): Promise<unknown> {
    const id = `req-${++requestCounter}`
    return new Promise((resolve, reject) => {
      // Timeout after 30 seconds
      const timer = setTimeout(() => {
        pendingRequests.delete(id)
        reject(new Error(`SDK call "${method}" timed out after 30s`))
      }, 30000)

      pendingRequests.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })

      port.postMessage({ type: 'ext:request', id, method, params })
    })
  }

  function unwrapResult(result: unknown): unknown {
    if (result && typeof result === 'object' && 'success' in result) {
      const r = result as { success: boolean; data?: unknown; error?: string }
      if (!r.success) throw new Error(r.error ?? 'Operation failed')
      return r.data
    }
    return result
  }

  const sdk: ExtensionSDK = {
    extensionId,

    github: {
      listRepos: async (opts) => unwrapResult(await request('github.listRepos', opts)) as unknown[],
      listPulls: async (owner, repo, opts) =>
        unwrapResult(await request('github.listPulls', { owner, repo, ...opts })) as unknown[],
      getPull: async (owner, repo, pullNumber) =>
        unwrapResult(await request('github.getPull', { owner, repo, pullNumber })),
      listIssues: async (owner, repo, opts) =>
        unwrapResult(await request('github.listIssues', { owner, repo, ...opts })) as unknown[],
      search: async (query, type) =>
        unwrapResult(await request('github.search', { query, type })) as unknown[],
    },

    notifications: {
      emit: async (opts) => {
        unwrapResult(await request('notifications.emit', opts))
      },
    },

    storage: {
      get: async <T = unknown>(key: string) =>
        unwrapResult(await request('storage.get', { key })) as T | undefined,
      set: async (key, value) => {
        unwrapResult(await request('storage.set', { key, value }))
      },
      delete: async (key) => {
        unwrapResult(await request('storage.delete', { key }))
      },
      keys: async () => unwrapResult(await request('storage.keys')) as string[],
      quota: async () =>
        unwrapResult(await request('storage.quota')) as { used: number; limit: number },
    },

    env: {
      get: async (key) => unwrapResult(await request('env.get', { key })) as string | undefined,
      keys: async () => unwrapResult(await request('env.keys')) as string[],
    },

    http: {
      fetch: async (url, opts) =>
        unwrapResult(await request('http.fetch', { url, ...opts })) as {
          status: number
          headers: Record<string, string>
          body: string
        },
    },

    theme: {
      get: async () => unwrapResult(await request('theme.get')) as ClearPathTheme,
      onChange: (callback) => {
        themeListeners.add(callback)
        return () => themeListeners.delete(callback)
      },
    },

    sessions: {
      list: async () =>
        unwrapResult(await request('sessions.list')) as Awaited<ReturnType<ExtensionSDK['sessions']['list']>>,
      getMessages: async (sessionId) =>
        unwrapResult(await request('sessions.getMessages', { sessionId })) as Awaited<
          ReturnType<ExtensionSDK['sessions']['getMessages']>
        >,
      getActive: async () => unwrapResult(await request('sessions.getActive')) as string | null,
    },

    cost: {
      summary: async () =>
        unwrapResult(await request('cost.summary')) as Awaited<ReturnType<ExtensionSDK['cost']['summary']>>,
      list: async (opts) =>
        unwrapResult(await request('cost.list', opts)) as Awaited<ReturnType<ExtensionSDK['cost']['list']>>,
      getBudget: async () =>
        unwrapResult(await request('cost.getBudget')) as Awaited<ReturnType<ExtensionSDK['cost']['getBudget']>>,
      bySession: async (opts) =>
        unwrapResult(await request('cost.bySession', opts)) as Awaited<
          ReturnType<ExtensionSDK['cost']['bySession']>
        >,
    },

    featureFlags: {
      getAll: async () => unwrapResult(await request('featureFlags.getAll')) as Record<string, boolean>,
      get: async (key) => unwrapResult(await request('featureFlags.get', { key })) as boolean,
      set: async (key, value) => {
        unwrapResult(await request('featureFlags.set', { key, value }))
      },
    },

    localModels: {
      detect: async () =>
        unwrapResult(await request('localModels.detect')) as Awaited<
          ReturnType<ExtensionSDK['localModels']['detect']>
        >,
      chat: async (opts) =>
        unwrapResult(await request('localModels.chat', opts)) as { content: string },
    },

    context: {
      estimateTokens: async (text) =>
        unwrapResult(await request('context.estimateTokens', { text })) as {
          tokens: number
          method: 'heuristic'
        },
    },

    events: {
      on: (event: string, callback: (data: unknown) => void) => {
        // Register subscription with host
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

    navigate: async (path) => {
      unwrapResult(await request('navigate', { path }))
    },
  }

  return sdk
}
