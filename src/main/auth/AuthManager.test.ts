import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  execFileMock,
  spawnMock,
  existsSyncMock,
  readFileSyncMock,
  homedirMock,
  resolveInShellMock,
  getScopedSpawnEnvMock,
  mockGet,
  mockSet,
  mockStoreConstructor,
} = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
  existsSyncMock: vi.fn().mockReturnValue(false),
  readFileSyncMock: vi.fn().mockReturnValue(''),
  homedirMock: vi.fn().mockReturnValue('/mock/home'),
  resolveInShellMock: vi.fn(),
  getScopedSpawnEnvMock: vi.fn().mockReturnValue({}),
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockStoreConstructor: vi.fn(),
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, execFile: execFileMock, spawn: spawnMock }
})

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  createWriteStream: vi.fn(),
  mkdtempSync: vi.fn().mockReturnValue('/tmp/mock-download'),
  unlinkSync: vi.fn(),
}))

vi.mock('os', () => ({
  homedir: homedirMock,
  tmpdir: vi.fn().mockReturnValue('/tmp'),
}))

vi.mock('https', () => ({
  request: vi.fn(),
}))

vi.mock('../utils/shellEnv', () => ({
  resolveInShell: resolveInShellMock,
  getScopedSpawnEnv: getScopedSpawnEnvMock,
  getSpawnEnv: vi.fn().mockReturnValue({}),
  initShellEnv: vi.fn().mockResolvedValue(undefined),
  setCustomEnvVars: vi.fn(),
}))

// SDK probes: stub the HTTP/SDK checks so the CLI-focused tests don't hit the
// network. Individual SDK-path tests can override these via mocked return values.
vi.mock('./SdkAuthProbe', () => ({
  canResolveClaudeSdk: vi.fn().mockReturnValue(false),
  getAnthropicApiKey: vi.fn(() => process.env['ANTHROPIC_API_KEY']?.trim() || undefined),
  getGitHubToken: vi.fn(
    () => (process.env['GH_TOKEN']?.trim() || process.env['GITHUB_TOKEN']?.trim()) || undefined,
  ),
  probeAnthropicKey: vi.fn().mockResolvedValue(false),
  probeGitHubToken: vi.fn().mockResolvedValue(false),
}))

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      constructor(...args: unknown[]) {
        mockStoreConstructor(...args)
      }
      get = mockGet
      set = mockSet
      has = vi.fn()
      delete = vi.fn()
    },
  }
})

// ── Dynamic import with resetModules ──────────────────────────────────────────

let AuthManager: typeof import('./AuthManager').AuthManager

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_STATUS = { installed: false, authenticated: false, checkedAt: 0 }

function defaultCacheState() {
  return {
    copilot: { ...EMPTY_STATUS },
    claude: { ...EMPTY_STATUS },
  }
}

/**
 * Makes execFileMock invoke callback with given stdout (like promisified execFile).
 * The AuthManager dynamically imports child_process and promisifies execFile,
 * so we need the mock to work with the callback signature.
 */
function mockExecFileSuccess(stdout: string) {
  execFileMock.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
      if (typeof cb === 'function') {
        cb(null, { stdout, stderr: '' })
      }
      // Return a child-process-like object for non-callback usage
      return { pid: 1234 }
    },
  )
}

function mockExecFileError(error: Error) {
  execFileMock.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
      if (typeof cb === 'function') {
        cb(error, { stdout: '', stderr: '' })
      }
      return { pid: 1234 }
    },
  )
}

/** Create a fake child process (EventEmitter with stdin/stdout/stderr). */
function createMockProcess(): ChildProcess & { _emitStdout: (data: string) => void; _emitStderr: (data: string) => void } {
  const proc = new EventEmitter() as ChildProcess & { _emitStdout: (data: string) => void; _emitStderr: (data: string) => void }
  proc.pid = 12345
  proc.kill = vi.fn().mockReturnValue(true)
  proc.stdin = new EventEmitter() as any
  ;(proc.stdin as any).write = vi.fn()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc._emitStdout = (data: string) => proc.stdout!.emit('data', Buffer.from(data))
  proc._emitStderr = (data: string) => proc.stderr!.emit('data', Buffer.from(data))
  return proc
}

