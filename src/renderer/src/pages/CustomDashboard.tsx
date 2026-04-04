import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

interface WidgetConfig {
  i: string; type: string; x: number; y: number; w: number; h: number; config: Record<string, unknown>
}
interface DashboardLayout { id: string; name: string; widgets: WidgetConfig[] }

const WIDGET_DEFS: Array<{ type: string; name: string; description: string }> = [
  { type: 'continue-learning', name: 'Continue Learning', description: 'Learning progress and next lesson' },
  { type: 'quick-prompt', name: 'Quick Prompt', description: 'Fast text input to start a new session' },
  { type: 'running-agents', name: 'Running Agents', description: 'Active processes with status' },
  { type: 'recent-sessions', name: 'Recent Sessions', description: 'Last 5 sessions with resume' },
  { type: 'cost-summary', name: 'Cost Summary', description: 'Spend overview for today, week, month' },
  { type: 'security-events', name: 'Security Events', description: 'Recent security and compliance alerts' },
  { type: 'workspace-activity', name: 'Workspace Activity', description: 'Recent workspace events' },
  { type: 'quick-launch', name: 'Quick Launch', description: 'Common action shortcuts' },
  { type: 'schedule-overview', name: 'Schedule Overview', description: 'Next scheduled tasks' },
  { type: 'notification-feed', name: 'Notification Feed', description: 'Live notification stream' },
  { type: 'repo-status', name: 'Repo Status', description: 'Git repository overview' },
  { type: 'token-usage', name: 'Token Usage', description: 'Token spend over recent sessions' },
  { type: 'policy-status', name: 'Policy Status', description: 'Active policy and enforcement mode' },
  { type: 'setup-wizard', name: 'Setup Progress', description: 'Guided onboarding checklist — auto-hides when complete' },
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

      {/* Widget grid */}
      <div className="grid grid-cols-12 gap-4">
        {layout.widgets.map((widget) => {
          const def = WIDGET_DEFS.find((d) => d.type === widget.type)
          return (
            <div key={widget.i}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              style={{ gridColumn: `span ${Math.min(widget.w, 12)}` }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-medium text-gray-600">{def?.name ?? widget.type}</span>
                <button onClick={() => void removeWidget(widget.i)}
                  className="text-gray-300 hover:text-red-400 text-xs">x</button>
              </div>
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

// ── Widget body renderer ────────────────────────────────────────────────────

function WidgetBody({ type }: { type: string; config: Record<string, unknown> }): JSX.Element {
  const [data, setData] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      try {
        let result: unknown = null
        switch (type) {
          case 'cost-summary':
            result = await window.electronAPI.invoke('cost:summary')
            break
          case 'running-agents':
            result = await window.electronAPI.invoke('subagent:list')
            break
          case 'recent-sessions': {
            // Try persisted sessions first (survives restart), fall back to active
            const persisted = await window.electronAPI.invoke('cli:get-persisted-sessions') as
              Array<{ sessionId: string; cli: string; name?: string; startedAt: number; endedAt?: number; messageLog: unknown[] }>
            const active = await window.electronAPI.invoke('cli:list-sessions') as
              Array<{ sessionId: string; cli: string; name?: string; status: string; startedAt: number }>
            // Merge: active first, then persisted not in active
            const activeIds = new Set(active.map(s => s.sessionId))
            const merged = [
              ...active.map(s => ({ id: s.sessionId, cli: s.cli, name: s.name, startedAt: s.startedAt, status: s.status as string })),
              ...persisted.filter(s => !activeIds.has(s.sessionId)).map(s => ({
                id: s.sessionId, cli: s.cli, name: s.name, startedAt: s.startedAt, status: s.endedAt ? 'ended' : 'unknown',
              })),
            ].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5)
            result = merged
            break
          }
          case 'notification-feed':
            result = await window.electronAPI.invoke('notifications:list', { limit: 5 })
            break
          case 'schedule-overview':
            result = await window.electronAPI.invoke('scheduler:list')
            break
          case 'policy-status':
            result = await window.electronAPI.invoke('policy:get-active')
            break
          case 'token-usage':
            result = await window.electronAPI.invoke('cost:summary')
            break
          case 'repo-status':
            result = await window.electronAPI.invoke('git:status')
            break
          case 'security-events':
            result = await window.electronAPI.invoke('compliance:recent-events', { limit: 5 })
            break
          case 'workspace-activity':
            result = await window.electronAPI.invoke('workspace:list')
            break
          case 'setup-wizard':
            result = await window.electronAPI.invoke('setup-wizard:get-state')
            break
        }
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) setData(null)
      }
      if (!cancelled) setLoading(false)
    }
    void fetchData()
    return () => { cancelled = true }
  }, [type])

  if (type === 'continue-learning') return <LearningWidget />
  if (type === 'quick-prompt') return <QuickPromptWidget />
  if (type === 'quick-launch') return <QuickLaunchWidget />

  if (loading) return <Placeholder />

  switch (type) {
    // ── Cost Summary ──────────────────────────────────────────────────
    case 'cost-summary': {
      const s = data as Record<string, number> | null
      if (!s) return <EmptyState text="No cost data yet" />
      return (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-gray-900">${(s['todaySpend'] ?? 0).toFixed(2)}</div>
            <div className="text-xs text-gray-500">Today</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">${(s['weekSpend'] ?? 0).toFixed(2)}</div>
            <div className="text-xs text-gray-500">This Week</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">${(s['monthSpend'] ?? 0).toFixed(2)}</div>
            <div className="text-xs text-gray-500">This Month</div>
          </div>
        </div>
      )
    }

    // ── Running Agents ────────────────────────────────────────────────
    case 'running-agents': {
      const agents = data as Array<{ id: string; name: string; status: string }> | null
      if (!agents) return <EmptyState text="No agent data" />
      const running = agents.filter((a) => a.status === 'running')
      if (running.length === 0) return <EmptyState text="No running agents" />
      return (
        <div className="space-y-1.5">
          {running.slice(0, 5).map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <span className="text-gray-700 truncate">{a.name}</span>
            </div>
          ))}
          {running.length > 5 && <p className="text-[10px] text-gray-400">+{running.length - 5} more</p>}
        </div>
      )
    }

    // ── Recent Sessions ───────────────────────────────────────────────
    case 'recent-sessions': {
      const sessions = data as Array<{ id: string; cli: string; name?: string; startedAt: number; status: string }> | null
      if (!sessions || sessions.length === 0) return <EmptyState text="No sessions yet" />
      return (
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <a key={s.id} href={`#/work`}
              className="flex items-center gap-2 text-xs hover:bg-gray-50 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'running' ? 'bg-green-400' : 'bg-gray-300'}`} />
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.cli === 'copilot' ? 'bg-purple-400' : 'bg-orange-400'}`} />
              <span className="text-gray-700 truncate flex-1">{s.name ?? s.id.slice(0, 8)}</span>
              <span className="text-gray-400 text-[10px] flex-shrink-0">{timeAgo(s.startedAt)}</span>
            </a>
          ))}
        </div>
      )
    }

    // ── Notification Feed ─────────────────────────────────────────────
    case 'notification-feed': {
      const notifs = data as Array<{ id: string; title: string; severity: string; timestamp: number }> | null
      if (!notifs || notifs.length === 0) return <EmptyState text="No notifications" />
      return (
        <div className="space-y-1.5">
          {notifs.slice(0, 5).map((n) => (
            <div key={n.id} className="flex items-start gap-2 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${
                n.severity === 'error' ? 'bg-red-400' : n.severity === 'warning' ? 'bg-yellow-400' : n.severity === 'success' ? 'bg-green-400' : 'bg-blue-400'
              }`} />
              <div className="flex-1 min-w-0">
                <span className="text-gray-700 truncate block">{n.title}</span>
                <span className="text-gray-400 text-[10px]">{timeAgo(n.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )
    }

    // ── Schedule Overview ─────────────────────────────────────────────
    case 'schedule-overview': {
      const jobs = data as Array<{ id: string; name: string; cronExpression: string; enabled: boolean; lastRunAt?: number; executions: Array<{ status: string }> }> | null
      if (!jobs || jobs.length === 0) return <EmptyState text="No scheduled tasks" />
      const enabled = jobs.filter(j => j.enabled)
      const disabled = jobs.filter(j => !j.enabled)
      return (
        <div className="space-y-1.5">
          {enabled.slice(0, 4).map((j) => {
            const lastExec = j.executions[j.executions.length - 1]
            const statusColor = !lastExec ? 'bg-gray-300' : lastExec.status === 'success' || lastExec.status === 'completed' ? 'bg-green-400' : lastExec.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
            return (
              <div key={j.id} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
                <span className="text-gray-700 truncate flex-1">{j.name}</span>
                <span className="text-gray-400 text-[10px] flex-shrink-0">{cronToHuman(j.cronExpression)}</span>
              </div>
            )
          })}
          {disabled.length > 0 && (
            <p className="text-[10px] text-gray-400">{disabled.length} paused schedule{disabled.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      )
    }

    // ── Policy Status ─────────────────────────────────────────────────
    case 'policy-status': {
      const p = data as { presetName?: string; mode?: string } | null
      return (
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${
              p?.presetName === 'Unrestricted' ? 'bg-red-400' : p?.presetName === 'Cautious' ? 'bg-yellow-400' : 'bg-green-400'
            }`} />
            <span className="text-sm font-medium text-gray-800">{p?.presetName ?? 'Standard'}</span>
          </div>
          <p className="text-[10px] text-gray-400">Policy enforcement active</p>
        </div>
      )
    }

    // ── Token Usage ───────────────────────────────────────────────────
    case 'token-usage': {
      const s = data as Record<string, number> | null
      if (!s) return <EmptyState text="No usage data yet" />
      const totalTokens = (s['totalTokens'] ?? 0)
      const inputTokens = (s['totalInputTokens'] ?? 0)
      const outputTokens = (s['totalOutputTokens'] ?? 0)
      const sessionCount = (s['sessionCount'] ?? 0)
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-base font-bold text-gray-900">{formatTokens(totalTokens)}</div>
              <div className="text-[10px] text-gray-500">Total Tokens</div>
            </div>
            <div>
              <div className="text-base font-bold text-gray-900">{sessionCount}</div>
              <div className="text-[10px] text-gray-500">Sessions</div>
            </div>
          </div>
          {totalTokens > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>Input</span><span>{formatTokens(inputTokens)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 50}%` }} />
                <div className="h-full rounded-full" style={{ backgroundColor: 'var(--brand-accent-light)', width: `${totalTokens > 0 ? (outputTokens / totalTokens) * 100 : 50}%` }} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>Output</span><span>{formatTokens(outputTokens)}</span>
              </div>
            </div>
          )}
        </div>
      )
    }

    // ── Repo Status ───────────────────────────────────────────────────
    case 'repo-status': {
      const git = data as { branch?: string; staged?: string[]; modified?: string[]; untracked?: string[]; ahead?: number; behind?: number } | null
      if (!git || !git.branch) return <EmptyState text="Not a git repository" />
      const changes = (git.staged?.length ?? 0) + (git.modified?.length ?? 0) + (git.untracked?.length ?? 0)
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2" /></svg>
            <span className="text-sm font-medium text-gray-800">{git.branch}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <div className="bg-green-50 rounded-lg py-1.5">
              <div className="font-bold text-green-700">{git.staged?.length ?? 0}</div>
              <div className="text-green-600">Staged</div>
            </div>
            <div className="bg-yellow-50 rounded-lg py-1.5">
              <div className="font-bold text-yellow-700">{git.modified?.length ?? 0}</div>
              <div className="text-yellow-600">Modified</div>
            </div>
            <div className="bg-gray-50 rounded-lg py-1.5">
              <div className="font-bold text-gray-700">{git.untracked?.length ?? 0}</div>
              <div className="text-gray-500">Untracked</div>
            </div>
          </div>
          {(git.ahead ?? 0) > 0 && <p className="text-[10px] text-indigo-500">{git.ahead} commit{git.ahead !== 1 ? 's' : ''} ahead of remote</p>}
          {(git.behind ?? 0) > 0 && <p className="text-[10px] text-orange-500">{git.behind} commit{git.behind !== 1 ? 's' : ''} behind remote</p>}
          {changes === 0 && <p className="text-[10px] text-green-500">Working tree clean</p>}
        </div>
      )
    }

    // ── Security Events ───────────────────────────────────────────────
    case 'security-events': {
      const events = data as Array<{ id: string; type: string; message: string; severity: string; timestamp: number }> | null
      if (!events || events.length === 0) {
        return (
          <div className="text-center space-y-1 py-2">
            <div className="text-green-500">
              <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <p className="text-xs text-green-600 font-medium">All Clear</p>
            <p className="text-[10px] text-gray-400">No recent security events</p>
          </div>
        )
      }
      return (
        <div className="space-y-1.5">
          {events.slice(0, 5).map((e) => (
            <div key={e.id} className="flex items-start gap-2 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${
                e.severity === 'critical' || e.severity === 'error' ? 'bg-red-400' : e.severity === 'warning' ? 'bg-yellow-400' : 'bg-blue-400'
              }`} />
              <div className="flex-1 min-w-0">
                <span className="text-gray-700 block truncate">{e.message}</span>
                <span className="text-gray-400 text-[10px]">{timeAgo(e.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )
    }

    // ── Workspace Activity ────────────────────────────────────────────
    case 'workspace-activity': {
      const workspaces = data as Array<{ id: string; name: string; repos?: string[] }> | null
      if (!workspaces || workspaces.length === 0) {
        return (
          <div className="text-center space-y-2 py-1">
            <EmptyState text="No workspaces configured" />
            <a href="#/configure" className="text-[10px] text-indigo-500 hover:text-indigo-700">Set up workspaces</a>
          </div>
        )
      }
      return (
        <div className="space-y-2">
          {workspaces.slice(0, 4).map((w) => (
            <div key={w.id} className="flex items-center gap-2 text-xs">
              <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-600 text-[10px] font-bold">{w.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-700 font-medium block truncate">{w.name}</span>
                <span className="text-gray-400 text-[10px]">{w.repos?.length ?? 0} repo{(w.repos?.length ?? 0) !== 1 ? 's' : ''}</span>
              </div>
            </div>
          ))}
          {workspaces.length > 4 && <p className="text-[10px] text-gray-400">+{workspaces.length - 4} more</p>}
        </div>
      )
    }

    // ── Setup Wizard Progress ────────────────────────────────────────
    case 'setup-wizard': {
      const sw = data as { cliInstalled: boolean; authenticated: boolean; agentCreated: boolean; skillCreated: boolean; memoryCreated: boolean; triedWizard: boolean; completedAt: number | null } | null
      if (sw?.completedAt) {
        return (
          <div className="text-center space-y-1 py-2">
            <span className="text-2xl">✅</span>
            <p className="text-xs text-green-600 font-medium">Setup Complete</p>
            <p className="text-[10px] text-gray-400">You're all set! You can remove this widget.</p>
          </div>
        )
      }
      const steps = [
        { label: 'CLI Installed', done: sw?.cliInstalled },
        { label: 'Authenticated', done: sw?.authenticated },
        { label: 'Agent Created', done: sw?.agentCreated },
        { label: 'Skill Created', done: sw?.skillCreated },
        { label: 'Memory Created', done: sw?.memoryCreated },
        { label: 'Tried Wizard', done: sw?.triedWizard },
      ]
      const doneCount = steps.filter((s) => s.done).length
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">Setup Progress</span>
            <span className="text-[10px] text-gray-400">{doneCount}/{steps.length}</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <div className="space-y-1">
            {steps.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.done ? 'bg-green-400' : 'bg-gray-300'}`} />
                <span className={s.done ? 'text-gray-400 line-through' : 'text-gray-700'}>{s.label}</span>
              </div>
            ))}
          </div>
          <a href="#" onClick={(e) => { e.preventDefault(); /* Navigate to configure/setup */ }}
            className="block text-center text-[10px] text-indigo-600 hover:text-indigo-500 font-medium pt-1">
            Continue Setup →
          </a>
        </div>
      )
    }

    default:
      return <EmptyState text={`${type} widget`} />
  }
}

