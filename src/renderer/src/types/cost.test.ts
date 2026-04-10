import { describe, it, expect } from 'vitest'
import { estimateCost, MODEL_PRICING, DEFAULT_BUDGET } from './cost'

describe('cost utilities', () => {
  describe('estimateCost', () => {
    it('calculates cost for a known model', () => {
      // sonnet: input $3/1M, output $15/1M
      const cost = estimateCost('sonnet', 1_000_000, 1_000_000)
      expect(cost).toBe(3 + 15) // $18
    })

    it('returns zero cost for zero tokens', () => {
      expect(estimateCost('sonnet', 0, 0)).toBe(0)
    })

    it('handles small token counts correctly', () => {
      // 1000 input tokens at $3/1M = $0.003, 500 output at $15/1M = $0.0075
      const cost = estimateCost('sonnet', 1_000, 500)
      expect(cost).toBeCloseTo(0.0105, 4)
    })

    it('uses default pricing for unknown models', () => {
      // Default: input $3/1M, output $15/1M
      const cost = estimateCost('unknown-future-model', 1_000_000, 1_000_000)
      expect(cost).toBe(3 + 15)
    })

    it('calculates correctly for cheaper models', () => {
      // haiku: input $1/1M, output $5/1M
      const cost = estimateCost('haiku', 500_000, 200_000)
      expect(cost).toBeCloseTo(0.5 + 1.0, 4)
    })

    it('calculates correctly for expensive models', () => {
      // opus: input $5/1M, output $25/1M
      const cost = estimateCost('opus', 100_000, 50_000)
      expect(cost).toBeCloseTo(0.5 + 1.25, 4)
    })
  })

  describe('MODEL_PRICING', () => {
    it('has pricing for all major Claude models', () => {
      expect(MODEL_PRICING['sonnet']).toBeDefined()
      expect(MODEL_PRICING['opus']).toBeDefined()
      expect(MODEL_PRICING['haiku']).toBeDefined()
      expect(MODEL_PRICING['claude-sonnet-4.5']).toBeDefined()
    })

    it('has pricing for GPT models', () => {
      expect(MODEL_PRICING['gpt-5']).toBeDefined()
      expect(MODEL_PRICING['gpt-4o']).toBeDefined()
    })

    it('has pricing for Gemini models', () => {
      expect(MODEL_PRICING['gemini-2.5-pro']).toBeDefined()
    })

    it('all pricing entries have positive input and output rates', () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.input, `${model} input`).toBeGreaterThan(0)
        expect(pricing.output, `${model} output`).toBeGreaterThan(0)
      }
    })
  })

  describe('DEFAULT_BUDGET', () => {
    it('has all ceilings set to null by default', () => {
      expect(DEFAULT_BUDGET.dailyCeiling).toBeNull()
      expect(DEFAULT_BUDGET.weeklyCeiling).toBeNull()
      expect(DEFAULT_BUDGET.monthlyCeiling).toBeNull()
      expect(DEFAULT_BUDGET.dailyTokenCeiling).toBeNull()
      expect(DEFAULT_BUDGET.weeklyTokenCeiling).toBeNull()
      expect(DEFAULT_BUDGET.monthlyTokenCeiling).toBeNull()
    })

    it('has autoPauseAtLimit disabled by default', () => {
      expect(DEFAULT_BUDGET.autoPauseAtLimit).toBe(false)
    })
  })
})
