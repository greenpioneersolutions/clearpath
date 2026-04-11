import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────
const { mockGet, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
}))

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      get = mockGet
      set = mockSet
      has = vi.fn()
      delete = vi.fn()
    },
  }
})

// ── helpers ────────────────────────────────────────────────────────────
// After vi.resetModules(), electron-mock.ts is re-evaluated creating fresh
// vi.fn() instances. We must dynamically import electron alongside the module
// under test so we reference the SAME safeStorage the module sees.
type CredentialStoreModule = typeof import('./credentialStore')
let mod: CredentialStoreModule
let mockSafe: {
  isEncryptionAvailable: ReturnType<typeof vi.fn>
  encryptString: ReturnType<typeof vi.fn>
  decryptString: ReturnType<typeof vi.fn>
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()

  const electron = await import('electron')
  mockSafe = electron.safeStorage as typeof mockSafe
  mod = await import('./credentialStore')

  // Defaults: encryption available, round-trip encrypt/decrypt.
  mockSafe.isEncryptionAvailable.mockReturnValue(true)
  mockSafe.encryptString.mockImplementation((s: string) => Buffer.from(s))
  mockSafe.decryptString.mockImplementation((b: Buffer) => b.toString())
  mockGet.mockReturnValue(undefined)
})

// ── tests ──────────────────────────────────────────────────────────────

