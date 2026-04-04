import { useState, useRef, useCallback, useEffect } from 'react'

const COPILOT_SLASH_COMMANDS = [
  '/allow-all',
  '/cd',
  '/clear',
  '/compact',
  '/context',
  '/cwd',
  '/delegate',
  '/exit',
  '/experimental',
  '/fleet',
  '/help',
  '/list-dirs',
  '/list-files',
  '/login',
  '/model',
  '/review',
  '/resume',
  '/session',
  '/usage',
  '/yolo',
  '/add-dir',
]

const CLAUDE_SLASH_COMMANDS = [
  '/clear',
  '/compact',
  '/config',
  '/cost',
  '/effort',
  '/exit',
  '/fast',
  '/help',
  '/loop',
  '/mcp',
  '/model',
  '/permissions',
  '/plan',
  '/remote-control',
  '/review',
  '/rewind',
]

// Commands that take no arguments — safe to submit immediately on selection
const SELF_CONTAINED = new Set([
  '/clear', '/compact', '/context', '/cost', '/exit',
  '/experimental', '/fast', '/fleet', '/help', '/list-dirs',
  '/list-files', '/login', '/mcp', '/permissions', '/plan',
  '/rewind', '/review', '/session', '/usage', '/yolo',
  '/allow-all', '/config', '/effort',
])

interface Props {
  cli: 'copilot' | 'claude'
  onSend: (input: string) => void
  onSlashCommand: (command: string) => void
  disabled?: boolean
  processing?: boolean
}

export default function CommandInput({
  cli,
  onSend,
  onSlashCommand,
  disabled,
  processing,
}: Props): JSX.Element {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [justAccepted, setJustAccepted] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const commands = cli === 'copilot' ? COPILOT_SLASH_COMMANDS : CLAUDE_SLASH_COMMANDS

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [value])

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setValue('')
      setSuggestions([])
      setSelectedIdx(-1)
      setJustAccepted(false)

      if (trimmed.startsWith('/')) {
        onSlashCommand(trimmed)
      } else {
        onSend(trimmed)
      }
    },
    [onSend, onSlashCommand]
  )

  const acceptSuggestion = useCallback(
    (cmd: string) => {
      if (SELF_CONTAINED.has(cmd)) {
        submit(cmd)
      } else {
        setValue(cmd + ' ')
        setSuggestions([])
        setSelectedIdx(-1)
        setJustAccepted(true)
        textareaRef.current?.focus()
      }
    },
    [submit]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      setValue(val)
      setSelectedIdx(-1)
      setJustAccepted(false)

      if (val.startsWith('/') && !val.includes(' ')) {
        setSuggestions(commands.filter((c) => c.startsWith(val)))
      } else {
        setSuggestions([])
      }
    },
    [commands]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()

        if (suggestions.length > 0) {
          const idx = selectedIdx >= 0 ? selectedIdx : 0
          acceptSuggestion(suggestions[idx])
          return
        }

        if (justAccepted) {
          setJustAccepted(false)
          const afterCommand = value.replace(/^\/\S+\s*/, '')
          if (!afterCommand.trim()) return
        }

        submit(value)
        return
      }

      if (suggestions.length === 0) return

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((prev) => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((prev) => Math.min(suggestions.length - 1, prev + 1))
      } else if (e.key === 'Escape') {
        setSuggestions([])
        setSelectedIdx(-1)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const idx = selectedIdx >= 0 ? selectedIdx : 0
        acceptSuggestion(suggestions[idx])
      }
    },
    [value, suggestions, selectedIdx, justAccepted, submit, acceptSuggestion]
  )

  return (
    <div className="relative backdrop-blur-sm flex-shrink-0" style={{ borderTop: '1px solid var(--brand-dark-border)', backgroundColor: 'var(--brand-dark-page)' }}>
      {/* Slash command suggestions */}
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 backdrop-blur-sm rounded-xl overflow-hidden max-h-52 overflow-y-auto shadow-2xl" style={{ backgroundColor: 'var(--brand-dark-card)', border: '1px solid var(--brand-dark-border)' }}>
          {suggestions.map((cmd, i) => (
            <button
              key={cmd}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                i === selectedIdx
                  ? 'text-white'
                  : 'text-gray-300 hover:bg-gray-700/50'
              }`}
              style={i === selectedIdx ? { backgroundColor: 'var(--brand-btn-primary)', opacity: 0.2 } : {}}
              onMouseDown={(e) => {
                e.preventDefault()
                acceptSuggestion(cmd)
              }}
            >
              <span className="font-medium text-indigo-400">{cmd}</span>
              {SELF_CONTAINED.has(cmd) ? (
                <span className="text-gray-500 text-xs bg-gray-700/50 px-2 py-0.5 rounded-full">instant</span>
              ) : (
                <span className="text-gray-500 text-xs bg-gray-700/50 px-2 py-0.5 rounded-full">+ args</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className={`flex items-end gap-2 border rounded-2xl px-4 py-2.5 transition-colors ${
          disabled ? 'opacity-60' : ''
        }`} style={{ backgroundColor: 'var(--brand-dark-card)', borderColor: 'var(--brand-dark-border)' }}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={
              processing
                ? 'Waiting for response...'
                : disabled
                  ? 'Session stopped'
                  : 'Type a message... (/ for commands, & to delegate)'
            }
            className="flex-1 bg-transparent text-gray-100 text-sm placeholder-gray-500 outline-none resize-none min-h-[24px] max-h-[160px] leading-relaxed"
            autoFocus
          />
          <button
            onClick={() => submit(value)}
            disabled={disabled || !value.trim()}
            className="p-2 rounded-xl text-white transition-all flex-shrink-0 shadow-sm disabled:opacity-30"
            style={{ backgroundColor: 'var(--brand-btn-primary)' }}
            title="Send message"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
