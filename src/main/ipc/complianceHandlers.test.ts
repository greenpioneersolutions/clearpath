import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'

// ── Shared store data via globalThis (same reference across scopes) ──────────

const STORE_KEY = '__complianceHandlersTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

// ── vi.hoisted mocks ────────────────────────────────────────────────────────

const { mockRandomUUID, mockWriteFileSync, mockAppendFileSync, mockMkdirSync, mockExistsSync } = vi.hoisted(() => ({
  mockRandomUUID: vi.fn().mockReturnValue('test-uuid-1'),
  mockWriteFileSync: vi.fn(),
  mockAppendFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(false),
}))

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__complianceHandlersTestStoreData'] as Record<string, unknown>
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in sd)) {
              sd[k] = JSON.parse(JSON.stringify(v))
            }
          }
        }
      }

      get(key: string): unknown {
        const val = sd[key]
        return val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined
      }

      set(key: string, value: unknown): void {
        sd[key] = JSON.parse(JSON.stringify(value))
      }

      has(key: string): boolean {
        return key in sd
      }

      delete(key: string): void {
        delete sd[key]
      }
    },
  }
})

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-encryption-key',
}))

vi.mock('crypto', () => ({
  randomUUID: mockRandomUUID,
  createHash: vi.fn().mockReturnValue({ update: vi.fn().mockReturnThis(), digest: vi.fn().mockReturnValue('hash') }),
}))

