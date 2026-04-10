// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ContextUsage from './ContextUsage'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

describe('ContextUsage', () => {
  const runningSessions = [
    { sessionId: 'sess-1', name: 'Session 1', cli: 'copilot' as const, status: 'running' as const },
    { sessionId: 'sess-2', name: 'Session 2', cli: 'claude' as const, status: 'running' as const },
  ]

  beforeEach(() => {
    mockInvoke.mockResolvedValue([])
  })

  it('shows empty message when no active sessions', async () => {
    mockInvoke.mockResolvedValue([])
    render(<ContextUsage activeSessions={[]} />)
    await waitFor(() => {
      expect(screen.getByText(/No active sessions/)).toBeInTheDocument()
    })
  })

  it('renders session selector when sessions exist', async () => {
    mockInvoke.mockResolvedValue(runningSessions)
    render(<ContextUsage activeSessions={runningSessions} />)
    await waitFor(() => {
      expect(screen.getByText('Fetch Usage')).toBeInTheDocument()
    })
  })

  it('shows "Select a session" prompt before fetching', async () => {
    mockInvoke.mockResolvedValue(runningSessions)
    render(<ContextUsage activeSessions={runningSessions} />)
    expect(screen.getByText('Select a session and click Fetch Usage')).toBeInTheDocument()
  })

  it('calls cli:send-slash-command with /context for copilot', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:list-sessions') return Promise.resolve(runningSessions)
      return Promise.resolve(undefined)
    })

    render(<ContextUsage activeSessions={runningSessions} />)
    await waitFor(() => {
      expect(screen.getByText('Fetch Usage')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Fetch Usage'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:send-slash-command', {
        sessionId: 'sess-1',
        command: '/context',
      })
    })
  })

  it('uses /cost command for claude sessions', async () => {
    const claudeSessions = [
      { sessionId: 'c-1', name: 'Claude', cli: 'claude' as const, status: 'running' as const },
    ]
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:list-sessions') return Promise.resolve(claudeSessions)
      return Promise.resolve(undefined)
    })

    render(<ContextUsage activeSessions={claudeSessions} />)
    await waitFor(() => {
      expect(screen.getByText('Fetch Usage')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Fetch Usage'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:send-slash-command', {
        sessionId: 'c-1',
        command: '/cost',
      })
    })
  })

  it('shows "Waiting for response" while fetching', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cli:list-sessions') return Promise.resolve(runningSessions)
      return Promise.resolve(undefined)
    })

    render(<ContextUsage activeSessions={runningSessions} />)
    await waitFor(() => {
      expect(screen.getByText('Fetch Usage')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Fetch Usage'))

    // After clicking, the button shows Fetching and the bar shows Waiting for response
    expect(screen.getByText('Fetching…')).toBeInTheDocument()
  })

  it('changes selected session on dropdown change', async () => {
    mockInvoke.mockResolvedValue(runningSessions)
    render(<ContextUsage activeSessions={runningSessions} />)

    await waitFor(() => {
      const select = screen.getByRole('combobox')
      expect(select).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'sess-2' } })

    expect(select).toHaveValue('sess-2')
  })
})
