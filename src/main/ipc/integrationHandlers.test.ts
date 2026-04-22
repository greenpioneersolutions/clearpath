import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  storeSecretMock, retrieveSecretMock, deleteSecretMock,
  mockOctokitInstance,
} = vi.hoisted(() => ({
  storeSecretMock: vi.fn(),
  retrieveSecretMock: vi.fn().mockReturnValue(null),
  deleteSecretMock: vi.fn(),
  mockOctokitInstance: {
    rest: {
      users: { getAuthenticated: vi.fn() },
      repos: { listForAuthenticatedUser: vi.fn() },
      pulls: { list: vi.fn(), get: vi.fn(), listFiles: vi.fn(), listReviews: vi.fn() },
      issues: { listForRepo: vi.fn() },
      search: { code: vi.fn(), issuesAndPullRequests: vi.fn() },
    },
  },
}))

vi.mock('../utils/credentialStore', () => ({
  storeSecret: storeSecretMock,
  retrieveSecret: retrieveSecretMock,
  deleteSecret: deleteSecretMock,
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-key',
}))

vi.mock('../utils/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('octokit', () => ({
  Octokit: class MockOctokit {
    rest = mockOctokitInstance.rest
    constructor() { /* noop */ }
  },
}))

// ── Store mock ──────────────────────────────────────────────────────────────

const STORE_KEY = '__integrationTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__integrationTestStoreData'] as Record<string, unknown>
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in sd)) sd[k] = JSON.parse(JSON.stringify(v))
          }
        }
      }
      get store(): Record<string, unknown> { return sd }
      get(key: string): unknown {
        const val = sd[key]
        return val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined
      }
      set(key: string, value: unknown): void {
        sd[key] = JSON.parse(JSON.stringify(value))
      }
    },
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeData = (globalThis as any)[STORE_KEY] as Record<string, unknown>

import { ipcMain } from 'electron'

// ── Helpers ─────────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => unknown
function getHandler(channel: string): HandlerFn {
  const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c: unknown[]) => c[0] === channel,
  )
  if (calls.length === 0) throw new Error(`No handler registered for channel: ${channel}`)
  return calls[calls.length - 1][1] as HandlerFn
}

const mockEvent = {} as Electron.IpcMainInvokeEvent

// ── Tests ───────────────────────────────────────────────────────────────────

