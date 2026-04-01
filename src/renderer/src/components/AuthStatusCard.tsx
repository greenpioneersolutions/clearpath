import type { AuthStatus } from '../types/ipc'

interface Props {
  cli: 'copilot' | 'claude'
  status: AuthStatus | null
  loading: boolean
  onConnect: () => void
  onRefresh: () => void
}

const CLI_META = {
  copilot: {
    label: 'GitHub Copilot CLI',
    description: 'Primary agent (Copilot CLI)',
    color: 'indigo',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
      </svg>
    ),
  },
  claude: {
    label: 'Claude Code CLI',
    description: 'Secondary agent (Claude CLI)',
    color: 'orange',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
} as const

const TOKEN_SOURCE_LABEL: Record<string, string> = {
  'env-var': 'via environment variable',
  'config-file': 'via config file',
  'auth-status': 'via auth status',
}

export function AuthStatusCard({ cli, status, loading, onConnect, onRefresh }: Props): JSX.Element {
  const meta = CLI_META[cli]
  const isInstalled = status?.installed ?? false
  const isAuthenticated = status?.authenticated ?? false
  const canConnect = !loading && isInstalled && !isAuthenticated

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              cli === 'copilot' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'
            }`}
          >
            {meta.icon}
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 leading-tight">{meta.label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{meta.description}</p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-40"
          title="Re-check status"
        >
          <RefreshIcon spinning={loading} />
        </button>
      </div>

      {/* Status rows */}
      <div className="space-y-3">
        <StatusRow
          label="Installed"
          loading={loading}
          value={isInstalled}
          detail={status?.binaryPath ?? undefined}
        />
        <StatusRow
          label="Authenticated"
          loading={loading}
          value={isAuthenticated}
          detail={
            status?.tokenSource ? TOKEN_SOURCE_LABEL[status.tokenSource] : undefined
          }
        />
        {status?.version && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Version</span>
            <span className="text-xs font-mono text-gray-600 truncate max-w-[160px]">
              {status.version}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {isAuthenticated ? (
          <div className="flex items-center gap-2 w-full px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium border border-green-200">
            <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
            Connected
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={!canConnect}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? 'Checking…'
              : !isInstalled
              ? 'Not Installed'
              : 'Connect'}
          </button>
        )}
      </div>

      {/* Install hint */}
      {!loading && !isInstalled && (
        <InstallHint cli={cli} />
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface StatusRowProps {
  label: string
  loading: boolean
  value: boolean
  detail?: string
}

function StatusRow({ label, loading, value, detail }: StatusRowProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-gray-600 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {loading ? (
          <span className="text-xs text-gray-400">Checking…</span>
        ) : (
          <>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                value ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'
              }`}
            >
              {value ? 'Yes' : 'No'}
            </span>
            {detail && (
              <span className="text-xs text-gray-400 truncate" title={detail}>
                {detail}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  )
}

function InstallHint({ cli }: { cli: 'copilot' | 'claude' }): JSX.Element {
  const instructions =
    cli === 'copilot'
      ? 'npm install -g @github/copilot'
      : 'npm install -g @anthropic-ai/claude-code'

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <p className="text-xs text-amber-700 font-medium mb-1">Not installed</p>
      <code className="text-xs text-amber-800 font-mono">{instructions}</code>
    </div>
  )
}
