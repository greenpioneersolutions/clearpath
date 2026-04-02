import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

interface CostRecord {
  id: string
  sessionId: string
  sessionName: string
  cli: 'copilot' | 'claude'
  model: string
  agent?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  promptCount: number
  timestamp: number
}

interface BudgetConfig {
  dailyCeiling: number | null
  weeklyCeiling: number | null
  monthlyCeiling: number | null
  autoPauseAtLimit: boolean
}

interface CostStoreSchema {
  records: CostRecord[]
  budget: BudgetConfig
  /** Track which threshold alerts have already fired (reset daily) */
  firedAlerts: Record<string, number>
}

const store = new Store<CostStoreSchema>({
  name: 'clear-path-cost',
  defaults: {
    records: [],
    budget: { dailyCeiling: null, weeklyCeiling: null, monthlyCeiling: null, autoPauseAtLimit: false },
    firedAlerts: {},
  },
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(ts?: number): number {
  const d = ts ? new Date(ts) : new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfWeek(ts?: number): number {
  const d = ts ? new Date(ts) : new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

function startOfMonth(ts?: number): number {
  const d = ts ? new Date(ts) : new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return d.getTime()
}

function getSpendSince(since: number): number {
  return store.get('records')
    .filter((r) => r.timestamp >= since)
    .reduce((sum, r) => sum + r.estimatedCostUsd, 0)
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerCostHandlers(ipcMain: IpcMain): void {
  // ── Record a cost event ────────────────────────────────────────────────────

  ipcMain.handle('cost:record', (_e, args: Omit<CostRecord, 'id'>) => {
    const record: CostRecord = { ...args, id: randomUUID() }
    const records = store.get('records')
    records.push(record)
    // Keep max 10k records
    if (records.length > 10000) records.splice(0, records.length - 10000)
    store.set('records', records)
    return record
  })

  // ── Query records ──────────────────────────────────────────────────────────

  ipcMain.handle('cost:list', (_e, args?: { since?: number; until?: number }) => {
    let records = store.get('records')
    if (args?.since) records = records.filter((r) => r.timestamp >= args.since!)
    if (args?.until) records = records.filter((r) => r.timestamp <= args.until!)
    return records
  })

  ipcMain.handle('cost:summary', () => {
    const records = store.get('records')
    const todayStart = startOfDay()
    const weekStart = startOfWeek()
    const monthStart = startOfMonth()

    return {
      totalCost: records.reduce((s, r) => s + r.estimatedCostUsd, 0),
      totalTokens: records.reduce((s, r) => s + r.totalTokens, 0),
      totalSessions: new Set(records.map((r) => r.sessionId)).size,
      totalPrompts: records.reduce((s, r) => s + r.promptCount, 0),
      todaySpend: getSpendSince(todayStart),
      weekSpend: getSpendSince(weekStart),
      monthSpend: getSpendSince(monthStart),
    }
  })

  // ── Budget ─────────────────────────────────────────────────────────────────

  ipcMain.handle('cost:get-budget', () => store.get('budget'))

  ipcMain.handle('cost:set-budget', (_e, args: BudgetConfig) => {
    store.set('budget', args)
    store.set('firedAlerts', {})
    return args
  })

  ipcMain.handle('cost:check-budget', () => {
    const budget = store.get('budget')
    const alerts: Array<{ period: string; pct: number; spend: number; ceiling: number }> = []

    const checks: Array<[string, number | null, () => number]> = [
      ['daily', budget.dailyCeiling, () => getSpendSince(startOfDay())],
      ['weekly', budget.weeklyCeiling, () => getSpendSince(startOfWeek())],
      ['monthly', budget.monthlyCeiling, () => getSpendSince(startOfMonth())],
    ]

    const firedAlerts = store.get('firedAlerts')
    const dayKey = new Date().toISOString().slice(0, 10)

    for (const [period, ceiling, getSpend] of checks) {
      if (!ceiling) continue
      const spend = getSpend()
      const pct = (spend / ceiling) * 100
      const thresholds = [50, 75, 90, 100]

      for (const t of thresholds) {
        const alertKey = `${period}:${t}:${dayKey}`
        if (pct >= t && !firedAlerts[alertKey]) {
          alerts.push({ period, pct: t, spend, ceiling })
          firedAlerts[alertKey] = Date.now()
        }
      }
    }

    if (alerts.length > 0) store.set('firedAlerts', firedAlerts)
    return { alerts, autoPause: budget.autoPauseAtLimit }
  })

  // ── Analytics ──────────────────────────────────────────────────────────────

  ipcMain.handle('cost:daily-spend', (_e, args?: { since?: number }) => {
    const since = args?.since ?? Date.now() - 30 * 86_400_000
    const records = store.get('records').filter((r) => r.timestamp >= since)
    const byDay: Record<string, { cost: number; tokens: number }> = {}

    for (const r of records) {
      const day = new Date(r.timestamp).toISOString().slice(0, 10)
      if (!byDay[day]) byDay[day] = { cost: 0, tokens: 0 }
      byDay[day].cost += r.estimatedCostUsd
      byDay[day].tokens += r.totalTokens
    }

    return Object.entries(byDay)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))
  })

  ipcMain.handle('cost:by-model', (_e, args?: { since?: number }) => {
    const since = args?.since ?? 0
    const records = store.get('records').filter((r) => r.timestamp >= since)
    const byModel: Record<string, { cost: number; tokens: number }> = {}

    for (const r of records) {
      const key = r.model || 'unknown'
      if (!byModel[key]) byModel[key] = { cost: 0, tokens: 0 }
      byModel[key].cost += r.estimatedCostUsd
      byModel[key].tokens += r.totalTokens
    }

    return Object.entries(byModel).map(([model, data]) => ({ model, ...data }))
  })

  ipcMain.handle('cost:by-session', (_e, args?: { since?: number }) => {
    const since = args?.since ?? 0
    const records = store.get('records').filter((r) => r.timestamp >= since)
    const bySession: Record<string, {
      sessionName: string; cli: string; totalCost: number;
      totalTokens: number; promptCount: number; startedAt: number
    }> = {}

    for (const r of records) {
      if (!bySession[r.sessionId]) {
        bySession[r.sessionId] = {
          sessionName: r.sessionName, cli: r.cli,
          totalCost: 0, totalTokens: 0, promptCount: 0, startedAt: r.timestamp,
        }
      }
      const s = bySession[r.sessionId]
      s.totalCost += r.estimatedCostUsd
      s.totalTokens += r.totalTokens
      s.promptCount += r.promptCount
    }

    return Object.entries(bySession).map(([sessionId, data]) => ({
      sessionId, ...data, costPerPrompt: data.promptCount > 0 ? data.totalCost / data.promptCount : 0,
    }))
  })

  ipcMain.handle('cost:by-agent', (_e, args?: { since?: number }) => {
    const since = args?.since ?? 0
    const records = store.get('records').filter((r) => r.timestamp >= since)
    const byAgent: Record<string, { inputTokens: number; outputTokens: number }> = {}

    for (const r of records) {
      const key = r.agent || 'default'
      if (!byAgent[key]) byAgent[key] = { inputTokens: 0, outputTokens: 0 }
      byAgent[key].inputTokens += r.inputTokens
      byAgent[key].outputTokens += r.outputTokens
    }

    return Object.entries(byAgent).map(([agent, data]) => ({ agent, ...data }))
  })

  // ── Export ─────────────────────────────────────────────────────────────────

  ipcMain.handle('cost:export-csv', (_e, args?: { since?: number }) => {
    const since = args?.since ?? 0
    const records = store.get('records').filter((r) => r.timestamp >= since)
    const headers = 'Date,Session,CLI,Model,Agent,Input Tokens,Output Tokens,Total Tokens,Cost (USD),Prompts'
    const rows = records.map((r) =>
      [
        new Date(r.timestamp).toISOString(),
        `"${r.sessionName.replace(/"/g, '""')}"`,
        r.cli, r.model, r.agent ?? '',
        r.inputTokens, r.outputTokens, r.totalTokens,
        r.estimatedCostUsd.toFixed(6), r.promptCount,
      ].join(',')
    )
    return [headers, ...rows].join('\n')
  })

  ipcMain.handle('cost:clear', () => {
    store.set('records', [])
    store.set('firedAlerts', {})
    return { success: true }
  })
}
