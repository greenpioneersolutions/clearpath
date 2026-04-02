import { useState, useEffect, useCallback } from 'react'

interface GitWorktree {
  path: string
  branch: string
  commit: string
  isMain: boolean
}

interface Props {
  cwd: string
}

export default function WorktreeManager({ cwd }: Props): JSX.Element {
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [protectedBranches, setProtectedBranches] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [wts, prot] = await Promise.all([
      window.electronAPI.invoke('git:worktrees', { cwd }) as Promise<GitWorktree[]>,
      window.electronAPI.invoke('git:branch-protection', { cwd }) as Promise<{ protected: string[] }>,
    ])
    setWorktrees(wts)
    setProtectedBranches(prot.protected)
    setLoading(false)
  }, [cwd])

  useEffect(() => { void load() }, [load])

  const handleCreate = async () => {
    if (!branchName.trim()) return
    setCreating(true)
    try {
      const path = await window.electronAPI.invoke('git:create-worktree', {
        cwd, branch: branchName.trim(),
      }) as string
      setMessage(`Created worktree at ${path}`)
      setBranchName('')
      setShowCreate(false)
      void load()
    } catch (err) {
      setMessage(`Error: ${String(err)}`)
    }
    setCreating(false)
    setTimeout(() => setMessage(''), 3000)
  }

  const handleRemove = async (wt: GitWorktree) => {
    if (!confirm(`Remove worktree at ${wt.path}?`)) return
    try {
      await window.electronAPI.invoke('git:remove-worktree', { cwd, path: wt.path })
      void load()
    } catch (err) {
      setMessage(`Error: ${String(err)}`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const handleLaunchSession = async (wt: GitWorktree) => {
    await window.electronAPI.invoke('cli:start-session', {
      cli: 'claude' as const,
      mode: 'interactive',
      name: `Worktree: ${wt.branch}`,
      workingDirectory: wt.path,
    })
    setMessage(`Session started in ${wt.branch}`)
    setTimeout(() => setMessage(''), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Worktrees</h3>
          <p className="text-xs text-gray-500 mt-0.5">Manage isolated git worktrees for parallel work</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          {showCreate ? 'Cancel' : '+ New Worktree'}
        </button>
      </div>

      {message && (
        <div className={`text-xs px-3 py-2 rounded-lg ${
          message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
        }`}>{message}</div>
      )}

      {/* Protected branches warning */}
      {protectedBranches.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-700">
          Protected branches: {protectedBranches.join(', ')} — agents cannot push directly to these.
        </div>
      )}

      {showCreate && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex gap-3">
          <input type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)}
            placeholder="Branch name (e.g. feature/my-task)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={() => void handleCreate()} disabled={creating || !branchName.trim()}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : worktrees.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-400">No worktrees configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {worktrees.map((wt) => {
            const isProtected = protectedBranches.includes(wt.branch)
            return (
              <div key={wt.path} className={`bg-white border rounded-lg px-4 py-3 ${
                wt.isMain ? 'border-indigo-200' : 'border-gray-200'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{wt.branch}</span>
                      {wt.isMain && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">main</span>}
                      {isProtected && <span className="text-xs bg-yellow-100 text-yellow-600 px-1.5 py-0.5 rounded">protected</span>}
                    </div>
                    <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{wt.path}</p>
                    <p className="text-xs text-gray-400 mt-0.5">commit: {wt.commit}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => void handleLaunchSession(wt)}
                      className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">
                      Launch Session
                    </button>
                    {!wt.isMain && (
                      <button onClick={() => void handleRemove(wt)}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
