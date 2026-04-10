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
        data: [{ id: 1, name: 'repo1', full_name: 'user/repo1', description: 'Test', private: false, html_url: 'https://github.com/user/repo1', pushed_at: '2024-01-01', language: 'TypeScript', default_branch: 'main' }],
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

  describe('integration:github-pulls', () => {
    it('returns error when not connected', async () => {
      const handler = getHandler('integration:github-pulls')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean }
      expect(result.success).toBe(false)
    })
  })

  describe('integration:github-issues', () => {
    it('returns error when not connected', async () => {
      const handler = getHandler('integration:github-issues')
      const result = await handler(mockEvent, { owner: 'o', repo: 'r' }) as { success: boolean }
      expect(result.success).toBe(false)
    })
  })

  describe('integration:github-search', () => {
    it('returns error when not connected', async () => {
      const handler = getHandler('integration:github-search')
      const result = await handler(mockEvent, { query: 'test' }) as { success: boolean }
      expect(result.success).toBe(false)
    })
  })
})
