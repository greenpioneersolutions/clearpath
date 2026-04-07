import { useState, useEffect, useRef, useCallback } from 'react'
import type { ParsedOutput, SessionInfo } from '../../types/ipc'

interface TokenBreakdown {
  systemPrompt: number
  conversation: number
  files: number
  tools: number
  instructions: number
  total: number
  limit: number
}

const SEGMENTS = [
  { key: 'systemPrompt', label: 'System Prompt', color: 'bg-purple-500' },
  { key: 'conversation', label: 'Conversation', color: 'bg-blue-500' },
  { key: 'files', label: 'Files', color: 'bg-green-500' },
  { key: 'tools', label: 'Tools', color: 'bg-yellow-500' },
  { key: 'instructions', label: 'Instructions', color: 'bg-orange-500' },
] as const

// Parse token counts from CLI output text
function parseTokens(text: string): Partial<TokenBreakdown> {
  const result: Partial<TokenBreakdown> = {}

  // Total/limit pattern: "5,234 / 200,000" or "5234 of 200000"
  const totalLimitMatch = text.match(/([\d,]+)\s*(?:\/|of)\s*([\d,]+)\s*tokens?/i)
  if (totalLimitMatch) {
    result.total = parseInt(totalLimitMatch[1].replace(/,/g, ''))
    result.limit = parseInt(totalLimitMatch[2].replace(/,/g, ''))
  }

  // Named segments
  const patterns: Array<[keyof TokenBreakdown, RegExp]> = [
    ['systemPrompt', /system\s*prompt[:\s]+([\d,]+)/i],
    ['conversation', /conversation[:\s]+([\d,]+)/i],
    ['files', /files?[:\s]+([\d,]+)/i],
    ['tools', /tools?(?:\s+definitions?)?[:\s]+([\d,]+)/i],
    ['instructions', /instructions?[:\s]+([\d,]+)/i],
  ]

  for (const [key, re] of patterns) {
    const m = text.match(re)
    if (m) result[key] = parseInt(m[1].replace(/,/g, ''))
  }

  // Claude /cost output: "Input: 1,234 tokens"
  const inputMatch = text.match(/(?:input|prompt)[:\s]+([\d,]+)\s*tokens?/i)
  if (inputMatch && !result.total) {
    result.total = parseInt(inputMatch[1].replace(/,/g, ''))
  }

  return result
}

interface Props {
  activeSessions: SessionInfo[]
}

