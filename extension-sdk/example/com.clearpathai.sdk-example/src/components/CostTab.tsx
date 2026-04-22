/**
 * Cost Tab — Demonstrates sdk.cost.summary(), sdk.cost.list(),
 * sdk.cost.getBudget(), and sdk.cost.bySession().
 *
 * Displays cost analytics, budget configuration, and per-session breakdowns.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonSecondaryStyle, errorStyle, loadingStyle,
  labelStyle, gridStyle, tableStyle, thStyle, tdStyle,
} from './shared-styles'

interface BudgetConfig {
  dailyCeiling: number | null
  weeklyCeiling: number | null
  monthlyCeiling: number | null
  dailyTokenCeiling: number | null
  weeklyTokenCeiling: number | null
  monthlyTokenCeiling: number | null
  autoPauseAtLimit: boolean
}

interface SessionCost {
  sessionId: string
  sessionName: string
  cli: string
  totalCost: number
  totalTokens: number
  promptCount: number
  costPerPrompt: number
}

export function CostTab(): React.ReactElement {
  const sdk = useSDK()

  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [budget, setBudget] = useState<BudgetConfig | null>(null)
  const [sessionCosts, setSessionCosts] = useState<SessionCost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [s, b, sc] = await Promise.all([
        sdk.cost.summary(),
        sdk.cost.getBudget(),
        sdk.cost.bySession(),
      ])
      setSummary(s as unknown as Record<string, unknown>)
      setBudget(b)
      setSessionCosts(sc)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sdk])

  useEffect(() => {
    refresh()
  }, [refresh])

  const formatCost = (val: unknown) => {
    const n = Number(val)
    return isNaN(n) ? 'N/A' : `$${n.toFixed(4)}`
  }

  const formatTokens = (val: unknown) => {
    const n = Number(val)
    return isNaN(n) ? 'N/A' : n.toLocaleString()
  }

  return (
    <div>
      <h2 style={headingStyle}>Cost (sdk.cost)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Read cost/usage analytics. Requires <code>cost:read</code> permission.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      {loading ? (
        <div style={loadingStyle}>Loading cost data...</div>
      ) : (
        <>
          {/* Summary cards */}
          {summary && (
            <div style={{ ...gridStyle, marginBottom: '16px' }}>
              {[
                { label: 'Total Cost', value: formatCost(summary.totalCost) },
                { label: 'Total Tokens', value: formatTokens(summary.totalTokens) },
                { label: 'Total Sessions', value: String(summary.totalSessions ?? 0) },
                { label: 'Total Prompts', value: String(summary.totalPrompts ?? 0) },
                { label: 'Today', value: formatCost(summary.todaySpend) },
                { label: 'This Week', value: formatCost(summary.weekSpend) },
                { label: 'This Month', value: formatCost(summary.monthSpend) },
                { label: 'Display Mode', value: String(summary.displayMode ?? 'tokens') },
              ].map((item) => (
                <div key={item.label} style={cardStyle}>
                  <span style={labelStyle}>{item.label}</span>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Budget */}
          {budget && (
            <div style={{ ...cardStyle, marginBottom: '16px' }}>
              <h3 style={{ ...headingStyle, fontSize: '14px' }}>Budget Configuration</h3>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Daily Ceiling', value: budget.dailyCeiling },
                  { label: 'Weekly Ceiling', value: budget.weeklyCeiling },
                  { label: 'Monthly Ceiling', value: budget.monthlyCeiling },
                ].map((b) => (
                  <div key={b.label}>
                    <span style={labelStyle}>{b.label}</span>
                    <span style={{ color: '#e2e8f0', fontSize: '14px' }}>
                      {b.value != null ? `$${b.value.toFixed(2)}` : 'No limit'}
                    </span>
                  </div>
                ))}
                <div>
                  <span style={labelStyle}>Auto-pause</span>
                  <span style={{ color: budget.autoPauseAtLimit ? '#6ee7b7' : '#94a3b8', fontSize: '14px' }}>
                    {budget.autoPauseAtLimit ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Session costs */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ ...headingStyle, marginBottom: 0 }}>
                Cost by Session ({sessionCosts.length})
              </h3>
              <button style={buttonSecondaryStyle} onClick={refresh}>
                Refresh
              </button>
            </div>
            {sessionCosts.length === 0 ? (
              <div style={loadingStyle}>No session cost data available.</div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Session</th>
                    <th style={thStyle}>CLI</th>
                    <th style={thStyle}>Cost</th>
                    <th style={thStyle}>Tokens</th>
                    <th style={thStyle}>Prompts</th>
                    <th style={thStyle}>$/Prompt</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionCosts.slice(0, 20).map((sc) => (
                    <tr key={sc.sessionId}>
                      <td style={{ ...tdStyle, fontSize: '12px' }}>
                        {sc.sessionName || sc.sessionId.slice(0, 12)}
                      </td>
                      <td style={tdStyle}>{sc.cli}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{formatCost(sc.totalCost)}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{formatTokens(sc.totalTokens)}</td>
                      <td style={tdStyle}>{sc.promptCount}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{formatCost(sc.costPerPrompt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
