import { useState, useEffect, useCallback } from 'react'

interface Workspace { id: string; name: string; description: string; repoPaths: string[]; createdAt: number }
interface RepoInfo { path: string; name: string; branch: string; lastCommit: string; lastAuthor: string; uncommittedCount: number }
interface ActivityEntry { hash: string; message: string; author: string; date: string; repo: string }

type Tab = 'repos' | 'broadcast' | 'activity'

export default function Workspaces(): JSX.Element {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [tab, setTab] = useState<Tab>('repos')
  const [broadcastPrompt, setBroadcastPrompt] = useState('')
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [broadcasting, setBroadcasting] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [wsList, aid] = await Promise.all([
      window.electronAPI.invoke('workspace:list') as Promise<Workspace[]>,
      window.electronAPI.invoke('workspace:get-active') as Promise<string | null>,
    ])
    setWorkspaces(wsList)
    setActiveId(aid)

    const active = wsList.find((w) => w.id === aid)
    if (active && active.repoPaths.length > 0) {
      const [ri, act] = await Promise.all([
        window.electronAPI.invoke('workspace:get-repo-info', { paths: active.repoPaths }) as Promise<RepoInfo[]>,
        window.electronAPI.invoke('workspace:activity-feed', { paths: active.repoPaths, limit: 30 }) as Promise<ActivityEntry[]>,
      ])
      setRepos(ri)
      setActivity(act)
    } else {
      setRepos([])
      setActivity([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const ws = await window.electronAPI.invoke('workspace:create', { name: newName.trim() }) as Workspace
    setNewName('')
    await window.electronAPI.invoke('workspace:set-active', { id: ws.id })
    void load()
    window.dispatchEvent(new Event('sidebar:refresh'))
  }

  const handleAddRepo = async () => {
    if (!activeId) return
    await window.electronAPI.invoke('workspace:add-repo', { workspaceId: activeId })
    void load()
    window.dispatchEvent(new Event('sidebar:refresh'))
  }

  const handleRemoveRepo = async (path: string) => {
    if (!activeId || !confirm(`Remove this repo from the workspace?`)) return
    await window.electronAPI.invoke('workspace:remove-repo', { workspaceId: activeId, path })
    void load()
  }

  const handleDeleteWorkspace = async () => {
    if (!activeId || !confirm('Delete this workspace?')) return
    await window.electronAPI.invoke('workspace:delete', { id: activeId })
    void load()
    window.dispatchEvent(new Event('sidebar:refresh'))
  }

  const handleBroadcast = async () => {
    if (!broadcastPrompt.trim() || selectedRepos.size === 0) return
    setBroadcasting(true)
    for (const repoPath of selectedRepos) {
      await window.electronAPI.invoke('subagent:spawn', {
        name: `Broadcast: ${broadcastPrompt.trim().slice(0, 30)}`,
        cli: 'claude' as const,
        prompt: broadcastPrompt.trim(),
        workingDirectory: repoPath,
        permissionMode: 'acceptEdits',
      })
    }
    setBroadcasting(false)
    setBroadcastPrompt('')
    setSelectedRepos(new Set())
  }

  const handleLaunchSession = async (repoPath: string, repoName: string) => {
    await window.electronAPI.invoke('cli:start-session', {
      cli: 'copilot' as const, mode: 'interactive',
      name: repoName, workingDirectory: repoPath,
    })
  }

  const activeWs = workspaces.find((w) => w.id === activeId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workspaces</h1>
          <p className="text-sm text-gray-500 mt-0.5">Multi-repo orchestration dashboard</p>
        </div>
        <select value={activeId ?? ''} onChange={(e) => { void window.electronAPI.invoke('workspace:set-active', { id: e.target.value || null }).then(load) }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Select workspace...</option>
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      {/* Create workspace */}
      {workspaces.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-500 mb-3">Create your first workspace to manage multiple repos</p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={() => void handleCreate()} disabled={!newName.trim()}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40">Create</button>
          </div>
        </div>
      )}

      {activeWs && (
        <>
          <div className="border-b border-gray-200">
            <nav className="flex gap-6">
              {([['repos', `Repos (${repos.length})`], ['broadcast', 'Broadcast Task'], ['activity', 'Activity Feed']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'
                }`}>{l}</button>
              ))}
            </nav>
          </div>

          {tab === 'repos' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => void handleAddRepo()}
                  className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
                  + Add Repository
                </button>
                <button onClick={() => void handleDeleteWorkspace()}
                  className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  Delete Workspace
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {repos.map((r) => (
                  <div key={r.path} className="bg-white border border-gray-200 rounded-xl p-4">
                    <h4 className="text-sm font-medium text-gray-900">{r.name}</h4>
                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                      <div>Branch: <span className="text-gray-700">{r.branch}</span></div>
                      <div className="truncate">Last: {r.lastCommit}</div>
                      <div>By: {r.lastAuthor}</div>
                      {r.uncommittedCount > 0 && <div className="text-yellow-600">{r.uncommittedCount} uncommitted changes</div>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => void handleLaunchSession(r.path, r.name)}
                        className="flex-1 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                        Launch Session
                      </button>
                      <button onClick={() => void handleRemoveRepo(r.path)}
                        className="px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg transition-colors"
                        title="Remove from workspace">
                        x
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'broadcast' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4 max-w-2xl">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Broadcast Task</h3>
                <p className="text-xs text-gray-500 mt-0.5">Run the same prompt across multiple repos in parallel</p>
              </div>
              <textarea value={broadcastPrompt} onChange={(e) => setBroadcastPrompt(e.target.value)}
                rows={4} placeholder="Describe the task to run in each repo..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
              <div className="space-y-1">
                {repos.map((r) => (
                  <label key={r.path} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedRepos.has(r.path)}
                      onChange={(e) => { const next = new Set(selectedRepos); e.target.checked ? next.add(r.path) : next.delete(r.path); setSelectedRepos(next) }}
                      className="accent-indigo-600" />
                    <span className="text-sm text-gray-700">{r.name}</span>
                    <span className="text-xs text-gray-400">{r.branch}</span>
                  </label>
                ))}
              </div>
              <button onClick={() => void handleBroadcast()}
                disabled={broadcasting || !broadcastPrompt.trim() || selectedRepos.size === 0}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
                {broadcasting ? 'Broadcasting...' : `Broadcast to ${selectedRepos.size} repo${selectedRepos.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {tab === 'activity' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-1 max-h-[600px] overflow-y-auto">
              {activity.map((a, i) => (
                <div key={`${a.hash}-${i}`} className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{a.repo}</span>
                      <span className="text-sm text-gray-800 truncate">{a.message}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{a.author} · {new Date(a.date).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
