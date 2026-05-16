import { describe, it, expect, vi } from 'vitest'
import { normalizeMiddleware } from './normalizeMiddleware'
import type { MiddlewareContext } from './pipeline'

vi.mock('../../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

function ctx(prompt: string, slices?: MiddlewareContext['slices']): MiddlewareContext {
  return {
    sessionId: 's',
    cli: 'copilot-cli',
    model: 'gpt-5-mini',
    prompt,
    slices,
    meta: { turnIndex: 0, isFirstTurn: true },
    notes: [],
  }
}

describe('normalizeMiddleware', () => {
  // ── Line-ending normalization ────────────────────────────────────────────

  it('converts CRLF to LF (mixed with bare LF in the same prompt)', async () => {
    const input = 'line1\r\nline2\nline3\r\nline4'
    const result = await normalizeMiddleware(ctx(input))
    expect(result.prompt).toBe('line1\nline2\nline3\nline4')
    // No stray \r anywhere.
    expect(result.prompt).not.toContain('\r')
  })

  it('converts lone CR (old-Mac line endings) to LF', async () => {
    const input = 'line1\rline2\rline3'
    const result = await normalizeMiddleware(ctx(input))
    expect(result.prompt).toBe('line1\nline2\nline3')
    expect(result.prompt).not.toContain('\r')
  })

  // ── BOM handling ─────────────────────────────────────────────────────────

  it('strips a leading UTF-8 BOM (0xFEFF) at the start of the prompt', async () => {
    const input = '﻿hello world'
    const result = await normalizeMiddleware(ctx(input))
    expect(result.prompt).toBe('hello world')
    expect(result.prompt.charCodeAt(0)).toBe('h'.charCodeAt(0))
  })

  it('reduces a BOM-only prompt to the empty string', async () => {
    const result = await normalizeMiddleware(ctx('﻿'))
    expect(result.prompt).toBe('')
  })

  it('only strips the leading BOM — embedded BOMs mid-string are preserved', async () => {
    // The middleware doc says "strip BOM at the very start of the string".
    // A BOM in the middle of the text should remain (rare, but we shouldn't
    // silently mutate content).
    const input = 'hello﻿world'
    const result = await normalizeMiddleware(ctx(input))
    expect(result.prompt).toBe('hello﻿world')
  })

  // ── No-op / pass-through cases ───────────────────────────────────────────

  it('returns an already-normalized prompt unchanged (no spurious mutations)', async () => {
    const input = 'line1\nline2\nline3'
    const result = await normalizeMiddleware(ctx(input))
    expect(result.prompt).toBe(input)
  })

  it('short-circuits to the SAME ctx reference when nothing changed and no slices', async () => {
    const input = ctx('already-clean')
    const result = await normalizeMiddleware(input)
    // The middleware's first branch returns `ctx` unmodified — same identity.
    expect(result).toBe(input)
  })

  it('returns a NEW ctx (does not mutate the input ctx) when changes occurred', async () => {
    const input = ctx('foo\r\nbar')
    const result = await normalizeMiddleware(input)
    expect(result).not.toBe(input)
    expect(input.prompt).toBe('foo\r\nbar')  // input untouched
    expect(result.prompt).toBe('foo\nbar')
  })

  // ── Slice synchronization ────────────────────────────────────────────────

  it('keeps ctx.slices.userText in sync with ctx.prompt when both have CRLF', async () => {
    const result = await normalizeMiddleware(ctx('line1\r\nline2', {
      userText: 'line1\r\nline2',
    }))
    expect(result.prompt).toBe('line1\nline2')
    expect(result.slices?.userText).toBe('line1\nline2')
  })

  it('normalizes each slice (agentPrompt, notesFramed, contextSources, fleetPrefix) when present', async () => {
    const result = await normalizeMiddleware(ctx('hi', {
      userText: 'user\r\ntext',
      agentPrompt: 'agent\r\nprompt',
      notesFramed: 'notes\rblock',
      contextSources: 'sources\r\nblob',
      fleetPrefix: 'fleet\r\nprefix',
    }))
    expect(result.slices?.userText).toBe('user\ntext')
    expect(result.slices?.agentPrompt).toBe('agent\nprompt')
    expect(result.slices?.notesFramed).toBe('notes\nblock')
    expect(result.slices?.contextSources).toBe('sources\nblob')
    expect(result.slices?.fleetPrefix).toBe('fleet\nprefix')
  })

  it('strips BOM from individual slices when present', async () => {
    const result = await normalizeMiddleware(ctx('﻿hi', {
      userText: '﻿user',
      agentPrompt: '﻿agent',
      notesFramed: '﻿notes',
    }))
    expect(result.prompt).toBe('hi')
    expect(result.slices?.userText).toBe('user')
    expect(result.slices?.agentPrompt).toBe('agent')
    expect(result.slices?.notesFramed).toBe('notes')
  })

  it('does not invent slice fields that were undefined on input', async () => {
    const result = await normalizeMiddleware(ctx('hi', {
      userText: 'user',
      // agentPrompt, notesFramed, contextSources, fleetPrefix all absent.
    }))
    expect(result.slices?.userText).toBe('user')
    expect(result.slices?.agentPrompt).toBeUndefined()
    expect(result.slices?.notesFramed).toBeUndefined()
    expect(result.slices?.contextSources).toBeUndefined()
    expect(result.slices?.fleetPrefix).toBeUndefined()
  })

  it('rewrites slices even when ctx.prompt is already clean (slice-only path)', async () => {
    // The middleware's short-circuit guard only fires when both the prompt
    // is unchanged AND ctx.slices is undefined. Slices present means we still
    // walk through and normalize them, so per-slice tokenization downstream
    // never sees mixed line endings.
    const result = await normalizeMiddleware(ctx('clean', {
      userText: 'also-clean',
      agentPrompt: 'crlf\r\nhere',
    }))
    expect(result.slices?.agentPrompt).toBe('crlf\nhere')
  })

  // ── Side-channel cleanliness ─────────────────────────────────────────────

  it('does not push anything into ctx.notes (silent middleware unless something is fishy)', async () => {
    const result = await normalizeMiddleware(ctx('line1\r\nline2', {
      userText: 'user\r\ntext',
      agentPrompt: 'agent\r\nprompt',
    }))
    expect(result.notes).toEqual([])
  })

  it('preserves pre-existing notes from earlier middlewares', async () => {
    const input = ctx('foo\r\nbar')
    input.notes = ['lint: trimmed 5 chars']
    const result = await normalizeMiddleware(input)
    expect(result.notes).toEqual(['lint: trimmed 5 chars'])
  })

  // ── Sync / Promise behavior ──────────────────────────────────────────────

  it('returns the ctx synchronously (not a Promise) — sync middleware', () => {
    // The pipeline runner awaits regardless, but the function itself is sync.
    // We assert this directly so a future refactor that introduces unnecessary
    // async overhead is caught.
    const result = normalizeMiddleware(ctx('hello'))
    // A non-promise sync return is an object, not a thenable.
    expect(typeof (result as unknown as { then?: unknown }).then).not.toBe('function')
  })

  it('preserves the rest of the ctx (sessionId, cli, model, meta) when normalizing', async () => {
    const input = ctx('line\r\nbreak')
    input.sessionId = 'sess-42'
    input.cli = 'claude-cli'
    input.model = 'sonnet'
    input.meta = { turnIndex: 5, isFirstTurn: false }
    const result = await normalizeMiddleware(input)
    expect(result.sessionId).toBe('sess-42')
    expect(result.cli).toBe('claude-cli')
    expect(result.model).toBe('sonnet')
    expect(result.meta).toEqual({ turnIndex: 5, isFirstTurn: false })
  })
})
