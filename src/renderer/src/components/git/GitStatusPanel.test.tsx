// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GitStatusPanel from './GitStatusPanel'

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
})

// ── Test data ────────────────────────────────────────────────────────────────

const mockStatus = {
  branch: 'feature/test',
  ahead: 2,
  behind: 1,
  staged: [{ file: 'src/app.ts', status: 'A' }],
  modified: [{ file: 'src/index.ts', status: 'M' }],
  untracked: ['new-file.txt'],
}

const mockCommits = [
  {
    hash: 'abc123def456',
    shortHash: 'abc123d',
    message: 'Add new feature',
    author: 'test-user',
    date: '2026-04-01T10:00:00Z',
    isAiCommit: false,
  },
  {
    hash: 'def456ghi789',
    shortHash: 'def456g',
    message: 'AI-generated tests',
    author: 'copilot',
    date: '2026-04-02T14:00:00Z',
    isAiCommit: true,
  },
]

function setupMocks() {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'git:status') return Promise.resolve(mockStatus)
    if (channel === 'git:log') return Promise.resolve(mockCommits)
    if (channel === 'git:file-diff') return Promise.resolve('+added line\n-removed line')
    if (channel === 'git:revert-file') return Promise.resolve()
    return Promise.resolve(null)
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GitStatusPanel', () => {
  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<GitStatusPanel cwd="/test/repo" />)
    expect(screen.getByText('Loading git status...')).toBeDefined()
  })

  it('shows error state on failure', async () => {
    mockInvoke.mockRejectedValue(new Error('Not a git repo'))
    render(<GitStatusPanel cwd="/test/repo" />)
    await waitFor(() => {
      expect(screen.getByText(/Not a git repo/)).toBeDefined()
    })
  })

  it('shows branch name after loading', async () => {
    setupMocks()
    render(<GitStatusPanel cwd="/test/repo" />)
    await waitFor(() => {
      expect(screen.getByText('feature/test')).toBeDefined()
    })
  })

  it('shows ahead/behind counts', async () => {
    setupMocks()
    render(<GitStatusPanel cwd="/test/repo" />)
    await waitFor(() => {
      expect(screen.getByText('2 ahead')).toBeDefined()
      expect(screen.getByText('1 behind')).toBeDefined()
    })
  })

  it('shows total change count', async () => {
    setupMocks()
    render(<GitStatusPanel cwd="/test/repo" />)
    await waitFor(() => {
      expect(screen.getByText('3 changes')).toBeDefined()
    })
  })

  it('renders file changes', async () => {
    setupMocks()
    render(<GitStatusPanel cwd="/test/repo" />)
    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeDefined()
      expect(screen.getByText('src/index.ts')).toBeDefined()
      expect(screen.getByText('new-file.txt')).toBeDefined()
    })
  })

  it('renders commit history', async () => {
    setupMocks()
    render(<GitStatusPanel cwd="/test/repo" />)
    await waitFor(() => {
      expect(screen.getByText('Add new feature')).toBeDefined()
      expect(screen.getByText('AI-generated tests')).toBeDefined()
    })
  })

  it('shows AI badge for AI commits', async () => {
    setupMocks()
    render(<GitStatusPanel cwd="/test/repo" />)
    await waitFor(() => {
      expect(screen.getByText('AI')).toBeDefined()
    })
  })

  it('shows commit short hashes', async () => {
    setupMocks()
    render(<GitStatusPanel cwd="/test/repo" />)
    await waitFor(() => {
      expect(screen.getByText('abc123d')).toBeDefined()
      expect(screen.getByText('def456g')).toBeDefined()
    })
  })

  it('calls git:status and git:log with cwd', async () => {
    setupMocks()
    render(<GitStatusPanel cwd="/my/project" />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:status', { cwd: '/my/project' })
      expect(mockInvoke).toHaveBeenCalledWith('git:log', { cwd: '/my/project', limit: 15 })
    })
  })

  it('refreshes when Refresh button is clicked', async () => {
    setupMocks()
    render(<GitStatusPanel cwd="/test/repo" />)
    await waitFor(() => {
      expect(screen.getByText('feature/test')).toBeDefined()
    })

    mockInvoke.mockClear()
    setupMocks()
    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:status', { cwd: '/test/repo' })
    })
  })

  it('shows not a git repository when status is null', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'git:status') return Promise.resolve(null)
      if (channel === 'git:log') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<GitStatusPanel cwd="/not-a-repo" />)
    await waitFor(() => {
      expect(screen.getByText('Not a git repository')).toBeDefined()
    })
  })
})
