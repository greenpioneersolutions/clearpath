// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WorktreeManager from './WorktreeManager'

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

const mockWorktrees = [
  { path: '/repo', branch: 'main', commit: 'abc123', isMain: true },
  { path: '/repo-worktrees/feature-x', branch: 'feature-x', commit: 'def456', isMain: false },
]

function setupMocks(worktrees = mockWorktrees, protectedBranches: string[] = ['main']) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'git:worktrees') return Promise.resolve(worktrees)
    if (channel === 'git:branch-protection') return Promise.resolve({ protected: protectedBranches })
    if (channel === 'git:create-worktree') return Promise.resolve('/repo-worktrees/new-branch')
    if (channel === 'git:remove-worktree') return Promise.resolve()
    if (channel === 'cli:start-session') return Promise.resolve()
    return Promise.resolve(null)
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WorktreeManager', () => {
  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<WorktreeManager cwd="/repo" />)
    // Skeleton loading (pulse animations)
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders worktree list after loading', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      // "main" appears both as branch name and badge, so use getAllByText
      expect(screen.getAllByText('main').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('feature-x')).toBeDefined()
    })
  })

  it('shows empty state when no worktrees', async () => {
    setupMocks([])
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getByText('No worktrees configured')).toBeDefined()
    })
  })

  it('shows protected branches warning', async () => {
    setupMocks(mockWorktrees, ['main', 'production'])
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getByText(/Protected branches: main, production/)).toBeDefined()
    })
  })

  it('marks main worktree with main badge', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      // The "main" text appears in the badge
      const badges = screen.getAllByText('main')
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('marks protected branches with protected badge', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getByText('protected')).toBeDefined()
    })
  })

  it('shows worktree paths', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getByText('/repo')).toBeDefined()
      expect(screen.getByText('/repo-worktrees/feature-x')).toBeDefined()
    })
  })

  it('toggles create form when + New Worktree is clicked', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getByText('+ New Worktree')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ New Worktree'))
    expect(screen.getByPlaceholderText('Branch name (e.g. feature/my-task)')).toBeDefined()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('Branch name (e.g. feature/my-task)')).toBeNull()
  })

  it('creates worktree on form submission', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getByText('+ New Worktree')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ New Worktree'))
    fireEvent.change(screen.getByPlaceholderText('Branch name (e.g. feature/my-task)'), {
      target: { value: 'feature/new-branch' },
    })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:create-worktree', {
        cwd: '/repo',
        branch: 'feature/new-branch',
      })
    })
  })

  it('shows success message after creation', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getByText('+ New Worktree')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ New Worktree'))
    fireEvent.change(screen.getByPlaceholderText('Branch name (e.g. feature/my-task)'), {
      target: { value: 'feature/new' },
    })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(screen.getByText(/Created worktree at/)).toBeDefined()
    })
  })

  it('disables Create button when branch name is empty', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getByText('+ New Worktree')).toBeDefined()
    })

    fireEvent.click(screen.getByText('+ New Worktree'))
    const createBtn = screen.getByText('Create')
    expect(createBtn.hasAttribute('disabled')).toBe(true)
  })

  it('does not show Remove button for main worktree', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getAllByText('main').length).toBeGreaterThanOrEqual(1)
    })

    const removeButtons = screen.getAllByText('Remove')
    // Only 1 Remove button (for feature-x, not for main)
    expect(removeButtons.length).toBe(1)
  })

  it('launches session when Launch Session is clicked', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/repo" />)
    await waitFor(() => {
      expect(screen.getByText('feature-x')).toBeDefined()
    })

    const launchButtons = screen.getAllByText('Launch Session')
    fireEvent.click(launchButtons[0])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:start-session', expect.objectContaining({
        cli: 'claude',
        mode: 'interactive',
        workingDirectory: expect.any(String),
      }))
    })
  })

  it('calls git:worktrees and git:branch-protection on mount', async () => {
    setupMocks()
    render(<WorktreeManager cwd="/my/project" />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git:worktrees', { cwd: '/my/project' })
      expect(mockInvoke).toHaveBeenCalledWith('git:branch-protection', { cwd: '/my/project' })
    })
  })
})
