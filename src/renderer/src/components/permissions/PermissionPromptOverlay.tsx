import { useEffect, useState, useCallback, useRef } from 'react'
import type { PermissionRequest, PermissionDecision, GrantScope } from '../../../../shared/permissions/types'

/**
 * App-wide modal that surfaces PermissionBroker tool-approval prompts wherever
 * the user is. ClearPath runs each turn headless, so the agent's write/shell/MCP
 * tool calls (anything the active policy gates) pause here until the user
 * answers — Allow once / Always this session / Deny / Always deny — which is sent
 * back via `permission:respond`. Read-only tools are auto-allowed by the broker
 * and never reach this modal.
 *
 * Requests queue; the oldest is shown first. Mounting recovers any in-flight
 * requests via `permission:list-pending` (e.g. after a renderer reload).
 */
export default function PermissionPromptOverlay(): JSX.Element | null {
  const [queue, setQueue] = useState<PermissionRequest[]>([])
  const offRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    void (window.electronAPI.invoke('permission:list-pending') as Promise<PermissionRequest[]>)
      .then((pending) => {
        if (Array.isArray(pending) && pending.length) {
          setQueue((prev) => dedupe([...prev, ...pending]))
        }
      })
      .catch(() => { /* broker not ready */ })

    offRef.current = window.electronAPI.on('cli:permission-request', (data: { request?: PermissionRequest }) => {
      const req = data?.request
      if (!req?.requestId) return // ignore legacy/non-broker shapes
      setQueue((prev) => (prev.some((r) => r.requestId === req.requestId) ? prev : [...prev, req]))
    })
    return () => { offRef.current?.(); offRef.current = null }
  }, [])

  const current = queue[0]

  const respond = useCallback(async (decision: PermissionDecision, remember?: GrantScope) => {
    if (!current) return
    setQueue((prev) => prev.filter((r) => r.requestId !== current.requestId))
    await window.electronAPI.invoke('permission:respond', { requestId: current.requestId, decision, remember })
  }, [current])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Tool permission request"
      data-testid="permission-overlay"
    >
      <div className="w-[440px] max-w-[92vw] rounded-2xl border border-amber-700/40 bg-gray-900 shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="w-9 h-9 rounded-full bg-amber-900/40 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-100">Allow this tool?</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {current.sessionName ?? 'Session'} · {current.cli} · gated by policy “{current.policyName}”
            </p>
          </div>
          {queue.length > 1 && (
            <span className="text-[10px] text-gray-500 flex-shrink-0">{queue.length - 1} more</span>
          )}
        </div>

        <div className="px-5 mt-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">{current.toolClass}</span>
            <span className="text-sm font-medium text-gray-100 truncate">{current.toolName}</span>
          </div>
          {current.inputPreview && (
            <pre className="text-xs text-gray-300 font-mono bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2 max-h-32 overflow-auto whitespace-pre-wrap break-words">{current.inputPreview}</pre>
          )}
        </div>

        <div className="px-5 py-4 mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => void respond('allow')}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Allow once
          </button>
          <button
            onClick={() => void respond('allow', 'session')}
            className="px-3 py-2 bg-green-900/40 hover:bg-green-900/60 text-green-200 text-sm font-medium rounded-lg transition-colors"
          >
            Always this session
          </button>
          <button
            onClick={() => void respond('deny')}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => void respond('deny', 'session')}
            className="px-3 py-2 bg-red-900/40 hover:bg-red-900/60 text-red-200 text-sm font-medium rounded-lg transition-colors"
          >
            Always deny
          </button>
        </div>
      </div>
    </div>
  )
}

function dedupe(list: PermissionRequest[]): PermissionRequest[] {
  const seen = new Set<string>()
  return list.filter((r) => (seen.has(r.requestId) ? false : (seen.add(r.requestId), true)))
}