vi.mock('fs', () => ({
  writeFileSync: mockWriteFileSync,
  appendFileSync: mockAppendFileSync,
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeData = (globalThis as any)[STORE_KEY] as Record<string, unknown>

// ── Helpers ──────────────────────────────────────────────────────────────────

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

const mockEvent = {} as Electron.IpcMainInvokeEvent

// ── Dynamic import with resetModules ────────────────────────────────────────

let registerComplianceHandlers: typeof import('./complianceHandlers').registerComplianceHandlers
let addAuditEntry: typeof import('./complianceHandlers').addAuditEntry
// Re-imported after resetModules so we share the same reference as the source
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dialog: any

// ── Tests ───────────────────────────────────────────────────────────────────

describe('complianceHandlers', () => {
  let handlers: HandlerMap
  let mockNotificationManager: { emit: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.clearAllMocks()
    ;(ipcMain.handle as ReturnType<typeof vi.fn>).mockClear()
    mockRandomUUID.mockReturnValue('test-uuid-1')

    // Reset store data
    for (const key of Object.keys(storeData)) delete storeData[key]

    // Dynamic import so module-level store picks up fresh mock state
    vi.resetModules()
    const [mod, electronMod] = await Promise.all([
      import('./complianceHandlers'),
      import('electron'),
    ])
    registerComplianceHandlers = mod.registerComplianceHandlers
    addAuditEntry = mod.addAuditEntry
    dialog = electronMod.dialog

    mockNotificationManager = { emit: vi.fn() }
    registerComplianceHandlers(ipcMain as unknown as Electron.IpcMain, mockNotificationManager as any)
    handlers = extractHandlers()
  })

  it('registers all expected channels', () => {
    const channels = Object.keys(handlers)
    expect(channels).toContain('compliance:log-event')
    expect(channels).toContain('compliance:get-log')
    expect(channels).toContain('compliance:scan-text')
    expect(channels).toContain('compliance:get-file-patterns')
    expect(channels).toContain('compliance:set-file-patterns')
    expect(channels).toContain('compliance:check-file')
    expect(channels).toContain('compliance:security-events')
    expect(channels).toContain('compliance:export-snapshot')
  })

  it('does NOT register compliance:clear-log (removed for security)', () => {
    expect(Object.keys(handlers)).not.toContain('compliance:clear-log')
  })

  // ── compliance:log-event ────────────────────────────────────────────────

  describe('compliance:log-event', () => {
    it('adds an audit entry with id and timestamp', () => {
      const result = handlers['compliance:log-event'](mockEvent, {
        actionType: 'session',
        summary: 'Session started',
        details: 'User started a CLI session',
      }) as any
      expect(result.id).toBe('test-uuid-1')
      expect(result.timestamp).toBeGreaterThan(0)
      expect(result.actionType).toBe('session')
      expect(result.summary).toBe('Session started')
    })

    it('persists the entry to the audit log', () => {
      handlers['compliance:log-event'](mockEvent, {
        actionType: 'prompt',
        summary: 'Prompt sent',
        details: 'User sent a prompt',
      })
      const log = storeData['auditLog'] as any[]
      expect(log.length).toBe(1)
      expect(log[0].actionType).toBe('prompt')
    })
  })

  // ── compliance:get-log ──────────────────────────────────────────────────

  describe('compliance:get-log', () => {
    beforeEach(() => {
      // Seed audit log with test entries
      let uuidCounter = 0
      mockRandomUUID.mockImplementation(() => `uuid-${++uuidCounter}`)

      storeData['auditLog'] = [
        { id: 'e1', timestamp: 1000, actionType: 'session', summary: 'Session A', details: 'details A' },
        { id: 'e2', timestamp: 2000, actionType: 'security-warning', summary: 'Security alert', details: 'leak found' },
        { id: 'e3', timestamp: 3000, actionType: 'prompt', summary: 'Prompt sent', details: 'user prompt' },
        { id: 'e4', timestamp: 4000, actionType: 'session', summary: 'Session B', details: 'details B' },
      ]
    })

    it('returns entries in reverse order (newest first), limited to 100 by default', () => {
      const result = handlers['compliance:get-log'](mockEvent) as any[]
      expect(result[0].id).toBe('e4')
      expect(result[result.length - 1].id).toBe('e1')
    })

    it('filters by actionType', () => {
      const result = handlers['compliance:get-log'](mockEvent, { actionType: 'session' }) as any[]
      expect(result).toHaveLength(2)
      expect(result.every((e: any) => e.actionType === 'session')).toBe(true)
    })

    it('filters by search term (case insensitive)', () => {
      const result = handlers['compliance:get-log'](mockEvent, { search: 'ALERT' }) as any[]
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('e2')
    })

    it('searches in both summary and details', () => {
      const result = handlers['compliance:get-log'](mockEvent, { search: 'leak' }) as any[]
      expect(result).toHaveLength(1)
      expect(result[0].summary).toBe('Security alert')
    })

    it('respects limit parameter', () => {
      const result = handlers['compliance:get-log'](mockEvent, { limit: 2 }) as any[]
      expect(result).toHaveLength(2)
      // Should get the last 2 entries (newest)
      expect(result[0].id).toBe('e4')
      expect(result[1].id).toBe('e3')
    })

    it('combines actionType filter with limit', () => {
      const result = handlers['compliance:get-log'](mockEvent, { actionType: 'session', limit: 1 }) as any[]
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('e4')
    })

    it('returns empty array when no entries match', () => {
      const result = handlers['compliance:get-log'](mockEvent, { actionType: 'policy-violation' }) as any[]
      expect(result).toHaveLength(0)
    })
  })

  // ── compliance:scan-text ────────────────────────────────────────────────

  describe('compliance:scan-text', () => {
    it('detects sensitive patterns in text', () => {
      const result = handlers['compliance:scan-text'](mockEvent, {
        text: 'Here is my key AKIAIOSFODNN7EXAMPLE',
      }) as any
      expect(result.hasSensitiveData).toBe(true)
      expect(result.matches.length).toBeGreaterThan(0)
      expect(result.matches[0].name).toBe('AWS Key')
    })

    it('detects GitHub tokens', () => {
      const result = handlers['compliance:scan-text'](mockEvent, {
        text: 'token is ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
      }) as any
      expect(result.hasSensitiveData).toBe(true)
      expect(result.matches.some((m: any) => m.name === 'GitHub Token')).toBe(true)
    })

    it('detects API keys starting with sk-', () => {
      const result = handlers['compliance:scan-text'](mockEvent, {
        text: 'key: sk-abcdefghijklmnopqrstuvwxyz',
      }) as any
      expect(result.hasSensitiveData).toBe(true)
      expect(result.matches.some((m: any) => m.name === 'API Key (sk-)')).toBe(true)
    })

    it('detects email addresses', () => {
      const result = handlers['compliance:scan-text'](mockEvent, {
        text: 'Contact user@example.com for help',
      }) as any
      expect(result.hasSensitiveData).toBe(true)
      expect(result.matches.some((m: any) => m.name === 'Email')).toBe(true)
    })

    it('detects connection strings', () => {
      const result = handlers['compliance:scan-text'](mockEvent, {
        text: 'DB: postgres://user:pass@host:5432/db',
      }) as any
      expect(result.hasSensitiveData).toBe(true)
      expect(result.matches.some((m: any) => m.name === 'Connection String')).toBe(true)
    })

    it('returns no matches for clean text', () => {
      const result = handlers['compliance:scan-text'](mockEvent, {
        text: 'This is a normal message with no secrets.',
      }) as any
      expect(result.hasSensitiveData).toBe(false)
      expect(result.matches).toHaveLength(0)
    })

    it('truncates long matches to 20 chars with ellipsis', () => {
      const result = handlers['compliance:scan-text'](mockEvent, {
        text: 'postgres://user:password@long-hostname.example.com:5432/database-name',
      }) as any
      expect(result.hasSensitiveData).toBe(true)
      const connMatch = result.matches.find((m: any) => m.name === 'Connection String')
      expect(connMatch).toBeDefined()
      // Match should be truncated: 20 chars + '...'
      expect(connMatch.match.length).toBeLessThanOrEqual(23)
      expect(connMatch.match).toContain('...')
    })

    it('emits notification when sensitive data is found', () => {
      handlers['compliance:scan-text'](mockEvent, {
        text: 'AKIAIOSFODNN7EXAMPLE',
      })
      expect(mockNotificationManager.emit).toHaveBeenCalledWith(expect.objectContaining({
        type: 'security-event',
        severity: 'warning',
        title: 'Sensitive data detected',
      }))
    })

    it('adds audit entry when sensitive data is found', () => {
      const beforeCount = ((storeData['auditLog'] as any[]) ?? []).length
      handlers['compliance:scan-text'](mockEvent, {
        text: 'AKIAIOSFODNN7EXAMPLE',
      })
      const afterCount = (storeData['auditLog'] as any[]).length
      expect(afterCount).toBeGreaterThan(beforeCount)
      const lastEntry = (storeData['auditLog'] as any[])[afterCount - 1]
      expect(lastEntry.actionType).toBe('security-warning')
    })

    it('does not emit notification when no sensitive data is found', () => {
      handlers['compliance:scan-text'](mockEvent, {
        text: 'Just normal text',
      })
      expect(mockNotificationManager.emit).not.toHaveBeenCalled()
    })
  })

  // ── compliance:get-file-patterns / set-file-patterns ────────────────────

  describe('compliance:get-file-patterns', () => {
    it('returns default file protection patterns', () => {
      const result = handlers['compliance:get-file-patterns'](mockEvent) as string[]
      expect(result).toContain('.env*')
      expect(result).toContain('*.pem')
      expect(result).toContain('*.key')
      expect(result).toContain('*credentials*')
    })
  })

  describe('compliance:set-file-patterns', () => {
    it('updates file protection patterns', () => {
      const patterns = ['*.secret', '.env.local']
      const result = handlers['compliance:set-file-patterns'](mockEvent, { patterns }) as any
      expect(result.success).toBe(true)

      const stored = handlers['compliance:get-file-patterns'](mockEvent) as string[]
      expect(stored).toEqual(patterns)
    })
  })

  // ── compliance:check-file ───────────────────────────────────────────────

  describe('compliance:check-file', () => {
    it('blocks files matching protection patterns', () => {
      const result = handlers['compliance:check-file'](mockEvent, { path: '.env.production' }) as any
      expect(result.blocked).toBe(true)
    })

    it('blocks .pem files', () => {
      const result = handlers['compliance:check-file'](mockEvent, { path: 'server.pem' }) as any
      expect(result.blocked).toBe(true)
    })

    it('blocks .key files', () => {
      const result = handlers['compliance:check-file'](mockEvent, { path: 'private.key' }) as any
      expect(result.blocked).toBe(true)
    })

    it('blocks files with "credentials" in name', () => {
      const result = handlers['compliance:check-file'](mockEvent, { path: 'aws-credentials.json' }) as any
      expect(result.blocked).toBe(true)
    })

    it('blocks files with "secret" in name', () => {
      const result = handlers['compliance:check-file'](mockEvent, { path: 'my-secret-config.yaml' }) as any
      expect(result.blocked).toBe(true)
    })

    it('allows non-matching files', () => {
      const result = handlers['compliance:check-file'](mockEvent, { path: 'src/main.ts' }) as any
      expect(result.blocked).toBe(false)
    })

    it('adds audit entry when a file is blocked', () => {
      const beforeCount = ((storeData['auditLog'] as any[]) ?? []).length
      handlers['compliance:check-file'](mockEvent, { path: '.env' })
      const afterCount = (storeData['auditLog'] as any[]).length
      expect(afterCount).toBeGreaterThan(beforeCount)
    })

    it('does not add audit entry for allowed files', () => {
      const beforeCount = ((storeData['auditLog'] as any[]) ?? []).length
      handlers['compliance:check-file'](mockEvent, { path: 'README.md' })
      const afterCount = ((storeData['auditLog'] as any[]) ?? []).length
      expect(afterCount).toBe(beforeCount)
    })
  })

  // ── compliance:security-events ──────────────────────────────────────────

  describe('compliance:security-events', () => {
    beforeEach(() => {
      storeData['auditLog'] = [
        { id: 'e1', timestamp: 1000, actionType: 'session', summary: 'Session', details: '' },
        { id: 'e2', timestamp: 2000, actionType: 'security-warning', summary: 'Sec warn', details: '' },
        { id: 'e3', timestamp: 3000, actionType: 'policy-violation', summary: 'Policy', details: '' },
        { id: 'e4', timestamp: 4000, actionType: 'prompt', summary: 'Prompt', details: '' },
        { id: 'e5', timestamp: 5000, actionType: 'security-warning', summary: 'Sec warn 2', details: '' },
      ]
    })

    it('returns only security-warning and policy-violation events', () => {
      const result = handlers['compliance:security-events'](mockEvent) as any[]
      expect(result).toHaveLength(3)
      expect(result.every((e: any) => ['security-warning', 'policy-violation'].includes(e.actionType))).toBe(true)
    })

    it('returns events in reverse order (newest first)', () => {
      const result = handlers['compliance:security-events'](mockEvent) as any[]
      expect(result[0].id).toBe('e5')
      expect(result[result.length - 1].id).toBe('e2')
    })

    it('respects limit parameter', () => {
      const result = handlers['compliance:security-events'](mockEvent, { limit: 1 }) as any[]
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('e5')
    })

    it('defaults to limit of 10', () => {
      // Add more events to exceed default limit
      const log = storeData['auditLog'] as any[]
      for (let i = 0; i < 15; i++) {
        log.push({ id: `sec-${i}`, timestamp: 10000 + i, actionType: 'security-warning', summary: `Warn ${i}`, details: '' })
      }
      storeData['auditLog'] = log

      const result = handlers['compliance:security-events'](mockEvent) as any[]
      expect(result).toHaveLength(10)
    })
  })

  // ── compliance:export-snapshot ──────────────────────────────────────────

  describe('compliance:export-snapshot', () => {
    beforeEach(() => {
      storeData['auditLog'] = [
        { id: 'e1', timestamp: 1000, actionType: 'session', summary: 'Session', details: '' },
        { id: 'e2', timestamp: 5000, actionType: 'security-warning', summary: 'Warn', details: '' },
      ]
    })

    it('returns canceled when dialog is canceled', async () => {
      ;(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({ canceled: true })
      const result = await handlers['compliance:export-snapshot'](mockEvent) as any
      expect(result.canceled).toBe(true)
      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })

    it('writes snapshot to selected file path', async () => {
      ;(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({ canceled: false, filePath: '/tmp/snapshot.json' })
      const result = await handlers['compliance:export-snapshot'](mockEvent) as any
      expect(result.path).toBe('/tmp/snapshot.json')
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/tmp/snapshot.json',
        expect.any(String),
        'utf8',
      )
    })

    it('snapshot includes all expected fields', async () => {
      ;(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({ canceled: false, filePath: '/tmp/snapshot.json' })
      await handlers['compliance:export-snapshot'](mockEvent)
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1].trim())
      expect(written).toHaveProperty('exportedAt')
      expect(written).toHaveProperty('auditLogEntries')
      expect(written).toHaveProperty('auditLog')
      expect(written).toHaveProperty('fileProtectionPatterns')
      expect(written).toHaveProperty('summary')
      expect(written.summary).toHaveProperty('totalEvents')
      expect(written.summary).toHaveProperty('securityWarnings')
      expect(written.summary).toHaveProperty('policyViolations')
      expect(written.summary).toHaveProperty('sessions')
      expect(written.summary).toHaveProperty('prompts')
    })

    it('filters by since timestamp', async () => {
      ;(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({ canceled: false, filePath: '/tmp/snapshot.json' })
      await handlers['compliance:export-snapshot'](mockEvent, { since: 3000 })
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1].trim())
      // Only e2 (timestamp 5000) should be included
      expect(written.auditLog).toHaveLength(1)
      expect(written.auditLog[0].id).toBe('e2')
      expect(written.summary.totalEvents).toBe(1)
    })

    it('includes all entries when since is 0', async () => {
      ;(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({ canceled: false, filePath: '/tmp/snapshot.json' })
      await handlers['compliance:export-snapshot'](mockEvent, { since: 0 })
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1].trim())
      expect(written.auditLog).toHaveLength(2)
    })
  })

  // ── addAuditEntry — archive overflow ──────────────────────────────────

  describe('addAuditEntry', () => {
    it('archives old entries when log exceeds 10000', () => {
      // Seed with exactly 10000 entries
      const bigLog: any[] = []
      for (let i = 0; i < 10000; i++) {
        bigLog.push({ id: `old-${i}`, timestamp: i, actionType: 'session', summary: `Entry ${i}`, details: '' })
      }
      storeData['auditLog'] = bigLog

      mockRandomUUID.mockReturnValue('new-entry-id')
      addAuditEntry({ actionType: 'prompt', summary: 'New entry', details: '' })

      // After adding, the log should be trimmed to 10000
      const log = storeData['auditLog'] as any[]
      expect(log.length).toBe(10000)
      // The newest entry should be the last one
      expect(log[log.length - 1].id).toBe('new-entry-id')

      // Archive should have been written
      expect(mockMkdirSync).toHaveBeenCalled()
      expect(mockAppendFileSync).toHaveBeenCalled()
    })

    it('does not archive when log is under limit', () => {
      storeData['auditLog'] = [
        { id: 'e1', timestamp: 1000, actionType: 'session', summary: 'Entry', details: '' },
      ]
      addAuditEntry({ actionType: 'prompt', summary: 'New', details: '' })
      expect(mockAppendFileSync).not.toHaveBeenCalled()
    })
  })
})
