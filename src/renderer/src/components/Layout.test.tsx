// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

// Mock Sidebar entirely — must also mock its transitive deps that setup-coverage may preload
vi.mock('./Sidebar', () => ({
  default: () => <nav data-testid="sidebar">Sidebar</nav>,
}))
vi.mock('./notifications/NotificationBell', () => ({
  default: () => <div data-testid="notification-bell">Bell</div>,
}))
vi.mock('./KeyboardShortcutModal', () => ({
  default: () => null,
}))
vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}))
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

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  // Provide IPC responses for any Sidebar code that might leak through despite mocking
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard' })
    if (channel === 'cli:check-installed') return Promise.resolve({ copilot: true, claude: false })
    if (channel === 'workspace:list') return Promise.resolve([])
    if (channel === 'workspace:get-active') return Promise.resolve(null)
    if (channel === 'learn:get-progress') return Promise.resolve({ percentage: 0, dismissed: false })
    return Promise.resolve(null)
  })
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
})

import Layout from './Layout'

describe('Layout', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    )
    // Real Sidebar renders (vi.mock may not intercept due to setup-coverage preloading)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('has skip-to-content link', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    )
    expect(screen.getByText('Skip to main content')).toBeInTheDocument()
  })

  it('has main content area with proper role', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    )
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders route announcer for accessibility', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('subscribes to updater events', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    )
    expect(mockOn).toHaveBeenCalledWith('updater:status', expect.any(Function))
  })
})
