import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { showSaveDialogMock, showOpenDialogMock, readFileSyncMock, writeFileSyncMock, randomUUIDMock } = vi.hoisted(() => ({
  showSaveDialogMock: vi.fn().mockResolvedValue({ canceled: true }),
  showOpenDialogMock: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  readFileSyncMock: vi.fn().mockReturnValue(''),
  writeFileSyncMock: vi.fn(),
  randomUUIDMock: vi.fn().mockReturnValue('mock-uuid-1'),
}))

vi.mock('electron', async (importOriginal) => {
  const orig = await importOriginal() as Record<string, unknown>
  return {
    ...orig,
    dialog: {
      showSaveDialog: showSaveDialogMock,
      showOpenDialog: showOpenDialogMock,
    },
  }
})

vi.mock('fs', () => ({
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}))

vi.mock('crypto', () => ({
  randomUUID: randomUUIDMock,
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-key',
}))

// ── Store mock ──────────────────────────────────────────────────────────────

const STORE_KEY = '__policyTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__policyTestStoreData'] as Record<string, unknown>
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

describe('policyHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    randomUUIDMock.mockReturnValue('mock-uuid-1')
    vi.resetModules()
    const mod = await import('./policyHandlers')
    mod.registerPolicyHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('policy:get-active')
    expect(channels).toContain('policy:list-presets')
    expect(channels).toContain('policy:set-active')
    expect(channels).toContain('policy:save-preset')
    expect(channels).toContain('policy:delete-preset')
    expect(channels).toContain('policy:check-action')
    expect(channels).toContain('policy:get-violations')
    expect(channels).toContain('policy:export')
    expect(channels).toContain('policy:import')
  })

  describe('policy:get-active', () => {
    it('returns Standard preset by default', () => {
      const handler = getHandler('policy:get-active')
      const result = handler(mockEvent) as { activePresetId: string; presetName: string }
      expect(result.activePresetId).toBe('policy-standard')
      expect(result.presetName).toBe('Standard')
    })
  })

  describe('policy:list-presets', () => {
    it('returns builtin presets', () => {
      const handler = getHandler('policy:list-presets')
      const result = handler(mockEvent) as Array<{ id: string; isBuiltin: boolean }>
      expect(result.length).toBeGreaterThanOrEqual(3)
      const ids = result.map((p) => p.id)
      expect(ids).toContain('policy-cautious')
      expect(ids).toContain('policy-standard')
      expect(ids).toContain('policy-unrestricted')
    })
  })

  describe('policy:set-active', () => {
    it('changes the active preset', () => {
      const handler = getHandler('policy:set-active')
      const result = handler(mockEvent, { id: 'policy-cautious' }) as { presetName: string }
      expect(result.presetName).toBe('Cautious')
    })
  })

  describe('policy:save-preset', () => {
    it('creates a new user preset', () => {
      const handler = getHandler('policy:save-preset')
      const result = handler(mockEvent, {
        name: 'Custom Policy',
        description: 'Test',
        rules: { maxBudgetPerSession: 5, maxBudgetPerDay: null, blockedTools: [], blockedFilePatterns: [], requiredPermissionMode: null, allowedModels: [], maxConcurrentAgents: null, maxTurnsPerSession: null },
      }) as { id: string; name: string }
      expect(result.name).toBe('Custom Policy')
      expect(result.id).toBe('mock-uuid-1')
    })

    it('updates existing preset by id', () => {
      const handler = getHandler('policy:save-preset')
      handler(mockEvent, {
        name: 'V1', id: 'preset-1',
        rules: { maxBudgetPerSession: null, maxBudgetPerDay: null, blockedTools: [], blockedFilePatterns: [], requiredPermissionMode: null, allowedModels: [], maxConcurrentAgents: null, maxTurnsPerSession: null },
      })
      handler(mockEvent, {
        name: 'V2', id: 'preset-1',
        rules: { maxBudgetPerSession: 10, maxBudgetPerDay: null, blockedTools: [], blockedFilePatterns: [], requiredPermissionMode: null, allowedModels: [], maxConcurrentAgents: null, maxTurnsPerSession: null },
      })

      const listHandler = getHandler('policy:list-presets')
      const presets = listHandler(mockEvent) as Array<{ id: string; name: string }>
      const custom = presets.filter((p) => p.id === 'preset-1')
      expect(custom).toHaveLength(1)
      expect(custom[0].name).toBe('V2')
    })
  })

  describe('policy:delete-preset', () => {
    it('deletes a user preset', () => {
      const saveHandler = getHandler('policy:save-preset')
      saveHandler(mockEvent, {
        name: 'ToDelete', id: 'del-1',
        rules: { maxBudgetPerSession: null, maxBudgetPerDay: null, blockedTools: [], blockedFilePatterns: [], requiredPermissionMode: null, allowedModels: [], maxConcurrentAgents: null, maxTurnsPerSession: null },
      })

      const deleteHandler = getHandler('policy:delete-preset')
      deleteHandler(mockEvent, { id: 'del-1' })

      const listHandler = getHandler('policy:list-presets')
      const presets = listHandler(mockEvent) as Array<{ id: string }>
      expect(presets.find((p) => p.id === 'del-1')).toBeUndefined()
    })

    it('falls back to standard when deleting active preset', () => {
      // Set active to cautious
      const setHandler = getHandler('policy:set-active')
      setHandler(mockEvent, { id: 'policy-cautious' })

      // Note: can't delete builtins from the presets array, but the active id can be
      // a custom preset that gets deleted. Let's use a custom one.
      const saveHandler = getHandler('policy:save-preset')
      saveHandler(mockEvent, {
        name: 'Active', id: 'active-preset',
        rules: { maxBudgetPerSession: null, maxBudgetPerDay: null, blockedTools: [], blockedFilePatterns: [], requiredPermissionMode: null, allowedModels: [], maxConcurrentAgents: null, maxTurnsPerSession: null },
      })
      setHandler(mockEvent, { id: 'active-preset' })

      const deleteHandler = getHandler('policy:delete-preset')
      deleteHandler(mockEvent, { id: 'active-preset' })

      const getActive = getHandler('policy:get-active')
      const active = getActive(mockEvent) as { activePresetId: string }
      expect(active.activePresetId).toBe('policy-standard')
    })
  })

  describe('policy:check-action', () => {
    it('allows unrestricted actions when no constraints', () => {
      // Set to unrestricted
      const setHandler = getHandler('policy:set-active')
      setHandler(mockEvent, { id: 'policy-unrestricted' })

      const handler = getHandler('policy:check-action')
      const result = handler(mockEvent, { action: 'set-permission-mode', details: { mode: 'yolo' } }) as { allowed: boolean }
      expect(result.allowed).toBe(true)
    })

    it('detects permission mode violation', () => {
      // Cautious requires 'default' permission mode
      const setHandler = getHandler('policy:set-active')
      setHandler(mockEvent, { id: 'policy-cautious' })

      const handler = getHandler('policy:check-action')
      const result = handler(mockEvent, {
        action: 'set-permission-mode',
        details: { mode: 'yolo' },
      }) as { allowed: boolean; violations: string[] }
      expect(result.allowed).toBe(false)
      expect(result.violations.length).toBeGreaterThan(0)
    })

    it('detects blocked tool violation via custom preset', () => {
      // Create a custom preset with blocked tools and set it active
      const saveHandler = getHandler('policy:save-preset')
      saveHandler(mockEvent, {
        name: 'BlockTest',
        id: 'block-test',
        rules: {
          maxBudgetPerSession: null, maxBudgetPerDay: null,
          blockedTools: ['dangerous-tool'],
          blockedFilePatterns: [], requiredPermissionMode: null,
          allowedModels: [], maxConcurrentAgents: null, maxTurnsPerSession: null,
        },
      })
      const setHandler = getHandler('policy:set-active')
      setHandler(mockEvent, { id: 'block-test' })

      const handler = getHandler('policy:check-action')
      const result = handler(mockEvent, {
        action: 'use-tool',
        details: { tool: 'dangerous-tool' },
      }) as { allowed: boolean; violations: string[]; presetName: string }
      expect(result.presetName).toBe('BlockTest')
      expect(result.allowed).toBe(false)
      expect(result.violations.length).toBeGreaterThan(0)
    })

    it('stores violations in history', () => {
      const setHandler = getHandler('policy:set-active')
      setHandler(mockEvent, { id: 'policy-cautious' })

      const checkHandler = getHandler('policy:check-action')
      checkHandler(mockEvent, { action: 'set-permission-mode', details: { mode: 'yolo' } })

      const violationsHandler = getHandler('policy:get-violations')
      const violations = violationsHandler(mockEvent) as Array<{ action: string }>
      expect(violations.length).toBeGreaterThan(0)
    })
  })

  describe('policy:export', () => {
    it('returns canceled when user cancels dialog', async () => {
      showSaveDialogMock.mockResolvedValue({ canceled: true })
      const handler = getHandler('policy:export')
      const result = await handler(mockEvent, { id: 'policy-standard' }) as { canceled: boolean }
      expect(result.canceled).toBe(true)
    })

    it('returns error for unknown preset', async () => {
      const handler = getHandler('policy:export')
      const result = await handler(mockEvent, { id: 'nonexistent' }) as { error: string }
      expect(result.error).toBe('Not found')
    })
  })

  describe('policy:import', () => {
    it('returns canceled when user cancels dialog', async () => {
      showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })
      const handler = getHandler('policy:import')
      const result = await handler(mockEvent) as { canceled: boolean }
      expect(result.canceled).toBe(true)
    })

    it('imports a valid policy file', async () => {
      showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/policy.json'] })
      readFileSyncMock.mockReturnValue(JSON.stringify({
        name: 'Imported',
        description: 'From file',
        rules: { maxBudgetPerSession: 3, maxBudgetPerDay: 30, blockedTools: [], blockedFilePatterns: [], requiredPermissionMode: null, allowedModels: [], maxConcurrentAgents: null, maxTurnsPerSession: null },
      }))
      randomUUIDMock.mockReturnValue('imported-uuid')

      const handler = getHandler('policy:import')
      const result = await handler(mockEvent) as { preset: { name: string; id: string } }
      expect(result.preset.name).toBe('Imported')
    })

    it('returns error for invalid policy file', async () => {
      showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/bad.json'] })
      readFileSyncMock.mockReturnValue(JSON.stringify({ random: 'data' }))

      const handler = getHandler('policy:import')
      const result = await handler(mockEvent) as { error: string }
      expect(result.error).toBe('Invalid policy file')
    })
  })
})
