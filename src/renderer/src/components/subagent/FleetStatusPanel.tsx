import { useState, useEffect, useCallback, useRef } from 'react'
import type { IpcRendererEvent } from 'electron'
import type { ParsedOutput, SessionInfo } from '../../types/ipc'
import type { FleetAgent } from '../../types/subagent'

const AGENT_STATUS_STYLES: Record<string, string> = {
  working: 'bg-green-900/30 text-green-400',
  idle:    'bg-gray-700 text-gray-400',
  done:    'bg-blue-900/30 text-blue-400',
  error:   'bg-red-900/30 text-red-400',
}

/** Parse /fleet output into FleetAgent entries.
 *  Copilot's /fleet output is a structured list of agents with their current tasks.
 *  Example lines:
 *    Agent "explore" — working on: analyzing repository structure
 *    Agent "task" — idle
 *    Agent "review" — done: completed code review
 */
function parseFleetOutput(lines: string[]): FleetAgent[] {
  const agents: FleetAgent[] = []
  const agentRe = /Agent\s+"?([^"]+)"?\s*[—-]+\s*(working|idle|done|error)(?:\s*(?:on)?:\s*(.+))?/i

  for (const line of lines) {
    const m = line.match(agentRe)
    if (m) {
      agents.push({
        name: m[1].trim(),
        status: m[2].toLowerCase() as FleetAgent['status'],
        task: m[3]?.trim() ?? '',
      })
    }
  }

  // If structured parsing found nothing, try to detect any agent-like lines
  if (agents.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('/fleet') || trimmed.startsWith('Fleet')) continue
      // Generic line — just show it
      if (trimmed.length > 5) {
        agents.push({
          name: trimmed.slice(0, 30),
          status: 'working',
          task: trimmed,
        })
      }
    }
  }

  return agents
}

interface Props {
  copilotSessions: SessionInfo[]
}

export default function FleetStatusPanel({ copilotSessions }: Props): JSX.Element {
  const [selectedSession, setSelectedSession] = useState('')
  const [agents, setAgents] = useState<FleetAgent[]>([])
  const [rawOutput, setRawOutput] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [lastFetched, setLastFetched] = useState<number | null>(null)
  const bufferRef = useRef<string[]>([])
  const cleanupRef = useRef<Array<() => void>>([])

  // Auto-select first copilot session
  useEffect(() => {
    if (copilotSessions.length > 0 && !selectedSession) {
      setSelectedSession(copilotSessions[0].sessionId)
    }
  }, [copilotSessions, selectedSession])

  const cleanup = useCallback(() => {
    for (const off of cleanupRef.current) off()
    cleanupRef.current = []
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const fetchFleetStatus = useCallback(async () => {
    if (!selectedSession) return

    cleanup()
    setFetching(true)
    bufferRef.current = []
    setRawOutput([])
    setAgents([])

    // Listen for output from this session
    const offOutput = window.electronAPI.on(
      'cli:output',
      (_e: IpcRendererEvent, data: { sessionId: string; output: ParsedOutput }) => {
        if (data.sessionId !== selectedSession) return
        bufferRef.current.push(data.output.content)
        setRawOutput([...bufferRef.current])

        // Parse after each line
        const parsed = parseFleetOutput(bufferRef.current)
        if (parsed.length > 0) setAgents(parsed)
      },
    )

    const offTurnEnd = window.electronAPI.on(
      'cli:turn-end',
      (_e: IpcRendererEvent, data: { sessionId: string }) => {
        if (data.sessionId !== selectedSession) return
        setFetching(false)
        setLastFetched(Date.now())
        // Final parse
        const parsed = parseFleetOutput(bufferRef.current)
        setAgents(parsed)
      },
    )

    cleanupRef.current = [offOutput, offTurnEnd]

    // Send /fleet command
    await window.electronAPI.invoke('subagent:fleet-status', { sessionId: selectedSession })
  }, [selectedSession, cleanup])

  const runningSessions = copilotSessions.filter((s) => s.status === 'running')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Fleet Status</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Copilot coordinated sub-agent activity (via /fleet)
          </p>
        </div>
        {lastFetched && (
          <span className="text-xs text-gray-600">
            Last updated: {new Date(lastFetched).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Session selector + fetch */}
      <div className="flex items-center gap-3">
        {runningSessions.length === 0 ? (
          <div className="text-xs text-gray-500">
            No running Copilot sessions. Start a Copilot session in the Sessions tab first.
          </div>
        ) : (
          <>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 outline-none focus:border-indigo-500"
            >
              {runningSessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.name ?? s.sessionId.slice(0, 8)} (Copilot)
                </option>
              ))}
            </select>
            <button
              onClick={() => void fetchFleetStatus()}
              disabled={fetching || !selectedSession}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
            >
              {fetching ? 'Fetching...' : 'Refresh Fleet'}
            </button>
          </>
        )}
      </div>

      {/* Agent cards */}
      {agents.length > 0 ? (
        <div className="grid gap-2">
          {agents.map((agent, i) => {
            const statusClass = AGENT_STATUS_STYLES[agent.status] ?? AGENT_STATUS_STYLES['idle']
            return (
              <div
                key={`${agent.name}-${i}`}
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3"
              >
                {/* Status dot */}
                <div className="flex-shrink-0">
                  {agent.status === 'working' ? (
                    <div className="w-6 h-6 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
                  ) : (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${statusClass}`}>
                      <span className="w-2 h-2 rounded-full bg-current" />
                    </div>
                  )}
                </div>

                {/* Agent info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{agent.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${statusClass}`}>
                      {agent.status}
                    </span>
                  </div>
                  {agent.task && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{agent.task}</p>
                  )}
                  {agent.progress && (
                    <p className="text-xs text-gray-500 mt-0.5">{agent.progress}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : !fetching && runningSessions.length > 0 ? (
        <div className="bg-gray-800 border border-dashed border-gray-700 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">No fleet data</p>
          <p className="text-xs text-gray-600 mt-1">
            Click &quot;Refresh Fleet&quot; to query the active Copilot session
          </p>
        </div>
      ) : null}

      {/* Raw output */}
      {rawOutput.length > 0 && (
        <details className="group">
          <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 transition-colors select-none">
            Raw /fleet output ({rawOutput.length} lines)
          </summary>
          <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-gray-400 space-y-0.5">
            {rawOutput.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
