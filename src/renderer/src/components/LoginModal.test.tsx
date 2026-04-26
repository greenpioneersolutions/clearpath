// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LoginModal } from './LoginModal'

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

// Helper — render the modal and capture the push-event handlers the
// component registered so tests can fire events into it.
function renderAndCaptureHandlers(cli: 'copilot' | 'claude' = 'copilot') {
  const handlers: Record<string, (payload: unknown) => void> = {}
  mockOn.mockImplementation((channel: string, h: (payload: unknown) => void) => {
    handlers[channel] = h
    return vi.fn()
  })
  const onClose = vi.fn()
  render(<LoginModal cli={cli} isOpen={true} onClose={onClose} />)
  return { handlers, onClose }
}

describe('LoginModal', () => {
  it('returns null when not open', () => {
    const { container } = render(
      <LoginModal cli="copilot" isOpen={false} onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders dialog with copilot title when open', () => {
    render(<LoginModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Connect GitHub Copilot')).toBeInTheDocument()
  })

  it('renders dialog with claude title', () => {
    render(<LoginModal cli="claude" isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Connect Claude Code')).toBeInTheDocument()
  })

  it('starts login process on open', () => {
    render(<LoginModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(mockInvoke).toHaveBeenCalledWith('auth:login-start', { cli: 'copilot' })
  })

  it('shows initial loading text', () => {
    render(<LoginModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText(/Starting login process/)).toBeInTheDocument()
  })

  it('shows cancel button while running', () => {
    render(<LoginModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Cancel login')).toBeInTheDocument()
  })

  it('calls login-cancel when cancel is clicked', () => {
    const onClose = vi.fn()
    render(<LoginModal cli="copilot" isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Cancel login'))
    expect(mockInvoke).toHaveBeenCalledWith('auth:login-cancel')
    expect(onClose).toHaveBeenCalled()
  })

  it('subscribes to auth events', () => {
    render(<LoginModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(mockOn).toHaveBeenCalledWith('auth:login-output', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('auth:login-complete', expect.any(Function))
  })

  it('has proper dialog role', () => {
    render(<LoginModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows In progress badge while running', () => {
    render(<LoginModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  // ── Browser-opened UX (new) ────────────────────────────────────────────────

  it('subscribes to auth:login-browser-opened push event', () => {
    render(<LoginModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    expect(mockOn).toHaveBeenCalledWith('auth:login-browser-opened', expect.any(Function))
  })

  it('falls back to terminal-only view when no browser-opened event is received', () => {
    render(<LoginModal cli="copilot" isOpen={true} onClose={vi.fn()} />)
    // Terminal placeholder visible, friendly panel NOT
    expect(screen.getByText(/Starting login process/)).toBeInTheDocument()
    expect(screen.queryByText('We opened your browser')).not.toBeInTheDocument()
  })

  it('swaps to friendly "We opened your browser" panel when auth:login-browser-opened fires', () => {
    const { handlers } = renderAndCaptureHandlers('copilot')

    act(() => {
      handlers['auth:login-browser-opened']?.({
        cli: 'copilot',
        url: 'https://github.com/login/device',
      })
    })

    expect(screen.getByText('We opened your browser')).toBeInTheDocument()
    expect(
      screen.getByText(/Finish signing in there\. This window will close automatically/i),
    ).toBeInTheDocument()
    // The instructions line in the header swaps too
    expect(screen.getByText(/We opened your browser — sign in to finish/)).toBeInTheDocument()
  })

  it('renders a parsed device code from auth:login-output in the prominent display block', () => {
    const { handlers } = renderAndCaptureHandlers('copilot')

    act(() => {
      handlers['auth:login-output']?.({
        cli: 'copilot',
        line: '! First copy your one-time code: ABCD-1234',
      })
      handlers['auth:login-browser-opened']?.({
        cli: 'copilot',
        url: 'https://github.com/login/device',
      })
    })

    // Friendly panel + device code block
    expect(screen.getByText('Device code')).toBeInTheDocument()
    expect(screen.getByText('ABCD-1234')).toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('"Didn\'t see your browser open?" button fires auth:open-external with the captured URL', () => {
    const { handlers } = renderAndCaptureHandlers('copilot')

    const url = 'https://github.com/login/device'
    act(() => {
      handlers['auth:login-browser-opened']?.({ cli: 'copilot', url })
    })

    const reopen = screen.getByText(/Didn't see your browser open\?/i)
    fireEvent.click(reopen)
    expect(mockInvoke).toHaveBeenCalledWith('auth:open-external', { url })
  })

  it('"Show technical details" disclosure reveals the terminal output view', () => {
    const { handlers } = renderAndCaptureHandlers('copilot')

    act(() => {
      handlers['auth:login-output']?.({
        cli: 'copilot',
        line: 'Device activation initiated',
      })
      handlers['auth:login-browser-opened']?.({
        cli: 'copilot',
        url: 'https://github.com/login/device',
      })
    })

    // Technical details are hidden by default
    expect(screen.getByText('Show technical details')).toBeInTheDocument()
    // Streamed line is NOT visible in the friendly panel by default
    expect(screen.queryByText('Device activation initiated')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Show technical details'))

    // Now the streamed output shows inside the disclosure log
    expect(screen.getByText('Device activation initiated')).toBeInTheDocument()
    expect(screen.getByText('Hide technical details')).toBeInTheDocument()
  })

  it('ignores browser-opened events for a different CLI', () => {
    const { handlers } = renderAndCaptureHandlers('copilot')

    act(() => {
      handlers['auth:login-browser-opened']?.({
        cli: 'claude',
        url: 'https://claude.ai/login',
      })
    })

    // Still in terminal view — never swapped to friendly panel
    expect(screen.queryByText('We opened your browser')).not.toBeInTheDocument()
    expect(screen.getByText(/Starting login process/)).toBeInTheDocument()
  })
})
