import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import type { BackendId, BackendProvider, BackendTransport } from '../../../../shared/backends'
import { providerOf, transportOf } from '../../../../shared/backends'
import type { AgentDef, AgentListResult, AuthState, ProviderAuthState } from '../../types/ipc'
import { MODEL_TIERS } from '../../data/modelTiers'

interface InstallStatus {
  copilot: boolean
  claude: boolean
}

interface ProviderReadiness {
  cli: boolean
  sdk: boolean
}

type ReadinessMap = Record<BackendProvider, ProviderReadiness>

const EMPTY_READINESS: ReadinessMap = {
  copilot: { cli: true, sdk: false },
  claude:  { cli: true, sdk: false },
}

const PROVIDERS: ReadonlyArray<{ id: BackendProvider; label: string }> = [
  { id: 'copilot', label: 'Copilot' },
  { id: 'claude',  label: 'Claude' },
]

const TRANSPORTS: ReadonlyArray<{ id: BackendTransport; label: string }> = [
  { id: 'cli', label: 'CLI' },
  { id: 'sdk', label: 'SDK' },
]

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

interface SkillRow {
  id: string
  name: string
  description?: string
  enabled: boolean
  scope: 'project' | 'global' | 'plugin' | 'team'
  cli: 'copilot' | 'claude' | 'both'
}

interface NoteRow {
  id: string
  title: string
  category: string
  tags: string[]
  updatedAt: number
  pinned: boolean
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
   * Called when the user submits a prompt. The implementation should start a
   * new session via `cli:start-session` and switch the UI into session view.
   *
   * `prompt` is the augmented body that should actually be sent to the CLI
   * (it may include trailing `@/path` references for attached files and
   * selected memory entries). `displayPrompt`, when present, is the clean
   * user-typed text — use it for the chat header / session name so the user
   * isn't shown the raw injected paths.
   *
   * `contextSummary` mirrors what `startSession` already accepts and renders
   * a small "Session launched with context: …" card in the session view.
   */
  onSubmit: (opts: {
    prompt: string
    displayPrompt?: string
    cli: BackendId
    model?: string
    agent?: string
    permissionMode?: string
    additionalDirs?: string[]
    contextSummary?: { memories?: string[]; agent?: string; skill?: string }
    attachedAgent?: { id: string; name: string }
    attachedSkills?: Array<{ id: string; name: string }>
    attachedNotes?: Array<{ id: string; title: string }>
  }) => void
  /** Initial CLI selection (typically the user's last-used backend). */
  defaultCli?: BackendId
}

function isProviderAuthState(v: unknown): v is ProviderAuthState {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.cli === 'object' && o.cli !== null && typeof o.sdk === 'object' && o.sdk !== null
}

function isReady(s: { installed?: boolean; authenticated?: boolean } | undefined): boolean {
  return Boolean(s && s.installed && s.authenticated)
}

/**
 * Reusable picker section: label + count + search box + scrollable item list.
 * The body is rendered as children so each picker can wire its own item shape
 * without forcing a generic.
 */
function SectionPicker({
  label,
  hint,
  search,
  onSearch,
  count,
  placeholder,
  empty,
  testId,
  children,
}: {
  label: string
  hint?: string
  search: string
  onSearch: (s: string) => void
  count: number
  placeholder: string
  empty: string
  testId?: string
  children: ReactNode
}): JSX.Element {
  // React.Children doesn't catch the .filter() result that returns 0 valid
  // nodes from a list — we count rendered children manually so the empty
  // hint shows up cleanly when search filters everything out.
  const childArray = Array.isArray(children) ? children : [children]
  const visibleCount = childArray.flat().filter((c) => c !== null && c !== false).length
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
          {label}
          {count > 0 && (
            <span className="ml-2 text-[10px] text-gray-500 normal-case font-normal">{count} selected</span>
          )}
        </span>
        {hint && <span className="text-[10px] text-gray-500 truncate normal-case font-normal">{hint}</span>}
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-900/80 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="bg-gray-900/40 border border-gray-800 rounded-md max-h-40 overflow-y-auto p-1 space-y-0.5">
        {visibleCount === 0 && (
          <p className="text-[11px] text-gray-500 px-2 py-3 text-center">{empty}</p>
        )}
        {children}
      </div>
    </div>
  )
}

