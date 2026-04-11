// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ActivityFeed from './ActivityFeed'

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

describe('ActivityFeed', () => {
  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<ActivityFeed workingDirectory="/tmp/project" />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders activity entries after loading', async () => {
    mockInvoke.mockResolvedValue([
      {
        hash: 'abc1234567890',
        message: 'fix: resolve login bug',
        author: 'Alice',
        date: new Date().toISOString(),
        repo: 'my-app',
        isAiGenerated: false,
      },
      {
        hash: 'def9876543210',
        message: 'refactor: extract auth module',
        author: 'CoPilot',
        date: new Date().toISOString(),
        repo: 'my-app',
        isAiGenerated: true,
      },
    ])

    render(<ActivityFeed workingDirectory="/tmp/project" />)

    await waitFor(() => {
      expect(screen.getByText('fix: resolve login bug')).toBeInTheDocument()
    })
    expect(screen.getByText('refactor: extract auth module')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
  })

  it('shows empty state when no history', async () => {
    mockInvoke.mockResolvedValue([])
    render(<ActivityFeed workingDirectory="/tmp/project" />)

    await waitFor(() => {
      expect(screen.getByText('No git history found')).toBeInTheDocument()
    })
  })

  it('calls team:git-activity with correct params', async () => {
    mockInvoke.mockResolvedValue([])
    render(<ActivityFeed workingDirectory="/my/dir" />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('team:git-activity', {
        workingDirectory: '/my/dir',
        limit: 40,
      })
    })
  })

  it('refreshes when Refresh button is clicked', async () => {
    mockInvoke.mockResolvedValue([])
    render(<ActivityFeed workingDirectory="/tmp/project" />)

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument()
    })

    mockInvoke.mockResolvedValue([])
    fireEvent.click(screen.getByText('Refresh'))
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })
})
