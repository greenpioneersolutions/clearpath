import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { DailySpend, SessionCostSummary, ModelBreakdown, AgentTokens, DateRange } from '../types/cost'
import { providerOf } from '../../../shared/backends'

// Token-only pie/bar palette
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316']

interface Summary {
  totalTokens?: number
  todayTokens?: number
  weekTokens?: number
  totalInputTokens?: number
  totalOutputTokens?: number
  totalPrompts?: number
  sessionCount?: number
}

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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function Activity(): JSX.Element {
  const [range, setRange] = useState<DateRange>('week')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [daily, setDaily] = useState<DailySpend[]>([])
  const [sessions, setSessions] = useState<SessionCostSummary[]>([])
  const [models, setModels] = useState<ModelBreakdown[]>([])
  const [agents, setAgents] = useState<AgentTokens[]>([])
  const [loading, setLoading] = useState(true)

  const since = useMemo(() => rangeToSince(range), [range])
  const thirtyDaysAgo = useMemo(() => Date.now() - 30 * 86_400_000, [])
  const weekAgo = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - d.getDay())
    return d.getTime()
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [s, d, sess, m, a] = await Promise.all([
      window.electronAPI.invoke('cost:summary') as Promise<Summary>,
      // Daily chart always looks back 30 days regardless of range
      window.electronAPI.invoke('cost:daily-spend', { since: thirtyDaysAgo }) as Promise<DailySpend[]>,
      window.electronAPI.invoke('cost:by-session', { since }) as Promise<SessionCostSummary[]>,
      window.electronAPI.invoke('cost:by-model', { since }) as Promise<ModelBreakdown[]>,
      window.electronAPI.invoke('cost:by-agent', { since }) as Promise<AgentTokens[]>,
    ])
    setSummary(s ?? {})
    setDaily(Array.isArray(d) ? d : [])
    setSessions(Array.isArray(sess) ? sess : [])
    setModels(Array.isArray(m) ? m : [])
    setAgents(Array.isArray(a) ? a : [])
    setLoading(false)
  }, [since, thirtyDaysAgo])

  useEffect(() => { void loadData() }, [loadData])

  // Weekly sessions = sessions started this week (from the by-session call)
  const weekSessionsRaw = useMemo(
    () => sessions.filter((s) => s.startedAt >= weekAgo),
    [sessions, weekAgo],
  )
  const weekSessionCount = weekSessionsRaw.length
  const weekPromptCount = weekSessionsRaw.reduce((sum, s) => sum + (s.promptCount ?? 0), 0)

  // Most-used model (by tokens over selected range)
  const mostUsedModel = useMemo(() => {
    if (models.length === 0) return '—'
    const top = [...models].sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0))[0]
    return top?.model ?? '—'
  }, [models])

  // Most-used agent (by input+output tokens)
  const mostUsedAgent = useMemo(() => {
    if (agents.length === 0) return '—'
    const top = [...agents].sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens))[0]
    return top?.agent ?? '—'
  }, [agents])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Sessions, prompts, and token usage across your workspace
          </p>
        </div>
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
      </div>

      {/* Summary cards (top row) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Sessions This Week" value={String(weekSessionCount)} />
        <StatCard label="Prompts This Week" value={String(weekPromptCount)} />
        <StatCard label="Most-Used Model" value={mostUsedModel} />
        <StatCard label="Most-Used Agent" value={mostUsedAgent} />
      </div>

      {/* Daily activity line chart (tokens over 30 days) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Daily Activity (30 days)</h4>
        {loading ? (
          <div className="h-60 bg-gray-50 rounded-lg animate-pulse" />
        ) : daily.length === 0 ? (
          <EmptyState text="No activity yet" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatTokens(v)} />
              <Tooltip formatter={(v: number) => [formatTokens(v), 'Tokens']} />
              <Line type="monotone" dataKey="tokens" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 2-column row: Model usage pie + Agent activity stacked bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Model Usage (Tokens)</h4>
          {loading ? (
            <div className="h-60 bg-gray-50 rounded-lg animate-pulse" />
          ) : models.length === 0 ? (
            <EmptyState text="No model data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={models}
                  dataKey="tokens"
                  nameKey="model"
                  cx="50%" cy="50%" outerRadius={80}
                  label={({ model, percent }) => `${model} (${(percent * 100).toFixed(0)}%)`}
                >
                  {models.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [formatTokens(v), 'Tokens']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Agent Activity (Tokens)</h4>
          {loading ? (
            <div className="h-60 bg-gray-50 rounded-lg animate-pulse" />
          ) : agents.length === 0 ? (
            <EmptyState text="No agent data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={agents}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="agent" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatTokens(v)} />
                <Tooltip formatter={(v: number) => [formatTokens(v), '']} />
                <Legend />
                <Bar dataKey="inputTokens" name="Input" stackId="a" fill="#6366f1" />
                <Bar dataKey="outputTokens" name="Output" stackId="a" fill="#ec4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Sessions table */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Sessions</h4>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-6 bg-gray-50 rounded animate-pulse" />)}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState text="No sessions in this range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Session</th>
                  <th className="pb-2 font-medium">CLI</th>
                  <th className="pb-2 font-medium text-right">Prompts</th>
                  <th className="pb-2 font-medium text-right">Total Tokens</th>
                  <th className="pb-2 font-medium text-right">Tokens / Prompt</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 20).map((s) => (
                  <tr key={s.sessionId} className="border-b border-gray-50">
                    <td className="py-2 text-gray-800 truncate max-w-[240px]">{s.sessionName}</td>
                    <td className="py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        providerOf(s.cli) === 'copilot' ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'
                      }`}>{s.cli}</span>
                    </td>
                    <td className="py-2 text-right text-gray-600">{s.promptCount}</td>
                    <td className="py-2 text-right font-mono text-gray-800">{formatTokens(s.totalTokens ?? 0)}</td>
                    <td className="py-2 text-right font-mono text-gray-600">
                      {s.promptCount > 0 ? formatTokens(Math.round((s.totalTokens ?? 0) / s.promptCount)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }): JSX.Element {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1 truncate">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return <p className="text-sm text-gray-400 text-center py-8">{text}</p>
}

