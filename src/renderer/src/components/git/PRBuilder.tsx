import { useState } from 'react'

interface Props {
  cwd: string
}

export default function PRBuilder({ cwd }: Props): JSX.Element {
  const [description, setDescription] = useState('')
  const [branchName, setBranchName] = useState('')
  const [cli, setCli] = useState<'copilot' | 'claude'>('copilot')
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleBuild = async () => {
    if (!description.trim()) return
    setStatus('working')
    setMessage('')

    const branch = branchName.trim() || `feature/${description.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`
    const prompt = `Create a new branch called "${branch}" from the current branch. Then implement the following:\n\n${description.trim()}\n\nAfter implementing, commit the changes with a descriptive message. Do not push yet.`

    try {
      await window.electronAPI.invoke('subagent:spawn', {
        name: `PR: ${description.trim().slice(0, 40)}`,
        cli,
        prompt,
        workingDirectory: cwd,
        permissionMode: 'acceptEdits',
      })
      setStatus('done')
      setMessage('Task delegated — monitor progress in the Sub-Agents tab')
    } catch (err) {
      setStatus('error')
      setMessage(String(err))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">PR Builder</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Describe what you want built. The app creates a branch, delegates the work, and prepares a PR.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">What do you want to build?</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          rows={4} placeholder="Describe the feature, bug fix, or change..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Branch Name (optional)</label>
          <input type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)}
            placeholder="Auto-generated from description"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">CLI Backend</label>
          <select value={cli} onChange={(e) => setCli(e.target.value as 'copilot' | 'claude')}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="copilot">Copilot</option>
            <option value="claude">Claude Code</option>
          </select>
        </div>
      </div>

      {message && (
        <div className={`text-xs px-3 py-2 rounded-lg ${
          status === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
        }`}>{message}</div>
      )}

      <button onClick={() => void handleBuild()}
        disabled={status === 'working' || !description.trim()}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
        {status === 'working' ? 'Delegating...' : 'Build & Create PR'}
      </button>
    </div>
  )
}
