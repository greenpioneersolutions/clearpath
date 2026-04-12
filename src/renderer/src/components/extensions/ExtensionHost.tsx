import { useRef, useEffect, useState, useCallback } from 'react'
import type { InstalledExtension } from '../../hooks/useExtensions'

/** Events that extensions can subscribe to via sdk.events.on() */
const EVENT_PERMISSION_MAP: Record<string, string> = {
  'session:started': 'sessions:lifecycle',
  'session:stopped': 'sessions:lifecycle',
  'turn:started': 'sessions:lifecycle',
  'turn:ended': 'sessions:lifecycle',
  'cost:recorded': 'cost:read',
  'budget:alert': 'cost:read',
  'slot:data-changed': '', // no permission needed — it's slot context
}

interface ExtensionHostProps {
  extension: InstalledExtension
  className?: string
  /** Dynamic data from the host page slot, forwarded to the extension as 'slot:data-changed' events. */
  slotData?: Record<string, unknown>
}

/**
 * Renders an extension inside a sandboxed iframe using the clearpath-ext:// protocol.
 * Manages the MessageChannel for SDK communication and handles error containment.
 */
export default function ExtensionHost({ extension, className, slotData }: ExtensionHostProps): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const portRef = useRef<MessagePort | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const subscribedEventsRef = useRef<Set<string>>(new Set())

  const extId = extension.manifest.id

  // Forward extension events from the main process to the iframe
  const forwardEvent = useCallback(
    (event: string, data: unknown) => {
      const port = portRef.current
      if (!port) return
      if (!subscribedEventsRef.current.has(event)) return
      port.postMessage({ type: 'ext:event', event, data })
    },
    [],
  )

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    // Create a MessageChannel for private communication with this extension
    const channel = new MessageChannel()
    portRef.current = channel.port1

    // Listen for messages from the extension
    channel.port1.onmessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      switch (data.type) {
        case 'ext:ready':
          setLoaded(true)
          // Send init event with theme and config
          channel.port1.postMessage({
            type: 'ext:init',
            theme: {
              // Will be populated from BrandingContext in a future pass
              primary: '#5B4FC4',
              sidebar: '#1e1b4b',
              accent: '#1D9E75',
              isDark: true,
            },
            extensionId: extId,
          })
          break

        case 'ext:activated':
          // Extension has finished its activate() lifecycle
          break

        case 'ext:request':
          handleSdkRequest(data)
          break

        case 'ext:error':
          handleExtensionError(data.error)
          break

        default:
          break
      }
    }

    // Transfer port2 to the iframe once it loads
    const onLoad = () => {
      iframe.contentWindow?.postMessage(
        { type: 'ext:port', extensionId: extId },
        '*',
        [channel.port2],
      )
    }

    iframe.addEventListener('load', onLoad)

    // Listen for extension events forwarded from the main process
    const handleExtEvent = (_e: unknown, payload: { event: string; data: unknown }) => {
      if (payload?.event) {
        forwardEvent(payload.event, payload.data)
      }
    }

    // Listen for CLI lifecycle events and forward to subscribed extensions
    const handleTurnStart = (_e: unknown, data: unknown) => forwardEvent('turn:started', data)
    const handleTurnEnd = (_e: unknown, data: unknown) => forwardEvent('turn:ended', data)
    const handleCliExit = (_e: unknown, data: unknown) => forwardEvent('session:stopped', data)

    const unsubExtEvent = window.electronAPI.on('extension:event', handleExtEvent)
    const unsubTurnStart = window.electronAPI.on('cli:turn-start', handleTurnStart)
    const unsubTurnEnd = window.electronAPI.on('cli:turn-end', handleTurnEnd)
    const unsubCliExit = window.electronAPI.on('cli:exit', handleCliExit)

    return () => {
      iframe.removeEventListener('load', onLoad)
      channel.port1.close()
      portRef.current = null
      subscribedEventsRef.current.clear()
      unsubExtEvent()
      unsubTurnStart()
      unsubTurnEnd()
      unsubCliExit()
    }
  }, [extId, forwardEvent])

  // Forward slotData changes to the extension
  useEffect(() => {
    if (!slotData || !portRef.current) return
    portRef.current.postMessage({
      type: 'ext:event',
      event: 'slot:data-changed',
      data: slotData,
    })
  }, [slotData])

  /**
   * Route SDK requests from the extension through permission-checked IPC calls.
   */
  async function handleSdkRequest(request: { id: string; method: string; params: unknown }) {
    const port = portRef.current
    if (!port) return

    try {
      let result: unknown

      switch (request.method) {
        // ── Storage ─────────────────────────────────────────────────────
        case 'storage.get':
          result = await window.electronAPI.invoke('extension:storage-get', {
            extensionId: extId,
            key: (request.params as { key: string }).key,
          })
          break

        case 'storage.set':
          result = await window.electronAPI.invoke('extension:storage-set', {
            extensionId: extId,
            ...(request.params as { key: string; value: unknown }),
          })
          break

        case 'storage.delete':
          result = await window.electronAPI.invoke('extension:storage-delete', {
            extensionId: extId,
            key: (request.params as { key: string }).key,
          })
          break

        case 'storage.keys':
          result = await window.electronAPI.invoke('extension:storage-keys', { extensionId: extId })
          break

        case 'storage.quota':
          result = await window.electronAPI.invoke('extension:storage-quota', { extensionId: extId })
          break

        // ── Notifications ───────────────────────────────────────────────
        case 'notifications.emit':
          result = await window.electronAPI.invoke('extension:notify', {
            extensionId: extId,
            ...(request.params as { title: string; message: string; severity?: string }),
          })
          break

        // ── GitHub integration proxy ────────────────────────────────────
        case 'github.listRepos':
          result = await window.electronAPI.invoke(
            'integration:github-repos',
            request.params ?? {},
          )
          break

        case 'github.listPulls':
          result = await window.electronAPI.invoke(
            'integration:github-pulls',
            request.params ?? {},
          )
          break

        case 'github.getPull':
          result = await window.electronAPI.invoke(
            'integration:github-pull-detail',
            request.params ?? {},
          )
          break

        case 'github.listIssues':
          result = await window.electronAPI.invoke(
            'integration:github-issues',
            request.params ?? {},
          )
          break

        case 'github.search':
          result = await window.electronAPI.invoke(
            'integration:github-search',
            request.params ?? {},
          )
          break

        // ── Sessions ────────────────────────────────────────────────────
        case 'sessions.list':
          result = await window.electronAPI.invoke('cli:list-sessions')
          break
        case 'sessions.getMessages':
          result = await window.electronAPI.invoke(
            'cli:get-message-log',
            (request.params as { sessionId: string }).sessionId,
          )
          break
        case 'sessions.getActive':
          result = null // Will be tracked by active session state
          break

        // ── Cost ────────────────────────────────────────────────────────
        case 'cost.summary':
          result = await window.electronAPI.invoke('cost:summary')
          break
        case 'cost.list':
          result = await window.electronAPI.invoke('cost:list', request.params)
          break
        case 'cost.getBudget':
          result = await window.electronAPI.invoke('cost:get-budget')
          break
        case 'cost.bySession':
          result = await window.electronAPI.invoke('cost:by-session', request.params)
          break

        // ── Feature Flags ───────────────────────────────────────────────
        case 'featureFlags.getAll':
          result = (await window.electronAPI.invoke('feature-flags:get') as { flags: Record<string, boolean> }).flags
          break
        case 'featureFlags.get': {
          const flags = (await window.electronAPI.invoke('feature-flags:get') as { flags: Record<string, boolean> }).flags
          result = flags[(request.params as { key: string }).key] ?? false
          break
        }
        case 'featureFlags.set': {
          const { key, value } = request.params as { key: string; value: boolean }
          result = await window.electronAPI.invoke('feature-flags:set', { [key]: value })
          break
        }

        // ── Local Models ────────────────────────────────────────────────
        case 'localModels.detect':
          result = await window.electronAPI.invoke('local-models:detect')
          break
        case 'localModels.chat':
          result = await window.electronAPI.invoke('local-models:chat', request.params)
          break

        // ── Context ─────────────────────────────────────────────────────
        case 'context.estimateTokens': {
          const { text } = request.params as { text: string }
          result = { tokens: Math.ceil(text.length / 4), method: 'heuristic' }
          break
        }

        // ── Theme ───────────────────────────────────────────────────────
        case 'theme.get':
          result = { primary: '#5B4FC4', sidebar: '#1e1b4b', accent: '#1D9E75', isDark: true }
          break

        // ── Navigation ──────────────────────────────────────────────────
        case 'navigate':
          // Extension can navigate the host app
          window.location.hash = (request.params as { path: string }).path
          result = { success: true }
          break

        // ── Environment ─────────────────────────────────────────────────
        case 'env.get':
          result = undefined // env vars not exposed to renderer extensions
          break
        case 'env.keys':
          result = []
          break

        // ── HTTP fetch ──────────────────────────────────────────────────
        case 'http.fetch':
          result = { success: false, error: 'HTTP fetch not available in renderer context' }
          break

        // ── Events ──────────────────────────────────────────────────────
        case 'events.subscribe': {
          const eventName = (request.params as { event: string }).event
          const requiredPerm = EVENT_PERMISSION_MAP[eventName]
          if (requiredPerm === undefined) {
            result = { success: false, error: `Unknown event: ${eventName}` }
          } else {
            subscribedEventsRef.current.add(eventName)
            result = { success: true }
          }
          break
        }
        case 'events.unsubscribe': {
          const eventName = (request.params as { event: string }).event
          subscribedEventsRef.current.delete(eventName)
          result = { success: true }
          break
        }

        // ── Extension's own IPC channels (main process handlers) ────────
        default: {
          // If the method starts with the extension's namespace, forward as IPC
          const ns = extension.manifest.ipcNamespace
          if (ns && request.method.startsWith(ns + ':')) {
            result = await window.electronAPI.invoke(request.method, request.params)
          } else {
            result = {
              success: false,
              error: `Unknown SDK method: ${request.method}`,
            }
          }
          break
        }
      }

      port.postMessage({ type: 'ext:response', id: request.id, result })
    } catch (err) {
      port.postMessage({
        type: 'ext:response',
        id: request.id,
        error: { code: 'SDK_ERROR', message: String(err) },
      })
    }
  }

  /**
   * Handle errors reported by the extension iframe.
   */
  async function handleExtensionError(errorInfo: { message: string }) {
    const msg = errorInfo?.message ?? 'Unknown extension error'
    setError(msg)

    // Report to main process for error counting and potential auto-disable
    await window.electronAPI.invoke('extension:record-error', {
      extensionId: extId,
      error: msg,
    })
  }

  // Build the srcdoc that loads the extension's renderer bundle
  const rendererEntry = extension.manifest.renderer
  const srcdoc = rendererEntry
    ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src clearpath-ext: 'unsafe-inline'; style-src clearpath-ext: 'unsafe-inline'; img-src clearpath-ext: data:; connect-src 'none';">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: transparent; color: #e2e8f0; }
  </style>
