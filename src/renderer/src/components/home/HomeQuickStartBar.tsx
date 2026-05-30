import { useEffect, useMemo, useRef, useState } from 'react'
import type { BackendId } from '../../../../shared/backends'
import { providerOf, pickReadyBackend } from '../../../../shared/backends'
import type { AgentDef, AgentListResult } from '../../types/ipc'
import type { PromptSuggestion } from '../../types/starter-pack'
import { useAuthStatus, readyBackendsOf } from '../../hooks/useAuthStatus'
import HomeOptionsPopover, { backendPillLabel } from './HomeOptionsPopover'

export interface QuickStartSubmit {
  prompt: string
  cli: BackendId
  model?: string
  agent?: string
  attachedAgent?: { id: string; name: string }
  /**
   * `true` when the user explicitly picked "(none)" in the agent dropdown.
   * The Home → Work hand-off forwards this to `cli:start-session` so the
   * main process knows NOT to fall back to the stored active-agent default.
   * `undefined`/`false` means "user didn't touch the picker; respect the
   * server's default-resolution behavior."
   */
  noAgent?: boolean
}

interface Props {
  onSubmit: (opts: QuickStartSubmit) => void
  colorButtonPrimary?: string
  /** When set, seeds the input on mount. Change the parent's `key` to inject a new value. */
  initialPrompt?: string
}

const FALLBACK_BACKEND: BackendId = 'copilot-cli'

export default function HomeQuickStartBar({ onSubmit, colorButtonPrimary, initialPrompt }: Props): JSX.Element {
  const auth = useAuthStatus()
  const [prompt, setPrompt] = useState(initialPrompt ?? '')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [backend, setBackend] = useState<BackendId>(FALLBACK_BACKEND)
  const [backendInitialized, setBackendInitialized] = useState(false)
  const [model, setModel] = useState('')
  const [agentId, setAgentId] = useState('')
  // Tracks whether the user has explicitly engaged with the agent dropdown
  // since mount. Without this we can't distinguish "default empty state" from
  // "user opened the picker and chose (none)" — both look like `agentId = ''`.
  // We only signal `noAgent: true` on submit when the user explicitly picked
  // (none) AFTER touching the control.
  const [agentTouched, setAgentTouched] = useState(false)
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const readyBackends = useMemo<BackendId[]>(() => readyBackendsOf(auth), [auth])

  // Initialize backend once readiness lands. After init, respect the user's
  // explicit pick — don't reshuffle just because readiness changes.
  useEffect(() => {
    if (backendInitialized) return
    if (!auth.loaded) return
    // Home keeps its optimistic fallback (no block-CTA here) — when nothing is
    // ready yet we still seed Copilot so the bar renders a sensible default.
    setBackend(pickReadyBackend(readyBackends) ?? FALLBACK_BACKEND)
    setBackendInitialized(true)
  }, [auth.loaded, readyBackends, backendInitialized])

  // Fetch agents scoped to the active provider, mirroring QuickStartCard's
  // behavior — without workingDir, project-scoped agents disappear.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let cwd = ''
      try {
        const c = await window.electronAPI.invoke('app:get-cwd') as string | null
        cwd = typeof c === 'string' ? c : ''
      } catch { cwd = '' }
      if (cancelled) return

      const provider = providerOf(backend)
      try {
        const result = await window.electronAPI.invoke('agent:list', { workingDir: cwd || undefined }) as AgentListResult
        if (cancelled) return
        const loaded = result?.[provider] ?? []
        setAgents(loaded)
        // Drop stale agent selection that no longer matches the loaded list.
        setAgentId((curr) => (curr && !loaded.some((x) => x.id === curr) ? '' : curr))
      } catch {
        if (!cancelled) setAgents([])
      }
    })()
    return () => { cancelled = true }
  }, [backend])

  // Fetch starter prompts once on mount. We deliberately call
  // `get-all-prompts` (not `get-prompts`) so the 3-chip UI is stable even for
  // users past their first interaction.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await window.electronAPI.invoke('starter-pack:get-all-prompts') as PromptSuggestion[] | null
        if (cancelled) return
        const spotlight = (list ?? []).filter((p) => p.category === 'spotlight').slice(0, 3)
        setSuggestions(spotlight)
      } catch {
        if (!cancelled) setSuggestions([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  const trimmed = prompt.trim()
  const canSubmit = trimmed.length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    const agentDef = agentId ? agents.find((a) => a.id === agentId) : undefined
    onSubmit({
      prompt: trimmed,
      cli: backend,
      model: model || undefined,
      agent: agentId || undefined,
      attachedAgent: agentDef ? { id: agentDef.id, name: agentDef.name } : undefined,
      // Only signal noAgent when the user explicitly engaged the picker and
      // chose (none). A user who never opened the popover gets the existing
      // server-side default-resolution behavior.
      noAgent: agentTouched && !agentId,
    })
  }

  const handleSuggestionClick = (s: PromptSuggestion) => {
    setPrompt(s.displayText)
    inputRef.current?.focus()
  }

  return (
    <div className="w-full space-y-3">
      <div className="relative">
        <div className="relative flex items-center bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-transparent transition-shadow">
          <div className="relative pl-2">
            <button
              type="button"
              onClick={() => setPopoverOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={popoverOpen}
              aria-label="Session options"
              className="text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <span>{backendPillLabel(backend, model)}</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <HomeOptionsPopover
              isOpen={popoverOpen}
              onClose={() => setPopoverOpen(false)}
              readyBackends={readyBackends.length > 0 ? readyBackends : [FALLBACK_BACKEND]}
              backend={backend}
              model={model}
              agent={agentId}
              agents={agents}
              onBackendChange={(b) => setBackend(b)}
              onModelChange={(m) => setModel(m)}
              onAgentChange={(a) => { setAgentTouched(true); setAgentId(a) }}
            />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit() }}
            placeholder="What do you need help with?"
            aria-label="Quick prompt"
            className="flex-1 bg-transparent border-0 px-3 py-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-label="Start session"
            className="mr-2 w-10 h-10 rounded-xl text-white flex items-center justify-center transition-colors disabled:opacity-30"
            style={{ backgroundColor: colorButtonPrimary ?? '#4F46E5' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-500">Try one of these:</span>
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSuggestionClick(s)}
                className="w-full text-left text-sm text-gray-700 bg-white border border-gray-200 rounded-xl px-4 py-2.5 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                {s.displayText}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
