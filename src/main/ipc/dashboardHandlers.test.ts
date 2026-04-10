import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared store data ───────────────────────────────────────────────────────

const STORE_KEY = '__dashboardTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__dashboardTestStoreData'] as Record<string, unknown>
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

describe('dashboardHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('./dashboardHandlers')
    mod.registerDashboardHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('dashboard:get-active-layout')
    expect(channels).toContain('dashboard:list-layouts')
    expect(channels).toContain('dashboard:set-active')
    expect(channels).toContain('dashboard:save-layout')
    expect(channels).toContain('dashboard:reset-layout')
  })

  describe('dashboard:get-active-layout', () => {
    it('returns Developer preset layout by default', () => {
      const handler = getHandler('dashboard:get-active-layout')
      const result = handler(mockEvent) as { id: string; name: string; widgets: unknown[] }
      expect(result.id).toBe('layout-developer')
      expect(result.name).toBe('Developer')
      expect(result.widgets.length).toBeGreaterThan(0)
    })
  })

  describe('dashboard:list-layouts', () => {
    it('returns preset layouts when no user layouts exist', () => {
      const handler = getHandler('dashboard:list-layouts')
      const result = handler(mockEvent) as Array<{ id: string }>
      expect(result.length).toBeGreaterThanOrEqual(3) // Developer, Manager, Team Lead
      const ids = result.map((l) => l.id)
      expect(ids).toContain('layout-developer')
      expect(ids).toContain('layout-manager')
      expect(ids).toContain('layout-team-lead')
    })

    it('includes user layouts alongside presets', () => {
      const saveHandler = getHandler('dashboard:save-layout')
      saveHandler(mockEvent, { id: 'user-1', name: 'My Layout', widgets: [] })

      const listHandler = getHandler('dashboard:list-layouts')
      const result = listHandler(mockEvent) as Array<{ id: string }>
      const ids = result.map((l) => l.id)
      expect(ids).toContain('user-1')
      expect(ids).toContain('layout-developer')
    })
  })

  describe('dashboard:set-active', () => {
    it('changes the active layout', () => {
      const setHandler = getHandler('dashboard:set-active')
      const result = setHandler(mockEvent, { id: 'layout-manager' }) as { success: boolean }
      expect(result.success).toBe(true)

      const getHandler2 = getHandler('dashboard:get-active-layout')
      const active = getHandler2(mockEvent) as { id: string }
      expect(active.id).toBe('layout-manager')
    })
  })

  describe('dashboard:save-layout', () => {
    it('creates a new user layout', () => {
      const handler = getHandler('dashboard:save-layout')
      const widgets = [{ i: 'w1', type: 'quick-prompt', x: 0, y: 0, w: 4, h: 2, config: {} }]
      const result = handler(mockEvent, { id: 'custom-1', name: 'Custom', widgets }) as {
        id: string; name: string; widgets: unknown[]
      }
      expect(result.id).toBe('custom-1')
      expect(result.name).toBe('Custom')
      expect(result.widgets).toEqual(widgets)
    })

    it('updates an existing user layout', () => {
      const handler = getHandler('dashboard:save-layout')
      handler(mockEvent, { id: 'custom-1', name: 'V1', widgets: [] })
      handler(mockEvent, { id: 'custom-1', name: 'V2', widgets: [{ i: 'w', type: 'x', x: 0, y: 0, w: 1, h: 1, config: {} }] })

      const listHandler = getHandler('dashboard:list-layouts')
      const layouts = listHandler(mockEvent) as Array<{ id: string; name: string }>
      const custom = layouts.filter((l) => l.id === 'custom-1')
      expect(custom).toHaveLength(1)
      expect(custom[0].name).toBe('V2')
    })

    it('user layout with same id as preset overrides preset in listing', () => {
      const handler = getHandler('dashboard:save-layout')
      handler(mockEvent, { id: 'layout-developer', name: 'My Developer', widgets: [] })

      const listHandler = getHandler('dashboard:list-layouts')
      const layouts = listHandler(mockEvent) as Array<{ id: string; name: string }>
      const devLayouts = layouts.filter((l) => l.id === 'layout-developer')
      expect(devLayouts).toHaveLength(1)
      expect(devLayouts[0].name).toBe('My Developer')
    })
  })

  describe('dashboard:reset-layout', () => {
    it('resets a preset layout by removing user override', () => {
      // Override a preset
      const saveHandler = getHandler('dashboard:save-layout')
      saveHandler(mockEvent, { id: 'layout-developer', name: 'My Dev', widgets: [] })

      // Reset
      const resetHandler = getHandler('dashboard:reset-layout')
      const result = resetHandler(mockEvent, { id: 'layout-developer' }) as { id: string; name: string }
      expect(result.name).toBe('Developer')
    })

    it('returns null for non-preset layout id', () => {
      const handler = getHandler('dashboard:reset-layout')
      const result = handler(mockEvent, { id: 'nonexistent' })
      expect(result).toBeNull()
    })
  })
})
