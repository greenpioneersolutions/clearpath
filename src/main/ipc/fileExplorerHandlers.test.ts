import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  readdirSyncMock, statSyncMock, watchMock, watchCloseMock,
  assertPathMock, getAllowedRootsMock, isSensitiveMock,
  checkRateLimitMock,
} = vi.hoisted(() => ({
  readdirSyncMock: vi.fn().mockReturnValue([]),
  statSyncMock: vi.fn().mockReturnValue({ isDirectory: () => false, size: 100, mtimeMs: 1000 }),
  watchMock: vi.fn(),
  watchCloseMock: vi.fn(),
  assertPathMock: vi.fn(),
  getAllowedRootsMock: vi.fn().mockReturnValue(['/workspace']),
  isSensitiveMock: vi.fn().mockReturnValue(false),
  checkRateLimitMock: vi.fn().mockReturnValue({ allowed: true }),
}))

vi.mock('fs', () => ({
  readdirSync: readdirSyncMock,
  statSync: statSyncMock,
  watch: watchMock,
}))

vi.mock('../utils/pathSecurity', () => ({
  assertPathWithinRoots: assertPathMock,
  getWorkspaceAllowedRoots: getAllowedRootsMock,
  isSensitiveSystemPath: isSensitiveMock,
}))

vi.mock('../utils/rateLimiter', () => ({
  checkRateLimit: checkRateLimitMock,
}))

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
const mockWebContents = {
  send: vi.fn(),
  isDestroyed: vi.fn().mockReturnValue(false),
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('fileExplorerHandlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    checkRateLimitMock.mockReturnValue({ allowed: true })
    assertPathMock.mockImplementation(() => undefined)
    isSensitiveMock.mockReturnValue(false)
    watchMock.mockReturnValue({ close: watchCloseMock })

    vi.resetModules()
    const mod = await import('./fileExplorerHandlers')
    mod.registerFileExplorerHandlers(ipcMain, () => mockWebContents as never)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('files:list')
    expect(channels).toContain('files:is-protected')
    expect(channels).toContain('files:watch')
    expect(channels).toContain('files:unwatch')
  })

  describe('files:list', () => {
    it('returns empty array for sensitive path', () => {
      isSensitiveMock.mockReturnValue(true)
      const handler = getHandler('files:list')
      const result = handler(mockEvent, { cwd: '/root/.ssh' })
      expect(result).toEqual([])
    })

    it('returns empty array when path validation fails', () => {
      assertPathMock.mockImplementation(() => { throw new Error('not allowed') })
      const handler = getHandler('files:list')
      const result = handler(mockEvent, { cwd: '/bad/path' })
      expect(result).toEqual([])
    })

    it('lists files in a directory', () => {
      readdirSyncMock.mockReturnValue(['file.ts', 'dir'])
      statSyncMock.mockImplementation((path: string) => {
        if (path.endsWith('dir')) return { isDirectory: () => true, size: 0, mtimeMs: 2000 }
        return { isDirectory: () => false, size: 500, mtimeMs: 1500 }
      })

      const handler = getHandler('files:list')
      const result = handler(mockEvent, { cwd: '/workspace/project' }) as Array<{ name: string }>
      expect(result.length).toBeGreaterThan(0)
    })

    it('skips dot files, node_modules, __pycache__', () => {
      readdirSyncMock.mockReturnValue(['.git', 'node_modules', '__pycache__', 'src'])
      statSyncMock.mockReturnValue({ isDirectory: () => true, size: 0, mtimeMs: 1000 })

      const handler = getHandler('files:list')
      const result = handler(mockEvent, { cwd: '/workspace/project', maxDepth: 0 }) as Array<{ name: string }>
      const names = result.map((f) => f.name)
      expect(names).not.toContain('.git')
      expect(names).not.toContain('node_modules')
      expect(names).not.toContain('__pycache__')
    })
  })

  describe('files:is-protected', () => {
    it('flags .env files as protected', () => {
      const handler = getHandler('files:is-protected')
      expect(handler(mockEvent, { path: '/project/.env' })).toBe(true)
      expect(handler(mockEvent, { path: '/project/.env.local' })).toBe(true)
    })

    it('flags .pem files as protected', () => {
      const handler = getHandler('files:is-protected')
      expect(handler(mockEvent, { path: '/project/cert.pem' })).toBe(true)
    })

    it('does not flag normal files', () => {
      const handler = getHandler('files:is-protected')
      expect(handler(mockEvent, { path: '/project/src/index.ts' })).toBe(false)
    })
  })

  describe('files:watch', () => {
    it('starts watching a directory', () => {
      const handler = getHandler('files:watch')
      const result = handler(mockEvent, { cwd: '/workspace/project' }) as { watching: boolean }
      expect(result.watching).toBe(true)
      expect(watchMock).toHaveBeenCalled()
    })

    it('returns already:true if already watching', () => {
      const handler = getHandler('files:watch')
      handler(mockEvent, { cwd: '/workspace/same' })
      const result = handler(mockEvent, { cwd: '/workspace/same' }) as { already: boolean }
      expect(result.already).toBe(true)
    })

    it('returns error when rate limited', () => {
      // Rate limit check happens BEFORE path validation
      checkRateLimitMock.mockReturnValue({ allowed: false })
      const handler = getHandler('files:watch')
      const result = handler(mockEvent, { cwd: '/workspace/new' }) as { error: string }
      expect(result.error).toContain('Too many file watchers')
    })

    it('returns error when path is outside allowed roots', () => {
      // assertPathWithinRoots throws → catch returns 'Directory not within allowed roots'
      assertPathMock.mockImplementation(() => { throw new Error('not within roots') })
      const handler = getHandler('files:watch')
      const result = handler(mockEvent, { cwd: '/etc/passwd' }) as { error: string }
      expect(result.error).toBe('Directory not within allowed roots')
    })

    it('returns error for sensitive directory within allowed roots', () => {
      // assertPathWithinRoots passes, isSensitiveSystemPath returns true
      isSensitiveMock.mockReturnValue(true)
      const handler = getHandler('files:watch')
      const result = handler(mockEvent, { cwd: '/workspace/.ssh' }) as { error: string }
      expect(result.error).toContain('sensitive')
    })
  })

  describe('files:unwatch', () => {
    it('stops watching and returns success', () => {
      // First start watching
      const watchHandler = getHandler('files:watch')
      const watchResult = watchHandler(mockEvent, { cwd: '/workspace/proj' }) as { watching?: boolean }
      expect(watchResult.watching).toBe(true)

      // Then unwatch
      const unwatchHandler = getHandler('files:unwatch')
      const result = unwatchHandler(mockEvent, { cwd: '/workspace/proj' }) as { success: boolean }
      expect(result.success).toBe(true)
      expect(watchCloseMock).toHaveBeenCalled()
    })

    it('returns success even if not watching (noop)', () => {
      const handler = getHandler('files:unwatch')
      const result = handler(mockEvent, { cwd: '/not/watching' }) as { success: boolean }
      expect(result.success).toBe(true)
    })
  })
})
