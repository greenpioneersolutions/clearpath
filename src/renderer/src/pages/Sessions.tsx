import { useState, useEffect, useCallback, useRef } from 'react'
import type { IpcRendererEvent } from 'electron'
import type { ParsedOutput, SessionInfo, HistoricalSession } from '../types/ipc'
import OutputDisplay, { type OutputMessage } from '../components/OutputDisplay'
import CommandInput from '../components/CommandInput'
import ModeIndicator, { type SessionMode, MODE_CYCLE } from '../components/ModeIndicator'
import NewSessionModal from '../components/NewSessionModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveSessionState {
  info: SessionInfo
  messages: OutputMessage[]
  mode: SessionMode
  msgIdCounter: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

function cliBadge(cli: 'copilot' | 'claude'): string {
  return cli === 'copilot' ? 'Copilot' : 'Claude'
}

function cliBadgeColor(cli: 'copilot' | 'claude'): string {
  return cli === 'copilot'
    ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50'
    : 'bg-orange-900/50 text-orange-300 border border-orange-700/50'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sessions(): JSX.Element {
  const [sessions, setSessions] = useState<Map<string, ActiveSessionState>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoricalSession[]>([])
  const [showNewSession, setShowNewSession] = useState(false)

  // Keep a ref so IPC callbacks always see current sessions map without stale closure
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // ── Load history on mount ─────────────────────────────────────────────────
  useEffect(() => {
    void window.electronAPI
      .invoke('session-history:list')
      .then((list) => setHistory(list as HistoricalSession[]))
  }, [])

  // ── IPC event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const handleOutput = (
      _event: IpcRendererEvent,
      { sessionId, output }: { sessionId: string; output: ParsedOutput }
    ) => {
      setSessions((prev) => {
        const session = prev.get(sessionId)
        if (!session) return prev
        const newMsg: OutputMessage = {
          id: String(session.msgIdCounter),
          output,
        }
        const updated = new Map(prev)
        updated.set(sessionId, {
          ...session,
          messages: [...session.messages, newMsg],
          msgIdCounter: session.msgIdCounter + 1,
        })
        return updated
      })
    }

    const handleError = (
      _event: IpcRendererEvent,
      { sessionId, error }: { sessionId: string; error: string }
    ) => {
      setSessions((prev) => {
        const session = prev.get(sessionId)
        if (!session) return prev
        const newMsg: OutputMessage = {
          id: String(session.msgIdCounter),
          output: { type: 'error', content: error.trim() },
        }
        const updated = new Map(prev)
        updated.set(sessionId, {
          ...session,
          messages: [...session.messages, newMsg],
          msgIdCounter: session.msgIdCounter + 1,
        })
        return updated
      })
    }

    const handleExit = (
      _event: IpcRendererEvent,
      { sessionId, code }: { sessionId: string; code: number }
    ) => {
      setSessions((prev) => {
        const session = prev.get(sessionId)
        if (!session) return prev
        const exitMsg: OutputMessage = {
          id: String(session.msgIdCounter),
          output: {
            type: 'status',
            content: `Session ended (exit code ${code})`,
          },
        }
        const updated = new Map(prev)
        updated.set(sessionId, {
          ...session,
          info: { ...session.info, status: 'stopped' },
          messages: [...session.messages, exitMsg],
          msgIdCounter: session.msgIdCounter + 1,
        })
        return updated
      })

      // Persist endedAt to history
      void window.electronAPI.invoke('session-history:update', {
        sessionId,
        endedAt: Date.now(),
      })
      setHistory((prev) =>
        prev.map((h) => (h.sessionId === sessionId ? { ...h, endedAt: Date.now() } : h))
      )
    }

    const handlePermission = (
      _event: IpcRendererEvent,
      { sessionId, request }: { sessionId: string; request: ParsedOutput }
    ) => {
      setSessions((prev) => {
        const session = prev.get(sessionId)
        if (!session) return prev
        const newMsg: OutputMessage = {
          id: String(session.msgIdCounter),
          output: request,
        }
        const updated = new Map(prev)
        updated.set(sessionId, {
          ...session,
          messages: [...session.messages, newMsg],
          msgIdCounter: session.msgIdCounter + 1,
        })
        return updated
      })
    }

    const cleanup = [
      window.electronAPI.on('cli:output', handleOutput),
      window.electronAPI.on('cli:error', handleError),
      window.electronAPI.on('cli:exit', handleExit),
      window.electronAPI.on('cli:permission-request', handlePermission),
    ]

    return () => cleanup.forEach((fn) => fn())
  }, [])

  // ── Start a new session ───────────────────────────────────────────────────
  const startSession = useCallback(
    async (opts: {
      cli: 'copilot' | 'claude'
      name?: string
      workingDirectory?: string
      initialPrompt?: string
    }) => {
      const { sessionId } = (await window.electronAPI.invoke('cli:start-session', {
        cli: opts.cli,
        mode: 'interactive',
        name: opts.name,
        workingDirectory: opts.workingDirectory,
        prompt: opts.initialPrompt,
      })) as { sessionId: string }

      const info: SessionInfo = {
        sessionId,
        name: opts.name,
        cli: opts.cli,
        status: 'running',
        startedAt: Date.now(),
      }

      const initial: OutputMessage[] = opts.initialPrompt
        ? [
            {
              id: '0',
              output: { type: 'text', content: `> ${opts.initialPrompt}` },
            },
          ]
        : []

      setSessions((prev) => {
        const updated = new Map(prev)
        updated.set(sessionId, {
          info,
          messages: initial,
          mode: 'normal',
          msgIdCounter: initial.length,
        })
        return updated
      })

      setSelectedId(sessionId)

      // Persist to history
      const histEntry: HistoricalSession = {
        sessionId,
        cli: opts.cli,
        name: opts.name,
        firstPrompt: opts.initialPrompt,
        startedAt: Date.now(),
      }
      void window.electronAPI.invoke('session-history:add', histEntry)
      setHistory((prev) => [histEntry, ...prev])
    },
    []
  )

  // ── Resume a historical session ───────────────────────────────────────────
  const resumeSession = useCallback(async (hist: HistoricalSession) => {
    const { sessionId } = (await window.electronAPI.invoke('cli:start-session', {
      cli: hist.cli,
      mode: 'interactive',
      name: hist.name,
      resume: hist.sessionId,
    })) as { sessionId: string }

    const info: SessionInfo = {
      sessionId,
      name: hist.name ? `${hist.name} (resumed)` : 'Resumed',
      cli: hist.cli,
      status: 'running',
      startedAt: Date.now(),
    }

    setSessions((prev) => {
      const updated = new Map(prev)
      updated.set(sessionId, {
        info,
        messages: [
          {
            id: '0',
            output: { type: 'status', content: `Resumed session ${hist.sessionId}` },
          },
        ],
        mode: 'normal',
        msgIdCounter: 1,
      })
      return updated
    })

    setSelectedId(sessionId)

    const histEntry: HistoricalSession = {
      sessionId,
      cli: hist.cli,
      name: info.name,
      startedAt: Date.now(),
    }
    void window.electronAPI.invoke('session-history:add', histEntry)
    setHistory((prev) => [histEntry, ...prev])
  }, [])

  // ── Stop a session ────────────────────────────────────────────────────────
  const stopSession = useCallback(async (sessionId: string) => {
    await window.electronAPI.invoke('cli:stop-session', { sessionId })
    setSessions((prev) => {
      const session = prev.get(sessionId)
      if (!session) return prev
      const updated = new Map(prev)
      updated.set(sessionId, {
        ...session,
        info: { ...session.info, status: 'stopped' },
      })
      return updated
    })
  }, [])

  // ── Send input / slash commands ───────────────────────────────────────────
  const handleSend = useCallback(
    (input: string) => {
      if (!selectedId) return
      window.electronAPI.invoke('cli:send-input', { sessionId: selectedId, input })
      // Echo user input into the message list
      setSessions((prev) => {
        const session = prev.get(selectedId)
        if (!session) return prev
        const msg: OutputMessage = {
          id: String(session.msgIdCounter),
          output: { type: 'text', content: `> ${input}` },
        }
        const updated = new Map(prev)
        updated.set(selectedId, {
          ...session,
          messages: [...session.messages, msg],
          msgIdCounter: session.msgIdCounter + 1,
        })
        return updated
      })
    },
    [selectedId]
  )

  const handleSlashCommand = useCallback(
    (command: string) => {
      if (!selectedId) return
      window.electronAPI.invoke('cli:send-slash-command', {
        sessionId: selectedId,
        command,
      })
      setSessions((prev) => {
        const session = prev.get(selectedId)
        if (!session) return prev
        const msg: OutputMessage = {
          id: String(session.msgIdCounter),
          output: { type: 'status', content: command },
        }
        const updated = new Map(prev)
        updated.set(selectedId, {
          ...session,
          messages: [...session.messages, msg],
          msgIdCounter: session.msgIdCounter + 1,
        })
        return updated
      })
    },
    [selectedId]
  )

  // ── Permission response ───────────────────────────────────────────────────
  const handlePermissionResponse = useCallback(
    (response: 'y' | 'n') => {
      if (!selectedId) return
      window.electronAPI.invoke('cli:send-input', { sessionId: selectedId, input: response })
    },
    [selectedId]
  )

  // ── Mode toggle — sends Shift+Tab escape sequence ─────────────────────────
  const handleModeToggle = useCallback(() => {
    if (!selectedId) return
    setSessions((prev) => {
      const session = prev.get(selectedId)
      if (!session) return prev
      const currentIdx = MODE_CYCLE.indexOf(session.mode)
      const nextMode = MODE_CYCLE[(currentIdx + 1) % MODE_CYCLE.length]
      const updated = new Map(prev)
      updated.set(selectedId, { ...session, mode: nextMode })
      return updated
    })
    // Send Shift+Tab (ESC[Z) to the process so the CLI actually switches mode
    window.electronAPI.invoke('cli:send-input', { sessionId: selectedId, input: '\x1b[Z' })
  }, [selectedId])

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeSessions = Array.from(sessions.values())
  const selectedSession = selectedId ? sessions.get(selectedId) ?? null : null

  // Deduplicate history — don't show sessions that are still active
  const activeIds = new Set(activeSessions.map((s) => s.info.sessionId))
  const historyFiltered = history.filter((h) => !activeIds.has(h.sessionId))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full -m-6 overflow-hidden">
      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* New Session button */}
        <div className="p-3 border-b border-gray-800">
          <button
            onClick={() => setShowNewSession(true)}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New Session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Active sessions */}
          {activeSessions.length > 0 && (
            <div>
              <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Active
              </p>
              {activeSessions.map(({ info }) => (
                <SessionListItem
                  key={info.sessionId}
                  sessionId={info.sessionId}
                  name={info.name ?? info.cli}
                  cli={info.cli}
                  timestamp={info.startedAt}
                  status={info.status}
                  isSelected={selectedId === info.sessionId}
                  onClick={() => setSelectedId(info.sessionId)}
                />
              ))}
            </div>
          )}

          {/* History */}
          {historyFiltered.length > 0 && (
            <div>
              <div className="px-3 pt-4 pb-1 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  History
                </p>
                <button
                  onClick={() => {
                    void window.electronAPI.invoke('session-history:clear')
                    setHistory([])
                  }}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Clear
                </button>
              </div>
              {historyFiltered.map((hist) => (
                <SessionListItem
                  key={hist.sessionId}
                  sessionId={hist.sessionId}
                  name={hist.name ?? hist.cli}
                  cli={hist.cli}
                  timestamp={hist.startedAt}
                  status="stopped"
                  subtitle={hist.firstPrompt}
                  isSelected={false}
                  onClick={() => void resumeSession(hist)}
                  isHistory
                />
              ))}
            </div>
          )}

          {activeSessions.length === 0 && historyFiltered.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-gray-600 text-sm">No sessions yet</p>
              <p className="text-gray-700 text-xs mt-1">Start a new session to begin</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main chat area ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 bg-gray-950">
        {selectedSession ? (
          <>
            {/* Session header */}
            <header className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 bg-gray-900 flex-shrink-0">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${cliBadgeColor(selectedSession.info.cli)}`}
              >
                {cliBadge(selectedSession.info.cli)}
              </span>
              <span className="text-gray-200 text-sm font-medium truncate flex-1">
                {selectedSession.info.name ?? `Session ${selectedSession.info.sessionId.slice(0, 8)}`}
              </span>
              <ModeIndicator
                mode={selectedSession.mode}
                onToggle={handleModeToggle}
              />
              {selectedSession.info.status === 'running' ? (
                <button
                  onClick={() => void stopSession(selectedSession.info.sessionId)}
                  className="px-2.5 py-1 text-xs bg-red-900/50 hover:bg-red-800/60 text-red-300 border border-red-700/50 rounded-md transition-colors flex-shrink-0"
                >
                  Stop
                </button>
              ) : (
                <span className="text-xs text-gray-500 flex-shrink-0">Stopped</span>
              )}
            </header>

            {/* Output */}
            <OutputDisplay
              messages={selectedSession.messages}
              onPermissionResponse={handlePermissionResponse}
            />

            {/* Input */}
            <CommandInput
              cli={selectedSession.info.cli}
              onSend={handleSend}
              onSlashCommand={handleSlashCommand}
              disabled={selectedSession.info.status !== 'running'}
            />
          </>
        ) : (
          <EmptyState onNewSession={() => setShowNewSession(true)} />
        )}
      </main>

      {/* ── New session modal ─────────────────────────────────────────────── */}
      {showNewSession && (
        <NewSessionModal
          onStart={(opts) => void startSession(opts)}
          onClose={() => setShowNewSession(false)}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SessionListItem({
  name,
  cli,
  timestamp,
  status,
  subtitle,
  isSelected,
  isHistory,
  onClick,
}: {
  sessionId: string
  name: string
  cli: 'copilot' | 'claude'
  timestamp: number
  status: 'running' | 'stopped'
  subtitle?: string
  isSelected: boolean
  isHistory?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 transition-colors group ${
        isSelected ? 'bg-gray-800' : 'hover:bg-gray-800/60'
      }`}
    >
      <div className="flex items-center gap-2">
        {status === 'running' && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 animate-pulse" />
        )}
        <span
          className={`text-sm truncate flex-1 ${isSelected ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}
        >
          {name}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${cliBadgeColor(cli)}`}>
          {cliBadge(cli)}
        </span>
      </div>
      {subtitle && (
        <p className="text-xs text-gray-600 truncate mt-0.5 pl-3.5">{subtitle}</p>
      )}
      <div className="flex items-center gap-1 mt-0.5 pl-3.5">
        <span className="text-xs text-gray-600">{formatRelativeTime(timestamp)}</span>
        {isHistory && (
          <span className="text-xs text-gray-700">· click to resume</span>
        )}
      </div>
    </button>
  )
}

function EmptyState({ onNewSession }: { onNewSession: () => void }): JSX.Element {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 9h8M8 13h6m-5 8L3 17H2a2 2 0 01-2-2V5a2 2 0 012-2h20a2 2 0 012 2v10a2 2 0 01-2 2h-1l-5 4z"
          />
        </svg>
      </div>
      <h2 className="text-gray-300 font-semibold text-lg mb-1">No session selected</h2>
      <p className="text-gray-600 text-sm mb-6">
        Start a new session or select one from the sidebar
      </p>
      <button
        onClick={onNewSession}
        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        + New Session
      </button>
    </div>
  )
}
