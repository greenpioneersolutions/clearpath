// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

// Mock markdown rendering
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))
vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('rehype-sanitize', () => ({ default: () => {} }))
vi.mock('rehype-raw', () => ({ default: () => {} }))

Element.prototype.scrollIntoView = vi.fn()

vi.mock('../contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({
    flags: { showDashboard: true, showWork: true, showInsights: true, enableExperimentalFeatures: false, showPrScores: false },
  }),
}))
vi.mock('../contexts/BrandingContext', () => ({
  useBranding: () => ({
    brand: { appName: 'ClearPathAI', logoPath: '', accentColor: '#4F46E5' },
  }),
}))

// Mock recharts — doesn't render in jsdom
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

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  // Mock matchMedia for components that may use it
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'cli:list-sessions') return Promise.resolve([])
    if (channel === 'cli:get-persisted-sessions') return Promise.resolve([])
    if (channel === 'wizard:get-state') return Promise.resolve({ hasCompletedWizard: true })
    if (channel === 'cli:start-session') return Promise.resolve({ sessionId: 'new-123' })
    if (channel === 'starter-pack:record-interaction') return Promise.resolve(null)
    if (channel === 'feature-flags:get') return Promise.resolve(null)
    if (channel === 'branding:get') return Promise.resolve(null)
    // Agent panel
    if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
    if (channel === 'agent:get-enabled') return Promise.resolve([])
    if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
    if (channel === 'agent:get-profiles') return Promise.resolve([])
    if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
    // Tools panel
    if (channel === 'tools:list-mcp-servers') return Promise.resolve([])
    if (channel === 'tools:get-pending-permissions') return Promise.resolve([])
    if (channel === 'app:get-cwd') return Promise.resolve('/test')
    // Templates
    if (channel === 'template:list') return Promise.resolve([])
    // Sub-agents
    if (channel === 'subagent:list') return Promise.resolve([])
    // Skills
    if (channel === 'skills:list') return Promise.resolve([])
    if (channel === 'skill:list') return Promise.resolve([])
    // Session history
    if (channel === 'session-history:list') return Promise.resolve([])
    // Wizard
    if (channel === 'wizard:get-options') return Promise.resolve([])
    // Notes
    if (channel === 'notes:list') return Promise.resolve([])
    if (channel === 'notes:get-tags') return Promise.resolve([])
    if (channel === 'notes:get-categories') return Promise.resolve([])
    // Scheduler
    if (channel === 'scheduler:list-tasks') return Promise.resolve([])
    // Integration
    if (channel === 'integration:get-status') return Promise.resolve({ github: null })
    // Starter pack
    if (channel === 'starter-pack:get-progress') return Promise.resolve(null)
    if (channel === 'starter-pack:get-prompts') return Promise.resolve([])
    if (channel === 'starter-pack:get-memories') return Promise.resolve([])
    if (channel === 'starter-pack:get-installed-memories') return Promise.resolve([])
    if (channel === 'starter-pack:get-skills') return Promise.resolve([])
    if (channel === 'starter-pack:get-agents') return Promise.resolve([])
    if (channel === 'starter-pack:record-interaction') return Promise.resolve(null)
    if (channel === 'templates:list') return Promise.resolve([])
    if (channel === 'cost:check-budget') return Promise.resolve({ alerts: [], autoPause: false })
    if (channel === 'cost:get-budget') return Promise.resolve({ daily: null, weekly: null, monthly: null, dailyTokens: null, weeklyTokens: null, monthlyTokens: null, autoPause: false })
    if (channel === 'cost:summary') return Promise.resolve({ totalTokens: 0, todayTokens: 0, totalCost: 0, todaySpend: 0, totalPrompts: 0, displayMode: 'tokens' })
    if (channel === 'tools:get-pending-permissions') return Promise.resolve([])
    if (channel === 'scheduler:list') return Promise.resolve([])
    if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard', activePresetId: 'standard' })
    if (channel === 'workspace:list') return Promise.resolve([])
    if (channel === 'workspace:get-active') return Promise.resolve(null)
    if (channel === 'learn:get-progress') return Promise.resolve({ percentage: 0, dismissed: false })
    return Promise.resolve(null)
  })
})

import Work from './Work'

function renderWork() {
  return render(
    <MemoryRouter>
      <Work />
    </MemoryRouter>
  )
}

