import { useState, useRef, useEffect, useCallback } from 'react'
import type { PromptTemplate } from '../types/template'
import type { SelectedContextSource } from '../types/contextSources'
import ContextPicker, { type ContextPickerTab } from './ContextPicker'
import ModelChip from './ModelChip'
import type { BackendId } from '../../../shared/backends'
import { providerOf } from '../../../shared/backends'

// ── Slash command lists (mirrored from CommandInput) ─────────────────────────

const COPILOT_SLASH_COMMANDS = [
  '/allow-all', '/cd', '/clear', '/compact', '/context', '/cwd', '/delegate',
  '/exit', '/experimental', '/fleet', '/help', '/list-dirs', '/list-files',
  '/login', '/model', '/review', '/resume', '/session', '/usage', '/yolo',
  '/add-dir',
]

const CLAUDE_SLASH_COMMANDS = [
  '/clear', '/compact', '/config', '/cost', '/effort', '/exit', '/fast',
  '/help', '/loop', '/mcp', '/model', '/permissions', '/plan',
  '/remote-control', '/review', '/rewind',
]

const SELF_CONTAINED = new Set([
  '/clear', '/compact', '/context', '/cost', '/exit', '/experimental', '/fast',
  '/fleet', '/help', '/list-dirs', '/list-files', '/login', '/mcp', '/permissions',
  '/plan', '/rewind', '/review', '/session', '/usage', '/yolo', '/allow-all',
  '/config', '/effort',
])

// ── Public config (mirrors QuickComposeConfig — fields that travel together) ─

export interface ChatContextConfig {
  /** Selected prompt persona name (was "agent"). */
  agent?: string
  /** Selected playbook (skill) name. */
  skill?: string
  /** Sub-agent delegation: 'sub-agent' or 'background'. */
  delegate?: 'sub-agent' | 'background'
  /** Parallel Mode (was "Fleet") — instruct AI to dispatch parallel sub-agents. */
  fleet?: boolean
}

interface Props {
  cli: BackendId

  // Send / slash callbacks
  onSend: (input: string) => void
  onSlashCommand: (command: string) => void

  // Lifecycle
  disabled?: boolean
  processing?: boolean
  /** True only when there is an active running session — gates the model chip. */
  hasActiveSession?: boolean

  // Context state
  config: ChatContextConfig
  onConfigChange: (next: ChatContextConfig) => void

  selectedNoteIds: Set<string>
  onToggleNote: (id: string) => void
  onClearNotes: () => void

  selectedContextSources: SelectedContextSource[]
  onToggleContextSource: (source: SelectedContextSource) => void
  onRemoveContextSource: (providerId: string) => void
  onClearContextSources: () => void

  onTemplateSelect?: (template: PromptTemplate) => void

  // Model chip
  /** Currently active model for the session. Falls back to default when undefined. */
  currentModel?: string
  /** Called when user picks a new model. The Work page wires this to send `/model <name>`. */
  onModelChange?: (model: string) => void
}

/**
 * Unified chat input area: active context strip (top) + input row (bottom).
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ [Prompt: Coach] [2 notes] [Playbook: Email] [Parallel]      x   │  ← context strip
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ [+] [model]                                                      │
 *   │     ┌──────────────────────────────────────────────────────┐ [→] │
 *   │     │ Type a message...                                    │     │
 *   │     └──────────────────────────────────────────────────────┘     │
 *   └──────────────────────────────────────────────────────────────────┘
 */
