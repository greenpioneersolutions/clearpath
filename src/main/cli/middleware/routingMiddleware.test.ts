import { describe, it, expect, vi } from 'vitest'

vi.mock('../../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { createRoutingMiddleware } from './routingMiddleware'
import { DEFAULT_ROUTING_RULES, type RoutingRules } from '../../routing/RoutingRules'
import type { MiddlewareContext } from './pipeline'

function baseCtx(over: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    sessionId: 's',
    cli: 'copilot-cli',
    model: 'sonnet',  // pre-pipeline session model
    prompt: 'hello',
    slices: { userText: 'hello' },
    meta: { turnIndex: 0, isFirstTurn: true },
    notes: [],
    tokens: {
      userPrompt: 5,
      agentPrompt: 0,
      notesFramed: 0,
      contextSources: 0,
      fleetPrefix: 0,
      injectedTotal: 0,
      total: 5,
    },
    ...over,
  }
}

describe('routingMiddleware', () => {
  it('no-ops when rules are disabled', async () => {
    const mw = createRoutingMiddleware({ getRules: () => ({ ...DEFAULT_ROUTING_RULES, enabled: false }) })
    const ctx = baseCtx()
    const result = await mw(ctx)
    expect(result.model).toBe('sonnet')
    expect(result.routedModel).toBeUndefined()
    expect(result.classification).toBeUndefined()
    // notes should not have been mutated
    expect(result.notes).toEqual([])
  })

  it('routes a trivial prompt to the trivial-tier model when enabled', async () => {
    const rules: RoutingRules = { ...DEFAULT_ROUTING_RULES, enabled: true }
    const mw = createRoutingMiddleware({ getRules: () => rules })
    const result = await mw(baseCtx({
      cli: 'copilot-cli',
      slices: { userText: 'What time is it?' },
      tokens: { userPrompt: 5, agentPrompt: 0, notesFramed: 0, contextSources: 0, fleetPrefix: 0, injectedTotal: 0, total: 5 },
    }))
    expect(result.classification?.difficulty).toBe('trivial')
    expect(result.model).toBe(rules.copilot.trivial)
    expect(result.routedModel).toBe(rules.copilot.trivial)
    expect(result.notes[0]).toContain('routing:')
    expect(result.notes[0]).toContain(rules.copilot.trivial)
  })

  it('routes a hard prompt to the hard-tier model', async () => {
    const rules: RoutingRules = { ...DEFAULT_ROUTING_RULES, enabled: true }
    const mw = createRoutingMiddleware({ getRules: () => rules })
    const result = await mw(baseCtx({
      cli: 'copilot-cli',
      slices: { userText: 'Refactor the authentication middleware across all backends' },
      tokens: { userPrompt: 11, agentPrompt: 0, notesFramed: 0, contextSources: 0, fleetPrefix: 0, injectedTotal: 0, total: 11 },
    }))
    expect(result.classification?.difficulty).toBe('hard')
    expect(result.model).toBe(rules.copilot.hard)
  })

  it('uses claude tier for claude CLIs', async () => {
    const rules: RoutingRules = { ...DEFAULT_ROUTING_RULES, enabled: true }
    const mw = createRoutingMiddleware({ getRules: () => rules })
    const result = await mw(baseCtx({
      cli: 'claude-cli',
      slices: { userText: 'What time is it?' },
      tokens: { userPrompt: 5, agentPrompt: 0, notesFramed: 0, contextSources: 0, fleetPrefix: 0, injectedTotal: 0, total: 5 },
    }))
    expect(result.model).toBe(rules.claude.trivial)
  })

  it('honors a user override absolutely (skips classification, uses chip model)', async () => {
    const rules: RoutingRules = { ...DEFAULT_ROUTING_RULES, enabled: true }
    const mw = createRoutingMiddleware({ getRules: () => rules })
    const result = await mw(baseCtx({
      cli: 'copilot-cli',
      slices: { userText: 'What time is it?' },  // would normally route to trivial
      userOverride: { model: 'claude-opus-4.6' },
    }))
    expect(result.model).toBe('claude-opus-4.6')
    expect(result.routedModel).toBe('claude-opus-4.6')
    // Classification should not have been computed.
    expect(result.classification).toBeUndefined()
    expect(result.notes[0]).toContain('user override')
  })

  it('treats prompts starting with `/` as slash commands (signal passed to classifier)', async () => {
    const rules: RoutingRules = { ...DEFAULT_ROUTING_RULES, enabled: true }
    const mw = createRoutingMiddleware({ getRules: () => rules })
    const result = await mw(baseCtx({
      slices: { userText: '/help' },
      prompt: '/help',
      tokens: { userPrompt: 2, agentPrompt: 0, notesFramed: 0, contextSources: 0, fleetPrefix: 0, injectedTotal: 0, total: 2 },
    }))
    expect(result.classification?.difficulty).toBe('trivial')
  })

  it('handles missing tokens block by falling back to 0 (still classifies)', async () => {
    const rules: RoutingRules = { ...DEFAULT_ROUTING_RULES, enabled: true }
    const mw = createRoutingMiddleware({ getRules: () => rules })
    const result = await mw(baseCtx({
      tokens: undefined,
      slices: { userText: 'Refactor everything' },
    }))
    // Even with 0 tokens, the keyword "refactor" should fire hard.
    expect(result.classification?.difficulty).toBe('hard')
  })

  it('reads rules through the getter on every invocation (picks up changes)', async () => {
    let enabled = false
    const mw = createRoutingMiddleware({ getRules: () => ({ ...DEFAULT_ROUTING_RULES, enabled }) })
    const first = await mw(baseCtx())
    expect(first.routedModel).toBeUndefined()
    enabled = true
    const second = await mw(baseCtx({ slices: { userText: 'Refactor everything' } }))
    expect(second.routedModel).toBe(DEFAULT_ROUTING_RULES.copilot.hard)
  })
})
