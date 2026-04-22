import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared store data ───────────────────────────────────────────────────────

const STORE_KEY = '__brandingTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__brandingTestStoreData'] as Record<string, unknown>
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
import type { BrandingConfig } from './brandingHandlers'

// We'll import DEFAULT_BRANDING from the dynamic module in tests
let DEFAULT_BRANDING: BrandingConfig

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

describe('brandingHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('./brandingHandlers')
    DEFAULT_BRANDING = mod.DEFAULT_BRANDING
    mod.registerBrandingHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('branding:get')
    expect(channels).toContain('branding:set')
    expect(channels).toContain('branding:reset')
    expect(channels).toContain('branding:apply-preset')
    expect(channels).toContain('branding:get-presets')
  })

  describe('branding:get', () => {
    it('returns default branding config', () => {
      const handler = getHandler('branding:get')
      const result = handler(mockEvent)
      expect(result).toEqual(DEFAULT_BRANDING)
    })
  })

  describe('branding:set', () => {
    it('merges partial branding overrides', () => {
      const handler = getHandler('branding:set')
      const result = handler(mockEvent, { appName: 'MyApp', colorMode: 'dark' }) as Record<string, unknown>
      expect(result.appName).toBe('MyApp')
      expect(result.colorMode).toBe('dark')
      expect(result.colorPrimary).toBe(DEFAULT_BRANDING.colorPrimary)
    })
  })

  describe('branding:reset', () => {
    it('restores defaults after customization', () => {
      const setHandler = getHandler('branding:set')
      setHandler(mockEvent, { appName: 'Custom', colorPrimary: '#000000' })

      const resetHandler = getHandler('branding:reset')
      const result = resetHandler(mockEvent)
      expect(result).toEqual(DEFAULT_BRANDING)
    })
  })

  describe('branding:apply-preset', () => {
    it('applies a valid preset', () => {
      const handler = getHandler('branding:apply-preset')
      const result = handler(mockEvent, { presetId: 'midnight' }) as Record<string, unknown>
      expect(result.colorPrimary).toBe('#312E81')
      // Still has defaults for unset fields
      expect(result.appName).toBe(DEFAULT_BRANDING.appName)
    })

    it('returns error for unknown preset', () => {
      const handler = getHandler('branding:apply-preset')
      const result = handler(mockEvent, { presetId: 'nonexistent' }) as { error: string }
      expect(result.error).toBe('Unknown preset')
    })
  })

  describe('branding:get-presets', () => {
    it('returns array of preset definitions', () => {
      const handler = getHandler('branding:get-presets')
      const result = handler(mockEvent) as Array<{ id: string; name: string }>
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      const ids = result.map((p) => p.id)
      expect(ids).toContain('default')
      expect(ids).toContain('midnight')
      expect(ids).toContain('forest')
    })
  })
})
