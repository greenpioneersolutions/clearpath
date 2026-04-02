import { useState } from 'react'
import type { SubAgentInfo } from '../../types/subagent'

const MODELS = [
  { value: '', label: 'Default' },
  { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4', label: 'Claude Opus 4' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gemini-3-pro', label: 'Gemini 3 Pro' },
]

const PERMISSION_MODES = [
  { value: '', label: 'Default' },
  { value: 'plan', label: 'Plan' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'auto', label: 'Auto' },
  { value: 'yolo', label: 'YOLO / Bypass' },
]

interface Props {
  onSpawned: (info: SubAgentInfo) => void
}

export default function DelegateTaskForm({ onSpawned }: Props): JSX.Element {
  const [cli, setCli] = useState<'copilot' | 'claude'>('copilot')
  const [prompt, setPrompt] = useState('')
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [permissionMode, setPermissionMode] = useState('')
  const [spawning, setSpawning] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError('A prompt is required')
      return
    }

    setSpawning(true)
    setError('')

    try {
      const info = await window.electronAPI.invoke('subagent:spawn', {
        name: name.trim() || prompt.trim().slice(0, 40),
        cli,
        prompt: prompt.trim(),
        model: model || undefined,
        workingDirectory: workingDirectory.trim() || undefined,
        permissionMode: permissionMode || undefined,
      }) as SubAgentInfo

      onSpawned(info)

      // Reset form
      setPrompt('')
      setName('')
    } catch (err) {
      setError(String(err))
    } finally {
      setSpawning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-200">Delegate Task</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Spawn a background CLI process to work on a task independently
        </p>
      </div>

      {/* CLI selector */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
          CLI Backend
        </label>
        <div className="flex gap-2">
          {(['copilot', 'claude'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCli(c)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                cli === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {c === 'copilot' ? 'GitHub Copilot' : 'Claude Code'}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
          Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Describe the task..."
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors resize-y font-mono"
        />
      </div>

      {/* Name + Model row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            Task Name <span className="normal-case text-gray-600 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fix auth bug"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500 transition-colors"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Working directory + Permission mode row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            Working Directory <span className="normal-case text-gray-600 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={workingDirectory}
            onChange={(e) => setWorkingDirectory(e.target.value)}
            placeholder="/path/to/project"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 font-mono outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            Permission Mode
          </label>
          <select
            value={permissionMode}
            onChange={(e) => setPermissionMode(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500 transition-colors"
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={() => void handleSubmit()}
        disabled={spawning || !prompt.trim()}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {spawning ? 'Spawning...' : 'Delegate Task'}
      </button>
    </div>
  )
}
