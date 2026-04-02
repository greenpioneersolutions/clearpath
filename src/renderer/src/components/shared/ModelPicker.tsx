import { useState, useEffect } from 'react'

interface ModelOption {
  id: string
  name: string
  subtitle: string
  group: string
}

const COPILOT_MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', subtitle: 'claude-sonnet-4.5', group: 'Recommended' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', subtitle: 'claude-sonnet-4', group: 'Anthropic' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', subtitle: 'claude-opus-4-6', group: 'Anthropic' },
  { id: 'gpt-5', name: 'GPT-5', subtitle: 'gpt-5', group: 'OpenAI' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', subtitle: 'gpt-5.3-codex', group: 'OpenAI' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', subtitle: 'gpt-5.4-mini', group: 'OpenAI' },
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', subtitle: 'gemini-3-pro', group: 'Google' },
]

const CLAUDE_MODELS: ModelOption[] = [
  { id: 'sonnet', name: 'Sonnet', subtitle: 'claude-sonnet-4-6', group: 'Available' },
  { id: 'opus', name: 'Opus', subtitle: 'claude-opus-4-6', group: 'Available' },
  { id: 'haiku', name: 'Haiku', subtitle: 'claude-haiku-4-5-20251001', group: 'Available' },
]

interface Props {
  currentBackend?: 'copilot' | 'claude' | 'local'
  currentModel: string
  onChange: (model: string) => void
  size?: 'compact' | 'full'
  allowInherit?: boolean
}

export default function ModelPicker({
  currentBackend,
  currentModel,
  onChange,
  size = 'compact',
  allowInherit = false,
}: Props): JSX.Element {
  const [backend, setBackend] = useState<'copilot' | 'claude' | 'local'>(currentBackend ?? 'copilot')
  const [localModels, setLocalModels] = useState<ModelOption[]>([])

  // Auto-detect backend if not provided
  useEffect(() => {
    if (currentBackend) { setBackend(currentBackend); return }
    // Could fetch from settings, but default to copilot
  }, [currentBackend])

  // Fetch local models if backend is local
  useEffect(() => {
    if (backend !== 'local') return
    void (async () => {
      try {
        const result = await window.electronAPI.invoke('local-models:detect') as {
          ollama: { connected: boolean; models: Array<{ name: string }> }
          lmstudio: { connected: boolean; models: Array<{ name: string }> }
        }
        const models: ModelOption[] = []
        for (const m of result.ollama.models) {
          models.push({ id: m.name, name: m.name, subtitle: 'Ollama', group: 'Ollama' })
        }
        for (const m of result.lmstudio.models) {
          models.push({ id: m.name, name: m.name, subtitle: 'LM Studio', group: 'LM Studio' })
        }
        setLocalModels(models)
      } catch { /* ignore */ }
    })()
  }, [backend])

  const models = backend === 'copilot' ? COPILOT_MODELS
    : backend === 'claude' ? CLAUDE_MODELS
    : localModels

  // Group models
  const groups = new Map<string, ModelOption[]>()
  for (const m of models) {
    if (!groups.has(m.group)) groups.set(m.group, [])
    groups.get(m.group)!.push(m)
  }

  const isCompact = size === 'compact'

  return (
    <select
      value={currentModel}
      onChange={(e) => onChange(e.target.value)}
      className={isCompact
        ? 'border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
        : 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
      }
    >
      {allowInherit && <option value="">Use Default</option>}
      {!allowInherit && !currentModel && <option value="">Select model...</option>}

      {Array.from(groups.entries()).map(([group, groupModels]) => (
        <optgroup key={group} label={group}>
          {groupModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.subtitle}
            </option>
          ))}
        </optgroup>
      ))}

      {backend === 'local' && models.length === 0 && (
        <option value="" disabled>No local models detected</option>
      )}
    </select>
  )
}
