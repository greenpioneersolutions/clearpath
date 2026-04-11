// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

// Mock recharts — it doesn't render well in jsdom
vi.mock('recharts', () => {
  const React = require('react')
  return {
    ResponsiveContainer: ({ children }: { children: unknown }) => React.createElement('div', { 'data-testid': 'responsive-container' }, children),
    BarChart: ({ children }: { children: unknown }) => React.createElement('div', { 'data-testid': 'bar-chart' }, children),
    LineChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    PieChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    Bar: () => null,
    Line: () => null,
    Pie: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    Area: () => null,
    AreaChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
  }
})

import Analytics from './Analytics'

function renderAnalytics() {
  return render(
    <MemoryRouter>
      <Analytics />
    </MemoryRouter>
  )
}

describe('Analytics', () => {
  const mockSummary = {
    totalTokens: 150000,
    todayTokens: 5000,
    totalInputTokens: 80000,
    totalOutputTokens: 70000,
    totalCost: 2.5,
    todaySpend: 0.15,
    totalPrompts: 100,
    displayMode: 'tokens',
  }

  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cost:summary') return Promise.resolve(mockSummary)
      if (channel === 'cost:daily-spend') return Promise.resolve([])
      if (channel === 'cost:by-session') return Promise.resolve([])
      if (channel === 'cost:by-model') return Promise.resolve([])
      if (channel === 'cost:by-agent') return Promise.resolve([])
      if (channel === 'cost:set-display-mode') return Promise.resolve(null)
      if (channel === 'cost:get-budget') return Promise.resolve({ daily: null, weekly: null, monthly: null, dailyTokens: null, weeklyTokens: null, monthlyTokens: null, autoPause: false })
      if (channel === 'cost:check-budget') return Promise.resolve({ alerts: [], autoPause: false })
      if (channel === 'subagent:kill-all') return Promise.resolve(null)
      if (channel === 'cli:list-sessions') return Promise.resolve([])
      if (channel === 'cli:stop-session') return Promise.resolve(null)
      return Promise.resolve(null)
    })
  })

  it('renders page heading', () => {
    renderAnalytics()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
  })

  it('renders display mode toggle buttons', () => {
    renderAnalytics()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
    expect(screen.getByText('Cost ($)')).toBeInTheDocument()
  })

  it('renders Charts and Budget tabs', () => {
    renderAnalytics()
    expect(screen.getByText('Charts')).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
  })

  it('renders date range buttons', () => {
    renderAnalytics()
    expect(screen.getByText('This Week')).toBeInTheDocument()
    expect(screen.getByText('This Month')).toBeInTheDocument()
    expect(screen.getByText('All Time')).toBeInTheDocument()
  })

  it('shows summary cards after data loads', async () => {
    renderAnalytics()
    await waitFor(() => {
      expect(screen.getByText('Total Tokens')).toBeInTheDocument()
      expect(screen.getByText('150.0k')).toBeInTheDocument()
    })
  })

  it('calls cost IPC channels on mount', () => {
    renderAnalytics()
    expect(mockInvoke).toHaveBeenCalledWith('cost:summary')
    expect(mockInvoke).toHaveBeenCalledWith('cost:daily-spend', expect.any(Object))
    expect(mockInvoke).toHaveBeenCalledWith('cost:by-session', expect.any(Object))
    expect(mockInvoke).toHaveBeenCalledWith('cost:by-model', expect.any(Object))
    expect(mockInvoke).toHaveBeenCalledWith('cost:by-agent', expect.any(Object))
  })

  it('shows avg tokens per prompt', async () => {
    renderAnalytics()
    await waitFor(() => {
      expect(screen.getByText('Avg Tokens/Prompt')).toBeInTheDocument()
      expect(screen.getByText('100 prompts')).toBeInTheDocument()
    })
  })
})