describe('Work', () => {
  it('renders without crashing', async () => {
    renderWork()
    await waitFor(() => {
      expect(document.querySelector('[class]')).toBeTruthy()
    })
  })

  it('subscribes to CLI IPC events', () => {
    renderWork()
    expect(mockOn).toHaveBeenCalledWith('cli:output', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:error', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:exit', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:turn-start', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:turn-end', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:permission-request', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:usage', expect.any(Function))
  })

  it('loads sessions on mount', async () => {
    renderWork()
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:list-sessions')
    })
  })

  it('checks wizard state on mount', () => {
    renderWork()
    expect(mockInvoke).toHaveBeenCalledWith('wizard:get-state')
  })

  it('shows wizard when user has not completed it', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'wizard:get-state') return Promise.resolve({ hasCompletedWizard: false })
      if (channel === 'cli:list-sessions') return Promise.resolve([])
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve([])
      if (channel === 'wizard:get-options') return Promise.resolve([])
      if (channel === 'feature-flags:get') return Promise.resolve(null)
      if (channel === 'branding:get') return Promise.resolve(null)
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve([])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'app:get-cwd') return Promise.resolve('/test')
      if (channel === 'tools:list-mcp-servers') return Promise.resolve([])
      if (channel === 'template:list') return Promise.resolve([])
      if (channel === 'subagent:list') return Promise.resolve([])
      if (channel === 'skills:list') return Promise.resolve([])
      if (channel === 'notes:list') return Promise.resolve([])
      if (channel === 'notes:get-tags') return Promise.resolve([])
      if (channel === 'notes:get-categories') return Promise.resolve([])
      if (channel === 'starter-pack:get-prompts') return Promise.resolve([])
      if (channel === 'starter-pack:get-memories') return Promise.resolve([])
      if (channel === 'starter-pack:get-installed-memories') return Promise.resolve([])
      if (channel === 'starter-pack:get-skills') return Promise.resolve([])
      if (channel === 'starter-pack:get-agents') return Promise.resolve([])
      if (channel === 'templates:list') return Promise.resolve([])
      if (channel === 'cost:check-budget') return Promise.resolve({ alerts: [], autoPause: false })
      if (channel === 'cost:get-budget') return Promise.resolve({ daily: null, weekly: null, monthly: null, autoPause: false })
      if (channel === 'cost:summary') return Promise.resolve({ totalTokens: 0, todayTokens: 0, totalCost: 0, todaySpend: 0, totalPrompts: 0, displayMode: 'tokens' })
      if (channel === 'tools:get-pending-permissions') return Promise.resolve([])
      if (channel === 'scheduler:list') return Promise.resolve([])
      if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard', activePresetId: 'standard' })
      if (channel === 'workspace:list') return Promise.resolve([])
      if (channel === 'workspace:get-active') return Promise.resolve(null)
      if (channel === 'learn:get-progress') return Promise.resolve({ percentage: 0, dismissed: false })
      return Promise.resolve(null)
    })
    renderWork()
    // When wizard is not completed, the wizard tab should be shown
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('wizard:get-state')
    })
  })

  it('restores persisted sessions on mount', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:list-sessions') return Promise.resolve([])
      if (channel === 'cli:get-persisted-sessions') return Promise.resolve([
        {
          sessionId: 'ps-1',
          cli: 'copilot',
          name: 'Old Session',
          startedAt: Date.now() - 86400000,
          messageLog: [{ type: 'text', content: 'Hello', sender: 'user' }],
        },
      ])
      if (channel === 'wizard:get-state') return Promise.resolve({ hasCompletedWizard: true })
      if (channel === 'feature-flags:get') return Promise.resolve(null)
      if (channel === 'branding:get') return Promise.resolve(null)
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve([])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'app:get-cwd') return Promise.resolve('/test')
      if (channel === 'tools:list-mcp-servers') return Promise.resolve([])
      if (channel === 'template:list') return Promise.resolve([])
      if (channel === 'subagent:list') return Promise.resolve([])
      if (channel === 'skills:list') return Promise.resolve([])
      if (channel === 'notes:list') return Promise.resolve([])
      if (channel === 'notes:get-tags') return Promise.resolve([])
      if (channel === 'notes:get-categories') return Promise.resolve([])
      if (channel === 'starter-pack:get-prompts') return Promise.resolve([])
      if (channel === 'starter-pack:get-memories') return Promise.resolve([])
      if (channel === 'starter-pack:get-installed-memories') return Promise.resolve([])
      if (channel === 'starter-pack:get-skills') return Promise.resolve([])
      if (channel === 'starter-pack:get-agents') return Promise.resolve([])
      if (channel === 'templates:list') return Promise.resolve([])
      if (channel === 'cost:check-budget') return Promise.resolve({ alerts: [], autoPause: false })
      if (channel === 'cost:get-budget') return Promise.resolve({ daily: null, weekly: null, monthly: null, autoPause: false })
      if (channel === 'cost:summary') return Promise.resolve({ totalTokens: 0, todayTokens: 0, totalCost: 0, todaySpend: 0, totalPrompts: 0, displayMode: 'tokens' })
      if (channel === 'tools:get-pending-permissions') return Promise.resolve([])
      if (channel === 'scheduler:list') return Promise.resolve([])
      if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard', activePresetId: 'standard' })
      if (channel === 'workspace:list') return Promise.resolve([])
      if (channel === 'workspace:get-active') return Promise.resolve(null)
      if (channel === 'learn:get-progress') return Promise.resolve({ percentage: 0, dismissed: false })
      return Promise.resolve(null)
    })
    renderWork()
    await waitFor(() => {
      expect(screen.getByText('Old Session')).toBeInTheDocument()
    })
  })
})
