import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { existsSyncMock, readFileSyncMock, statSyncMock, assertPathMock, appGetVersionMock } =
  vi.hoisted(() => ({
    existsSyncMock: vi.fn().mockReturnValue(true),
    readFileSyncMock: vi.fn(),
    statSyncMock: vi.fn(),
    assertPathMock: vi.fn(),
    appGetVersionMock: vi.fn().mockReturnValue('1.0.0'),
  }))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  statSync: statSyncMock,
}))

vi.mock('crypto', () => ({
  createHash: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue('abc123hash'),
  }),
}))

vi.mock('../utils/pathSecurity', () => ({
  assertPathWithinRoots: assertPathMock,
}))

// ── Dynamic import ───────────────────────────────────────────────────────────

let ExtensionValidator: typeof import('./ExtensionValidator').ExtensionValidator

// ── Test fixtures ────────────────────────────────────────────────────────────

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'com.example.test-ext',
    name: 'Test Extension',
    version: '1.0.0',
    description: 'A test extension',
    author: 'Test Author',
    permissions: ['storage'],
    ...overrides,
  }
}

describe('ExtensionValidator', () => {
  beforeEach(async () => {
    vi.resetModules()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify(validManifest()))
    assertPathMock.mockImplementation(() => {})
    appGetVersionMock.mockReturnValue('1.0.0')

    const mod = await import('./ExtensionValidator')
    ExtensionValidator = mod.ExtensionValidator
  })

  describe('validateDirectory', () => {
    it('returns valid for a correct manifest', () => {
      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.manifest).toBeDefined()
      expect(result.manifest!.id).toBe('com.example.test-ext')
    })

    it('fails when clearpath-extension.json is missing', () => {
      existsSyncMock.mockReturnValue(false)

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing clearpath-extension.json')
    })

    it('fails on invalid JSON', () => {
      readFileSyncMock.mockReturnValue('{ not valid json }}}')

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toMatch(/Invalid JSON in manifest/)
    })

    it('fails when manifest is not an object', () => {
      readFileSyncMock.mockReturnValue('"just a string"')

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Manifest must be a JSON object')
    })

    // ── Required fields ──────────────────────────────────────────────────

    it.each(['id', 'name', 'version', 'description', 'author'])(
      'fails when required field "%s" is missing',
      (field) => {
        const manifest = validManifest()
        delete (manifest as Record<string, unknown>)[field]
        readFileSyncMock.mockReturnValue(JSON.stringify(manifest))

        const validator = new ExtensionValidator()
        const result = validator.validateDirectory('/test/ext')

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes(field))).toBe(true)
      },
    )

    it('fails when required field is an empty string', () => {
      readFileSyncMock.mockReturnValue(JSON.stringify(validManifest({ name: '   ' })))

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('name'))).toBe(true)
    })

    // ── ID format ────────────────────────────────────────────────────────

    it('fails on invalid ID format (no dots)', () => {
      readFileSyncMock.mockReturnValue(JSON.stringify(validManifest({ id: 'bad-id' })))

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toMatch(/Invalid extension ID/)
    })

    it('fails on invalid ID format (uppercase)', () => {
      readFileSyncMock.mockReturnValue(JSON.stringify(validManifest({ id: 'Com.Example.Test' })))

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toMatch(/Invalid extension ID/)
    })

    it('accepts valid reverse-domain IDs', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ id: 'com.example.my-extension' })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(true)
    })

    // ── Permissions ──────────────────────────────────────────────────────

    it('fails on unknown permission', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ permissions: ['storage', 'unknown:perm'] })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toMatch(/Unknown permission/)
    })

    it('fails when permissions is not an array', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ permissions: 'storage' })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('permissions must be an array')
    })

    it('accepts all valid permissions', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(
          validManifest({
            permissions: [
              'integration:github:read',
              'integration:github:write',
              'integration:backstage:read',
              'notifications:emit',
              'storage',
              'env:read',
              'http:fetch',
              'sessions:read',
              'cost:read',
            ],
          }),
        ),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(true)
    })

    // ── Entry point validation ───────────────────────────────────────────

    it('validates main entry exists and is within extension dir', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ main: 'dist/index.js' })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(true)
      expect(assertPathMock).toHaveBeenCalledWith(
        expect.stringContaining('dist/index.js'),
        ['/test/ext'],
      )
    })

    it('fails when main entry path traverses outside directory', () => {
      assertPathMock.mockImplementation(() => {
        throw new Error('Path traversal')
      })
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ main: '../../etc/passwd' })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('path traversal'))).toBe(true)
    })

    it('fails when main entry file does not exist', () => {
      // First call: manifest file exists. Subsequent: main entry doesn't exist.
      existsSyncMock.mockImplementation((p: string) => {
        if (String(p).includes('dist/index.js')) return false
        return true
      })
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ main: 'dist/index.js' })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('main entry file not found'))).toBe(true)
    })

    it('validates renderer entry similarly', () => {
      existsSyncMock.mockImplementation((p: string) => {
        if (String(p).includes('dist/renderer.js')) return false
        return true
      })
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ renderer: 'dist/renderer.js' })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('renderer entry file not found'))).toBe(true)
    })

    // ── IPC namespace enforcement ────────────────────────────────────────

    it('fails when IPC channel does not match namespace prefix', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(
          validManifest({
            ipcNamespace: 'com.test',
            ipcChannels: ['com.test:action', 'wrong:channel'],
          }),
        ),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('must start with namespace'))).toBe(true)
    })

    it('accepts channels matching the namespace', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(
          validManifest({
            ipcNamespace: 'com.test',
            ipcChannels: ['com.test:action', 'com.test:query'],
          }),
        ),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(true)
    })

    // ── allowedDomains ───────────────────────────────────────────────────

    it('blocks localhost in allowedDomains', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ allowedDomains: ['localhost'] })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Blocked private/local domain'))).toBe(true)
    })

    it.each(['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.0.1'])(
      'blocks private IP %s in allowedDomains',
      (ip) => {
        readFileSyncMock.mockReturnValue(
          JSON.stringify(validManifest({ allowedDomains: [ip] })),
        )

        const validator = new ExtensionValidator()
        const result = validator.validateDirectory('/test/ext')

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes('Blocked private/local domain'))).toBe(true)
      },
    )

    it('accepts valid public domains', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ allowedDomains: ['api.github.com', 'example.com'] })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(true)
    })

    it('fails when allowedDomains is not an array', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ allowedDomains: 'example.com' })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('allowedDomains must be an array of strings')
    })

    // ── storageQuota ─────────────────────────────────────────────────────

    it('fails when storageQuota is negative', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ storageQuota: -100 })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('positive number'))).toBe(true)
    })

    it('fails when storageQuota exceeds 50 MB', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ storageQuota: 60 * 1024 * 1024 })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('50 MB'))).toBe(true)
    })

    it('accepts valid storageQuota', () => {
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ storageQuota: 10 * 1024 * 1024 })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(true)
    })

    // ── Icon path traversal ──────────────────────────────────────────────

    it('fails when icon path escapes extension directory', () => {
      assertPathMock.mockImplementation(() => {
        throw new Error('Path traversal')
      })
      readFileSyncMock.mockReturnValue(
        JSON.stringify(validManifest({ icon: '../../evil.png' })),
      )

      const validator = new ExtensionValidator()
      const result = validator.validateDirectory('/test/ext')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('icon path'))).toBe(true)
    })
  })

  describe('hashManifest', () => {
    it('computes SHA-256 hash of the manifest file', () => {
      readFileSyncMock.mockReturnValue(Buffer.from('{}'))

      const validator = new ExtensionValidator()
      const hash = validator.hashManifest('/test/ext')

      expect(hash).toBe('abc123hash')
    })
  })
})