function createMockWebContents() {
  return {
    send: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('AuthManager', () => {
  let mockWc: ReturnType<typeof createMockWebContents>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Default mocks
    mockGet.mockReturnValue(defaultCacheState())
    resolveInShellMock.mockResolvedValue(null)
    existsSyncMock.mockReturnValue(false)

    // Clear env vars
    delete process.env['GH_TOKEN']
    delete process.env['GITHUB_TOKEN']
    delete process.env['ANTHROPIC_API_KEY']

    mockWc = createMockWebContents()

    const mod = await import('./AuthManager')
    AuthManager = mod.AuthManager
  })

  afterEach(() => {
    delete process.env['GH_TOKEN']
    delete process.env['GITHUB_TOKEN']
    delete process.env['ANTHROPIC_API_KEY']
  })

  // ── getStatus() ─────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns cached auth state when both entries are fresh', async () => {
      const now = Date.now()
      const cliStatus = { installed: true, authenticated: true, checkedAt: now - 1000, tokenSource: 'env-var' as const }
      const sdkStatus = { installed: false, authenticated: false, checkedAt: 0 }
      const cached = {
        copilot: { ...cliStatus, cli: cliStatus, sdk: sdkStatus },
        claude: { ...cliStatus, cli: cliStatus, sdk: sdkStatus },
      }
      mockGet.mockReturnValue(cached)

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.getStatus()

      expect(result).toEqual(cached)
      // Should NOT have called resolveInShell since cache is fresh
      expect(resolveInShellMock).not.toHaveBeenCalled()
    })

    it('refreshes when forceRefresh is true even if cache is fresh', async () => {
      const now = Date.now()
      const cached = {
        copilot: { installed: true, authenticated: true, checkedAt: now - 1000, tokenSource: 'env-var' as const },
        claude: { installed: true, authenticated: true, checkedAt: now - 1000, tokenSource: 'env-var' as const },
      }
      mockGet.mockReturnValue(cached)

      const mgr = new AuthManager(() => mockWc as any)
      await mgr.getStatus(true)

      // Should have called resolveInShell since forceRefresh
      expect(resolveInShellMock).toHaveBeenCalled()
    })

    it('refreshes when copilot cache is stale (installed, past AUTH_CACHE_TTL)', async () => {
      const staleTime = Date.now() - 6 * 60 * 1000 // 6 min ago (past 5 min AUTH_CACHE_TTL)
      const cached = {
        copilot: { installed: true, authenticated: true, checkedAt: staleTime },
        claude: { installed: true, authenticated: true, checkedAt: Date.now() - 1000 },
      }
      mockGet.mockReturnValue(cached)

      const mgr = new AuthManager(() => mockWc as any)
      await mgr.getStatus()

      expect(resolveInShellMock).toHaveBeenCalled()
    })

    it('refreshes when claude cache is stale (not installed, past INSTALL_CACHE_TTL)', async () => {
      const staleTime = Date.now() - 11 * 60 * 1000 // 11 min ago (past 10 min INSTALL_CACHE_TTL)
      const cached = {
        copilot: { installed: true, authenticated: true, checkedAt: Date.now() - 1000 },
        claude: { installed: false, authenticated: false, checkedAt: staleTime },
      }
      mockGet.mockReturnValue(cached)

      const mgr = new AuthManager(() => mockWc as any)
      await mgr.getStatus()

      expect(resolveInShellMock).toHaveBeenCalled()
    })

    it('uses INSTALL_CACHE_TTL (10 min) when CLI is not installed', async () => {
      const nineMinAgo = Date.now() - 9 * 60 * 1000 // 9 min ago (within 10 min INSTALL_CACHE_TTL)
      const cached = {
        copilot: { installed: false, authenticated: false, checkedAt: nineMinAgo },
        claude: { installed: false, authenticated: false, checkedAt: nineMinAgo },
      }
      mockGet.mockReturnValue(cached)

      const mgr = new AuthManager(() => mockWc as any)
      await mgr.getStatus()

      // 9 min is within 10 min INSTALL_CACHE_TTL, so no refresh
      expect(resolveInShellMock).not.toHaveBeenCalled()
    })

    it('refreshes when checkedAt is 0 (never checked)', async () => {
      mockGet.mockReturnValue(defaultCacheState())

      const mgr = new AuthManager(() => mockWc as any)
      await mgr.getStatus()

      expect(resolveInShellMock).toHaveBeenCalled()
    })
  })

  // ── refresh() ───────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    it('stores results in electron-store and sends IPC', async () => {
      resolveInShellMock.mockResolvedValue(null)

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(false)
      expect(result.claude.installed).toBe(false)
      expect(mockSet).toHaveBeenCalledWith('authCache', result)
      expect(mockWc.send).toHaveBeenCalledWith('auth:status-changed', result)
    })

    it('skips IPC when webContents is null', async () => {
      resolveInShellMock.mockResolvedValue(null)

      const mgr = new AuthManager(() => null)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(false)
      expect(mockWc.send).not.toHaveBeenCalled()
    })

    it('skips IPC when webContents is destroyed', async () => {
      resolveInShellMock.mockResolvedValue(null)
      mockWc.isDestroyed.mockReturnValue(true)

      const mgr = new AuthManager(() => mockWc as any)
      await mgr.refresh()

      expect(mockWc.send).not.toHaveBeenCalled()
    })
  })

  // ── checkCopilot() ──────────────────────────────────────────────────────────

  describe('checkCopilot (via refresh)', () => {
    it('returns not installed when binary is not found', async () => {
      resolveInShellMock.mockResolvedValue(null) // copilot not found

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(false)
      expect(result.copilot.authenticated).toBe(false)
      expect(result.copilot.checkedAt).toBeGreaterThan(0)
    })

    it('detects copilot installed but not authenticated', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'copilot') return '/usr/local/bin/copilot'
        return null
      })
      mockExecFileSuccess('1.2.3\n')

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(true)
      expect(result.copilot.authenticated).toBe(false)
      expect(result.copilot.binaryPath).toBe('/usr/local/bin/copilot')
      expect(result.copilot.version).toBe('1.2.3')
    })

    it('detects copilot auth via GH_TOKEN env var', async () => {
      process.env['GH_TOKEN'] = 'ghp_testtoken123'
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'copilot') return '/usr/local/bin/copilot'
        return null
      })
      mockExecFileSuccess('1.2.3\n')

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(true)
      expect(result.copilot.authenticated).toBe(true)
      expect(result.copilot.tokenSource).toBe('env-var')
    })

    it('detects copilot auth via GITHUB_TOKEN env var', async () => {
      process.env['GITHUB_TOKEN'] = 'ghp_testtoken456'
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'copilot') return '/usr/local/bin/copilot'
        return null
      })
      mockExecFileSuccess('1.2.3\n')

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(true)
      expect(result.copilot.authenticated).toBe(true)
      expect(result.copilot.tokenSource).toBe('env-var')
    })

    it('detects copilot auth via config file with logged_in_users', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'copilot') return '/usr/local/bin/copilot'
        return null
      })
      mockExecFileSuccess('1.2.3\n')
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.copilot/config.json') return true
        return false
      })
      readFileSyncMock.mockReturnValue(JSON.stringify({
        logged_in_users: [{ username: 'testuser' }],
      }))

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(true)
      expect(result.copilot.authenticated).toBe(true)
      expect(result.copilot.tokenSource).toBe('config-file')
    })

    it('treats empty logged_in_users array as unauthenticated', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'copilot') return '/usr/local/bin/copilot'
        return null
      })
      mockExecFileSuccess('1.2.3\n')
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.copilot/config.json') return true
        return false
      })
      readFileSyncMock.mockReturnValue(JSON.stringify({ logged_in_users: [] }))

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(true)
      expect(result.copilot.authenticated).toBe(false)
    })

    it('treats malformed config JSON as unauthenticated', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'copilot') return '/usr/local/bin/copilot'
        return null
      })
      mockExecFileSuccess('1.2.3\n')
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.copilot/config.json') return true
        return false
      })
      readFileSyncMock.mockReturnValue('not valid json{{{')

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(true)
      expect(result.copilot.authenticated).toBe(false)
    })

    it('env-var auth takes precedence over config file', async () => {
      process.env['GH_TOKEN'] = 'ghp_testtoken'
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'copilot') return '/usr/local/bin/copilot'
        return null
      })
      mockExecFileSuccess('1.2.3\n')
      // Config file also exists
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.copilot/config.json') return true
        return false
      })
      readFileSyncMock.mockReturnValue(JSON.stringify({
        logged_in_users: [{ username: 'testuser' }],
      }))

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.tokenSource).toBe('env-var')
    })

    it('handles version check failure gracefully', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'copilot') return '/usr/local/bin/copilot'
        return null
      })
      mockExecFileError(new Error('ENOENT'))

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(true)
      expect(result.copilot.version).toBeUndefined()
    })
  })

  // ── checkClaude() ───────────────────────────────────────────────────────────

  describe('checkClaude (via refresh)', () => {
    it('returns not installed when binary is not found', async () => {
      resolveInShellMock.mockResolvedValue(null) // claude not found

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.installed).toBe(false)
      expect(result.claude.authenticated).toBe(false)
      expect(result.claude.checkedAt).toBeGreaterThan(0)
    })

    it('detects claude installed but not authenticated', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      mockExecFileSuccess('2.0.0\n')

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.installed).toBe(true)
      expect(result.claude.authenticated).toBe(false)
      expect(result.claude.binaryPath).toBe('/usr/local/bin/claude')
      expect(result.claude.version).toBe('2.0.0')
    })

    it('detects claude auth via ANTHROPIC_API_KEY env var', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test123'
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      mockExecFileSuccess('2.0.0\n')

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.installed).toBe(true)
      expect(result.claude.authenticated).toBe(true)
      expect(result.claude.tokenSource).toBe('env-var')
    })

    it('detects claude auth via "claude auth status" command output (logged in)', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      // First call: --version, second call: auth status
      let callCount = 0
      execFileMock.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          callCount++
          if (typeof cb === 'function') {
            if (Array.isArray(args) && args.includes('auth')) {
              cb(null, { stdout: 'You are logged in as user@test.com', stderr: '' })
            } else {
              cb(null, { stdout: '2.0.0\n', stderr: '' })
            }
          }
          return { pid: 1234 }
        },
      )

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.installed).toBe(true)
      expect(result.claude.authenticated).toBe(true)
      expect(result.claude.tokenSource).toBe('auth-status')
    })

    it('detects claude auth via "authenticated" keyword in auth status', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      execFileMock.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          if (typeof cb === 'function') {
            if (Array.isArray(args) && args.includes('auth')) {
              cb(null, { stdout: 'Status: authenticated', stderr: '' })
            } else {
              cb(null, { stdout: '2.0.0\n', stderr: '' })
            }
          }
          return { pid: 1234 }
        },
      )

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.installed).toBe(true)
      expect(result.claude.authenticated).toBe(true)
      expect(result.claude.tokenSource).toBe('auth-status')
    })

    it('detects claude auth via email pattern in auth status', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      execFileMock.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          if (typeof cb === 'function') {
            if (Array.isArray(args) && args.includes('auth')) {
              cb(null, { stdout: 'user@example.com', stderr: '' })
            } else {
              cb(null, { stdout: '2.0.0\n', stderr: '' })
            }
          }
          return { pid: 1234 }
        },
      )

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.authenticated).toBe(true)
      expect(result.claude.tokenSource).toBe('auth-status')
    })

    it('falls back to config files when auth status fails', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      execFileMock.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          if (typeof cb === 'function') {
            if (Array.isArray(args) && args.includes('auth')) {
              cb(new Error('auth check failed'), { stdout: '', stderr: '' })
            } else {
              cb(null, { stdout: '2.0.0\n', stderr: '' })
            }
          }
          return { pid: 1234 }
        },
      )
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.claude/.credentials.json') return true
        return false
      })

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.authenticated).toBe(true)
      expect(result.claude.tokenSource).toBe('config-file')
    })

    it('detects claude auth via auth.json config file', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      // auth status returns nothing useful (avoid 'logged in' substring match)
      execFileMock.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          if (typeof cb === 'function') {
            if (Array.isArray(args) && args.includes('auth')) {
              cb(null, { stdout: 'no session found', stderr: '' })
            } else {
              cb(null, { stdout: '2.0.0\n', stderr: '' })
            }
          }
          return { pid: 1234 }
        },
      )
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.claude/auth.json') return true
        return false
      })

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.authenticated).toBe(true)
      expect(result.claude.tokenSource).toBe('config-file')
    })

    it('detects claude auth via credentials.json config file', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      execFileMock.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          if (typeof cb === 'function') {
            if (Array.isArray(args) && args.includes('auth')) {
              cb(null, { stdout: 'no session found', stderr: '' })
            } else {
              cb(null, { stdout: '2.0.0\n', stderr: '' })
            }
          }
          return { pid: 1234 }
        },
      )
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.claude/credentials.json') return true
        return false
      })

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.authenticated).toBe(true)
      expect(result.claude.tokenSource).toBe('config-file')
    })

    it('env-var auth takes precedence over auth status and config files for claude', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      mockExecFileSuccess('2.0.0\n')
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/mock/home/.claude/.credentials.json') return true
        return false
      })

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.tokenSource).toBe('env-var')
    })

    it('handles version check failure gracefully for claude', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      mockExecFileError(new Error('ENOENT'))

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.installed).toBe(true)
      expect(result.claude.version).toBeUndefined()
    })

    it('strips ANSI codes from auth status output', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      execFileMock.mockImplementation(
        (_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          if (typeof cb === 'function') {
            if (Array.isArray(args) && args.includes('auth')) {
              // Output with ANSI escape codes
              cb(null, { stdout: '\x1b[32mYou are logged in\x1b[0m', stderr: '' })
            } else {
              cb(null, { stdout: '2.0.0\n', stderr: '' })
            }
          }
          return { pid: 1234 }
        },
      )

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.claude.authenticated).toBe(true)
      expect(result.claude.tokenSource).toBe('auth-status')
    })
  })

  // ── Both CLIs checked in parallel ───────────────────────────────────────────

  describe('parallel checks', () => {
    it('checks both copilot and claude simultaneously', async () => {
      resolveInShellMock.mockImplementation(async (name: string) => {
        if (name === 'copilot') return '/usr/local/bin/copilot'
        if (name === 'claude') return '/usr/local/bin/claude'
        return null
      })
      mockExecFileSuccess('1.0.0\n')

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.refresh()

      expect(result.copilot.installed).toBe(true)
      expect(result.claude.installed).toBe(true)
      // resolveInShell called twice: once for copilot, once for claude
      expect(resolveInShellMock).toHaveBeenCalledWith('copilot')
      expect(resolveInShellMock).toHaveBeenCalledWith('claude')
    })
  })

  // ── startLogin() ────────────────────────────────────────────────────────────

  describe('startLogin()', () => {
    it('spawns copilot login process and streams output', async () => {
      const proc = createMockProcess()
      spawnMock.mockReturnValue(proc)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/copilot')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('copilot')

      // Allow the async resolveInShell promise to resolve
      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalled()
      })

      expect(spawnMock).toHaveBeenCalledWith(
        '/usr/local/bin/copilot',
        ['--no-experimental'],
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
      )

      // Simulate output
      proc._emitStdout('Please authenticate at https://github.com/login\n')

      // Check the output was forwarded stripped of ANSI
      expect(mockWc.send).toHaveBeenCalledWith('auth:login-output', {
        cli: 'copilot',
        line: expect.any(String),
      })
    })

    it('spawns claude login process', async () => {
      const proc = createMockProcess()
      spawnMock.mockReturnValue(proc)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/claude')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('claude')

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalled()
      })

      expect(spawnMock).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        ['auth', 'login'],
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
      )
    })

    it('emits login-complete on process exit with success', async () => {
      const proc = createMockProcess()
      spawnMock.mockReturnValue(proc)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/copilot')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('copilot')

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalled()
      })

      proc.emit('exit', 0)

      expect(mockWc.send).toHaveBeenCalledWith('auth:login-complete', {
        cli: 'copilot',
        success: true,
      })
    })

    it('emits login-complete with success=false on non-zero exit', async () => {
      const proc = createMockProcess()
      spawnMock.mockReturnValue(proc)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/claude')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('claude')

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalled()
      })

      proc.emit('exit', 1)

      expect(mockWc.send).toHaveBeenCalledWith('auth:login-complete', {
        cli: 'claude',
        success: false,
      })
    })

    it('emits login-complete on process error', async () => {
      const proc = createMockProcess()
      spawnMock.mockReturnValue(proc)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/copilot')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('copilot')

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalled()
      })

      proc.emit('error', new Error('spawn failed'))

      expect(mockWc.send).toHaveBeenCalledWith('auth:login-output', {
        cli: 'copilot',
        line: 'Process error: spawn failed',
      })
      expect(mockWc.send).toHaveBeenCalledWith('auth:login-complete', {
        cli: 'copilot',
        success: false,
        error: 'spawn failed',
      })
    })

    it('reports error when copilot binary not found during login', async () => {
      resolveInShellMock.mockResolvedValue(null)

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('copilot')

      await vi.waitFor(() => {
        expect(mockWc.send).toHaveBeenCalledWith('auth:login-output', {
          cli: 'copilot',
          line: expect.stringContaining('not found'),
        })
      })

      expect(mockWc.send).toHaveBeenCalledWith('auth:login-complete', {
        cli: 'copilot',
        success: false,
        error: 'binary not found',
      })
    })

    it('reports error when claude binary not found during login', async () => {
      resolveInShellMock.mockResolvedValue(null)

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('claude')

      await vi.waitFor(() => {
        expect(mockWc.send).toHaveBeenCalledWith('auth:login-output', {
          cli: 'claude',
          line: expect.stringContaining('not found'),
        })
      })

      expect(mockWc.send).toHaveBeenCalledWith('auth:login-complete', {
        cli: 'claude',
        success: false,
        error: 'binary not found',
      })
    })

    it('does not send IPC when webContents is destroyed during login output', async () => {
      const proc = createMockProcess()
      spawnMock.mockReturnValue(proc)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/copilot')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('copilot')

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalled()
      })

      // Mark webContents as destroyed before stdout emits
      mockWc.isDestroyed.mockReturnValue(true)
      proc._emitStdout('some output\n')

      // The /login emit before we changed isDestroyed may have sent, but
      // after destruction, no login-output should be sent with 'some output'
      const loginOutputCalls = mockWc.send.mock.calls.filter(
        (call: unknown[]) => call[0] === 'auth:login-output' && typeof call[1] === 'object' && (call[1] as any).line === 'some output',
      )
      expect(loginOutputCalls).toHaveLength(0)
    })

    it('sends /login command to copilot stdin', async () => {
      const proc = createMockProcess()
      spawnMock.mockReturnValue(proc)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/copilot')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('copilot')

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalled()
      })

      // Trigger stdout to force sendLogin
      proc._emitStdout('Ready\n')

      expect((proc.stdin as any).write).toHaveBeenCalledWith('/login\n')
    })

    it('streams stderr output from login process', async () => {
      const proc = createMockProcess()
      spawnMock.mockReturnValue(proc)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/claude')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('claude')

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalled()
      })

      proc._emitStderr('Warning: token expiring soon\n')

      expect(mockWc.send).toHaveBeenCalledWith('auth:login-output', {
        cli: 'claude',
        line: 'Warning: token expiring soon',
      })
    })
  })

  // ── cancelLogin() ──────────────────────────────────────────────────────────

  describe('cancelLogin()', () => {
    it('kills an active login process', async () => {
      const proc = createMockProcess()
      spawnMock.mockReturnValue(proc)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/copilot')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('copilot')

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalled()
      })

      mgr.cancelLogin()

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('does nothing when no active login', () => {
      const mgr = new AuthManager(() => mockWc as any)
      // Should not throw
      mgr.cancelLogin()
    })

    it('startLogin cancels previous login before starting new one', async () => {
      const proc1 = createMockProcess()
      const proc2 = createMockProcess()
      spawnMock.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2)
      resolveInShellMock.mockResolvedValue('/usr/local/bin/copilot')

      const mgr = new AuthManager(() => mockWc as any)
      mgr.startLogin('copilot')

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalledTimes(1)
      })

      // Start another login — should cancel the first
      mgr.startLogin('copilot')

      expect(proc1.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })

  // ── Cache TTL behavior ──────────────────────────────────────────────────────

  describe('cache TTL behavior', () => {
    it('uses 5 min TTL for installed CLIs (AUTH_CACHE_TTL)', async () => {
      const fourMinAgo = Date.now() - 4 * 60 * 1000
      const cliStatus = { installed: true, authenticated: true, checkedAt: fourMinAgo }
      const sdkStatus = { installed: false, authenticated: false, checkedAt: 0 }
      const cached = {
        copilot: { ...cliStatus, cli: cliStatus, sdk: sdkStatus },
        claude: { ...cliStatus, cli: cliStatus, sdk: sdkStatus },
      }
      mockGet.mockReturnValue(cached)

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.getStatus()

      // 4 min is within 5 min AUTH_CACHE_TTL, should return cache
      expect(result).toEqual(cached)
      expect(resolveInShellMock).not.toHaveBeenCalled()
    })

    it('uses 10 min TTL for not-installed CLIs (INSTALL_CACHE_TTL)', async () => {
      const eightMinAgo = Date.now() - 8 * 60 * 1000
      const cliStatus = { installed: false, authenticated: false, checkedAt: eightMinAgo }
      const sdkStatus = { installed: false, authenticated: false, checkedAt: 0 }
      const cached = {
        copilot: { ...cliStatus, cli: cliStatus, sdk: sdkStatus },
        claude: { ...cliStatus, cli: cliStatus, sdk: sdkStatus },
      }
      mockGet.mockReturnValue(cached)

      const mgr = new AuthManager(() => mockWc as any)
      const result = await mgr.getStatus()

      // 8 min is within 10 min INSTALL_CACHE_TTL
      expect(result).toEqual(cached)
      expect(resolveInShellMock).not.toHaveBeenCalled()
    })

    it('refreshes after AUTH_CACHE_TTL expires for installed CLI', async () => {
      const sixMinAgo = Date.now() - 6 * 60 * 1000
      const cached = {
        copilot: { installed: true, authenticated: true, checkedAt: sixMinAgo },
        claude: { installed: true, authenticated: true, checkedAt: Date.now() },
      }
      mockGet.mockReturnValue(cached)

      const mgr = new AuthManager(() => mockWc as any)
      await mgr.getStatus()

      // 6 min > 5 min AUTH_CACHE_TTL, should refresh
      expect(resolveInShellMock).toHaveBeenCalled()
    })

    it('refreshes after INSTALL_CACHE_TTL expires for not-installed CLI', async () => {
      const elevenMinAgo = Date.now() - 11 * 60 * 1000
      const cached = {
        copilot: { installed: false, authenticated: false, checkedAt: elevenMinAgo },
        claude: { installed: true, authenticated: true, checkedAt: Date.now() },
      }
      mockGet.mockReturnValue(cached)

      const mgr = new AuthManager(() => mockWc as any)
      await mgr.getStatus()

      // 11 min > 10 min INSTALL_CACHE_TTL, should refresh
      expect(resolveInShellMock).toHaveBeenCalled()
    })
  })

  // ── classifyInstallError() ──────────────────────────────────────────────────

  describe('classifyInstallError()', () => {
    it('classifies EACCES permission errors', async () => {
      const mgr = new AuthManager(() => mockWc as any)
      const err = mgr.classifyInstallError('npm ERR! EACCES: permission denied, open \'/usr/local/lib/node_modules\'')
      expect(err.code).toBe('EACCES')
      expect(err.hint).toMatch(/permission|administrator|nvm|homebrew/i)
    })

    it('classifies "permission denied" as EACCES', async () => {
      const mgr = new AuthManager(() => mockWc as any)
      const err = mgr.classifyInstallError('', 'EPERM: operation not permitted')
      expect(err.code).toBe('EACCES')
    })

    it('classifies ENOTFOUND as NETWORK', async () => {
      const mgr = new AuthManager(() => mockWc as any)
      const err = mgr.classifyInstallError('npm ERR! network', 'ENOTFOUND registry.npmjs.org')
      expect(err.code).toBe('NETWORK')
      expect(err.hint).toMatch(/internet|connection|proxy/i)
    })

    it('classifies ETIMEDOUT as NETWORK', async () => {
      const mgr = new AuthManager(() => mockWc as any)
      const err = mgr.classifyInstallError('ETIMEDOUT', '')
      expect(err.code).toBe('NETWORK')
    })

    it('classifies ECONNRESET as NETWORK', async () => {
      const mgr = new AuthManager(() => mockWc as any)
      const err = mgr.classifyInstallError('', 'socket hang up ECONNRESET')
      expect(err.code).toBe('NETWORK')
    })

    it('classifies "unsupported engine" as NODE_MISSING', async () => {
      const mgr = new AuthManager(() => mockWc as any)
      const err = mgr.classifyInstallError('', 'npm WARN EBADENGINE Unsupported engine')
      expect(err.code).toBe('NODE_MISSING')
      expect(err.hint).toMatch(/Node\.js/i)
    })

    it('classifies ENOENT for npm as NODE_MISSING', async () => {
      const mgr = new AuthManager(() => mockWc as any)
      const err = mgr.classifyInstallError('spawn npm ENOENT', '')
      expect(err.code).toBe('NODE_MISSING')
    })

    it('returns UNKNOWN for unrecognized output', async () => {
      const mgr = new AuthManager(() => mockWc as any)
      const err = mgr.classifyInstallError('some weird error nobody has seen', '')
      expect(err.code).toBe('UNKNOWN')
      expect(err.hint).toBeTruthy()
      expect(err.message).toBeTruthy()
    })

    it('every classification has a non-empty hint + message', async () => {
      const mgr = new AuthManager(() => mockWc as any)
      const cases = [
        'EACCES',
        'ENOTFOUND',
        'ETIMEDOUT',
        'unsupported engine',
        'random unknown thing',
      ]
      for (const text of cases) {
        const err = mgr.classifyInstallError(text, '')
        expect(err.hint.length).toBeGreaterThan(0)
        expect(err.message.length).toBeGreaterThan(0)
      }
    })
  })

  // ── openExternalUrl() ───────────────────────────────────────────────────────

  describe('openExternalUrl()', () => {
    it('accepts https:// URLs', () => {
      const mgr = new AuthManager(() => mockWc as any)
      expect(mgr.openExternalUrl('https://github.com/login/device')).toBe(true)
    })

    it('rejects http:// URLs', () => {
      const mgr = new AuthManager(() => mockWc as any)
      expect(mgr.openExternalUrl('http://example.com')).toBe(false)
    })

    it('rejects file:// URLs', () => {
      const mgr = new AuthManager(() => mockWc as any)
      expect(mgr.openExternalUrl('file:///etc/passwd')).toBe(false)
    })

    it('rejects javascript: URLs', () => {
      const mgr = new AuthManager(() => mockWc as any)
      expect(mgr.openExternalUrl('javascript:alert(1)')).toBe(false)
    })

    it('rejects non-string input', () => {
      const mgr = new AuthManager(() => mockWc as any)
      expect(mgr.openExternalUrl(null as unknown as string)).toBe(false)
      expect(mgr.openExternalUrl(undefined as unknown as string)).toBe(false)
    })
  })

  // ── electron-store usage ────────────────────────────────────────────────────

  describe('electron-store', () => {
    it('lazily creates the store on first access', async () => {
      resolveInShellMock.mockResolvedValue(null)

      const mgr = new AuthManager(() => mockWc as any)

      // Store constructor not called yet
      expect(mockStoreConstructor).not.toHaveBeenCalled()

      await mgr.getStatus()

      // Now store should be created
      expect(mockStoreConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'clear-path-auth',
        }),
      )
    })
  })
})
