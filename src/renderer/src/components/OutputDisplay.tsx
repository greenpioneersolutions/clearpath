import { useEffect, useRef, useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { ParsedOutput } from '../types/ipc'

export interface OutputMessage {
  id: string
  output: ParsedOutput
  sender?: 'user' | 'ai' | 'system'
  timestamp?: number  // ms since epoch — when the message was added
}

export interface UsageStats {
  raw: string
  requests?: string
  apiTime?: string
  sessionTime?: string
  codeChanges?: string
  model?: string
}

interface Props {
  messages: OutputMessage[]
  onPermissionResponse: (response: 'y' | 'n') => void
  onSaveAsNote?: (content: string) => void
  processing?: boolean
  usageHistory?: UsageStats[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Group messages for display. Each message is its own group UNLESS they are
 * consecutive AI text messages that arrived within 2 seconds of each other
 * (streaming fragments from the same response). This prevents separate AI
 * responses from different turns being merged into one giant bubble.
 */
function groupMessages(messages: OutputMessage[]): OutputMessage[][] {
  const groups: OutputMessage[][] = []
  let current: OutputMessage[] = []

  for (const msg of messages) {
    const isAiText = msg.sender !== 'user' && msg.output.type === 'text'
    const lastIsAiText =
      current.length > 0 &&
      current[0].sender !== 'user' &&
      current[0].output.type === 'text'

    if (isAiText && lastIsAiText) {
      // Only group if timestamps are within 2 seconds (streaming fragments)
      const lastMsg = current[current.length - 1]
      const timeDiff = (msg.timestamp && lastMsg.timestamp)
        ? msg.timestamp - lastMsg.timestamp
        : 0
      if (timeDiff < 2000) {
        current.push(msg)
      } else {
        // Different turn — start a new group
        if (current.length) groups.push(current)
        current = [msg]
      }
    } else {
      if (current.length) groups.push(current)
      current = [msg]
    }
  }
  if (current.length) groups.push(current)
  return groups
}

// ── Rotating thinking phrases ───────────────────────────────────────────────

const THINKING_PHRASES = [
  'Analyzing your request',
  'Working on it',
  'Processing',
  'Thinking through the problem',
  'Exploring the codebase',
  'Reasoning about the best approach',
  'Formulating a response',
  'Considering options',
  'Evaluating the context',
  'Building a plan',
  'Synthesizing information',
  'Crafting a thoughtful response',
]

// ── Main component ──────────────────────────────────────────────────────────

export default function OutputDisplay({ messages, onPermissionResponse, onSaveAsNote, processing, usageHistory }: Props): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, processing])

  const groups = useMemo(() => groupMessages(messages), [messages])

  // Track which usage entry to show after each AI response group
  // Each usage entry corresponds to a completed turn
  const totalUsage = usageHistory?.length ?? 0

  return (
    <div className="flex-1 overflow-y-auto bg-gray-950">
      {/* Welcome state */}
      {messages.length === 0 && !processing && (
        <div className="flex flex-col items-center justify-center h-full text-center px-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-gray-300 font-medium text-base mb-1">Start a conversation</h3>
          <p className="text-gray-600 text-sm max-w-xs">
            Type a message below to begin. Your AI agent is ready to help.
          </p>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {(() => {
            let usageIdx = 0
            return groups.map((group) => {
              const first = group[0]

              // User message — a new user message means the previous AI turn ended,
              // so show the usage badge for the previous turn right before this bubble
              if (first.sender === 'user') {
                const badge = usageIdx > 0 && usageHistory && usageHistory[usageIdx - 1]
                  ? <UsageBadge key={`usage-${usageIdx - 1}`} stats={usageHistory[usageIdx - 1]} turnNumber={usageIdx} />
                  : null
                usageIdx++
                return badge
                  ? <div key={`turn-${first.id}`}>{badge}<UserBubble content={first.output.content} timestamp={first.timestamp} /></div>
                  : <UserBubble key={first.id} content={first.output.content} timestamp={first.timestamp} />
              }

              // Grouped AI text messages (only groups streaming fragments from same response)
              if (first.output.type === 'text' && group.length > 0) {
                const combined = group.map((m) => m.output.content).join('\n\n')
                return <AIBubble key={first.id} content={combined} onSaveAsNote={onSaveAsNote} timestamp={first.timestamp} />
              }

              // Single non-text messages
              return group.map((msg) => (
                <MessageRow key={msg.id} msg={msg} onPermissionResponse={onPermissionResponse} />
              ))
            })
          })()}

          {/* Show usage badge for the last turn if not processing */}
          {!processing && totalUsage > 0 && usageHistory && (
            <UsageBadge stats={usageHistory[totalUsage - 1]} turnNumber={totalUsage} />
          )}

          {processing && <ThinkingIndicator />}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Processing with no messages yet */}
      {messages.length === 0 && processing && (
        <div className="max-w-3xl mx-auto px-4 py-6">
          <ThinkingIndicator />
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

// ── User bubble ─────────────────────────────────────────────────────────────

function formatTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function UserBubble({ content, timestamp }: { content: string; timestamp?: number }): JSX.Element {
  return (
    <div className="flex justify-end animate-fadeIn">
      <div className="max-w-[80%] flex items-end gap-2.5">
        {timestamp && <span className="text-[10px] text-gray-600 mb-1 flex-shrink-0">{formatTime(timestamp)}</span>}
        <div className="text-white rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm" style={{ backgroundColor: 'var(--brand-btn-primary)' }}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</p>
        </div>
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--brand-btn-hover)' }}>
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ── AI bubble with markdown ─────────────────────────────────────────────────

function AIBubble({ content, onSaveAsNote, timestamp }: { content: string; onSaveAsNote?: (content: string) => void; timestamp?: number }): JSX.Element {
  const [saved, setSaved] = useState(false)

  if (!content?.trim()) return <></>

  const handleSave = () => {
    onSaveAsNote?.(content)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex justify-start animate-fadeIn group/ai">
      <div className="max-w-[85%] flex items-start gap-2.5">
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mt-0.5">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          {timestamp && <span className="text-[9px] text-gray-600">{formatTime(timestamp)}</span>}
        </div>
        <div className="relative">
          <div className="rounded-2xl rounded-tl-md px-4 py-3 shadow-sm" style={{ backgroundColor: 'var(--brand-dark-card)', border: '1px solid var(--brand-dark-border)' }}>
            <div className="prose-chat text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{content}</ReactMarkdown>
            </div>
          </div>
          {/* Save as memory button — appears on hover */}
          {onSaveAsNote && (
            <button
              onClick={handleSave}
              className={`absolute -bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                saved
                  ? 'bg-green-900/80 text-green-300 opacity-100'
                  : 'bg-gray-800/80 text-gray-500 hover:text-gray-300 hover:bg-gray-700/80 opacity-0 group-hover/ai:opacity-100'
              }`}
              title="Save this response as a memory note"
            >
              {saved ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Saved
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  Save as Memory
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Single message dispatcher (for non-text types) ──────────────────────────

function MessageRow({
  msg,
  onPermissionResponse,
}: {
  msg: OutputMessage
  onPermissionResponse: (r: 'y' | 'n') => void
}): JSX.Element {
  const { output } = msg

  switch (output.type) {
    case 'thinking':
      return <ThinkingBubble content={output.content} />

    case 'error':
      return <ErrorBubble content={output.content} />

    case 'status':
      return <StatusLine content={output.content} />

    case 'tool-use':
      return <ToolUseCard output={output} />

    case 'permission-request':
      return <PermissionCard content={output.content} onResponse={onPermissionResponse} />

    case 'text':
      // Fallback: if text but not grouped (shouldn't happen often)
      if (msg.sender === 'user') return <UserBubble content={output.content} />
      return <AIBubble content={output.content} />

    default:
      return <AIBubble content={output.content} />
  }
}

// ── Thinking bubble ─────────────────────────────────────────────────────────

function ThinkingBubble({ content }: { content: string }): JSX.Element {
  if (!content?.trim()) return <></>
  return (
    <div className="flex justify-start animate-fadeIn">
      <div className="max-w-[85%] flex items-start gap-2.5">
        <div className="w-7 h-7 flex-shrink-0" /> {/* spacer for alignment */}
        <details className="group">
          <summary className="text-gray-500 text-xs cursor-pointer select-none flex items-center gap-1.5 hover:text-gray-400 transition-colors">
            <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Internal reasoning
          </summary>
          <div className="mt-1.5 bg-gray-900/50 border border-gray-800/50 rounded-xl px-3 py-2">
            <p className="text-gray-500 text-xs italic leading-relaxed whitespace-pre-wrap">{content}</p>
          </div>
        </details>
      </div>
    </div>
  )
}

// ── Error bubble ────────────────────────────────────────────────────────────

function ErrorBubble({ content }: { content: string }): JSX.Element {
  return (
    <div className="flex justify-start animate-fadeIn">
      <div className="max-w-[85%] flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div className="bg-red-950/40 border border-red-900/50 rounded-2xl rounded-tl-md px-4 py-2.5">
          <p className="text-red-300 text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</p>
        </div>
      </div>
    </div>
  )
}

// ── Status line ─────────────────────────────────────────────────────────────

function StatusLine({ content }: { content: string }): JSX.Element {
  return (
    <div className="flex justify-center animate-fadeIn">
      <span className="text-gray-600 text-xs bg-gray-900/50 px-3 py-1 rounded-full">{content}</span>
    </div>
  )
}

// ── Tool use card ───────────────────────────────────────────────────────────

function ToolUseCard({ output }: { output: ParsedOutput }): JSX.Element {
  return (
    <div className="flex justify-start animate-fadeIn">
      <div className="max-w-[85%] flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-blue-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <details className="rounded-2xl rounded-tl-md overflow-hidden group shadow-sm">
          <summary className="px-4 py-2.5 cursor-pointer select-none flex items-center gap-2 text-sm">
            <svg className="w-3 h-3 text-gray-500 group-open:rotate-90 transition-transform" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-blue-400 font-medium">{output.content || 'Tool call'}</span>
          </summary>
          {output.metadata && (
            <div className="px-4 pb-3 border-t border-gray-800">
              <pre className="mt-2 text-xs text-gray-500 overflow-x-auto max-h-48 leading-relaxed">
                {JSON.stringify(output.metadata, null, 2)}
              </pre>
            </div>
          )}
        </details>
      </div>
    </div>
  )
}

// ── Permission card ─────────────────────────────────────────────────────────

function PermissionCard({
  content,
  onResponse,
}: {
  content: string
  onResponse: (r: 'y' | 'n') => void
}): JSX.Element {
  return (
    <div className="flex justify-start animate-fadeIn">
      <div className="max-w-[85%] flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-yellow-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-3.5 h-3.5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="bg-yellow-950/30 border border-yellow-800/40 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
          <p className="text-yellow-200 text-sm mb-3 leading-relaxed">{content}</p>
          <div className="flex gap-2">
            <button
              onClick={() => onResponse('y')}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
            >
              Allow
            </button>
            <button
              onClick={() => onResponse('n')}
              className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg transition-colors shadow-sm"
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Thinking indicator ──────────────────────────────────────────────────────

function ThinkingIndicator(): JSX.Element {
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setPhraseIdx((p) => (p + 1) % THINKING_PHRASES.length), 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  const formatElapsed = (s: number): string => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`)

  return (
    <div className="flex justify-start animate-fadeIn">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-3.5 h-3.5 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="rounded-2xl rounded-tl-md px-4 py-3 shadow-sm" style={{ backgroundColor: 'var(--brand-dark-card)', border: '1px solid var(--brand-dark-border)' }}>
          {/* Animated dots */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '0ms', backgroundColor: 'var(--brand-btn-primary)' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '150ms', backgroundColor: 'var(--brand-btn-primary)' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '300ms', backgroundColor: 'var(--brand-btn-primary)' }} />
            </div>
            <span className="text-gray-400 text-sm">{THINKING_PHRASES[phraseIdx]}</span>
          </div>
          {elapsed > 5 && (
            <p className="text-gray-600 text-xs mt-1.5">
              {formatElapsed(elapsed)}
              {elapsed > 15 && ' — complex tasks can take a minute'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Usage badge (clickable, expands to show token details) ──────────────────

function UsageBadge({ stats, turnNumber }: { stats: UsageStats; turnNumber: number }): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex justify-center animate-fadeIn my-1">
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-900/60 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/60 transition-all text-gray-500 hover:text-gray-400 text-[11px]"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {stats.requests ?? `Turn ${turnNumber}`}
          <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-30 overflow-hidden animate-fadeIn">
            <div className="px-3.5 py-2.5 border-b border-gray-800">
              <h4 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">Usage — Turn {turnNumber}</h4>
            </div>
            <div className="px-3.5 py-2.5 space-y-1.5">
              {stats.requests && <UsageRow label="Requests" value={stats.requests} />}
              {stats.apiTime && <UsageRow label="API Time" value={stats.apiTime} />}
              {stats.sessionTime && <UsageRow label="Session Time" value={stats.sessionTime} />}
              {stats.codeChanges && <UsageRow label="Code Changes" value={stats.codeChanges} />}
              {stats.model && <UsageRow label="Model" value={stats.model} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function UsageRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300 font-medium">{value}</span>
    </div>
  )
}
