import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { LoginCompleteEvent, LoginOutputEvent } from '../types/ipc'

interface Props {
  cli: 'copilot' | 'claude'
  isOpen: boolean
  onClose: () => void
}

const CLI_LABELS = {
  copilot: 'GitHub Copilot',
  claude: 'Claude Code',
}

const INSTRUCTIONS = {
  copilot:
    'Follow the link or device code below in your browser to authenticate with GitHub.',
  claude:
    'Follow the URL below in your browser to authenticate with Anthropic.',
}

export function LoginModal({ cli, isOpen, onClose }: Props): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<'running' | 'success' | 'failed' | 'cancelled'>('running')
  const outputRef = useRef<HTMLDivElement>(null)
  const hasStarted = useRef(false)

  useFocusTrap(panelRef, isOpen)

  // Scroll to bottom whenever new lines arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  // Start login + wire push-event listeners when modal opens
  useEffect(() => {
    if (!isOpen) return

    setLines([])
    setStatus('running')
    hasStarted.current = false

    const cleanupOutput = window.electronAPI.on(
      'auth:login-output',
      (payload: LoginOutputEvent) => {
        if (payload.cli !== cli) return
        setLines((prev) => [...prev, payload.line])
      }
    )

    const cleanupComplete = window.electronAPI.on(
      'auth:login-complete',
      (payload: LoginCompleteEvent) => {
        if (payload.cli !== cli) return
        setStatus(payload.success ? 'success' : 'failed')
        if (payload.success) {
          // Auto-close after 2 s on success
          setTimeout(onClose, 2000)
        }
      }
    )

    // Fire the login IPC (non-blocking — output comes via push events)
    void window.electronAPI.invoke('auth:login-start', { cli })
    hasStarted.current = true

    return () => {
      cleanupOutput()
      cleanupComplete()
    }
  }, [isOpen, cli]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = () => {
    void window.electronAPI.invoke('auth:login-cancel')
    setStatus('cancelled')
    onClose()
  }

  if (!isOpen) return null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel()
      }}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 id="login-title" className="text-base font-semibold text-gray-900">
              Connect {CLI_LABELS[cli]}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{INSTRUCTIONS[cli]}</p>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Output stream */}
        <div
          ref={outputRef}
          role="log"
          aria-live="polite"
          className="h-64 overflow-y-auto bg-gray-950 px-4 py-3 font-mono text-xs leading-relaxed"
        >
          {lines.length === 0 ? (
            <span className="text-gray-500">Starting login process…</span>
          ) : (
            lines.map((line, i) => (
              <OutputLine key={i} line={line} />
            ))
          )}
          {status === 'running' && (
            <span className="inline-flex items-center gap-1 text-gray-500 mt-1">
              <span className="animate-pulse">▌</span>
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {status === 'success' ? (
            <p className="text-sm text-green-600 font-medium flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Authenticated! Closing…
            </p>
          ) : status === 'failed' ? (
            <p className="text-sm text-red-600">Authentication failed.</p>
          ) : status === 'cancelled' ? (
            <p className="text-sm text-gray-500">Cancelled.</p>
          ) : (
            <p className="text-xs text-gray-400">
              Waiting for browser authentication…
            </p>
          )}

          <div className="flex gap-2 flex-shrink-0">
            {status === 'running' && (
              <button
                onClick={handleCancel}
                aria-label="Cancel login"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            )}
            {(status === 'failed' || status === 'cancelled') && (
              <button
                onClick={onClose}
                aria-label="Close login dialog"
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({
  status,
}: {
  status: 'running' | 'success' | 'failed' | 'cancelled'
}): JSX.Element {
  const map = {
    running: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
  }
  const labels = {
    running: 'In progress',
    success: 'Success',
    failed: 'Failed',
    cancelled: 'Cancelled',
  }
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${map[status]}`}>
      {status === 'running' && (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse mr-1.5" />
      )}
      {labels[status]}
    </span>
  )
}

function OutputLine({ line }: { line: string }): JSX.Element {
  // Highlight URLs so users can see them clearly
  const urlRe = /https?:\/\/[^\s]+/g
  const parts: Array<{ text: string; isUrl: boolean }> = []
  let last = 0
  let match: RegExpExecArray | null

  while ((match = urlRe.exec(line)) !== null) {
    if (match.index > last) parts.push({ text: line.slice(last, match.index), isUrl: false })
    parts.push({ text: match[0], isUrl: true })
    last = match.index + match[0].length
  }
  if (last < line.length) parts.push({ text: line.slice(last), isUrl: false })

  // Detect device code pattern (e.g. XXXX-XXXX)
  const isCodeLine = /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/.test(line)

  return (
    <div className={`${isCodeLine ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>
      {parts.length > 0
        ? parts.map((part, i) =>
            part.isUrl ? (
              <span key={i} className="text-cyan-400 underline underline-offset-2">
                {part.text}
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )
        : line}
    </div>
  )
}
