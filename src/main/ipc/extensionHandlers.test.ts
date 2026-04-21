import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { existsSyncMock, statSyncMock, dialogMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn().mockReturnValue(true),
  statSyncMock: vi.fn().mockReturnValue({ isDirectory: () => true }),
  dialogMock: { showOpenDialog: vi.fn() },
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  cpSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{}'),
  statSync: statSyncMock,
}))

vi.mock('crypto', () => ({
  createHash: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue('hash'),
  }),
}))

vi.mock('adm-zip', () => ({
  default: class MockAdmZip {
    extractAllTo = vi.fn()
    getEntries = vi.fn().mockReturnValue([])
  }
}))

vi.mock('electron-store', () => ({
  default: class MockStore {
    get = vi.fn().mockReturnValue({})
    set = vi.fn()
    has = vi.fn()
    delete = vi.fn()
  },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeInstalledExt(id: string, overrides: Record<string, unknown> = {}) {
  return {
    manifest: {
      id,
      name: `Test ${id}`,
      version: '1.0.0',
      description: 'test',
      author: 'tester',
      permissions: ['storage', 'notifications:emit'],
      main: 'dist/index.js',
      ...((overrides.manifest as Record<string, unknown>) ?? {}),
    },
    installPath: `/mock/extensions/${id}`,
    source: 'user' as const,
    enabled: true,
    installedAt: Date.now(),
    manifestHash: 'hash123',
    grantedPermissions: ['storage', 'notifications:emit'],
    deniedPermissions: [],
    errorCount: 0,
    lastError: null,
    ...overrides,
  }
}

interface HandlerMap {
  [channel: string]: (event: unknown, args: unknown) => Promise<unknown>
}

interface SyncHandlerMap {
  [channel: string]: (event: { returnValue: unknown }) => void
}

function createMockIpcMain() {
  const handlers: HandlerMap = {}
  const syncHandlers: SyncHandlerMap = {}
  return {
    handle: vi.fn((channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>) => {
      handlers[channel] = handler
    }),
    on: vi.fn((channel: string, handler: (event: { returnValue: unknown }) => void) => {
      syncHandlers[channel] = handler
    }),
    removeHandler: vi.fn(),
    _handlers: handlers,
    _syncHandlers: syncHandlers,
    _invoke: async (channel: string, args?: unknown) => {
      const handler = handlers[channel]
      if (!handler) throw new Error(`No handler for ${channel}`)
      return handler({}, args)
    },
    _invokeSync: (channel: string) => {
      const handler = syncHandlers[channel]
      if (!handler) throw new Error(`No sync handler for ${channel}`)
      const event = { returnValue: undefined as unknown }
      handler(event)
      return event.returnValue
    },
  }
}

function createMockRegistry() {
  return {
    list: vi.fn().mockReturnValue([]),
    listEnabled: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    install: vi.fn(),
    uninstall: vi.fn(),
    setEnabled: vi.fn(),
    grantPermissions: vi.fn(),
    revokePermissions: vi.fn(),
    hasPermission: vi.fn().mockReturnValue(true),
    recordError: vi.fn().mockReturnValue(1),
    resetErrors: vi.fn(),
    getAllExtensionChannels: vi.fn().mockReturnValue([]),
  }
}

function createMockLoader() {
  return {
    load: vi.fn(),
    unload: vi.fn(),
    isLoaded: vi.fn().mockReturnValue(false),
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
    _mockStore: mockStore,
  }
}

function createMockNotificationManager() {
  return { emit: vi.fn() }
}

// ── Dynamic import ───────────────────────────────────────────────────────────

let registerExtensionHandlers: typeof import('./extensionHandlers').registerExtensionHandlers

describe('extensionHandlers', () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>
  let registry: ReturnType<typeof createMockRegistry>
  let loader: ReturnType<typeof createMockLoader>
  let storeFactory: ReturnType<typeof createMockStoreFactory>
  let notificationManager: ReturnType<typeof createMockNotificationManager>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    ipcMain = createMockIpcMain()
    registry = createMockRegistry()
    loader = createMockLoader()
    storeFactory = createMockStoreFactory()
    notificationManager = createMockNotificationManager()

    const mod = await import('./extensionHandlers')
    registerExtensionHandlers = mod.registerExtensionHandlers

    registerExtensionHandlers(
      ipcMain as never,
      registry as never,
      loader as never,
      storeFactory as never,
      notificationManager as never,
    )
  })

  describe('extension:list', () => {
    it('returns all extensions', async () => {
      const exts = [makeInstalledExt('com.test.ext1')]
      registry.list.mockReturnValue(exts)

      const result = await ipcMain._invoke('extension:list')
      expect(result).toEqual({ success: true, data: exts })
    })
  })

  describe('extension:get', () => {
    it('returns a specific extension', async () => {
      const ext = makeInstalledExt('com.test.ext')
      registry.get.mockReturnValue(ext)

      const result = await ipcMain._invoke('extension:get', { extensionId: 'com.test.ext' })
      expect(result).toEqual({ success: true, data: ext })
    })

    it('returns error when not found', async () => {
      registry.get.mockReturnValue(undefined)

      const result = await ipcMain._invoke('extension:get', { extensionId: 'com.test.missing' })
      expect(result).toEqual({ success: false, error: 'Not found' })
    })
  })

  describe('extension:toggle', () => {
    it('enables an extension and loads main if present', async () => {
      const ext = makeInstalledExt('com.test.ext')
      registry.get.mockReturnValue(ext)

      const result = await ipcMain._invoke('extension:toggle', {
        extensionId: 'com.test.ext',
        enabled: true,
      })

      expect(result).toEqual({ success: true })
      expect(registry.resetErrors).toHaveBeenCalledWith('com.test.ext')
      expect(registry.setEnabled).toHaveBeenCalledWith('com.test.ext', true)
      expect(loader.load).toHaveBeenCalled()
    })

    it('disables an extension and unloads it', async () => {
      const ext = makeInstalledExt('com.test.ext')
      registry.get.mockReturnValue(ext)

      const result = await ipcMain._invoke('extension:toggle', {
        extensionId: 'com.test.ext',
        enabled: false,
      })

      expect(result).toEqual({ success: true })
      expect(loader.unload).toHaveBeenCalledWith('com.test.ext')
      expect(registry.setEnabled).toHaveBeenCalledWith('com.test.ext', false)
    })

    it('returns error for unknown extension', async () => {
      registry.get.mockReturnValue(undefined)

      const result = await ipcMain._invoke('extension:toggle', {
        extensionId: 'com.test.missing',
        enabled: true,
      })

      expect(result).toEqual({ success: false, error: 'Extension not found' })
    })
  })

  describe('extension:uninstall', () => {
    it('unloads, destroys storage, and removes from registry', async () => {
      const ext = makeInstalledExt('com.test.ext')
      registry.get.mockReturnValue(ext)

      const result = await ipcMain._invoke('extension:uninstall', { extensionId: 'com.test.ext' })

      expect(result).toEqual({ success: true })
      expect(loader.unload).toHaveBeenCalledWith('com.test.ext')
      expect(storeFactory.destroyStore).toHaveBeenCalledWith('com.test.ext')
      expect(registry.uninstall).toHaveBeenCalledWith('com.test.ext')
      expect(notificationManager.emit).toHaveBeenCalled()
    })

    it('returns error when extension not found', async () => {
      registry.get.mockReturnValue(undefined)

      const result = await ipcMain._invoke('extension:uninstall', { extensionId: 'missing' })
      expect(result).toEqual({ success: false, error: 'Extension not found' })
    })
  })

  describe('extension:update-permissions', () => {
    it('grants and revokes permissions', async () => {
      registry.get.mockReturnValue(makeInstalledExt('com.test.ext'))

      const result = await ipcMain._invoke('extension:update-permissions', {
        extensionId: 'com.test.ext',
        granted: ['integration:github:read'],
        denied: ['http:fetch'],
      })

      expect(result.success).toBe(true)
      expect(registry.grantPermissions).toHaveBeenCalledWith('com.test.ext', ['integration:github:read'])
      expect(registry.revokePermissions).toHaveBeenCalledWith('com.test.ext', ['http:fetch'])
    })

    it('skips empty grant/deny arrays', async () => {
      registry.get.mockReturnValue(makeInstalledExt('com.test.ext'))

      await ipcMain._invoke('extension:update-permissions', {
        extensionId: 'com.test.ext',
        granted: [],
        denied: [],
      })

      expect(registry.grantPermissions).not.toHaveBeenCalled()
      expect(registry.revokePermissions).not.toHaveBeenCalled()
    })
  })

  describe('storage operations', () => {
    it('storage-get checks permission first', async () => {
      registry.hasPermission.mockReturnValue(false)

      const result = await ipcMain._invoke('extension:storage-get', {
        extensionId: 'com.test.ext',
        key: 'mykey',
      })

      expect(result).toEqual({ success: false, error: 'Storage permission not granted' })
    })

    it('storage-get returns value when permitted', async () => {
      registry.hasPermission.mockReturnValue(true)
      storeFactory._mockStore.get.mockReturnValue('hello')

      const result = await ipcMain._invoke('extension:storage-get', {
        extensionId: 'com.test.ext',
        key: 'mykey',
      })

      expect(result).toEqual({ success: true, data: 'hello' })
    })

    it('storage-set stores value when permitted', async () => {
      registry.hasPermission.mockReturnValue(true)

      const result = await ipcMain._invoke('extension:storage-set', {
        extensionId: 'com.test.ext',
        key: 'mykey',
        value: 42,
      })

      expect(result).toEqual({ success: true })
      expect(storeFactory._mockStore.set).toHaveBeenCalledWith('mykey', 42)
    })

    it('storage-delete removes key when permitted', async () => {
      registry.hasPermission.mockReturnValue(true)

      const result = await ipcMain._invoke('extension:storage-delete', {
        extensionId: 'com.test.ext',
        key: 'mykey',
      })

      expect(result).toEqual({ success: true })
      expect(storeFactory._mockStore.delete).toHaveBeenCalledWith('mykey')
    })

    it('storage-keys returns keys when permitted', async () => {
      registry.hasPermission.mockReturnValue(true)
      storeFactory._mockStore.keys.mockReturnValue(['a', 'b'])

      const result = await ipcMain._invoke('extension:storage-keys', {
        extensionId: 'com.test.ext',
      })

      expect(result).toEqual({ success: true, data: ['a', 'b'] })
    })

    it('storage-quota returns quota info (no permission check)', async () => {
      storeFactory._mockStore.getQuota.mockReturnValue({ used: 100, limit: 5000000 })

      const result = await ipcMain._invoke('extension:storage-quota', {
        extensionId: 'com.test.ext',
      })

      expect(result).toEqual({ success: true, data: { used: 100, limit: 5000000 } })
    })
  })

  describe('extension:notify', () => {
    it('emits notification when permitted', async () => {
      registry.hasPermission.mockReturnValue(true)
      registry.get.mockReturnValue(makeInstalledExt('com.test.ext'))

      const result = await ipcMain._invoke('extension:notify', {
        extensionId: 'com.test.ext',
        title: 'Hello',
        message: 'World',
        severity: 'info',
      })

      expect(result).toEqual({ success: true })
      expect(notificationManager.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Hello'),
          message: 'World',
        }),
      )
    })

    it('denies notification without permission', async () => {
      registry.hasPermission.mockReturnValue(false)

      const result = await ipcMain._invoke('extension:notify', {
        extensionId: 'com.test.ext',
        title: 'Hello',
        message: 'World',
      })

      expect(result).toEqual({ success: false, error: 'Notification permission not granted' })
    })
  })

  describe('extension:record-error', () => {
    it('records error and returns disabled status', async () => {
      registry.recordError.mockReturnValue(1)

      const result = await ipcMain._invoke('extension:record-error', {
        extensionId: 'com.test.ext',
        error: 'Something broke',
      })

      expect(result).toEqual({ success: true, disabled: false })
    })

    it('auto-disables after 3 errors', async () => {
      registry.recordError.mockReturnValue(3)
      registry.get.mockReturnValue(makeInstalledExt('com.test.ext'))

      const result = await ipcMain._invoke('extension:record-error', {
        extensionId: 'com.test.ext',
        error: 'Third error',
      })

      expect(result).toEqual({ success: true, disabled: true })
      expect(loader.unload).toHaveBeenCalledWith('com.test.ext')
      expect(registry.setEnabled).toHaveBeenCalledWith('com.test.ext', false)
      expect(notificationManager.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Extension Disabled',
        }),
      )
    })
  })

  describe('extension:get-channels', () => {
    it('returns all IPC channels from enabled extensions', async () => {
      registry.getAllExtensionChannels.mockReturnValue(['com.test:a', 'com.test:b'])

      const result = await ipcMain._invoke('extension:get-channels')
      expect(result).toEqual({ success: true, data: ['com.test:a', 'com.test:b'] })
    })
  })

  describe('extension:get-channels-sync', () => {
    it('returns channels synchronously via event.returnValue', () => {
      registry.getAllExtensionChannels.mockReturnValue(['com.test:x', 'com.test:y'])

      const result = ipcMain._invokeSync('extension:get-channels-sync')
      expect(result).toEqual({ success: true, data: ['com.test:x', 'com.test:y'] })
    })

    it('returns empty data on error', () => {
      registry.getAllExtensionChannels.mockImplementation(() => {
        throw new Error('Registry unavailable')
      })

      const result = ipcMain._invokeSync('extension:get-channels-sync')
      expect(result).toEqual({ success: false, data: [] })
    })
  })

  describe('extension:install', () => {
    it('installs from a directory path', async () => {
      existsSyncMock.mockReturnValue(true)
      statSyncMock.mockReturnValue({ isDirectory: () => true })

      const ext = makeInstalledExt('com.test.ext')
      registry.install.mockReturnValue(ext)
      registry.get.mockReturnValue(ext)

      const result = await ipcMain._invoke('extension:install', { filePath: '/path/to/ext' })
      expect(result.success).toBe(true)
      expect(registry.install).toHaveBeenCalledWith('/path/to/ext')
      expect(registry.grantPermissions).toHaveBeenCalledWith('com.test.ext', ext.manifest.permissions)
      expect(registry.setEnabled).toHaveBeenCalledWith('com.test.ext', true)
    })

    it('returns error when extension source does not exist', async () => {
      existsSyncMock.mockReturnValue(false)
      statSyncMock.mockReturnValue({ isDirectory: () => false })

      // Force a throw by making install fail
      registry.install.mockImplementation(() => { throw new Error('ENOENT') })

      const result = await ipcMain._invoke('extension:install', { filePath: '/nonexistent/path' })
      expect(result.success).toBe(false)
    })
  })

  describe('extension:check-requirements', () => {
    it('returns met: true when extension has no requires', async () => {
      const ext = makeInstalledExt('com.test.ext', {
        manifest: { ...makeInstalledExt('com.test.ext').manifest, requires: [] }
      })
      registry.get.mockReturnValue(ext)

      const result = await ipcMain._invoke('extension:check-requirements', { extensionId: 'com.test.ext' })
      expect(result.success).toBe(true)
      expect(result.data?.met).toBe(true)
    })

    it('returns error for unknown extension', async () => {
      registry.get.mockReturnValue(undefined)
      const result = await ipcMain._invoke('extension:check-requirements', { extensionId: 'missing' })
      expect(result.success).toBe(false)
    })
  })
})
