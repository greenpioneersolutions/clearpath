import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared store data ───────────────────────────────────────────────────────

// Use vi.hoisted to ensure globalThis store is available before vi.mock runs
const { storeRef } = vi.hoisted(() => {
  const obj = {} as Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any)['__onboardingTestStoreData'] = obj
  return { storeRef: obj }
})

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__onboardingTestStoreData'] as Record<string, unknown>
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

const storeData = storeRef

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

describe('onboardingHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    // Must reset modules to get a fresh store instance each time
    vi.resetModules()
    const mod = await import('./onboardingHandlers')
    mod.registerOnboardingHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('onboarding:get-state')
    expect(channels).toContain('onboarding:complete')
    expect(channels).toContain('onboarding:set-training-mode')
    expect(channels).toContain('onboarding:record-feature')
    expect(channels).toContain('onboarding:complete-guided-task')
    expect(channels).toContain('onboarding:reset')
    expect(channels).toContain('setup-wizard:get-state')
    expect(channels).toContain('setup-wizard:update-step')
    expect(channels).toContain('setup-wizard:is-complete')
  })

  describe('onboarding:get-state', () => {
    it('returns initial state with beginner level', () => {
      const handler = getHandler('onboarding:get-state')
      const result = handler(mockEvent) as Record<string, unknown>
      expect(result.completedOnboarding).toBe(false)
      expect(result.trainingModeEnabled).toBe(false)
      expect(result.level).toBe('beginner')
      expect(result.progress).toBe(0)
      expect(result.total).toBe(12)
    })
  })

  describe('onboarding:complete', () => {
    it('marks onboarding as completed', () => {
      const handler = getHandler('onboarding:complete')
      const result = handler(mockEvent) as { success: boolean }
      expect(result.success).toBe(true)

      const getState = getHandler('onboarding:get-state')
      const state = getState(mockEvent) as { completedOnboarding: boolean }
      expect(state.completedOnboarding).toBe(true)
    })
  })

  describe('onboarding:set-training-mode', () => {
    it('enables training mode', () => {
      const handler = getHandler('onboarding:set-training-mode')
      const result = handler(mockEvent, { enabled: true }) as { enabled: boolean }
      expect(result.enabled).toBe(true)
    })
  })

  describe('onboarding:record-feature', () => {
    it('records feature usage and updates level', () => {
      const handler = getHandler('onboarding:record-feature')
      handler(mockEvent, { feature: 'basicPrompts' })
      handler(mockEvent, { feature: 'slashCommands' })
      handler(mockEvent, { feature: 'sessionResume' })

      const state = getHandler('onboarding:get-state')(mockEvent) as { level: string; progress: number }
      expect(state.level).toBe('intermediate')
      expect(state.progress).toBe(3)
    })

    it('reaches expert at 9+ features', () => {
      const handler = getHandler('onboarding:record-feature')
      const features = [
        'basicPrompts', 'slashCommands', 'sessionResume', 'agentToggle',
        'customAgent', 'permissionConfig', 'mcpServer', 'subAgentDelegate',
        'fleetCoordination',
      ]
      for (const f of features) handler(mockEvent, { feature: f })

      const state = getHandler('onboarding:get-state')(mockEvent) as { level: string }
      expect(state.level).toBe('expert')
    })
  })

  describe('onboarding:complete-guided-task', () => {
    it('adds task to completed list', () => {
      const handler = getHandler('onboarding:complete-guided-task')
      const result = handler(mockEvent, { taskId: 'task-1' }) as { completed: string[] }
      expect(result.completed).toContain('task-1')
    })

    it('does not duplicate tasks', () => {
      const handler = getHandler('onboarding:complete-guided-task')
      handler(mockEvent, { taskId: 'task-1' })
      const result = handler(mockEvent, { taskId: 'task-1' }) as { completed: string[] }
      expect(result.completed.filter((t: string) => t === 'task-1')).toHaveLength(1)
    })
  })

  describe('onboarding:reset', () => {
    it('resets all onboarding state', () => {
      const recordHandler = getHandler('onboarding:record-feature')
      recordHandler(mockEvent, { feature: 'basicPrompts' })
      const completeHandler = getHandler('onboarding:complete')
      completeHandler(mockEvent)

      const resetHandler = getHandler('onboarding:reset')
      resetHandler(mockEvent)

      const state = getHandler('onboarding:get-state')(mockEvent) as Record<string, unknown>
      expect(state.completedOnboarding).toBe(false)
      expect(state.progress).toBe(0)
    })
  })

  describe('setup-wizard:get-state', () => {
    it('returns default setup wizard state', () => {
      const handler = getHandler('setup-wizard:get-state')
      const result = handler(mockEvent) as Record<string, unknown>
      expect(result.cliInstalled).toBe(false)
      expect(result.authenticated).toBe(false)
      expect(result.completedAt).toBeNull()
    })
  })

  describe('setup-wizard:update-step', () => {
    it('updates individual steps', () => {
      const handler = getHandler('setup-wizard:update-step')
      const result = handler(mockEvent, { cliInstalled: true }) as Record<string, unknown>
      expect(result.cliInstalled).toBe(true)
      expect(result.authenticated).toBe(false)
    })

    it('auto-sets completedAt when all steps are done', () => {
      const handler = getHandler('setup-wizard:update-step')
      const result = handler(mockEvent, {
        cliInstalled: true,
        authenticated: true,
        agentCreated: true,
        skillCreated: true,
        memoryCreated: true,
        triedWizard: true,
      }) as { completedAt: number | null }
      expect(result.completedAt).toBeGreaterThan(0)
    })
  })

  describe('setup-wizard:is-complete', () => {
    it('returns false when not all steps are done', () => {
      const handler = getHandler('setup-wizard:is-complete')
      const result = handler(mockEvent) as { complete: boolean }
      expect(result.complete).toBe(false)
    })
  })
})