export default function ChatInputArea(props: Props): JSX.Element {
  const {
    cli,
    onSend,
    onSlashCommand,
    disabled,
    processing,
    hasActiveSession,
    config,
    onConfigChange,
    selectedNoteIds,
    onToggleNote,
    onClearNotes,
    selectedContextSources,
    onToggleContextSource,
    onRemoveContextSource,
    onClearContextSources,
    onTemplateSelect,
    currentModel,
    onModelChange,
  } = props

  // Picker state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTab, setPickerTab] = useState<ContextPickerTab>('prompts')

  // Textarea + slash-command state
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [justAccepted, setJustAccepted] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const commands = providerOf(cli) === 'copilot' ? COPILOT_SLASH_COMMANDS : CLAUDE_SLASH_COMMANDS

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [value])

  // ── Send handlers ────────────────────────────────────────────────────────
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
    [onSend, onSlashCommand],
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
    [submit],
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
    [commands],
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
    [value, suggestions, selectedIdx, justAccepted, submit, acceptSuggestion],
  )

  // ── Context badges ───────────────────────────────────────────────────────
  const removeBadge = (key: keyof ChatContextConfig) => {
    const next = { ...config }
    delete next[key]
    onConfigChange(next)
  }

  const noteCount = selectedNoteIds.size
  const ctxCount = selectedContextSources.length
  const hasContext =
    !!config.agent ||
    !!config.skill ||
    !!config.fleet ||
    !!config.delegate ||
    noteCount > 0 ||
    ctxCount > 0

  const clearAll = () => {
    onConfigChange({})
    if (noteCount > 0) onClearNotes()
    if (ctxCount > 0) onClearContextSources()
  }

  const openPickerOn = (tab: ContextPickerTab) => {
    setPickerTab(tab)
    setPickerOpen(true)
  }

  return (
    <div
      className="relative backdrop-blur-sm flex-shrink-0"
      style={{ borderTop: '1px solid var(--brand-dark-border)', backgroundColor: 'var(--brand-dark-page)' }}
    >
      {/* Slash command suggestions popover */}
      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="Slash command suggestions"
          className="absolute bottom-full left-4 right-4 mb-2 backdrop-blur-sm rounded-xl overflow-hidden max-h-52 overflow-y-auto shadow-2xl z-30 animate-fadeIn"
          style={{ backgroundColor: 'var(--brand-dark-card)', border: '1px solid var(--brand-dark-border)' }}
        >
          {suggestions.map((cmd, i) => (
            <button
              key={cmd}
              role="option"
              aria-selected={i === selectedIdx}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                i === selectedIdx ? 'text-white' : 'text-gray-300 hover:bg-gray-700/50'
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

      {/* Active context strip */}
      {hasContext && (
        <div className="flex items-center gap-1.5 px-4 pt-2 pb-1 flex-wrap">
          {config.agent && (
            <Badge
              color="bg-green-900/40 text-green-300 border-green-700/50"
              label={`Prompt: ${config.agent}`}
              tooltip="This prompt's instructions will guide the AI's response."
              onRemove={() => removeBadge('agent')}
            />
          )}
          {noteCount > 0 && (
            <Badge
              color="bg-indigo-900/40 text-indigo-300 border-indigo-700/50"
              label={`${noteCount} note${noteCount === 1 ? '' : 's'}`}
              tooltip="Selected notes will be attached as reference context."
              onRemove={onClearNotes}
            />
          )}
          {config.skill && (
            <Badge
              color="bg-amber-900/40 text-amber-300 border-amber-700/50"
              label={`Playbook: ${config.skill}`}
              tooltip="This playbook will be injected to guide the response."
              onRemove={() => removeBadge('skill')}
            />
          )}
          {ctxCount > 0 &&
            selectedContextSources.map((cs) => (
              <Badge
                key={cs.providerId}
                color="bg-teal-900/40 text-teal-300 border-teal-700/50"
                label={cs.paramSummary ? `${cs.label} (${cs.paramSummary})` : cs.label}
                tooltip="Live data from this connected source will be attached."
                onRemove={() => onRemoveContextSource(cs.providerId)}
              />
            ))}
          {config.fleet && (
            <Badge
              color="bg-sky-900/40 text-sky-300 border-sky-700/50"
              label="Parallel Mode"
              tooltip="The AI may dispatch multiple sub-agents in parallel."
              onRemove={() => removeBadge('fleet')}
            />
          )}
          {config.delegate && (
            <Badge
              color="bg-purple-900/40 text-purple-300 border-purple-700/50"
              label={`Delegate: ${config.delegate}`}
              tooltip="The next message will be delegated to a background agent."
              onRemove={() => removeBadge('delegate')}
            />
          )}
          <button
            onClick={clearAll}
            className="text-[10px] text-gray-500 hover:text-gray-300 ml-auto"
            title="Remove all context"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div
          className={`flex items-end gap-2 border rounded-2xl px-3 py-2 transition-colors ${disabled ? 'opacity-60' : ''}`}
          style={{ backgroundColor: 'var(--brand-dark-card)', borderColor: 'var(--brand-dark-border)' }}
        >
          {/* Left controls: + picker, model chip, parallel mode toggle */}
          <div className="flex items-center gap-1.5 self-end pb-0.5 relative">
            <button
              type="button"
              onClick={() => {
                setPickerTab('prompts')
                setPickerOpen((o) => !o)
              }}
              disabled={disabled}
              title="Attach prompts, notes, playbooks, or files"
              aria-label="Attach context"
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors border ${
                pickerOpen
                  ? 'bg-indigo-900/40 border-indigo-600/60 text-indigo-200'
                  : 'bg-gray-800/70 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {hasActiveSession && onModelChange && (
              <ModelChip
                cli={cli}
                currentModel={currentModel}
                onChange={onModelChange}
                disabled={disabled}
              />
            )}

            {/* Context picker popover */}
            <ContextPicker
              cli={cli}
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              defaultTab={pickerTab}
              selectedAgent={config.agent}
              selectedSkill={config.skill}
              selectedNoteIds={selectedNoteIds}
              selectedContextSources={selectedContextSources}
              onSelectAgent={(name) => onConfigChange({ ...config, agent: name })}
              onSelectSkill={(name) => onConfigChange({ ...config, skill: name })}
              onToggleNote={onToggleNote}
              onClearNotes={onClearNotes}
              onToggleContextSource={onToggleContextSource}
              onRemoveContextSource={onRemoveContextSource}
              onTemplateSelect={onTemplateSelect}
            />
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            aria-label="Message input"
            placeholder={
              processing
                ? 'Waiting for response...'
                : disabled
                  ? 'Session stopped'
                  : 'Type a message... (/ for commands, & to delegate)'
            }
            className="flex-1 bg-transparent text-gray-100 text-sm placeholder-gray-500 outline-none resize-none min-h-[24px] max-h-[160px] leading-relaxed py-1"
            autoFocus
          />

          {/* Parallel Mode toggle (Copilot only) */}
          {providerOf(cli) === 'copilot' && (
            <button
              type="button"
              onClick={() => onConfigChange({ ...config, fleet: !config.fleet })}
              disabled={disabled}
              title={config.fleet ? 'Parallel Mode is on' : 'Run multiple tasks at once (Parallel Mode)'}
              aria-pressed={!!config.fleet}
              aria-label="Toggle parallel mode"
              className={`self-end mb-0.5 w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                config.fleet
                  ? 'bg-sky-900/40 text-sky-300'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </button>
          )}

          <button
            onClick={() => submit(value)}
            disabled={disabled || !value.trim()}
            className="self-end mb-0.5 w-8 h-8 rounded-xl flex items-center justify-center text-white transition-all flex-shrink-0 shadow-sm disabled:opacity-30"
            style={{ backgroundColor: 'var(--brand-btn-primary)' }}
            title="Send message"
            aria-label="Send message"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <button
            onClick={() => openPickerOn('prompts')}
            className="text-[10px] text-gray-600 hover:text-gray-400"
          >
            + Attach context
          </button>
          <p className="text-[10px] text-gray-600">Press Enter to send, Shift+Enter for new line</p>
          <span className="text-[10px] text-gray-600 invisible">spacer</span>
        </div>
      </div>
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({
  color,
  label,
  tooltip,
  onRemove,
}: {
  color: string
  label: string
  tooltip?: string
  onRemove: () => void
}): JSX.Element {
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${color}`}
    >
      {label}
      <button
        onClick={onRemove}
        className="hover:opacity-70 ml-0.5 leading-none"
        aria-label={`Remove ${label}`}
      >
        &times;
      </button>
    </span>
  )
}
