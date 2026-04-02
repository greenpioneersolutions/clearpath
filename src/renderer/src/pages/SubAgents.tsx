import { useState, useEffect, useCallback } from 'react'
import type { IpcRendererEvent } from 'electron'
import type { SessionInfo } from '../types/ipc'
import type { SubAgentInfo } from '../types/subagent'
import ProcessCard from '../components/subagent/ProcessCard'
import ProcessOutputViewer from '../components/subagent/ProcessOutputViewer'
import DelegateTaskForm from '../components/subagent/DelegateTaskForm'
import TaskQueueView from '../components/subagent/TaskQueueView'
import FleetStatusPanel from '../components/subagent/FleetStatusPanel'

type Tab = 'dashboard' | 'delegate' | 'queue' | 'fleet'

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Process Dashboard' },
  { key: 'delegate', label: 'Delegate Task' },
  { key: 'queue', label: 'Task Queue' },
  { key: 'fleet', label: 'Fleet Status' },
]

export default function SubAgents(): JSX.Element {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [agents, setAgents] = useState<SubAgentInfo[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copilotSessions, setCopilotSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)

  // ── Load initial state ────────────────────────────────────────────────────

  const loadAgents = useCallback(async () => {
    setLoading(true)
    const list = await window.electronAPI.invoke('subagent:list') as SubAgentInfo[]
    setAgents(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadAgents()
    void (window.electronAPI.invoke('cli:list-sessions') as Promise<SessionInfo[]>).then((s) => {
      setCopilotSessions(s.filter((x) => x.cli === 'copilot'))
    })
  }, [loadAgents])

  // ── Listen for real-time status changes ───────────────────────────────────

  useEffect(() => {
    const offSpawned = window.electronAPI.on(
      'subagent:spawned',
      (_e: IpcRendererEvent, info: SubAgentInfo) => {
        setAgents((prev) => [info, ...prev])
      },
    )

    const offStatus = window.electronAPI.on(
      'subagent:status-changed',
      (_e: IpcRendererEvent, info: SubAgentInfo) => {
        setAgents((prev) =>
          prev.map((a) => (a.id === info.id ? info : a)),
        )
      },
    )

    return () => {
      offSpawned()
      offStatus()
    }
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleKill = async (id: string) => {
    await window.electronAPI.invoke('subagent:kill', { id })
  }

  const handlePause = async (id: string) => {
    await window.electronAPI.invoke('subagent:pause', { id })
  }

  const handleResume = async (id: string) => {
    await window.electronAPI.invoke('subagent:resume', { id })
  }

  const handlePopOut = async (id: string, name: string) => {
    await window.electronAPI.invoke('subagent:pop-out', { id, name })
  }

  const handleKillAll = async () => {
    const running = agents.filter((a) => a.status === 'running')
    if (running.length === 0) return
    if (!confirm(`Kill all ${running.length} running process${running.length > 1 ? 'es' : ''}?`)) return
    await window.electronAPI.invoke('subagent:kill-all')
  }

  const handleSpawned = (info: SubAgentInfo) => {
    setTab('dashboard')
    setExpandedId(info.id)
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const runningCount = agents.filter((a) => a.status === 'running').length

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sub-Agent Monitor</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {agents.length} process{agents.length !== 1 ? 'es' : ''}
            {runningCount > 0 && `, ${runningCount} running`}
          </p>
        </div>
        {runningCount > 0 && (
          <button
            onClick={() => void handleKillAll()}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Kill All ({runningCount})
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
              {t.key === 'dashboard' && runningCount > 0 && (
                <span className="ml-1.5 bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded-full">
                  {runningCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'dashboard' && (
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">No processes</h3>
              <p className="text-xs text-gray-500 mb-4">
                Delegate a task to spawn a background CLI process
              </p>
              <button
                onClick={() => setTab('delegate')}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Delegate Task
              </button>
            </div>
          ) : (
            agents.map((agent) => (
              <ProcessCard
                key={agent.id}
                agent={agent}
                isExpanded={expandedId === agent.id}
                onToggleExpand={() => setExpandedId(expandedId === agent.id ? null : agent.id)}
                onKill={() => void handleKill(agent.id)}
                onPause={() => void handlePause(agent.id)}
                onResume={() => void handleResume(agent.id)}
                onPopOut={() => void handlePopOut(agent.id, agent.name)}
              >
                <ProcessOutputViewer subAgentId={agent.id} />
              </ProcessCard>
            ))
          )}
        </div>
      )}

      {tab === 'delegate' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-2xl">
          <DelegateTaskForm onSpawned={handleSpawned} />
        </div>
      )}

      {tab === 'queue' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <TaskQueueView />
        </div>
      )}

      {tab === 'fleet' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <FleetStatusPanel copilotSessions={copilotSessions} />
        </div>
      )}
    </div>
  )
}
