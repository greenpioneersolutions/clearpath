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
}

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

// Rough pricing per 1M tokens for cost estimation
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic (Claude Code aliases)
  'sonnet': { input: 3, output: 15 },
  'opus': { input: 5, output: 25 },
  'haiku': { input: 1, output: 5 },
  // Anthropic (Copilot model IDs)
  'claude-sonnet-4.5': { input: 3, output: 15 },
  'claude-sonnet-4.6': { input: 3, output: 15 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4.5': { input: 1, output: 5 },
  'claude-opus-4.5': { input: 5, output: 25 },
  'claude-opus-4.6': { input: 5, output: 25 },
  // OpenAI
  'gpt-5-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-5': { input: 5, output: 15 },
  'gpt-5.1': { input: 5, output: 15 },
  'gpt-5.1-codex': { input: 5, output: 15 },
  'gpt-5.3-codex': { input: 5, output: 15 },
  'gpt-5.4-mini': { input: 0.4, output: 1.6 },
  // Google
  'gemini-2.5-pro': { input: 3.5, output: 10.5 },
  'gemini-3-pro': { input: 3.5, output: 10.5 },
  'gemini-3-flash': { input: 0.5, output: 1.5 },
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? { input: 3, output: 15 }
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}
