import { useState, useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface NewSessionOptions {
  cli: 'copilot' | 'claude'
  name?: string
  workingDirectory?: string
  initialPrompt?: string
  model?: string
}

const MODEL_TIERS: Record<string, { group: string; models: string[] }[]> = {
  copilot: [
    { group: 'Free', models: ['gpt-5-mini', 'gpt-4.1', 'gpt-4o'] },
    { group: '0.33x', models: ['claude-haiku-4.5', 'gemini-3-flash'] },
    { group: '1x', models: ['claude-sonnet-4.5', 'claude-sonnet-4.6', 'gpt-5', 'gemini-3-pro'] },
    { group: '3x', models: ['claude-opus-4.5', 'claude-opus-4.6'] },
  ],
  claude: [
    { group: 'Claude', models: ['sonnet', 'haiku', 'opus'] },
  ],
}

interface Props {
  onStart: (opts: NewSessionOptions) => void
  onClose: () => void
  defaultCli?: 'copilot' | 'claude'
}

export default function NewSessionModal({ onStart, onClose, defaultCli }: Props): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const [cli, setCli] = useState<'copilot' | 'claude'>(defaultCli ?? 'copilot')
  const [model, setModel] = useState('')
  const [name, setName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')

  useFocusTrap(panelRef, true)

  const handleStart = () => {
    onStart({
      cli,
      name: name.trim() || undefined,
      workingDirectory: workingDirectory.trim() || undefined,
      initialPrompt: initialPrompt.trim() || undefined,
      model: model || undefined,
    })
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-session-title"
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md p-6"
      >
        <h2 id="new-session-title" className="text-lg font-semibold text-white mb-5">New Session</h2>

        <div className="space-y-4">
          {/* CLI selector */}
          <div>
            <label id="cli-selection-label" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              CLI
            </label>
            <div className="flex gap-2" role="group" aria-labelledby="cli-selection-label">
              {(['copilot', 'claude'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => { setCli(c); setModel('') }}
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

          {/* Model selector */}
          <div>
            <label htmlFor="session-model" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Model{' '}
              <span className="normal-case text-gray-500 font-normal">(this session only)</span>
            </label>
            <select
              id="session-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">Use default</option>
              {(MODEL_TIERS[cli] ?? []).map((tier) => (
                <optgroup key={tier.group} label={tier.group}>
                  {tier.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Session name */}
          <div>
            <label htmlFor="session-name" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Session Name{' '}
              <span className="normal-case text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              id="session-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fix auth bug"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Working directory */}
          <div>
            <label htmlFor="working-directory" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Working Directory{' '}
              <span className="normal-case text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              id="working-directory"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/Users/me/my-project"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 font-mono outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Initial prompt */}
          <div>
            <label htmlFor="initial-prompt" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Initial Prompt{' '}
              <span className="normal-case text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              id="initial-prompt"
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStart()
              }}
              rows={3}
              placeholder="What should I help you with?"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors resize-none"
            />
            <p className="text-xs text-gray-600 mt-1">⌘↵ to start</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            aria-label="Cancel new session"
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            aria-label="Start new session"
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  )
}
