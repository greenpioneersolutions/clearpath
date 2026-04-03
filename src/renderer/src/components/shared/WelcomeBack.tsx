import type { SessionInfo } from '../../types/ipc'
import type { OutputMessage } from '../OutputDisplay'

interface SessionCard {
  info: SessionInfo
  messages: OutputMessage[]
}

interface Props {
  recentSessions: SessionCard[]
  onNewSession: () => void
  onContinueSession: (session: SessionInfo) => void
  onViewSession: (sessionId: string) => void
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function sessionDuration(startMs: number, messages: OutputMessage[]): string {
  // Use last message timestamp approximation or current time
  const elapsed = Date.now() - startMs
  const secs = Math.floor(elapsed / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function getFirstPrompt(messages: OutputMessage[]): string | null {
  const userMsg = messages.find((m) => m.sender === 'user')
  if (!userMsg) return null
  const text = userMsg.output.content
  return text.length > 80 ? text.slice(0, 80) + '...' : text
}

export default function WelcomeBack({ recentSessions, onNewSession, onContinueSession, onViewSession }: Props): JSX.Element {
  const promptCounts = recentSessions.map((s) => s.messages.filter((m) => m.sender === 'user').length)

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-y-auto">
      <div className="w-full max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-white text-xl font-semibold">Welcome Back</h2>
          <p className="text-gray-400 text-sm">Pick up where you left off, or start something new.</p>
        </div>

        {/* Primary action */}
        <button
          onClick={onNewSession}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Start New Session
        </button>

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wider px-1">Recent Sessions</h3>
            <div className="space-y-2">
              {recentSessions.map((session, idx) => {
                const firstPrompt = getFirstPrompt(session.messages)
                const prompts = promptCounts[idx]
                const isStopped = session.info.status === 'stopped'

                return (
                  <div
                    key={session.info.sessionId}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 hover:border-gray-700 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Session info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            session.info.cli === 'copilot' ? 'bg-green-400' : 'bg-orange-400'
                          }`} />
                          <span className="text-white text-sm font-medium truncate">
                            {session.info.name ?? session.info.sessionId.slice(0, 8)}
                          </span>
                          <span className="text-gray-600 text-xs flex-shrink-0">
                            {session.info.cli === 'copilot' ? 'Copilot' : 'Claude'}
                          </span>
                        </div>
                        {firstPrompt && (
                          <p className="text-gray-500 text-xs truncate mb-1.5">{firstPrompt}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                          <span>{timeAgo(session.info.startedAt)}</span>
                          <span>{prompts} prompt{prompts !== 1 ? 's' : ''}</span>
                          {isStopped && <span>{sessionDuration(session.info.startedAt, session.messages)}</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onViewSession(session.info.sessionId)}
                          className="px-2.5 py-1.5 text-xs text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 hover:text-gray-200 transition-colors"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onContinueSession(session.info)}
                          className="px-2.5 py-1.5 text-xs text-indigo-400 border border-indigo-700/50 rounded-lg hover:bg-indigo-900/30 hover:text-indigo-300 transition-colors"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
