import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import type { BackendId, BackendProvider, BackendTransport } from '../../../../shared/backends'
import { providerOf, transportOf } from '../../../../shared/backends'
import type { AgentDef, AgentListResult } from '../../types/ipc'
import type { PromptSuggestion } from '../../types/starter-pack'
import { MODEL_TIERS } from '../../data/modelTiers'
import { useAuthStatus } from '../../hooks/useAuthStatus'
import { LAUNCHPAD_COPY } from '../../copy/launchpad'
import AttachmentChipToolbar, { type AttachmentChip } from './AttachmentChipToolbar'
import AttachmentPopover from './AttachmentPopover'

interface ProviderReadiness {
  cli: boolean
  sdk: boolean
}

type ReadinessMap = Record<BackendProvider, ProviderReadiness>

/**
 * Pre-load default — assume CLI is available so the UI doesn't flash "not
 * connected" during the first auth probe. Once the hook reports `loaded`,
 * this is replaced with the real values.
 */
const EMPTY_READINESS: ReadinessMap = {
  copilot: { cli: true, sdk: false },
  claude:  { cli: true, sdk: false },
}

const PROVIDERS: ReadonlyArray<{ id: BackendProvider; label: string }> = [
  { id: 'copilot', label: 'Copilot' },
  { id: 'claude',  label: 'Claude' },
]

export type QuickStartPermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'

/**
 * `value` strings flow unchanged to the `--permission-mode` flag in
 * `ClaudeCodeAdapter.buildArgs` — DO NOT rename them. Only the `label` /
 * `hint` are user-visible. See [Slice PR 1, change #3] for the rename
 * rationale: the previous CLI-jargon labels ("Bypass permissions") were
 * intimidating to non-technical users.
 */
const PERMISSION_MODES: ReadonlyArray<{ value: QuickStartPermissionMode; label: string; hint: string }> = [
  { value: 'default',           label: 'Ask me before changes',         hint: LAUNCHPAD_COPY.quickStart.permissionHints.default },
  { value: 'plan',              label: "Just plan, don't change anything", hint: LAUNCHPAD_COPY.quickStart.permissionHints.plan },
  { value: 'acceptEdits',       label: 'Auto-approve file edits',       hint: LAUNCHPAD_COPY.quickStart.permissionHints.acceptEdits },
  { value: 'bypassPermissions', label: 'Full autonomy (advanced)',      hint: LAUNCHPAD_COPY.quickStart.permissionHints.bypassPermissions },
]

const ADVANCED_KEY = 'quickStartAdvanced'
/**
 * One-shot localStorage flag: once the user has submitted their first prompt
 * via QuickStartCard, the cold-start example chips never render again — even
 * after a reload. The chips only have value to first-time users.
 */
const FIRST_PROMPT_KEY = 'quickStartFirstPromptSent'

/** Hardcoded safety net used when the starter-pack IPC errors out or returns
 *  nothing. Keeps the UI helpful even when main-process state is wedged. */
