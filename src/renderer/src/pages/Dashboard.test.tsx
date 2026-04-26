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

import Dashboard from './Dashboard'

describe('Dashboard', () => {
  const mockAuthState = {
    copilot: { installed: true, authenticated: true, checkedAt: Date.now() },
    claude: { installed: false, authenticated: false, checkedAt: Date.now() },
  }

  beforeEach(() => {
    mockInvoke.mockResolvedValue(mockAuthState)
  })

  it('renders page heading', () => {
    render(<Dashboard />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('shows refresh button', () => {
    render(<Dashboard />)
    expect(screen.getByText('Refresh all')).toBeInTheDocument()
  })

  it('calls auth:get-status on mount', () => {
    render(<Dashboard />)
    expect(mockInvoke).toHaveBeenCalledWith('auth:get-status')
  })

  it('subscribes to auth:status-changed events', () => {
    render(<Dashboard />)
    expect(mockOn).toHaveBeenCalledWith('auth:status-changed', expect.any(Function))
  })

  it('shows CLI labels after loading', async () => {
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('GitHub Copilot CLI')).toBeInTheDocument()
      expect(screen.getByText('Claude Code CLI')).toBeInTheDocument()
    })
  })

  it('shows authenticated status for copilot', async () => {
    render(<Dashboard />)
    await waitFor(() => {
      const items = screen.getAllByText('Authenticated')
      expect(items.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('calls auth:refresh when refresh clicked', async () => {
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('GitHub Copilot CLI')).toBeInTheDocument()
    })
    mockInvoke.mockClear()
    mockInvoke.mockResolvedValue(mockAuthState)
    fireEvent.click(screen.getByText('Refresh all'))
    expect(mockInvoke).toHaveBeenCalledWith('auth:refresh')
  })

  it('shows Install Now button for not-installed claude', async () => {
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Install Now')).toBeInTheDocument()
    })
  })
})
