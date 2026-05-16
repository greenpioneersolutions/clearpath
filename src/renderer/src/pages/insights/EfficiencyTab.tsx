import { useState, useEffect, useMemo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useFlag } from '../../contexts/FeatureFlagContext'

/**
 * Token Coach Phase 5 — Insights "Efficiency" tab.
 *
 * Four sections, each driven by REAL data (never invented numbers):
 *   1. "Where did your tokens go this week?" — donut + legend, slices from
 *      `efficiency:where-did-tokens-go`.
 *   2. "Top context bloat" — ranked table of notes/agents that contributed
 *      the most injected tokens.
 *   3. "Routing distribution" — only when `showModelRouting` is also on.
 *   4. "Estimated savings" cards — surface only when the heuristics produce
 *      a real >$0 number. If there's nothing to show, the section is hidden.
 *
 * No-data state: when fewer than 3 cost records exist in the window we
 * render a single friendly empty state and skip everything else.
 */

interface WhereDidTokensGoBreakdown {
  total: number
  user: number
  agent: number
  notes: number
  contextSources: number
  cached: number
  output: number
  since: number
  recordCount: number
}

interface ContextBloatEntry {
  kind: 'note' | 'agent'
  id: string
  title: string
  sessions: number
  totalTokens: number
  avgTokens: number
}

interface SavingsSuggestion {
  id: string
  cardId: 'enable-prompt-cache' | 'enable-auto-routing' | 'trim-large-note'
  title: string
  body: string
  estimatedSavingsUsd: number
  ctaLink: string
  ctaLabel: string
}

const SLICE_COLORS = {
  user: '#6366f1',          // indigo — what the user typed
  agent: '#8b5cf6',          // violet — persona / system prompt
  notes: '#10b981',          // emerald — reference notes
  contextSources: '#06b6d4', // cyan — live data feeds
  cached: '#94a3b8',         // slate — cache reads (free-ish)
  output: '#f59e0b',         // amber — what the model produced
}

const SLICE_LABELS = {
  user: 'User text',
  agent: 'Agent prompt',
  notes: 'Notes',
  contextSources: 'Context sources',
  cached: 'Cached (read)',
  output: 'Output',
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  if (amount < 1) return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(2)}`
}

/** Minimum cost records before we consider showing real-data sections. */
const MIN_RECORDS_FOR_INSIGHTS = 3

export default function EfficiencyTab(): JSX.Element {
  const [breakdown, setBreakdown] = useState<WhereDidTokensGoBreakdown | null>(null)
  const [bloat, setBloat] = useState<ContextBloatEntry[]>([])
  const [suggestions, setSuggestions] = useState<SavingsSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const showModelRouting = useFlag('showModelRouting')
  const showPromptCache = useFlag('showPromptCache')

  useEffect(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    let cancelled = false
    void (async () => {
      try {
        const [b, c, s] = await Promise.all([
          window.electronAPI.invoke('efficiency:where-did-tokens-go', { since: sevenDaysAgo }) as Promise<WhereDidTokensGoBreakdown>,
          window.electronAPI.invoke('efficiency:top-context-bloat', { since: sevenDaysAgo, limit: 10 }) as Promise<ContextBloatEntry[]>,
          window.electronAPI.invoke('efficiency:savings-suggestions', {
            since: sevenDaysAgo,
            cachePolicyEnabled: showPromptCache,
            routingEnabled: showModelRouting,
          }) as Promise<SavingsSuggestion[]>,
        ])
        if (cancelled) return
        setBreakdown(b ?? null)
        setBloat(Array.isArray(c) ? c : [])
        setSuggestions(Array.isArray(s) ? s : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [showModelRouting, showPromptCache])

  // Slice the breakdown into the chart's data array — drop zero-token slices.
  const pieData = useMemo(() => {
    if (!breakdown) return []
    const slices = [
      { key: 'user', value: breakdown.user },
      { key: 'agent', value: breakdown.agent },
      { key: 'notes', value: breakdown.notes },
      { key: 'contextSources', value: breakdown.contextSources },
      { key: 'cached', value: breakdown.cached },
      { key: 'output', value: breakdown.output },
    ] as const
    return slices
      .filter((s) => s.value > 0)
      .map((s) => ({
        name: SLICE_LABELS[s.key as keyof typeof SLICE_LABELS],
        value: s.value,
        color: SLICE_COLORS[s.key as keyof typeof SLICE_COLORS],
      }))
  }, [breakdown])

  if (loading) {
    return (
      <div className="space-y-4" data-testid="efficiency-tab-loading">
        <div className="h-32 bg-gray-50 rounded-xl animate-pulse" />
        <div className="h-60 bg-gray-50 rounded-xl animate-pulse" />
      </div>
    )
  }

  const recordCount = breakdown?.recordCount ?? 0
  const hasEnoughData = recordCount >= MIN_RECORDS_FOR_INSIGHTS

  if (!hasEnoughData) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">
            Send a few more sessions and we'll show you where you can save.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {recordCount === 0 ? 'No cost records yet.' : `Only ${recordCount} record${recordCount === 1 ? '' : 's'} so far — at least ${MIN_RECORDS_FOR_INSIGHTS} needed.`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header />

      {/* Section 1: Where did tokens go */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-1">
          Where did your tokens go this week?
        </h4>
        <p className="text-xs text-gray-500 mb-3">
          {breakdown ? `${formatTokens(breakdown.total)} tokens across ${breakdown.recordCount} turn${breakdown.recordCount === 1 ? '' : 's'}` : ''}
        </p>
        {pieData.length === 0 ? (
          <EmptyState text="No token data yet" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={85}
                  paddingAngle={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [formatTokens(v), 'Tokens']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col justify-center gap-1.5">
              {pieData.map((s) => {
                const pct = breakdown && breakdown.total > 0 ? (s.value / breakdown.total) * 100 : 0
                return (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-gray-700 flex-1 truncate">{s.name}</span>
                    <span className="text-gray-500 font-mono tabular-nums">{formatTokens(s.value)}</span>
                    <span className="text-gray-400 font-mono tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Top context bloat */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-1">Top sources of injected context</h4>
        <p className="text-xs text-gray-500 mb-3">
          Notes and agents you attached most often, ranked by total tokens contributed.
        </p>
        {bloat.length === 0 ? (
          <EmptyState text="No attached notes or agents this week" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium text-right">Sessions</th>
                  <th className="pb-2 font-medium text-right">Avg tokens</th>
                  <th className="pb-2 font-medium text-right">Total tokens</th>
                </tr>
              </thead>
              <tbody>
                {bloat.map((row) => (
                  <tr key={`${row.kind}:${row.id}`} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 text-gray-900 truncate max-w-xs">{row.title}</td>
                    <td className="py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                        row.kind === 'note'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-violet-100 text-violet-700'
                      }`}>
                        {row.kind}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-gray-700">{row.sessions}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-gray-700">{formatTokens(row.avgTokens)}</td>
                    <td className="py-2 text-right font-mono tabular-nums font-semibold text-gray-900">{formatTokens(row.totalTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 3: Routing distribution — only when Phase 4 is on */}
      {showModelRouting && (
        <RoutingDistribution since={Date.now() - 7 * 24 * 60 * 60 * 1000} />
      )}

      {/* Section 4: Estimated savings — ONLY if at least one card */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900">Estimated savings</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions.map((s) => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h5 className="text-sm font-semibold text-gray-900">{s.title}</h5>
                  <span className="text-sm font-bold text-emerald-600 whitespace-nowrap" data-testid="savings-amount">
                    ~{formatUsd(s.estimatedSavingsUsd)}/wk
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-3 leading-relaxed">{s.body}</p>
                <a
                  href={`#${s.ctaLink}`}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  {s.ctaLabel} →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Header(): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Efficiency</h1>
      <p className="text-sm text-gray-500 mt-0.5">
        Where your tokens go, and where you can save. Last 7 days.
      </p>
    </div>
  )
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return (
    <div className="h-32 flex items-center justify-center text-xs text-gray-400">
      {text}
    </div>
  )
}

