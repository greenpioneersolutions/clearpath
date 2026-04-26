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

import Activity from './Activity'

function renderActivity() {
  return render(
    <MemoryRouter>
      <Activity />
    </MemoryRouter>
  )
}

describe('Activity', () => {
  const mockSummary = {
    totalTokens: 150000,
    todayTokens: 5000,
    weekTokens: 25000,
    totalInputTokens: 80000,
    totalOutputTokens: 70000,
    totalPrompts: 100,
    sessionCount: 12,
  }

  const now = Date.now()
  const mockSessions = [
    { sessionId: 's1', sessionName: 'Refactor auth', cli: 'copilot-cli', totalCost: 0, totalTokens: 15000, promptCount: 6, costPerPrompt: 0, startedAt: now - 1000 },
    { sessionId: 's2', sessionName: 'Docs pass', cli: 'claude-cli', totalCost: 0, totalTokens: 8000, promptCount: 4, costPerPrompt: 0, startedAt: now - 2000 },
  ]

  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cost:summary') return Promise.resolve(mockSummary)
      if (channel === 'cost:daily-spend') return Promise.resolve([{ date: '2026-04-20', cost: 0, tokens: 2500 }])
      if (channel === 'cost:by-session') return Promise.resolve(mockSessions)
      if (channel === 'cost:by-model') return Promise.resolve([{ model: 'claude-sonnet-4.5', cost: 0, tokens: 25000 }])
      if (channel === 'cost:by-agent') return Promise.resolve([{ agent: 'planner', inputTokens: 5000, outputTokens: 2000 }])
      return Promise.resolve(null)
    })
  })

  it('renders page heading', async () => {
    renderActivity()
    await waitFor(() => {
      expect(screen.getByText('Activity')).toBeInTheDocument()
    })
  })

  it('renders summary cards', async () => {
    renderActivity()
    await waitFor(() => {
      expect(screen.getByText('Sessions This Week')).toBeInTheDocument()
      expect(screen.getByText('Prompts This Week')).toBeInTheDocument()
      expect(screen.getByText('Most-Used Model')).toBeInTheDocument()
      expect(screen.getByText('Most-Used Agent')).toBeInTheDocument()
    })
  })

  it('renders date range selector with all options', async () => {
    renderActivity()
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('This Week')).toBeInTheDocument()
      expect(screen.getByText('This Month')).toBeInTheDocument()
      expect(screen.getByText('All Time')).toBeInTheDocument()
    })
  })

  it('calls cost IPC channels on mount', async () => {
    renderActivity()
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cost:summary')
      expect(mockInvoke).toHaveBeenCalledWith('cost:daily-spend', expect.any(Object))
      expect(mockInvoke).toHaveBeenCalledWith('cost:by-session', expect.any(Object))
      expect(mockInvoke).toHaveBeenCalledWith('cost:by-model', expect.any(Object))
      expect(mockInvoke).toHaveBeenCalledWith('cost:by-agent', expect.any(Object))
    })
  })

  it('switches date range and refetches session data', async () => {
    renderActivity()
    // Wait for initial fetch to complete so `before` is stable
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cost:by-session', expect.any(Object))
    })

    const byRangeCalls = () => mockInvoke.mock.calls.filter(([ch]) => ch === 'cost:by-session').length
    const before = byRangeCalls()
    // Click "All Time" — its since=0 is guaranteed different from the default 'week'
    // range regardless of day-of-week (on Sundays, 'today' collapses to the same
    // value as 'week' and would not trigger a refetch).
    fireEvent.click(screen.getByText('All Time'))
    await waitFor(() => {
      expect(byRangeCalls()).toBeGreaterThan(before)
    })
  })

  it('shows sessions table with CLI badge and tokens column', async () => {
    renderActivity()
    await waitFor(() => {
      expect(screen.getByText('Refactor auth')).toBeInTheDocument()
      expect(screen.getByText('Total Tokens')).toBeInTheDocument()
      expect(screen.getByText('Tokens / Prompt')).toBeInTheDocument()
    })
  })

  it('does not render dollar-amount summary values', async () => {
    renderActivity()
    await waitFor(() => expect(screen.getByText('Activity')).toBeInTheDocument())
    // None of the visible text should contain a dollar-amount pattern
    expect(document.body.textContent ?? '').not.toMatch(/\$\d/)
  })
})
