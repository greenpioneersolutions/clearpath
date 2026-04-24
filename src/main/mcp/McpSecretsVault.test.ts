import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// We don't mock fs here — the vault persists to a tmp file on disk.
// Electron's safeStorage is mocked via the global electron-mock.

describe('McpSecretsVault', () => {
  let tmpDir: string
  let vaultPath: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSafe: any

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    tmpDir = mkdtempSync(join(tmpdir(), 'mcp-vault-test-'))
    vaultPath = join(tmpDir, 'mcp-secrets.json')

    const electron = await import('electron')
    mockSafe = electron.safeStorage
    // Default to available: base64-roundtrip "encryption"
    mockSafe.isEncryptionAvailable.mockReturnValue(true)
    mockSafe.encryptString.mockImplementation((s: string) =>
      Buffer.from('enc:' + s, 'utf8'),
    )
    mockSafe.decryptString.mockImplementation((b: Buffer) => {
      const s = b.toString('utf8')
      if (!s.startsWith('enc:')) throw new Error('corrupt ciphertext')
      return s.slice(4)
    })
  })

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  describe('set + get round-trip (encryption available)', () => {
    it('stores and retrieves a secret', async () => {
      const { McpSecretsVault } = await import('./McpSecretsVault')
      const vault = new McpSecretsVault(vaultPath)

      vault.set('github-token', 'ghp_abc123')
      expect(vault.get('github-token')).toBe('ghp_abc123')
      expect(mockSafe.encryptString).toHaveBeenCalledWith('ghp_abc123')
    })

    it('isUnsafeMode stays false when encryption works', async () => {
      const { McpSecretsVault } = await import('./McpSecretsVault')
      const vault = new McpSecretsVault(vaultPath)
      vault.set('k', 'v')
      expect(vault.isUnsafeMode()).toBe(false)
    })

    it('persists across vault instances (reads from disk)', async () => {
      const { McpSecretsVault } = await import('./McpSecretsVault')
      const v1 = new McpSecretsVault(vaultPath)
      v1.set('persisted', 'value-xyz')

      const v2 = new McpSecretsVault(vaultPath)
      expect(v2.get('persisted')).toBe('value-xyz')
    })
  })

  describe('missing key', () => {
    it('returns null for unknown keys', async () => {
      const { McpSecretsVault } = await import('./McpSecretsVault')
      const vault = new McpSecretsVault(vaultPath)
      expect(vault.get('never-set')).toBeNull()
    })
  })

  describe('unsafeMode fallback (encryption unavailable)', () => {
    it('stores plaintext and flags unsafeMode', async () => {
      mockSafe.isEncryptionAvailable.mockReturnValue(false)

      const { McpSecretsVault } = await import('./McpSecretsVault')
      const vault = new McpSecretsVault(vaultPath)
      vault.set('bare', 'plain-value')

      expect(vault.isUnsafeMode()).toBe(true)
      expect(vault.get('bare')).toBe('plain-value')
      // Encryption should NOT have been attempted
      expect(mockSafe.encryptString).not.toHaveBeenCalled()
    })

    it('retrieves plaintext values across restarts in unsafeMode', async () => {
      mockSafe.isEncryptionAvailable.mockReturnValue(false)

      const { McpSecretsVault } = await import('./McpSecretsVault')
      const v1 = new McpSecretsVault(vaultPath)
      v1.set('bare', 'hello')

      const v2 = new McpSecretsVault(vaultPath)
      expect(v2.isUnsafeMode()).toBe(true)
      expect(v2.get('bare')).toBe('hello')
    })
  })

  describe('remove', () => {
    it('deletes a stored secret', async () => {
      const { McpSecretsVault } = await import('./McpSecretsVault')
      const vault = new McpSecretsVault(vaultPath)
      vault.set('temp', 'abc')
      expect(vault.get('temp')).toBe('abc')

      vault.remove('temp')
      expect(vault.get('temp')).toBeNull()
    })

    it('is a no-op for unknown keys', async () => {
      const { McpSecretsVault } = await import('./McpSecretsVault')
      const vault = new McpSecretsVault(vaultPath)
      expect(() => vault.remove('never-existed')).not.toThrow()
    })
  })

  describe('listKeys', () => {
    it('returns all stored keys without plaintext', async () => {
      const { McpSecretsVault } = await import('./McpSecretsVault')
      const vault = new McpSecretsVault(vaultPath)
      vault.set('a', '1')
      vault.set('b', '2')
      vault.set('c', '3')

      const keys = vault.listKeys().sort()
      expect(keys).toEqual(['a', 'b', 'c'])
    })

    it('returns empty array when vault is empty', async () => {
      const { McpSecretsVault } = await import('./McpSecretsVault')
      const vault = new McpSecretsVault(vaultPath)
      expect(vault.listKeys()).toEqual([])
    })
  })

  describe('decryption failure', () => {
    it('returns null when the ciphertext is corrupt', async () => {
      const { McpSecretsVault } = await import('./McpSecretsVault')
      const vault = new McpSecretsVault(vaultPath)
      vault.set('good', 'value')

      // Now make decryption throw
      mockSafe.decryptString.mockImplementation(() => {
        throw new Error('bad padding')
      })

      expect(vault.get('good')).toBeNull()
    })
  })
})
