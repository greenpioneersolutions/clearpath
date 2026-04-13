import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { mockGet, mockSet, mockDelete, mockClear, mockStore } = vi.hoisted(() => {
  const data: Record<string, unknown> = {}
  return {
    mockGet: vi.fn((key: string) => {
      if (key === 'data') return { ...data }
      const dotKey = key.replace('data.', '')
      return data[dotKey]
    }),
    mockSet: vi.fn((key: string, value: unknown) => {
      if (key.startsWith('data.')) {
        data[key.replace('data.', '')] = value
      }
    }),
    mockDelete: vi.fn((key: string) => {
      const dotKey = key.replace('data.', '')
      delete data[dotKey]
    }),
    mockClear: vi.fn(() => {
      for (const k of Object.keys(data)) delete data[k]
    }),
    mockStore: data,
  }
})

vi.mock('electron-store', () => ({
  default: class MockStore {
    get = mockGet
    set = mockSet
    delete = mockDelete
    clear = mockClear
  },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

// ── Dynamic import ───────────────────────────────────────────────────────────

let ExtensionStorage: typeof import('./ExtensionStore').ExtensionStorage
let ExtensionStoreFactory: typeof import('./ExtensionStore').ExtensionStoreFactory

describe('ExtensionStorage', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    // Clear mock data
    for (const k of Object.keys(mockStore)) delete mockStore[k]

    const mod = await import('./ExtensionStore')
    ExtensionStorage = mod.ExtensionStorage
    ExtensionStoreFactory = mod.ExtensionStoreFactory
  })

  describe('get / set / delete / keys', () => {
    it('stores and retrieves a value', () => {
      const store = new ExtensionStorage('com.test.ext')
      store.set('key1', 'value1')
      expect(mockSet).toHaveBeenCalledWith('data.key1', 'value1')
    })

    it('gets a value by key', () => {
      mockStore['mykey'] = 42
      const store = new ExtensionStorage('com.test.ext')
      const val = store.get<number>('mykey')
      expect(val).toBe(42)
    })

    it('returns undefined for missing key', () => {
      const store = new ExtensionStorage('com.test.ext')
      const val = store.get('nonexistent')
      expect(val).toBeUndefined()
    })

    it('deletes a key', () => {
      const store = new ExtensionStorage('com.test.ext')
      store.delete('key1')
      expect(mockDelete).toHaveBeenCalledWith('data.key1')
    })

    it('returns all keys', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'data') return { alpha: 1, beta: 2, gamma: 3 }
        return undefined
      })

      const store = new ExtensionStorage('com.test.ext')
      const keys = store.keys()
      expect(keys).toEqual(['alpha', 'beta', 'gamma'])
    })
  })

  describe('quota enforcement', () => {
    it('throws when quota is exceeded', () => {
      // Set a very small quota (50 bytes)
      const store = new ExtensionStorage('com.test.ext', 50)

      // Mock current data as empty object
      mockGet.mockImplementation((key: string) => {
        if (key === 'data') return {}
        return undefined
      })

      // Try to store a large value
      const largeValue = 'x'.repeat(200)
      expect(() => store.set('big', largeValue)).toThrow(/Storage quota exceeded/)
    })

    it('allows writes within quota', () => {
      const store = new ExtensionStorage('com.test.ext', 1024 * 1024) // 1 MB

      mockGet.mockImplementation((key: string) => {
        if (key === 'data') return {}
        return undefined
      })

      expect(() => store.set('small', 'hello')).not.toThrow()
    })

    it('uses 5 MB default quota when not specified', () => {
      const store = new ExtensionStorage('com.test.ext')
      const quota = store.getQuota()
      expect(quota.limit).toBe(5 * 1024 * 1024)
    })
  })

  describe('getQuota', () => {
    it('returns used and limit bytes', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'data') return { a: 1 }
        return undefined
      })

      const store = new ExtensionStorage('com.test.ext', 1000)
      const quota = store.getQuota()

      expect(quota.limit).toBe(1000)
      expect(typeof quota.used).toBe('number')
      expect(quota.used).toBeGreaterThan(0)
    })
  })

  describe('destroy', () => {
    it('clears all data', () => {
      const store = new ExtensionStorage('com.test.ext')
      store.destroy()
      expect(mockClear).toHaveBeenCalled()
    })
  })
})

describe('ExtensionStoreFactory', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    for (const k of Object.keys(mockStore)) delete mockStore[k]

    const mod = await import('./ExtensionStore')
    ExtensionStorage = mod.ExtensionStorage
    ExtensionStoreFactory = mod.ExtensionStoreFactory
  })

  it('creates and caches store instances', () => {
    const factory = new ExtensionStoreFactory()
    const store1 = factory.getStore('com.test.ext')
    const store2 = factory.getStore('com.test.ext')

    expect(store1).toBe(store2) // Same instance
  })

  it('creates separate instances for different extensions', () => {
    const factory = new ExtensionStoreFactory()
    const store1 = factory.getStore('com.test.ext1')
    const store2 = factory.getStore('com.test.ext2')

    expect(store1).not.toBe(store2)
  })

  it('destroyStore clears and removes the instance', () => {
    const factory = new ExtensionStoreFactory()
    const store1 = factory.getStore('com.test.ext')
    factory.destroyStore('com.test.ext')

    // Getting it again should create a new instance
    const store2 = factory.getStore('com.test.ext')
    expect(store2).not.toBe(store1)
  })

  it('destroyStore is a no-op for non-existent extension', () => {
    const factory = new ExtensionStoreFactory()
    expect(() => factory.destroyStore('com.nonexistent.ext')).not.toThrow()
  })

  it('destroyAll clears all instances', () => {
    const factory = new ExtensionStoreFactory()
    factory.getStore('com.test.ext1')
    factory.getStore('com.test.ext2')

    factory.destroyAll()

    // Both should be new instances now
    expect(mockClear).toHaveBeenCalled()
  })
})
