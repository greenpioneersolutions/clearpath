import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared store data via globalThis ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STORE_KEY = '__workflowHandlersTestStoreData' as const
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__workflowHandlersTestStoreData'] as Record<string, unknown>
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
import type { WorkflowStep, SavedWorkflow } from './workflowHandlers'

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerCallback = (event: unknown, args?: unknown) => unknown

function getHandler(channel: string): HandlerCallback {
  const calls = vi.mocked(ipcMain.handle).mock.calls
  const match = calls.find((c) => c[0] === channel)
  if (!match) throw new Error(`No handler registered for channel: ${channel}`)
  return match[1] as HandlerCallback
}

const mockEvent = {}

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step-1',
    name: 'Test Step',
    prompt: 'Do something',
    executionType: 'session',
    parallel: false,
    collapsed: false,
    ...overrides,
  }
}

// Need dynamic import since workflowHandlers creates module-level Store
let registerWorkflowHandlers: typeof import('./workflowHandlers').registerWorkflowHandlers

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('workflowHandlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(ipcMain.handle).mockClear()

    // Reset store data
    for (const key of Object.keys(storeData)) {
      delete storeData[key]
    }

    vi.resetModules()
    const mod = await import('./workflowHandlers')
    registerWorkflowHandlers = mod.registerWorkflowHandlers
    registerWorkflowHandlers(ipcMain)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('handler registration', () => {
    it('registers all expected channels', () => {
      const registered = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0])
      expect(registered).toEqual(expect.arrayContaining([
        'workflow:list',
        'workflow:get',
        'workflow:save',
        'workflow:delete',
        'workflow:record-usage',
        'workflow:estimate-cost',
      ]))
      expect(registered).toHaveLength(6)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // workflow:list
  // ═══════════════════════════════════════════════════════════════════════════

  describe('workflow:list', () => {
    it('returns empty array by default', () => {
      const handler = getHandler('workflow:list')
      const result = handler(mockEvent)

      expect(result).toEqual([])
    })

    it('returns saved workflows', () => {
      // Save a workflow first
      const saveHandler = getHandler('workflow:save')
      saveHandler(mockEvent, {
        name: 'My Workflow',
        description: 'Test',
        steps: [makeStep()],
      })

      const handler = getHandler('workflow:list')
      const result = handler(mockEvent) as SavedWorkflow[]

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('My Workflow')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // workflow:get
  // ═══════════════════════════════════════════════════════════════════════════

  describe('workflow:get', () => {
    it('returns a workflow by id', () => {
      const saveHandler = getHandler('workflow:save')
      const saved = saveHandler(mockEvent, {
        name: 'Find Me',
        description: 'Test',
        steps: [makeStep()],
      }) as SavedWorkflow

      const handler = getHandler('workflow:get')
      const result = handler(mockEvent, { id: saved.id }) as SavedWorkflow

      expect(result).not.toBeNull()
      expect(result.name).toBe('Find Me')
    })

    it('returns null for nonexistent id', () => {
      const handler = getHandler('workflow:get')
      const result = handler(mockEvent, { id: 'nonexistent' })

      expect(result).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // workflow:save
  // ═══════════════════════════════════════════════════════════════════════════

  describe('workflow:save', () => {
    it('creates a new workflow with generated id', () => {
      const handler = getHandler('workflow:save')
      const result = handler(mockEvent, {
        name: 'New Workflow',
        description: 'A description',
        steps: [makeStep()],
      }) as SavedWorkflow

      expect(result.id).toBeDefined()
      expect(result.name).toBe('New Workflow')
      expect(result.description).toBe('A description')
      expect(result.steps).toHaveLength(1)
      expect(result.createdAt).toBeGreaterThan(0)
      expect(result.usageCount).toBe(0)
      expect(result.lastUsedAt).toBeUndefined()
    })

    it('updates an existing workflow by id', () => {
      const handler = getHandler('workflow:save')

      // Create first
      const created = handler(mockEvent, {
        name: 'Original',
        description: 'V1',
        steps: [makeStep()],
      }) as SavedWorkflow

      const originalCreatedAt = created.createdAt

      // Update
      const updated = handler(mockEvent, {
        id: created.id,
        name: 'Updated',
        description: 'V2',
        steps: [makeStep(), makeStep({ id: 'step-2', name: 'Step 2' })],
      }) as SavedWorkflow

      expect(updated.id).toBe(created.id)
      expect(updated.name).toBe('Updated')
      expect(updated.description).toBe('V2')
      expect(updated.steps).toHaveLength(2)
      // createdAt should be preserved from original
      expect(updated.createdAt).toBe(originalCreatedAt)
    })

    it('creates new workflow when id does not match', () => {
      const handler = getHandler('workflow:save')

      // Create with a non-existing id — should create new entry
      const result = handler(mockEvent, {
        id: 'fake-id-that-does-not-exist',
        name: 'New Entry',
        description: '',
        steps: [],
      }) as SavedWorkflow

      // The id should be the provided one
      expect(result.id).toBe('fake-id-that-does-not-exist')
      expect(result.usageCount).toBe(0)

      const listHandler = getHandler('workflow:list')
      const list = listHandler(mockEvent) as SavedWorkflow[]
      expect(list).toHaveLength(1)
    })

    it('preserves usageCount and lastUsedAt on update', () => {
      const saveHandler = getHandler('workflow:save')
      const created = saveHandler(mockEvent, {
        name: 'Track Usage',
        description: '',
        steps: [makeStep()],
      }) as SavedWorkflow

      // Record some usage
      const usageHandler = getHandler('workflow:record-usage')
      usageHandler(mockEvent, { id: created.id })
      usageHandler(mockEvent, { id: created.id })

      // Now update the workflow
      const updated = saveHandler(mockEvent, {
        id: created.id,
        name: 'Track Usage Updated',
        description: '',
        steps: [makeStep()],
      }) as SavedWorkflow

      // BUG NOTE: usageCount and lastUsedAt are NOT preserved on update.
      // The save handler explicitly sets usageCount from workflows[existing].usageCount
      // and lastUsedAt from workflows[existing].lastUsedAt, which should work.
      // But the real issue is that workflow:record-usage modifies the array in-place
      // while workflow:save reads a fresh copy from store. Since our mock store
      // does JSON.parse/JSON.stringify on get(), this should actually work correctly.
      expect(updated.usageCount).toBe(2)
      expect(updated.lastUsedAt).toBeDefined()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // workflow:delete
  // ═══════════════════════════════════════════════════════════════════════════

  describe('workflow:delete', () => {
    it('deletes a workflow by id', () => {
      const saveHandler = getHandler('workflow:save')
      const created = saveHandler(mockEvent, {
        name: 'Delete Me',
        description: '',
        steps: [],
      }) as SavedWorkflow

      const deleteHandler = getHandler('workflow:delete')
      const result = deleteHandler(mockEvent, { id: created.id })

      expect(result).toEqual({ success: true })

      const listHandler = getHandler('workflow:list')
      expect(listHandler(mockEvent)).toEqual([])
    })

    it('succeeds silently when deleting nonexistent id', () => {
      const handler = getHandler('workflow:delete')
      const result = handler(mockEvent, { id: 'nonexistent' })

      expect(result).toEqual({ success: true })
    })

    it('only deletes the targeted workflow', () => {
      const saveHandler = getHandler('workflow:save')
      const w1 = saveHandler(mockEvent, { name: 'Keep', description: '', steps: [] }) as SavedWorkflow
      const w2 = saveHandler(mockEvent, { name: 'Delete', description: '', steps: [] }) as SavedWorkflow

      const deleteHandler = getHandler('workflow:delete')
      deleteHandler(mockEvent, { id: w2.id })

      const listHandler = getHandler('workflow:list')
      const remaining = listHandler(mockEvent) as SavedWorkflow[]
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe(w1.id)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // workflow:record-usage
  // ═══════════════════════════════════════════════════════════════════════════

  describe('workflow:record-usage', () => {
    it('increments usageCount and sets lastUsedAt', () => {
      const saveHandler = getHandler('workflow:save')
      const created = saveHandler(mockEvent, {
        name: 'Used',
        description: '',
        steps: [],
      }) as SavedWorkflow

      expect(created.usageCount).toBe(0)

      const handler = getHandler('workflow:record-usage')
      handler(mockEvent, { id: created.id })

      const getHandler2 = getHandler('workflow:get')
      const updated = getHandler2(mockEvent, { id: created.id }) as SavedWorkflow

      expect(updated.usageCount).toBe(1)
      expect(updated.lastUsedAt).toBeDefined()
      expect(updated.lastUsedAt).toBeGreaterThan(0)
    })

    it('increments count across multiple calls', () => {
      const saveHandler = getHandler('workflow:save')
      const created = saveHandler(mockEvent, {
        name: 'Multi',
        description: '',
        steps: [],
      }) as SavedWorkflow

      const handler = getHandler('workflow:record-usage')
      handler(mockEvent, { id: created.id })
      handler(mockEvent, { id: created.id })
      handler(mockEvent, { id: created.id })

      const getHandler2 = getHandler('workflow:get')
      const updated = getHandler2(mockEvent, { id: created.id }) as SavedWorkflow

      expect(updated.usageCount).toBe(3)
    })

    it('returns success even for nonexistent id', () => {
      const handler = getHandler('workflow:record-usage')
      const result = handler(mockEvent, { id: 'nonexistent' })

      expect(result).toEqual({ success: true })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // workflow:estimate-cost
  // ═══════════════════════════════════════════════════════════════════════════

  describe('workflow:estimate-cost', () => {
    it('estimates cost for workflow steps', () => {
      const handler = getHandler('workflow:estimate-cost')
      const result = handler(mockEvent, {
        steps: [
          makeStep({ prompt: 'a'.repeat(400) }), // 400 chars = 100 input tokens
        ],
      }) as { totalTokens: number; estimatedCost: number; stepCount: number }

      expect(result.stepCount).toBe(1)
      expect(result.totalTokens).toBeGreaterThan(0)
      expect(result.estimatedCost).toBeGreaterThan(0)
    })

    it('returns zero for empty steps', () => {
      const handler = getHandler('workflow:estimate-cost')
      const result = handler(mockEvent, { steps: [] }) as {
        totalTokens: number; estimatedCost: number; stepCount: number
      }

      expect(result.totalTokens).toBe(0)
      expect(result.estimatedCost).toBe(0)
      expect(result.stepCount).toBe(0)
    })

    it('scales with number of steps', () => {
      const handler = getHandler('workflow:estimate-cost')

      const singleStep = handler(mockEvent, {
        steps: [makeStep({ prompt: 'x'.repeat(1000) })],
      }) as { totalTokens: number; estimatedCost: number }

      const doubleSteps = handler(mockEvent, {
        steps: [
          makeStep({ prompt: 'x'.repeat(1000) }),
          makeStep({ id: 's2', prompt: 'x'.repeat(1000) }),
        ],
      }) as { totalTokens: number; estimatedCost: number }

      expect(doubleSteps.totalTokens).toBe(singleStep.totalTokens * 2)
      // Cost should also scale proportionally
      expect(doubleSteps.estimatedCost).toBeCloseTo(singleStep.estimatedCost * 2, 10)
    })

    it('calculates tokens correctly: input = ceil(chars/4), output = 2x input', () => {
      const handler = getHandler('workflow:estimate-cost')
      // 100 chars => 25 input tokens => 50 output tokens => 75 total
      const result = handler(mockEvent, {
        steps: [makeStep({ prompt: 'x'.repeat(100) })],
      }) as { totalTokens: number }

      expect(result.totalTokens).toBe(75)
    })

    it('applies pricing formula correctly', () => {
      const handler = getHandler('workflow:estimate-cost')
      // 120 chars => 30 input tokens, 60 output tokens => 90 total tokens
      // Cost formula: (totalTokens / 3) * 3 / 1_000_000 + (totalTokens * 2 / 3) * 15 / 1_000_000
      // = (90 / 3) * 3 / 1_000_000 + (90 * 2 / 3) * 15 / 1_000_000
      // = 90 / 1_000_000 + 900 / 1_000_000
      // = 0.000090 + 0.000900
      // = 0.000990
      const result = handler(mockEvent, {
        steps: [makeStep({ prompt: 'x'.repeat(120) })],
      }) as { totalTokens: number; estimatedCost: number }

      expect(result.totalTokens).toBe(90)
      // BUG: The cost formula in workflowHandlers.ts is mathematically suspect.
      // It computes: (totalTokens / 3) * 3 / 1_000_000 + (totalTokens * 2 / 3) * 15 / 1_000_000
      // Which simplifies to: totalTokens * 1 / 1_000_000 + totalTokens * 10 / 1_000_000
      //                    = totalTokens * 11 / 1_000_000
      // This doesn't actually separate input from output token pricing.
      // It uses totalTokens (input+output combined) and divides by 3 for "input share"
      // and 2/3 for "output share" — but totalTokens already includes both.
      // The correct formula should use inputTokens and outputTokens separately.
      // See BUG-020.
      const expected = (90 / 3) * 3 / 1_000_000 + (90 * 2 / 3) * 15 / 1_000_000
      expect(result.estimatedCost).toBeCloseTo(expected, 10)
    })
  })
})
