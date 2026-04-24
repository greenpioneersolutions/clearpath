import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { LoginCompleteEvent, LoginOutputEvent } from '../types/ipc'
import type { LoginBrowserOpenedEvent } from '../types/install'

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

/** Device code pattern like "ABCD-1234" that GitHub prints in login output. */
const DEVICE_CODE_RE = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/

export function LoginModal({ cli, isOpen, onClose }: Props): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<'running' | 'success' | 'failed' | 'cancelled'>('running')
  const [browserUrl, setBrowserUrl] = useState<string | null>(null)
  const [deviceCode, setDeviceCode] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useFocusTrap(panelRef, isOpen)

  // Scroll to bottom whenever new lines arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines, showDetails])

  // Start login + wire push-event listeners when modal opens
  useEffect(() => {
    if (!isOpen) return

    setLines([])
    setStatus('running')
    setBrowserUrl(null)
    setDeviceCode(null)
    setShowDetails(false)
    setCodeCopied(false)

    const cleanupOutput = window.electronAPI.on(
      'auth:login-output',
      (payload: LoginOutputEvent) => {
        if (payload.cli !== cli) return
        setLines((prev) => [...prev, payload.line])
        // Try to extract a device code (GitHub prints XXXX-XXXX)
        const m = payload.line.match(DEVICE_CODE_RE)
        if (m && !deviceCodeRef.current) {
          deviceCodeRef.current = m[1]
          setDeviceCode(m[1])
        }
      },
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
      },
    )

    const cleanupBrowser = window.electronAPI.on(
      'auth:login-browser-opened',
      (payload: LoginBrowserOpenedEvent) => {
        if (payload.cli !== cli) return
        setBrowserUrl(payload.url)
      },
    )

    // Fire the login IPC (non-blocking — output comes via push events)
    void window.electronAPI.invoke('auth:login-start', { cli })

    return () => {
      cleanupOutput()
      cleanupComplete()
      cleanupBrowser()
      deviceCodeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cli])

  // Local ref so the IPC handler captures the latest device code even before state commits
  const deviceCodeRef = useRef<string | null>(null)

  const handleCancel = () => {
    void window.electronAPI.invoke('auth:login-cancel')
    setStatus('cancelled')
    onClose()
  }

  const handleCopyCode = async () => {
    if (!deviceCode) return
    try {
      await navigator.clipboard.writeText(deviceCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      // Clipboard access may be denied — non-fatal
    }
  }

  const handleReopenBrowser = () => {
    if (!browserUrl) return
    void window.electronAPI.invoke('auth:open-external', { url: browserUrl })
  }

  if (!isOpen) return null

  // Show the friendly browser-opened panel when we've auto-opened the URL
  const showFriendlyPanel = status === 'running' && browserUrl !== null

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
            <p className="text-xs text-gray-500 mt-0.5">
              {showFriendlyPanel
                ? 'We opened your browser — sign in to finish.'
                : INSTRUCTIONS[cli]}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Body */}
        {showFriendlyPanel ? (
          <FriendlyBrowserPanel
            deviceCode={deviceCode}
            codeCopied={codeCopied}
            onCopyCode={handleCopyCode}
            onReopenBrowser={handleReopenBrowser}
          />
        ) : status === 'success' ? (
          <div className="px-6 py-8 text-center space-y-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1D9E75]/10 text-[#1D9E75]">
              <CheckIcon />
            </div>
            <p className="text-sm font-medium text-gray-900">You are signed in!</p>
          </div>
        ) : (
          /* Terminal view — used when no URL has been detected yet or on failure */
          <div
            ref={outputRef}
            role="log"
            aria-live="polite"
            className="h-64 overflow-y-auto bg-gray-950 px-4 py-3 font-mono text-xs leading-relaxed"
          >
            {lines.length === 0 ? (
              <span className="text-gray-500">Starting login process…</span>
            ) : (
              lines.map((line, i) => <OutputLine key={i} line={line} />)
            )}
            {status === 'running' && (
              <span className="inline-flex items-center gap-1 text-gray-500 mt-1">
                <span className="animate-pulse">▌</span>
              </span>
            )}
          </div>
        )}

        {/* Optional technical-details disclosure (only when friendly panel shown) */}
        {showFriendlyPanel && (
          <div className="px-6 pb-2">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <ChevronIcon open={showDetails} />
              {showDetails ? 'Hide technical details' : 'Show technical details'}
            </button>
            {showDetails && (
              <div
                ref={outputRef}
                role="log"
                aria-live="polite"
                className="mt-2 max-h-40 overflow-y-auto bg-gray-950 px-3 py-2 font-mono text-[11px] leading-relaxed rounded-md"
              >
                {lines.map((line, i) => <OutputLine key={i} line={line} />)}
              </div>
            )}
          </div>
        )}

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
          ) : showFriendlyPanel ? (
            <p className="text-xs text-gray-500">Waiting for you to sign in…</p>
          ) : (
            <p className="text-xs text-gray-400">Waiting for browser authentication…</p>
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

function FriendlyBrowserPanel({
  deviceCode,
  codeCopied,
  onCopyCode,
  onReopenBrowser,
}: {
  deviceCode: string | null
  codeCopied: boolean
  onCopyCode: () => void
  onReopenBrowser: () => void
}): JSX.Element {
  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 h-12 w-12 rounded-full bg-[#5B4FC4]/10 text-[#5B4FC4] flex items-center justify-center">
          <BrowserIcon />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900">We opened your browser</h3>
          <p className="text-sm text-gray-500 mt-1">
            Finish signing in there. This window will close automatically once you are authenticated.
          </p>
        </div>
      </div>

      {deviceCode && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Device code</p>
              <p className="text-lg font-mono font-semibold text-gray-900 mt-0.5">{deviceCode}</p>
            </div>
            <button
              onClick={onCopyCode}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors"
            >
              {codeCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onReopenBrowser}
        className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
      >
        Didn't see your browser open? Click here.
      </button>
    </div>
  )
}

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
            ),
          )
        : line}
    </div>
  )
}

function BrowserIcon(): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M3.6 9h16.8 M3.6 15h16.8 M12 3a15 15 0 010 18 M12 3a15 15 0 000 18"
      />
    </svg>
  )
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}
