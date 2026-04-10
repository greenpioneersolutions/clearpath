// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

vi.mock('recharts', () => {
  const React = require('react')
  return {
    ResponsiveContainer: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    BarChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    LineChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    PieChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    Bar: () => null, Line: () => null, Pie: () => null, Cell: () => null,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
    Tooltip: () => null, Legend: () => null, Area: () => null,
    AreaChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
  }
})

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'cost:summary': { totalTokens: 50000, todayTokens: 1000, totalCost: 1.5, todaySpend: 0.05, totalPrompts: 20 },
    'cost:daily-spend': [],
    'cost:by-session': [],
    'cost:by-model': [],
    'cost:by-agent': [],
  })
  mockInvoke = api.mockInvoke
})

import UsageAnalytics from './UsageAnalytics'

describe('UsageAnalytics', () => {
  it('shows loading state initially', () => {
    render(<UsageAnalytics />)
    expect(screen.getByText('Loading analytics...')).toBeInTheDocument()
  })

  it('calls cost IPC channels on mount', () => {
    render(<UsageAnalytics />)
    expect(mockInvoke).toHaveBeenCalledWith('cost:summary')
    expect(mockInvoke).toHaveBeenCalledWith('cost:daily-spend', expect.any(Object))
    expect(mockInvoke).toHaveBeenCalledWith('cost:by-session', expect.any(Object))
    expect(mockInvoke).toHaveBeenCalledWith('cost:by-model', expect.any(Object))
    expect(mockInvoke).toHaveBeenCalledWith('cost:by-agent', expect.any(Object))
  })

  it('renders summary data after loading', async () => {
    render(<UsageAnalytics />)
    await waitFor(() => {
      expect(screen.queryByText('Loading analytics...')).not.toBeInTheDocument()
    })
  })

  it('renders hours saved calculator', async () => {
    render(<UsageAnalytics />)
    await waitFor(() => {
      // "Hours Saved" may appear multiple times (label + section heading)
      const items = screen.getAllByText(/Hours Saved/i)
      expect(items.length).toBeGreaterThanOrEqual(1)
    })
  })
})
