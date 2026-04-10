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
    if (channel === 'app:get-cwd') return Promise.resolve('/test/cwd')
    if (channel === 'git:status') return Promise.resolve({
      branch: 'main',
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [{ file: 'test.ts', status: 'M' }],
      untracked: [],
    })
    if (channel === 'git:log') return Promise.resolve([
      { hash: 'abc123def456', shortHash: 'abc123d', message: 'Initial commit', author: 'Test', date: '2024-01-01', isAiCommit: false },
    ])
    if (channel === 'git:worktrees') return Promise.resolve([])
    if (channel === 'git:get-branches') return Promise.resolve([])
    if (channel === 'git:branch-protection') return Promise.resolve({ rules: [] })
    return Promise.resolve(null)
  })
})

import GitWorkflow from './GitWorkflow'

describe('GitWorkflow', () => {
  it('renders page heading', () => {
    render(<GitWorkflow />)
    expect(screen.getByText('Git Workflow')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<GitWorkflow />)
    expect(screen.getByText(/Visual git status, PR builder/)).toBeInTheDocument()
  })

  it('renders all tab buttons', () => {
    render(<GitWorkflow />)
    expect(screen.getByText('Git Status')).toBeInTheDocument()
    expect(screen.getByText('PR Builder')).toBeInTheDocument()
    expect(screen.getByText('Worktrees')).toBeInTheDocument()
  })

  it('shows git status content after loading', async () => {
    render(<GitWorkflow />)
    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument()
    })
  })

  it('shows modified file in git status', async () => {
    render(<GitWorkflow />)
    await waitFor(() => {
      expect(screen.getByText('test.ts')).toBeInTheDocument()
    })
  })

  it('shows commit history', async () => {
    render(<GitWorkflow />)
    await waitFor(() => {
      expect(screen.getByText('Initial commit')).toBeInTheDocument()
    })
  })

  it('calls app:get-cwd on mount', () => {
    render(<GitWorkflow />)
    expect(mockInvoke).toHaveBeenCalledWith('app:get-cwd')
  })

  it('calls git:status and git:log', async () => {
    render(<GitWorkflow />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:status', expect.any(Object))
      expect(mockInvoke).toHaveBeenCalledWith('git:log', expect.any(Object))
    })
  })
})
