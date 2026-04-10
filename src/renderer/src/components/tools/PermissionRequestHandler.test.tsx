// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PermissionRequestHandler from './PermissionRequestHandler'

// ── Mock electronAPI ─────────────────────────────────────────────────────────

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
  mockInvoke.mockResolvedValue([]) // default: no active sessions
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PermissionRequestHandler', () => {
  it('renders title and description', () => {
    render(<PermissionRequestHandler />)
    expect(screen.getByText('Permission Requests')).toBeDefined()
    expect(screen.getByText(/Intercept and respond to CLI tool permission prompts/)).toBeDefined()
  })

  it('shows empty state when no pending requests', () => {
    render(<PermissionRequestHandler />)
    expect(screen.getByText('No pending permission requests')).toBeDefined()
  })

  it('loads active sessions on mount', async () => {
    render(<PermissionRequestHandler />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:list-sessions')
    })
  })

  it('subscribes to cli:permission-request events', () => {
    render(<PermissionRequestHandler />)
    expect(mockOn).toHaveBeenCalledWith('cli:permission-request', expect.any(Function))
  })

  it('renders auto-approve toggle', () => {
    render(<PermissionRequestHandler />)
    expect(screen.getByLabelText('Toggle auto-approve')).toBeDefined()
  })

  it('shows warning when auto-approve is enabled', () => {
    render(<PermissionRequestHandler />)
    fireEvent.click(screen.getByLabelText('Toggle auto-approve'))
    expect(screen.getByText(/Auto-approve is enabled/)).toBeDefined()
  })

  it('shows pending request when permission event arrives', async () => {
    const sessions = [
      { sessionId: 'sess-1', name: 'My Session', cli: 'copilot', status: 'running', startedAt: Date.now() },
    ]
    mockInvoke.mockResolvedValue(sessions)

    // Capture the on callback
    let permissionCallback: ((data: unknown) => void) | undefined
    mockOn.mockImplementation((channel: string, cb: (data: unknown) => void) => {
      if (channel === 'cli:permission-request') permissionCallback = cb
      return vi.fn()
    })

    render(<PermissionRequestHandler />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:list-sessions')
    })

    // Simulate permission request arriving
    permissionCallback!({
      sessionId: 'sess-1',
      request: { type: 'permission-request', content: 'Execute: rm -rf /tmp/test' },
    })

    await waitFor(() => {
      expect(screen.getByText('Execute: rm -rf /tmp/test')).toBeDefined()
    })

    // Should show Allow and Deny buttons
    expect(screen.getByText('Allow')).toBeDefined()
    expect(screen.getByText('Deny')).toBeDefined()
  })

  it('sends "y" when Allow is clicked', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', name: 'Sess', cli: 'copilot', status: 'running', startedAt: Date.now() },
    ])

    let permissionCallback: ((data: unknown) => void) | undefined
    mockOn.mockImplementation((channel: string, cb: (data: unknown) => void) => {
      if (channel === 'cli:permission-request') permissionCallback = cb
      return vi.fn()
    })

    render(<PermissionRequestHandler />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:list-sessions')
    })

    permissionCallback!({
      sessionId: 's1',
      request: { type: 'permission-request', content: 'Run shell cmd' },
    })

    await waitFor(() => {
      expect(screen.getByText('Allow')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Allow'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:send-input', {
        sessionId: 's1',
        input: 'y',
      })
    })
  })

  it('sends "n" when Deny is clicked', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', name: 'Sess', cli: 'claude', status: 'running', startedAt: Date.now() },
    ])

    let permissionCallback: ((data: unknown) => void) | undefined
    mockOn.mockImplementation((channel: string, cb: (data: unknown) => void) => {
      if (channel === 'cli:permission-request') permissionCallback = cb
      return vi.fn()
    })

    render(<PermissionRequestHandler />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:list-sessions')
    })

    permissionCallback!({
      sessionId: 's1',
      request: { type: 'permission-request', content: 'Write file' },
    })

    await waitFor(() => {
      expect(screen.getByText('Deny')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Deny'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:send-input', {
        sessionId: 's1',
        input: 'n',
      })
    })
  })

  it('shows resolved history after approval/denial', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', name: 'Sess', cli: 'copilot', status: 'running', startedAt: Date.now() },
    ])

    let permissionCallback: ((data: unknown) => void) | undefined
    mockOn.mockImplementation((channel: string, cb: (data: unknown) => void) => {
      if (channel === 'cli:permission-request') permissionCallback = cb
      return vi.fn()
    })

    render(<PermissionRequestHandler />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:list-sessions')
    })

    permissionCallback!({
      sessionId: 's1',
      request: { type: 'permission-request', content: 'Execute cmd' },
    })

    await waitFor(() => {
      expect(screen.getByText('Allow')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Allow'))

    await waitFor(() => {
      expect(screen.getByText('approved')).toBeDefined()
    })

    // The "Clear resolved" button should appear
    expect(screen.getByText('Clear resolved')).toBeDefined()
  })

  it('clears resolved history', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', name: 'Sess', cli: 'copilot', status: 'running', startedAt: Date.now() },
    ])

    let permissionCallback: ((data: unknown) => void) | undefined
    mockOn.mockImplementation((channel: string, cb: (data: unknown) => void) => {
      if (channel === 'cli:permission-request') permissionCallback = cb
      return vi.fn()
    })

    render(<PermissionRequestHandler />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:list-sessions')
    })

    permissionCallback!({
      sessionId: 's1',
      request: { type: 'permission-request', content: 'Run test' },
    })

    await waitFor(() => {
      expect(screen.getByText('Allow')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Allow'))

    await waitFor(() => {
      expect(screen.getByText('Clear resolved')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Clear resolved'))

    expect(screen.queryByText('approved')).toBeNull()
  })

  it('auto-approves when auto-approve is enabled', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', name: 'Sess', cli: 'copilot', status: 'running', startedAt: Date.now() },
    ])

    let permissionCallback: ((data: unknown) => void) | undefined
    mockOn.mockImplementation((channel: string, cb: (data: unknown) => void) => {
      if (channel === 'cli:permission-request') permissionCallback = cb
      return vi.fn()
    })

    render(<PermissionRequestHandler />)

    // Enable auto-approve
    fireEvent.click(screen.getByLabelText('Toggle auto-approve'))

    await waitFor(() => {
      expect(screen.getByText(/Auto-approve is enabled/)).toBeDefined()
    })

    // Need to wait for the effect to re-register with new autoApprove value
    // The mockOn will be called again with new callback
    const latestCall = mockOn.mock.calls.filter(
      (c: unknown[]) => c[0] === 'cli:permission-request',
    )
    if (latestCall.length > 1) {
      permissionCallback = latestCall[latestCall.length - 1][1] as (data: unknown) => void
    }

    if (permissionCallback) {
      permissionCallback({
        sessionId: 's1',
        request: { type: 'permission-request', content: 'Auto cmd' },
      })

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('cli:send-input', {
          sessionId: 's1',
          input: 'y',
        })
      })
    }
  })
})
