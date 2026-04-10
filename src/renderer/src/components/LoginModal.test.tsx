// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
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
})
