import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type {
  InstallCompleteEvent,
  InstallError,
  InstallOutputEvent,
  InstallStage,
  InstallTarget,
  NodeCheckResult,
} from '../types/install'

interface Props {
  cli: 'copilot' | 'claude'
  isOpen: boolean
  onClose: () => void
  /** Called after the CLI install succeeds — parent chains into LoginModal. */
  onInstalled?: () => void
}

const CLI_LABELS = {
  copilot: 'GitHub Copilot',
  claude: 'Claude Code',
}

const CLI_TARGETS: Record<'copilot' | 'claude', InstallTarget> = {
  copilot: 'copilot',
  claude: 'claude',
}

export function InstallModal({ cli, isOpen, onClose, onInstalled }: Props): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, isOpen)

  const [stage, setStage] = useState<InstallStage>('idle')
  const [lines, setLines] = useState<string[]>([])
  const [nodeInfo, setNodeInfo] = useState<NodeCheckResult | null>(null)
  const [errorInfo, setErrorInfo] = useState<InstallError | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const cliTarget = CLI_TARGETS[cli]

  // Scroll output to bottom whenever new lines arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  // Subscribe to install events — scoped to the CURRENT target so we can handle
  // both `node` install output and `cli` install output from the same modal.
  useEffect(() => {
    if (!isOpen) return

    const cleanupOutput = window.electronAPI.on(
      'auth:install-output',
      (payload: InstallOutputEvent) => {
        // Accept lines for either this CLI or the node-prereq step
        if (payload.target === cliTarget || payload.target === 'node') {
          setLines((prev) => [...prev.slice(-200), payload.line])
        }
      },
    )

    const cleanupComplete = window.electronAPI.on(
      'auth:install-complete',
      (payload: InstallCompleteEvent) => {
        if (payload.target === 'node') {
          if (payload.success) {
            // Node install finished — re-check Node, then proceed to CLI install
            setStage('checking-node')
            void recheckNode()
          } else {
            setStage('error')
            setErrorInfo(payload.error ?? null)
          }
        } else if (payload.target === cliTarget) {
          if (payload.success) {
            setStage('verifying')
            // Small delay so user sees "Verifying…", then success
            setTimeout(() => setStage('success'), 500)
          } else {
            setStage('error')
            setErrorInfo(payload.error ?? null)
          }
        }
      },
    )

    // Kick off the flow
    void startFlow()

    return () => {
      cleanupOutput()
      cleanupComplete()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cli])

  const startFlow = async () => {
    setLines([])
    setErrorInfo(null)
    setStage('checking-node')
    const result = (await window.electronAPI.invoke('auth:check-node')) as NodeCheckResult
    setNodeInfo(result)
    if (result.installed && result.satisfies22) {
      // Jump straight to CLI install
      startCliInstall()
    } else {
      setStage('node-needed')
    }
  }

  const recheckNode = async () => {
    const result = (await window.electronAPI.invoke('auth:check-node', { forceRefresh: true })) as NodeCheckResult
    setNodeInfo(result)
    if (result.installed && result.satisfies22) {
      startCliInstall()
    } else {
      setStage('node-needed')
    }
  }

  const startCliInstall = () => {
    setStage('installing-cli')
    void window.electronAPI.invoke('auth:install-start', { cli })
  }

  const handleInstallNodeManaged = () => {
    setStage('installing-node')
    setLines([])
    void window.electronAPI.invoke('auth:install-node-managed')
  }

  const handleOpenNodeJsOrg = () => {
    void window.electronAPI.invoke('auth:open-external', { url: 'https://nodejs.org/' })
  }

  const handleCancel = () => {
    // Cancel whichever target is currently running
    if (stage === 'installing-cli') {
      void window.electronAPI.invoke('auth:install-cancel', { target: cliTarget })
    } else if (stage === 'installing-node') {
      void window.electronAPI.invoke('auth:install-cancel', { target: 'node' })
    }
    onClose()
  }

  const handleConnect = () => {
    onInstalled?.()
  }

  const handleRetry = () => {
    setErrorInfo(null)
    void startFlow()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 id="install-title" className="text-base font-semibold text-gray-900">
              Install {CLI_LABELS[cli]}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {stage === 'success'
                ? 'All set — you can connect your account now.'
                : 'We will install everything you need in one step.'}
            </p>
          </div>
          <StageBadge stage={stage} />
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {stage === 'checking-node' && (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Spinner />
              <span>Checking your computer for Node.js…</span>
            </div>
          )}

          {stage === 'node-needed' && (
            <NodeNeededPanel
              nodeInfo={nodeInfo}
              platform={nodeInfo?.platform ?? 'other'}
              onInstall={handleInstallNodeManaged}
              onOpenWebsite={handleOpenNodeJsOrg}
            />
          )}

          {(stage === 'installing-node' || stage === 'installing-cli') && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-800">
                <Spinner />
                <span>
                  {stage === 'installing-node'
                    ? 'Installing Node.js — this can take a couple of minutes…'
                    : `Installing ${CLI_LABELS[cli]}…`}
                </span>
              </div>
              <DetailsDisclosure
                open={showDetails}
                onToggle={() => setShowDetails((v) => !v)}
                outputRef={outputRef}
                lines={lines}
              />
            </div>
          )}

          {stage === 'verifying' && (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Spinner />
              <span>Verifying the install…</span>
            </div>
          )}

          {stage === 'success' && (
            <div className="text-center py-4 space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1D9E75]/10 text-[#1D9E75]">
                <CheckIcon />
              </div>
              <h3 className="text-base font-semibold text-gray-900">
                {CLI_LABELS[cli]} is installed
              </h3>
              <p className="text-sm text-gray-500">
                Next up: sign in to finish connecting your account.
              </p>
            </div>
          )}

          {stage === 'error' && errorInfo && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <ErrorIcon />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-800">{errorInfo.message}</p>
                  <p className="text-xs text-red-600 mt-1">{errorInfo.hint}</p>
                </div>
              </div>
              <DetailsDisclosure
                open={showDetails}
                onToggle={() => setShowDetails((v) => !v)}
                outputRef={outputRef}
                lines={lines}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          {(stage === 'installing-node' || stage === 'installing-cli') && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}

          {stage === 'node-needed' && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Close
            </button>
          )}

          {stage === 'error' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 text-sm bg-[#5B4FC4] text-white rounded-lg hover:bg-[#4a3fb3] transition-colors"
              >
                Try again
              </button>
            </>
          )}

          {stage === 'success' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleConnect}
                className="px-4 py-2 text-sm bg-[#1D9E75] text-white rounded-lg hover:bg-[#178a65] transition-colors"
              >
                Connect your account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface NodeNeededPanelProps {
  nodeInfo: NodeCheckResult | null
  platform: NodeCheckResult['platform']
  onInstall: () => void
  onOpenWebsite: () => void
}

function NodeNeededPanel({
  nodeInfo,
  platform,
  onInstall,
  onOpenWebsite,
}: NodeNeededPanelProps): JSX.Element {
  const canManagedInstall = platform === 'darwin' || platform === 'win32'
  const reason = !nodeInfo?.installed
    ? "Your computer needs Node.js to run the CLI. We can install it for you."
    : `Your Node.js version (v${nodeInfo.version ?? 'unknown'}) is too old — we need v22 or newer.`

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <InfoIcon />
        <div>
          <p className="text-sm font-medium text-amber-800">Node.js is needed first</p>
          <p className="text-xs text-amber-700 mt-1">{reason}</p>
        </div>
      </div>

      {canManagedInstall ? (
        <div className="space-y-3">
          <button
            onClick={onInstall}
            className="w-full px-4 py-3 bg-[#5B4FC4] text-white rounded-lg text-sm font-semibold hover:bg-[#4a3fb3] transition-colors"
          >
            Install Node.js for me
          </button>
          <button
            onClick={onOpenWebsite}
            className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg transition-colors"
          >
            Or open nodejs.org
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Automatic install is not available on this platform. Please install Node.js 22 or newer manually.
          </p>
          <button
            onClick={onOpenWebsite}
            className="w-full px-4 py-2 text-sm bg-[#5B4FC4] text-white rounded-lg hover:bg-[#4a3fb3] transition-colors"
          >
            Open nodejs.org
          </button>
        </div>
      )}
    </div>
  )
}

