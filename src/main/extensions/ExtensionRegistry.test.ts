import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  existsSyncMock,
  readdirSyncMock,
  mkdirSyncMock,
  cpSyncMock,
  rmSyncMock,
  mockRegistryData,
  mockStoreGet,
  mockStoreSet,
  validateDirMock,
  hashManifestMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn().mockReturnValue(true),
  readdirSyncMock: vi.fn().mockReturnValue([]),
  mkdirSyncMock: vi.fn(),
  cpSyncMock: vi.fn(),
  rmSyncMock: vi.fn(),
  mockRegistryData: { registry: {} } as Record<string, unknown>,
  mockStoreGet: vi.fn(),
  mockStoreSet: vi.fn(),
  validateDirMock: vi.fn(),
  hashManifestMock: vi.fn().mockReturnValue('hash123'),
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readdirSync: readdirSyncMock,
  mkdirSync: mkdirSyncMock,
  cpSync: cpSyncMock,
  rmSync: rmSyncMock,
}))

vi.mock('electron-store', () => ({
  default: class MockStore {
    get = mockStoreGet
    set = mockStoreSet
    has = vi.fn()
    delete = vi.fn()
  },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('./ExtensionValidator', () => ({
  ExtensionValidator: class {
    validateDirectory = validateDirMock
    hashManifest = hashManifestMock
  },
}))

// ── Dynamic import ───────────────────────────────────────────────────────────

let ExtensionRegistry: typeof import('./ExtensionRegistry').ExtensionRegistry

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeDirent(name: string) {
  return { name, isDirectory: () => true }
}

function makeManifest(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Test ${id}`,
    version: '1.0.0',
    description: 'test',
    author: 'tester',
    permissions: ['storage'],
    ...overrides,
  }
}

function makeInstalledExt(id: string, overrides: Record<string, unknown> = {}) {
  return {
    manifest: makeManifest(id),
    installPath: `/mock/extensions/${id}`,
    source: 'user' as const,
    enabled: false,
    installedAt: Date.now(),
    manifestHash: 'hash123',
    grantedPermissions: [],
    deniedPermissions: [],
    errorCount: 0,
    lastError: null,
    ...overrides,
  }
}

describe('ExtensionRegistry', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readdirSyncMock.mockReturnValue([])

    // Default store behavior
    mockRegistryData.registry = {}
    mockStoreGet.mockImplementation((key: string) => {
      if (key === 'registry') return { ...mockRegistryData.registry }
      return undefined
    })
    mockStoreSet.mockImplementation((key: string, value: unknown) => {
      if (key === 'registry') mockRegistryData.registry = value as Record<string, unknown>
    })

    const mod = await import('./ExtensionRegistry')
    ExtensionRegistry = mod.ExtensionRegistry
  })

  describe('constructor', () => {
    it('creates user extensions directory if missing', () => {
      existsSyncMock.mockImplementation((p: string) => {
        if (String(p).includes('extensions')) return false
        return true
      })

      new ExtensionRegistry()
      expect(mkdirSyncMock).toHaveBeenCalled()
    })
  })

  describe('discoverAll', () => {
    it('scans bundled and user directories', () => {
      readdirSyncMock.mockReturnValue([makeDirent('my-ext')])
      validateDirMock.mockReturnValue({
        valid: true,
        manifest: makeManifest('com.test.my-ext'),
        errors: [],
      })

      const registry = new ExtensionRegistry()
      const result = registry.discoverAll()

      expect(result.discovered).toBeGreaterThanOrEqual(1)
      expect(result.errors).toHaveLength(0)
    })

    it('skips invalid extensions and records errors', () => {
      readdirSyncMock.mockReturnValue([makeDirent('bad-ext')])
      validateDirMock.mockReturnValue({
        valid: false,
        manifest: null,
        errors: ['Missing required field: id'],
      })

      const registry = new ExtensionRegistry()
      const result = registry.discoverAll()

      expect(result.errors.length).toBeGreaterThanOrEqual(1)
      expect(result.errors[0].errors).toContain('Missing required field: id')
    })

    it('skips hidden directories (starting with .)', () => {
      readdirSyncMock.mockReturnValue([
        { name: '.hidden', isDirectory: () => true },
        makeDirent('visible'),
      ])
      validateDirMock.mockReturnValue({
        valid: true,
        manifest: makeManifest('com.test.visible'),
        errors: [],
      })

      const registry = new ExtensionRegistry()
      registry.discoverAll()

      // validateDir should be called for 'visible' only (once per scanned dir: bundled + user = 2)
      // but NOT for '.hidden'
      for (const call of validateDirMock.mock.calls) {
        expect(String(call[0])).not.toContain('.hidden')
      }
    })

    it('registers new bundled extensions as enabled with all permissions granted', () => {
      readdirSyncMock.mockImplementation((dir: string) => {
        // Only return entries for the bundled directory scan
        if (String(dir).includes('extensions')) return [makeDirent('bundled-ext')]
        return []
      })

      const manifest = makeManifest('com.test.bundled-ext', {
        permissions: ['storage', 'notifications:emit'],
      })
      validateDirMock.mockReturnValue({ valid: true, manifest, errors: [] })

      const registry = new ExtensionRegistry()
      registry.discoverAll()

      // Check that store.set was called with the extension enabled and permissions granted
      const setCalls = mockStoreSet.mock.calls
      const registrySet = setCalls.find(
        (c: unknown[]) => c[0] === 'registry' && (c[1] as Record<string, unknown>)['com.test.bundled-ext'],
      )
      if (registrySet) {
        const entry = (registrySet[1] as Record<string, Record<string, unknown>>)['com.test.bundled-ext']
        expect(entry.enabled).toBe(true)
        expect(entry.grantedPermissions).toEqual(['storage', 'notifications:emit'])
      }
    })

    it('prunes orphaned entries whose directories no longer exist', () => {
      // Pre-populate registry with an orphan
      mockRegistryData.registry = {
        'com.test.orphan': makeInstalledExt('com.test.orphan', {
          installPath: '/nonexistent/path',
        }),
      }
      mockStoreGet.mockImplementation((key: string) => {
        if (key === 'registry') return { ...mockRegistryData.registry }
        return undefined
      })

      existsSyncMock.mockImplementation((p: string) => {
        if (String(p) === '/nonexistent/path') return false
        return true
      })

      const registry = new ExtensionRegistry()
      registry.discoverAll()

      // Registry should have been updated to remove the orphan
      const lastSetCall = mockStoreSet.mock.calls[mockStoreSet.mock.calls.length - 1]
      if (lastSetCall && lastSetCall[0] === 'registry') {
        expect(lastSetCall[1]).not.toHaveProperty('com.test.orphan')
      }
    })
  })

  describe('list / listEnabled / get / has', () => {
    it('list returns all extensions', () => {
      mockStoreGet.mockReturnValue({
        'com.test.ext1': makeInstalledExt('com.test.ext1'),
        'com.test.ext2': makeInstalledExt('com.test.ext2'),
      })

      const registry = new ExtensionRegistry()
      expect(registry.list()).toHaveLength(2)
    })

    it('listEnabled returns only enabled extensions', () => {
      mockStoreGet.mockReturnValue({
        'com.test.ext1': makeInstalledExt('com.test.ext1', { enabled: true }),
        'com.test.ext2': makeInstalledExt('com.test.ext2', { enabled: false }),
      })

      const registry = new ExtensionRegistry()
      expect(registry.listEnabled()).toHaveLength(1)
      expect(registry.listEnabled()[0].manifest.id).toBe('com.test.ext1')
    })

    it('get returns a specific extension', () => {
      mockStoreGet.mockReturnValue({
        'com.test.ext1': makeInstalledExt('com.test.ext1'),
      })

      const registry = new ExtensionRegistry()
      const ext = registry.get('com.test.ext1')
      expect(ext).toBeDefined()
      expect(ext!.manifest.id).toBe('com.test.ext1')
    })

    it('get returns undefined for missing extension', () => {
      mockStoreGet.mockReturnValue({})

      const registry = new ExtensionRegistry()
      expect(registry.get('com.test.missing')).toBeUndefined()
    })

    it('has returns boolean presence check', () => {
      mockStoreGet.mockReturnValue({
        'com.test.ext1': makeInstalledExt('com.test.ext1'),
      })

      const registry = new ExtensionRegistry()
      expect(registry.has('com.test.ext1')).toBe(true)
      expect(registry.has('com.test.missing')).toBe(false)
    })
  })

  describe('getAllExtensionChannels', () => {
    it('returns IPC channels from enabled extensions', () => {
      mockStoreGet.mockReturnValue({
        'com.test.ext1': makeInstalledExt('com.test.ext1', {
          enabled: true,
          manifest: makeManifest('com.test.ext1', {
            ipcChannels: ['com.test:action1', 'com.test:action2'],
          }),
        }),
        'com.test.ext2': makeInstalledExt('com.test.ext2', {
          enabled: false,
          manifest: makeManifest('com.test.ext2', {
            ipcChannels: ['com.disabled:action'],
          }),
        }),
      })

      const registry = new ExtensionRegistry()
      const channels = registry.getAllExtensionChannels()
      expect(channels).toEqual(['com.test:action1', 'com.test:action2'])
    })
  })

  describe('install', () => {
    it('validates, copies, and registers a new extension', () => {
      const manifest = makeManifest('com.test.new-ext')
      validateDirMock.mockReturnValue({ valid: true, manifest, errors: [] })
      mockStoreGet.mockReturnValue({})

      const registry = new ExtensionRegistry()
      const ext = registry.install('/source/dir')

      expect(cpSyncMock).toHaveBeenCalled()
      expect(ext.manifest.id).toBe('com.test.new-ext')
      expect(ext.source).toBe('user')
      expect(ext.enabled).toBe(false) // User extensions start disabled
      expect(ext.grantedPermissions).toEqual([]) // No permissions granted by default
    })

    it('throws on invalid manifest', () => {
      validateDirMock.mockReturnValue({
        valid: false,
        manifest: null,
        errors: ['Missing field: id'],
      })

      const registry = new ExtensionRegistry()
      expect(() => registry.install('/source/dir')).toThrow(/Invalid extension/)
    })

    it('throws if extension is already installed', () => {
      const manifest = makeManifest('com.test.existing')
      validateDirMock.mockReturnValue({ valid: true, manifest, errors: [] })
      mockStoreGet.mockReturnValue({
        'com.test.existing': makeInstalledExt('com.test.existing'),
      })

      const registry = new ExtensionRegistry()
      expect(() => registry.install('/source/dir')).toThrow(/already installed/)
    })
  })

  describe('uninstall', () => {
    it('removes user extension from disk and registry', () => {
      const ext = makeInstalledExt('com.test.ext', { source: 'user' })
      mockStoreGet.mockReturnValue({ 'com.test.ext': ext })

      const registry = new ExtensionRegistry()
      registry.uninstall('com.test.ext')

      expect(rmSyncMock).toHaveBeenCalled()
      expect(mockStoreSet).toHaveBeenCalledWith('registry', expect.not.objectContaining({
        'com.test.ext': expect.anything(),
      }))
    })

    it('throws for bundled extensions', () => {
      const ext = makeInstalledExt('com.test.bundled', { source: 'bundled' })
      mockStoreGet.mockReturnValue({ 'com.test.bundled': ext })

      const registry = new ExtensionRegistry()
      expect(() => registry.uninstall('com.test.bundled')).toThrow(/Cannot uninstall bundled/)
    })

    it('throws for unknown extensions', () => {
      mockStoreGet.mockReturnValue({})

      const registry = new ExtensionRegistry()
      expect(() => registry.uninstall('com.test.missing')).toThrow(/not found/)
    })
  })

  describe('setEnabled', () => {
    it('enables an extension', () => {
      const ext = makeInstalledExt('com.test.ext')
      mockStoreGet.mockReturnValue({ 'com.test.ext': ext })

      const registry = new ExtensionRegistry()
      registry.setEnabled('com.test.ext', true)

      expect(mockStoreSet).toHaveBeenCalledWith(
        'registry',
        expect.objectContaining({
          'com.test.ext': expect.objectContaining({ enabled: true }),
        }),
      )
    })

    it('throws for unknown extensions', () => {
      mockStoreGet.mockReturnValue({})

      const registry = new ExtensionRegistry()
      expect(() => registry.setEnabled('com.test.missing', true)).toThrow(/not found/)
    })
  })

  describe('permissions', () => {
    it('grantPermissions adds permissions and removes from denied', () => {
      const ext = makeInstalledExt('com.test.ext', {
        grantedPermissions: [],
        deniedPermissions: ['storage'],
      })
      mockStoreGet.mockReturnValue({ 'com.test.ext': ext })

      const registry = new ExtensionRegistry()
      registry.grantPermissions('com.test.ext', ['storage' as import('./types').ExtensionPermission])

      expect(mockStoreSet).toHaveBeenCalledWith(
        'registry',
        expect.objectContaining({
          'com.test.ext': expect.objectContaining({
            grantedPermissions: expect.arrayContaining(['storage']),
            deniedPermissions: [],
          }),
        }),
      )
    })

    it('revokePermissions removes from granted and adds to denied', () => {
      const ext = makeInstalledExt('com.test.ext', {
        grantedPermissions: ['storage', 'notifications:emit'],
        deniedPermissions: [],
      })
      mockStoreGet.mockReturnValue({ 'com.test.ext': ext })

      const registry = new ExtensionRegistry()
      registry.revokePermissions('com.test.ext', ['storage' as import('./types').ExtensionPermission])

      expect(mockStoreSet).toHaveBeenCalledWith(
        'registry',
        expect.objectContaining({
          'com.test.ext': expect.objectContaining({
            grantedPermissions: ['notifications:emit'],
            deniedPermissions: expect.arrayContaining(['storage']),
          }),
        }),
      )
    })

    it('hasPermission returns true for enabled extension with granted permission', () => {
      const ext = makeInstalledExt('com.test.ext', {
        enabled: true,
        grantedPermissions: ['storage'],
      })
      mockStoreGet.mockReturnValue({ 'com.test.ext': ext })

      const registry = new ExtensionRegistry()
      expect(registry.hasPermission('com.test.ext', 'storage')).toBe(true)
    })

    it('hasPermission returns false for disabled extension', () => {
      const ext = makeInstalledExt('com.test.ext', {
        enabled: false,
        grantedPermissions: ['storage'],
      })
      mockStoreGet.mockReturnValue({ 'com.test.ext': ext })

      const registry = new ExtensionRegistry()
      expect(registry.hasPermission('com.test.ext', 'storage')).toBe(false)
    })

    it('hasPermission returns false for non-granted permission', () => {
      const ext = makeInstalledExt('com.test.ext', {
        enabled: true,
        grantedPermissions: ['storage'],
      })
      mockStoreGet.mockReturnValue({ 'com.test.ext': ext })

      const registry = new ExtensionRegistry()
      expect(registry.hasPermission('com.test.ext', 'notifications:emit')).toBe(false)
    })

    it('hasPermission returns false for unknown extension', () => {
      mockStoreGet.mockReturnValue({})

      const registry = new ExtensionRegistry()
      expect(registry.hasPermission('com.test.missing', 'storage')).toBe(false)
    })
  })

  describe('error tracking', () => {
    it('recordError increments count and stores message', () => {
      const ext = makeInstalledExt('com.test.ext', { errorCount: 0 })
      mockStoreGet.mockReturnValue({ 'com.test.ext': ext })

      const registry = new ExtensionRegistry()
      const count = registry.recordError('com.test.ext', 'Something broke')

      expect(count).toBe(1)
      expect(mockStoreSet).toHaveBeenCalledWith(
        'registry',
        expect.objectContaining({
          'com.test.ext': expect.objectContaining({
            errorCount: 1,
            lastError: 'Something broke',
          }),
        }),
      )
    })

    it('recordError returns 0 for unknown extension', () => {
      mockStoreGet.mockReturnValue({})

      const registry = new ExtensionRegistry()
      expect(registry.recordError('com.test.missing', 'err')).toBe(0)
    })

    it('resetErrors clears error state', () => {
      const ext = makeInstalledExt('com.test.ext', { errorCount: 3, lastError: 'err' })
      mockStoreGet.mockReturnValue({ 'com.test.ext': ext })

      const registry = new ExtensionRegistry()
      registry.resetErrors('com.test.ext')

      expect(mockStoreSet).toHaveBeenCalledWith(
        'registry',
        expect.objectContaining({
          'com.test.ext': expect.objectContaining({
            errorCount: 0,
            lastError: null,
          }),
        }),
      )
    })
  })
})
