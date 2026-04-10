import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared store data ───────────────────────────────────────────────────────

const STORE_KEY = '__sessionHistoryTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__sessionHistoryTestStoreData'] as Record<string, unknown>
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in sd)) sd[k] = JSON.parse(JSON.stringify(v))
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
    },
  }
})

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-key',
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeData = (globalThis as any)[STORE_KEY] as Record<string, unknown>

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

describe('sessionHistoryHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('./sessionHistoryHandlers')
    mod.registerSessionHistoryHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('session-history:list')
    expect(channels).toContain('session-history:add')
    expect(channels).toContain('session-history:update')
    expect(channels).toContain('session-history:clear')
  })

  describe('session-history:list', () => {
    it('returns empty array by default', () => {
      const handler = getHandler('session-history:list')
      const result = handler(mockEvent)
      expect(result).toEqual([])
    })
  })

  describe('session-history:add', () => {
    it('adds a new session to history', () => {
      const addHandler = getHandler('session-history:add')
      addHandler(mockEvent, { sessionId: 's1', cli: 'copilot', startedAt: 1000 })

      const listHandler = getHandler('session-history:list')
      const result = listHandler(mockEvent) as Array<{ sessionId: string }>
      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('s1')
    })

    it('updates existing session by sessionId', () => {
      const addHandler = getHandler('session-history:add')
      addHandler(mockEvent, { sessionId: 's1', cli: 'copilot', startedAt: 1000 })
      addHandler(mockEvent, { sessionId: 's1', cli: 'copilot', startedAt: 1000, name: 'Updated' })

      const listHandler = getHandler('session-history:list')
      const result = listHandler(mockEvent) as Array<{ sessionId: string; name?: string }>
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Updated')
    })

    it('prepends new sessions', () => {
      const addHandler = getHandler('session-history:add')
      addHandler(mockEvent, { sessionId: 's1', cli: 'copilot', startedAt: 1000 })
      addHandler(mockEvent, { sessionId: 's2', cli: 'claude', startedAt: 2000 })

      const listHandler = getHandler('session-history:list')
      const result = listHandler(mockEvent) as Array<{ sessionId: string }>
      expect(result[0].sessionId).toBe('s2')
      expect(result[1].sessionId).toBe('s1')
    })

    it('enforces MAX_HISTORY limit of 100', () => {
      const addHandler = getHandler('session-history:add')
      for (let i = 0; i < 105; i++) {
        addHandler(mockEvent, { sessionId: `s${i}`, cli: 'copilot', startedAt: i * 1000 })
      }

      const listHandler = getHandler('session-history:list')
      const result = listHandler(mockEvent) as unknown[]
      expect(result.length).toBe(100)
    })
  })

  describe('session-history:update', () => {
    it('updates endedAt for an existing session', () => {
      const addHandler = getHandler('session-history:add')
      addHandler(mockEvent, { sessionId: 's1', cli: 'copilot', startedAt: 1000 })

      const updateHandler = getHandler('session-history:update')
      updateHandler(mockEvent, { sessionId: 's1', endedAt: 5000 })

      const listHandler = getHandler('session-history:list')
      const result = listHandler(mockEvent) as Array<{ sessionId: string; endedAt?: number }>
      expect(result[0].endedAt).toBe(5000)
    })

    it('does nothing for non-existent session', () => {
      // Start with a known session
      const addHandler = getHandler('session-history:add')
      addHandler(mockEvent, { sessionId: 's1', cli: 'copilot', startedAt: 1000 })

      const updateHandler = getHandler('session-history:update')
      // Should not throw — update a session that doesn't exist
      updateHandler(mockEvent, { sessionId: 'nonexistent', endedAt: 5000 })

      // Original session should be unchanged
      const listHandler = getHandler('session-history:list')
      const result = listHandler(mockEvent) as Array<{ sessionId: string; endedAt?: number }>
      expect(result).toHaveLength(1)
      expect(result[0].sessionId).toBe('s1')
      expect(result[0].endedAt).toBeUndefined()
    })
  })

  describe('session-history:clear', () => {
    it('clears all session history', () => {
      const addHandler = getHandler('session-history:add')
      addHandler(mockEvent, { sessionId: 's1', cli: 'copilot', startedAt: 1000 })
      addHandler(mockEvent, { sessionId: 's2', cli: 'claude', startedAt: 2000 })

      const clearHandler = getHandler('session-history:clear')
      clearHandler(mockEvent)

      const listHandler = getHandler('session-history:list')
      const result = listHandler(mockEvent) as unknown[]
      expect(result).toHaveLength(0)
    })
  })
})
