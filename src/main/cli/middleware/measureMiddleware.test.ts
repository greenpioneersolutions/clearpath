import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock the singleton so we get predictable counts without invoking the real
// tokenizers. setup-coverage eagerly pre-loads modules so we need to
// vi.resetModules + dynamic import inside each test for the mock to apply —
// this pattern is documented in agent memory under
// `feedback_test_mocking_pattern`.
vi.mock('../../tokenization/TokenCounter', () => ({
  tokenCounter: {
    count: vi.fn((text: string) => text.length),
  },
  TokenCounter: class {},
}))

import type { MiddlewareContext } from './pipeline'

function ctx(over: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    sessionId: 's',
    cli: 'copilot-cli',
    model: 'gpt-5-mini',
    prompt: 'hi',
    slices: { userText: 'hi' },
    meta: { turnIndex: 0, isFirstTurn: true },
    notes: [],
    ...over,
  }
}

describe('measureMiddleware', () => {
  let measureMiddleware: typeof import('./measureMiddleware').measureMiddleware

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('./measureMiddleware')
    measureMiddleware = mod.measureMiddleware
  })

  it('populates per-slice tokens when slices are provided', async () => {
    const result = await measureMiddleware(ctx({
      slices: {
        userText: 'hello',           // 5
        agentPrompt: 'agent text',   // 10
        notesFramed: 'notes',        // 5
        contextSources: 'sources',   // 7
        fleetPrefix: 'fleet',        // 5
      },
    }))
    expect(result.tokens).toEqual({
      userPrompt: 5,
      agentPrompt: 10,
      notesFramed: 5,
      contextSources: 7,
      fleetPrefix: 5,
      injectedTotal: 27,
      total: 32,
    })
  })

  it('zeros every slice and bundles into userPrompt when slices are undefined', async () => {
    const result = await measureMiddleware(ctx({
      slices: undefined,
      prompt: 'full prompt blob',  // 16
    }))
    expect(result.tokens).toEqual({
      userPrompt: 16,
      agentPrompt: 0,
      notesFramed: 0,
      contextSources: 0,
      fleetPrefix: 0,
      injectedTotal: 0,
      total: 16,
    })
  })

  it('treats absent slice fields as 0 (does not fail on partial slices)', async () => {
    const result = await measureMiddleware(ctx({
      slices: { userText: 'abc' },  // 3
    }))
    expect(result.tokens?.userPrompt).toBe(3)
    expect(result.tokens?.agentPrompt).toBe(0)
    expect(result.tokens?.injectedTotal).toBe(0)
    expect(result.tokens?.total).toBe(3)
  })
})
