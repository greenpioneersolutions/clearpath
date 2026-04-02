import { useState, useEffect, useCallback } from 'react'

interface WidgetConfig {
  i: string; type: string; x: number; y: number; w: number; h: number; config: Record<string, unknown>
}
interface DashboardLayout { id: string; name: string; widgets: WidgetConfig[] }

const WIDGET_DEFS: Array<{ type: string; name: string; description: string }> = [
  { type: 'continue-learning', name: 'Continue Learning', description: 'Learning progress and next lesson' },
  { type: 'quick-prompt', name: 'Quick Prompt', description: 'Fast text input to start a new session' },
  { type: 'running-agents', name: 'Running Agents', description: 'Active processes with status' },
  { type: 'recent-sessions', name: 'Recent Sessions', description: 'Last 5 sessions with resume' },
  { type: 'cost-summary', name: 'Cost Summary', description: 'Spend overview with sparkline' },
  { type: 'security-events', name: 'Security Events', description: 'Recent security alerts' },
  { type: 'workspace-activity', name: 'Workspace Activity', description: 'Cross-repo git timeline' },
  { type: 'quick-launch', name: 'Quick Launch', description: 'Common action buttons' },
  { type: 'schedule-overview', name: 'Schedule Overview', description: 'Next scheduled tasks' },
  { type: 'notification-feed', name: 'Notification Feed', description: 'Live notification stream' },
  { type: 'repo-status', name: 'Repo Status', description: 'Workspace repo cards' },
  { type: 'token-usage', name: 'Token Usage', description: 'Context window usage bar' },
  { type: 'policy-status', name: 'Policy Status', description: 'Active policy and violations' },
]

