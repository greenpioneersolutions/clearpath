import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { mockExecFile, mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}))

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}))

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

vi.mock('../utils/shellEnv', () => ({
  getScopedSpawnEnv: vi.fn().mockReturnValue({ PATH: '/usr/bin' }),
}))

vi.mock('../utils/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}))

import { ipcMain } from 'electron'

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerCallback = (event: unknown, args: unknown) => unknown

/**
 * Extract a registered ipcMain.handle callback by channel name.
 */
function getHandler(channel: string): HandlerCallback {
  const calls = vi.mocked(ipcMain.handle).mock.calls
  const match = calls.find((c) => c[0] === channel)
  if (!match) throw new Error(`No handler registered for channel: ${channel}`)
  return match[1] as HandlerCallback
}

const mockEvent = {} // IPC event object — not used by handlers

/**
 * Make mockExecFile invoke its callback with the given stdout.
 * promisify(execFile) calls execFile(cmd, args, opts, callback).
 */
function mockGitOutput(stdout: string): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: object, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout, stderr: '' })
    },
  )
}

function mockGitError(message: string): void {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: object, cb: (err: Error | null) => void) => {
      cb(new Error(message))
    },
  )
}

// We need to dynamically import after vi.resetModules() so that the module-level
// `promisify(execFile)` and `getScopedSpawnEnv()` calls pick up our mocks.
let registerGitHandlers: typeof import('./gitHandlers').registerGitHandlers
let checkRateLimit: typeof import('../utils/rateLimiter').checkRateLimit

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('gitHandlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(ipcMain.handle).mockClear()
    vi.resetModules()

    const mod = await import('./gitHandlers')
    registerGitHandlers = mod.registerGitHandlers

    const rlMod = await import('../utils/rateLimiter')
    checkRateLimit = rlMod.checkRateLimit

    registerGitHandlers(ipcMain)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('handler registration', () => {
    it('registers all expected channels', () => {
      const registered = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0])
      expect(registered).toEqual(expect.arrayContaining([
        'git:status',
        'git:log',
        'git:diff',
        'git:file-diff',
        'git:revert-file',
        'git:worktrees',
        'git:create-worktree',
        'git:remove-worktree',
        'git:branch-protection',
      ]))
      expect(registered).toHaveLength(9)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // git:status
  // ═══════════════════════════════════════════════════════════════════════════

  describe('git:status', () => {
    it('returns branch, ahead/behind, staged, modified, untracked', async () => {
      let callIndex = 0
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: object, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          if (callIndex === 0) {
            cb(null, { stdout: 'feature/test\n', stderr: '' })
          } else {
            cb(null, {
              stdout: '## feature/test...origin/feature/test [ahead 2, behind 1]\nM  src/app.ts\n M README.md\n?? new-file.txt\nA  added.ts\n',
              stderr: '',
            })
          }
          callIndex++
        },
      )

      const handler = getHandler('git:status')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual({
        branch: 'feature/test',
        ahead: 2,
        behind: 1,
        staged: [
          { file: 'src/app.ts', status: 'M' },
          { file: 'added.ts', status: 'A' },
        ],
        modified: [
          { file: 'README.md', status: 'M' },
        ],
        untracked: ['new-file.txt'],
      })
    })

    it('handles no upstream (no ahead/behind)', async () => {
      let callIndex = 0
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: object, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          if (callIndex === 0) {
            cb(null, { stdout: 'main\n', stderr: '' })
          } else {
            cb(null, { stdout: '## main\n', stderr: '' })
          }
          callIndex++
        },
      )

      const handler = getHandler('git:status')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual({
        branch: 'main',
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        untracked: [],
      })
    })

    it('propagates git errors', async () => {
      mockGitError('fatal: not a git repository')
      const handler = getHandler('git:status')
      await expect(handler(mockEvent, { cwd: '/not-a-repo' })).rejects.toThrow('fatal: not a git repository')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // git:log
  // ═══════════════════════════════════════════════════════════════════════════

  describe('git:log', () => {
    it('returns parsed commits with AI commit detection', async () => {
      mockGitOutput(
        'abc123|||abc1|||feat: add login|||Jane|||2024-01-15T10:00:00Z\n' +
        'def456|||def4|||fix: auth bug co-authored-by: Claude|||Bot|||2024-01-14T09:00:00Z\n',
      )

      const handler = getHandler('git:log')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual([
        {
          hash: 'abc123',
          shortHash: 'abc1',
          message: 'feat: add login',
          author: 'Jane',
          date: '2024-01-15T10:00:00Z',
          isAiCommit: false,
        },
        {
          hash: 'def456',
          shortHash: 'def4',
          message: 'fix: auth bug co-authored-by: Claude',
          author: 'Bot',
          date: '2024-01-14T09:00:00Z',
          isAiCommit: true,
        },
      ])
    })

    it('detects AI commits by co-authored-by copilot pattern', async () => {
      mockGitOutput(
        'aaa|||aaa|||update deps co-authored-by: copilot|||Dev|||2024-01-01T00:00:00Z\n',
      )

      const handler = getHandler('git:log')
      const result = await handler(mockEvent, { cwd: '/test/repo' }) as Array<{ isAiCommit: boolean }>

      expect(result[0].isAiCommit).toBe(true)
    })

    it('passes limit to git log', async () => {
      mockGitOutput('')
      const handler = getHandler('git:log')
      await handler(mockEvent, { cwd: '/test/repo', limit: 5 })

      const gitCall = mockExecFile.mock.calls[0]
      expect(gitCall[1]).toContain('--max-count=5')
    })

    it('defaults to limit of 20', async () => {
      mockGitOutput('')
      const handler = getHandler('git:log')
      await handler(mockEvent, { cwd: '/test/repo' })

      const gitCall = mockExecFile.mock.calls[0]
      expect(gitCall[1]).toContain('--max-count=20')
    })

    it('returns rate limit error when throttled', async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterMs: 5000 })

      const handler = getHandler('git:log')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual({ error: 'Rate limited' })
    })

    it('handles empty log (no commits)', async () => {
      mockGitOutput('')
      const handler = getHandler('git:log')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual([])
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // git:diff
  // ═══════════════════════════════════════════════════════════════════════════

  describe('git:diff', () => {
    it('returns diff with ref', async () => {
      mockGitOutput('diff --git a/file.ts b/file.ts\n+added line')

      const handler = getHandler('git:diff')
      const result = await handler(mockEvent, { cwd: '/test/repo', ref: 'HEAD~1' })

      expect(result).toBe('diff --git a/file.ts b/file.ts\n+added line')
    })

    it('returns staged diff when no ref and staged changes exist', async () => {
      mockGitOutput('staged diff output')
      const handler = getHandler('git:diff')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toBe('staged diff output')
    })

    it('falls back to unstaged diff when staged is empty', async () => {
      let callIndex = 0
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: object, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
          if (callIndex === 0) {
            // git diff --staged returns empty
            cb(null, { stdout: '', stderr: '' })
          } else {
            // git diff returns content
            cb(null, { stdout: 'unstaged diff output', stderr: '' })
          }
          callIndex++
        },
      )

      const handler = getHandler('git:diff')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toBe('unstaged diff output')
    })

    it('returns rate limit error when throttled', async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterMs: 3000 })

      const handler = getHandler('git:diff')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual({ error: 'Rate limited' })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // git:file-diff
  // ═══════════════════════════════════════════════════════════════════════════

  describe('git:file-diff', () => {
    it('returns diff for a specific file', async () => {
      mockGitOutput('file-level diff')
      const handler = getHandler('git:file-diff')
      const result = await handler(mockEvent, { cwd: '/test/repo', file: 'src/app.ts' })

      expect(result).toBe('file-level diff')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // git:revert-file
  // ═══════════════════════════════════════════════════════════════════════════

  describe('git:revert-file', () => {
    it('runs git checkout HEAD -- file', async () => {
      mockGitOutput('')
      const handler = getHandler('git:revert-file')
      await handler(mockEvent, { cwd: '/test/repo', file: 'src/bad.ts' })

      const gitCall = mockExecFile.mock.calls[0]
      expect(gitCall[0]).toBe('git')
      expect(gitCall[1]).toEqual(['checkout', 'HEAD', '--', 'src/bad.ts'])
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // git:worktrees
  // ═══════════════════════════════════════════════════════════════════════════

  describe('git:worktrees', () => {
    it('parses worktree list --porcelain output', async () => {
      mockGitOutput(
        'worktree /Users/dev/project\n' +
        'HEAD abc1234567890\n' +
        'branch refs/heads/main\n' +
        '\n' +
        'worktree /Users/dev/feature-worktree\n' +
        'HEAD def4567890123\n' +
        'branch refs/heads/feature/x\n',
      )

      const handler = getHandler('git:worktrees')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual([
        {
          path: '/Users/dev/project',
          commit: 'abc1234',
          branch: 'main',
          isMain: true,
        },
        {
          path: '/Users/dev/feature-worktree',
          commit: 'def4567',
          branch: 'feature/x',
          isMain: false,
        },
      ])
    })

    it('handles bare worktree', async () => {
      mockGitOutput(
        'worktree /Users/dev/project.git\n' +
        'HEAD abc1234567890\n' +
        'bare\n',
      )

      const handler = getHandler('git:worktrees')
      const result = await handler(mockEvent, { cwd: '/test/repo' }) as Array<{ isMain: boolean }>

      // First worktree is always set to isMain = true
      expect(result[0].isMain).toBe(true)
    })

    it('handles empty worktree list', async () => {
      mockGitOutput('')
      const handler = getHandler('git:worktrees')
      const result = await handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual([])
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // git:create-worktree
  // ═══════════════════════════════════════════════════════════════════════════

  describe('git:create-worktree', () => {
    it('creates a worktree and returns the path', async () => {
      mockGitOutput('')
      const handler = getHandler('git:create-worktree')
      const result = await handler(mockEvent, { cwd: '/Users/dev/project', branch: 'feature-x' })

      // Path should be ../feature-x-worktree relative to cwd
      expect(result).toBe('/Users/dev/feature-x-worktree')

      const gitCall = mockExecFile.mock.calls[0]
      expect(gitCall[1]).toEqual([
        'worktree', 'add', '-b', 'feature-x', '/Users/dev/feature-x-worktree',
      ])
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // git:remove-worktree
  // ═══════════════════════════════════════════════════════════════════════════

  describe('git:remove-worktree', () => {
    it('runs git worktree remove', async () => {
      mockGitOutput('')
      const handler = getHandler('git:remove-worktree')
      await handler(mockEvent, { cwd: '/test/repo', path: '/tmp/wt' })

      const gitCall = mockExecFile.mock.calls[0]
      expect(gitCall[1]).toEqual(['worktree', 'remove', '/tmp/wt'])
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // git:branch-protection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('git:branch-protection', () => {
    it('returns defaults when settings file does not exist', () => {
      mockExistsSync.mockReturnValue(false)

      const handler = getHandler('git:branch-protection')
      const result = handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual({ protected: ['main', 'master'] })
    })

    it('reads protectedBranches from settings file', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ protectedBranches: ['main', 'develop', 'release'] }),
      )

      const handler = getHandler('git:branch-protection')
      const result = handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual({ protected: ['main', 'develop', 'release'] })
    })

    it('returns defaults when settings file has invalid JSON', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('not-json{{{')

      const handler = getHandler('git:branch-protection')
      const result = handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual({ protected: ['main', 'master'] })
    })

    it('returns defaults when protectedBranches is not set', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ someOtherKey: true }))

      const handler = getHandler('git:branch-protection')
      const result = handler(mockEvent, { cwd: '/test/repo' })

      expect(result).toEqual({ protected: ['main', 'master'] })
    })
  })
})
