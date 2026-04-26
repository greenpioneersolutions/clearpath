import { useEffect, useState } from 'react'
import { AuthStatusCard } from '../components/AuthStatusCard'
import { LoginModal } from '../components/LoginModal'
import { InstallModal } from '../components/InstallModal'
import type { AuthState, AuthStatus, ProviderAuthState } from '../types/ipc'

const EMPTY_STATUS: AuthStatus = { installed: false, authenticated: false, checkedAt: 0 }
const EMPTY_PROVIDER_STATE: ProviderAuthState = { ...EMPTY_STATUS, cli: EMPTY_STATUS, sdk: EMPTY_STATUS }

export default function Dashboard(): JSX.Element {
  const [state, setState] = useState<AuthState>({ copilot: EMPTY_PROVIDER_STATE, claude: EMPTY_PROVIDER_STATE })
  const [loading, setLoading] = useState(true)
  const [loginTarget, setLoginTarget] = useState<'copilot' | 'claude' | null>(null)
  const [installTarget, setInstallTarget] = useState<'copilot' | 'claude' | null>(null)

  // Load initial auth state from cache (fast) then a background refresh if stale
  useEffect(() => {
    setLoading(true)
    void (window.electronAPI.invoke('auth:get-status') as Promise<AuthState>).then((s) => {
      setState(s)
      setLoading(false)
    })
  }, [])

  // Keep cards in sync when AuthManager refreshes in the background
  useEffect(() => {
    const cleanup = window.electronAPI.on(
      'auth:status-changed',
      (s: AuthState) => setState(s),
    )
    return cleanup
  }, [])

  const handleRefresh = () => {
    setLoading(true)
    void (window.electronAPI.invoke('auth:refresh') as Promise<AuthState>).then((s) => {
      setState(s)
      setLoading(false)
    })
  }

  const handleLoginClose = () => {
    setLoginTarget(null)
    // Re-fetch status so cards reflect the new auth state immediately
    void (window.electronAPI.invoke('auth:get-status') as Promise<AuthState>).then(setState)
  }

  const handleInstallClose = () => {
    setInstallTarget(null)
    // Force a refresh — install-complete invalidates the cache, but this makes sure
    void (window.electronAPI.invoke('auth:refresh') as Promise<AuthState>).then(setState)
  }

  const handleInstallDone = () => {
    // Chain straight from Install → Login (one-tap end-to-end)
    const cli = installTarget
    setInstallTarget(null)
    if (cli) {
      // Refresh first so state shows installed=true, then open login
      void (window.electronAPI.invoke('auth:refresh') as Promise<AuthState>).then((s) => {
        setState(s)
        setLoginTarget(cli)
      })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
        >
          <RefreshIcon spinning={loading} />
          Refresh all
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AuthStatusCard
          cli="copilot"
          status={state.copilot}
          loading={loading}
          onConnect={() => setLoginTarget('copilot')}
          onInstall={() => setInstallTarget('copilot')}
          onRefresh={handleRefresh}
        />
        <AuthStatusCard
          cli="claude"
          status={state.claude}
          loading={loading}
          onConnect={() => setLoginTarget('claude')}
          onInstall={() => setInstallTarget('claude')}
          onRefresh={handleRefresh}
        />
      </div>

      {installTarget !== null && (
        <InstallModal
          cli={installTarget}
          isOpen
          onClose={handleInstallClose}
          onInstalled={handleInstallDone}
        />
      )}

      {loginTarget !== null && (
        <LoginModal cli={loginTarget} isOpen onClose={handleLoginClose} />
      )}
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
