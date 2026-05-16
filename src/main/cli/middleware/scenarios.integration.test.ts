import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'

// Mock the logger so partial pipeline failures don't pollute stdout.
vi.mock('../../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// IMPORTANT: We do NOT mock TokenCounter here. The integration goal is to
// run the REAL pipeline (lint + measure + routing + warning) against
// realistic inputs. TokenCounter is fast and will fall back to the 4-char
// heuristic in this Node test env if @anthropic-ai/tokenizer / tiktoken
// don't initialize — that is intentional and acceptable for these tests.
// We only need stable, monotonically-meaningful counts, not vendor-accurate ones.

import { runPipeline, type MiddlewareContext } from './pipeline'
import { buildPipeline } from './index'
import type { RoutingRules } from '../../routing/RoutingRules'
import type { PricingTable } from '../../../shared/pricing/defaults'
import { tokenCounter } from '../../tokenization/TokenCounter'
import { contextWindowFor } from '../../../shared/tokenization/contextWindows'

// ── Test fixtures ──────────────────────────────────────────────────────────

/**
 * A fixed pricing table used across scenarios so the high-cost warning
 * threshold ($0.05) bites at predictable token counts. We pin sonnet/opus
 * to their published values and keep the heuristic-derived behavior intact.
 */
const FIXED_PRICING: PricingTable = {
  lastUpdated: '2026-05-15',
  source: 'test',
  models: {
    'claude-sonnet-4.5': { provider: 'anthropic', input: 3,   output: 15 },
    'claude-opus-4.6':   { provider: 'anthropic', input: 5,   output: 25 },
    'claude-haiku-4.5':  { provider: 'anthropic', input: 1,   output: 5  },
    'sonnet':            { provider: 'anthropic', input: 3,   output: 15, aliasOf: 'claude-sonnet-4.5' },
    'opus':              { provider: 'anthropic', input: 5,   output: 25, aliasOf: 'claude-opus-4.6'  },
    'haiku':             { provider: 'anthropic', input: 1,   output: 5,  aliasOf: 'claude-haiku-4.5' },
    'gpt-5-mini':        { provider: 'openai',    input: 0.4, output: 1.6 },
    'gpt-5':             { provider: 'openai',    input: 5,   output: 15  },
  },
}

const ENABLED_ROUTING_RULES: RoutingRules = {
  enabled: true,
  copilot: { trivial: 'gpt-5-mini',     normal: 'claude-sonnet-4.5', hard: 'claude-opus-4.6' },
  // Note: per scenario D, "Copilot CLI rules { trivial: 'haiku', normal: 'sonnet', hard: 'opus' }".
  // We expose the same shape for the claude side, plus override copilot below in the test.
  claude:  { trivial: 'haiku',          normal: 'sonnet',            hard: 'opus' },
}

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function baseCtx(over: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    sessionId: 'integration-session',
    cli: 'copilot-cli',
    model: 'claude-sonnet-4.5',
    prompt: '',
    slices: { userText: '' },
    meta: { turnIndex: 0, isFirstTurn: true },
    notes: [],
    ...over,
  }
}

const defaultDeps = {
  routing: { getRules: () => ENABLED_ROUTING_RULES },
  warning: { getPricingTable: () => FIXED_PRICING },
}

// ── Scenario A: 10-turn breakdown sums ─────────────────────────────────────

