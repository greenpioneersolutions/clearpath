import { describe, it, expect } from 'vitest'
import { estimateCost, resolveModelAlias, MODEL_PRICING, DEFAULT_PRICING_TABLE } from './index'

describe('shared/pricing', () => {
  describe('estimateCost', () => {
    it('uses default table when no table arg is passed', () => {
      const cost = estimateCost('claude-sonnet-4.5', 1_000_000, 1_000_000)
      // sonnet: $3 input + $15 output per 1M tokens
      expect(cost).toBeCloseTo(18, 5)
    })

    it('returns 0 for zero tokens', () => {
      expect(estimateCost('claude-sonnet-4.5', 0, 0)).toBe(0)
    })

    it('resolves aliases (sonnet → claude-sonnet-4.5) without a hop in the call site', () => {
      const aliased = estimateCost('sonnet', 100_000, 50_000)
      const canonical = estimateCost('claude-sonnet-4.5', 100_000, 50_000)
      expect(aliased).toBeCloseTo(canonical, 8)
    })

    it('falls back to $3/$15 for unknown models', () => {
      // 1M input @ $3 + 1M output @ $15 = $18
      expect(estimateCost('unknown-future-model', 1_000_000, 1_000_000)).toBeCloseTo(18, 5)
    })

    it('honors a custom effective table when provided', () => {
      const custom = {
        ...DEFAULT_PRICING_TABLE,
        models: {
          ...DEFAULT_PRICING_TABLE.models,
          'claude-sonnet-4.5': { input: 0, output: 0, provider: 'anthropic' as const },
        },
      }
      expect(estimateCost('claude-sonnet-4.5', 1_000_000, 1_000_000, custom)).toBe(0)
    })

    it('resolves an alias through a custom table', () => {
      const custom = {
        ...DEFAULT_PRICING_TABLE,
        models: {
          ...DEFAULT_PRICING_TABLE.models,
          'claude-sonnet-4.5': { input: 6, output: 30, provider: 'anthropic' as const },
        },
      }
      // sonnet aliasOf → claude-sonnet-4.5 — should pick up the override.
      expect(estimateCost('sonnet', 1_000_000, 0, custom)).toBeCloseTo(6, 5)
    })
  })

  describe('resolveModelAlias', () => {
    it('returns the canonical id for known aliases', () => {
      expect(resolveModelAlias('sonnet')).toBe('claude-sonnet-4.5')
      expect(resolveModelAlias('opus')).toBe('claude-opus-4.5')
      expect(resolveModelAlias('haiku')).toBe('claude-haiku-4.5')
    })

    it('returns the input unchanged for non-aliased ids', () => {
      expect(resolveModelAlias('claude-sonnet-4.5')).toBe('claude-sonnet-4.5')
      expect(resolveModelAlias('gpt-5')).toBe('gpt-5')
      expect(resolveModelAlias('totally-unknown')).toBe('totally-unknown')
    })
  })

  describe('back-compat MODEL_PRICING', () => {
    it('exposes the legacy `{ input, output }` shape for all canonical models', () => {
      expect(MODEL_PRICING['claude-sonnet-4.5']).toEqual({ input: 3, output: 15 })
      expect(MODEL_PRICING['claude-haiku-4.5']).toEqual({ input: 1, output: 5 })
      expect(MODEL_PRICING['claude-opus-4.5']).toEqual({ input: 5, output: 25 })
      expect(MODEL_PRICING['gpt-5']).toEqual({ input: 5, output: 15 })
      expect(MODEL_PRICING['gemini-3-pro']).toEqual({ input: 3.5, output: 10.5 })
    })

    it('exposes the Claude Code aliases too', () => {
      expect(MODEL_PRICING['sonnet']).toEqual({ input: 3, output: 15 })
      expect(MODEL_PRICING['opus']).toEqual({ input: 5, output: 25 })
      expect(MODEL_PRICING['haiku']).toEqual({ input: 1, output: 5 })
    })

    it('matches the canonical defaults — no drift between the two views', () => {
      for (const [id, entry] of Object.entries(DEFAULT_PRICING_TABLE.models)) {
        expect(MODEL_PRICING[id]).toEqual({ input: entry.input, output: entry.output })
      }
    })
  })
})
