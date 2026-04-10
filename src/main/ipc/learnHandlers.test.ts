import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared store data ───────────────────────────────────────────────────────

const STORE_KEY = '__learnTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__learnTestStoreData'] as Record<string, unknown>
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

describe('learnHandlers', () => {
  beforeEach(async () => {
    for (const key of Object.keys(storeData)) delete storeData[key]
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('./learnHandlers')
    mod.registerLearnHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('learn:get-paths')
    expect(channels).toContain('learn:get-progress')
    expect(channels).toContain('learn:complete-lesson')
    expect(channels).toContain('learn:select-path')
    expect(channels).toContain('learn:get-achievements')
    expect(channels).toContain('learn:unlock-achievement')
    expect(channels).toContain('learn:record-help-click')
    expect(channels).toContain('learn:get-help-clicked')
    expect(channels).toContain('learn:dismiss')
    expect(channels).toContain('learn:reset')
  })

  describe('learn:get-paths', () => {
    it('returns learning paths with progress info', () => {
      const handler = getHandler('learn:get-paths')
      const result = handler(mockEvent) as Array<{ id: string; unlocked: boolean; progress: { completed: number } }>
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      // All paths should be unlocked
      for (const p of result) {
        expect(p.unlocked).toBe(true)
      }
    })
  })

  describe('learn:get-progress', () => {
    it('returns initial progress with zero completed', () => {
      const handler = getHandler('learn:get-progress')
      const result = handler(mockEvent) as {
        completed: number; total: number; percentage: number
        streak: { lastDate: string; count: number }
        totalTimeMinutes: number; selectedPath: null
        dismissed: boolean
      }
      expect(result.completed).toBe(0)
      expect(result.total).toBeGreaterThan(0)
      expect(result.percentage).toBe(0)
      expect(result.streak.count).toBe(0)
      expect(result.totalTimeMinutes).toBe(0)
      expect(result.selectedPath).toBeNull()
      expect(result.dismissed).toBe(false)
    })
  })

  describe('learn:complete-lesson', () => {
    it('marks a lesson as completed and updates progress', () => {
      // Get first lesson ID from paths
      const pathsHandler = getHandler('learn:get-paths')
      const paths = pathsHandler(mockEvent) as Array<{ modules: Array<{ lessons: Array<{ id: string }> }> }>
      const firstLessonId = paths[0].modules[0].lessons[0].id

      const handler = getHandler('learn:complete-lesson')
      const result = handler(mockEvent, { lessonId: firstLessonId }) as { completed: number }
      expect(result.completed).toBe(1)
    })

    it('accumulates time minutes', () => {
      const handler = getHandler('learn:complete-lesson')
      handler(mockEvent, { lessonId: 'test-1', timeMinutes: 5 })
      handler(mockEvent, { lessonId: 'test-2', timeMinutes: 10 })

      const progressHandler = getHandler('learn:get-progress')
      const progress = progressHandler(mockEvent) as { totalTimeMinutes: number }
      expect(progress.totalTimeMinutes).toBe(15)
    })

    it('handles skipped lessons without errors', () => {
      const handler = getHandler('learn:complete-lesson')
      // Should not throw even with skipped flag and non-existent lesson id
      const result = handler(mockEvent, { lessonId: 'test-1', skipped: true })
      expect(result).toBeDefined()
    })
  })

  describe('learn:select-path', () => {
    it('sets the selected path', () => {
      const handler = getHandler('learn:select-path')
      const result = handler(mockEvent, { pathId: 'getting-started' }) as { success: boolean }
      expect(result.success).toBe(true)

      const progressHandler = getHandler('learn:get-progress')
      const progress = progressHandler(mockEvent) as { selectedPath: string }
      expect(progress.selectedPath).toBe('getting-started')
    })
  })

  describe('learn:get-achievements', () => {
    it('returns achievements with unlocked status', () => {
      const handler = getHandler('learn:get-achievements')
      const result = handler(mockEvent) as Array<{ id: string; unlocked: boolean }>
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      // Initially none unlocked
      for (const a of result) {
        expect(a.unlocked).toBe(false)
      }
    })
  })

  describe('learn:unlock-achievement', () => {
    it('unlocks an achievement', () => {
      const handler = getHandler('learn:unlock-achievement')
      handler(mockEvent, { id: 'first-steps' })

      const achievementsHandler = getHandler('learn:get-achievements')
      const achievements = achievementsHandler(mockEvent) as Array<{ id: string; unlocked: boolean }>
      const firstSteps = achievements.find((a) => a.id === 'first-steps')
      expect(firstSteps?.unlocked).toBe(true)
    })

    it('does not re-unlock already unlocked achievements', () => {
      const handler = getHandler('learn:unlock-achievement')
      handler(mockEvent, { id: 'first-steps' })

      // Get the achievement list to check initial unlock time
      const achievementsHandler = getHandler('learn:get-achievements')
      const firstResult = achievementsHandler(mockEvent) as Array<{ id: string; unlockedAt?: number }>
      const firstUnlockAt = firstResult.find((a) => a.id === 'first-steps')?.unlockedAt

      // Call again — should not change the timestamp
      handler(mockEvent, { id: 'first-steps' })
      const secondResult = achievementsHandler(mockEvent) as Array<{ id: string; unlockedAt?: number }>
      const secondUnlockAt = secondResult.find((a) => a.id === 'first-steps')?.unlockedAt
      expect(secondUnlockAt).toBe(firstUnlockAt)
    })
  })

  describe('learn:record-help-click', () => {
    it('records a help panel click', () => {
      const handler = getHandler('learn:record-help-click')
      handler(mockEvent, { panelId: 'settings' })

      const clickedHandler = getHandler('learn:get-help-clicked')
      const clicked = clickedHandler(mockEvent) as string[]
      expect(clicked).toContain('settings')
    })

    it('does not duplicate clicks', () => {
      const handler = getHandler('learn:record-help-click')
      handler(mockEvent, { panelId: 'settings' })
      handler(mockEvent, { panelId: 'settings' })

      const clickedHandler = getHandler('learn:get-help-clicked')
      const clicked = clickedHandler(mockEvent) as string[]
      expect(clicked.filter((c: string) => c === 'settings')).toHaveLength(1)
    })
  })

  describe('learn:dismiss', () => {
    it('sets dismissed to true', () => {
      const handler = getHandler('learn:dismiss')
      handler(mockEvent)

      const progressHandler = getHandler('learn:get-progress')
      const progress = progressHandler(mockEvent) as { dismissed: boolean }
      expect(progress.dismissed).toBe(true)
    })
  })

  describe('learn:reset', () => {
    it('resets all learn state', () => {
      // Setup some state
      const completeHandler = getHandler('learn:complete-lesson')
      completeHandler(mockEvent, { lessonId: 'test-1', timeMinutes: 10 })
      const unlockHandler = getHandler('learn:unlock-achievement')
      unlockHandler(mockEvent, { id: 'first-steps' })
      const dismissHandler = getHandler('learn:dismiss')
      dismissHandler(mockEvent)

      // Reset
      const resetHandler = getHandler('learn:reset')
      resetHandler(mockEvent)

      // Verify
      const progressHandler = getHandler('learn:get-progress')
      const progress = progressHandler(mockEvent) as {
        completed: number; totalTimeMinutes: number; dismissed: boolean
      }
      expect(progress.completed).toBe(0)
      expect(progress.totalTimeMinutes).toBe(0)
      expect(progress.dismissed).toBe(false)
    })
  })
})