describe('Scenario A — 10-turn breakdown sums and stable-prefix cache discipline', () => {
  // Build stable, realistic content for the agent + notes slices. These are
  // identical bytes across all 10 turns. Only the user text varies.
  const stableAgent = (
    'You are ClearPath, a manager-friendly assistant. ' +
    'Always respond with clear, plain language. When the user is non-technical, ' +
    'avoid jargon. Follow the user\'s instructions precisely. ' +
    'Cite file paths with absolute paths. Never expose tokens. '
  ).repeat(2)  // ~800-character target

  const stableNotes = (
    '<notes count="1">\n  <note title="Project conventions" category="reference" tags="conv">\n' +
    'Always use absolute paths in responses. Prefer Tailwind over CSS modules. ' +
    'When proposing edits, name the affected files first. Sessions are persisted via ' +
    'electron-store at ~/Library/Application Support/clear-path/. The Copilot CLI ' +
    'is primary; Claude Code is secondary; local models are tertiary. ' +
    '  </note>\n</notes>\n\nUser request:\n'
  ).repeat(2)  // ~1200-character target

  it('produces 10 turns where stable-slice byte content is byte-identical (cache-friendly prefix)', async () => {
    const pipeline = buildPipeline(defaultDeps)
    const prefixChecksums: string[] = []
    const breakdowns: NonNullable<MiddlewareContext['tokens']>[] = []

    for (let turn = 0; turn < 10; turn++) {
      const userText = `Follow-up question for turn ${turn}: please summarize the latest change.`
      const ctx = baseCtx({
        slices: {
          userText,
          agentPrompt: stableAgent,
          notesFramed: stableNotes,
        },
        prompt: '',  // pipeline rebuilds via prefixOrderMiddleware
        meta: { turnIndex: turn, isFirstTurn: turn === 0 },
      })
      const out = await runPipeline(ctx, pipeline)
      expect(out.tokens).toBeDefined()
      breakdowns.push(out.tokens!)
      // Take the stable prefix slice (everything BEFORE userText) and checksum it.
      // The prefix-order middleware exposes `cacheBreakpoint` as the byte offset
      // where the volatile suffix starts.
      expect(out.cacheBreakpoint).toBeGreaterThan(0)
      const prefix = out.prompt.slice(0, out.cacheBreakpoint!)
      prefixChecksums.push(sha(prefix))
    }

    // Every prefix checksum should be IDENTICAL — that's what makes prompt
    // caching engage on turns 2-10.
    const distinct = new Set(prefixChecksums)
    expect(distinct.size).toBe(1)
  })

  it('per-turn breakdown slice sums equal total within ±0 tokens', async () => {
    const pipeline = buildPipeline(defaultDeps)

    for (let turn = 0; turn < 10; turn++) {
      const userText = `Follow-up question for turn ${turn}: please summarize the latest change.`
      const out = await runPipeline(baseCtx({
        slices: { userText, agentPrompt: stableAgent, notesFramed: stableNotes },
        meta: { turnIndex: turn, isFirstTurn: turn === 0 },
      }), pipeline)

      const t = out.tokens!
      // Per the spec: sum of (userPrompt + agentPrompt + notesFramed) equals
      // `total` within ±0 tokens (no contextSources/fleet here, so total =
      // injectedTotal + userPrompt = agent + notes + user).
      expect(t.userPrompt + t.agentPrompt + t.notesFramed).toBe(t.total)
    }
  })

  it('agent + notes slice tokens are stable turn-to-turn; only userPromptTokens varies', async () => {
    const pipeline = buildPipeline(defaultDeps)
    const stableAgentTokens: number[] = []
    const stableNotesTokens: number[] = []
    const userTokens: number[] = []

    for (let turn = 0; turn < 10; turn++) {
      const userText = `Turn ${turn} unique text — variable length ${'x'.repeat(turn * 5)}`
      const out = await runPipeline(baseCtx({
        slices: { userText, agentPrompt: stableAgent, notesFramed: stableNotes },
        meta: { turnIndex: turn, isFirstTurn: turn === 0 },
      }), pipeline)
      stableAgentTokens.push(out.tokens!.agentPrompt)
      stableNotesTokens.push(out.tokens!.notesFramed)
      userTokens.push(out.tokens!.userPrompt)
    }

    // Stable slices: every turn has the same count.
    expect(new Set(stableAgentTokens).size).toBe(1)
    expect(new Set(stableNotesTokens).size).toBe(1)
    // Variable slice: not all turns have the same count (some growth happens).
    expect(new Set(userTokens).size).toBeGreaterThan(1)
  })
})

// ── Scenario B: 600-char prompt with whitespace cruft ──────────────────────