// ── Routing distribution sub-section ────────────────────────────────────────

interface RoutingDistributionData {
  trivial: number
  normal: number
  hard: number
  overrideCount: number
  total: number
}

const ROUTING_COLORS = {
  trivial: '#10b981',  // emerald — cheap
  normal: '#6366f1',   // indigo — default
  hard: '#ec4899',     // pink — expensive
}

/**
 * Pie of trivial/normal/hard turns plus an override-rate stat. Computed
 * renderer-side from `cost:list` since the breakdown is small (we already
 * load these rows for other Insights). When the user overrides > 30% of
 * the time, surface a "Tune routing" link.
 */
function RoutingDistribution({ since }: { since: number }): JSX.Element {
  const [data, setData] = useState<RoutingDistributionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const records = await window.electronAPI.invoke('cost:list', { since }) as Array<{
          routedDifficulty?: 'trivial' | 'normal' | 'hard'
          userOverride?: boolean
        }>
        if (cancelled) return
        if (!Array.isArray(records)) {
          setData({ trivial: 0, normal: 0, hard: 0, overrideCount: 0, total: 0 })
          return
        }
        const agg: RoutingDistributionData = { trivial: 0, normal: 0, hard: 0, overrideCount: 0, total: 0 }
        for (const r of records) {
          if (!r.routedDifficulty) continue
          agg[r.routedDifficulty]++
          agg.total++
          if (r.userOverride) agg.overrideCount++
        }
        setData(agg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [since])

  if (loading) {
    return <div className="h-32 bg-gray-50 rounded-xl animate-pulse" />
  }
  if (!data || data.total === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-1">Routing distribution</h4>
        <EmptyState text="No routing decisions yet — auto-routing hasn't fired in this window" />
      </div>
    )
  }

  const pie = [
    { name: 'Trivial', value: data.trivial, color: ROUTING_COLORS.trivial },
    { name: 'Normal', value: data.normal, color: ROUTING_COLORS.normal },
    { name: 'Hard', value: data.hard, color: ROUTING_COLORS.hard },
  ].filter((s) => s.value > 0)
  const overridePct = data.total > 0 ? (data.overrideCount / data.total) * 100 : 0
  const showTune = overridePct > 30

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Routing distribution</h4>
          <p className="text-xs text-gray-500">
            Auto-routing decisions across {data.total} turn{data.total === 1 ? '' : 's'}.
            {data.overrideCount > 0 && ` You overrode ${data.overrideCount} time${data.overrideCount === 1 ? '' : 's'} (${overridePct.toFixed(0)}%).`}
          </p>
        </div>
        {showTune && (
          <a
            href="#/configure?tab=advanced"
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap"
            data-testid="tune-routing-link"
          >
            Tune routing →
          </a>
        )}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
            {pie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
