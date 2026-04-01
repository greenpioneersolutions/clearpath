import { useState } from 'react'

interface NewSessionOptions {
  cli: 'copilot' | 'claude'
  name?: string
  workingDirectory?: string
  initialPrompt?: string
}

interface Props {
  onStart: (opts: NewSessionOptions) => void
  onClose: () => void
}

export default function NewSessionModal({ onStart, onClose }: Props): JSX.Element {
  const [cli, setCli] = useState<'copilot' | 'claude'>('copilot')
  const [name, setName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')

  const handleStart = () => {
    onStart({
      cli,
      name: name.trim() || undefined,
      workingDirectory: workingDirectory.trim() || undefined,
      initialPrompt: initialPrompt.trim() || undefined,
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
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-white mb-5">New Session</h2>

        <div className="space-y-4">
          {/* CLI selector */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              CLI
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

          {/* Session name */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Session Name{' '}
              <span className="normal-case text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fix auth bug"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Working directory */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Working Directory{' '}
              <span className="normal-case text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/Users/me/my-project"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 font-mono outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Initial prompt */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Initial Prompt{' '}
              <span className="normal-case text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
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
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  )
}
