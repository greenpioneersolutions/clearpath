import { useEffect, useState, useCallback, forwardRef } from 'react'
import type { SessionInfo } from '../../types/ipc'
import type { BackendId } from '../../../../shared/backends'
import { providerOf } from '../../../../shared/backends'

interface Props {
  /** Click handler for a session row — typically opens the session in the Work view. */
  onOpenSession: (info: SessionInfo) => void
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function CliBadge({ cli }: { cli: BackendId }): JSX.Element {
  const provider = providerOf(cli)
  const styles: Record<'copilot' | 'claude', { bg: string; text: string; label: string }> = {
    copilot: { bg: 'rgba(91,79,196,0.18)', text: '#7F77DD', label: 'Copilot' },
    claude: { bg: 'rgba(29,158,117,0.18)', text: '#5DCAA5', label: 'Claude' },
  }
  const style = styles[provider]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  )
}

const ActiveSessionsCard = forwardRef<HTMLElement, Props>(function ActiveSessionsCard(
  { onOpenSession },
  ref,
): JSX.Element {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.invoke('cli:list-sessions') as SessionInfo[] | null
      setSessions((Array.isArray(list) ? list : []).filter((s) => s.status === 'running'))
    } catch {
      setSessions([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Live updates: a turn starting/ending or a session exiting either changes
  // the running set or the row's freshness, so just re-fetch on each event.
  useEffect(() => {
    const cleanup = [
      window.electronAPI.on('cli:turn-start', () => { void refresh() }),
      window.electronAPI.on('cli:turn-end', () => { void refresh() }),
      window.electronAPI.on('cli:exit', () => { void refresh() }),
    ]
    return () => cleanup.forEach((fn) => fn())
  }, [refresh])

  return (
    <section
      ref={ref}
      data-testid="active-sessions-card"
      id="work-active-sessions"
      className="rounded-2xl bg-gray-900/40 border border-gray-800 p-5"
    >
      <header className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-white text-sm font-semibold flex items-center gap-2">
            Active Sessions
            {sessions.length > 0 && (
              <span
                className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] text-white"
                style={{ backgroundColor: '#1D9E75' }}
                aria-label={`${sessions.length} active`}
              >
                {sessions.length}
              </span>
            )}
          </h3>
          <p className="text-gray-500 text-xs mt-0.5">Currently running chats.</p>
        </div>
      </header>

      {loading ? (
        <div className="text-xs text-gray-500 py-6 text-center">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="text-xs text-gray-500 py-8 text-center">
          No active sessions — start a new chat above ↑
        </div>
      ) : (
        <ul className="space-y-1.5">
          {sessions.map((s) => (
            <li key={s.sessionId}>
              <button
                data-testid="active-session-row"
                onClick={() => onOpenSession(s)}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-800 hover:border-teal-500/60 hover:bg-gray-800/40 transition-colors group"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-200 truncate group-hover:text-white">
                    {s.name ?? `Session ${s.sessionId.slice(0, 8)}`}
                  </span>
                  <CliBadge cli={s.cli} />
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                  <span>started {timeAgo(s.startedAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
})

export default ActiveSessionsCard