export default function CustomDashboard(): JSX.Element {
  const [layout, setLayout] = useState<DashboardLayout | null>(null)
  const [layouts, setLayouts] = useState<DashboardLayout[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [active, all] = await Promise.all([
      window.electronAPI.invoke('dashboard:get-active-layout') as Promise<DashboardLayout>,
      window.electronAPI.invoke('dashboard:list-layouts') as Promise<DashboardLayout[]>,
    ])
    setLayout(active)
    setLayouts(all)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const switchLayout = async (id: string) => {
    await window.electronAPI.invoke('dashboard:set-active', { id })
    void load()
  }

  const addWidget = async (type: string) => {
    if (!layout) return
    const def = WIDGET_DEFS.find((d) => d.type === type)
    if (!def) return
    const newWidget: WidgetConfig = {
      i: `${type}-${Date.now()}`, type, x: 0, y: 100, w: 4, h: 3, config: {},
    }
    const updated = { ...layout, widgets: [...layout.widgets, newWidget] }
    await window.electronAPI.invoke('dashboard:save-layout', updated)
    setLayout(updated)
    setShowPicker(false)
  }

  const removeWidget = async (widgetId: string) => {
    if (!layout) return
    const updated = { ...layout, widgets: layout.widgets.filter((w) => w.i !== widgetId) }
    await window.electronAPI.invoke('dashboard:save-layout', updated)
    setLayout(updated)
  }

  if (loading || !layout) return <div className="py-12 text-center text-gray-400 text-sm">Loading dashboard...</div>

  const widgetTypes = new Set(layout.widgets.map((w) => w.type))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Layout: {layout.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={layout.id} onChange={(e) => void switchLayout(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={() => setShowPicker(!showPicker)}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
            + Add Widget
          </button>
        </div>
      </div>

      {/* Widget picker */}
      {showPicker && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Available Widgets</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {WIDGET_DEFS.map((def) => {
              const isAdded = widgetTypes.has(def.type)
              return (
                <button key={def.type} onClick={() => !isAdded && void addWidget(def.type)}
                  disabled={isAdded}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                    isAdded ? 'border-green-200 bg-green-50 opacity-60' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}>
                  <div className="text-sm font-medium text-gray-800">{def.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{def.description}</div>
                  {isAdded && <div className="text-xs text-green-600 mt-1">Added</div>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Widget grid (simplified - no drag-drop for build stability) */}
      <div className="grid grid-cols-12 gap-4">
        {layout.widgets.map((widget) => {
          const def = WIDGET_DEFS.find((d) => d.type === widget.type)
          return (
            <div key={widget.i}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              style={{ gridColumn: `span ${Math.min(widget.w, 12)}` }}>
              {/* Widget header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-medium text-gray-600">{def?.name ?? widget.type}</span>
                <button onClick={() => void removeWidget(widget.i)}
                  className="text-gray-300 hover:text-red-400 text-xs">x</button>
              </div>
              {/* Widget body */}
              <div className="px-4 py-3">
                <WidgetBody type={widget.type} config={widget.config} />
              </div>
            </div>
          )
        })}
      </div>

      {layout.widgets.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">Dashboard is empty</p>
          <p className="text-xs text-gray-400 mt-1">Click "+ Add Widget" to add your first widget</p>
        </div>
      )}
    </div>
  )
}

function WidgetBody({ type, config }: { type: string; config: Record<string, unknown> }): JSX.Element {
  const [data, setData] = useState<unknown>(null)

  useEffect(() => {
    const fetchData = async () => {
      switch (type) {
        case 'cost-summary': {
          const s = await window.electronAPI.invoke('cost:summary')
          setData(s)
          break
        }
        case 'running-agents': {
          const agents = await window.electronAPI.invoke('subagent:list')
          setData(agents)
          break
        }
        case 'recent-sessions': {
          const sessions = await window.electronAPI.invoke('cli:list-sessions')
          setData(sessions)
          break
        }
        case 'notification-feed': {
          const notifs = await window.electronAPI.invoke('notifications:list', { limit: 5 })
          setData(notifs)
          break
        }
        case 'schedule-overview': {
          const jobs = await window.electronAPI.invoke('scheduler:list')
          setData(jobs)
          break
        }
        case 'policy-status': {
          const policy = await window.electronAPI.invoke('policy:get-active')
          setData(policy)
          break
        }
        default:
          setData(null)
      }
    }
    void fetchData()
  }, [type])

  // Render based on type
  switch (type) {
    case 'cost-summary': {
      const s = data as Record<string, number> | null
      if (!s) return <Placeholder />
      return (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-lg font-bold text-gray-900">${s['todaySpend']?.toFixed(2)}</div><div className="text-xs text-gray-500">Today</div></div>
          <div><div className="text-lg font-bold text-gray-900">${s['weekSpend']?.toFixed(2)}</div><div className="text-xs text-gray-500">This Week</div></div>
          <div><div className="text-lg font-bold text-gray-900">${s['monthSpend']?.toFixed(2)}</div><div className="text-xs text-gray-500">This Month</div></div>
        </div>
      )
    }
    case 'running-agents': {
      const agents = data as Array<{ id: string; name: string; status: string }> | null
      if (!agents) return <Placeholder />
      const running = agents.filter((a) => a.status === 'running')
      return running.length === 0
        ? <p className="text-xs text-gray-400 text-center">No running agents</p>
        : <div className="space-y-1">{running.slice(0, 5).map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-gray-700 truncate">{a.name}</span>
            </div>
          ))}</div>
    }
    case 'continue-learning': return <LearningWidget />
    case 'quick-prompt':
      return <QuickPromptWidget />
    case 'quick-launch':
      return (
        <div className="flex flex-wrap gap-2">
          {['New Session', 'Templates', 'Analytics', 'Settings'].map((label) => (
            <button key={label} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
              {label}
            </button>
          ))}
        </div>
      )
    case 'notification-feed': {
      const notifs = data as Array<{ id: string; title: string; severity: string; timestamp: number }> | null
      if (!notifs || notifs.length === 0) return <p className="text-xs text-gray-400 text-center">No notifications</p>
      return <div className="space-y-1">{notifs.slice(0, 5).map((n) => (
        <div key={n.id} className="text-xs text-gray-600 truncate">{n.title}</div>
      ))}</div>
    }
    case 'policy-status': {
      const p = data as { presetName?: string } | null
      return <p className="text-sm text-gray-700 text-center">Active: <strong>{p?.presetName ?? 'None'}</strong></p>
    }
    default:
      return <p className="text-xs text-gray-400 text-center italic">{type} widget</p>
  }
}

function QuickPromptWidget(): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const handleSend = async () => {
    if (!prompt.trim()) return
    await window.electronAPI.invoke('cli:start-session', {
      cli: 'copilot', mode: 'interactive', prompt: prompt.trim(),
    })
    setPrompt('')
  }
  return (
    <div className="flex gap-2">
      <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleSend() }}
        placeholder="Start a session with a prompt..."
        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <button onClick={() => void handleSend()} disabled={!prompt.trim()}
        className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40">Go</button>
    </div>
  )
}

function LearningWidget(): JSX.Element {
  const [progress, setProgress] = useState<{ completed: number; total: number; percentage: number; nextLesson: { title: string; estimatedMinutes: number } | null } | null>(null)

  useEffect(() => {
    void (window.electronAPI.invoke('learn:get-progress') as Promise<typeof progress>).then(setProgress)
  }, [])

  if (!progress) return <Placeholder />

  if (progress.percentage >= 100) {
    return (
      <div className="text-center py-2">
        <span className="text-green-600 font-medium text-sm">Learning Complete</span>
        <span className="ml-1.5">✓</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        {progress.completed === 0 ? 'Welcome to Clear Path' : 'Continue where you left off'}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full">
          <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${progress.percentage}%` }} />
        </div>
        <span className="text-[10px] text-gray-500">{progress.completed}/{progress.total}</span>
      </div>
      {progress.nextLesson && (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5">
          <div>
            <p className="text-xs font-medium text-gray-800">{progress.nextLesson.title}</p>
            <p className="text-[10px] text-gray-400">{progress.nextLesson.estimatedMinutes} min</p>
          </div>
          <a href="#/learn" className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">Start</a>
        </div>
      )}
    </div>
  )
}

function Placeholder(): JSX.Element {
  return <div className="h-12 bg-gray-50 rounded-lg animate-pulse" />
}
