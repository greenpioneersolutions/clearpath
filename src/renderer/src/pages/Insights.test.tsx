// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
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

beforeEach(() => {
  setupElectronAPI({
    'cost:summary': { totalTokens: 0, todayTokens: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, todaySpend: 0, totalPrompts: 0, displayMode: 'tokens' },
    'cost:daily-spend': [],
    'cost:by-session': [],
    'cost:by-model': [],
    'cost:by-agent': [],
    'cost:get-budget': { daily: null, weekly: null, monthly: null, dailyTokens: null, weeklyTokens: null, monthlyTokens: null, autoPause: false },
    'cost:check-budget': { alerts: [], autoPause: false },
    'compliance:get-log': [],
    'compliance:security-events': [],
    'compliance:get-file-patterns': [],
  })
})

import Insights from './Insights'

function renderInsights() {
  return render(
    <MemoryRouter>
      <Insights />
    </MemoryRouter>
  )
}

describe('Insights', () => {
  it('renders tab bar with Analytics, Compliance, Usage', () => {
    renderInsights()
    // "Analytics" appears as both a tab and a heading inside the Analytics page
    const analyticsItems = screen.getAllByText('Analytics')
    expect(analyticsItems.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Compliance')).toBeInTheDocument()
    expect(screen.getByText('Usage')).toBeInTheDocument()
  })

  it('shows Analytics tab by default', () => {
    renderInsights()
    const analyticsItems = screen.getAllByText('Analytics')
    // The tab button should have the active border class
    const tab = analyticsItems.find((el) => el.tagName === 'BUTTON')
    expect(tab?.className).toContain('border-indigo-600')
  })

  it('switches to Compliance tab', () => {
    renderInsights()
    fireEvent.click(screen.getByText('Compliance'))
    const complianceBtn = screen.getByText('Compliance')
    expect(complianceBtn.className).toContain('border-indigo-600')
  })

  it('switches to Usage tab', () => {
    renderInsights()
    fireEvent.click(screen.getByText('Usage'))
    const usageBtn = screen.getByText('Usage')
    expect(usageBtn.className).toContain('border-indigo-600')
  })
})
