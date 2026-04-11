// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

// Mock contexts with full brand colors
vi.mock('../contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({
    flags: {
      showDashboard: true,
      showWork: true,
      showInsights: true,
      showLearn: false,
      showConfigure: true,
      enableExperimentalFeatures: false,
      showPrScores: false,
    },
  }),
}))
vi.mock('../contexts/BrandingContext', () => ({
  useBranding: () => ({
    brand: {
      appName: 'ClearPathAI',
      logoPath: '',
      colorPrimary: '#5B4FC4',
      colorSecondary: '#7F77DD',
      colorAccent: '#1D9E75',
      colorAccentLight: '#5DCAA5',
      colorNavActive: '#4F46E5',
      colorSidebarBg: '#1a1a2e',
      colorSidebarText: '#9ca3af',
      useCustomLogo: false,
      customLogoDataUrl: '',
    },
  }),
}))

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
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard' })
    if (channel === 'cli:check-installed') return Promise.resolve({ copilot: true, claude: false })
    if (channel === 'workspace:list') return Promise.resolve([])
    if (channel === 'workspace:get-active') return Promise.resolve(null)
    if (channel === 'learn:get-progress') return Promise.resolve({ percentage: 0, dismissed: false })
    return Promise.resolve(null)
  })
})

import Sidebar from './Sidebar'

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  it('renders without crashing', () => {
    renderSidebar()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('renders navigation items', () => {
    renderSidebar()
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Insights')).toBeInTheDocument()
    expect(screen.getByText('Configure')).toBeInTheDocument()
  })

  it('renders notification bell', () => {
    renderSidebar()
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument()
  })

  it('hides PR Scores when feature flags are off', () => {
    renderSidebar()
    expect(screen.queryByText('PR Scores')).not.toBeInTheDocument()
  })

  it('shows policy name after data loads', async () => {
    renderSidebar()
    await waitFor(() => {
      expect(screen.getByText('Standard')).toBeInTheDocument()
    })
  })

  it('shows Copilot status as connected when cli:check-installed returns copilot:true', async () => {
    renderSidebar()
    await waitFor(() => {
      expect(screen.getByLabelText('Copilot: connected')).toBeInTheDocument()
    })
  })

  it('shows Claude status as not connected when cli:check-installed returns claude:false', async () => {
    renderSidebar()
    await waitFor(() => {
      expect(screen.getByLabelText('Claude: not connected')).toBeInTheDocument()
    })
  })

  it('toggles collapsed state when collapse button is clicked', async () => {
    renderSidebar()
    const collapseBtn = screen.getByLabelText('Collapse sidebar')
    fireEvent.click(collapseBtn)
    await waitFor(() => {
      expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument()
    })
    // Click again to expand
    fireEvent.click(screen.getByLabelText('Expand sidebar'))
    await waitFor(() => {
      expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument()
    })
  })

  it('shows workspace selector when workspaces exist', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard' })
      if (channel === 'cli:check-installed') return Promise.resolve({ copilot: true, claude: false })
      if (channel === 'workspace:list') return Promise.resolve([
        { id: 'ws1', name: 'My Workspace' },
        { id: 'ws2', name: 'Other Workspace' },
      ])
      if (channel === 'workspace:get-active') return Promise.resolve('ws1')
      if (channel === 'learn:get-progress') return Promise.resolve({ percentage: 0, dismissed: false })
      return Promise.resolve(null)
    })
    renderSidebar()
    await waitFor(() => {
      expect(screen.getByDisplayValue('My Workspace')).toBeInTheDocument()
    })
  })

  it('calls workspace:set-active when workspace selector changes', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard' })
      if (channel === 'cli:check-installed') return Promise.resolve({ copilot: true, claude: false })
      if (channel === 'workspace:list') return Promise.resolve([
        { id: 'ws1', name: 'Workspace One' },
        { id: 'ws2', name: 'Workspace Two' },
      ])
      if (channel === 'workspace:get-active') return Promise.resolve('ws1')
      if (channel === 'learn:get-progress') return Promise.resolve({ percentage: 0, dismissed: false })
      if (channel === 'workspace:set-active') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    renderSidebar()
    await waitFor(() => screen.getByDisplayValue('Workspace One'))
    fireEvent.change(screen.getByDisplayValue('Workspace One'), { target: { value: 'ws2' } })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('workspace:set-active', { id: 'ws2' })
    })
  })

  it('calls workspace:set-active with null when "No workspace" selected', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard' })
      if (channel === 'cli:check-installed') return Promise.resolve({ copilot: true, claude: false })
      if (channel === 'workspace:list') return Promise.resolve([
        { id: 'ws1', name: 'My WS' },
      ])
      if (channel === 'workspace:get-active') return Promise.resolve('ws1')
      if (channel === 'learn:get-progress') return Promise.resolve({ percentage: 0, dismissed: false })
      if (channel === 'workspace:set-active') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    renderSidebar()
    await waitFor(() => screen.getByDisplayValue('My WS'))
    fireEvent.change(screen.getByDisplayValue('My WS'), { target: { value: '' } })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('workspace:set-active', { id: null })
    })
  })

  it('refreshes status when sidebar:refresh event fires', async () => {
    renderSidebar()
    await waitFor(() => screen.getByText('Standard'))
    // Fire the custom sidebar:refresh event
    const callsBefore = mockInvoke.mock.calls.filter(([ch]) => ch === 'policy:get-active').length
    window.dispatchEvent(new Event('sidebar:refresh'))
    await waitFor(() => {
      const callsAfter = mockInvoke.mock.calls.filter(([ch]) => ch === 'policy:get-active').length
      expect(callsAfter).toBeGreaterThan(callsBefore)
    })
  })
})
