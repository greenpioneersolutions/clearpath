import { useState, useEffect, useRef } from 'react'
import type { BackendId } from '../../../../shared/backends'
import type { AgentDef, AgentListResult } from '../../types/ipc'

interface InstallStatus {
  copilot: boolean
  claude: boolean
}

export type QuickStartPermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'

const PERMISSION_MODES: ReadonlyArray<{ value: QuickStartPermissionMode; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'plan', label: 'Plan' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'bypassPermissions', label: 'Bypass permissions' },
]

const ADVANCED_KEY = 'quickStartAdvanced'

interface AdvancedState {
  agent: string
  permissionMode: QuickStartPermissionMode
  additionalDirsRaw: string
}

const DEFAULT_ADVANCED: AdvancedState = {
  agent: '',
  permissionMode: 'default',
  additionalDirsRaw: '',
}

function loadAdvanced(): AdvancedState {
  try {
    const raw = window.localStorage.getItem(ADVANCED_KEY)
    if (!raw) return DEFAULT_ADVANCED
    const parsed = JSON.parse(raw) as Partial<AdvancedState> & { additionalDirs?: string[] }
    const dirsRaw = typeof parsed.additionalDirsRaw === 'string'
      ? parsed.additionalDirsRaw
      : Array.isArray(parsed.additionalDirs) ? parsed.additionalDirs.join(', ') : ''
    const mode: QuickStartPermissionMode =
      parsed.permissionMode && PERMISSION_MODES.some((m) => m.value === parsed.permissionMode)
        ? (parsed.permissionMode as QuickStartPermissionMode)
        : 'default'
    return {
      agent: typeof parsed.agent === 'string' ? parsed.agent : '',
      permissionMode: mode,
      additionalDirsRaw: dirsRaw,
    }
  } catch {
    return DEFAULT_ADVANCED
  }
}

function splitDirs(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
}

interface Props {
  /**
   * Called when the user submits a prompt. Implementation should start a new
   * session via `cli:start-session` and switch the UI into session view.
   */
  onSubmit: (opts: {
    prompt: string
    cli: BackendId
    model?: string
    agent?: string
    permissionMode?: string
    additionalDirs?: string[]
  }) => void
  /** Initial CLI selection (typically the user's last-used CLI). */
  defaultCli?: BackendId
}

const CLI_CHOICES: Array<{ id: BackendId; label: string; provider: 'copilot' | 'claude' | 'local' }> = [
  { id: 'copilot-cli', label: 'Copilot', provider: 'copilot' },
  { id: 'claude-cli', label: 'Claude', provider: 'claude' },
]

export default function QuickStartCard({ onSubmit, defaultCli }: Props): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [cli, setCli] = useState<BackendId>(defaultCli ?? 'copilot-cli')
  const [model, setModel] = useState('')
  const [installed, setInstalled] = useState<InstallStatus>({ copilot: true, claude: true })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advanced, setAdvanced] = useState<AdvancedState>(loadAdvanced)
  const [agents, setAgents] = useState<AgentDef[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const status = await window.electronAPI.invoke('cli:check-installed') as InstallStatus | null
        if (status && typeof status === 'object') setInstalled(status)
      } catch {
        // Best-effort — if the IPC fails, leave optimistic defaults so the user can still try.
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const result = await window.electronAPI.invoke('agent:list') as AgentListResult
        const provider = cli === 'claude-cli' ? 'claude' : 'copilot'
        setAgents(result?.[provider] ?? [])
      } catch {
        setAgents([])
      }
    })()
  }, [cli])

  useEffect(() => {
    try {
      window.localStorage.setItem(ADVANCED_KEY, JSON.stringify(advanced))
    } catch {
      // localStorage unavailable — best effort
    }
  }, [advanced])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`
  }, [prompt])

  const trimmed = prompt.trim()
  const canSubmit = trimmed.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    const dirs = splitDirs(advanced.additionalDirsRaw)
    onSubmit({
      prompt: trimmed,
      cli,
      model: model.trim() || undefined,
      agent: advanced.agent || undefined,
      permissionMode: advanced.permissionMode === 'default' ? undefined : advanced.permissionMode,
      additionalDirs: dirs.length > 0 ? dirs : undefined,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isCliDisabled = (id: BackendId): boolean => {
    if (id === 'copilot-cli') return !installed.copilot
    if (id === 'claude-cli') return !installed.claude
    return false
  }

  return (
    <section
      data-testid="quick-start-card"
      className="rounded-2xl p-6 shadow-lg"
      style={{
        background: 'linear-gradient(135deg, rgba(91,79,196,0.12) 0%, rgba(29,158,117,0.08) 100%)',
        border: '1px solid rgba(127,119,221,0.25)',
      }}
    >
      <div className="mb-4">
        <h2 className="text-white text-lg font-semibold">Start something new</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Describe a task and we&apos;ll spin up a chat with your AI agent.
        </p>
      </div>

      <textarea
        ref={textareaRef}
        data-testid="quick-start-textarea"
        aria-label="New chat prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What do you want to do? Describe a task and we'll start a new chat."
        rows={3}
        className="w-full resize-none bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
      />

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <label className="flex items-center gap-2">
          <span className="text-xs text-gray-400">CLI</span>
          <select
            data-testid="quick-start-cli"
            aria-label="CLI backend"
            value={cli}
            onChange={(e) => setCli(e.target.value as BackendId)}
            className="bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {CLI_CHOICES.map((c) => {
              const disabled = isCliDisabled(c.id)
              return (
                <option key={c.id} value={c.id} disabled={disabled} title={disabled ? `${c.label} CLI not installed` : undefined}>
                  {c.label}{disabled ? ' (not installed)' : ''}
                </option>
              )
            })}
          </select>
        </label>

        <label className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-xs text-gray-400">Model</span>
          <input
            data-testid="quick-start-model"
            aria-label="Model (optional)"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="default"
            className="flex-1 bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <button
          data-testid="quick-start-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="ml-auto inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#5B4FC4' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      <div className="mt-4">
        <button
          type="button"
          data-testid="quick-start-advanced-toggle"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          aria-controls="quick-start-advanced"
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
        >
          Advanced {advancedOpen ? '▴' : '▾'}
        </button>

        {advancedOpen && (
          <div
            id="quick-start-advanced"
            data-testid="quick-start-advanced"
            className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg border border-gray-800 bg-gray-900/30"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Agent</span>
              <select
                data-testid="quick-start-agent"
                aria-label="Agent (optional)"
                value={advanced.agent}
                onChange={(e) => setAdvanced((a) => ({ ...a, agent: e.target.value }))}
                className="bg-gray-900/80 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">(none)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Permission mode</span>
              <select
                data-testid="quick-start-permission-mode"
                aria-label="Permission mode"
                value={advanced.permissionMode}
                onChange={(e) => setAdvanced((a) => ({ ...a, permissionMode: e.target.value as QuickStartPermissionMode }))}
                className="bg-gray-900/80 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {PERMISSION_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Additional directories</span>
              <input
                data-testid="quick-start-additional-dirs"
                aria-label="Additional directories"
                type="text"
                value={advanced.additionalDirsRaw}
                onChange={(e) => setAdvanced((a) => ({ ...a, additionalDirsRaw: e.target.value }))}
                placeholder="e.g. /path/to/repo, /path/to/docs"
                className="bg-gray-900/80 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
          </div>
        )}
      </div>
    </section>
  )
}
