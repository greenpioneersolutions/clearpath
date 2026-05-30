import type { BackendId } from '../../../shared/backends'

export interface CostRecord {
  id: string
  sessionId: string
  sessionName: string
  cli: BackendId
  model: string
  agent?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  promptCount: number
  timestamp: number
  // ── Token Coach Phase 1: per-slice breakdown (all optional; legacy-safe) ──
  userPromptTokens?: number
  injectedContextTokens?: number
  agentPromptTokens?: number
  notesTokens?: number
  contextSourcesTokens?: number
  cachedInputTokens?: number
  cacheCreationTokens?: number
}

export type { PromptSlices, SessionTurnBreakdown } from '../../../shared/tokenization/types'

export interface DailySpend {
  date: string
  cost: number
  tokens: number
}

export interface SessionCostSummary {
  sessionId: string
  sessionName: string
  cli: BackendId
  totalCost: number
  totalTokens: number
  promptCount: number
  costPerPrompt: number
  startedAt: number
}

export interface ModelBreakdown {
  model: string
  cost: number
  tokens: number
}

export interface AgentTokens {
  agent: string
  inputTokens: number
  outputTokens: number
}

export interface BudgetConfig {
  dailyCeiling: number | null
  weeklyCeiling: number | null
  monthlyCeiling: number | null
  dailyTokenCeiling: number | null
  weeklyTokenCeiling: number | null
  monthlyTokenCeiling: number | null
  autoPauseAtLimit: boolean
}

export type AnalyticsDisplayMode = 'tokens' | 'monetary'

export type DateRange = 'today' | 'week' | 'month' | 'custom'

export const DEFAULT_BUDGET: BudgetConfig = {
  dailyCeiling: null,
  weeklyCeiling: null,
  monthlyCeiling: null,
  dailyTokenCeiling: null,
  weeklyTokenCeiling: null,
  monthlyTokenCeiling: null,
  autoPauseAtLimit: false,
}

// Pricing lives in the shared module so the main process and the renderer
// agree on the same numbers, and there's a single place to maintain them.
// Renderer analytics screens that want a *live* table (reflecting user
// overrides + remote sync) should subscribe via PricingContext — the static
// re-export here is for non-reactive callers (tests, one-off estimates).
export { MODEL_PRICING, estimateCost } from '../../../shared/pricing'
