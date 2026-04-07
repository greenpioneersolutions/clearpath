import { useState, useEffect, useCallback, useRef } from 'react'
import type { ParsedOutput, SessionInfo } from '../../types/ipc'

interface PermissionRequest {
  id: string
  sessionId: string
  sessionName: string
  cli: 'copilot' | 'claude'
  description: string
  timestamp: number
  status: 'pending' | 'approved' | 'denied'
}

let requestCounter = 0

export default function PermissionRequestHandler(): JSX.Element {
  const [requests, setRequests] = useState<PermissionRequest[]>([])
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [autoApprove, setAutoApprove] = useState(false)
  const cleanupRef = useRef<Array<() => void>>([])

  // Load active sessions
  useEffect(() => {
    void (window.electronAPI.invoke('cli:list-sessions') as Promise<SessionInfo[]>).then((s) => {
      setSessions(s.filter((x) => x.status === 'running'))
    })
  }, [])

  // Listen for permission requests from CLI processes
  useEffect(() => {
    const offPermission = window.electronAPI.on(
      'cli:permission-request',
      (data: { sessionId: string; request: ParsedOutput }) => {
        const session = sessions.find((s) => s.sessionId === data.sessionId)
        const req: PermissionRequest = {
          id: `req-${++requestCounter}`,
          sessionId: data.sessionId,
          sessionName: session?.name ?? data.sessionId.slice(0, 8),
          cli: session?.cli ?? 'copilot',
          description: data.request.content,
          timestamp: Date.now(),
          status: 'pending',
        }

        if (autoApprove) {
          req.status = 'approved'
          // Send approval to CLI
          void window.electronAPI.invoke('cli:send-input', {
            sessionId: data.sessionId,
            input: 'y',
          })
        }

        setRequests((prev) => [req, ...prev])
      },
    )

    cleanupRef.current.push(offPermission)
    return () => {
      for (const off of cleanupRef.current) off()
      cleanupRef.current = []
    }
  }, [sessions, autoApprove])

  const respond = useCallback(async (req: PermissionRequest, approved: boolean) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: approved ? 'approved' : 'denied' } : r)),
    )
    await window.electronAPI.invoke('cli:send-input', {
      sessionId: req.sessionId,
      input: approved ? 'y' : 'n',
    })
  }, [])

  const clearResolved = () => {
    setRequests((prev) => prev.filter((r) => r.status === 'pending'))
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const resolved = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Permission Requests</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Intercept and respond to CLI tool permission prompts
          </p>
        </div>
        <div className="flex items-center gap-3">
          {resolved.length > 0 && (
            <button
              onClick={clearResolved}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Clear resolved
            </button>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-600">Auto-approve</span>
            <button
              onClick={() => setAutoApprove(!autoApprove)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                autoApprove ? 'bg-red-500' : 'bg-gray-300'
              }`}
              role="switch"
              aria-checked={autoApprove}
              aria-label="Toggle auto-approve"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  autoApprove ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {autoApprove && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-xs text-red-600">
          Auto-approve is enabled. All permission requests will be automatically approved.
        </div>
      )}

      {/* Pending requests */}
      {pending.length > 0 ? (
        <div className="space-y-2">
          {pending.map((req) => (
            <div
              key={req.id}
              className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-yellow-800">
                      {req.sessionName}
                    </span>
                    <span className="text-xs text-yellow-600">
                      ({req.cli})
                    </span>
                    <span className="text-xs text-yellow-500">
                      {new Date(req.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 font-mono break-all">{req.description}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => void respond(req, true)}
                    className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 transition-colors"
                  >
                    Allow
                  </button>
                  <button
                    onClick={() => void respond(req, false)}
                    className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 transition-colors"
                  >
                    Deny
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-400">No pending permission requests</p>
          <p className="text-xs text-gray-400 mt-1">
            Requests will appear here when a running session asks for tool approval
          </p>
        </div>
      )}

      {/* Resolved history */}
      {resolved.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            History ({resolved.length})
          </h4>
          <div className="space-y-1">
            {resolved.slice(0, 20).map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg text-xs"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  req.status === 'approved' ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <span className="text-gray-500 flex-shrink-0">{req.sessionName}</span>
                <span className="text-gray-700 font-mono truncate flex-1">{req.description}</span>
                <span className={`flex-shrink-0 ${
                  req.status === 'approved' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {req.status}
                </span>
                <span className="text-gray-400 flex-shrink-0">
                  {new Date(req.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
