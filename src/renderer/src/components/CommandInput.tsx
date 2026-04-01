import { useState, useRef, useCallback } from 'react'

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

// Commands that take no arguments — submit immediately on selection
const SELF_CONTAINED = new Set([
  '/clear',
  '/compact',
  '/context',
  '/cost',
  '/exit',
  '/experimental',
  '/fast',
  '/fleet',
  '/help',
  '/list-dirs',
  '/list-files',
  '/login',
  '/mcp',
  '/permissions',
  '/plan',
  '/rewind',
  '/review',
  '/session',
  '/usage',
  '/yolo',
  '/allow-all',
  '/config',
  '/effort',
])

interface Props {
  cli: 'copilot' | 'claude'
  onSend: (input: string) => void
  onSlashCommand: (command: string) => void
  disabled?: boolean
}

export default function CommandInput({
  cli,
  onSend,
  onSlashCommand,
  disabled,
}: Props): JSX.Element {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = cli === 'copilot' ? COPILOT_SLASH_COMMANDS : CLAUDE_SLASH_COMMANDS

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setValue('')
      setSuggestions([])
      setSelectedIdx(-1)

      if (trimmed.startsWith('/')) {
        onSlashCommand(trimmed)
      } else {
        onSend(trimmed)
      }
    },
    [onSend, onSlashCommand]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setValue(val)
      setSelectedIdx(-1)

      if (val.startsWith('/')) {
        setSuggestions(commands.filter((c) => c.startsWith(val)))
      } else {
        setSuggestions([])
      }
    },
    [commands]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (selectedIdx >= 0 && suggestions[selectedIdx]) {
          const cmd = suggestions[selectedIdx]
          if (SELF_CONTAINED.has(cmd)) {
            submit(cmd)
          } else {
            setValue(cmd + ' ')
            setSuggestions([])
            setSelectedIdx(-1)
          }
        } else {
          submit(value)
        }
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
        const cmd = suggestions[idx]
        if (SELF_CONTAINED.has(cmd)) {
          submit(cmd)
        } else {
          setValue(cmd + ' ')
          setSuggestions([])
          setSelectedIdx(-1)
        }
      }
    },
    [value, suggestions, selectedIdx, submit]
  )

  const promptChar = value.startsWith('!') ? '!' : '›'

  return (
    <div className="relative border-t border-gray-800 bg-gray-900 flex-shrink-0">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 bg-gray-800 border border-gray-700 border-b-0 rounded-t-lg overflow-hidden max-h-52 overflow-y-auto shadow-xl">
          {suggestions.map((cmd, i) => (
            <button
              key={cmd}
              className={`w-full text-left px-4 py-2 text-sm font-mono transition-colors ${
                i === selectedIdx
                  ? 'bg-indigo-700 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                if (SELF_CONTAINED.has(cmd)) {
                  submit(cmd)
                } else {
                  setValue(cmd + ' ')
                  setSuggestions([])
                  setSelectedIdx(-1)
                  inputRef.current?.focus()
                }
              }}
            >
              <span className="text-indigo-400">{cmd}</span>
              {SELF_CONTAINED.has(cmd) && (
                <span className="ml-2 text-gray-500 text-xs">↵</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-gray-500 font-mono text-base select-none w-4 text-center flex-shrink-0">
          {promptChar}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            disabled
              ? 'Session stopped'
              : 'Message, /command, or !shell…'
          }
          className="flex-1 bg-transparent text-gray-100 text-sm font-mono placeholder-gray-600 outline-none disabled:opacity-50"
          autoFocus
        />
        <button
          onClick={() => submit(value)}
          disabled={disabled || !value.trim()}
          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-xs font-medium rounded-md transition-colors flex-shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  )
}