</head>
<body>
  <div id="ext-root"></div>
  <script>
    // Wait for the host to transfer the MessagePort
    window.addEventListener('message', function onInit(event) {
      if (event.data?.type !== 'ext:port') return;
      window.removeEventListener('message', onInit);

      const port = event.ports[0];
      if (!port) return;

      // Make port available globally for the extension SDK
      window.__clearpath_port = port;
      window.__clearpath_extension_id = event.data.extensionId;

      // Signal ready to host
      port.postMessage({ type: 'ext:ready' });

      // Global error handler — forward to host
      window.onerror = function(message, source, lineno, colno) {
        port.postMessage({
          type: 'ext:error',
          error: { message: String(message), source: source, lineno: lineno, colno: colno }
        });
      };
    });
  </script>
  <script src="clearpath-ext://${extId}/${rendererEntry}"></script>
</body>
</html>`
    : null

  if (!rendererEntry) {
    // Extension has no renderer — skip silently. It may still have main process
    // handlers and manifest contributions, just no iframe-based UI.
    return null
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      {error && (
        <div className="absolute top-0 left-0 right-0 bg-red-900/80 text-red-200 text-xs px-3 py-1.5 z-10 flex items-center justify-between">
          <span>Extension error: {error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-300 hover:text-white ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-5">
          <div className="text-gray-400 text-sm">Loading {extension.manifest.name}...</div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={srcdoc ?? ''}
        className="w-full h-full border-0"
        title={`Extension: ${extension.manifest.name}`}
      />
    </div>
  )
}