const FALLBACK_EXAMPLE_PROMPTS: ReadonlyArray<string> = [
  "Explain this project like I'm new",
  'Summarize what changed this week',
  'Draft a status update for my team',
]

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
    /**
     * `true` when the user explicitly picked "No agent (default)" in the
     * Add-context popover. Forwarded to `cli:start-session` so the main
     * process skips its stored-active-agent fallback.
     */
    noAgent?: boolean
  }) => void
  /** Initial CLI selection (typically the user's last-used backend). */
  defaultCli?: BackendId
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
  // Transport state stays internal — the user-visible Connection picker was
  // removed from this surface (PR 1, change #2). Transport is derived from
  // `defaultCli` (which Work.tsx fills from the user's last-used backend) and
  // CLI-vs-SDK is chosen in Configure → Backends.
  const [transport, setTransport] = useState<BackendTransport>(() => transportOf(defaultCli ?? 'copilot-cli'))
  const [model, setModel] = useState('')
  // PR 3 swapped the "+ Add context" disclosure panel for a chip toolbar:
  // each attachment type is its own pill button that opens a focused popover
  // anchored beneath it. Only one popover may be open at a time — opening one
  // closes the others — so we just track the id of the currently open chip.
  // `null` means "all popovers closed".
  const [openChipId, setOpenChipId] = useState<string | null>(null)
  // Customize (permission mode + additional dirs) remains a session-level
  // disclosure separate from per-attachment context. PR 1 already split it
  // out — PR 3 doesn't touch it.
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [advanced, setAdvanced] = useState<AdvancedState>(loadAdvanced)
  // Tracks whether the user has explicitly interacted with the agent picker
  // (either by clicking "No agent (default)" or by picking a real agent) so
  // we can distinguish that from "user never opened the popover". Without
  // this, `advanced.agent === ''` is ambiguous — could mean either, and the
  // server-side default-agent fallback overrides the user's explicit "none"
  // pick. Reset whenever a real agent is selected (which is itself explicit).
  const [agentTouched, setAgentTouched] = useState(false)
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [exampleChips, setExampleChips] = useState<string[]>(() => [...FALLBACK_EXAMPLE_PROMPTS])
  // Initialized from localStorage so a returning user who already submitted at
  // least once never sees the chips again, even on a fresh mount.
  const [firstPromptSent, setFirstPromptSent] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(FIRST_PROMPT_KEY) === '1'
    } catch {
      return false
    }
  })
  // Provider-pill popover state: when only one provider is ready we collapse
  // the <select> into a "via Copilot · change" pill. Clicking the pill opens
  // a small popover with the same options so power users can still switch.
  const [providerPopoverOpen, setProviderPopoverOpen] = useState(false)
  // Per-session multi-select state. These do NOT mutate global skill or note
  // state — they only mark what gets attached to the next session.
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set())
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  // Search filters per picker so the user can find an item without scrolling.
  const [agentSearch, setAgentSearch] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [noteSearch, setNoteSearch] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Per-chip refs for popover anchoring + click-outside detection. The
  // AttachmentPopover uses the anchor ref to skip closing when the click
  // originates from the chip itself (the toolbar already handles that toggle).
  const agentChipRef = useRef<HTMLButtonElement>(null)
  const skillChipRef = useRef<HTMLButtonElement>(null)
  const noteChipRef  = useRef<HTMLButtonElement>(null)

  // Readiness comes from the shared useAuthStatus hook so the sessions
  // launchpad chip and the sidebar dot can never disagree. Before the first
  // probe completes (`loaded === false`), fall back to optimistic defaults so
  // the user doesn't see a transient "not connected" flash.
  const authStatus = useAuthStatus()
  const readiness: ReadinessMap = useMemo(() => {
    if (!authStatus.loaded) return EMPTY_READINESS
    const ready = (p: { cli: { installed: boolean; authenticated: boolean }; sdk: { installed: boolean; authenticated: boolean } }) => ({
      cli: p.cli.installed && p.cli.authenticated,
      sdk: p.sdk.installed && p.sdk.authenticated,
    })
    return {
      copilot: ready(authStatus.copilot),
      claude:  ready(authStatus.claude),
    }
  }, [authStatus])

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

  // Cold-start example chips. We only fetch when the chips would actually
  // render (first-prompt flag unset) so we don't pay for an IPC roundtrip
  // on every Sessions visit for returning users. Errors / empty responses
  // fall back to the hardcoded safety net so the UI is never empty.
  useEffect(() => {
    if (firstPromptSent) return
    let cancelled = false
    void (async () => {
      try {
        const list = await window.electronAPI.invoke('starter-pack:get-all-prompts') as PromptSuggestion[] | null
        if (cancelled) return
        const launchpad = (Array.isArray(list) ? list : [])
          .filter((p) => p.category === 'launchpad-spotlight')
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((p) => p.displayText)
        if (launchpad.length > 0) {
          setExampleChips(launchpad)
        }
        // else: keep FALLBACK_EXAMPLE_PROMPTS from initial state.
      } catch {
        // Keep the fallback chips — UI must never go empty.
      }
    })()
    return () => { cancelled = true }
  }, [firstPromptSent])

  // If the currently selected transport isn't ready but the other is, switch
  // to the ready one so the user doesn't submit into a dead backend.
  //
  // GUARD: only run after auth has actually been probed. Before `loaded`,
  // `readiness` reflects the optimistic `EMPTY_READINESS` default which says
  // `sdk: false` for both providers — without this guard, an explicit
  // `defaultCli` of e.g. `copilot-sdk` would be silently overwritten to
  // `copilot-cli` during the first render pass and never recover, because
  // once we settle on a "ready" transport the effect's early-return keeps us
  // there. Pre-PR-1 this was masked by the visible Connection picker letting
  // the user re-pick SDK; now we have to be honest about transport state.
  useEffect(() => {
    if (!authStatus.loaded) return
    const r = readiness[provider]
    if (r[transport]) return
    if (transport === 'sdk' && r.cli) setTransport('cli')
    else if (transport === 'cli' && r.sdk) setTransport('sdk')
  }, [provider, transport, readiness, authStatus.loaded])

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

  const modelTiers = useMemo(() => MODEL_TIERS[provider] ?? [], [provider])
  // True when ≥2 providers have at least one transport ready. In that case we
  // keep the <select> so the user can switch; otherwise we collapse to a pill.
  const readyProviderCount = useMemo(
    () => PROVIDERS.filter((p) => readiness[p.id].cli || readiness[p.id].sdk).length,
    [readiness],
  )
  const showProviderSelect = readyProviderCount >= 2

  // Show the cold-start chips only on a truly empty input AND before the user
  // has ever submitted from this surface. Both conditions are intentional —
  // we want chips to "feel" like part of the empty state, not a hint that
  // reappears every time the user clears their text.
  const showExampleChips = !firstPromptSent && trimmed.length === 0 && exampleChips.length > 0

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

    // Persist the one-shot flag BEFORE invoking onSubmit so a renderer crash
    // mid-submit still hides chips on the next mount — the user has clearly
    // moved past the "I need an example" stage.
    if (!firstPromptSent) {
      try {
        window.localStorage.setItem(FIRST_PROMPT_KEY, '1')
      } catch {
        // localStorage unavailable — best effort
      }
      setFirstPromptSent(true)
    }

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
      // Only signal explicit "no agent" when the user actually engaged the
      // picker. A user who never opened it gets the server's default-resolution.
      noAgent: agentTouched && !advanced.agent ? true : undefined,
    })
  }

  const handleExampleChipClick = (text: string) => {
    setPrompt(text)
    // Focus + move cursor to end so the user can immediately tweak the prompt
    // (e.g., add "for the auth module" to "Explain this project like I'm new").
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      const len = text.length
      try {
        ta.setSelectionRange(len, len)
      } catch {
        // setSelectionRange can throw on detached textareas in tests — ignore.
      }
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
        <h2 className="text-white text-lg font-semibold">{LAUNCHPAD_COPY.quickStart.title}</h2>
        <p className="text-gray-400 text-sm mt-0.5">
          {LAUNCHPAD_COPY.quickStart.subtitle}
        </p>
      </div>

      <textarea
        ref={textareaRef}
        data-testid="quick-start-textarea"
        aria-label="New chat prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={LAUNCHPAD_COPY.quickStart.placeholder}
        rows={3}
        className="w-full resize-none bg-gray-900/60 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
      />

      {showExampleChips && (
        <div
          data-testid="quick-start-example-chips"
          className="mt-3 flex flex-wrap gap-2"
          aria-label="Example prompts to get started"
        >
          <span className="text-[11px] text-gray-500 self-center mr-1">Try:</span>
          {exampleChips.map((text) => (
            <button
              key={text}
              type="button"
              data-testid="quick-start-example-chip"
              onClick={() => handleExampleChipClick(text)}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs text-violet-100 border border-violet-700/50 bg-violet-900/30 hover:bg-violet-900/50 hover:border-violet-500 transition-colors"
              style={{ borderColor: 'rgba(127,119,221,0.4)' }}
            >
              {text}
            </button>
          ))}
        </div>
      )}

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
                  onClick={() => { setAgentTouched(true); setAdvanced((s) => ({ ...s, agent: '' })) }}
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
          {LAUNCHPAD_COPY.quickStart.submitLabel}
        </button>

        {showProviderSelect ? (
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
                // Distinguish "not installed" from "installed but not signed in"
                // so the user knows whether they need to install or just log in.
                const providerInfo = authStatus[p.id]
                const installedSomewhere = providerInfo.cli.installed || providerInfo.sdk.installed
                const suffix = !disabled
                  ? ''
                  : installedSomewhere
                    ? ' (sign in needed)'
                    : ' (not installed)'
                const tooltip = !disabled
                  ? undefined
                  : installedSomewhere
                    ? `${p.label} is installed — sign in from Configure → Authentication to connect.`
                    : `${p.label} is not installed — install it from Configure → Authentication.`
                return (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={disabled}
                    title={tooltip}
                  >
                    {p.label}{suffix}
                  </option>
                )
              })}
            </select>
          </label>
        ) : (
          // Single-provider pill. When only one provider is ready, hide the
          // <select> entirely and show a compact "via X · change" status pill.
          // Clicking opens a small popover with the same options for users
          // who later want to switch (e.g., after authenticating Claude).
          <div className="relative">
            <button
              type="button"
              data-testid="quick-start-provider-pill"
              aria-label={`Provider ${provider}. Click to change.`}
              aria-expanded={providerPopoverOpen}
              aria-haspopup="menu"
              onClick={() => setProviderPopoverOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-gray-300 border border-gray-700 bg-gray-900/60 hover:bg-gray-900/80 hover:border-gray-600 transition-colors"
            >
              <span className="text-gray-500">via</span>
              <span className="font-medium text-gray-100">
                {PROVIDERS.find((p) => p.id === provider)?.label ?? provider}
              </span>
              <span className="text-gray-500">·</span>
              <span className="text-violet-300">change</span>
            </button>
            {providerPopoverOpen && (
              <div
                role="menu"
                data-testid="quick-start-provider-popover"
                className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-gray-700 bg-gray-900 shadow-xl p-1"
              >
                {PROVIDERS.map((p) => {
                  const disabled = isProviderDisabled(p.id)
                  const providerInfo = authStatus[p.id]
                  const installedSomewhere = providerInfo.cli.installed || providerInfo.sdk.installed
                  const suffix = !disabled
                    ? ''
                    : installedSomewhere
                      ? ' (sign in needed)'
                      : ' (not installed)'
                  const isCurrent = p.id === provider
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isCurrent}
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return
                        setProvider(p.id)
                        setProviderPopoverOpen(false)
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                        isCurrent
                          ? 'bg-violet-900/40 text-violet-100'
                          : disabled
                            ? 'text-gray-600 cursor-not-allowed'
                            : 'text-gray-200 hover:bg-gray-800'
                      }`}
                    >
                      {p.label}{suffix}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
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

      {/*
        PR 3: the stacked "+ Add context" disclosure was replaced with a chip
        toolbar (one chip per attachment type) that opens a focused popover
        anchored to the clicked chip. Same SectionPicker inside the popover,
        ~80% less visual weight at rest.

        The Customize disclosure (permission mode + additional dirs) is
        session-level (one selection per chat), not per-attachment — it stays
        as a separate disclosure exactly as PR 1 shipped it.
      */}
      <AttachmentChipToolbar
        openChipId={openChipId}
        onChipClick={(id) => setOpenChipId((curr) => (curr === id ? null : id))}
        chips={[
          {
            id: 'agent',
            label: LAUNCHPAD_COPY.quickStart.chips.agent,
            accent: 'violet',
            count: advanced.agent ? 1 : 0,
            buttonRef: agentChipRef,
            ariaControls: 'quick-start-agent-popover',
            popover: (
              <AttachmentPopover
                id="quick-start-agent-popover"
                open={openChipId === 'agent'}
                anchorRef={agentChipRef}
                onClose={() => setOpenChipId(null)}
                title={LAUNCHPAD_COPY.quickStart.popovers.agentTitle}
              >
                <SectionPicker
                  label="Agent"
                  hint={LAUNCHPAD_COPY.quickStart.hints.agent}
                  search={agentSearch}
                  onSearch={setAgentSearch}
                  count={advanced.agent ? 1 : 0}
                  placeholder="Search agents…"
                  empty="No agents available for this provider."
                  testId="quick-start-agent-picker"
                >
                  <button
                    type="button"
                    onClick={() => { setAgentTouched(true); setAdvanced((a) => ({ ...a, agent: '' })) }}
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
                          onClick={() => { setAgentTouched(true); setAdvanced((s) => ({ ...s, agent: on ? '' : a.id })) }}
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
              </AttachmentPopover>
            ),
          },
          {
            id: 'skill',
            label: LAUNCHPAD_COPY.quickStart.chips.skill,
            accent: 'indigo',
            count: selectedSkillIds.size,
            buttonRef: skillChipRef,
            ariaControls: 'quick-start-skill-popover',
            popover: (
              <AttachmentPopover
                id="quick-start-skill-popover"
                open={openChipId === 'skill'}
                anchorRef={skillChipRef}
                onClose={() => setOpenChipId(null)}
                title={LAUNCHPAD_COPY.quickStart.popovers.skillTitle}
              >
                <SectionPicker
                  label="Skills"
                  hint={LAUNCHPAD_COPY.quickStart.hints.skills}
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
              </AttachmentPopover>
            ),
          },
          {
            id: 'note',
            label: LAUNCHPAD_COPY.quickStart.chips.note,
            accent: 'teal',
            count: selectedNoteIds.size,
            buttonRef: noteChipRef,
            ariaControls: 'quick-start-note-popover',
            popover: (
              <AttachmentPopover
                id="quick-start-note-popover"
                open={openChipId === 'note'}
                anchorRef={noteChipRef}
                onClose={() => setOpenChipId(null)}
                title={LAUNCHPAD_COPY.quickStart.popovers.noteTitle}
              >
                <SectionPicker
                  label="Notes"
                  hint={LAUNCHPAD_COPY.quickStart.hints.notes}
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
              </AttachmentPopover>
            ),
          },
          {
            id: 'files',
            label: LAUNCHPAD_COPY.quickStart.chips.files,
            accent: 'gray',
            disabled: true,
            tooltip: LAUNCHPAD_COPY.quickStart.chips.filesTooltip,
          },
        ]}
      />

      <div className="mt-4">
        <button
          type="button"
          data-testid="quick-start-customize-toggle"
          onClick={() => setCustomizeOpen((v) => !v)}
          aria-expanded={customizeOpen}
          aria-controls="quick-start-customize"
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
        >
          {LAUNCHPAD_COPY.quickStart.customizeLabel} {customizeOpen ? '▴' : '▾'}
        </button>
      </div>

      {customizeOpen && (() => {
        const currentMode = PERMISSION_MODES.find((m) => m.value === advanced.permissionMode)
        return (
          <div
            id="quick-start-customize"
            data-testid="quick-start-customize"
            className="mt-3 p-4 rounded-lg border border-gray-800 bg-gray-900/30"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                {/*
                  Per-mode hint sits directly under the select so the user
                  always sees the consequence of their pick. The value is
                  unchanged (still flows to --permission-mode); only the
                  label is plain-English.
                */}
                {currentMode && (
                  <p
                    data-testid="quick-start-permission-mode-hint"
                    className="text-[11px] text-gray-500 mt-1"
                  >
                    {currentMode.hint}
                  </p>
                )}
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
          </div>
        )
      })()}
    </section>
  )
}
