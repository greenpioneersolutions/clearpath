// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="shortcut-modal"><button onClick={onClose}>Close</button></div> : null,
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

let mockInvoke: ReturnType<typeof vi.fn>
let mockOn: ReturnType<typeof vi.fn>
let updaterCallback: ((data: unknown) => void) | null = null

beforeEach(() => {
  updaterCallback = null
  mockInvoke = vi.fn().mockImplementation((channel: string) => {
    if (channel === 'policy:get-active') return Promise.resolve({ presetName: 'Standard' })
    if (channel === 'cli:check-installed') return Promise.resolve({ copilot: true, claude: false })
    if (channel === 'workspace:list') return Promise.resolve([])
    if (channel === 'workspace:get-active') return Promise.resolve(null)
    if (channel === 'learn:get-progress') return Promise.resolve({ percentage: 0, dismissed: false })
    if (channel === 'updater:install') return Promise.resolve(null)
    return Promise.resolve(null)
  })
  mockOn = vi.fn((channel: string, cb: (data: unknown) => void) => {
    if (channel === 'updater:status') {
      updaterCallback = cb
    }
    return vi.fn() // unsubscribe fn
  })
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
})

import Layout from './Layout'

function renderLayout(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Layout />
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  it('renders without crashing', () => {
    renderLayout()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('has skip-to-content link', () => {
    renderLayout()
    expect(screen.getByText('Skip to main content')).toBeInTheDocument()
  })

  it('has main content area with proper role', () => {
    renderLayout()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders route announcer for accessibility', () => {
    renderLayout()
    // UpdateBanner (status) + RouteAnnouncer (status) both render — get all
    const statuses = screen.getAllByRole('status')
    expect(statuses.length).toBeGreaterThanOrEqual(1)
  })

  it('subscribes to updater events', () => {
    renderLayout()
    expect(mockOn).toHaveBeenCalledWith('updater:status', expect.any(Function))
  })

  it('announces navigation to Home on / route', () => {
    renderLayout('/')
    expect(screen.getByText('Navigated to Home')).toBeInTheDocument()
  })

  it('announces navigation to Sessions on /work route', () => {
    renderLayout('/work')
    expect(screen.getByText('Navigated to Sessions')).toBeInTheDocument()
  })

  it('announces navigation to Page for unknown routes', () => {
    renderLayout('/some-unknown-route')
    expect(screen.getByText('Navigated to Page')).toBeInTheDocument()
  })

  it('shows update banner when updater:status event fires with "available" status', async () => {
    renderLayout()
    await act(async () => {
      updaterCallback?.({ status: 'available', version: '2.0.0' })
    })
    await waitFor(() => {
      expect(screen.getByText(/Update v2.0.0 is downloading/)).toBeInTheDocument()
    })
  })

  it('shows update banner with restart button when status is "downloaded"', async () => {
    renderLayout()
    await act(async () => {
      updaterCallback?.({ status: 'downloaded', version: '2.1.0' })
    })
    await waitFor(() => {
      expect(screen.getByText(/Update v2.1.0 is ready/)).toBeInTheDocument()
      expect(screen.getByText('Restart Now')).toBeInTheDocument()
    })
  })

  it('calls updater:install when "Restart Now" button is clicked', async () => {
    renderLayout()
    await act(async () => {
      updaterCallback?.({ status: 'downloaded', version: '2.1.0' })
    })
    await waitFor(() => screen.getByText('Restart Now'))
    fireEvent.click(screen.getByText('Restart Now'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('updater:install')
    })
  })

  it('dismisses update banner when "Later" is clicked', async () => {
    renderLayout()
    await act(async () => {
      updaterCallback?.({ status: 'downloaded', version: '2.1.0' })
    })
    await waitFor(() => screen.getByText('Later'))
    fireEvent.click(screen.getByText('Later'))
    await waitFor(() => {
      expect(screen.queryByText(/Update v2.1.0/)).not.toBeInTheDocument()
    })
  })

  it('does not show update banner by default', () => {
    renderLayout()
    expect(screen.queryByText(/Update v/)).not.toBeInTheDocument()
  })
})