export default function ContextUsage({ activeSessions: initialSessions }: Props): JSX.Element {
  const [sessions, setSessions] = useState<SessionInfo[]>(initialSessions)
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [breakdown, setBreakdown] = useState<TokenBreakdown | null>(null)
  const [rawOutput, setRawOutput] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null)
  const bufferRef = useRef<string[]>([])
  const listenersRef = useRef<Array<() => void>>([])

  // Refresh session list
  useEffect(() => {
    const load = async () => {
      const result = await window.electronAPI.invoke('cli:list-sessions') as SessionInfo[]
      const running = result.filter((s) => s.status === 'running')
      setSessions(running)
      if (running.length > 0 && !selectedSessionId) {
        setSelectedSessionId(running[0].sessionId)
      }
    }
    void load()
  }, [selectedSessionId])

  const cleanup = useCallback(() => {
    for (const off of listenersRef.current) off()
    listenersRef.current = []
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const fetchUsage = useCallback(async () => {
    if (!selectedSessionId) return

    cleanup()
    setFetching(true)
    bufferRef.current = []
    setRawOutput([])
    setBreakdown(null)

    // Determine CLI for this session
    const session = sessions.find((s) => s.sessionId === selectedSessionId)
    const command = session?.cli === 'claude' ? '/cost' : '/context'

    // Listen for output from this session
    const offOutput = window.electronAPI.on('cli:output', (data: { sessionId: string; output: ParsedOutput }) => {
      if (data.sessionId !== selectedSessionId) return
      bufferRef.current.push(data.output.content)
      setRawOutput([...bufferRef.current])

      // Try to parse after each line
      const full = bufferRef.current.join('\n')
      const parsed = parseTokens(full)
      if (parsed.total || parsed.systemPrompt || parsed.conversation) {
        const bd: TokenBreakdown = {
          systemPrompt: parsed.systemPrompt ?? 0,
          conversation: parsed.conversation ?? 0,
          files: parsed.files ?? 0,
          tools: parsed.tools ?? 0,
          instructions: parsed.instructions ?? 0,
          total: parsed.total ?? 0,
          limit: parsed.limit ?? 200000,
        }
        if (!bd.total) {
          bd.total = bd.systemPrompt + bd.conversation + bd.files + bd.tools + bd.instructions
        }
        setBreakdown(bd)
      }
    })

    const offTurnEnd = window.electronAPI.on('cli:turn-end', (data: { sessionId: string }) => {
      if (data.sessionId !== selectedSessionId) return
      setFetching(false)
    })

    listenersRef.current = [offOutput, offTurnEnd]

    // Send the command
    await window.electronAPI.invoke('cli:send-slash-command', {
      sessionId: selectedSessionId,
      command,
    })
  }, [selectedSessionId, sessions, cleanup])

  const usedPct = breakdown
    ? Math.min(100, (breakdown.total / breakdown.limit) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Session selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400 flex-shrink-0">Session</label>
        {sessions.length === 0 ? (
          <span className="text-sm text-gray-500">No active sessions — start one in Sessions</span>
        ) : (
          <>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.name ?? s.sessionId.slice(0, 8)} ({s.cli})
                </option>
              ))}
            </select>
            <button
              onClick={() => void fetchUsage()}
              disabled={fetching || !selectedSessionId}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors flex-shrink-0"
            >
              {fetching ? 'Fetching…' : 'Fetch Usage'}
            </button>
          </>
        )}
      </div>

      {/* Bar visualization */}
      {breakdown ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>
              {breakdown.total.toLocaleString()} / {breakdown.limit.toLocaleString()} tokens
            </span>
            <span className={usedPct > 80 ? 'text-red-400' : usedPct > 60 ? 'text-yellow-400' : 'text-green-400'}>
              {usedPct.toFixed(1)}% used
            </span>
          </div>

          {/* Stacked bar */}
          <div className="h-6 rounded-md overflow-hidden bg-gray-700 flex">
            {SEGMENTS.map(({ key, color }) => {
              const val = breakdown[key]
              const pct = breakdown.limit > 0 ? (val / breakdown.limit) * 100 : 0
              if (pct < 0.1) return null
              return (
                <div
                  key={key}
                  className={`${color} transition-all cursor-default relative`}
                  style={{ width: `${pct}%` }}
                  onMouseEnter={() => setHoveredSegment(key)}
                  onMouseLeave={() => setHoveredSegment(null)}
                />
              )
            })}
            {/* Available */}
            <div
              className="bg-gray-600 flex-1"
              onMouseEnter={() => setHoveredSegment('available')}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          </div>

          {/* Legend */}
          <div className="grid grid-cols-3 gap-2">
            {SEGMENTS.map(({ key, label, color }) => {
              const val = breakdown[key]
              const pct = breakdown.limit > 0 ? ((val / breakdown.limit) * 100).toFixed(1) : '0.0'
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2 text-xs rounded px-2 py-1 transition-colors ${
                    hoveredSegment === key ? 'bg-gray-700' : ''
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${color}`} />
                  <span className="text-gray-400">{label}</span>
                  <span className="ml-auto text-gray-300">
                    {val > 0 ? val.toLocaleString() : '—'}{' '}
                    <span className="text-gray-600">({pct}%)</span>
                  </span>
                </div>
              )
            })}
            <div
              className={`flex items-center gap-2 text-xs rounded px-2 py-1 transition-colors ${
                hoveredSegment === 'available' ? 'bg-gray-700' : ''
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm bg-gray-600 flex-shrink-0" />
              <span className="text-gray-400">Available</span>
              <span className="ml-auto text-gray-300">
                {(breakdown.limit - breakdown.total).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-6 rounded-md bg-gray-700 flex items-center justify-center">
          <span className="text-xs text-gray-500">
            {fetching ? 'Waiting for response…' : 'Select a session and click Fetch Usage'}
          </span>
        </div>
      )}

      {/* Raw output */}
      {rawOutput.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1 font-medium">Raw CLI Output</div>
          <div className="bg-gray-900 border border-gray-700 rounded-md p-3 max-h-48 overflow-y-auto font-mono text-xs text-gray-300 space-y-0.5">
            {rawOutput.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
