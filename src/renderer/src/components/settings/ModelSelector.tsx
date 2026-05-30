import { COPILOT_MODELS, CLAUDE_MODELS, type ModelDef } from '../../types/settings'

interface Props {
  cli: 'copilot' | 'claude'
  selectedModel: string
  onModelChange: (model: string) => void
}

// Per-tier badge color + one-word descriptor, keyed by the raw `costTier`
// string each model carries. Copilot tiers are request-credit multipliers;
// Claude tiers are $/1M tokens (input / output). Both get the same grouped
// treatment so neither backend looks like an undifferentiated list.
const TIER_META: Record<string, { color: string; label: string }> = {
  // Copilot — request credits
  'Free': { color: 'bg-green-100 text-green-700', label: 'Included in plan' },
  '0.33x': { color: 'bg-teal-100 text-teal-700', label: 'Budget' },
  '1x': { color: 'bg-gray-100 text-gray-600', label: 'Standard' },
  '3x': { color: 'bg-amber-100 text-amber-700', label: 'Premium' },
  // Claude — $/1M tokens (input / output)
  '$1 / $5': { color: 'bg-teal-100 text-teal-700', label: 'Budget' },
  '$3 / $15': { color: 'bg-gray-100 text-gray-600', label: 'Standard' },
  '$5 / $25': { color: 'bg-amber-100 text-amber-700', label: 'Premium' },
}

// Display order of tier groups, cheapest → most capable.
const TIER_ORDER: Record<'copilot' | 'claude', string[]> = {
  copilot: ['Free', '0.33x', '1x', '3x'],
  claude: ['$1 / $5', '$3 / $15', '$5 / $25'],
}

function groupModelsByTier(models: ModelDef[], order: string[]): Map<string, ModelDef[]> {
  const groups = new Map<string, ModelDef[]>()
  for (const tier of order) groups.set(tier, []) // seed so groups render in price order
  for (const m of models) {
    if (!groups.has(m.costTier)) groups.set(m.costTier, [])
    groups.get(m.costTier)!.push(m)
  }
  for (const [tier, list] of groups) if (list.length === 0) groups.delete(tier)
  return groups
}

export default function ModelSelector({ cli, selectedModel, onModelChange }: Props): JSX.Element {
  const models = cli === 'copilot' ? COPILOT_MODELS : CLAUDE_MODELS
  const current = selectedModel || models.find((m) => m.isDefault)?.id || ''
  const currentModel = models.find((m) => m.id === current)

  const groups = groupModelsByTier(models, TIER_ORDER[cli])

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Model</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Select the AI model for {cli === 'copilot' ? 'Copilot' : 'Claude Code'} sessions.
          {cli === 'copilot' && ' Free models are included in your Copilot plan. Premium models use request credits.'}
          {cli === 'claude' && ' Costs are per 1M tokens (input / output).'}
        </p>
      </div>

      {Array.from(groups.entries()).map(([groupName, groupModels]) => (
        <div key={groupName}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${TIER_META[groupName]?.color ?? 'bg-gray-100 text-gray-600'}`}>
              {groupName}
            </span>
            <span className="text-[10px] text-gray-400">
              {TIER_META[groupName]?.label ?? 'Standard'}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Model selection">
            {groupModels.map((m) => {
              const isSelected = current === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => onModelChange(m.id)}
                  role="radio"
                  aria-checked={isSelected}
                  className={`text-left px-4 py-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {m.label}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {m.isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">default</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">{m.description}</p>
                  {m.subtitle && (
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{m.subtitle}</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1 text-xs text-gray-400">
        <span>Selected:</span>
        <code className="font-mono text-gray-600">{current || 'default'}</code>
        <span>→</span>
        <code className="font-mono text-gray-600">--model {current || '(default)'}</code>
        {currentModel && <span className="text-gray-300">|</span>}
        {currentModel && <span>{currentModel.provider}</span>}
      </div>
    </div>
  )
}