describe('credentialStore', () => {
  // ── isSecureStorageAvailable ────────────────────────────────────────
  describe('isSecureStorageAvailable', () => {
    it('returns true when safeStorage encryption is available', () => {
      mockSafe.isEncryptionAvailable.mockReturnValue(true)
      expect(mod.isSecureStorageAvailable()).toBe(true)
    })

    it('returns false when safeStorage encryption is NOT available', () => {
      mockSafe.isEncryptionAvailable.mockReturnValue(false)
      expect(mod.isSecureStorageAvailable()).toBe(false)
    })

    it('returns false when safeStorage.isEncryptionAvailable throws', () => {
      mockSafe.isEncryptionAvailable.mockImplementation(() => {
        throw new Error('not supported')
      })
      expect(mod.isSecureStorageAvailable()).toBe(false)
    })
  })

  // ── storeSecret ────────────────────────────────────────────────────
  describe('storeSecret', () => {
    it('encrypts value and stores as base64', () => {
      const encrypted = Buffer.from('encrypted-data')
      mockSafe.encryptString.mockReturnValue(encrypted)

      mod.storeSecret('my-key', 'my-secret')

      expect(mockSafe.encryptString).toHaveBeenCalledWith('my-secret')
      expect(mockSet).toHaveBeenCalledWith(
        'credentials.my-key',
        encrypted.toString('base64'),
      )
    })

    it('throws when safeStorage is not available', () => {
      mockSafe.isEncryptionAvailable.mockReturnValue(false)
      expect(() => mod.storeSecret('k', 'v')).toThrow('Secure storage is not available')
    })

    it('stores different keys independently', () => {
      mod.storeSecret('key-a', 'value-a')
      mod.storeSecret('key-b', 'value-b')

      expect(mockSet).toHaveBeenCalledTimes(2)
      expect(mockSet).toHaveBeenCalledWith(
        'credentials.key-a',
        expect.any(String),
      )
      expect(mockSet).toHaveBeenCalledWith(
        'credentials.key-b',
        expect.any(String),
      )
    })

    it('stores empty string when value is empty', () => {
      mod.storeSecret('empty', '')
      expect(mockSafe.encryptString).toHaveBeenCalledWith('')
      expect(mockSet).toHaveBeenCalled()
    })
  })

  // ── retrieveSecret ─────────────────────────────────────────────────
  describe('retrieveSecret', () => {
    it('retrieves and decrypts a stored secret', () => {
      const plaintext = 'my-secret-value'
      const encrypted = Buffer.from(plaintext)
      mockGet.mockImplementation((path: string) => {
        if (path === 'credentials.my-key') return encrypted.toString('base64')
        if (path === 'credentials') return { 'my-key': encrypted.toString('base64') }
        return undefined
      })

      const result = mod.retrieveSecret('my-key')

      expect(mockSafe.decryptString).toHaveBeenCalled()
      expect(result).toBe(plaintext)
    })

    it('returns empty string when key does not exist', () => {
      mockGet.mockImplementation((path: string) => {
        if (path === 'credentials') return {}
        return undefined
      })

      expect(mod.retrieveSecret('missing')).toBe('')
    })

    it('returns empty string when safeStorage unavailable (cannot decrypt)', () => {
      const encrypted = Buffer.from('secret').toString('base64')
      mockGet.mockImplementation((path: string) => {
        if (path === 'credentials.locked-key') return encrypted
        if (path === 'credentials') return { 'locked-key': encrypted }
        return undefined
      })
      mockSafe.isEncryptionAvailable.mockReturnValue(false)

      expect(mod.retrieveSecret('locked-key')).toBe('')
    })

    it('returns empty string when decryption throws', () => {
      const encrypted = Buffer.from('bad-data').toString('base64')
      mockGet.mockImplementation((path: string) => {
        if (path === 'credentials.corrupt') return encrypted
        if (path === 'credentials') return { corrupt: encrypted }
        return undefined
      })
      mockSafe.decryptString.mockImplementation(() => {
        throw new Error('decrypt failed')
      })

      expect(mod.retrieveSecret('corrupt')).toBe('')
    })
  })

  // ── deleteSecret ───────────────────────────────────────────────────
  describe('deleteSecret', () => {
    it('removes the key from the credentials map', () => {
      const creds = { 'key-a': 'enc-a', 'key-b': 'enc-b' }
      mockGet.mockReturnValue({ ...creds })

      mod.deleteSecret('key-a')

      expect(mockSet).toHaveBeenCalledWith('credentials', { 'key-b': 'enc-b' })
    })

    it('handles deleting a non-existent key gracefully', () => {
      mockGet.mockReturnValue({})

      expect(() => mod.deleteSecret('nope')).not.toThrow()
      expect(mockSet).toHaveBeenCalledWith('credentials', {})
    })
  })

  // ── hasSecret ──────────────────────────────────────────────────────
  describe('hasSecret', () => {
    it('returns true when a credential exists', () => {
      mockGet.mockImplementation((path: string) => {
        if (path === 'credentials.api-key') return 'some-base64'
        return undefined
      })

      expect(mod.hasSecret('api-key')).toBe(true)
    })

    it('returns false when a credential does not exist', () => {
      mockGet.mockReturnValue(undefined)

      expect(mod.hasSecret('nope')).toBe(false)
    })

    it('returns false for empty string stored value', () => {
      mockGet.mockImplementation((path: string) => {
        if (path === 'credentials.empty') return ''
        return undefined
      })

      expect(mod.hasSecret('empty')).toBe(false)
    })
  })

  // ── getSecretPreview ───────────────────────────────────────────────
  describe('getSecretPreview', () => {
    it('returns masked preview for a long secret', () => {
      // Simulate a stored+retrievable secret
      const secret = 'ghp_abcdefghijklmnop'
      const encrypted = Buffer.from(secret).toString('base64')
      mockGet.mockImplementation((path: string) => {
        if (path === `credentials.token`) return encrypted
        if (path === 'credentials') return { token: encrypted }
        return undefined
      })

      const preview = mod.getSecretPreview('token')

      // First 4 chars + masked middle + last 4 chars
      expect(preview.startsWith('ghp_')).toBe(true)
      expect(preview.endsWith('mnop')).toBe(true)
      expect(preview).toContain('*')
      expect(preview.length).toBeGreaterThan(8)
      // Must not contain the full secret
      expect(preview).not.toBe(secret)
    })

    it('returns empty string when key is not found', () => {
      mockGet.mockImplementation((path: string) => {
        if (path === 'credentials') return {}
        return undefined
      })

      expect(mod.getSecretPreview('missing')).toBe('')
    })

    it('returns all stars for a short secret (8 chars or less)', () => {
      const short = 'abc'
      const encrypted = Buffer.from(short).toString('base64')
      mockGet.mockImplementation((path: string) => {
        if (path === `credentials.short`) return encrypted
        if (path === 'credentials') return { short: encrypted }
        return undefined
      })

      const preview = mod.getSecretPreview('short')
      expect(preview).toBe('***')
    })

    it('returns all stars for exactly 8-char secret', () => {
      const eightChars = '12345678'
      const encrypted = Buffer.from(eightChars).toString('base64')
      mockGet.mockImplementation((path: string) => {
        if (path === `credentials.eight`) return encrypted
        if (path === 'credentials') return { eight: encrypted }
        return undefined
      })

      const preview = mod.getSecretPreview('eight')
      expect(preview).toBe('********')
    })

    it('masks the correct number of characters for a 12-char secret', () => {
      // For value.length=12: first 4 + min(12-8, 20)=4 stars + last 4 = 12 chars
      const secret = 'abcd1234efgh'
      const encrypted = Buffer.from(secret).toString('base64')
      mockGet.mockImplementation((path: string) => {
        if (path === `credentials.med`) return encrypted
        if (path === 'credentials') return { med: encrypted }
        return undefined
      })

      const preview = mod.getSecretPreview('med')
      expect(preview).toBe('abcd****efgh')
    })

    it('caps the masked portion at 20 stars for very long secrets', () => {
      // For value.length=50: first 4 + min(50-8, 20)=20 stars + last 4 = 28 chars
      const secret = 'ABCDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1234'
      expect(secret.length).toBe(50)
      const encrypted = Buffer.from(secret).toString('base64')
      mockGet.mockImplementation((path: string) => {
        if (path === `credentials.long`) return encrypted
        if (path === 'credentials') return { long: encrypted }
        return undefined
      })

      const preview = mod.getSecretPreview('long')
      expect(preview).toBe('ABCD' + '*'.repeat(20) + '1234')
      expect(preview.length).toBe(28)
    })
  })
})
