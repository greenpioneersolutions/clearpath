import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { DailySpend, SessionCostSummary, ModelBreakdown, AgentTokens } from '../../types/cost'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316']

// ── Daily Spend Line Chart ───────────────────────────────────────────────────

export function DailySpendChart({ data }: { data: DailySpend[] }): JSX.Element {
  if (data.length === 0) return <EmptyChart label="No spend data yet" />
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Daily Spend</h4>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
          <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']} />
          <Line type="monotone" dataKey="cost" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Session Cost Bar Chart ───────────────────────────────────────────────────

export function SessionCostChart({ data }: { data: SessionCostSummary[] }): JSX.Element {
  if (data.length === 0) return <EmptyChart label="No session data yet" />
  const top = data.sort((a, b) => b.totalCost - a.totalCost).slice(0, 15)
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Cost per Session</h4>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={top}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="sessionName" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
          <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']} />
          <Bar dataKey="totalCost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Model Breakdown Pie Chart ────────────────────────────────────────────────

export function ModelBreakdownChart({ data }: { data: ModelBreakdown[] }): JSX.Element {
  if (data.length === 0) return <EmptyChart label="No model data yet" />
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Cost by Model</h4>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="cost" nameKey="model" cx="50%" cy="50%" outerRadius={80} label={({ model, percent }) => `${model} (${(percent * 100).toFixed(0)}%)`}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Agent Tokens Stacked Bar ─────────────────────────────────────────────────

export function AgentTokensChart({ data }: { data: AgentTokens[] }): JSX.Element {
  if (data.length === 0) return <EmptyChart label="No agent data yet" />
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Tokens by Agent</h4>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="agent" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
          <Tooltip />
          <Legend />
          <Bar dataKey="inputTokens" name="Input" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
          <Bar dataKey="outputTokens" name="Output" stackId="a" fill="#ec4899" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function EmptyChart({ label }: { label: string }): JSX.Element {
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}
