import { useState, useEffect, useCallback, useRef } from 'react'
import type { PermissionRequest, PermissionDecision, GrantScope } from '../../../../shared/permissions/types'

interface TrackedRequest extends PermissionRequest {
  status: 'pending' | 'approved' | 'denied'
}

export default function PermissionRequestHandler(): JSX.Element {
  const [requests, setRequests] = useState<TrackedRequest[]>([])
  const cleanupRef = useRef<Array<() => void>>([])

  // Recover any requests that are already waiting (modal mounted mid-flight),
  // then listen for new ones from the PermissionBroker.
  useEffect(() => {
    void (window.electronAPI.invoke('permission:list-pending') as Promise<PermissionRequest[]>)
      .then((pending) => {
        if (Array.isArray(pending) && pending.length) {
          setRequests((prev) => mergePending(prev, pending))
        }
      })
      .catch(() => { /* broker not ready — ignore */ })

    const off = window.electronAPI.on('cli:permission-request', (data: { request?: PermissionRequest }) => {
      const req = data?.request
      if (!req?.requestId) return // ignore legacy/non-broker shapes
      setRequests((prev) => (prev.some((r) => r.requestId === req.requestId) ? prev : [{ ...req, status: 'pending' }, ...prev]))
    })
    cleanupRef.current.push(off)
    return () => { for (const c of cleanupRef.current) c(); cleanupRef.current = [] }
  }, [])

  const respond = useCallback(async (req: TrackedRequest, decision: PermissionDecision, remember?: GrantScope) => {
    try {
      // Only mark the request resolved once the broker accepts the response. If
      // the IPC throws (broker crash / transient error) the broker is still
      // waiting, so we leave it pending rather than falsely showing it resolved.
      await window.electronAPI.invoke('permission:respond', { requestId: req.requestId, decision, remember })
      setRequests((prev) =>
        prev.map((r) => (r.requestId === req.requestId ? { ...r, status: decision === 'allow' ? 'approved' : 'denied' } : r)),
      )
    } catch {
      /* leave pending for retry */
    }
  }, [])

  const clearResolved = () => setRequests((prev) => prev.filter((r) => r.status === 'pending'))

  const pending = requests.filter((r) => r.status === 'pending')
  const resolved = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Permission requests</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Approve or deny the tools your agents want to use. Defaults follow your active policy.
          </p>
        </div>
        {resolved.length > 0 && (
          <button onClick={clearResolved} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            Clear resolved
          </button>
        )}
      </div>

      {pending.length > 0 ? (
        <div className="space-y-2">
          {pending.map((req) => (
            <div key={req.requestId} className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-medium text-yellow-800">{req.sessionName ?? req.sessionId.slice(0, 8)}</span>
                <span className="text-xs text-yellow-600">({req.cli})</span>
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-yellow-200 text-yellow-800">{req.toolClass}</span>
                <span className="text-xs text-yellow-500">{new Date(req.timestamp).toLocaleTimeString()}</span>
                <span className="text-[10px] text-yellow-500 ml-auto">policy: {req.policyName}</span>
              </div>
              <p className="text-sm text-gray-900 font-medium">{req.toolName}</p>
              {req.inputPreview && (
                <p className="text-xs text-gray-600 font-mono break-all mt-0.5">{req.inputPreview}</p>
              )}
              <div className="flex gap-2 flex-wrap mt-2">
                <button onClick={() => void respond(req, 'allow')} className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 transition-colors">Allow once</button>
                <button onClick={() => void respond(req, 'allow', 'session')} className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-md hover:bg-green-200 transition-colors">Always this session</button>
                <button onClick={() => void respond(req, 'deny')} className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 transition-colors">Deny</button>
                <button onClick={() => void respond(req, 'deny', 'session')} className="px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-md hover:bg-red-200 transition-colors">Always deny</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-400">No pending permission requests</p>
          <p className="text-xs text-gray-400 mt-1">Requests appear here when an agent asks to use a tool your policy gates.</p>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">History ({resolved.length})</h4>
          <div className="space-y-1">
            {resolved.slice(0, 20).map((req) => (
              <div key={req.requestId} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${req.status === 'approved' ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-gray-500 flex-shrink-0">{req.sessionName ?? req.sessionId.slice(0, 8)}</span>
                <span className="text-gray-700 font-mono truncate flex-1">{req.toolName}</span>
                <span className={`flex-shrink-0 ${req.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>{req.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function mergePending(prev: TrackedRequest[], pending: PermissionRequest[]): TrackedRequest[] {
  const have = new Set(prev.map((r) => r.requestId))
  const fresh = pending.filter((p) => !have.has(p.requestId)).map((p) => ({ ...p, status: 'pending' as const }))
  return [...fresh, ...prev]
}
