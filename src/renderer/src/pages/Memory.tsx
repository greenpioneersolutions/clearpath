import { useState, useCallback, useEffect } from 'react'
import FileEditor from '../components/memory/FileEditor'
import InstructionsEditor from '../components/memory/InstructionsEditor'
import MemoryViewer from '../components/memory/MemoryViewer'
import ContextUsage from '../components/memory/ContextUsage'
import NewFileWizard from '../components/memory/NewFileWizard'
import NotesManager from '../components/memory/NotesManager'
import StarterMemories from '../components/memory/StarterMemories'
import type { SessionInfo } from '../types/ipc'

type Tab = 'notes' | 'files' | 'instructions' | 'memory' | 'context' | 'starter'

const TABS: { key: Tab; label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'starter', label: 'Starter Memories' },
  { key: 'files', label: 'Config Files' },
  { key: 'instructions', label: 'Instructions' },
  { key: 'memory', label: 'CLI Memory' },
  { key: 'context', label: 'Context Usage' },
]

export default function Memory(): JSX.Element {
  const [tab, setTab] = useState<Tab>('notes')
  const [cli, setCli] = useState<'copilot' | 'claude'>('copilot')
  const [showWizard, setShowWizard] = useState(false)
  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([])
  const [workingDirectory, setWorkingDirectory] = useState('.')

  useEffect(() => {
    void (window.electronAPI.invoke('app:get-cwd') as Promise<string>).then(setWorkingDirectory)
    void (window.electronAPI.invoke('cli:list-sessions') as Promise<SessionInfo[]>).then((sessions) => {
      setActiveSessions(sessions.filter((s) => s.status === 'running'))
    })
  }, [])

  const handleWizardCreated = useCallback((path: string) => {
    setShowWizard(false)
    // Switch to files tab so the user sees the new file
    setTab('files')
    console.log('Created config file:', path)
  }, [])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Memory & Context</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage config files, instructions, memory entries, and context usage
          </p>
        </div>

        {/* CLI selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">CLI:</span>
          {(['copilot', 'claude'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCli(c)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                cli === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 border border-gray-600 hover:bg-gray-700'
              }`}
            >
              {c === 'copilot' ? 'Copilot' : 'Claude'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <nav className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setShowWizard(false) }}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
        {tab === 'notes' ? (
          <div className="p-6">
            <NotesManager />
          </div>
        ) : tab === 'starter' ? (
          <div className="p-6">
            <StarterMemories />
          </div>
        ) : showWizard ? (
          <div className="p-6">
            <NewFileWizard
              workingDirectory={workingDirectory}
              onCreated={handleWizardCreated}
              onCancel={() => setShowWizard(false)}
            />
          </div>
        ) : tab === 'files' ? (
          <div className="h-[600px]">
            <FileEditor
              cli={cli}
              workingDirectory={workingDirectory}
              onNewFile={() => setShowWizard(true)}
            />
          </div>
        ) : tab === 'instructions' ? (
          <div className="p-6">
            <InstructionsEditor cli={cli} workingDirectory={workingDirectory} />
          </div>
        ) : tab === 'memory' ? (
          <div className="p-6">
            <MemoryViewer cli={cli} />
          </div>
        ) : (
          <div className="p-6">
            <ContextUsage activeSessions={activeSessions} />
          </div>
        )}
      </div>
    </div>
  )
}