describe('Scenario B — lint removes whitespace cruft and reports the savings', () => {
  it('emits a lint: note quantifying the trim AND reduces userPrompt tokens by ≥ 5%', async () => {
    const pipeline = buildPipeline(defaultDeps)

    // Build a prompt with lots of cruft:
    //  - trailing whitespace on every line
    //  - triple blank lines
    //  - duplicate consecutive lines
    //  - includes a fenced code block whose content must be preserved verbatim
    const fencedCode = [
      '```ts',
      'const x = 1     ',          // trailing ws INSIDE fence — preserve
      'const x = 1     ',          // dup INSIDE fence — preserve
      'function f() { return 1 }    ',
      '```',
    ].join('\n')

    const crufty = [
      'This is the start of my prompt with trailing whitespace   ',
      'duplicate line                ',
      'duplicate line                ',
      'duplicate line                ',
      '',
      '',
      '',
      '',  // 4 blank lines — lint collapses to 2
      'another sentence with cruft   ',
      'another sentence with cruft   ',
      '',
      '',
      '',
      fencedCode,
      '',
      '',
      '',
      'final paragraph trailing ws    ',
      'another final paragraph trailing ws    ',
      'yet another                   ',
    ].join('\n')
    // ~600 chars target — pad if we need more to clear the 5% bar.
    const userText = crufty + '\n' + 'tail line                                 '.repeat(3)

    // Independent pre-lint token count for the same text via the real tokenizer.
    const preLintUserTokens = tokenCounter.count(userText, 'claude-sonnet-4.5')

    // The lint middleware computes `totalSavings` against `ctx.prompt` (not
    // the slices) to decide whether to emit its note. In normal session
    // operation Work.tsx threads the assembled prompt through both the
    // ctx.prompt and slices.userText paths; mirror that here.
    const out = await runPipeline(baseCtx({
      slices: { userText },
      prompt: userText,
      cli: 'claude-cli',  // route via claude side for consistency
      model: 'claude-sonnet-4.5',
    }), pipeline)

    // ── 1. lint: note exists and quantifies the trim ─────────────────────
    const lintNote = out.notes.find((n) => n.startsWith('lint:'))
    expect(lintNote).toBeDefined()
    expect(lintNote!).toMatch(/trim|saved|chars|lines/i)

    // ── 2. Post-lint userPromptTokens ≥ 5% lower than pre-lint count ─────
    const postLintUserTokens = out.tokens!.userPrompt
    expect(preLintUserTokens).toBeGreaterThan(0)
    const reduction = (preLintUserTokens - postLintUserTokens) / preLintUserTokens
    expect(reduction).toBeGreaterThanOrEqual(0.05)

    // ── 3. Code-fence content is byte-identical pre/post-lint ────────────
    // The lint middleware doc says it never touches code fences. Find the
    // fence in both the original and the post-lint prompt and compare body.
    const fenceBodyOriginal = /```ts\n([\s\S]*?)```/.exec(userText)?.[1] ?? ''
    const fenceBodyAfter    = /```ts\n([\s\S]*?)```/.exec(out.prompt)?.[1] ?? ''
    expect(fenceBodyOriginal).toBeTruthy()
    expect(fenceBodyAfter).toBe(fenceBodyOriginal)
  })
})

// ── Scenario C — context-window approach (CompactNudge unit-level) ─────────

describe('Scenario C — 40-turn context-window approach (warning middleware coverage)', () => {
  // The 70% soft-compact nudge UI is exercised in
  //   src/renderer/src/components/work/CompactNudge.test.tsx
  // which is the appropriate layer for that component's threshold logic.
  // Here we cover the pipeline-side guarantee: at 70%+ of the context window,
  // the warning middleware DOES surface a warn: note pointing at /compact.

  it('warningMiddleware fires a context-window warn: when ctx.tokens.total ≥ 70% of contextWindowFor(model)', async () => {
    const pipeline = buildPipeline(defaultDeps)
    const cw = contextWindowFor('claude-sonnet-4.5')
    // 70% threshold: pick 75% to clear comfortably.
    const total = Math.floor(cw * 0.75)

    // Feed the prompt directly with no slices so the pipeline doesn't
    // reshape — measureMiddleware will tokenize the entire prompt as userText.
    // To get `total` at exactly the target, we'd need a real prompt — instead
    // we synthesize ctx.tokens before warningMiddleware runs by using a
    // single-middleware path.

    const ctx = baseCtx({
      cli: 'claude-cli',
      model: 'claude-sonnet-4.5',
      // We skip the full pipeline and run only routing + warning on a
      // ctx where measure has already filled tokens — the user-visible
      // assertion is "warning notes contain context-window".
      tokens: {
        userPrompt: total,
        agentPrompt: 0,
        notesFramed: 0,
        contextSources: 0,
        fleetPrefix: 0,
        injectedTotal: 0,
        total,
      },
      slices: { userText: 'placeholder' },
    })

    // Run just routing + warning (the back-of-pipeline pair). We still use
    // the full builder so a future re-ordering doesn't silently break this.
    const out = await runPipeline(ctx, pipeline.slice(-2))
    const cwNote = out.notes.find((n) => n.startsWith('warn:') && n.includes('context window'))
    expect(cwNote).toBeDefined()
  })
})

