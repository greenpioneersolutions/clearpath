export interface CostRecord {
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

export interface DailySpend {
  date: string
  cost: number
  tokens: number
}

export interface SessionCostSummary {
  sessionId: string
  sessionName: string
  cli: 'copilot' | 'claude'
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

// Rough pricing per 1M tokens for cost estimation
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4.5': { input: 3, output: 15 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'sonnet': { input: 3, output: 15 },
  'opus': { input: 15, output: 75 },
  'haiku': { input: 0.25, output: 1.25 },
  'gpt-5': { input: 5, output: 15 },
  'gpt-5.3-codex': { input: 5, output: 15 },
  'gemini-3-pro': { input: 3.5, output: 10.5 },
  'gpt-5.4-mini': { input: 0.4, output: 1.6 },
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? { input: 3, output: 15 }
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}
