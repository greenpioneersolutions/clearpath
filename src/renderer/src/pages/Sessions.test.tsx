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
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'session-history:list') return Promise.resolve([])
    if (channel === 'cli:start-session') return Promise.resolve({ sessionId: 'test-123' })
    if (channel === 'session-history:add') return Promise.resolve(null)
    if (channel === 'cli:stop-session') return Promise.resolve(null)
    if (channel === 'cli:send-input') return Promise.resolve(null)
    if (channel === 'cli:send-slash-command') return Promise.resolve(null)
    return Promise.resolve(null)
  })
})

import Sessions from './Sessions'

describe('Sessions', () => {
  it('renders + New Session button', () => {
    render(<Sessions />)
    const buttons = screen.getAllByText('+ New Session')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty state when no sessions', async () => {
    render(<Sessions />)
    await waitFor(() => {
      expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    })
  })

  it('shows no session selected message', () => {
    render(<Sessions />)
    expect(screen.getByText('No session selected')).toBeInTheDocument()
  })

  it('shows start instruction text', () => {
    render(<Sessions />)
    expect(screen.getByText(/Start a new session or select one/)).toBeInTheDocument()
  })

  it('subscribes to CLI events', () => {
    render(<Sessions />)
    expect(mockOn).toHaveBeenCalledWith('cli:output', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:error', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:exit', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:permission-request', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:turn-start', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('cli:turn-end', expect.any(Function))
  })

  it('loads session history on mount', () => {
    render(<Sessions />)
    expect(mockInvoke).toHaveBeenCalledWith('session-history:list')
  })

  it('displays history items', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'session-history:list') return Promise.resolve([
        { sessionId: 'h1', cli: 'copilot', name: 'History Session', startedAt: Date.now() - 60000 },
      ])
      return Promise.resolve(null)
    })
    render(<Sessions />)
    await waitFor(() => {
      expect(screen.getByText('History Session')).toBeInTheDocument()
    })
  })

  it('has a second New Session button in empty state', () => {
    render(<Sessions />)
    // There's a + New Session in sidebar and one in empty state
    const buttons = screen.getAllByText('+ New Session')
    expect(buttons.length).toBe(2)
  })
})
