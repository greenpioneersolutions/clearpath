import { useState, useEffect } from 'react'
import GitStatusPanel from '../components/git/GitStatusPanel'
import WorktreeManager from '../components/git/WorktreeManager'
import PRBuilder from '../components/git/PRBuilder'

type Tab = 'status' | 'pr' | 'worktrees'

const TABS: { key: Tab; label: string }[] = [
  { key: 'status', label: 'Git Status' },
  { key: 'pr', label: 'PR Builder' },
  { key: 'worktrees', label: 'Worktrees' },
]

export default function GitWorkflow(): JSX.Element {
  const [tab, setTab] = useState<Tab>('status')
  const [cwd, setCwd] = useState('.')

  useEffect(() => {
    void (window.electronAPI.invoke('app:get-cwd') as Promise<string>).then(setCwd)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Git Workflow</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Visual git status, PR builder, worktree management, and branch protection
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {tab === 'status' && <GitStatusPanel cwd={cwd} />}
        {tab === 'pr' && <PRBuilder cwd={cwd} />}
        {tab === 'worktrees' && <WorktreeManager cwd={cwd} />}
      </div>
    </div>
  )
}
