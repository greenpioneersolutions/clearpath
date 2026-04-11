import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared store data via globalThis ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STORE_KEY = '__wizardHandlersTestStoreData' as const
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__wizardHandlersTestStoreData'] as Record<string, unknown>
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in sd)) {
              sd[k] = JSON.parse(JSON.stringify(v))
            }
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

      has(key: string): boolean {
        return key in sd
      }

      delete(key: string): void {
        delete sd[key]
      }
    },
  }
})

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-encryption-key',
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeData = (globalThis as any)[STORE_KEY] as Record<string, unknown>

import { ipcMain } from 'electron'

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerCallback = (event: unknown, args?: unknown) => unknown

function getHandler(channel: string): HandlerCallback {
  const calls = vi.mocked(ipcMain.handle).mock.calls
  const match = calls.find((c) => c[0] === channel)
  if (!match) throw new Error(`No handler registered for channel: ${channel}`)
  return match[1] as HandlerCallback
}

const mockEvent = {}

// Need dynamic import since wizardHandlers creates module-level Store
let registerWizardHandlers: typeof import('./wizardHandlers').registerWizardHandlers

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('wizardHandlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(ipcMain.handle).mockClear()

    // Reset store data to defaults
    for (const key of Object.keys(storeData)) {
      delete storeData[key]
    }

    vi.resetModules()
    const mod = await import('./wizardHandlers')
    registerWizardHandlers = mod.registerWizardHandlers
    registerWizardHandlers(ipcMain)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('handler registration', () => {
    it('registers all expected channels', () => {
      const registered = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0])
      expect(registered).toEqual(expect.arrayContaining([
        'wizard:get-config',
        'wizard:save-config',
        'wizard:reset-config',
        'wizard:get-state',
        'wizard:mark-completed',
        'wizard:get-context-settings',
        'wizard:set-context-settings',
        'wizard:build-prompt',
      ]))
      expect(registered).toHaveLength(8)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // wizard:get-config
  // ═══════════════════════════════════════════════════════════════════════════

  describe('wizard:get-config', () => {
    it('returns the default config on first load', () => {
      const handler = getHandler('wizard:get-config')
      const result = handler(mockEvent) as { title: string; subtitle: string; options: unknown[] }

      expect(result.title).toBe('Session Wizard')
      expect(result.options).toHaveLength(3)
    })

    it('returns default config with three option ids', () => {
      const handler = getHandler('wizard:get-config')
      const result = handler(mockEvent) as { options: Array<{ id: string }> }

      const ids = result.options.map((o) => o.id)
      expect(ids).toEqual(['task', 'question', 'review'])
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // wizard:save-config
  // ═══════════════════════════════════════════════════════════════════════════

  describe('wizard:save-config', () => {
    it('saves a custom config', () => {
      const customConfig = {
        title: 'Custom Wizard',
        subtitle: 'Custom subtitle',
        initialQuestion: 'What now?',
        options: [],
      }

      const saveHandler = getHandler('wizard:save-config')
      const result = saveHandler(mockEvent, { config: customConfig })

      expect(result).toEqual({ success: true })

      // Verify it was persisted
      const getHandler2 = getHandler('wizard:get-config')
      const saved = getHandler2(mockEvent) as { title: string }
      expect(saved.title).toBe('Custom Wizard')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // wizard:reset-config
  // ═══════════════════════════════════════════════════════════════════════════

  describe('wizard:reset-config', () => {
    it('resets config back to default', () => {
      // First, save a custom config
      const saveHandler = getHandler('wizard:save-config')
      saveHandler(mockEvent, {
        config: { title: 'Modified', subtitle: '', initialQuestion: '', options: [] },
      })

      // Then reset
      const resetHandler = getHandler('wizard:reset-config')
      const result = resetHandler(mockEvent) as { success: boolean; config: { title: string } }

      expect(result.success).toBe(true)
      expect(result.config.title).toBe('Session Wizard')

      // Verify it was persisted
      const getHandler2 = getHandler('wizard:get-config')
      const current = getHandler2(mockEvent) as { title: string }
      expect(current.title).toBe('Session Wizard')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // wizard:get-state
  // ═══════════════════════════════════════════════════════════════════════════

  describe('wizard:get-state', () => {
    it('returns initial state', () => {
      const handler = getHandler('wizard:get-state')
      const result = handler(mockEvent) as { hasCompletedWizard: boolean; completedCount: number }

      expect(result.hasCompletedWizard).toBe(false)
      expect(result.completedCount).toBe(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // wizard:mark-completed
  // ═══════════════════════════════════════════════════════════════════════════

  describe('wizard:mark-completed', () => {
    it('marks wizard as completed and increments count', () => {
      const handler = getHandler('wizard:mark-completed')
      const result = handler(mockEvent) as { success: boolean }

      expect(result.success).toBe(true)

      const stateHandler = getHandler('wizard:get-state')
      const state = stateHandler(mockEvent) as { hasCompletedWizard: boolean; completedCount: number }

      expect(state.hasCompletedWizard).toBe(true)
      expect(state.completedCount).toBe(1)
    })

    it('increments count on multiple completions', () => {
      const handler = getHandler('wizard:mark-completed')
      handler(mockEvent)
      handler(mockEvent)
      handler(mockEvent)

      const stateHandler = getHandler('wizard:get-state')
      const state = stateHandler(mockEvent) as { completedCount: number }

      expect(state.completedCount).toBe(3)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // wizard:get-context-settings
  // ═══════════════════════════════════════════════════════════════════════════

  describe('wizard:get-context-settings', () => {
    it('returns default context settings', () => {
      const handler = getHandler('wizard:get-context-settings')
      const result = handler(mockEvent)

      expect(result).toEqual({
        showUseContext: true,
        showMemories: true,
        showAgents: true,
        showSkills: true,
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // wizard:set-context-settings
  // ═══════════════════════════════════════════════════════════════════════════

  describe('wizard:set-context-settings', () => {
    it('merges partial updates into existing settings', () => {
      const handler = getHandler('wizard:set-context-settings')
      const result = handler(mockEvent, { showMemories: false })

      expect(result).toEqual({
        showUseContext: true,
        showMemories: false,
        showAgents: true,
        showSkills: true,
      })

      // Verify persisted
      const getHandler2 = getHandler('wizard:get-context-settings')
      const saved = getHandler2(mockEvent)
      expect(saved).toEqual({
        showUseContext: true,
        showMemories: false,
        showAgents: true,
        showSkills: true,
      })
    })

    it('handles updating multiple fields at once', () => {
      const handler = getHandler('wizard:set-context-settings')
      const result = handler(mockEvent, {
        showUseContext: false,
        showAgents: false,
        showSkills: false,
      })

      expect(result).toEqual({
        showUseContext: false,
        showMemories: true,
        showAgents: false,
        showSkills: false,
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // wizard:build-prompt
  // ═══════════════════════════════════════════════════════════════════════════

  describe('wizard:build-prompt', () => {
    it('builds a prompt from a valid option and values', () => {
      const handler = getHandler('wizard:build-prompt')
      const result = handler(mockEvent, {
        optionId: 'task',
        values: {
          persona: 'Senior backend developer',
          goal: 'Refactor auth module',
          process: 'Analyze first, then implement',
          verification: 'Tests pass',
        },
      }) as { success: boolean; prompt: string }

      expect(result.success).toBe(true)
      expect(result.prompt).toContain('Senior backend developer')
      expect(result.prompt).toContain('Refactor auth module')
      expect(result.prompt).toContain('Analyze first, then implement')
      expect(result.prompt).toContain('Tests pass')
    })

    it('replaces empty values with "(not specified)"', () => {
      const handler = getHandler('wizard:build-prompt')
      const result = handler(mockEvent, {
        optionId: 'task',
        values: {
          persona: 'Developer',
          goal: 'Build feature',
          process: '',
          verification: '   ',
        },
      }) as { success: boolean; prompt: string }

      expect(result.success).toBe(true)
      expect(result.prompt).toContain('Developer')
      expect(result.prompt).toContain('Build feature')
      // Empty/whitespace values become "(not specified)"
      expect(result.prompt).toContain('(not specified)')
    })

    it('replaces unreplaced placeholders with "(not specified)"', () => {
      const handler = getHandler('wizard:build-prompt')
      const result = handler(mockEvent, {
        optionId: 'task',
        values: {
          persona: 'Dev',
          goal: 'Do stuff',
          // process and verification omitted from values
        },
      }) as { success: boolean; prompt: string }

      expect(result.success).toBe(true)
      // The unreplaced {{process}} and {{verification}} become "(not specified)"
      expect(result.prompt).not.toMatch(/\{\{.*\}\}/)
    })

    it('returns error for invalid option id', () => {
      const handler = getHandler('wizard:build-prompt')
      const result = handler(mockEvent, {
        optionId: 'nonexistent',
        values: {},
      }) as { success: boolean; error: string }

      expect(result.success).toBe(false)
      expect(result.error).toBe('Option not found')
    })

    it('works with the question option', () => {
      const handler = getHandler('wizard:build-prompt')
      const result = handler(mockEvent, {
        optionId: 'question',
        values: {
          persona: 'Technical PM',
          context: 'Migrating to cloud',
          goal: 'What are the risks?',
          output: 'Bullet points',
        },
      }) as { success: boolean; prompt: string }

      expect(result.success).toBe(true)
      expect(result.prompt).toContain('Technical PM')
      expect(result.prompt).toContain('Migrating to cloud')
      expect(result.prompt).toContain('What are the risks?')
      expect(result.prompt).toContain('Bullet points')
    })

    it('works with the review option', () => {
      const handler = getHandler('wizard:build-prompt')
      const result = handler(mockEvent, {
        optionId: 'review',
        values: {
          persona: 'Security reviewer',
          target: 'PR #42',
          focus: 'SQL injection',
          output: 'Table format',
        },
      }) as { success: boolean; prompt: string }

      expect(result.success).toBe(true)
      expect(result.prompt).toContain('Security reviewer')
      expect(result.prompt).toContain('PR #42')
      expect(result.prompt).toContain('SQL injection')
    })

    it('builds prompt from custom saved config', () => {
      // Save a custom config with a new option
      const saveHandler = getHandler('wizard:save-config')
      saveHandler(mockEvent, {
        config: {
          title: 'Custom',
          subtitle: '',
          initialQuestion: '',
          options: [{
            id: 'custom-op',
            label: 'Custom',
            description: '',
            icon: '',
            fields: [{ id: 'name', label: 'Name', placeholder: '', type: 'text', required: true }],
            promptTemplate: 'Hello {{name}}, welcome!',
          }],
        },
      })

      const handler = getHandler('wizard:build-prompt')
      const result = handler(mockEvent, {
        optionId: 'custom-op',
        values: { name: 'World' },
      }) as { success: boolean; prompt: string }

      expect(result.success).toBe(true)
      expect(result.prompt).toBe('Hello World, welcome!')
    })
  })
})
