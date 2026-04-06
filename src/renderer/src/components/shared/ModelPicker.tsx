import { useState, useEffect } from 'react'
import { COPILOT_MODELS, CLAUDE_MODELS, type ModelDef } from '../../types/settings'

interface LocalModel {
  id: string
  name: string
  group: string
}

interface Props {
  currentBackend?: 'copilot' | 'claude' | 'local'
  currentModel: string
  onChange: (model: string) => void
  size?: 'compact' | 'full'
  allowInherit?: boolean
}

function groupBy(models: ModelDef[], key: 'provider' | 'costTier'): Map<string, ModelDef[]> {
  const groups = new Map<string, ModelDef[]>()
  for (const m of models) {
    const k = m[key]
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(m)
  }
  return groups
}

export default function ModelPicker({
  currentBackend,
  currentModel,
  onChange,
  size = 'compact',
  allowInherit = false,
}: Props): JSX.Element {
  const [backend, setBackend] = useState<'copilot' | 'claude' | 'local'>(currentBackend ?? 'copilot')
  const [localModels, setLocalModels] = useState<LocalModel[]>([])

  useEffect(() => {
    if (currentBackend) { setBackend(currentBackend); return }
  }, [currentBackend])

  useEffect(() => {
    if (backend !== 'local') return
    void (async () => {
      try {
        const result = await window.electronAPI.invoke('local-models:detect') as {
          ollama: { connected: boolean; models: Array<{ name: string }> }
          lmstudio: { connected: boolean; models: Array<{ name: string }> }
        }
        const models: LocalModel[] = []
        for (const m of result.ollama.models) {
          models.push({ id: m.name, name: m.name, group: 'Ollama' })
        }
        for (const m of result.lmstudio.models) {
          models.push({ id: m.name, name: m.name, group: 'LM Studio' })
        }
        setLocalModels(models)
      } catch { /* ignore */ }
    })()
  }, [backend])

  const isCompact = size === 'compact'

  if (backend === 'local') {
    const localGroups = new Map<string, LocalModel[]>()
    for (const m of localModels) {
      if (!localGroups.has(m.group)) localGroups.set(m.group, [])
      localGroups.get(m.group)!.push(m)
    }
    return (
      <select value={currentModel} onChange={(e) => onChange(e.target.value)}
        className={isCompact
          ? 'border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
          : 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
        }>
        {allowInherit && <option value="">Use Default</option>}
        {localModels.length === 0 && <option value="" disabled>No local models detected</option>}
        {Array.from(localGroups.entries()).map(([group, models]) => (
          <optgroup key={group} label={group}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </optgroup>
        ))}
      </select>
    )
  }

  const models = backend === 'copilot' ? COPILOT_MODELS : CLAUDE_MODELS
  const groups = backend === 'copilot' ? groupBy(models, 'costTier') : groupBy(models, 'provider')

  return (
    <select value={currentModel} onChange={(e) => onChange(e.target.value)}
      className={isCompact
        ? 'border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
        : 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
      }>
      {allowInherit && <option value="">Use Default</option>}
      {!allowInherit && !currentModel && <option value="">Select model...</option>}

      {Array.from(groups.entries()).map(([group, groupModels]) => (
        <optgroup key={group} label={backend === 'copilot' ? `${group} — ${group === 'Free' ? 'Included' : 'Premium'}` : group}>
          {groupModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}{m.isDefault ? ' (default)' : ''} — {m.description}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
