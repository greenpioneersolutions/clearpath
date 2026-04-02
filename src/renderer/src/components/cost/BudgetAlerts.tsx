import { useState, useEffect, useCallback } from 'react'
import type { BudgetConfig } from '../../types/cost'
import { DEFAULT_BUDGET } from '../../types/cost'

// ── Toast notification system ────────────────────────────────────────────────

interface Toast {
  id: number
  message: string
  type: 'warning' | 'danger'
}

let toastId = 0

export function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }): JSX.Element {
  if (toasts.length === 0) return <></>
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border animate-slide-in ${
            t.type === 'danger'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}
        >
          <span className="text-lg flex-shrink-0">{t.type === 'danger' ? '!' : '!'}</span>
          <p className="text-sm flex-1">{t.message}</p>
          <button onClick={() => onDismiss(t.id)} className="text-xs opacity-60 hover:opacity-100 flex-shrink-0">
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Budget configuration component ───────────────────────────────────────────

interface Props {
  onAlert: (toast: Toast) => void
  onAutoPause: () => void
}

export default function BudgetAlerts({ onAlert, onAutoPause }: Props): JSX.Element {
  const [budget, setBudget] = useState<BudgetConfig>(DEFAULT_BUDGET)
  const [summary, setSummary] = useState<{ todaySpend: number; weekSpend: number; monthSpend: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [b, s] = await Promise.all([
      window.electronAPI.invoke('cost:get-budget') as Promise<BudgetConfig>,
      window.electronAPI.invoke('cost:summary') as Promise<Record<string, number>>,
    ])
    setBudget(b)
    setSummary(s as { todaySpend: number; weekSpend: number; monthSpend: number })
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // Poll for budget alerts every 30 seconds
  useEffect(() => {
    const check = async () => {
      const result = await window.electronAPI.invoke('cost:check-budget') as {
        alerts: Array<{ period: string; pct: number; spend: number; ceiling: number }>
        autoPause: boolean
      }
      for (const a of result.alerts) {
        onAlert({
          id: ++toastId,
          message: `${a.period.charAt(0).toUpperCase() + a.period.slice(1)} budget ${a.pct}% reached — $${a.spend.toFixed(2)} of $${a.ceiling.toFixed(2)}`,
          type: a.pct >= 100 ? 'danger' : 'warning',
        })
        if (a.pct >= 100 && result.autoPause) onAutoPause()
      }
    }
    const interval = setInterval(() => void check(), 30000)
    void check()
    return () => clearInterval(interval)
  }, [onAlert, onAutoPause])

  const save = async (updates: Partial<BudgetConfig>) => {
    const merged = { ...budget, ...updates }
    await window.electronAPI.invoke('cost:set-budget', merged)
    setBudget(merged)
  }

  if (loading) return <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>

  const ceilings: Array<{ key: keyof BudgetConfig; label: string; period: string; spend: number }> = [
    { key: 'dailyCeiling', label: 'Daily', period: 'today', spend: summary?.todaySpend ?? 0 },
    { key: 'weeklyCeiling', label: 'Weekly', period: 'this week', spend: summary?.weekSpend ?? 0 },
    { key: 'monthlyCeiling', label: 'Monthly', period: 'this month', spend: summary?.monthSpend ?? 0 },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Budget Alerts</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Set spending ceilings to receive alerts at 50%, 75%, 90%, and 100%
        </p>
      </div>

      {ceilings.map(({ key, label, period, spend }) => {
        const ceiling = budget[key] as number | null
        const pct = ceiling ? Math.min(100, (spend / ceiling) * 100) : 0
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-800">{label} Ceiling</label>
              <span className="text-xs text-gray-500">
                ${spend.toFixed(2)} spent {period}
                {ceiling && ` / $${ceiling.toFixed(2)} (${pct.toFixed(0)}%)`}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-400 w-6">$</span>
              <input
                type="number"
                value={ceiling ?? ''}
                onChange={(e) => void save({ [key]: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="No limit"
                min={0}
                step={1}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {ceiling && (
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : pct >= 50 ? 'bg-blue-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* Auto-pause toggle */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 bg-white">
        <div>
          <span className="text-sm font-medium text-gray-800">Auto-pause at limit</span>
          <p className="text-xs text-gray-500 mt-0.5">Pause all running sessions when any ceiling is reached</p>
        </div>
        <button
          onClick={() => void save({ autoPauseAtLimit: !budget.autoPauseAtLimit })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            budget.autoPauseAtLimit ? 'bg-red-500' : 'bg-gray-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            budget.autoPauseAtLimit ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>
    </div>
  )
}
