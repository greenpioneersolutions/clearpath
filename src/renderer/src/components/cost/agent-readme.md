# Cost — Budget tracking and analytics

## Purpose
Provides cost monitoring, budget configuration, alerts, and usage analytics dashboards. Helps users track token usage and spending across sessions, models, and agents.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| BudgetAlerts.tsx | Budget ceiling management and alert configuration; token vs monetary display modes; auto-pause toggle; progress bars | `BudgetAlerts`, `ToastContainer`, `Toast` type |
| CostCharts.tsx | Recharts-based analytics visualizations; daily spend/token line chart, session bar chart, model breakdown pie, agent tokens stacked bar | `DailySpendChart()`, `SessionCostChart()`, `ModelBreakdownChart()`, `AgentTokensChart()`, `EmptyChart()` |
| CostExport.tsx | CSV export and history clear utilities; downloads cost report as CSV, clears cost database | `CostExport` |

## Architecture Notes

### Display Modes
- `displayMode: 'tokens' | 'spend'` — switches between token-count and USD-based analytics
- Token mode is default for enterprise/token-tracked backends
- Both modes shown in collapsible sections

### Budget Configuration Structure
```typescript
BudgetConfig {
  dailyTokenCeiling?, weeklyTokenCeiling?, monthlyTokenCeiling?,
  dailyCeiling?, weeklyCeiling?, monthlyCeiling?,
  autoPauseAtLimit: boolean
}
```

### Data Types
- `DailySpend`: { date, tokens, cost }
- `SessionCostSummary`: { sessionName, totalTokens, totalCost }
- `ModelBreakdown`: { model, tokens, cost }
- `AgentTokens`: { agent, inputTokens, outputTokens }

### IPC Calls Made
- `cost:get-budget` - retrieve current BudgetConfig
- `cost:summary` - get usage summary (todayTokens, weekTokens, monthTokens, todaySpend, weekSpend, monthSpend)
- `cost:check-budget` - poll for alerts (fires at 50%, 75%, 90%, 100%)
- `cost:set-budget` - save budget updates
- `cost:export-csv` - export cost history as CSV
- `cost:clear` - wipe cost database

### Alert System
- Polls every 30 seconds via `setInterval`
- Returns alerts with: period, pct, spend, ceiling, unit
- Auto-pause triggers at 100% if enabled
- Toast notifications for each alert (warning at <100%, danger at 100%)

### Chart Data Flow
1. Load summary from `cost:summary` IPC
2. Format into chart-specific shapes
3. Recharts renders with responsive containers
4. Token formatting utility: 1M+ → "1.5M", 1k+ → "1.5k"

## Business Context
Critical compliance and cost-control feature. Prevents runaway spending on AI model usage, tracks budget adherence, and provides visibility into which sessions/models consume the most resources. Auto-pause prevents accidental over-spending.