export default function QuickStartCard({ onSubmit, defaultCli }: Props): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<BackendProvider>(() => providerOf(defaultCli ?? 'copilot-cli'))
  const [transport, setTransport] = useState<BackendTransport>(() => transportOf(defaultCli ?? 'copilot-cli'))
  const [model, setModel] = useState('')
  const [readiness, setReadiness] = useState<ReadinessMap>(EMPTY_READINESS)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advanced, setAdvanced] = useState<AdvancedState>(loadAdvanced)
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [notes, setNotes] = useState<NoteRow[]>([])
  // Per-session multi-select state. These do NOT mutate global skill or note
  // state — they only mark what gets attached to the next session.
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set())
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  // Search filters per picker so the user can find an item without scrolling.
  const [agentSearch, setAgentSearch] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [noteSearch, setNoteSearch] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Pull readiness from auth:get-status (preferred — splits CLI vs SDK), then
  // fall back to cli:check-installed for the CLI-only signal. Both may fail
  // (best-effort) — we leave optimistic defaults so the user can still try.
  useEffect(() => {
    void (async () => {
      let auth: AuthState | null = null
      try {
        auth = await window.electronAPI.invoke('auth:get-status') as AuthState | null
      } catch {
        auth = null
      }

      const next: ReadinessMap = { copilot: { cli: false, sdk: false }, claude: { cli: false, sdk: false } }

      if (auth && isProviderAuthState(auth.copilot) && isProviderAuthState(auth.claude)) {
        next.copilot = { cli: isReady(auth.copilot.cli), sdk: isReady(auth.copilot.sdk) }
        next.claude  = { cli: isReady(auth.claude.cli),  sdk: isReady(auth.claude.sdk)  }
      } else {
        try {
          const status = await window.electronAPI.invoke('cli:check-installed') as InstallStatus | null
          if (status && typeof status === 'object') {
            next.copilot.cli = !!status.copilot
            next.claude.cli  = !!status.claude
          } else {
            next.copilot.cli = true
            next.claude.cli  = true
          }
        } catch {
          next.copilot.cli = true
          next.claude.cli  = true
        }
      }

      setReadiness(next)
    })()
  }, [])

  // Agents and skills are scoped to the active provider; notes are global.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let cwd = ''
      try {
        const c = await window.electronAPI.invoke('app:get-cwd') as string | null
        cwd = typeof c === 'string' ? c : ''
      } catch {
        cwd = ''
      }
      if (cancelled) return

      try {
        // Without `workingDir`, AgentManager only scans global ~/.github/agents
        // and ~/.claude/agents — project-scoped .github/agents/ and
        // .claude/agents/ files would silently disappear from this list.
        const result = await window.electronAPI.invoke('agent:list', { workingDir: cwd || undefined }) as AgentListResult
        const loaded = result?.[provider] ?? []
        if (!cancelled) {
          setAgents(loaded)
          // Drop a saved agent id that no longer matches the loaded list.
          // Otherwise the controlled <select> renders the first option ("(none)")
          // while state still holds the stale id, and submit silently sends
          // `--agent <stale>` to the CLI.
          setAdvanced((a) => (a.agent && !loaded.some((x) => x.id === a.agent) ? { ...a, agent: '' } : a))
        }
      } catch {
        if (!cancelled) setAgents([])
      }

      try {
        // Handler signature is `{ workingDirectory }` (passing `{ cli }` makes
        // it crash on join(undefined, ...) and return nothing). It returns
        // skills for both providers, so filter client-side.
        const list = await window.electronAPI.invoke('skills:list', { workingDirectory: cwd }) as SkillRow[] | null
        if (!cancelled) {
          const filtered = Array.isArray(list)
            ? list.filter((s) => s.cli === provider || s.cli === 'both')
            : []
          setSkills(filtered)
          // Drop selections that no longer match the loaded list (e.g. a skill
          // that exists for Claude but not Copilot when the provider switches).
          setSelectedSkillIds((prev) => {
            const valid = new Set(filtered.map((s) => s.id))
            const next = new Set([...prev].filter((id) => valid.has(id)))
            return next.size === prev.size ? prev : next
          })
        }
      } catch {
        if (!cancelled) setSkills([])
      }
    })()
    return () => { cancelled = true }
  }, [provider])

  // Notes are global — load once and keep fresh. We deliberately don't refetch
  // when the provider switches.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await window.electronAPI.invoke('notes:list') as NoteRow[] | null
        if (cancelled) return
        const normalized = Array.isArray(list)
          ? list.map((n) => ({ ...n, tags: n.tags ?? [] }))
          : []
        setNotes(normalized)
        setSelectedNoteIds((prev) => {
          const valid = new Set(normalized.map((n) => n.id))
          const next = new Set([...prev].filter((id) => valid.has(id)))
          return next.size === prev.size ? prev : next
        })
      } catch {
        if (!cancelled) setNotes([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  // If the currently selected transport isn't ready but the other is, switch
  // to the ready one so the user doesn't submit into a dead backend.
  useEffect(() => {
    const r = readiness[provider]
    if (r[transport]) return
    if (transport === 'sdk' && r.cli) setTransport('cli')
    else if (transport === 'cli' && r.sdk) setTransport('sdk')
  }, [provider, transport, readiness])

  // Clear any saved model id that doesn't exist in the new provider's tier
  // list. Same reason as the agent guard above: a controlled <select> with no
  // matching option silently keeps the stale value in state and submits it.
  useEffect(() => {
    const tiers = MODEL_TIERS[provider] ?? []
    const valid = new Set<string>()
    for (const t of tiers) for (const m of t.models) valid.add(m)
    setModel((curr) => (curr && !valid.has(curr) ? '' : curr))
  }, [provider])

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

  const cli: BackendId = `${provider}-${transport}` as BackendId

  const showConnectionPicker = readiness[provider].cli && readiness[provider].sdk
  const modelTiers = useMemo(() => MODEL_TIERS[provider] ?? [], [provider])

  const handleSubmit = () => {
    if (!canSubmit) return
    const dirs = splitDirs(advanced.additionalDirsRaw)

    // Resolve selection ids → display labels at submit time so the chat chips
    // are immune to subsequent rename / delete in the underlying registries.
    const attachedSkills = skills
      .filter((s) => selectedSkillIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name }))
    const attachedNotes = notes
      .filter((n) => selectedNoteIds.has(n.id))
      .map((n) => ({ id: n.id, title: n.title }))
    const agentDef = advanced.agent ? agents.find((a) => a.id === advanced.agent) : undefined
    const attachedAgent = agentDef ? { id: agentDef.id, name: agentDef.name } : undefined

    onSubmit({
      prompt: trimmed,
      cli,
      model: model.trim() || undefined,
      agent: advanced.agent || undefined,
      permissionMode: advanced.permissionMode === 'default' ? undefined : advanced.permissionMode,
      additionalDirs: dirs.length > 0 ? dirs : undefined,
      attachedAgent,
      attachedSkills: attachedSkills.length > 0 ? attachedSkills : undefined,
      attachedNotes: attachedNotes.length > 0 ? attachedNotes : undefined,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isProviderDisabled = (id: BackendProvider): boolean => {
    const r = readiness[id]
    return !r.cli && !r.sdk
  }

  const toggleSkillSelection = (id: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleNoteSelection = (id: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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

      {(advanced.agent || selectedSkillIds.size > 0 || selectedNoteIds.size > 0) && (
        <div data-testid="quick-start-refs" className="mt-2 flex flex-wrap gap-2">
          {advanced.agent && (() => {
            const a = agents.find((x) => x.id === advanced.agent)
            if (!a) return null
            return (
              <span key={`a:${a.id}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-violet-900/30 border border-violet-700/50 text-violet-200">
                <span className="text-[9px] uppercase tracking-wider text-violet-400">Agent</span>
                <span className="truncate max-w-[200px]">{a.name}</span>
                <button
                  type="button"
                  aria-label={`Remove agent ${a.name}`}
                  onClick={() => setAdvanced((s) => ({ ...s, agent: '' }))}
                  className="text-violet-300 hover:text-white"
                >×</button>
              </span>
            )
          })()}
          {[...selectedSkillIds].map((id) => {
            const s = skills.find((x) => x.id === id)
            if (!s) return null
            return (
              <span key={`s:${id}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-indigo-900/30 border border-indigo-700/50 text-indigo-200">
                <span className="text-[9px] uppercase tracking-wider text-indigo-400">Skill</span>
                <span className="truncate max-w-[200px]">{s.name}</span>
                <button
                  type="button"
                  aria-label={`Remove skill ${s.name}`}
                  onClick={() => toggleSkillSelection(id)}
                  className="text-indigo-300 hover:text-white"
                >×</button>
              </span>
            )
          })}
          {[...selectedNoteIds].map((id) => {
            const n = notes.find((x) => x.id === id)
            if (!n) return null
            return (
              <span key={`n:${id}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-teal-900/30 border border-teal-700/50 text-teal-200">
                <span className="text-[9px] uppercase tracking-wider text-teal-400">Note</span>
                <span className="truncate max-w-[200px]">{n.title}</span>
                <button
                  type="button"
                  aria-label={`Remove note ${n.title}`}
                  onClick={() => toggleNoteSelection(id)}
                  className="text-teal-300 hover:text-white"
                >×</button>
              </span>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button
          data-testid="quick-start-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#5B4FC4' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>

        <label className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Provider</span>
          <select
            data-testid="quick-start-provider"
            aria-label="Provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as BackendProvider)}
            className="bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PROVIDERS.map((p) => {
              const disabled = isProviderDisabled(p.id)
              return (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={disabled}
                  title={disabled ? `${p.label} is not connected — set it up in Configure → Authentication` : undefined}
                >
                  {p.label}{disabled ? ' (not connected)' : ''}
                </option>
              )
            })}
          </select>
        </label>

        {showConnectionPicker && (
          <label className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Connection</span>
            <select
              data-testid="quick-start-connection"
              aria-label="Connection"
              value={transport}
              onChange={(e) => setTransport(e.target.value as BackendTransport)}
              className="bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TRANSPORTS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Model</span>
          <select
            data-testid="quick-start-model"
            aria-label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px]"
          >
            <option value="">Default</option>
            {modelTiers.map((tier) => (
              <optgroup key={tier.group} label={tier.group}>
                {tier.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
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
            className="mt-3 p-4 rounded-lg border border-gray-800 bg-gray-900/30 space-y-5"
          >
            {/* ── Agent (single-select) ────────────────────────────────────── */}
            <SectionPicker
              label="Agent"
              hint="Pick a persona — only one runs per chat."
              search={agentSearch}
              onSearch={setAgentSearch}
              count={advanced.agent ? 1 : 0}
              placeholder="Search agents…"
              empty="No agents available for this provider."
              testId="quick-start-agent-picker"
            >
              <button
                type="button"
                onClick={() => setAdvanced((a) => ({ ...a, agent: '' }))}
                aria-pressed={!advanced.agent}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                  !advanced.agent
                    ? 'bg-violet-900/30 text-violet-200 border border-violet-700'
                    : 'text-gray-400 border border-transparent hover:bg-gray-800'
                }`}
              >
                No agent (default)
              </button>
              {agents
                .filter((a) => !agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase()))
                .map((a) => {
                  const on = advanced.agent === a.id
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAdvanced((s) => ({ ...s, agent: on ? '' : a.id }))}
                      aria-pressed={on}
                      title={a.description || a.name}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                        on
                          ? 'bg-violet-900/30 text-violet-200 border border-violet-700'
                          : 'text-gray-200 border border-transparent hover:bg-gray-800'
                      }`}
                    >
                      <span className="font-medium">{a.name}</span>
                      {a.description && <span className="block text-[10px] text-gray-500 truncate">{a.description}</span>}
                    </button>
                  )
                })}
            </SectionPicker>

            {/* ── Skills (multi-select) ────────────────────────────────────── */}
            <SectionPicker
              label="Skills"
              hint="Tag this chat with skills the AI should use. Per-chat — does not change global skill settings."
              search={skillSearch}
              onSearch={setSkillSearch}
              count={selectedSkillIds.size}
              placeholder="Search skills…"
              empty="No skills available for this provider. Add one in Configure → Skills."
              testId="quick-start-skill-picker"
            >
              {skills
                .filter((s) => !skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase()))
                .map((s) => {
                  const on = selectedSkillIds.has(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSkillSelection(s.id)}
                      aria-pressed={on}
                      title={s.description || s.name}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 ${
                        on
                          ? 'bg-indigo-900/30 text-indigo-200 border border-indigo-700'
                          : 'text-gray-200 border border-transparent hover:bg-gray-800'
                      }`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                          on ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'
                        }`}
                      >
                        {on && (
                          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 truncate">
                        <span className="font-medium">{s.name}</span>
                        {s.description && <span className="block text-[10px] text-gray-500 truncate">{s.description}</span>}
                      </span>
                    </button>
                  )
                })}
            </SectionPicker>

            {/* ── Notes (multi-select) ─────────────────────────────────────── */}
            <SectionPicker
              label="Notes"
              hint="Attach saved notes as reference context. Body goes to the AI; only titles show in chat."
              search={noteSearch}
              onSearch={setNoteSearch}
              count={selectedNoteIds.size}
              placeholder="Search notes…"
              empty="No notes yet. Add one on the Notes page."
              testId="quick-start-note-picker"
            >
              {notes
                .filter((n) => {
                  if (!noteSearch) return true
                  const q = noteSearch.toLowerCase()
                  return (
                    n.title.toLowerCase().includes(q) ||
                    n.tags.some((t) => t.toLowerCase().includes(q)) ||
                    n.category.toLowerCase().includes(q)
                  )
                })
                .map((n) => {
                  const on = selectedNoteIds.has(n.id)
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => toggleNoteSelection(n.id)}
                      aria-pressed={on}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 ${
                        on
                          ? 'bg-teal-900/30 text-teal-200 border border-teal-700'
                          : 'text-gray-200 border border-transparent hover:bg-gray-800'
                      }`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                          on ? 'bg-teal-600 border-teal-600' : 'border-gray-600'
                        }`}
                      >
                        {on && (
                          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 truncate">
                        {n.pinned && <span aria-hidden className="mr-1">📌</span>}
                        <span className="font-medium">{n.title}</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{n.category}</span>
                      </span>
                    </button>
                  )
                })}
            </SectionPicker>

            {/* ── Permissions + dirs (bottom row) ──────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-800">
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

            {/* Templates and file attachments are intentionally out of scope for
                the current iteration — they'll come back as a dedicated feature
                later once the core context-attach flow stabilizes. */}
          </div>
        )}
      </div>
    </section>
  )
}
