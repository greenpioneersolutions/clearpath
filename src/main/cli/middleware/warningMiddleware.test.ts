import { describe, it, expect, vi } from 'vitest'

vi.mock('../../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createWarningMiddleware } from './warningMiddleware'
import { DEFAULT_PRICING_TABLE } from '../../../shared/pricing/defaults'
import type { MiddlewareContext } from './pipeline'
import type { ClassificationResult } from '../../routing/DifficultyClassifier'

function baseCtx(over: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    sessionId: 's',
    cli: 'copilot-cli',
    model: 'sonnet',
    prompt: 'hello',
    slices: { userText: 'hello' },
    meta: { turnIndex: 0, isFirstTurn: true },
    notes: [],
    tokens: {
      userPrompt: 10,
      agentPrompt: 0,
      notesFramed: 0,
      contextSources: 0,
      fleetPrefix: 0,
      injectedTotal: 0,
      total: 10,
    },
    ...over,
  }
}

const deps = { getPricingTable: () => DEFAULT_PRICING_TABLE }

describe('warningMiddleware', () => {
  it('no-ops below all thresholds — silent', async () => {
    const mw = createWarningMiddleware(deps)
    const result = await mw(baseCtx())
    expect(result.notes).toEqual([])
  })

  it('no-ops when tokens is missing (defensive)', async () => {
    const mw = createWarningMiddleware(deps)
    const ctx = baseCtx()
    delete (ctx as Partial<MiddlewareContext>).tokens
    const result = await mw(ctx)
    expect(result.notes).toEqual([])
  })

  describe('high-cost warning', () => {
    it('fires when input-only cost exceeds $0.05 on opus (5 in, 25 out / Mtok)', async () => {
      const mw = createWarningMiddleware(deps)
      // claude-opus-4.6: $5/Mtok input → 11k tokens = $0.055 (>$0.05)
      const result = await mw(baseCtx({
        model: 'claude-opus-4.6',
        tokens: {
          userPrompt: 1000, agentPrompt: 10_000, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 10_000, total: 11_000,
        },
      }))
      expect(result.notes.length).toBe(1)
      expect(result.notes[0]).toMatch(/^warn:/)
      expect(result.notes[0]).toContain('cost')
      expect(result.notes[0]).toContain('agent prompt')
    })

    it('does NOT fire when cost is at or below threshold', async () => {
      const mw = createWarningMiddleware(deps)
      // sonnet $3/Mtok input — 10k tokens = $0.03 (below threshold)
      const result = await mw(baseCtx({
        model: 'claude-sonnet-4.5',
        tokens: {
          userPrompt: 10_000, agentPrompt: 0, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 0, total: 10_000,
        },
      }))
      expect(result.notes).toEqual([])
    })

    it('names the top contributing slice', async () => {
      const mw = createWarningMiddleware(deps)
      // Top contributor: notes (90%)
      const result = await mw(baseCtx({
        model: 'claude-opus-4.6',
        tokens: {
          userPrompt: 1000, agentPrompt: 0, notesFramed: 12_000, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 12_000, total: 13_000,
        },
      }))
      expect(result.notes[0]).toContain('notes')
    })
  })

  describe('huge attachment warning', () => {
    it('fires when a notes slice exceeds 5,000 tok (and cost is below threshold)', async () => {
      const mw = createWarningMiddleware(deps)
      // gpt-5-mini $0.4/Mtok — 6k tokens input = $0.0024 (below high-cost threshold)
      const result = await mw(baseCtx({
        model: 'gpt-5-mini',
        tokens: {
          userPrompt: 50, agentPrompt: 0, notesFramed: 6000, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 6000, total: 6050,
        },
      }))
      expect(result.notes.length).toBe(1)
      expect(result.notes[0]).toMatch(/^warn:/)
      expect(result.notes[0]).toContain('notes')
      expect(result.notes[0]).toContain('Notes')  // suggestion text mentions Notes UI
    })

    it('fires when a context-sources slice is huge', async () => {
      const mw = createWarningMiddleware(deps)
      const result = await mw(baseCtx({
        model: 'gpt-5-mini',
        tokens: {
          userPrompt: 50, agentPrompt: 0, notesFramed: 0, contextSources: 8000,
          fleetPrefix: 0, injectedTotal: 8000, total: 8050,
        },
      }))
      expect(result.notes.length).toBe(1)
      expect(result.notes[0]).toContain('context sources')
    })

    it('does NOT fire when no single slice exceeds 5,000 tok (split across slices)', async () => {
      const mw = createWarningMiddleware(deps)
      const result = await mw(baseCtx({
        model: 'gpt-5-mini',
        tokens: {
          userPrompt: 100, agentPrompt: 4000, notesFramed: 4000, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 8000, total: 8100,
        },
      }))
      expect(result.notes).toEqual([])
    })
  })

  describe('context-window warning', () => {
    it('fires at 70% of the routed model context window', async () => {
      const mw = createWarningMiddleware(deps)
      // gpt-5-mini context window = 128k. 70% = 89.6k. Use 90k.
      // 90k input on gpt-5-mini = $0.036 → below high-cost threshold, so
      // the context-window warning wins on rank-1.
      const result = await mw(baseCtx({
        model: 'gpt-5-mini',
        tokens: {
          userPrompt: 90_000, agentPrompt: 0, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 0, total: 90_000,
        },
      }))
      expect(result.notes.length).toBe(1)
      expect(result.notes[0]).toMatch(/^warn:/)
      expect(result.notes[0]).toContain('context window')
      expect(result.notes[0]).toContain('/compact')
    })

    it('does NOT fire below 70%', async () => {
      const mw = createWarningMiddleware(deps)
      // 50k on gpt-5-mini = 39% — silent
      const result = await mw(baseCtx({
        model: 'gpt-5-mini',
        tokens: {
          userPrompt: 50_000, agentPrompt: 0, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 0, total: 50_000,
        },
      }))
      expect(result.notes).toEqual([])
    })

    it('uses the routed model (not the original) for the window lookup', async () => {
      const mw = createWarningMiddleware(deps)
      // Original model is claude-opus-4.6 (200k window — 90k = 45%). Routed
      // to gpt-5-mini (128k — 90k = 70%). Should fire on the ROUTED model.
      const result = await mw(baseCtx({
        model: 'claude-opus-4.6',
        routedModel: 'gpt-5-mini',
        tokens: {
          userPrompt: 90_000, agentPrompt: 0, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 0, total: 90_000,
        },
      }))
      expect(result.notes.length).toBe(1)
      expect(result.notes[0]).toContain('gpt-5-mini')
    })
  })

  describe('deduplication / ranking', () => {
    it('picks context-window over high-cost when both fire', async () => {
      const mw = createWarningMiddleware(deps)
      // claude-opus-4.6 200k window — 150k input would cost $0.75 (high-cost)
      // AND 75% of context (context-window). Context-window wins.
      const result = await mw(baseCtx({
        model: 'claude-opus-4.6',
        tokens: {
          userPrompt: 150_000, agentPrompt: 0, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 0, total: 150_000,
        },
      }))
      expect(result.notes.length).toBe(1)
      expect(result.notes[0]).toContain('context window')
    })

    it('picks high-cost over huge-attachment when both fire', async () => {
      const mw = createWarningMiddleware(deps)
      // claude-opus-4.6 — notes 12k tok (huge slice) AND 12k input → $0.06 (high-cost)
      const result = await mw(baseCtx({
        model: 'claude-opus-4.6',
        tokens: {
          userPrompt: 100, agentPrompt: 0, notesFramed: 12_000, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 12_000, total: 12_100,
        },
      }))
      expect(result.notes.length).toBe(1)
      // High-cost message starts with "this prompt would cost"
      expect(result.notes[0]).toContain('cost')
    })

    it('emits at most ONE warning per turn', async () => {
      const mw = createWarningMiddleware(deps)
      const result = await mw(baseCtx({
        model: 'claude-opus-4.6',
        tokens: {
          userPrompt: 100, agentPrompt: 0, notesFramed: 12_000, contextSources: 8000,
          fleetPrefix: 0, injectedTotal: 20_000, total: 20_100,
        },
      }))
      expect(result.notes.length).toBe(1)
    })
  })

  describe('cheap-route override info', () => {
    it('emits info when classifier said trivial but user overrode to opus', async () => {
      const mw = createWarningMiddleware(deps)
      const classification: ClassificationResult = {
        difficulty: 'trivial',
        confidence: 0.9,
        reasons: ['short prompt'],
      }
      const result = await mw(baseCtx({
        cli: 'copilot-cli',
        model: 'claude-opus-4.6',
        classification,
        userOverride: { model: 'claude-opus-4.6' },
        tokens: {
          userPrompt: 10, agentPrompt: 0, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 0, total: 10,
        },
      }))
      expect(result.notes.length).toBe(1)
      expect(result.notes[0]).toMatch(/^info:/)
      expect(result.notes[0]).toContain('overridden')
      expect(result.notes[0]).toContain('claude-opus-4.6')
    })

    it('does NOT emit when classification difficulty is normal', async () => {
      const mw = createWarningMiddleware(deps)
      const classification: ClassificationResult = {
        difficulty: 'normal',
        confidence: 0.7,
        reasons: ['has code fence'],
      }
      const result = await mw(baseCtx({
        classification,
        userOverride: { model: 'claude-opus-4.6' },
        tokens: {
          userPrompt: 50, agentPrompt: 0, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 0, total: 50,
        },
      }))
      expect(result.notes).toEqual([])
    })
  })

  describe('severity prefixes', () => {
    it('warn: prefix on cost/size warnings', async () => {
      const mw = createWarningMiddleware(deps)
      const result = await mw(baseCtx({
        model: 'claude-opus-4.6',
        tokens: {
          userPrompt: 1000, agentPrompt: 12_000, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 12_000, total: 13_000,
        },
      }))
      expect(result.notes[0].startsWith('warn:')).toBe(true)
    })

    it('info: prefix on the override note (no-action heads-up)', async () => {
      const mw = createWarningMiddleware(deps)
      const result = await mw(baseCtx({
        classification: { difficulty: 'trivial', confidence: 0.9, reasons: [] },
        userOverride: { model: 'claude-opus-4.6' },
        tokens: {
          userPrompt: 10, agentPrompt: 0, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 0, total: 10,
        },
      }))
      expect(result.notes[0].startsWith('info:')).toBe(true)
    })
  })

  describe('preserves existing notes', () => {
    it('appends to ctx.notes rather than replacing', async () => {
      const mw = createWarningMiddleware(deps)
      const result = await mw(baseCtx({
        notes: ['routing: trivial → haiku · short prompt'],
        model: 'claude-opus-4.6',
        tokens: {
          userPrompt: 1000, agentPrompt: 12_000, notesFramed: 0, contextSources: 0,
          fleetPrefix: 0, injectedTotal: 12_000, total: 13_000,
        },
      }))
      expect(result.notes.length).toBe(2)
      expect(result.notes[0]).toContain('routing:')
      expect(result.notes[1]).toMatch(/^warn:/)
    })
  })
})
