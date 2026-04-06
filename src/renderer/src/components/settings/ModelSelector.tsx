import { COPILOT_MODELS, CLAUDE_MODELS, type ModelDef } from '../../types/settings'

interface Props {
  cli: 'copilot' | 'claude'
  selectedModel: string
  onModelChange: (model: string) => void
}

const COST_COLORS: Record<string, string> = {
  'Free': 'bg-green-100 text-green-700',
  '0.33x': 'bg-teal-100 text-teal-700',
  '1x': 'bg-gray-100 text-gray-600',
  '3x': 'bg-amber-100 text-amber-700',
}

function groupModels(models: ModelDef[]): Map<string, ModelDef[]> {
  const groups = new Map<string, ModelDef[]>()
  for (const m of models) {
    const key = m.cli === 'copilot' ? m.costTier : m.provider
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }
  return groups
}

export default function ModelSelector({ cli, selectedModel, onModelChange }: Props): JSX.Element {
  const models = cli === 'copilot' ? COPILOT_MODELS : CLAUDE_MODELS
  const current = selectedModel || models.find((m) => m.isDefault)?.id || ''
  const currentModel = models.find((m) => m.id === current)

  const groups = cli === 'copilot'
    ? groupModels(models)
    : new Map([['All Models', models as ModelDef[]]])

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
          {cli === 'copilot' && (
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${COST_COLORS[groupName] ?? 'bg-gray-100 text-gray-600'}`}>
                {groupName}
              </span>
              <span className="text-[10px] text-gray-400">
                {groupName === 'Free' ? 'Included in plan' : groupName === '0.33x' ? 'Budget' : groupName === '3x' ? 'Premium' : 'Standard'}
              </span>
            </div>
          )}
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
                      {cli === 'claude' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono">{m.costTier}</span>
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
