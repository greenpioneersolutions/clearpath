import { useEffect, useState, useCallback } from 'react'
import type { RoutingRules } from '../../types/routing'
import { useFlag } from '../../contexts/FeatureFlagContext'
import { COPILOT_MODELS, CLAUDE_MODELS } from '../../types/settings'

const COPILOT_OPTIONS = COPILOT_MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.costTier }))
const CLAUDE_OPTIONS = CLAUDE_MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.costTier }))

const DEFAULT_RULES: RoutingRules = {
  enabled: false,
  copilot: { trivial: 'gpt-5-mini', normal: 'claude-sonnet-4.5', hard: 'claude-opus-4.6' },
  claude: { trivial: 'haiku', normal: 'sonnet', hard: 'opus' },
}

interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error'
  error?: string
}

/**
 * Token Coach Phase 4 — RoutingSettings.
 *
 * Lives under Configure → Routing (new tab in Settings.tsx). Flag-gated by
 * `showModelRouting` — the parent Settings page checks the flag and routes
 * around this component when off.
 *
 * Three rows per CLI (trivial / normal / hard), each a dropdown of available
 * models. We use the same model lists as `ModelSelector` so the routing
 * settings stay in sync with what users see elsewhere.
 */
export default function RoutingSettings(): JSX.Element {
  const enabledFlag = useFlag('showModelRouting')
  const [rules, setRules] = useState<RoutingRules>(DEFAULT_RULES)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.invoke('settings:get-routing-rules') as RoutingRules
      if (result) setRules(result)
    } catch {
      // Stay on defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (next: RoutingRules) => {
    setSaveState({ status: 'saving' })
    try {
      const saved = await window.electronAPI.invoke('settings:set-routing-rules', next) as RoutingRules
      setRules(saved)
      setSaveState({ status: 'saved' })
      setTimeout(() => setSaveState({ status: 'idle' }), 2000)
    } catch (err) {
      setSaveState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const updateEnabled = (enabled: boolean) => {
    const next = { ...rules, enabled }
    void save(next)
  }

  const updateTier = (provider: 'copilot' | 'claude', tier: 'trivial' | 'normal' | 'hard', model: string) => {
    const next: RoutingRules = {
      ...rules,
      [provider]: { ...rules[provider], [tier]: model },
    }
    void save(next)
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading routing rules…</p>
  }

  if (!enabledFlag) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Model routing</h3>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          The <code className="font-mono">showModelRouting</code> feature flag is off. Turn it on in Settings → Feature Flags to use per-prompt routing.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Model routing</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Auto-route prompts to cheaper models when the request is simple. Routing is checked on every turn — the chip
          above the chat input shows what was picked, and lets you override per turn. Every routing decision is visible.
        </p>
      </div>

      {/* Master toggle */}
      <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-white cursor-pointer hover:bg-gray-50">
        <input
          type="checkbox"
          checked={rules.enabled}
          onChange={(e) => updateEnabled(e.target.checked)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-900">
            Auto-route to cheaper models for simple prompts
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            When on, ClearPath classifies each prompt as trivial, normal, or hard, and spawns the matching model below.
          </div>
        </div>
      </label>

      {/* Save indicator */}
      {saveState.status === 'saved' && (
        <p className="text-xs text-teal-600">Saved.</p>
      )}
      {saveState.status === 'error' && (
        <p className="text-xs text-red-600">Failed to save: {saveState.error}</p>
      )}

      <TierTable
        title="Copilot CLI"
        provider="copilot"
        rules={rules.copilot}
        options={COPILOT_OPTIONS}
        disabled={!rules.enabled}
        onChange={(tier, model) => updateTier('copilot', tier, model)}
      />

      <TierTable
        title="Claude Code CLI"
        provider="claude"
        rules={rules.claude}
        options={CLAUDE_OPTIONS}
        disabled={!rules.enabled}
        onChange={(tier, model) => updateTier('claude', tier, model)}
      />
    </div>
  )
}

// ── TierTable ─────────────────────────────────────────────────────────────────

interface TierTableProps {
  title: string
  provider: 'copilot' | 'claude'
  rules: { trivial: string; normal: string; hard: string }
  options: Array<{ value: string; label: string; hint: string }>
  disabled: boolean
  onChange: (tier: 'trivial' | 'normal' | 'hard', model: string) => void
}

function TierTable({ title, rules, options, disabled, onChange }: TierTableProps): JSX.Element {
  const tiers: Array<{ key: 'trivial' | 'normal' | 'hard'; label: string; description: string }> = [
    { key: 'trivial', label: 'Trivial', description: 'Short questions, lookups, single-sentence asks.' },
    { key: 'normal', label: 'Normal', description: 'Most everyday requests — edits, explanations, scoped tasks.' },
    { key: 'hard', label: 'Hard', description: 'Multi-step refactors, deep reasoning, large code pastes.' },
  ]

  return (
    <div className={`rounded-lg border ${disabled ? 'border-gray-200 opacity-60' : 'border-gray-300'} bg-white`}>
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
      </div>
      <div className="divide-y divide-gray-100">
        {tiers.map((t) => {
          const current = rules[t.key]
          const isCustom = !options.some((o) => o.value === current)
          return (
            <div key={t.key} className="flex items-start gap-4 p-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{t.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
              </div>
              <div className="flex-shrink-0">
                <select
                  value={isCustom ? '__custom__' : current}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') return  // handled by text input below
                    onChange(t.key, e.target.value)
                  }}
                  disabled={disabled}
                  className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white disabled:bg-gray-100"
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label} · {o.hint}</option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
                {isCustom && (
                  <div className="mt-1">
                    <input
                      type="text"
                      value={current}
                      onChange={(e) => onChange(t.key, e.target.value)}
                      disabled={disabled}
                      placeholder="model-id"
                      className="text-xs border border-gray-300 rounded-md px-2 py-1 font-mono w-48 disabled:bg-gray-100"
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
