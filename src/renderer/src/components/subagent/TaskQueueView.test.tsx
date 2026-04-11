// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import TaskQueueView from './TaskQueueView'

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

describe('TaskQueueView', () => {
  it('shows loading check initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<TaskQueueView />)
    expect(screen.getByText(/Checking for claude-code-queue/)).toBeInTheDocument()
  })

  it('shows install prompt when queue is not installed', async () => {
    mockInvoke.mockResolvedValue({ installed: false, path: null })
    render(<TaskQueueView />)

    await waitFor(() => {
      expect(screen.getByText('claude-code-queue not installed')).toBeInTheDocument()
    })
    expect(screen.getByText('npm install -g claude-code-queue')).toBeInTheDocument()
  })

  it('shows empty queue state when installed but no tasks', async () => {
    mockInvoke.mockResolvedValue({ installed: true, path: '/usr/bin/claude-code-queue' })
    render(<TaskQueueView />)

    await waitFor(() => {
      expect(screen.getByText('Queue is empty')).toBeInTheDocument()
    })
  })

  it('shows Task Queue heading when installed', async () => {
    mockInvoke.mockResolvedValue({ installed: true, path: '/usr/bin/claude-code-queue' })
    render(<TaskQueueView />)

    await waitFor(() => {
      expect(screen.getByText('Task Queue')).toBeInTheDocument()
    })
  })

  it('shows Copy command button when not installed', async () => {
    mockInvoke.mockResolvedValue({ installed: false, path: null })
    render(<TaskQueueView />)

    await waitFor(() => {
      expect(screen.getByText('Copy command')).toBeInTheDocument()
    })
  })

  it('shows Pause Queue button when installed', async () => {
    mockInvoke.mockResolvedValue({ installed: true, path: '/usr/bin/q' })
    render(<TaskQueueView />)

    await waitFor(() => {
      expect(screen.getByText('Pause Queue')).toBeInTheDocument()
    })
  })
})
