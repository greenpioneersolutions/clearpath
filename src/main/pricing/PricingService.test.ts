import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted so the vi.mock factory (also hoisted) can close over the same Map
// the tests reset in beforeEach. Without vi.hoisted the const initializer
// would run AFTER the mock factory, leaving the closure pointing at undefined.
const { memoryStore } = vi.hoisted(() => ({
  memoryStore: new Map<string, unknown>(),
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private defaults: Record<string, unknown>
      constructor(opts: { defaults?: Record<string, unknown> } = {}) {
        this.defaults = opts.defaults ?? {}
        for (const [k, v] of Object.entries(this.defaults)) {
          if (!memoryStore.has(k)) memoryStore.set(k, structuredClone(v))
        }
      }
      get(key: string, fallback?: unknown): unknown {
        return memoryStore.has(key) ? memoryStore.get(key) : fallback
      }
      set(key: string, value: unknown): void {
        memoryStore.set(key, structuredClone(value))
      }
      has(key: string): boolean { return memoryStore.has(key) }
      delete(key: string): void { memoryStore.delete(key) }
    },
  }
})

// Dynamic import — setup-coverage.ts pre-loads source files via
// import.meta.glob BEFORE this test file's vi.mock takes effect, so a static
// `import { PricingService } from './PricingService'` would capture the real
// electron-store and write to the user's real on-disk store. resetModules +
// late import inside beforeEach guarantees the class binds to our mock.
let PricingService: typeof import('./PricingService').PricingService

beforeEach(async () => {
  memoryStore.clear()
  vi.resetModules()
  const mod = await import('./PricingService')
  PricingService = mod.PricingService
})

describe('PricingService', () => {
  describe('getEffectiveTable', () => {
    it('returns canonical defaults when no overrides or remote layer exist', () => {
      const svc = new PricingService()
      const eff = svc.getEffectiveTable()
      expect(eff.models['claude-sonnet-4.5']).toMatchObject({ input: 3, output: 15, source: 'default' })
      expect(eff.models['gpt-5-mini']).toMatchObject({ input: 0.4, output: 1.6, source: 'default' })
    })

    it('zeroes a model when includedInPlan override is set, with source=included', () => {
      const svc = new PricingService()
      svc.setOverride('gpt-5-mini', { includedInPlan: true })
      const entry = svc.getEffectiveTable().models['gpt-5-mini']
      expect(entry).toMatchObject({ input: 0, output: 0, source: 'included' })
    })

    it('applies numeric overrides on top of defaults with source=override', () => {
      const svc = new PricingService()
      svc.setOverride('claude-sonnet-4.5', { input: 6, output: 30 })
      const entry = svc.getEffectiveTable().models['claude-sonnet-4.5']
      expect(entry).toMatchObject({ input: 6, output: 30, source: 'override' })
    })

    it('preserves alias entries (sonnet) when overriding the alias target', () => {
      const svc = new PricingService()
      svc.setOverride('claude-sonnet-4.5', { input: 0, output: 0 })
      const sonnet = svc.getEffectiveTable().models['sonnet']
      // The alias entry itself is unaffected — alias resolution happens in estimateCost.
      expect(sonnet).toMatchObject({ aliasOf: 'claude-sonnet-4.5', source: 'default' })
    })

    it('clearOverride reverts the entry to defaults', () => {
      const svc = new PricingService()
      svc.setOverride('gpt-5', { input: 99 })
      expect(svc.getEffectiveTable().models['gpt-5'].input).toBe(99)
      svc.clearOverride('gpt-5')
      expect(svc.getEffectiveTable().models['gpt-5']).toMatchObject({ input: 5, source: 'default' })
    })

    it('rejects negative override values silently — falls through to defaults', () => {
      const svc = new PricingService()
      svc.setOverride('claude-haiku-4.5', { input: -1, output: -2 })
      // Both negative values dropped → no override applied → default $1/$5.
      expect(svc.getEffectiveTable().models['claude-haiku-4.5']).toMatchObject({ input: 1, output: 5, source: 'default' })
    })
  })

  describe('change events', () => {
    it('emits `changed` on setOverride', () => {
      const svc = new PricingService()
      const spy = vi.fn()
      svc.on('changed', spy)
      svc.setOverride('opus', { input: 7, output: 35 })
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('emits `changed` on clearOverride only when there was something to clear', () => {
      const svc = new PricingService()
      // Set, then clear with two separate spies so cross-test state (if any)
      // can't poison the no-op observation.
      svc.setOverride('opus', { input: 7 })
      const setSpy = vi.fn()
      svc.on('changed', setSpy)
      // Clearing a real override should emit exactly once.
      svc.clearOverride('opus')
      expect(setSpy).toHaveBeenCalledTimes(1)
      // Now clearing again — nothing is registered — must NOT emit.
      setSpy.mockClear()
      svc.clearOverride('opus')
      expect(setSpy).toHaveBeenCalledTimes(0)
    })

    it('emits `changed` on setSettings', () => {
      const svc = new PricingService()
      const spy = vi.fn()
      svc.on('changed', spy)
      svc.setSettings({ remoteSyncEnabled: true, remoteUrl: 'https://example.com/pricing.json' })
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })

  describe('syncFromRemote', () => {
    it('refuses to sync when remoteSyncEnabled is false', async () => {
      const svc = new PricingService()
      // Explicit reset — otherwise stale settings from another test in the
      // same file can flip the flag and we'd accidentally hit the network.
      svc.setSettings({ remoteSyncEnabled: false, remoteUrl: '' })
      const result = await svc.syncFromRemote()
      expect(result).toEqual({ ok: false, error: expect.stringMatching(/not enabled/i) })
    })

    it('refuses non-https URLs', async () => {
      const svc = new PricingService()
      svc.setSettings({ remoteSyncEnabled: true, remoteUrl: 'http://example.com/pricing.json' })
      const result = await svc.syncFromRemote()
      expect(result).toEqual({ ok: false, error: expect.stringMatching(/https:\/\//i) })
    })

    it('persists last-sync error in settings on failure (without clobbering cached remote)', async () => {
      const svc = new PricingService()
      svc.setSettings({ remoteSyncEnabled: false, remoteUrl: '' })
      await svc.syncFromRemote()
      expect(svc.getSettings().lastSyncError).toMatch(/not enabled/i)
      // No remote table cached from a failed sync.
      expect(svc.getRemote()).toBeNull()
    })
  })
})
