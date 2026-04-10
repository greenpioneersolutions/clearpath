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

beforeEach(() => {
  setupElectronAPI({
    'integration:get-status': { github: { connected: true, username: 'testuser' } },
    'integration:github-repos': { success: true, repos: [] },
    'pr-scores:get-config': { enabled: true, model: 'sonnet', criteria: [] },
    'pr-scores:get-scores': [],
    'feature-flags:get': {},
  })
})

import PrScores from './PrScores'

describe('PrScores', () => {
  // Note: vi.mock for FeatureFlagContext does NOT work with setup-coverage.ts
  // so the real useFeatureFlags returns defaults (showPrScores: false),
  // rendering the disabled view.

  it('renders without crashing', () => {
    render(<PrScores />)
    expect(document.querySelector('[class]')).toBeTruthy()
  })

  it('shows disabled message when feature flags are off (default)', () => {
    render(<PrScores />)
    expect(screen.getByText('PR Scores is Disabled')).toBeInTheDocument()
  })

  it('shows enable instructions', () => {
    render(<PrScores />)
    expect(screen.getByText(/Enable experimental features/)).toBeInTheDocument()
  })
})
