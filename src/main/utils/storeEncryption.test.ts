import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import { homedir, hostname, userInfo } from 'os'

// ── Compute expected values (mirror the module's logic) ───────────────────────
const expectedMachineKey = createHash('sha256')
  .update(`clearpath:${homedir()}:${hostname()}:${userInfo().username}`)
  .digest('hex')

const expectedFingerprint = createHash('sha256').update(expectedMachineKey).digest('hex').slice(0, 16)

// ── Mock 'fs' BEFORE importing the module under test ─────────────────────────
// vi.hoisted() ensures these vi.fn() instances are initialised before the
// vi.mock() factory runs (vi.mock is hoisted above all imports by Vitest's
// transformer; plain const declarations are NOT, so the factory would
// otherwise capture undefined references).
const { mkdirSyncMock, existsSyncMock, readFileSyncMock, writeFileSyncMock } = vi.hoisted(() => ({
  mkdirSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    mkdirSync: mkdirSyncMock,
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
  }
})

describe('storeEncryption', () => {
  let getStoreEncryptionKey: typeof import('./storeEncryption').getStoreEncryptionKey
  let checkEncryptionKeyIntegrity: typeof import('./storeEncryption').checkEncryptionKeyIntegrity

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('./storeEncryption')
    getStoreEncryptionKey = mod.getStoreEncryptionKey
    checkEncryptionKeyIntegrity = mod.checkEncryptionKeyIntegrity
  })

  describe('getStoreEncryptionKey', () => {
    it('returns a 64-character hex string (SHA256)', () => {
      const key = getStoreEncryptionKey()
      expect(key).toMatch(/^[0-9a-f]{64}$/)
    })

    it('returns a deterministic value on repeated calls', () => {
      expect(getStoreEncryptionKey()).toBe(getStoreEncryptionKey())
    })

    it('returns the expected machine-derived key', () => {
      expect(getStoreEncryptionKey()).toBe(expectedMachineKey)
    })
  })

  describe('checkEncryptionKeyIntegrity', () => {
    it('reports first run when no fingerprint file exists', () => {
      existsSyncMock.mockReturnValue(false)

      const result = checkEncryptionKeyIntegrity()

      expect(result).toEqual({ changed: false, isFirstRun: true })
      // Should have written the fingerprint
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        expect.any(String),
        expectedFingerprint,
        'utf8',
      )
    })

    it('reports no change when fingerprint file matches current key', () => {
      existsSyncMock.mockReturnValue(true)
      readFileSyncMock.mockReturnValue(expectedFingerprint)

      const result = checkEncryptionKeyIntegrity()

      expect(result).toEqual({ changed: false, isFirstRun: false })
      // Should NOT have overwritten the fingerprint
      expect(writeFileSyncMock).not.toHaveBeenCalled()
    })

    it('reports changed when stored fingerprint differs from current key', () => {
      existsSyncMock.mockReturnValue(true)
      readFileSyncMock.mockReturnValue('000000000000dead') // stale fingerprint

      const result = checkEncryptionKeyIntegrity()

      expect(result).toEqual({ changed: true, isFirstRun: false })
      // Should update the fingerprint file with the new value
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        expect.any(String),
        expectedFingerprint,
        'utf8',
      )
    })

    it('returns { changed: false, isFirstRun: false } when readFileSync throws', () => {
      existsSyncMock.mockReturnValue(true)
      readFileSyncMock.mockImplementation(() => {
        throw new Error('permission denied')
      })

      const result = checkEncryptionKeyIntegrity()

      expect(result).toEqual({ changed: false, isFirstRun: false })
    })

    it('always attempts to create the key directory', () => {
      existsSyncMock.mockReturnValue(false)

      checkEncryptionKeyIntegrity()

      expect(mkdirSyncMock).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    })

    it('handles writeFileSync failure on first run gracefully', () => {
      existsSyncMock.mockReturnValue(false)
      writeFileSyncMock.mockImplementation(() => {
        throw new Error('disk full')
      })

      // Should not throw
      expect(() => checkEncryptionKeyIntegrity()).not.toThrow()
      const result = checkEncryptionKeyIntegrity()
      expect(result).toEqual({ changed: false, isFirstRun: true })
    })
  })
})
