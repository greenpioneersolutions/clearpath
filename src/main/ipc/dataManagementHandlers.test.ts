import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  existsSyncMock, statSyncMock, readdirSyncMock,
  readFileSyncMock, writeFileSyncMock,
  showMessageBoxMock, checkRateLimitMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn().mockReturnValue(false),
  statSyncMock: vi.fn().mockReturnValue({ size: 0, isFile: () => true }),
  readdirSyncMock: vi.fn().mockReturnValue([]),
  readFileSyncMock: vi.fn().mockReturnValue(''),
  writeFileSyncMock: vi.fn(),
  showMessageBoxMock: vi.fn().mockResolvedValue({ response: 1 }), // "Clear Data" button
  checkRateLimitMock: vi.fn().mockReturnValue({ allowed: true }),
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  statSync: statSyncMock,
  readdirSync: readdirSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}))

vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/mock/home'),
}))

vi.mock('electron', async (importOriginal) => {
  const orig = await importOriginal() as Record<string, unknown>
  return {
    ...orig,
    dialog: { showMessageBox: showMessageBoxMock },
  }
})

vi.mock('../utils/rateLimiter', () => ({
  checkRateLimit: checkRateLimitMock,
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-key',
}))

vi.mock('./complianceHandlers', () => ({
  addAuditEntry: vi.fn(),
}))

// ── Mock electron-store with clear support ──────────────────────────────────

const STORE_KEY = '__dataMgmtTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

// Track store instances by name so we can verify clear() calls
const storeInstances = new Map<string, Record<string, unknown>>()

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: Record<string, unknown>
      constructor(opts?: { name?: string; defaults?: Record<string, unknown> }) {
        // Use the global store data for the module-level store
        if (!opts?.name || opts.name === 'clear-path-dashboard') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.data = (globalThis as any)['__dataMgmtTestStoreData'] as Record<string, unknown>
        } else {
          // For stores created inside handlers (clear operations)
          this.data = {}
        }
        if (opts?.name) storeInstances.set(opts.name, this.data)
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in this.data)) this.data[k] = JSON.parse(JSON.stringify(v))
          }
        }
      }
      get store(): Record<string, unknown> { return this.data }
      get(key: string): unknown {
        const val = this.data[key]
        return val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined
      }
      set(key: string, value: unknown): void {
        this.data[key] = JSON.parse(JSON.stringify(value))
      }
      clear(): void {
        for (const key of Object.keys(this.data)) delete this.data[key]
      }
    },
  }
})

import { ipcMain } from 'electron'

// ── Helpers ─────────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => unknown
function getHandler(channel: string): HandlerFn {
  const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c: unknown[]) => c[0] === channel,
  )
  if (calls.length === 0) throw new Error(`No handler registered for channel: ${channel}`)
  return calls[calls.length - 1][1] as HandlerFn
}

const mockEvent = {} as Electron.IpcMainInvokeEvent

// ── Tests ───────────────────────────────────────────────────────────────────

describe('dataManagementHandlers', () => {
  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sd = (globalThis as any)[STORE_KEY] as Record<string, unknown>
    for (const key of Object.keys(sd)) delete sd[key]
    storeInstances.clear()
    vi.clearAllMocks()
    checkRateLimitMock.mockReturnValue({ allowed: true })
    showMessageBoxMock.mockResolvedValue({ response: 1 })

    vi.resetModules()
    const mod = await import('./dataManagementHandlers')
    mod.registerDataManagementHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('data:get-storage-stats')
    expect(channels).toContain('data:clear-store')
    expect(channels).toContain('data:clear-all')
    expect(channels).toContain('data:get-notes-for-compact')
    expect(channels).toContain('data:compact-notes')
  })

  describe('data:get-storage-stats', () => {
    it('returns stats for all stores', () => {
      const handler = getHandler('data:get-storage-stats')
      const result = handler(mockEvent) as {
        stores: Array<{ id: string; label: string }>
        totalSizeBytes: number
        knowledgeBase: { files: number }
      }
      expect(result.stores.length).toBeGreaterThan(0)
      expect(result.totalSizeBytes).toBeDefined()
      expect(result.knowledgeBase).toBeDefined()
    })
  })

  describe('data:clear-store', () => {
    it('returns error for unknown store ID', async () => {
      const handler = getHandler('data:clear-store')
      const result = await handler(mockEvent, { storeId: 'nonexistent' }) as { error: string }
      expect(result.error).toBe('Unknown store')
    })

    it('prevents clearing compliance logs', async () => {
      const handler = getHandler('data:clear-store')
      const result = await handler(mockEvent, { storeId: 'compliance' }) as { error: string }
      expect(result.error).toContain('cannot be cleared')
    })

    it('returns canceled when user cancels dialog', async () => {
      showMessageBoxMock.mockResolvedValue({ response: 0 })
      const handler = getHandler('data:clear-store')
      const result = await handler(mockEvent, { storeId: 'sessions' }) as { canceled: boolean }
      expect(result.canceled).toBe(true)
    })

    it('clears store when user confirms', async () => {
      showMessageBoxMock.mockResolvedValue({ response: 1 })
      const handler = getHandler('data:clear-store')
      const result = await handler(mockEvent, { storeId: 'sessions' }) as { success: boolean; storeId: string }
      expect(result.success).toBe(true)
      expect(result.storeId).toBe('sessions')
    })

    it('returns rate limit error when throttled', async () => {
      checkRateLimitMock.mockReturnValue({ allowed: false })
      const handler = getHandler('data:clear-store')
      const result = await handler(mockEvent, { storeId: 'sessions' }) as { error: string }
      expect(result.error).toContain('Rate limited')
    })
  })

  describe('data:clear-all', () => {
    it('returns canceled when user cancels dialog', async () => {
      showMessageBoxMock.mockResolvedValue({ response: 0 })
      const handler = getHandler('data:clear-all')
      const result = await handler(mockEvent) as { canceled: boolean }
      expect(result.canceled).toBe(true)
    })

    it('clears all stores except compliance', async () => {
      showMessageBoxMock.mockResolvedValue({ response: 1 })
      const handler = getHandler('data:clear-all')
      const result = await handler(mockEvent) as { results: Array<{ id: string; success: boolean }> }
      expect(result.results).toBeDefined()
      // Compliance should NOT be cleared
      const complianceResult = result.results.find((r) => r.id === 'compliance')
      expect(complianceResult?.success).toBe(false)
    })

    it('returns rate limit error when throttled', async () => {
      checkRateLimitMock.mockReturnValue({ allowed: false })
      const handler = getHandler('data:clear-all')
      const result = await handler(mockEvent) as { error: string }
      expect(result.error).toBe('Rate limited')
    })
  })

  describe('data:get-notes-for-compact', () => {
    it('returns empty array when no notes exist', () => {
      const handler = getHandler('data:get-notes-for-compact')
      const result = handler(mockEvent) as unknown[]
      expect(result).toEqual([])
    })
  })

  describe('data:compact-notes', () => {
    it('returns error when fewer than 2 notes selected', () => {
      const handler = getHandler('data:compact-notes')
      const result = handler(mockEvent, {
        noteIds: ['only-one'],
        newTitle: 'Merged',
      }) as { error: string }
      expect(result.error).toContain('at least 2')
    })
  })
})
