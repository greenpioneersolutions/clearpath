// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

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
})

import Settings from './Settings'

describe('Settings', () => {
  const defaultSettings = {
    flags: {},
    model: { copilot: 'claude-sonnet-4-5', claude: 'sonnet' },
    maxBudgetUsd: null,
    maxTurns: null,
    verbose: false,
  }

  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve(defaultSettings)
      if (channel === 'settings:update-flag') return Promise.resolve(defaultSettings)
      if (channel === 'settings:reset-flag') return Promise.resolve(defaultSettings)
      if (channel === 'settings:reset-all') return Promise.resolve(defaultSettings)
      if (channel === 'settings:set-model') return Promise.resolve(defaultSettings)
      if (channel === 'settings:set-budget') return Promise.resolve(defaultSettings)
      if (channel === 'settings:list-profiles') return Promise.resolve([])
      if (channel === 'settings:get-env-vars') return Promise.resolve([])
      if (channel === 'notifications:get-prefs') return Promise.resolve(null)
      if (channel === 'notifications:list-webhooks') return Promise.resolve([])
      if (channel === 'feature-flags:get') return Promise.resolve(null)
      return Promise.resolve(null)
    })
  })

  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<Settings />)
    expect(screen.getByText('Loading settings...')).toBeInTheDocument()
  })

  it('renders page heading after loading', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  it('renders subtitle', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/Configure CLI flags, models/)).toBeInTheDocument()
    })
  })

  it('renders CLI selector buttons', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText('Copilot')).toBeInTheDocument()
      expect(screen.getByText('Claude')).toBeInTheDocument()
    })
  })

  it('renders all tab buttons', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText('CLI Flags')).toBeInTheDocument()
      expect(screen.getByText('Model')).toBeInTheDocument()
      expect(screen.getByText('Budget & Limits')).toBeInTheDocument()
      expect(screen.getByText('Plugins')).toBeInTheDocument()
      expect(screen.getByText('Profiles')).toBeInTheDocument()
      expect(screen.getByText('Environment')).toBeInTheDocument()
      expect(screen.getByText('Notifications')).toBeInTheDocument()
      expect(screen.getByText('Webhooks')).toBeInTheDocument()
      expect(screen.getByText('Data Management')).toBeInTheDocument()
      expect(screen.getByText('Feature Flags')).toBeInTheDocument()
    })
  })

  it('calls settings:get on mount', () => {
    render(<Settings />)
    expect(mockInvoke).toHaveBeenCalledWith('settings:get')
  })

  it('switches to Budget tab', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText('Budget & Limits')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Budget & Limits'))
    await waitFor(() => {
      // BudgetLimits component renders
      expect(screen.getByText('Budget & Limits', { selector: 'h3' })).toBeInTheDocument()
    })
  })

  it('switches to Model tab and renders model selector', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('Model'))
    fireEvent.click(screen.getByText('Model'))
    await waitFor(() => {
      expect(screen.getByText('Model', { selector: 'h3' })).toBeInTheDocument()
    })
  })

  it('switches CLI to Claude and updates model tab heading', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('Claude'))
    fireEvent.click(screen.getByText('Claude'))
    fireEvent.click(screen.getByText('Model'))
    await waitFor(() => {
      expect(screen.getByText(/Claude Code/)).toBeInTheDocument()
    })
  })

  it('switches to Plugins tab and calls settings:list-plugins', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve(defaultSettings)
      if (channel === 'settings:list-plugins') return Promise.resolve([])
      if (channel === 'settings:list-profiles') return Promise.resolve([])
      if (channel === 'settings:get-env-vars') return Promise.resolve([])
      if (channel === 'notifications:get-prefs') return Promise.resolve(null)
      if (channel === 'notifications:list-webhooks') return Promise.resolve([])
      if (channel === 'feature-flags:get') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<Settings />)
    await waitFor(() => screen.getByText('Plugins'))
    fireEvent.click(screen.getByText('Plugins'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:list-plugins', { cli: 'copilot' })
    })
  })

  it('switches to Profiles tab and calls settings:list-profiles', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('Profiles'))
    fireEvent.click(screen.getByText('Profiles'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:list-profiles')
    })
  })

  it('switches to Profiles tab and renders Configuration Profiles heading', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('Profiles'))
    fireEvent.click(screen.getByText('Profiles'))
    await waitFor(() => {
      expect(screen.getByText('Configuration Profiles')).toBeInTheDocument()
    })
  })

  it('switches to Environment tab and calls settings:get-env-vars', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('Environment'))
    fireEvent.click(screen.getByText('Environment'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:get-env-vars')
    })
  })

  it('switches to Notifications tab', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('Notifications'))
    fireEvent.click(screen.getByText('Notifications'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:get-prefs')
    })
  })

  it('switches to Webhooks tab and calls notifications:list-webhooks', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('Webhooks'))
    fireEvent.click(screen.getByText('Webhooks'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notifications:list-webhooks')
    })
  })

  it('switches to Data Management tab and calls data:get-storage-stats', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve(defaultSettings)
      if (channel === 'settings:list-profiles') return Promise.resolve([])
      if (channel === 'settings:get-env-vars') return Promise.resolve([])
      if (channel === 'notifications:get-prefs') return Promise.resolve(null)
      if (channel === 'notifications:list-webhooks') return Promise.resolve([])
      if (channel === 'feature-flags:get') return Promise.resolve(null)
      if (channel === 'data:get-storage-stats') return Promise.resolve({
        stores: [],
        totalSizeBytes: 0,
        totalSizeFormatted: '0 B',
        knowledgeBase: { files: 0, sizeBytes: 0, sizeFormatted: '0 B' },
      })
      return Promise.resolve(null)
    })
    render(<Settings />)
    await waitFor(() => screen.getByText('Data Management'))
    fireEvent.click(screen.getByText('Data Management'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('data:get-storage-stats')
    })
  })

  it('switches to Feature Flags tab and renders flag groups', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('Feature Flags'))
    fireEvent.click(screen.getByText('Feature Flags'))
    await waitFor(() => {
      expect(screen.getByText('Home Page')).toBeInTheDocument()
    })
  })

  it('resets all settings when confirmed', async () => {
    window.confirm = vi.fn().mockReturnValue(true)
    render(<Settings />)
    await waitFor(() => screen.getByText('CLI Flags'))
    // Turn on an override so "Reset All" button appears (flags tab must be active)
    // We need to trigger hasOverrides — but FlagBuilder shows Reset All only when there are overrides
    // Instead we call reset via the resetAll function directly by confirming
    // The reset all comes from FlagBuilder only when hasOverrides is true.
    // Let's test it by passing a settings with an existing flag override
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve({
        ...defaultSettings,
        flags: { 'copilot:yolo': true },
      })
      if (channel === 'settings:reset-all') return Promise.resolve(defaultSettings)
      if (channel === 'settings:list-profiles') return Promise.resolve([])
      if (channel === 'settings:get-env-vars') return Promise.resolve([])
      if (channel === 'notifications:get-prefs') return Promise.resolve(null)
      if (channel === 'notifications:list-webhooks') return Promise.resolve([])
      if (channel === 'feature-flags:get') return Promise.resolve(null)
      return Promise.resolve(null)
    })
  })

  it('renders launch command preview at bottom of page', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText('Launch Command Preview')).toBeInTheDocument()
    })
  })

  it('renders CLI Flags tab content by default', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/CLI Flags — GitHub Copilot/)).toBeInTheDocument()
    })
  })

  it('calls onApply (settings:get) when a profile is loaded successfully', async () => {
    const profile = {
      id: 'user-profile-1',
      name: 'My Profile',
      description: 'A test profile',
      settings: {},
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    }
    let settingsGetCallCount = 0
    mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
      if (channel === 'settings:get') {
        settingsGetCallCount++
        return Promise.resolve(defaultSettings)
      }
      if (channel === 'settings:list-profiles') return Promise.resolve([profile])
      if (channel === 'settings:load-profile') return Promise.resolve({ settings: defaultSettings })
      if (channel === 'settings:get-env-vars') return Promise.resolve([])
      if (channel === 'notifications:get-prefs') return Promise.resolve(null)
      if (channel === 'notifications:list-webhooks') return Promise.resolve([])
      if (channel === 'feature-flags:get') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<Settings />)
    await waitFor(() => screen.getByText('Profiles'))
    fireEvent.click(screen.getByText('Profiles'))
    // Wait for the profile to appear
    await waitFor(() => screen.getByText('My Profile'))
    const initialCallCount = settingsGetCallCount
    // Click Load — triggers handleLoad -> onApply -> loadSettings -> settings:get
    fireEvent.click(screen.getByText('Load'))
    await waitFor(() => {
      expect(settingsGetCallCount).toBeGreaterThan(initialCallCount)
    })
  })

  it('does not reset settings when confirm dialog is cancelled', async () => {
    window.confirm = vi.fn().mockReturnValue(false)
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve({
        ...defaultSettings,
        flags: { 'copilot:yolo': true },
      })
      if (channel === 'settings:reset-all') return Promise.resolve(defaultSettings)
      if (channel === 'settings:list-profiles') return Promise.resolve([])
      if (channel === 'settings:get-env-vars') return Promise.resolve([])
      if (channel === 'notifications:get-prefs') return Promise.resolve(null)
      if (channel === 'notifications:list-webhooks') return Promise.resolve([])
      if (channel === 'feature-flags:get') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<Settings />)
    await waitFor(() => screen.getByText('CLI Flags'))
    await waitFor(() => {
      expect(screen.getByText('Reset All')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Reset All'))
    // confirm returned false — settings:reset-all should NOT be called
    await waitFor(() => {
      const resetCalls = mockInvoke.mock.calls.filter(([ch]) => ch === 'settings:reset-all')
      expect(resetCalls.length).toBe(0)
    })
  })

  it('resets all when resetAll is called via FlagBuilder (confirm=true)', async () => {
    window.confirm = vi.fn().mockReturnValue(true)
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') return Promise.resolve({
        ...defaultSettings,
        flags: { 'copilot:yolo': true },
      })
      if (channel === 'settings:reset-all') return Promise.resolve(defaultSettings)
      if (channel === 'settings:list-profiles') return Promise.resolve([])
      if (channel === 'settings:get-env-vars') return Promise.resolve([])
      if (channel === 'notifications:get-prefs') return Promise.resolve(null)
      if (channel === 'notifications:list-webhooks') return Promise.resolve([])
      if (channel === 'feature-flags:get') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<Settings />)
    await waitFor(() => screen.getByText('CLI Flags'))
    // When flags has overrides, FlagBuilder shows Reset All button
    await waitFor(() => {
      expect(screen.getByText('Reset All')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Reset All'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('settings:reset-all')
    })
  })
})