// ── Standalone widget components ────────────────────────────────────────────

function QuickPromptWidget(): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [sent, setSent] = useState(false)
  const handleSend = async () => {
    if (!prompt.trim()) return
    await window.electronAPI.invoke('cli:start-session', {
      cli: 'copilot', mode: 'interactive', prompt: prompt.trim(),
    })
    setPrompt('')
    setSent(true)
    setTimeout(() => setSent(false), 2000)
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend() }}
          placeholder="Ask anything..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <button onClick={() => void handleSend()} disabled={!prompt.trim()}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">Go</button>
      </div>
      {sent && <p className="text-[10px] text-green-500">Session started — switch to Work to see it</p>}
    </div>
  )
}

function QuickLaunchWidget(): JSX.Element {
  const navigate = useNavigate()
  const actions = [
    { label: 'New Session', icon: '⚡', route: '/work' },
    { label: 'Templates', icon: '📋', route: '/work' },
    { label: 'Analytics', icon: '📊', route: '/insights' },
    { label: 'Settings', icon: '⚙️', route: '/configure' },
    { label: 'Schedule', icon: '🕐', route: '/work' },
    { label: 'Knowledge', icon: '📚', route: '/work' },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button key={a.label} onClick={() => navigate(a.route)}
          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-1.5">
          <span className="text-sm">{a.icon}</span>
          {a.label}
        </button>
      ))}
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
        <span className="ml-1.5 text-green-500">✓</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        {progress.completed === 0 ? 'Welcome to ClearPathAI' : 'Continue where you left off'}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full">
          <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${progress.percentage}%` }} />
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function Placeholder(): JSX.Element {
  return <div className="h-12 bg-gray-50 rounded-lg animate-pulse" />
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return <p className="text-xs text-gray-400 text-center py-2">{text}</p>
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function cronToHuman(expr: string): string {
  const presets: Record<string, string> = {
    '0 9 * * *': 'Daily 9am',
    '0 0 * * 1-5': 'Weeknights',
    '0 9 * * 1': 'Mon 9am',
    '0 17 * * 5': 'Fri 5pm',
    '0 * * * *': 'Hourly',
    '0 8 * * 1-5': 'Weekdays 8am',
    '0 0 * * *': 'Midnight',
    '0 9-17 * * 1-5': 'Work hours',
  }
  return presets[expr] ?? expr
}
