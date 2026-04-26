import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockIpcMain() {
  return {
    handle: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
  }
}

function getHandler(ipcMain: ReturnType<typeof createMockIpcMain>, channel: string) {
  const call = ipcMain.handle.mock.calls.find(
    (c: unknown[]) => c[0] === channel,
  )
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

interface MockAuthManager {
  getStatus: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
  startLogin: ReturnType<typeof vi.fn>
  cancelLogin: ReturnType<typeof vi.fn>
  checkNode: ReturnType<typeof vi.fn>
  installCopilot: ReturnType<typeof vi.fn>
  installClaude: ReturnType<typeof vi.fn>
  installNodeManaged: ReturnType<typeof vi.fn>
  cancelInstall: ReturnType<typeof vi.fn>
  openExternalUrl: ReturnType<typeof vi.fn>
}

function createMockAuthManager(): MockAuthManager {
  return {
    getStatus: vi.fn().mockResolvedValue({
      copilot: { installed: true, authenticated: true, checkedAt: Date.now() },
      claude: { installed: false, authenticated: false, checkedAt: Date.now() },
    }),
    refresh: vi.fn().mockResolvedValue({
      copilot: { installed: true, authenticated: true, checkedAt: Date.now() },
      claude: { installed: true, authenticated: false, checkedAt: Date.now() },
    }),
    startLogin: vi.fn(),
    cancelLogin: vi.fn(),
    checkNode: vi.fn().mockResolvedValue({
      installed: true,
      version: '22.10.0',
      satisfies22: true,
      platform: 'darwin',
    }),
    installCopilot: vi.fn(),
    installClaude: vi.fn(),
    installNodeManaged: vi.fn(),
    cancelInstall: vi.fn(),
    openExternalUrl: vi.fn().mockReturnValue(true),
  }
}

const mockEvent = {} as unknown

// ── Tests ───────────────────────────────────────────────────────────────────

describe('authHandlers', () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>
  let authManager: MockAuthManager

  beforeEach(async () => {
    vi.clearAllMocks()
    ipcMain = createMockIpcMain()
    authManager = createMockAuthManager()

    const { registerAuthHandlers } = await import('./authHandlers')
    registerAuthHandlers(ipcMain as never, authManager as never)
  })

  // ── Registration ──────────────────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC channels', () => {
      const registeredChannels = ipcMain.handle.mock.calls.map(
        (c: unknown[]) => c[0],
      )
      expect(registeredChannels).toContain('auth:get-status')
      expect(registeredChannels).toContain('auth:refresh')
      expect(registeredChannels).toContain('auth:login-start')
      expect(registeredChannels).toContain('auth:login-cancel')
      expect(registeredChannels).toContain('auth:check-node')
      expect(registeredChannels).toContain('auth:install-start')
      expect(registeredChannels).toContain('auth:install-node-managed')
      expect(registeredChannels).toContain('auth:install-cancel')
      expect(registeredChannels).toContain('auth:open-external')
    })

    it('registers exactly 9 handlers', () => {
      expect(ipcMain.handle).toHaveBeenCalledTimes(9)
    })
  })

  // ── auth:get-status ───────────────────────────────────────────────────────

  describe('auth:get-status', () => {
    it('delegates to authManager.getStatus()', async () => {
      const expectedStatus = {
        copilot: { installed: true, authenticated: true, checkedAt: 1000 },
        claude: { installed: false, authenticated: false, checkedAt: 1000 },
      }
      authManager.getStatus.mockResolvedValue(expectedStatus)

      const handler = getHandler(ipcMain, 'auth:get-status')
      const result = await handler()

      expect(authManager.getStatus).toHaveBeenCalledTimes(1)
      expect(result).toEqual(expectedStatus)
    })

    it('propagates errors from authManager', async () => {
      authManager.getStatus.mockRejectedValue(new Error('check failed'))

      const handler = getHandler(ipcMain, 'auth:get-status')
      await expect(handler()).rejects.toThrow('check failed')
    })
  })

  // ── auth:refresh ──────────────────────────────────────────────────────────

  describe('auth:refresh', () => {
    it('delegates to authManager.refresh()', async () => {
      const refreshedStatus = {
        copilot: { installed: true, authenticated: true, checkedAt: 2000 },
        claude: { installed: true, authenticated: true, checkedAt: 2000 },
      }
      authManager.refresh.mockResolvedValue(refreshedStatus)

      const handler = getHandler(ipcMain, 'auth:refresh')
      const result = await handler()

      expect(authManager.refresh).toHaveBeenCalledTimes(1)
      expect(result).toEqual(refreshedStatus)
    })

    it('propagates errors from refresh', async () => {
      authManager.refresh.mockRejectedValue(new Error('refresh failed'))

      const handler = getHandler(ipcMain, 'auth:refresh')
      await expect(handler()).rejects.toThrow('refresh failed')
    })
  })

  // ── auth:login-start ─────────────────────────────────────────────────────

  describe('auth:login-start', () => {
    it('starts copilot login flow', () => {
      const handler = getHandler(ipcMain, 'auth:login-start')
      handler(mockEvent, { cli: 'copilot' })

      expect(authManager.startLogin).toHaveBeenCalledTimes(1)
      expect(authManager.startLogin).toHaveBeenCalledWith('copilot')
    })

    it('starts claude login flow', () => {
      const handler = getHandler(ipcMain, 'auth:login-start')
      handler(mockEvent, { cli: 'claude' })

      expect(authManager.startLogin).toHaveBeenCalledTimes(1)
      expect(authManager.startLogin).toHaveBeenCalledWith('claude')
    })

    // BUG NOTE: The handler does not return a value (no return statement before
    // authManager.startLogin(cli)), so the IPC response is always undefined.
    // If startLogin is async and throws, the error is silently swallowed because
    // the handler is not awaiting it. However, in practice the AuthManager
    // handles errors internally and pushes results via auth:login-complete events.
    it('returns undefined (fire-and-forget pattern)', () => {
      const handler = getHandler(ipcMain, 'auth:login-start')
      const result = handler(mockEvent, { cli: 'copilot' })

      expect(result).toBeUndefined()
    })
  })

  // ── auth:login-cancel ─────────────────────────────────────────────────────

  describe('auth:login-cancel', () => {
    it('delegates to authManager.cancelLogin()', () => {
      const handler = getHandler(ipcMain, 'auth:login-cancel')
      handler()

      expect(authManager.cancelLogin).toHaveBeenCalledTimes(1)
    })

    it('returns undefined (fire-and-forget pattern)', () => {
      const handler = getHandler(ipcMain, 'auth:login-cancel')
      const result = handler()

      expect(result).toBeUndefined()
    })
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('passes no arguments to getStatus (ignores event)', () => {
      const handler = getHandler(ipcMain, 'auth:get-status')
      handler(mockEvent, { extraArg: 'ignored' })

      expect(authManager.getStatus).toHaveBeenCalledWith()
    })

    it('passes no arguments to refresh (ignores event)', () => {
      const handler = getHandler(ipcMain, 'auth:refresh')
      handler(mockEvent, { extraArg: 'ignored' })

      expect(authManager.refresh).toHaveBeenCalledWith()
    })
  })

  // ── auth:check-node ─────────────────────────────────────────────────────────

  describe('auth:check-node', () => {
    it('delegates to authManager.checkNode() with no force flag by default', async () => {
      const handler = getHandler(ipcMain, 'auth:check-node')
      const result = await handler(mockEvent)

      expect(authManager.checkNode).toHaveBeenCalledWith(false)
      expect(result).toEqual({
        installed: true,
        version: '22.10.0',
        satisfies22: true,
        platform: 'darwin',
      })
    })

    it('passes forceRefresh option through', async () => {
      const handler = getHandler(ipcMain, 'auth:check-node')
      await handler(mockEvent, { forceRefresh: true })

      expect(authManager.checkNode).toHaveBeenCalledWith(true)
    })
  })

  // ── auth:install-start ──────────────────────────────────────────────────────

  describe('auth:install-start', () => {
    it('installs copilot', () => {
      const handler = getHandler(ipcMain, 'auth:install-start')
      handler(mockEvent, { cli: 'copilot' })

      expect(authManager.installCopilot).toHaveBeenCalledTimes(1)
      expect(authManager.installClaude).not.toHaveBeenCalled()
    })

    it('installs claude', () => {
      const handler = getHandler(ipcMain, 'auth:install-start')
      handler(mockEvent, { cli: 'claude' })

      expect(authManager.installClaude).toHaveBeenCalledTimes(1)
      expect(authManager.installCopilot).not.toHaveBeenCalled()
    })

    it('ignores unknown cli values', () => {
      const handler = getHandler(ipcMain, 'auth:install-start')
      handler(mockEvent, { cli: 'bogus' as unknown as 'copilot' })

      expect(authManager.installCopilot).not.toHaveBeenCalled()
      expect(authManager.installClaude).not.toHaveBeenCalled()
    })
  })

  // ── auth:install-node-managed ───────────────────────────────────────────────

  describe('auth:install-node-managed', () => {
    it('delegates to authManager.installNodeManaged()', () => {
      const handler = getHandler(ipcMain, 'auth:install-node-managed')
      handler(mockEvent)

      expect(authManager.installNodeManaged).toHaveBeenCalledTimes(1)
    })
  })

  // ── auth:install-cancel ─────────────────────────────────────────────────────

  describe('auth:install-cancel', () => {
    it('cancels install for the given target', () => {
      const handler = getHandler(ipcMain, 'auth:install-cancel')
      handler(mockEvent, { target: 'copilot' })

      expect(authManager.cancelInstall).toHaveBeenCalledWith('copilot')
    })

    it('cancels node install', () => {
      const handler = getHandler(ipcMain, 'auth:install-cancel')
      handler(mockEvent, { target: 'node' })

      expect(authManager.cancelInstall).toHaveBeenCalledWith('node')
    })
  })

  // ── auth:open-external ──────────────────────────────────────────────────────

  describe('auth:open-external', () => {
    it('delegates to authManager.openExternalUrl() and returns the result', () => {
      authManager.openExternalUrl.mockReturnValue(true)

      const handler = getHandler(ipcMain, 'auth:open-external')
      const result = handler(mockEvent, { url: 'https://github.com/login/device' })

      expect(authManager.openExternalUrl).toHaveBeenCalledWith('https://github.com/login/device')
      expect(result).toBe(true)
    })

    it('returns false when the manager rejects the URL', () => {
      authManager.openExternalUrl.mockReturnValue(false)

      const handler = getHandler(ipcMain, 'auth:open-external')
      const result = handler(mockEvent, { url: 'file:///etc/passwd' })

      expect(result).toBe(false)
    })
  })
})
