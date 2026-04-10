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
      if (channel === 'settings:get-env-vars') return Promise.resolve({})
      if (channel === 'notifications:get-preferences') return Promise.resolve({})
      if (channel === 'notifications:get-webhooks') return Promise.resolve([])
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
})