// ── Scenario D — Tokyo trivial routing ─────────────────────────────────────

describe('Scenario D — trivial prompt routes to haiku-tier, override honored', () => {
  // Use a routing-rules variant that matches the scenario's wording:
  //   trivial: 'haiku', normal: 'sonnet', hard: 'opus' — on Copilot CLI rules.
  const scenarioDRules: RoutingRules = {
    enabled: true,
    copilot: { trivial: 'haiku', normal: 'sonnet', hard: 'opus' },
    claude:  { trivial: 'haiku', normal: 'sonnet', hard: 'opus' },
  }

  const deps = {
    routing: { getRules: () => scenarioDRules },
    warning: { getPricingTable: () => FIXED_PRICING },
  }

  it('classifies "What time is it in Tokyo?" as trivial and routes to haiku', async () => {
    const pipeline = buildPipeline(deps)
    const out = await runPipeline(baseCtx({
      cli: 'copilot-cli',
      slices: { userText: 'What time is it in Tokyo?' },
      // No other slices — agentPrompt undefined.
    }), pipeline)

    expect(out.classification?.difficulty).toBe('trivial')
    expect(out.routedModel).toBe('haiku')
    expect(out.model).toBe('haiku')
    const routingNote = out.notes.find((n) => n.startsWith('routing:'))
    expect(routingNote).toBeDefined()
    expect(routingNote!).toContain('trivial')
  })

  it('honors userOverride absolutely (override wins, no automatic routing note)', async () => {
    const pipeline = buildPipeline(deps)
    const out = await runPipeline(baseCtx({
      cli: 'copilot-cli',
      slices: { userText: 'What time is it in Tokyo?' },
      userOverride: { model: 'opus' },
    }), pipeline)

    expect(out.routedModel).toBe('opus')
    expect(out.model).toBe('opus')

    // The routing middleware does emit a one-liner for overrides ("routing:
    // user override → opus"). What it MUST NOT emit is an automatic
    // routing decision (e.g., "routing: trivial (...) → haiku"). The note
    // it does emit on overrides is explicitly tagged with "user override".
    const routingNotes = out.notes.filter((n) => n.startsWith('routing:'))
    expect(routingNotes.length).toBe(1)
    expect(routingNotes[0]).toContain('user override')
    expect(routingNotes[0]).toContain('opus')
    // Critically: no auto-classification fired, so no entry mentions trivial.
    expect(routingNotes[0]).not.toContain('trivial')
  })
})

// ── Scenario F — BLOCKED (LocalModelAdapter not in session lifecycle) ─────

describe('Scenario F — prompt-cache hit on 12KB note via direct-API path', () => {
  // Phase 3's hand-off note: this scenario requires LocalModelAdapter +
  // Anthropic API to be wired into the session lifecycle so cache_control
  // injection can actually fire and the adapter response can populate
  // `cachedInputTokens`. Today the LocalModelAdapter is built but not yet
  // routed through the same session-driver path that exercises the
  // middleware pipeline + cost-record write-back. Skipping until that
  // adapter wiring lands.
  it.skip('cachedInputTokens > 0 on turns 2-5 (12KB note, 5 prompts)', () => {
    // Pending Phase 3 LocalModelAdapter integration into session lifecycle.
  })
})

// ── Scenario E — NOT IN PLAN ──────────────────────────────────────────────
// The plan jumps D → F. There is no scenario E to test. No-op block left
// intentionally absent.
