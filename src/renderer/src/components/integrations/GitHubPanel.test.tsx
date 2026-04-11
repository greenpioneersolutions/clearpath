// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import GitHubPanel from './GitHubPanel'

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

describe('GitHubPanel', () => {
  const onInjectContext = vi.fn()

  beforeEach(() => {
    onInjectContext.mockReset()
  })

  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<GitHubPanel onInjectContext={onInjectContext} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows connect prompt when GitHub is not connected', async () => {
    mockInvoke.mockResolvedValue({ github: null })
    render(<GitHubPanel onInjectContext={onInjectContext} />)

    await waitFor(() => {
      expect(screen.getByText(/Connect GitHub/)).toBeInTheDocument()
    })
  })

  it('loads and renders repos when connected', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'integration:get-status') return Promise.resolve({
        github: { connected: true, username: 'testuser' },
      })
      if (channel === 'integration:github-repos') return Promise.resolve({
        success: true,
        repos: [
          {
            id: 1, name: 'my-app', fullName: 'testuser/my-app',
            description: 'A test app', private: false, url: 'https://github.com/testuser/my-app',
            pushedAt: new Date().toISOString(), language: 'TypeScript',
          },
        ],
      })
      return Promise.resolve(null)
    })

    render(<GitHubPanel onInjectContext={onInjectContext} />)

    await waitFor(() => {
      expect(screen.getByText('my-app')).toBeInTheDocument()
    })
    expect(screen.getByText('testuser')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('shows PRs and Issues buttons for each repo', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'integration:get-status') return Promise.resolve({
        github: { connected: true, username: 'testuser' },
      })
      if (channel === 'integration:github-repos') return Promise.resolve({
        success: true,
        repos: [
          {
            id: 1, name: 'repo', fullName: 'testuser/repo',
            description: null, private: false, url: '', pushedAt: null, language: null,
          },
        ],
      })
      return Promise.resolve(null)
    })

    render(<GitHubPanel onInjectContext={onInjectContext} />)

    await waitFor(() => {
      expect(screen.getByText('PRs')).toBeInTheDocument()
      expect(screen.getByText('Issues')).toBeInTheDocument()
    })
  })

  it('loads pull requests when PRs button is clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'integration:get-status') return Promise.resolve({
        github: { connected: true, username: 'testuser' },
      })
      if (channel === 'integration:github-repos') return Promise.resolve({
        success: true,
        repos: [
          {
            id: 1, name: 'repo', fullName: 'testuser/repo',
            description: null, private: false, url: '', pushedAt: null, language: null,
          },
        ],
      })
      if (channel === 'integration:github-pulls') return Promise.resolve({
        success: true,
        pulls: [
          {
            number: 42, title: 'Add feature X', state: 'open', author: 'testuser',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            mergedAt: null, url: 'https://github.com/testuser/repo/pull/42',
            body: 'A PR body', head: 'feature-x', base: 'main',
            draft: false, additions: 50, deletions: 10, changedFiles: 3,
            labels: [], reviewers: [],
          },
        ],
      })
      return Promise.resolve(null)
    })

    render(<GitHubPanel onInjectContext={onInjectContext} />)

    await waitFor(() => {
      expect(screen.getByText('PRs')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('PRs'))

    await waitFor(() => {
      expect(screen.getByText('Add feature X')).toBeInTheDocument()
      expect(screen.getByText('#42')).toBeInTheDocument()
    })
  })

  it('injects PR context when a PR is clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'integration:get-status') return Promise.resolve({
        github: { connected: true, username: 'testuser' },
      })
      if (channel === 'integration:github-repos') return Promise.resolve({
        success: true,
        repos: [
          {
            id: 1, name: 'repo', fullName: 'testuser/repo',
            description: null, private: false, url: '', pushedAt: null, language: null,
          },
        ],
      })
      if (channel === 'integration:github-pulls') return Promise.resolve({
        success: true,
        pulls: [
          {
            number: 42, title: 'Add feature X', state: 'open', author: 'testuser',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            mergedAt: null, url: 'https://github.com/testuser/repo/pull/42',
            body: 'PR body text', head: 'feature-x', base: 'main',
            draft: false, additions: 50, deletions: 10, changedFiles: 3,
            labels: [], reviewers: [],
          },
        ],
      })
      return Promise.resolve(null)
    })

    render(<GitHubPanel onInjectContext={onInjectContext} />)

    await waitFor(() => expect(screen.getByText('PRs')).toBeInTheDocument())
    fireEvent.click(screen.getByText('PRs'))

    await waitFor(() => expect(screen.getByText('Add feature X')).toBeInTheDocument())

    // Click the PR to inject context
    fireEvent.click(screen.getByText('Add feature X'))
    expect(onInjectContext).toHaveBeenCalledWith(expect.stringContaining('GitHub PR #42'))
  })

  it('shows back button when viewing PRs', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'integration:get-status') return Promise.resolve({
        github: { connected: true, username: 'testuser' },
      })
      if (channel === 'integration:github-repos') return Promise.resolve({
        success: true,
        repos: [
          {
            id: 1, name: 'repo', fullName: 'testuser/repo',
            description: null, private: false, url: '', pushedAt: null, language: null,
          },
        ],
      })
      if (channel === 'integration:github-pulls') return Promise.resolve({ success: true, pulls: [] })
      return Promise.resolve(null)
    })

    render(<GitHubPanel onInjectContext={onInjectContext} />)

    await waitFor(() => expect(screen.getByText('PRs')).toBeInTheDocument())
    fireEvent.click(screen.getByText('PRs'))

    await waitFor(() => {
      expect(screen.getByText(/All repos/)).toBeInTheDocument()
    })
  })
})
