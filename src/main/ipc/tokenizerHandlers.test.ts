import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'

vi.mock('../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// setup-coverage eagerly pre-loads modules, so vi.mock here only takes effect
// after vi.resetModules + dynamic import. Pattern documented in agent memory
// (`feedback_test_mocking_pattern`).
vi.mock('../tokenization/TokenCounter', () => ({
  tokenCounter: {
    count: vi.fn((text: string) => text.length),
  },
  TokenCounter: class {},
}))

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

describe('tokenizerHandlers', () => {
  let handlers: HandlerMap

  beforeEach(async () => {
    vi.clearAllMocks()
    ;(ipcMain.handle as ReturnType<typeof vi.fn>).mockClear()
    vi.resetModules()
    const mod = await import('./tokenizerHandlers')
    mod.registerTokenizerHandlers(ipcMain as unknown as Electron.IpcMain)
    handlers = extractHandlers()
  })

  it('registers tokenizer:count-multi', () => {
    expect(Object.keys(handlers)).toContain('tokenizer:count-multi')
  })

  it('returns the SliceTokenBreakdown shape with all required fields', () => {
    const result = handlers['tokenizer:count-multi']({}, {
      slices: { userText: 'abcd', agentPrompt: 'agent', notesFramed: 'note' },
      model: 'sonnet',
    }) as Record<string, number>
    expect(result).toHaveProperty('userPrompt')
    expect(result).toHaveProperty('agentPrompt')
    expect(result).toHaveProperty('notesFramed')
    expect(result).toHaveProperty('contextSources')
    expect(result).toHaveProperty('fleetPrefix')
    expect(result).toHaveProperty('injectedTotal')
    expect(result).toHaveProperty('total')
    expect(result.userPrompt).toBe(4)
    expect(result.agentPrompt).toBe(5)
    expect(result.notesFramed).toBe(4)
    expect(result.injectedTotal).toBe(9)
    expect(result.total).toBe(13)
  })

  it('falls back to user-blob attribution when slices are omitted', () => {
    const result = handlers['tokenizer:count-multi']({}, {
      prompt: 'just a blob',
      model: 'sonnet',
    }) as Record<string, number>
    expect(result.userPrompt).toBe('just a blob'.length)
    expect(result.injectedTotal).toBe(0)
    expect(result.total).toBe('just a blob'.length)
  })

  it('defaults to `unknown` model when none is supplied', () => {
    // Should not throw and should still produce a sane object.
    const result = handlers['tokenizer:count-multi']({}, {
      slices: { userText: 'ab' },
      model: '',
    }) as Record<string, number>
    expect(result.userPrompt).toBe(2)
  })
})
