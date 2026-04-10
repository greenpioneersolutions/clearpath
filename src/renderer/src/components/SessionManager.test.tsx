// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import SessionManager from './SessionManager'

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
  mockInvoke.mockResolvedValue([])
})

describe('SessionManager', () => {
  const baseProps = {
    onClose: vi.fn(),
    onSelectSession: vi.fn(),
    currentSessionId: null,
  }

  it('renders modal title', async () => {
    render(<SessionManager {...baseProps} />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('renders tabs', async () => {
    render(<SessionManager {...baseProps} />)
    // Tabs have counts appended, e.g. "Active (0)", "Archived (0)", "Search"
    expect(screen.getByText(/Active/)).toBeInTheDocument()
    expect(screen.getByText(/Archived/)).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
  })

  it('loads sessions on mount', async () => {
    render(<SessionManager {...baseProps} />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:get-persisted-sessions')
    })
  })

  it('shows empty state when no sessions', async () => {
    mockInvoke.mockResolvedValue([])
    render(<SessionManager {...baseProps} />)
    await waitFor(() => {
      expect(screen.getByText(/No sessions/)).toBeInTheDocument()
    })
  })

  it('renders sessions when available', async () => {
    mockInvoke.mockResolvedValue([
      {
        sessionId: 's1',
        cli: 'copilot',
        name: 'My Session',
        startedAt: Date.now(),
        messageLog: [{}, {}],
      },
    ])
    render(<SessionManager {...baseProps} />)
    await waitFor(() => {
      expect(screen.getByText('My Session')).toBeInTheDocument()
    })
  })

  it('has proper dialog role', () => {
    render(<SessionManager {...baseProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
