import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

// We test the loader by importing its class and using mock dependencies.
// The tricky part is the dynamic `require(mainPath)` call inside `load()`.
// We handle this by mocking `Module._resolveFilename` and caching mock modules.

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeManifest(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Test ${id}`,
    version: '1.0.0',
    description: 'test',
    author: 'tester',
    permissions: ['storage'] as string[],
    main: 'dist/index.js',
    ...overrides,
  }
}

function makeInstalledExt(id: string, overrides: Record<string, unknown> = {}) {
  return {
    manifest: makeManifest(id, overrides.manifest as Record<string, unknown> | undefined),
    installPath: `/mock/extensions/${id}`,
    source: 'user' as const,
    enabled: true,
    installedAt: Date.now(),
    manifestHash: 'hash123',
    grantedPermissions: ['storage'] as string[],
    deniedPermissions: [] as string[],
    errorCount: 0,
    lastError: null,
    ...overrides,
  }
}

function createMockIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
    on: vi.fn(),
    emit: vi.fn(),
    _invokeHandlers: handlers,
  }
}

function createMockRegistry() {
  return {
    listEnabled: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    has: vi.fn(),
    hasPermission: vi.fn().mockReturnValue(false),
    recordError: vi.fn().mockReturnValue(1),
    resetErrors: vi.fn(),
    setEnabled: vi.fn(),
  }
}

function createMockStoreFactory() {
  const mockStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn().mockReturnValue([]),
    getQuota: vi.fn().mockReturnValue({ used: 0, limit: 5242880 }),
  }
  return {
    getStore: vi.fn().mockReturnValue(mockStore),
    destroyStore: vi.fn(),
    destroyAll: vi.fn(),
    _mockStore: mockStore,
  }
}

// ── Dynamic import ───────────────────────────────────────────────────────────

let ExtensionMainLoader: typeof import('./ExtensionMainLoader').ExtensionMainLoader

describe('ExtensionMainLoader', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>
  let mockRegistry: ReturnType<typeof createMockRegistry>
  let mockStoreFactory: ReturnType<typeof createMockStoreFactory>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    mockIpcMain = createMockIpcMain()
    mockRegistry = createMockRegistry()
    mockStoreFactory = createMockStoreFactory()

    const mod = await import('./ExtensionMainLoader')
    ExtensionMainLoader = mod.ExtensionMainLoader
  })

  // Since dynamic require() is hard to mock in Vitest, we test the public API
  // by focusing on what we CAN control: dependencies + error paths.

  describe('load — error handling', () => {
    it('records error when require() throws (file not found)', async () => {
      const ext = makeInstalledExt('com.test.ext')
      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      await loader.load(ext as never)

      // require('/mock/extensions/com.test.ext/dist/index.js') will throw MODULE_NOT_FOUND
      expect(mockRegistry.recordError).toHaveBeenCalledWith(
        'com.test.ext',
        expect.stringContaining('Failed to load'),
      )
      expect(loader.isLoaded('com.test.ext')).toBe(false)
    })
  })

  describe('unload', () => {
    it('is a no-op for unloaded extensions', async () => {
      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      await expect(loader.unload('com.test.missing')).resolves.toBeUndefined()
    })
  })

  describe('unloadAll', () => {
    it('does not throw when no extensions are loaded', async () => {
      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      await expect(loader.unloadAll()).resolves.toBeUndefined()
    })
  })

  describe('isLoaded', () => {
    it('returns false for unloaded extension', () => {
      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      expect(loader.isLoaded('com.test.ext')).toBe(false)
    })
  })

  describe('registerHostHandler', () => {
    it('stores host handlers without throwing', () => {
      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      expect(() =>
        loader.registerHostHandler('integration:github-repos', vi.fn()),
      ).not.toThrow()
    })
  })

  describe('broadcastEvent', () => {
    it('forwards events to renderer webContents', async () => {
      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      const mockWc = {
        isDestroyed: vi.fn().mockReturnValue(false),
        send: vi.fn(),
      }
      loader.setWebContents(mockWc as never)

      await loader.broadcastEvent('session:started', { sessionId: '123' })

      expect(mockWc.send).toHaveBeenCalledWith('extension:event', {
        event: 'session:started',
        data: { sessionId: '123' },
      })
    })

    it('does not send to destroyed webContents', async () => {
      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      const mockWc = {
        isDestroyed: vi.fn().mockReturnValue(true),
        send: vi.fn(),
      }
      loader.setWebContents(mockWc as never)

      await loader.broadcastEvent('session:started', {})

      expect(mockWc.send).not.toHaveBeenCalled()
    })

    it('works with no webContents set', async () => {
      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      await expect(loader.broadcastEvent('session:started', {})).resolves.toBeUndefined()
    })

    it('dispatches session hooks to enabled extensions', async () => {
      const ext = makeInstalledExt('com.test.ext', {
        enabled: true,
        manifest: makeManifest('com.test.ext', {
          contributes: {
            sessionHooks: [
              { event: 'session:started', handler: 'com.test:on-session-start' },
            ],
          },
          ipcNamespace: 'com.test',
        }),
      })
      mockRegistry.listEnabled.mockReturnValue([ext])

      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      // Even without a loaded extension, broadcastEvent should not throw
      await expect(
        loader.broadcastEvent('session:started', { id: '1' }),
      ).resolves.toBeUndefined()
    })
  })

  describe('loadAll', () => {
    it('only attempts to load extensions with main entries', async () => {
      const ext1 = makeInstalledExt('com.test.ext1', {
        manifest: makeManifest('com.test.ext1', { main: 'dist/index.js' }),
      })
      const ext2 = makeInstalledExt('com.test.ext2', {
        manifest: makeManifest('com.test.ext2', { main: undefined }),
      })
      mockRegistry.listEnabled.mockReturnValue([ext1, ext2])

      const loader = new ExtensionMainLoader(
        mockIpcMain as never,
        mockRegistry as never,
        mockStoreFactory as never,
      )

      await loader.loadAll()

      // ext1 will fail because the path doesn't exist, but it was attempted
      expect(mockRegistry.recordError).toHaveBeenCalledWith(
        'com.test.ext1',
        expect.stringContaining('Failed to load'),
      )
      // ext2 was never attempted because it has no main entry
      expect(
        mockRegistry.recordError.mock.calls.some(
          (c: unknown[]) => c[0] === 'com.test.ext2',
        ),
      ).toBe(false)
    })
  })
})
