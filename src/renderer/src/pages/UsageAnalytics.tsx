import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SessionMetric {
  sessionId: string; sessionName: string; cli: string; model: string;
  totalCost: number; totalTokens: number; promptCount: number;
  costPerPrompt: number; startedAt: number
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316']

export default function UsageAnalytics(): JSX.Element {
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [daily, setDaily] = useState<Array<{ date: string; cost: number }>>([])
  const [sessions, setSessions] = useState<SessionMetric[]>([])
  const [models, setModels] = useState<Array<{ model: string; cost: number }>>([])
  const [agents, setAgents] = useState<Array<{ agent: string; inputTokens: number; outputTokens: number }>>([])
  const [hoursMultiplier, setHoursMultiplier] = useState(3)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const weekAgo = Date.now() - 7 * 86_400_000
    const monthAgo = Date.now() - 30 * 86_400_000
    const [s, d, sess, m, a] = await Promise.all([
      window.electronAPI.invoke('cost:summary') as Promise<Record<string, number>>,
      window.electronAPI.invoke('cost:daily-spend', { since: monthAgo }) as Promise<Array<{ date: string; cost: number }>>,
      window.electronAPI.invoke('cost:by-session', { since: weekAgo }) as Promise<SessionMetric[]>,
      window.electronAPI.invoke('cost:by-model', { since: monthAgo }) as Promise<Array<{ model: string; cost: number }>>,
      window.electronAPI.invoke('cost:by-agent', { since: monthAgo }) as Promise<Array<{ agent: string; inputTokens: number; outputTokens: number }>>,
    ])
    setSummary(s); setDaily(d); setSessions(sess); setModels(m); setAgents(a)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // Estimated hours saved: sum of session durations × multiplier
  const totalSessionMinutes = sessions.reduce((sum, s) => {
    // Rough estimate: 2 minutes per prompt
    return sum + s.promptCount * 2
  }, 0)
  const estimatedHoursSaved = (totalSessionMinutes * hoursMultiplier) / 60

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading analytics...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Personal productivity and cost insights</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Hours saved multiplier:</span>
          <input type="number" value={hoursMultiplier} onChange={(e) => setHoursMultiplier(Number(e.target.value) || 1)}
            min={1} max={10} step={0.5}
            className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center" />
          <span className="text-xs text-gray-400">x</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Sessions This Week" value={String(sessions.length)} />
        <SummaryCard label="Cost This Week" value={`$${summary['weekSpend']?.toFixed(2) ?? '0.00'}`} />
        <SummaryCard label="Total Prompts" value={String(summary['totalPrompts'] ?? 0)} />
        <SummaryCard label="Est. Hours Saved" value={estimatedHoursSaved.toFixed(1)}
          subtitle={`${hoursMultiplier}x multiplier`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Daily Cost (30 days)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']} />
              <Line type="monotone" dataKey="cost" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Model Usage</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={models} dataKey="cost" nameKey="model" cx="50%" cy="50%" outerRadius={70}
                label={({ model, percent }) => `${model} (${(percent * 100).toFixed(0)}%)`}>
                {models.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Most Used Agents</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={agents} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <YAxis type="category" dataKey="agent" tick={{ fontSize: 10 }} width={80} />
              <Tooltip />
              <Bar dataKey="inputTokens" name="Input" fill="#6366f1" stackId="a" />
              <Bar dataKey="outputTokens" name="Output" fill="#ec4899" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Productivity (Cost per Prompt)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sessions.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="sessionName" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost/Prompt']} />
              <Bar dataKey="costPerPrompt" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }): JSX.Element {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}
