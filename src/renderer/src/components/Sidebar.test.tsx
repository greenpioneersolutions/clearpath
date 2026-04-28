// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

// Mock contexts with full brand colors. flagsRef is hoisted so the vi.mock
// factory (also hoisted) can close over the same object the tests mutate.
const { flagsRef } = vi.hoisted(() => ({
  flagsRef: {
    current: {
      showDashboard: true,
      showWork: true,
      showInsights: true,
      showLearn: false,
      showConfigure: true,
      showNotes: true,
      enableExperimentalFeatures: false,
      showPrScores: false,
    } as Record<string, boolean>,
  },
}))
vi.mock('../contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({ flags: flagsRef.current }),
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
  flagsRef.current = {
    showDashboard: true,
    showWork: true,
    showInsights: true,
    showLearn: false,
    showConfigure: true,
    showNotes: true,
    enableExperimentalFeatures: false,
    showPrScores: false,
  }
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
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Insights')).toBeInTheDocument()
    // The Configure nav entry now renders with the label "Settings".
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders the Notes nav entry when showNotes is on (default)', () => {
    // showNotes defaults to true in features.json. Sidebar reads from
    // BUILD_FLAGS via the real FeatureFlagContext at module load — vi.mock
    // can't intercept reliably here because setup-coverage.ts pre-loads the
    // context module. Asserting the on-by-default render is sufficient
    // coverage for the new entry; the flag-gating itself is exercised by
    // FeatureFlagSettings tests and by Notes.tsx's own enable-card test.
    renderSidebar()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    // Sidebar order: Home · Sessions · Notes · Learn(?)/Insights …
    const navItems = screen.getAllByRole('link').map((el) => el.textContent ?? '')
    const sessionsIdx = navItems.findIndex((t) => t.includes('Sessions'))
    const notesIdx = navItems.findIndex((t) => t.includes('Notes'))
    const insightsIdx = navItems.findIndex((t) => t.includes('Insights'))
    expect(sessionsIdx).toBeGreaterThanOrEqual(0)
    expect(notesIdx).toBeGreaterThan(sessionsIdx)
    expect(insightsIdx).toBeGreaterThan(notesIdx)
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

  it('clicking the Work nav link from /work?id=abc clears the id and lands on /work', async () => {
    function PathnameProbe() {
      const loc = useLocation()
      return <div data-testid="path-probe">{loc.pathname}{loc.search}</div>
    }

    render(
      <MemoryRouter initialEntries={['/work?id=abc']}>
        <Sidebar />
        <Routes>
          <Route path="*" element={<PathnameProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText('Standard'))
    expect(screen.getByTestId('path-probe').textContent).toBe('/work?id=abc')

    const workLink = screen.getByTestId('sidebar-work-link')
    fireEvent.click(workLink)

    await waitFor(() => {
      expect(screen.getByTestId('path-probe').textContent).toBe('/work')
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
