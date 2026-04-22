import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared store data ───────────────────────────────────────────────────────

const STORE_KEY = '__featureFlagTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__featureFlagTestStoreData'] as Record<string, unknown>
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

const mockEvent = { sender: { send: vi.fn() } } as unknown as Electron.IpcMainInvokeEvent

// ── Tests ───────────────────────────────────────────────────────────────────

describe('featureFlagHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('./featureFlagHandlers')
    mod.registerFeatureFlagHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('feature-flags:get')
    expect(channels).toContain('feature-flags:set')
    expect(channels).toContain('feature-flags:apply-preset')
    expect(channels).toContain('feature-flags:get-presets')
    expect(channels).toContain('feature-flags:reset')
  })

  describe('feature-flags:get', () => {
    it('returns resolved flags with all-on preset by default', () => {
      const handler = getHandler('feature-flags:get')
      const result = handler(mockEvent) as { flags: Record<string, boolean>; activePresetId: string }
      expect(result.activePresetId).toBe('all-on')
      expect(result.flags.showWork).toBe(true)
      expect(result.flags.showDashboard).toBe(true)
    })
  })

  describe('feature-flags:set', () => {
    it('applies individual flag overrides and clears preset', () => {
      const handler = getHandler('feature-flags:set')
      const result = handler(mockEvent, { showVoice: true, showComposer: true }) as Record<string, boolean>
      expect(result.showVoice).toBe(true)
      expect(result.showComposer).toBe(true)

      // Should clear active preset
      const getHandler2 = getHandler('feature-flags:get')
      const state = getHandler2(mockEvent) as { activePresetId: string | null }
      expect(state.activePresetId).toBeNull()
    })

    it('merges with existing overrides', () => {
      const handler = getHandler('feature-flags:set')
      handler(mockEvent, { showVoice: true })
      handler(mockEvent, { showComposer: true })

      const getHandler2 = getHandler('feature-flags:get')
      const result = getHandler2(mockEvent) as { flags: Record<string, boolean> }
      expect(result.flags.showVoice).toBe(true)
      expect(result.flags.showComposer).toBe(true)
    })
  })

  describe('feature-flags:apply-preset', () => {
    it('applies essentials preset and sets activePresetId', () => {
      const handler = getHandler('feature-flags:apply-preset')
      const result = handler(mockEvent, { presetId: 'essentials' }) as Record<string, boolean>
      expect(result.showWork).toBe(true)
      // Essentials disables these
      expect(result.showInsights).toBe(false)
      expect(result.showLearn).toBe(false)

      const getHandler2 = getHandler('feature-flags:get')
      const state = getHandler2(mockEvent) as { activePresetId: string }
      expect(state.activePresetId).toBe('essentials')
    })

    it('returns error for unknown preset', () => {
      const handler = getHandler('feature-flags:apply-preset')
      const result = handler(mockEvent, { presetId: 'nonexistent' }) as { error: string }
      expect(result.error).toBe('Unknown preset')
    })
  })

  describe('feature-flags:get-presets', () => {
    it('returns presets array', () => {
      const handler = getHandler('feature-flags:get-presets')
      const result = handler(mockEvent) as Array<{ id: string }>
      expect(Array.isArray(result)).toBe(true)
      const ids = result.map((p) => p.id)
      expect(ids).toContain('all-on')
      expect(ids).toContain('essentials')
      expect(ids).toContain('demo')
      expect(ids).toContain('manager')
    })
  })

  describe('feature-flags:reset', () => {
    it('clears all overrides and restores all-on preset', () => {
      const setHandler = getHandler('feature-flags:set')
      setHandler(mockEvent, { showWork: false, showDashboard: false })

      const resetHandler = getHandler('feature-flags:reset')
      const result = resetHandler(mockEvent) as Record<string, boolean>
      expect(result.showWork).toBe(true)
      expect(result.showDashboard).toBe(true)

      const getHandler2 = getHandler('feature-flags:get')
      const state = getHandler2(mockEvent) as { activePresetId: string }
      expect(state.activePresetId).toBe('all-on')
    })
  })
})
