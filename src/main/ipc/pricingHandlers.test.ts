import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import type { IpcMain, WebContents } from 'electron'
import { registerPricingHandlers } from './pricingHandlers'
import type { PricingService } from '../pricing/PricingService'

interface MockPricingService extends EventEmitter {
  getEffectiveTable: ReturnType<typeof vi.fn>
  getDefaults: ReturnType<typeof vi.fn>
  getOverrides: ReturnType<typeof vi.fn>
  getSettings: ReturnType<typeof vi.fn>
  setOverride: ReturnType<typeof vi.fn>
  clearOverride: ReturnType<typeof vi.fn>
  setSettings: ReturnType<typeof vi.fn>
  syncFromRemote: ReturnType<typeof vi.fn>
}

function makeMockService(): MockPricingService {
  const emitter = new EventEmitter() as MockPricingService
  emitter.getEffectiveTable = vi.fn(() => ({ lastUpdated: 'now', source: 's', models: {} }))
  emitter.getDefaults       = vi.fn(() => ({ lastUpdated: 'd',   source: 'd', models: {} }))
  emitter.getOverrides      = vi.fn(() => ({}))
  emitter.getSettings       = vi.fn(() => ({ remoteSyncEnabled: false, remoteUrl: '', lastSyncAt: null, lastSyncError: null }))
  emitter.setOverride       = vi.fn()
  emitter.clearOverride     = vi.fn()
  emitter.setSettings       = vi.fn()
  emitter.syncFromRemote    = vi.fn(async () => ({ ok: true, syncedAt: 123 }))
  return emitter
}

function makeMockIpc(): { ipc: IpcMain; handlers: Map<string, (...args: unknown[]) => unknown> } {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipc = {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
  } as unknown as IpcMain
  return { ipc, handlers }
}

const mockEvent = {} as Electron.IpcMainInvokeEvent

describe('registerPricingHandlers', () => {
  let svc: MockPricingService
  let ipc: IpcMain
  let handlers: Map<string, (...args: unknown[]) => unknown>
  let wcSend: ReturnType<typeof vi.fn>
  let webContents: WebContents

  beforeEach(() => {
    svc = makeMockService()
    ;({ ipc, handlers } = makeMockIpc())
    wcSend = vi.fn()
    webContents = { send: wcSend, isDestroyed: () => false } as unknown as WebContents
    registerPricingHandlers(ipc, svc as unknown as PricingService, () => webContents)
  })

  it('registers all 8 pricing channels', () => {
    const expected = [
      'pricing:get-effective', 'pricing:get-defaults', 'pricing:get-overrides',
      'pricing:get-settings',  'pricing:set-override', 'pricing:clear-override',
      'pricing:set-settings',  'pricing:sync-now',
    ]
    for (const channel of expected) {
      expect(handlers.has(channel), `missing handler for ${channel}`).toBe(true)
    }
  })

  it('pricing:get-effective delegates to PricingService.getEffectiveTable', async () => {
    const result = await handlers.get('pricing:get-effective')!(mockEvent)
    expect(svc.getEffectiveTable).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ lastUpdated: 'now', source: 's', models: {} })
  })

  it('pricing:set-override forwards model + override unchanged', async () => {
    await handlers.get('pricing:set-override')!(mockEvent, { model: 'gpt-5-mini', override: { includedInPlan: true } })
    expect(svc.setOverride).toHaveBeenCalledWith('gpt-5-mini', { includedInPlan: true })
  })

  it('pricing:clear-override forwards model unchanged', async () => {
    await handlers.get('pricing:clear-override')!(mockEvent, { model: 'opus' })
    expect(svc.clearOverride).toHaveBeenCalledWith('opus')
  })

  it('pricing:set-settings accepts a settings patch', async () => {
    await handlers.get('pricing:set-settings')!(mockEvent, { settings: { remoteSyncEnabled: true } })
    expect(svc.setSettings).toHaveBeenCalledWith({ remoteSyncEnabled: true })
  })

  it('pricing:sync-now returns the service result envelope', async () => {
    const result = await handlers.get('pricing:sync-now')!(mockEvent)
    expect(result).toEqual({ ok: true, syncedAt: 123 })
  })

  it('broadcasts pricing:changed to webContents whenever the service emits `changed`', () => {
    svc.emit('changed')
    expect(wcSend).toHaveBeenCalledWith('pricing:changed')
  })

  it('skips the webContents send when the window is destroyed (no crash)', () => {
    const destroyedWc = { send: vi.fn(), isDestroyed: () => true } as unknown as WebContents
    const fresh = makeMockService()
    const { ipc: ipc2 } = makeMockIpc()
    registerPricingHandlers(ipc2, fresh as unknown as PricingService, () => destroyedWc)
    fresh.emit('changed')
    expect((destroyedWc.send as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('skips the webContents send when getWebContents returns null', () => {
    const fresh = makeMockService()
    const { ipc: ipc2 } = makeMockIpc()
    registerPricingHandlers(ipc2, fresh as unknown as PricingService, () => null)
    // Should not throw.
    expect(() => fresh.emit('changed')).not.toThrow()
  })
})
