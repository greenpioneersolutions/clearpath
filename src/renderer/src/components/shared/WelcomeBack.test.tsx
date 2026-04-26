// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import WelcomeBack from './WelcomeBack'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset().mockResolvedValue([])
  mockOn.mockReset().mockReturnValue(vi.fn())
})

describe('WelcomeBack', () => {
  const handlers = {
    onStartBlank: vi.fn(),
    onContinueSession: vi.fn(),
    onBrowseAll: vi.fn(),
  }

  beforeEach(() => {
    Object.values(handlers).forEach((fn) => fn.mockReset())
  })

  it('renders Welcome Back heading', () => {
    render(<WelcomeBack recentSessions={[]} {...handlers} />)
    expect(screen.getByText('Welcome Back')).toBeInTheDocument()
  })

  it('renders a single primary "Start a session" button', () => {
    render(<WelcomeBack recentSessions={[]} {...handlers} />)
    expect(screen.getByText('Start a session')).toBeInTheDocument()
  })

  it('calls onStartBlank when the primary CTA is clicked', () => {
    render(<WelcomeBack recentSessions={[]} {...handlers} />)
    fireEvent.click(screen.getByText('Start a session'))
    expect(handlers.onStartBlank).toHaveBeenCalledOnce()
  })

  it('renders recent sessions with name and time-ago only (no prompt preview)', () => {
    const userPrompt = 'Hello world prompt that should NOT appear'
    const sessions = [
      {
        info: {
          sessionId: 's1',
          name: 'My Session',
          cli: 'copilot-cli' as const,
          status: 'stopped' as const,
          startedAt: Date.now() - 2 * 60 * 60 * 1000, // ~2 hours ago
        },
        messages: [
          { id: '1', output: { type: 'text' as const, content: userPrompt }, sender: 'user' as const },
        ],
      },
    ]
    render(<WelcomeBack recentSessions={sessions} {...handlers} />)
    expect(screen.getByText('My Session')).toBeInTheDocument()
    expect(screen.getByText(/hours? ago|Yesterday|days? ago|Just now|minutes? ago/)).toBeInTheDocument()
    // The first-prompt preview must NOT be rendered in compact mode
    expect(screen.queryByText(userPrompt)).not.toBeInTheDocument()
    // Neither the "View" nor "Continue" hover action buttons should exist
    expect(screen.queryByText('View')).not.toBeInTheDocument()
    expect(screen.queryByText('Continue')).not.toBeInTheDocument()
  })

  it('clicking a recent row calls onContinueSession with that session info', () => {
    const info = {
      sessionId: 's1',
      name: 'Row Click',
      cli: 'copilot-cli' as const,
      status: 'running' as const,
      startedAt: Date.now() - 60000,
    }
    const sessions = [{ info, messages: [] }]
    render(<WelcomeBack recentSessions={sessions} {...handlers} />)
    fireEvent.click(screen.getByText('Row Click'))
    expect(handlers.onContinueSession).toHaveBeenCalledWith(info)
  })

  it('renders a "See all" link that calls onBrowseAll', () => {
    const sessions = [
      {
        info: {
          sessionId: 's1',
          name: 'Any',
          cli: 'copilot-cli' as const,
          status: 'running' as const,
          startedAt: Date.now(),
        },
        messages: [],
      },
    ]
    render(<WelcomeBack recentSessions={sessions} {...handlers} />)
    const link = screen.getByText('See all')
    fireEvent.click(link)
    expect(handlers.onBrowseAll).toHaveBeenCalledOnce()
  })

  it('does not render Recent section when list is empty', () => {
    render(<WelcomeBack recentSessions={[]} {...handlers} />)
    expect(screen.queryByText('Recent')).not.toBeInTheDocument()
    expect(screen.queryByText('See all')).not.toBeInTheDocument()
  })
})
