import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { DailySpend, SessionCostSummary, ModelBreakdown, AgentTokens, AnalyticsDisplayMode } from '../../types/cost'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316']

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ── Daily Spend / Token Usage Line Chart ────────────────────────────────────

export function DailySpendChart({ data, displayMode = 'tokens' }: { data: DailySpend[]; displayMode?: AnalyticsDisplayMode }): JSX.Element {
  if (data.length === 0) return <EmptyChart label="No usage data yet" />
  const isTokens = displayMode === 'tokens'
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">{isTokens ? 'Daily Token Usage' : 'Daily Spend'}</h4>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={isTokens ? (v) => fmtTokens(v) : (v) => `$${v.toFixed(2)}`}
          />
          <Tooltip formatter={(v: number) => isTokens ? [fmtTokens(v), 'Tokens'] : [`$${v.toFixed(4)}`, 'Cost']} />
          <Line
            type="monotone"
            dataKey={isTokens ? 'tokens' : 'cost'}
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Session Cost / Token Bar Chart ──────────────────────────────────────────

export function SessionCostChart({ data, displayMode = 'tokens' }: { data: SessionCostSummary[]; displayMode?: AnalyticsDisplayMode }): JSX.Element {
  if (data.length === 0) return <EmptyChart label="No session data yet" />
  const isTokens = displayMode === 'tokens'
  const sortKey = isTokens ? 'totalTokens' : 'totalCost'
  const top = [...data].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number)).slice(0, 15)
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">{isTokens ? 'Tokens per Session' : 'Cost per Session'}</h4>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={top}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="sessionName" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={isTokens ? (v) => fmtTokens(v) : (v) => `$${v.toFixed(2)}`}
          />
          <Tooltip formatter={(v: number) => isTokens ? [fmtTokens(v), 'Tokens'] : [`$${v.toFixed(4)}`, 'Cost']} />
          <Bar dataKey={isTokens ? 'totalTokens' : 'totalCost'} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Model Breakdown Pie Chart ───────────────────────────────────────────────

export function ModelBreakdownChart({ data, displayMode = 'tokens' }: { data: ModelBreakdown[]; displayMode?: AnalyticsDisplayMode }): JSX.Element {
  if (data.length === 0) return <EmptyChart label="No model data yet" />
  const isTokens = displayMode === 'tokens'
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">{isTokens ? 'Tokens by Model' : 'Cost by Model'}</h4>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey={isTokens ? 'tokens' : 'cost'}
            nameKey="model"
            cx="50%" cy="50%" outerRadius={80}
            label={({ model, percent }) => `${model} (${(percent * 100).toFixed(0)}%)`}
          >
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => isTokens ? [fmtTokens(v), 'Tokens'] : [`$${v.toFixed(4)}`, 'Cost']} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Agent Tokens Stacked Bar (always tokens) ────────────────────────────────

export function AgentTokensChart({ data }: { data: AgentTokens[] }): JSX.Element {
  if (data.length === 0) return <EmptyChart label="No agent data yet" />
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Tokens by Agent</h4>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="agent" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtTokens(v)} />
          <Tooltip formatter={(v: number) => [fmtTokens(v), '']} />
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
