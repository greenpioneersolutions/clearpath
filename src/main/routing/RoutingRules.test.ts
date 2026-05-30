import { describe, it, expect } from 'vitest'
import { DEFAULT_ROUTING_RULES, resolveModelForDifficulty, type RoutingRules } from './RoutingRules'

describe('RoutingRules defaults', () => {
  it('disables routing by default (opt-in)', () => {
    expect(DEFAULT_ROUTING_RULES.enabled).toBe(false)
  })

  it('uses a free model for copilot trivial', () => {
    expect(DEFAULT_ROUTING_RULES.copilot.trivial).toBe('gpt-5-mini')
  })

  it('uses a 1x model for copilot normal', () => {
    expect(DEFAULT_ROUTING_RULES.copilot.normal).toBe('claude-sonnet-4.5')
  })

  it('uses a 3x model for copilot hard', () => {
    expect(DEFAULT_ROUTING_RULES.copilot.hard).toBe('claude-opus-4.6')
  })

  it('uses haiku/sonnet/opus shorthand for claude tiers', () => {
    expect(DEFAULT_ROUTING_RULES.claude).toEqual({
      trivial: 'haiku',
      normal: 'sonnet',
      hard: 'opus',
    })
  })

  it('every tier value is a non-empty string', () => {
    for (const provider of ['copilot', 'claude'] as const) {
      for (const tier of ['trivial', 'normal', 'hard'] as const) {
        expect(DEFAULT_ROUTING_RULES[provider][tier]).toBeTruthy()
        expect(typeof DEFAULT_ROUTING_RULES[provider][tier]).toBe('string')
      }
    }
  })
})

describe('resolveModelForDifficulty', () => {
  it('returns the configured model for each tier', () => {
    const rules: RoutingRules = {
      enabled: true,
      copilot: { trivial: 'a', normal: 'b', hard: 'c' },
      claude: { trivial: 'x', normal: 'y', hard: 'z' },
    }
    expect(resolveModelForDifficulty(rules, 'copilot', 'trivial')).toBe('a')
    expect(resolveModelForDifficulty(rules, 'copilot', 'normal')).toBe('b')
    expect(resolveModelForDifficulty(rules, 'copilot', 'hard')).toBe('c')
    expect(resolveModelForDifficulty(rules, 'claude', 'trivial')).toBe('x')
    expect(resolveModelForDifficulty(rules, 'claude', 'normal')).toBe('y')
    expect(resolveModelForDifficulty(rules, 'claude', 'hard')).toBe('z')
  })

  it('falls back to defaults when a tier is missing on the supplied rules', () => {
    // Simulate a rules object with a missing field (e.g., schema mismatch
    // from a hand-edited JSON).
    const rules = {
      enabled: true,
      copilot: { trivial: '', normal: 'override', hard: '' },
      claude: { trivial: '', normal: '', hard: '' },
    } as RoutingRules
    expect(resolveModelForDifficulty(rules, 'copilot', 'trivial')).toBe(DEFAULT_ROUTING_RULES.copilot.trivial)
    expect(resolveModelForDifficulty(rules, 'copilot', 'normal')).toBe('override')
    expect(resolveModelForDifficulty(rules, 'copilot', 'hard')).toBe(DEFAULT_ROUTING_RULES.copilot.hard)
    expect(resolveModelForDifficulty(rules, 'claude', 'trivial')).toBe(DEFAULT_ROUTING_RULES.claude.trivial)
  })
})
