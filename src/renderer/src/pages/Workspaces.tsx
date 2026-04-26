import { useState, useEffect, useCallback } from 'react'

interface Workspace { id: string; name: string; description: string; repoPaths: string[]; createdAt: number }
interface RepoInfo { path: string; name: string; branch: string; lastCommit: string; lastAuthor: string; uncommittedCount: number }
interface ActivityEntry { hash: string; message: string; author: string; date: string; repo: string }

type Tab = 'repos' | 'broadcast' | 'activity' | 'settings'

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
  const [newDesc, setNewDesc] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCloneInput, setShowCloneInput] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

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
    const ws = await window.electronAPI.invoke('workspace:create', { name: newName.trim(), description: newDesc.trim() }) as Workspace
    setNewName('')
    setNewDesc('')
    setShowCreateForm(false)
    await window.electronAPI.invoke('workspace:set-active', { id: ws.id })
    void load()
    window.dispatchEvent(new Event('sidebar:refresh'))
  }

  const handleAddLocalRepo = async () => {
    if (!activeId) return
    await window.electronAPI.invoke('workspace:add-repo', { workspaceId: activeId })
    void load()
    window.dispatchEvent(new Event('sidebar:refresh'))
  }

  const handleCloneRepo = async () => {
    if (!activeId || !cloneUrl.trim()) return
    setCloning(true)
    setCloneError('')
    const result = await window.electronAPI.invoke('workspace:clone-repo', {
      workspaceId: activeId,
      url: cloneUrl.trim(),
    }) as { success: boolean; path?: string; error?: string; alreadyExisted?: boolean }

    setCloning(false)
    if (result.success) {
      setCloneUrl('')
      setShowCloneInput(false)
      void load()
      window.dispatchEvent(new Event('sidebar:refresh'))
    } else {
      setCloneError(result.error ?? 'Clone failed')
    }
  }

  const handleRemoveRepo = async (path: string) => {
    if (!activeId || !confirm('Remove this repo from the workspace? (The repo itself is not deleted)')) return
    await window.electronAPI.invoke('workspace:remove-repo', { workspaceId: activeId, path })
    void load()
  }

  const handleDeleteWorkspace = async () => {
    if (!activeId || !confirm('Delete this workspace? Repos themselves are not deleted.')) return
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

  const handleUpdateWorkspace = async (name: string, description: string) => {
    if (!activeId) return
    await window.electronAPI.invoke('workspace:update', { id: activeId, name, description })
    void load()
  }

  const activeWs = workspaces.find((w) => w.id === activeId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workspaces</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage repositories and orchestrate work across projects</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={activeId ?? ''} onChange={(e) => { void window.electronAPI.invoke('workspace:set-active', { id: e.target.value || null }).then(load) }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select workspace...</option>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.repoPaths.length} repos)</option>)}
          </select>
          <button onClick={() => setShowCreateForm(true)}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors">
            + New
          </button>
        </div>
      </div>

      {/* Create workspace form */}
      {(showCreateForm || workspaces.length === 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Create a Workspace</h3>
          <p className="text-xs text-gray-500">Group related repositories together for multi-repo management, broadcasting, and activity tracking.</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Backend Services, Q2 Project..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
              <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief description of this workspace..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void handleCreate()} disabled={!newName.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 transition-colors">
              Create Workspace
            </button>
            {workspaces.length > 0 && (
              <button onClick={() => { setShowCreateForm(false); setNewName(''); setNewDesc('') }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
            )}
          </div>
        </div>
      )}

      {/* Active workspace */}
      {activeWs && (
        <>
          {/* Workspace info bar */}
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{activeWs.name}</h2>
              {activeWs.description && <p className="text-xs text-gray-500 mt-0.5">{activeWs.description}</p>}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{activeWs.repoPaths.length} repo{activeWs.repoPaths.length !== 1 ? 's' : ''}</span>
              <span>Created {new Date(activeWs.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-6">
              {([
                ['repos', `Repos (${repos.length})`],
                ['broadcast', 'Broadcast'],
                ['activity', 'Activity'],
                ['settings', 'Settings'],
              ] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>{l}</button>
              ))}
            </nav>
          </div>

          {/* Repos Tab */}
          {tab === 'repos' && (
            <div className="space-y-4">
              {/* Add repo actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => void handleAddLocalRepo()}
                  className="px-4 py-2 bg-white border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Add Local Folder
                </button>
                <button onClick={() => { setShowCloneInput(!showCloneInput); setCloneError('') }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                    showCloneInput
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Clone from URL
                </button>
              </div>

              {/* Clone URL input */}
              {showCloneInput && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-gray-600">
                    Enter a Git repository URL. The repo will be cloned to <code className="bg-gray-100 px-1 rounded text-[10px]">~/ClearPath-repos/{activeWs.name.replace(/[^a-zA-Z0-9_-]/g, '-')}/</code>
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text" value={cloneUrl}
                      onChange={(e) => { setCloneUrl(e.target.value); setCloneError('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleCloneRepo() }}
                      placeholder="https://github.com/owner/repo.git or git@github.com:owner/repo.git"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <button onClick={() => void handleCloneRepo()} disabled={cloning || !cloneUrl.trim()}
                      className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                      {cloning ? 'Cloning...' : 'Clone'}
                    </button>
                  </div>
                  {cloneError && <p className="text-xs text-red-500">{cloneError}</p>}
                  <p className="text-[10px] text-gray-400">
                    Uses your system git credentials. For private repos, make sure git is configured with SSH keys or a credential manager.
                  </p>
                </div>
              )}

              {/* Repo grid */}
              {repos.length === 0 ? (
                <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
                  <p className="text-sm text-gray-500 mb-2">No repositories in this workspace yet</p>
                  <p className="text-xs text-gray-400">Add a local folder or clone a repo from a URL to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {repos.map((r) => (
                    <div key={r.path} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between">
                        <h4 className="text-sm font-semibold text-gray-900">{r.name}</h4>
                        <button onClick={() => void handleRemoveRepo(r.path)}
                          className="text-gray-300 hover:text-red-500 transition-colors" title="Remove from workspace">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 mt-2 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                          <span className="font-medium text-gray-700">{r.branch}</span>
                        </div>
                        <div className="truncate" title={r.lastCommit}>
                          <span className="text-gray-400">Last:</span> {r.lastCommit || 'No commits'}
                        </div>
                        <div>
                          <span className="text-gray-400">By:</span> {r.lastAuthor || 'Unknown'}
                        </div>
                        {r.uncommittedCount > 0 && (
                          <div className="text-amber-600 font-medium">{r.uncommittedCount} uncommitted change{r.uncommittedCount !== 1 ? 's' : ''}</div>
                        )}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => void handleLaunchSession(r.path, r.name)}
                          className="flex-1 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors font-medium">
                          Launch Session
                        </button>
                      </div>
                      <p className="text-[9px] text-gray-400 mt-2 truncate" title={r.path}>{r.path}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Broadcast Tab */}
          {tab === 'broadcast' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4 max-w-2xl">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Broadcast Task</h3>
                <p className="text-xs text-gray-500 mt-0.5">Run the same prompt across multiple repos in parallel. Each repo gets its own AI sub-agent.</p>
              </div>
              <textarea value={broadcastPrompt} onChange={(e) => setBroadcastPrompt(e.target.value)}
                rows={4} placeholder="Describe the task to run in each repo..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
              <div className="space-y-1">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-xs font-medium text-gray-600">Select repos:</span>
                  <button onClick={() => setSelectedRepos(selectedRepos.size === repos.length ? new Set() : new Set(repos.map((r) => r.path)))}
                    className="text-[10px] text-indigo-600 hover:text-indigo-500 font-medium">
                    {selectedRepos.size === repos.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                {repos.map((r) => (
                  <label key={r.path} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedRepos.has(r.path)}
                      onChange={(e) => { const next = new Set(selectedRepos); e.target.checked ? next.add(r.path) : next.delete(r.path); setSelectedRepos(next) }}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
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

          {/* Activity Tab */}
          {tab === 'activity' && (
            <div className="space-y-2">
              {activity.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No recent activity across workspace repos</p>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {activity.map((a, i) => (
                    <div key={`${a.hash}-${i}`} className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                      <div className="mt-1.5 w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{a.repo}</span>
                          <span className="text-sm text-gray-800 truncate">{a.message}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{a.author} · {new Date(a.date).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {tab === 'settings' && (
            <WorkspaceSettings workspace={activeWs} onUpdate={handleUpdateWorkspace} onDelete={() => void handleDeleteWorkspace()} />
          )}
        </>
      )}
    </div>
  )
}

// ── Workspace Settings sub-component ─────────────────────────────────────────

function WorkspaceSettings({ workspace, onUpdate, onDelete }: {
  workspace: { id: string; name: string; description: string; repoPaths: string[]; createdAt: number }
  onUpdate: (name: string, description: string) => void
  onDelete: () => void
}): JSX.Element {
  const [name, setName] = useState(workspace.name)
  const [desc, setDesc] = useState(workspace.description)
  const [dirty, setDirty] = useState(false)

  const handleSave = () => {
    onUpdate(name.trim(), desc.trim())
    setDirty(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Workspace Details</h3>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input type="text" value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true) }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea value={desc}
            onChange={(e) => { setDesc(e.target.value); setDirty(true) }}
            rows={2} placeholder="What's this workspace for?"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y" />
        </div>
        {dirty && (
          <button onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-colors">
            Save Changes
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Info</h3>
        <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
          <div>
            <span className="text-gray-400">Created:</span> {new Date(workspace.createdAt).toLocaleDateString()}
          </div>
          <div>
            <span className="text-gray-400">Repos:</span> {workspace.repoPaths.length}
          </div>
          <div className="col-span-2">
            <span className="text-gray-400">ID:</span>{' '}
            <code
              className="bg-gray-100 px-1 rounded text-[10px]"
              data-screenshot-stub="ws-aaaa1111-bbbb-2222-cccc-3333dddd4444"
            >
              {workspace.id}
            </code>
          </div>
        </div>
      </div>

      <div className="bg-white border border-red-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-red-700">Danger Zone</h3>
        <p className="text-xs text-gray-500">Deleting a workspace removes it from ClearPath. The repositories themselves are not deleted from disk.</p>
        <button onClick={onDelete}
          className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors font-medium">
          Delete Workspace
        </button>
      </div>
    </div>
  )
}
