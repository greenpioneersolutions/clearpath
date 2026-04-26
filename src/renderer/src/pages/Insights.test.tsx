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
    'cost:summary': { totalTokens: 0, todayTokens: 0, totalInputTokens: 0, totalOutputTokens: 0, totalPrompts: 0 },
    'cost:daily-spend': [],
    'cost:by-session': [],
    'cost:by-model': [],
    'cost:by-agent': [],
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
  it('renders tab bar with Activity and Compliance (no Analytics or Usage)', () => {
    renderInsights()
    // "Activity" appears as both a tab and a heading inside the Activity page
    const activityItems = screen.getAllByText('Activity')
    expect(activityItems.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Compliance')).toBeInTheDocument()
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument()
    expect(screen.queryByText('Usage')).not.toBeInTheDocument()
  })

  it('shows Activity tab by default', () => {
    renderInsights()
    const activityItems = screen.getAllByText('Activity')
    const tab = activityItems.find((el) => el.tagName === 'BUTTON')
    expect(tab?.className).toContain('border-indigo-600')
  })

  it('switches to Compliance tab', () => {
    renderInsights()
    fireEvent.click(screen.getByText('Compliance'))
    const complianceBtn = screen.getByText('Compliance')
    expect(complianceBtn.className).toContain('border-indigo-600')
  })
})
