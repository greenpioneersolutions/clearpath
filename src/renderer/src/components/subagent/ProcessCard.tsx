import { useState, useEffect, useRef } from 'react'
import type { SubAgentInfo } from '../../types/subagent'
import { providerOf } from '../../../../shared/backends'

function formatDuration(startMs: number, endMs?: number): string {
  const elapsed = (endMs ?? Date.now()) - startMs
  const secs = Math.floor(elapsed / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (mins < 60) return `${mins}m ${remSecs}s`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  running:   { bg: 'bg-green-900/30',  text: 'text-green-400',  dot: 'bg-green-400' },
  completed: { bg: 'bg-blue-900/30',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  failed:    { bg: 'bg-red-900/30',    text: 'text-red-400',    dot: 'bg-red-400' },
  killed:    { bg: 'bg-gray-800/50',   text: 'text-gray-400',   dot: 'bg-gray-500' },
}

interface Props {
  agent: SubAgentInfo
  isExpanded: boolean
  onToggleExpand: () => void
  onKill: () => void
  onPause: () => void
  onResume: () => void
  onPopOut: () => void
  children?: React.ReactNode
}

export default function ProcessCard({
  agent,
  isExpanded,
  onToggleExpand,
  onKill,
  onPause,
  onResume,
  onPopOut,
  children,
}: Props): JSX.Element {
  const [elapsed, setElapsed] = useState(() => formatDuration(agent.startedAt, agent.endedAt))
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (agent.status === 'running') {
      timerRef.current = setInterval(() => {
        setElapsed(formatDuration(agent.startedAt))
      }, 1000)
    } else {
      setElapsed(formatDuration(agent.startedAt, agent.endedAt))
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [agent.status, agent.startedAt, agent.endedAt])

  const style = STATUS_STYLES[agent.status] ?? STATUS_STYLES['killed']
  const provider = providerOf(agent.cli)
  const cliBadge = provider === 'copilot'
    ? 'bg-purple-900/50 text-purple-300 border-purple-700/50'
    : 'bg-orange-900/50 text-orange-300 border-orange-700/50'

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="flex-shrink-0">
            {agent.status === 'running' ? (
              <div className="w-8 h-8 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
            ) : (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${style.bg}`}>
                <span className={`w-3 h-3 rounded-full ${style.dot}`} />
              </div>
            )}
          </div>

          {/* Info */}
          <button onClick={onToggleExpand} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-100 truncate">{agent.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded border ${cliBadge}`}>
                {provider === 'copilot' ? 'Copilot' : 'Claude'}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                {agent.status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>{elapsed}</span>
              {agent.model && <span>model: {agent.model}</span>}
              {agent.pid && <span>pid: {agent.pid}</span>}
              {agent.workingDirectory && (
                <span className="font-mono truncate max-w-[200px]">{agent.workingDirectory}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1 truncate">{agent.prompt}</p>
          </button>

          {/* Controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {agent.status === 'running' && (
              <>
                <button
                  onClick={onPause}
                  className="px-2 py-1 text-xs bg-yellow-900/40 hover:bg-yellow-800/60 text-yellow-300 border border-yellow-700/40 rounded-md transition-colors"
                  title="Pause (Ctrl+C)"
                >
                  Pause
                </button>
                <button
                  onClick={onKill}
                  className="px-2 py-1 text-xs bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-700/40 rounded-md transition-colors"
                  title="Kill (SIGTERM)"
                >
                  Kill
                </button>
              </>
            )}
            {(agent.status === 'completed' || agent.status === 'failed' || agent.status === 'killed') && (
              <button
                onClick={onResume}
                className="px-2 py-1 text-xs bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 border border-indigo-700/40 rounded-md transition-colors"
                title="Resume with follow-up prompt"
              >
                Resume
              </button>
            )}
            <button
              onClick={onPopOut}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors"
              title="Open in new window"
            >
              Pop Out
            </button>
          </div>
        </div>
      </div>

      {/* Expandable output */}
      {isExpanded && (
        <div className="border-t border-gray-700">
          {children}
        </div>
      )}
    </div>
  )
}
