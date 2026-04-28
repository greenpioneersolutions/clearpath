import { useEffect, useState } from 'react'
import type { BackendId } from '../../../../shared/backends'
import { providerOf } from '../../../../shared/backends'

interface PersistedSessionRow {
  sessionId: string
  cli: BackendId
  name?: string
  firstPrompt?: string
  startedAt: number
  endedAt?: number
  archived?: boolean
  messageLog: Array<unknown>
  status?: 'running' | 'stopped'
}

interface Props {
  /** Click handler for a recent session — typically resumes the session. */
  onResumeSession: (sessionId: string, cli: BackendId, name?: string) => void
  /** Click handler for the "See more →" link — typically opens the SessionManager modal. */
  onSeeMore: () => void
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

export default function RecentSessionsCard({ onResumeSession, onSeeMore }: Props): JSX.Element {
  const [rows, setRows] = useState<PersistedSessionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const list = await window.electronAPI.invoke('cli:get-persisted-sessions') as PersistedSessionRow[] | null
        setRows(Array.isArray(list) ? list : [])
      } catch {
        setRows([])
      }
      setLoading(false)
    })()
  }, [])

  const recent = [...rows]
    .filter((s) => s.status !== 'running' && !s.archived)
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    .slice(0, 5)

  return (
    <section
      data-testid="recent-sessions-card"
      className="rounded-2xl bg-gray-900/40 border border-gray-800 p-5"
    >
      <header className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-white text-sm font-semibold">Recent Sessions</h3>
          <p className="text-gray-500 text-xs mt-0.5">Pick up where you left off.</p>
        </div>
        <button
          data-testid="recent-sessions-see-more"
          onClick={onSeeMore}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          See more →
        </button>
      </header>

      {loading ? (
        <div className="text-xs text-gray-500 py-6 text-center">Loading...</div>
      ) : recent.length === 0 ? (
        <div className="text-xs text-gray-500 py-8 text-center">No previous sessions yet.</div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {recent.map((s) => (
            <li key={s.sessionId}>
              <button
                data-testid="recent-session-row"
                onClick={() => onResumeSession(s.sessionId, s.cli, s.name)}
                className="w-full h-full text-left px-3 py-2.5 rounded-lg border border-gray-800 hover:border-indigo-500/60 hover:bg-gray-800/40 transition-colors group"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-200 truncate group-hover:text-white">
                    {s.name ?? s.firstPrompt?.slice(0, 40) ?? `Session ${s.sessionId.slice(0, 8)}`}
                  </span>
                  <CliBadge cli={s.cli} />
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                  <span>{timeAgo(s.endedAt ?? s.startedAt)}</span>
                  <span>·</span>
                  <span>{s.messageLog.length} msg{s.messageLog.length === 1 ? '' : 's'}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
