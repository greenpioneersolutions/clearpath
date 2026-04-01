import { useEffect, useState } from 'react'
import type { IpcRendererEvent } from 'electron'
import { AuthStatusCard } from '../components/AuthStatusCard'
import { LoginModal } from '../components/LoginModal'
import type { AuthState, AuthStatus } from '../types/ipc'

const EMPTY_STATUS: AuthStatus = { installed: false, authenticated: false, checkedAt: 0 }

export default function Dashboard(): JSX.Element {
  const [state, setState] = useState<AuthState>({ copilot: EMPTY_STATUS, claude: EMPTY_STATUS })
  const [loading, setLoading] = useState(true)
  const [loginTarget, setLoginTarget] = useState<'copilot' | 'claude' | null>(null)

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
      (_event: IpcRendererEvent, s: AuthState) => setState(s)
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

  const handleModalClose = () => {
    setLoginTarget(null)
    // Re-fetch status so cards reflect the new auth state immediately
    void (window.electronAPI.invoke('auth:get-status') as Promise<AuthState>).then(setState)
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
          onRefresh={handleRefresh}
        />
        <AuthStatusCard
          cli="claude"
          status={state.claude}
          loading={loading}
          onConnect={() => setLoginTarget('claude')}
          onRefresh={handleRefresh}
        />
      </div>

      {loginTarget !== null && (
        <LoginModal cli={loginTarget} isOpen onClose={handleModalClose} />
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