describe('integrationHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    retrieveSecretMock.mockReturnValue(null)

    // Module-level state (octokit cache) requires fresh import
    vi.resetModules()
    const mod = await import('./integrationHandlers')
    mod.registerIntegrationHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('integration:get-status')
    expect(channels).toContain('integration:github-connect')
    expect(channels).toContain('integration:github-disconnect')
    expect(channels).toContain('integration:github-repos')
    expect(channels).toContain('integration:github-pulls')
    expect(channels).toContain('integration:github-pull-detail')
    expect(channels).toContain('integration:github-issues')
    expect(channels).toContain('integration:github-search')
  })

  describe('integration:get-status', () => {
    it('returns null when not connected', () => {
      const handler = getHandler('integration:get-status')
      const result = handler(mockEvent) as { github: null }
      expect(result.github).toBeNull()
    })

    it('returns connection info when connected', () => {
      storeData['github'] = { connected: true, username: 'testuser', connectedAt: 1000 }
      const handler = getHandler('integration:get-status')
      const result = handler(mockEvent) as { github: { connected: boolean; username: string } }
      expect(result.github?.connected).toBe(true)
      expect(result.github?.username).toBe('testuser')
    })
  })

  describe('integration:github-connect', () => {
    it('authenticates and stores connection', async () => {
      mockOctokitInstance.rest.users.getAuthenticated.mockResolvedValue({
        data: { login: 'testuser', id: 123 },
      })

      const handler = getHandler('integration:github-connect')
      const result = await handler(mockEvent, { token: 'ghp_test123' }) as { success: boolean; username: string }
      expect(result.success).toBe(true)
      expect(result.username).toBe('testuser')
      expect(storeSecretMock).toHaveBeenCalledWith('github-token', 'ghp_test123')
    })

    it('returns error on auth failure', async () => {
      mockOctokitInstance.rest.users.getAuthenticated.mockRejectedValue(new Error('Bad token'))

      const handler = getHandler('integration:github-connect')
      const result = await handler(mockEvent, { token: 'bad' }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('Bad token')
    })
  })

  describe('integration:github-disconnect', () => {
    it('clears token and connection state', () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      const handler = getHandler('integration:github-disconnect')
      const result = handler(mockEvent) as { success: boolean }
      expect(result.success).toBe(true)
      expect(deleteSecretMock).toHaveBeenCalledWith('github-token')
      expect(storeData['github']).toBeNull()
    })
  })

  describe('integration:github-repos', () => {
    it('returns error when not connected', async () => {
      const handler = getHandler('integration:github-repos')
      const result = await handler(mockEvent) as { success: boolean; error: string }
      expect(result.success).toBe(false)
    })

    it('returns repos when connected', async () => {
      // Setup connected state with token
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.repos.listForAuthenticatedUser.mockResolvedValue({
        data: [{ id: 1, name: 'repo1', full_name: 'user/repo1', owner: { login: 'user' }, description: 'Test', private: false, html_url: 'https://github.com/user/repo1', pushed_at: '2024-01-01', language: 'TypeScript', default_branch: 'main' }],
        headers: { 'x-ratelimit-remaining': '59' },
      })

      // Need fresh import since octokit is cached at module level
      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-repos')
      const result = await handler(mockEvent) as { success: boolean; repos: Array<{ name: string }> }
      expect(result.success).toBe(true)
      expect(result.repos).toHaveLength(1)
      expect(result.repos[0].name).toBe('repo1')
    })
  })

  describe('integration:github-repos', () => {
    it('returns error when API call fails', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.repos.listForAuthenticatedUser.mockRejectedValue(new Error('Rate limited'))

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-repos')
      const result = await handler(mockEvent) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('Rate limited')
    })

    it('returns repos with pagination params when provided', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.repos.listForAuthenticatedUser.mockResolvedValue({
        data: [],
        headers: {},
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-repos')
      const result = await handler(mockEvent, { page: 2, perPage: 50 }) as { success: boolean; repos: unknown[] }
      expect(result.success).toBe(true)
      expect(result.repos).toHaveLength(0)
    })
  })

  describe('integration:github-pulls', () => {
    it('returns error when not connected', async () => {
      const handler = getHandler('integration:github-pulls')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean }
      expect(result.success).toBe(false)
    })

    it('returns pull requests when connected', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.pulls.list.mockResolvedValue({
        data: [{
          number: 42, title: 'Fix bug', state: 'open',
          user: { login: 'dev' },
          created_at: '2024-01-01', updated_at: '2024-01-02',
          merged_at: null,
          html_url: 'https://github.com/o/r/pull/42',
          body: 'Description',
          head: { ref: 'feature/fix' }, base: { ref: 'main' },
          draft: false, additions: 10, deletions: 5, changed_files: 2,
          labels: [{ name: 'bug' }],
          requested_reviewers: [{ login: 'reviewer' }],
        }],
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-pulls')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; pulls: Array<{ number: number; title: string }> }
      expect(result.success).toBe(true)
      expect(result.pulls).toHaveLength(1)
      expect(result.pulls[0].number).toBe(42)
      expect(result.pulls[0].title).toBe('Fix bug')
    })

    it('handles API error for pulls', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.pulls.list.mockRejectedValue(new Error('Not found'))

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-pulls')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('Not found')
    })

    it('maps string labels in pulls correctly', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.pulls.list.mockResolvedValue({
        data: [{
          number: 1, title: 'PR', state: 'open',
          user: { login: 'dev' }, created_at: '', updated_at: '', merged_at: null,
          html_url: '', body: null,
          head: { ref: 'feat' }, base: { ref: 'main' },
          draft: false, additions: 0, deletions: 0, changed_files: 0,
          labels: ['enhancement'],
          requested_reviewers: [],
        }],
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-pulls')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; pulls: Array<{ labels: string[] }> }
      expect(result.success).toBe(true)
      expect(result.pulls[0].labels).toContain('enhancement')
    })
  })

  describe('integration:github-pull-detail', () => {
    it('returns error when not connected', async () => {
      const handler = getHandler('integration:github-pull-detail')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r', pullNumber: 42 }) as { success: boolean }
      expect(result.success).toBe(false)
    })

    it('returns pull request detail when connected', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')

      const prDetail = {
        number: 42, title: 'Fix bug', state: 'open',
        user: { login: 'dev' }, body: 'Description',
        created_at: '2024-01-01', updated_at: '2024-01-02', merged_at: null,
        html_url: 'https://github.com/o/r/pull/42',
        head: { ref: 'feature/fix' }, base: { ref: 'main' },
        draft: false, additions: 10, deletions: 5, changed_files: 2,
        mergeable: true,
        labels: [{ name: 'bug' }],
      }
      mockOctokitInstance.rest.pulls.get.mockResolvedValue({ data: prDetail })
      mockOctokitInstance.rest.pulls.listFiles.mockResolvedValue({
        data: [{ filename: 'src/index.ts', status: 'modified', additions: 5, deletions: 2, patch: '...' }],
      })
      mockOctokitInstance.rest.pulls.listReviews.mockResolvedValue({
        data: [{ user: { login: 'reviewer' }, state: 'APPROVED', body: 'Looks good', submitted_at: '2024-01-02' }],
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-pull-detail')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r', pullNumber: 42 }) as {
        success: boolean; pull: { number: number }; files: unknown[]; reviews: unknown[]
      }
      expect(result.success).toBe(true)
      expect(result.pull.number).toBe(42)
      expect(result.files).toHaveLength(1)
      expect(result.reviews).toHaveLength(1)
    })

    it('handles API error for pull detail', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.pulls.get.mockRejectedValue(new Error('PR not found'))
      mockOctokitInstance.rest.pulls.listFiles.mockResolvedValue({ data: [] })
      mockOctokitInstance.rest.pulls.listReviews.mockResolvedValue({ data: [] })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-pull-detail')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r', pullNumber: 99 }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
    })
  })

  describe('integration:github-issues', () => {
    it('returns error when not connected', async () => {
      const handler = getHandler('integration:github-issues')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean }
      expect(result.success).toBe(false)
    })

    it('returns issues when connected', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.issues.listForRepo.mockResolvedValue({
        data: [
          {
            number: 10, title: 'Bug report', state: 'open',
            user: { login: 'reporter' },
            created_at: '2024-01-01', updated_at: '2024-01-02',
            body: 'Something broke',
            html_url: 'https://github.com/o/r/issues/10',
            labels: [{ name: 'bug' }],
            assignees: [{ login: 'dev' }],
            comments: 2,
            pull_request: undefined,
          },
          // This one should be filtered out (it's a PR)
          {
            number: 11, title: 'PR as issue', state: 'open',
            user: { login: 'dev' }, created_at: '', updated_at: '',
            body: null, html_url: '', labels: [], assignees: [],
            comments: 0,
            pull_request: { url: 'https://api.github.com/repos/o/r/pulls/11' },
          },
        ],
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-issues')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; issues: Array<{ number: number }> }
      expect(result.success).toBe(true)
      // PR should be filtered out
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].number).toBe(10)
    })

    it('handles API error for issues', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.issues.listForRepo.mockRejectedValue(new Error('Forbidden'))

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-issues')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('Forbidden')
    })

    it('passes state parameter to issues API', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.issues.listForRepo.mockResolvedValue({ data: [] })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-issues')
      await handler(mockEvent, { owner: 'o', repo: 'r', state: 'closed', perPage: 5 }) as { success: boolean }
      expect(mockOctokitInstance.rest.issues.listForRepo).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'closed', per_page: 5 })
      )
    })
  })

  describe('integration:github-search', () => {
    it('returns error when not connected', async () => {
      const handler = getHandler('integration:github-search')
      const result = await handler(mockEvent, { query: 'test' }) as { success: boolean }
      expect(result.success).toBe(false)
    })

    it('searches issues/PRs when connected', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: {
          items: [{
            number: 5, title: 'Bug fix', state: 'closed',
            repository_url: 'https://api.github.com/repos/user/myrepo',
            html_url: 'https://github.com/user/myrepo/issues/5',
            updated_at: '2024-01-01',
            pull_request: undefined,
          }],
        },
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-search')
      const result = await handler(mockEvent, { query: 'bug fix' }) as { success: boolean; results: Array<{ number: number; type: string }> }
      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].number).toBe(5)
      expect(result.results[0].type).toBe('issue')
    })

    it('searches PRs with is:pr qualifier when type=pulls', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { items: [] },
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-search')
      await handler(mockEvent, { query: 'auth', type: 'pulls' }) as { success: boolean }
      expect(mockOctokitInstance.rest.search.issuesAndPullRequests).toHaveBeenCalledWith(
        expect.objectContaining({ q: expect.stringContaining('is:pr') })
      )
    })

    it('searches code when type=code', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.search.code.mockResolvedValue({
        data: {
          items: [{
            path: 'src/index.ts',
            repository: { full_name: 'user/repo' },
            html_url: 'https://github.com/user/repo/blob/main/src/index.ts',
            text_matches: [{ fragment: 'some code snippet' }],
          }],
        },
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-search')
      const result = await handler(mockEvent, { query: 'myFunction', type: 'code' }) as { success: boolean; results: Array<{ path: string; type: string }> }
      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].path).toBe('src/index.ts')
      expect(result.results[0].type).toBe('code')
    })

    it('handles search API error', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.search.issuesAndPullRequests.mockRejectedValue(new Error('Search failed'))

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-search')
      const result = await handler(mockEvent, { query: 'test' }) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('Search failed')
    })

    it('maps pull_request results as type "pull"', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mockOctokitInstance.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: {
          items: [{
            number: 99, title: 'My PR', state: 'open',
            repository_url: 'https://api.github.com/repos/user/repo',
            html_url: 'https://github.com/user/repo/pull/99',
            updated_at: '2024-01-01',
            pull_request: { url: 'https://api.github.com/repos/user/repo/pulls/99' },
          }],
        },
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-search')
      const result = await handler(mockEvent, { query: 'fix' }) as { success: boolean; results: Array<{ type: string }> }
      expect(result.success).toBe(true)
      expect(result.results[0].type).toBe('pull')
    })
  })

  describe('getOctokit — legacy token migration', () => {
    it('migrates legacy plaintext token to credentialStore', async () => {
      // Connected state with legacy token stored in the store directly
      storeData['github'] = {
        connected: true, username: 'user', connectedAt: 1000,
        token: 'ghp_legacy_plaintext_token',
      }
      // credentialStore returns null (no encrypted token)
      retrieveSecretMock.mockReturnValue(null)
      mockOctokitInstance.rest.repos.listForAuthenticatedUser.mockResolvedValue({
        data: [], headers: {},
      })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-repos')
      const result = await handler(mockEvent) as { success: boolean }
      expect(result.success).toBe(true)
      // Legacy token should have been migrated to credentialStore
      expect(storeSecretMock).toHaveBeenCalledWith('github-token', 'ghp_legacy_plaintext_token')
    })

    it('returns error when no token and no legacy token', async () => {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue(null)

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-repos')
      const result = await handler(mockEvent) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('token could not be retrieved')
    })

    it('handles storeSecret migration failure gracefully', async () => {
      storeData['github'] = {
        connected: true, username: 'user', connectedAt: 1000,
        token: 'ghp_legacy_token',
      }
      retrieveSecretMock.mockReturnValue(null)
      // storeSecret throws during migration
      storeSecretMock.mockImplementation(() => { throw new Error('Keychain write failed') })

      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      storeSecretMock.mockImplementation(() => { throw new Error('Keychain write failed') })
      mod.registerIntegrationHandlers(ipcMain)

      const handler = getHandler('integration:github-repos')
      // Migration fails, token ends up as null, returns error
      const result = await handler(mockEvent) as { success: boolean; error: string }
      expect(result.success).toBe(false)
    })
  })

  describe('null/undefined edge cases — fallback branches', () => {
    // Helper to set up connected state with valid token
    async function setupConnected() {
      storeData['github'] = { connected: true, username: 'user', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mod.registerIntegrationHandlers(ipcMain)
    }

    it('github-pulls: maps null user to "unknown" author', async () => {
      await setupConnected()
      mockOctokitInstance.rest.pulls.list.mockResolvedValue({
        data: [{
          number: 1, title: 'PR', state: 'open',
          user: null,
          created_at: '', updated_at: '', merged_at: null,
          html_url: '', body: null,
          head: { ref: 'feat' }, base: { ref: 'main' },
          draft: false, additions: 0, deletions: 0, changed_files: 0,
          labels: [],
          requested_reviewers: [],
        }],
      })

      const handler = getHandler('integration:github-pulls')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; pulls: Array<{ author: string }> }
      expect(result.success).toBe(true)
      expect(result.pulls[0].author).toBe('unknown')
    })

    it('github-pulls: maps label with null name to empty string', async () => {
      await setupConnected()
      mockOctokitInstance.rest.pulls.list.mockResolvedValue({
        data: [{
          number: 1, title: 'PR', state: 'open',
          user: { login: 'dev' },
          created_at: '', updated_at: '', merged_at: null,
          html_url: '', body: null,
          head: { ref: 'feat' }, base: { ref: 'main' },
          draft: false, additions: 0, deletions: 0, changed_files: 0,
          labels: [{ name: null }],
          requested_reviewers: [],
        }],
      })

      const handler = getHandler('integration:github-pulls')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; pulls: Array<{ labels: string[] }> }
      expect(result.success).toBe(true)
      expect(result.pulls[0].labels).toContain('')
    })

    it('github-pulls: maps reviewer with name (team) instead of login', async () => {
      await setupConnected()
      mockOctokitInstance.rest.pulls.list.mockResolvedValue({
        data: [{
          number: 1, title: 'PR', state: 'open',
          user: { login: 'dev' },
          created_at: '', updated_at: '', merged_at: null,
          html_url: '', body: null,
          head: { ref: 'feat' }, base: { ref: 'main' },
          draft: false, additions: 0, deletions: 0, changed_files: 0,
          labels: [],
          // Team reviewer only has 'name', not 'login'
          requested_reviewers: [{ name: 'frontend-team' }],
        }],
      })

      const handler = getHandler('integration:github-pulls')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; pulls: Array<{ reviewers: string[] }> }
      expect(result.success).toBe(true)
      expect(result.pulls[0].reviewers).toContain('frontend-team')
    })

    it('github-pulls: handles null requested_reviewers', async () => {
      await setupConnected()
      mockOctokitInstance.rest.pulls.list.mockResolvedValue({
        data: [{
          number: 1, title: 'PR', state: 'open',
          user: { login: 'dev' },
          created_at: '', updated_at: '', merged_at: null,
          html_url: '', body: null,
          head: { ref: 'feat' }, base: { ref: 'main' },
          draft: false, additions: 0, deletions: 0, changed_files: 0,
          labels: [],
          requested_reviewers: null,
        }],
      })

      const handler = getHandler('integration:github-pulls')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; pulls: Array<{ reviewers: string[] }> }
      expect(result.success).toBe(true)
      expect(result.pulls[0].reviewers).toEqual([])
    })

    it('github-pull-detail: maps null user to "unknown" author', async () => {
      await setupConnected()
      const prDetail = {
        number: 42, title: 'PR', state: 'open',
        user: null, body: null,
        created_at: '', updated_at: '', merged_at: null,
        html_url: '',
        head: { ref: 'feat' }, base: { ref: 'main' },
        draft: false, additions: 0, deletions: 0, changed_files: 0,
        mergeable: null,
        labels: [],
      }
      mockOctokitInstance.rest.pulls.get.mockResolvedValue({ data: prDetail })
      mockOctokitInstance.rest.pulls.listFiles.mockResolvedValue({ data: [] })
      mockOctokitInstance.rest.pulls.listReviews.mockResolvedValue({ data: [] })

      const handler = getHandler('integration:github-pull-detail')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r', pullNumber: 42 }) as {
        success: boolean; pull: { author: string }
      }
      expect(result.success).toBe(true)
      expect(result.pull.author).toBe('unknown')
    })

    it('github-pull-detail: maps null patch to undefined', async () => {
      await setupConnected()
      const prDetail = {
        number: 42, title: 'PR', state: 'open',
        user: { login: 'dev' }, body: null,
        created_at: '', updated_at: '', merged_at: null,
        html_url: '',
        head: { ref: 'feat' }, base: { ref: 'main' },
        draft: false, additions: 0, deletions: 0, changed_files: 0,
        mergeable: true,
        labels: [],
      }
      mockOctokitInstance.rest.pulls.get.mockResolvedValue({ data: prDetail })
      mockOctokitInstance.rest.pulls.listFiles.mockResolvedValue({
        data: [{ filename: 'README.md', status: 'modified', additions: 1, deletions: 0, patch: undefined }],
      })
      mockOctokitInstance.rest.pulls.listReviews.mockResolvedValue({ data: [] })

      const handler = getHandler('integration:github-pull-detail')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r', pullNumber: 42 }) as {
        success: boolean; files: Array<{ patch: string | undefined }>
      }
      expect(result.success).toBe(true)
      expect(result.files[0].patch).toBeUndefined()
    })

    it('github-pull-detail: maps null reviewer user to "unknown"', async () => {
      await setupConnected()
      const prDetail = {
        number: 42, title: 'PR', state: 'open',
        user: { login: 'dev' }, body: null,
        created_at: '', updated_at: '', merged_at: null,
        html_url: '',
        head: { ref: 'feat' }, base: { ref: 'main' },
        draft: false, additions: 0, deletions: 0, changed_files: 0,
        mergeable: true,
        labels: [],
      }
      mockOctokitInstance.rest.pulls.get.mockResolvedValue({ data: prDetail })
      mockOctokitInstance.rest.pulls.listFiles.mockResolvedValue({ data: [] })
      mockOctokitInstance.rest.pulls.listReviews.mockResolvedValue({
        data: [{ user: null, state: 'COMMENTED', body: 'ok', submitted_at: '' }],
      })

      const handler = getHandler('integration:github-pull-detail')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r', pullNumber: 42 }) as {
        success: boolean; reviews: Array<{ user: string }>
      }
      expect(result.success).toBe(true)
      expect(result.reviews[0].user).toBe('unknown')
    })

    it('github-issues: maps null user to "unknown" author', async () => {
      await setupConnected()
      mockOctokitInstance.rest.issues.listForRepo.mockResolvedValue({
        data: [{
          number: 1, title: 'Bug', state: 'open',
          user: null,
          created_at: '', updated_at: '',
          body: null, html_url: '',
          labels: [],
          assignees: [],
          comments: 0,
          pull_request: undefined,
        }],
      })

      const handler = getHandler('integration:github-issues')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; issues: Array<{ author: string }> }
      expect(result.success).toBe(true)
      expect(result.issues[0].author).toBe('unknown')
    })

    it('github-issues: maps string labels correctly', async () => {
      await setupConnected()
      mockOctokitInstance.rest.issues.listForRepo.mockResolvedValue({
        data: [{
          number: 1, title: 'Bug', state: 'open',
          user: { login: 'reporter' },
          created_at: '', updated_at: '',
          body: null, html_url: '',
          labels: ['bug', 'priority'],
          assignees: [{ login: 'dev' }],
          comments: 0,
          pull_request: undefined,
        }],
      })

      const handler = getHandler('integration:github-issues')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; issues: Array<{ labels: string[] }> }
      expect(result.success).toBe(true)
      expect(result.issues[0].labels).toEqual(['bug', 'priority'])
    })

    it('github-issues: handles null assignees array', async () => {
      await setupConnected()
      mockOctokitInstance.rest.issues.listForRepo.mockResolvedValue({
        data: [{
          number: 1, title: 'Bug', state: 'open',
          user: { login: 'reporter' },
          created_at: '', updated_at: '',
          body: null, html_url: '',
          labels: [],
          assignees: null,
          comments: 0,
          pull_request: undefined,
        }],
      })

      const handler = getHandler('integration:github-issues')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; issues: Array<{ assignees: string[] }> }
      expect(result.success).toBe(true)
      expect(result.issues[0].assignees).toEqual([])
    })

    it('github-search: uses empty string username when github store username is missing', async () => {
      // Set up a state where github shows connected with no username
      storeData['github'] = { connected: true, username: '', connectedAt: 1000 }
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      vi.resetModules()
      const mod = await import('./integrationHandlers')
      vi.clearAllMocks()
      retrieveSecretMock.mockReturnValue('ghp_validtoken')
      mod.registerIntegrationHandlers(ipcMain)

      mockOctokitInstance.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { items: [] },
      })

      const handler = getHandler('integration:github-search')
      const result = await handler(mockEvent, { query: 'test' }) as { success: boolean }
      expect(result.success).toBe(true)
      // With empty username the query should still include 'author:'
      expect(mockOctokitInstance.rest.search.issuesAndPullRequests).toHaveBeenCalledWith(
        expect.objectContaining({ q: expect.stringContaining('author:') })
      )
    })

    it('github-search: code search with no text_matches returns empty snippet', async () => {
      await setupConnected()
      mockOctokitInstance.rest.search.code.mockResolvedValue({
        data: {
          items: [{
            path: 'src/util.ts',
            repository: { full_name: 'user/repo' },
            html_url: 'https://github.com/user/repo/blob/main/src/util.ts',
            text_matches: undefined,
          }],
        },
      })

      const handler = getHandler('integration:github-search')
      const result = await handler(mockEvent, { query: 'util', type: 'code' }) as { success: boolean; results: Array<{ snippet: string }> }
      expect(result.success).toBe(true)
      expect(result.results[0].snippet).toBe('')
    })

    it('github-repos: error with HTTP status surfaces additional log', async () => {
      await setupConnected()
      const httpError = Object.assign(new Error('Forbidden'), { status: 403 })
      mockOctokitInstance.rest.repos.listForAuthenticatedUser.mockRejectedValue(httpError)

      const handler = getHandler('integration:github-repos')
      const result = await handler(mockEvent) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toContain('Forbidden')
    })

    it('github-pull-detail: maps label with null name to empty string', async () => {
      await setupConnected()
      const prDetail = {
        number: 42, title: 'PR', state: 'open',
        user: { login: 'dev' }, body: null,
        created_at: '', updated_at: '', merged_at: null,
        html_url: '',
        head: { ref: 'feat' }, base: { ref: 'main' },
        draft: false, additions: 0, deletions: 0, changed_files: 0,
        mergeable: true,
        labels: [{ name: null }],
      }
      mockOctokitInstance.rest.pulls.get.mockResolvedValue({ data: prDetail })
      mockOctokitInstance.rest.pulls.listFiles.mockResolvedValue({ data: [] })
      mockOctokitInstance.rest.pulls.listReviews.mockResolvedValue({ data: [] })

      const handler = getHandler('integration:github-pull-detail')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r', pullNumber: 42 }) as {
        success: boolean; pull: { labels: string[] }
      }
      expect(result.success).toBe(true)
      expect(result.pull.labels).toContain('')
    })

    it('github-issues: maps label with null name to empty string', async () => {
      await setupConnected()
      mockOctokitInstance.rest.issues.listForRepo.mockResolvedValue({
        data: [{
          number: 1, title: 'Bug', state: 'open',
          user: { login: 'reporter' },
          created_at: '', updated_at: '',
          body: null, html_url: '',
          labels: [{ name: null }],
          assignees: [{ login: 'dev' }],
          comments: 0,
          pull_request: undefined,
        }],
      })

      const handler = getHandler('integration:github-issues')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean; issues: Array<{ labels: string[] }> }
      expect(result.success).toBe(true)
      expect(result.issues[0].labels).toContain('')
    })
  })
})
