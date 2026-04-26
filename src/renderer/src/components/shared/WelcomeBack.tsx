import type { SessionInfo } from '../../types/ipc'
import type { OutputMessage } from '../OutputDisplay'

interface SessionCard {
  info: SessionInfo
  messages: OutputMessage[]
}

interface Props {
  recentSessions: SessionCard[]
  /** Primary CTA — opens the new-session flow with no prompt. */
  onStartBlank: () => void
  /** Row click — continue/view the session. */
  onContinueSession: (session: SessionInfo) => void
  /** "See all" link — opens the full session manager. */
  onBrowseAll: () => void
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

export default function WelcomeBack({ recentSessions, onStartBlank, onContinueSession, onBrowseAll }: Props): JSX.Element {
  const compactList = recentSessions.slice(0, 5)

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-y-auto">
      <div className="w-full max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-white text-xl font-semibold">Welcome Back</h2>
          <p className="text-gray-400 text-sm">Pick up where you left off, or start something new.</p>
        </div>

        {/* Primary CTA */}
        <button
          onClick={onStartBlank}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-base font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
          style={{ backgroundColor: 'var(--brand-btn-primary, #4F46E5)' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Start a session
        </button>

        {/* Recent — deprioritized, compact */}
        {compactList.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-gray-500 text-[11px] font-medium uppercase tracking-wider px-1">Recent</h3>
            <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800/60 overflow-hidden">
              {compactList.map((session) => (
                <li key={session.info.sessionId}>
                  <button
                    onClick={() => onContinueSession(session.info)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-800/40 transition-colors"
                  >
                    <span className="text-sm text-gray-300 truncate">
                      {session.info.name ?? session.info.sessionId.slice(0, 8)}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {timeAgo(session.info.startedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="text-right px-1 pt-1">
              <button
                onClick={onBrowseAll}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                See all
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
