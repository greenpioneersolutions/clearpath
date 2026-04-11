// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import WelcomeBack from './WelcomeBack'
import type { SessionInfo } from '../../types/ipc'
import type { OutputMessage } from '../OutputDisplay'

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

describe('WelcomeBack', () => {
  const handlers = {
    onNewSession: vi.fn(),
    onContinueSession: vi.fn(),
    onViewSession: vi.fn(),
  }

  beforeEach(() => {
    Object.values(handlers).forEach((fn) => fn.mockReset())
  })

  it('renders Welcome Back heading', async () => {
    mockInvoke.mockResolvedValue([])
    render(<WelcomeBack recentSessions={[]} {...handlers} />)
    expect(screen.getByText('Welcome Back')).toBeInTheDocument()
  })

  it('renders Start New Session button', async () => {
    mockInvoke.mockResolvedValue([])
    render(<WelcomeBack recentSessions={[]} {...handlers} />)
    expect(screen.getByText('Start New Session')).toBeInTheDocument()
  })

  it('calls onNewSession when Start New Session is clicked', async () => {
    mockInvoke.mockResolvedValue([])
    render(<WelcomeBack recentSessions={[]} {...handlers} />)
    fireEvent.click(screen.getByText('Start New Session'))
    expect(handlers.onNewSession).toHaveBeenCalledOnce()
  })

  it('renders recent sessions when provided', async () => {
    mockInvoke.mockResolvedValue([])
    const sessions = [
      {
        info: {
          sessionId: 's1',
          name: 'My Session',
          cli: 'copilot' as const,
          status: 'stopped' as const,
          startedAt: Date.now() - 60000,
        },
        messages: [
          { id: '1', output: { type: 'text' as const, content: 'Hello world prompt' }, sender: 'user' as const },
        ],
      },
    ]

    render(<WelcomeBack recentSessions={sessions} {...handlers} />)
    expect(screen.getByText('My Session')).toBeInTheDocument()
    expect(screen.getByText('Recent Sessions')).toBeInTheDocument()
  })

  it('shows Quick Starts when starter pack returns prompts', async () => {
    mockInvoke.mockResolvedValue([
      { id: 'p1', displayText: 'Draft a team update', targetAgentId: 'comm-coach' },
    ])

    render(<WelcomeBack recentSessions={[]} {...handlers} />)

    await waitFor(() => {
      expect(screen.getByText('Quick Starts')).toBeInTheDocument()
      expect(screen.getByText('Draft a team update')).toBeInTheDocument()
    })
  })

  it('does not show Recent Sessions when list is empty', async () => {
    mockInvoke.mockResolvedValue([])
    render(<WelcomeBack recentSessions={[]} {...handlers} />)
    expect(screen.queryByText('Recent Sessions')).not.toBeInTheDocument()
  })
})