function DetailsDisclosure({
  open,
  onToggle,
  outputRef,
  lines,
}: {
  open: boolean
  onToggle: () => void
  outputRef: React.RefObject<HTMLDivElement>
  lines: string[]
}): JSX.Element {
  return (
    <div>
      <button
        onClick={onToggle}
        className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        <ChevronIcon open={open} />
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && (
        <div
          ref={outputRef}
          role="log"
          aria-live="polite"
          className="mt-2 max-h-48 overflow-y-auto bg-gray-950 px-3 py-2 font-mono text-[11px] leading-relaxed rounded-md"
        >
          {lines.length === 0 ? (
            <span className="text-gray-500">Waiting for output…</span>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="text-gray-300 whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function StageBadge({ stage }: { stage: InstallStage }): JSX.Element {
  const map: Record<InstallStage, { cls: string; label: string }> = {
    idle: { cls: 'bg-gray-100 text-gray-600', label: 'Ready' },
    'checking-node': { cls: 'bg-blue-100 text-blue-700', label: 'Checking…' },
    'node-needed': { cls: 'bg-amber-100 text-amber-700', label: 'Needs Node.js' },
    'installing-node': { cls: 'bg-blue-100 text-blue-700', label: 'Installing Node…' },
    'installing-cli': { cls: 'bg-blue-100 text-blue-700', label: 'Installing…' },
    verifying: { cls: 'bg-blue-100 text-blue-700', label: 'Verifying…' },
    success: { cls: 'bg-green-100 text-green-700', label: 'Installed' },
    error: { cls: 'bg-red-100 text-red-700', label: 'Needs attention' },
  }
  const m = map[stage]
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${m.cls}`}>
      {m.label}
    </span>
  )
}

function Spinner(): JSX.Element {
  return (
    <svg
      className="animate-spin h-4 w-4 text-[#5B4FC4]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
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

function ErrorIcon(): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.85-2.78l-7-13a2 2 0 00-3.7 0l-7 13A2 2 0 005 19z"
      />
    </svg>
  )
}

function InfoIcon(): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
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
