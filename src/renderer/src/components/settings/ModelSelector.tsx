import { COPILOT_MODELS, CLAUDE_MODELS, type ModelDef } from '../../types/settings'

interface Props {
  cli: 'copilot' | 'claude'
  selectedModel: string
  onModelChange: (model: string) => void
}

export default function ModelSelector({ cli, selectedModel, onModelChange }: Props): JSX.Element {
  const models = cli === 'copilot' ? COPILOT_MODELS : CLAUDE_MODELS
  const current = selectedModel || models.find((m) => m.isDefault)?.id || ''

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Model</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Select the AI model for {cli === 'copilot' ? 'Copilot' : 'Claude Code'} sessions
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {models.map((m) => {
          const isSelected = current === m.id
          return (
            <button
              key={m.id}
              onClick={() => onModelChange(m.id)}
              className={`text-left px-4 py-3 rounded-lg border transition-all ${
                isSelected
                  ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                  {m.label}
                </span>
                {m.isDefault && (
                  <span className="text-xs text-gray-400">default</span>
                )}
              </div>
              {m.subtitle && (
                <p className="text-xs text-gray-400 font-mono mt-0.5">{m.subtitle}</p>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">
        Selected: <code className="font-mono text-gray-600">{current || 'default'}</code>
        {' '}— maps to <code className="font-mono text-gray-600">--model {current || '(default)'}</code>
      </p>
    </div>
  )
}
