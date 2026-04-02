import { useState, useEffect, useCallback } from 'react'
import type { DailySpend, SessionCostSummary, ModelBreakdown, AgentTokens, DateRange } from '../types/cost'
import { DailySpendChart, SessionCostChart, ModelBreakdownChart, AgentTokensChart } from '../components/cost/CostCharts'
import BudgetAlerts, { ToastContainer } from '../components/cost/BudgetAlerts'
import CostExport from '../components/cost/CostExport'

type Tab = 'overview' | 'budget'

interface Toast { id: number; message: string; type: 'warning' | 'danger' }

const RANGES: { key: DateRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'All Time' },
]

function rangeToSince(range: DateRange): number {
  const now = new Date()
  if (range === 'today') { now.setHours(0, 0, 0, 0); return now.getTime() }
  if (range === 'week') { now.setHours(0, 0, 0, 0); now.setDate(now.getDate() - now.getDay()); return now.getTime() }
  if (range === 'month') { now.setHours(0, 0, 0, 0); now.setDate(1); return now.getTime() }
  return 0
}

export default function Analytics(): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview')
  const [range, setRange] = useState<DateRange>('month')
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [daily, setDaily] = useState<DailySpend[]>([])
  const [sessions, setSessions] = useState<SessionCostSummary[]>([])
  const [models, setModels] = useState<ModelBreakdown[]>([])
  const [agents, setAgents] = useState<AgentTokens[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [loading, setLoading] = useState(true)

  const since = rangeToSince(range)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [s, d, sess, m, a] = await Promise.all([
      window.electronAPI.invoke('cost:summary') as Promise<Record<string, number>>,
      window.electronAPI.invoke('cost:daily-spend', { since }) as Promise<DailySpend[]>,
      window.electronAPI.invoke('cost:by-session', { since }) as Promise<SessionCostSummary[]>,
      window.electronAPI.invoke('cost:by-model', { since }) as Promise<ModelBreakdown[]>,
      window.electronAPI.invoke('cost:by-agent', { since }) as Promise<AgentTokens[]>,
    ])
    setSummary(s)
    setDaily(d)
    setSessions(sess)
    setModels(m)
    setAgents(a)
    setLoading(false)
  }, [since])

  useEffect(() => { void loadData() }, [loadData])

  const addToast = useCallback((t: Toast) => {
    setToasts((prev) => [...prev, t])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 8000)
  }, [])

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const handleAutoPause = useCallback(async () => {
    if (!confirm('Budget limit reached. Pause all running sessions?')) return
    await window.electronAPI.invoke('subagent:kill-all')
    const sessionList = await window.electronAPI.invoke('cli:list-sessions') as Array<{ sessionId: string; status: string }>
    for (const s of sessionList.filter((x) => x.status === 'running')) {
      await window.electronAPI.invoke('cli:stop-session', { sessionId: s.sessionId })
    }
  }, [])

  // Cost per task
  const avgCostPerPrompt = summary && summary['totalPrompts'] > 0
    ? summary['totalCost'] / summary['totalPrompts']
    : 0

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Token usage, costs, and budget tracking</p>
        </div>
        <CostExport since={since} />
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Spend" value={`$${summary['totalCost']?.toFixed(2) ?? '0.00'}`} />
          <StatCard label="Today" value={`$${summary['todaySpend']?.toFixed(2) ?? '0.00'}`} />
          <StatCard label="Total Tokens" value={formatTokens(summary['totalTokens'] ?? 0)} />
          <StatCard label="Avg Cost/Prompt" value={`$${avgCostPerPrompt.toFixed(4)}`} subtitle={`${summary['totalPrompts'] ?? 0} prompts`} />
        </div>
      )}

      {/* Tabs + range */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          {([['overview', 'Charts'], ['budget', 'Budget']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'overview' && (
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  range === r.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {tab === 'overview' ? (
        loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DailySpendChart data={daily} />
              <SessionCostChart data={sessions} />
              <ModelBreakdownChart data={models} />
              <AgentTokensChart data={agents} />
            </div>

            {/* Cost per task table */}
            {sessions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Cost per Task</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">Session</th>
                        <th className="pb-2 font-medium">CLI</th>
                        <th className="pb-2 font-medium text-right">Prompts</th>
                        <th className="pb-2 font-medium text-right">Total Cost</th>
                        <th className="pb-2 font-medium text-right">Cost/Prompt</th>
                        <th className="pb-2 font-medium text-right">Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.slice(0, 20).map((s) => (
                        <tr key={s.sessionId} className="border-b border-gray-50">
                          <td className="py-2 text-gray-800 truncate max-w-[200px]">{s.sessionName}</td>
                          <td className="py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              s.cli === 'copilot' ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'
                            }`}>{s.cli}</span>
                          </td>
                          <td className="py-2 text-right text-gray-600">{s.promptCount}</td>
                          <td className="py-2 text-right font-mono text-gray-800">${s.totalCost.toFixed(4)}</td>
                          <td className="py-2 text-right font-mono text-gray-600">${s.costPerPrompt.toFixed(4)}</td>
                          <td className="py-2 text-right text-gray-500">{formatTokens(s.totalTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <BudgetAlerts onAlert={addToast} onAutoPause={() => void handleAutoPause()} />
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }): JSX.Element {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
