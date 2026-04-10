// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import {
  DailySpendChart,
  SessionCostChart,
  ModelBreakdownChart,
  AgentTokensChart,
} from './CostCharts'
import type { DailySpend, SessionCostSummary, ModelBreakdown, AgentTokens } from '../../types/cost'

// ── Mock recharts ────────────────────────────────────────────────────────────
// Recharts uses SVG rendering which doesn't work well in jsdom.
// We don't test chart internals — just that the correct wrapper renders.

// ── Test data ────────────────────────────────────────────────────────────────

const dailyData: DailySpend[] = [
  { date: '2026-04-01', cost: 1.5, tokens: 50000 },
  { date: '2026-04-02', cost: 2.3, tokens: 80000 },
]

const sessionData: SessionCostSummary[] = [
  { sessionId: 's1', sessionName: 'Session 1', cli: 'copilot', totalCost: 3.5, totalTokens: 100000, promptCount: 10, costPerPrompt: 0.35, startedAt: Date.now() },
  { sessionId: 's2', sessionName: 'Session 2', cli: 'claude', totalCost: 1.2, totalTokens: 40000, promptCount: 5, costPerPrompt: 0.24, startedAt: Date.now() },
]

const modelData: ModelBreakdown[] = [
  { model: 'claude-sonnet-4.5', cost: 5.0, tokens: 200000 },
  { model: 'gpt-4o', cost: 3.0, tokens: 120000 },
]

const agentData: AgentTokens[] = [
  { agent: 'Explore', inputTokens: 50000, outputTokens: 30000 },
  { agent: 'Task', inputTokens: 80000, outputTokens: 60000 },
]

// ── DailySpendChart ──────────────────────────────────────────────────────────

describe('DailySpendChart', () => {
  it('shows empty state when no data', () => {
    render(<DailySpendChart data={[]} />)
    expect(screen.getByText('No usage data yet')).toBeDefined()
  })

  it('renders chart with token display mode', () => {
    render(<DailySpendChart data={dailyData} displayMode="tokens" />)
    expect(screen.getByText('Daily Token Usage')).toBeDefined()
  })

  it('renders chart with monetary display mode', () => {
    render(<DailySpendChart data={dailyData} displayMode="monetary" />)
    expect(screen.getByText('Daily Spend')).toBeDefined()
  })

  it('has correct aria-label for tokens mode', () => {
    const { container } = render(<DailySpendChart data={dailyData} displayMode="tokens" />)
    const figure = container.querySelector('figure')
    expect(figure?.getAttribute('aria-label')).toBe('Daily token usage line chart')
  })

  it('has correct aria-label for monetary mode', () => {
    const { container } = render(<DailySpendChart data={dailyData} displayMode="monetary" />)
    const figure = container.querySelector('figure')
    expect(figure?.getAttribute('aria-label')).toBe('Daily spend line chart')
  })
})

// ── SessionCostChart ─────────────────────────────────────────────────────────

describe('SessionCostChart', () => {
  it('shows empty state when no data', () => {
    render(<SessionCostChart data={[]} />)
    expect(screen.getByText('No session data yet')).toBeDefined()
  })

  it('renders bar chart with token mode', () => {
    render(<SessionCostChart data={sessionData} displayMode="tokens" />)
    expect(screen.getByText('Tokens per Session')).toBeDefined()
  })

  it('renders bar chart with monetary mode', () => {
    render(<SessionCostChart data={sessionData} displayMode="monetary" />)
    expect(screen.getByText('Cost per Session')).toBeDefined()
  })
})

// ── ModelBreakdownChart ──────────────────────────────────────────────────────

describe('ModelBreakdownChart', () => {
  it('shows empty state when no data', () => {
    render(<ModelBreakdownChart data={[]} />)
    expect(screen.getByText('No model data yet')).toBeDefined()
  })

  it('renders pie chart with token mode', () => {
    render(<ModelBreakdownChart data={modelData} displayMode="tokens" />)
    expect(screen.getByText('Tokens by Model')).toBeDefined()
  })

  it('renders pie chart with monetary mode', () => {
    render(<ModelBreakdownChart data={modelData} displayMode="monetary" />)
    expect(screen.getByText('Cost by Model')).toBeDefined()
  })
})

// ── AgentTokensChart ─────────────────────────────────────────────────────────

describe('AgentTokensChart', () => {
  it('shows empty state when no data', () => {
    render(<AgentTokensChart data={[]} />)
    expect(screen.getByText('No agent data yet')).toBeDefined()
  })

  it('renders stacked bar chart', () => {
    render(<AgentTokensChart data={agentData} />)
    expect(screen.getByText('Tokens by Agent')).toBeDefined()
  })

  it('has correct aria-label', () => {
    const { container } = render(<AgentTokensChart data={agentData} />)
    const figure = container.querySelector('figure')
    expect(figure?.getAttribute('aria-label')).toBe('Tokens by agent stacked bar chart')
  })
})
