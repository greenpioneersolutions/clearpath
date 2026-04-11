import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared store data via globalThis ────────────────────────────────────────

const STORE_KEY = '__accessibilityTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__accessibilityTestStoreData'] as Record<string, unknown>
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

describe('accessibilityHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('./accessibilityHandlers')
    mod.registerAccessibilityHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('accessibility:get')
    expect(channels).toContain('accessibility:set')
    expect(channels).toContain('accessibility:reset')
  })

  describe('accessibility:get', () => {
    it('returns default settings when no overrides exist', () => {
      const handler = getHandler('accessibility:get')
      const result = handler(mockEvent)
      expect(result).toEqual({
        fontScale: 1.0,
        reducedMotion: false,
        highContrast: false,
        focusStyle: 'ring',
        screenReaderMode: false,
        keyboardShortcutsEnabled: true,
      })
    })
  })

  describe('accessibility:set', () => {
    it('merges partial settings with current', () => {
      const handler = getHandler('accessibility:set')
      const result = handler(mockEvent, { fontScale: 1.5, highContrast: true })
      expect(result).toMatchObject({ fontScale: 1.5, highContrast: true, reducedMotion: false })
    })

    it('preserves unchanged settings', () => {
      const setHandler = getHandler('accessibility:set')
      setHandler(mockEvent, { reducedMotion: true })
      const getHandler2 = getHandler('accessibility:get')
      const result = getHandler2(mockEvent)
      expect(result).toMatchObject({
        reducedMotion: true,
        fontScale: 1.0,
        keyboardShortcutsEnabled: true,
      })
    })
  })

  describe('accessibility:reset', () => {
    it('restores all defaults', () => {
      const setHandler = getHandler('accessibility:set')
      setHandler(mockEvent, { fontScale: 2.0, highContrast: true, reducedMotion: true })

      const resetHandler = getHandler('accessibility:reset')
      const result = resetHandler(mockEvent)
      expect(result).toEqual({
        fontScale: 1.0,
        reducedMotion: false,
        highContrast: false,
        focusStyle: 'ring',
        screenReaderMode: false,
        keyboardShortcutsEnabled: true,
      })
    })
  })
})
