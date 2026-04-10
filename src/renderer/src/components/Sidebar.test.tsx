// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

// Mock contexts
vi.mock('../contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({
    flags: {
      showDashboard: true,
      showWork: true,
      showInsights: true,
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
      accentColor: '#4F46E5',
    },
  }),
}))
// Mock NotificationBell
vi.mock('./notifications/NotificationBell', () => ({
  default: () => <div data-testid="notification-bell">Bell</div>,
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
  // Default mocks for sidebar data loading
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

describe('Sidebar', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )
    // The sidebar should have navigation links
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('renders navigation items', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Insights')).toBeInTheDocument()
    expect(screen.getByText('Configure')).toBeInTheDocument()
  })

  it('renders notification bell', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )
    // vi.mock for NotificationBell doesn't work due to setup-coverage.ts eager loading
    // The real component renders a button with aria-label="Notifications"
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument()
  })

  it('hides PR Scores when feature flags are off', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )
    expect(screen.queryByText('PR Scores')).not.toBeInTheDocument()
  })
})
