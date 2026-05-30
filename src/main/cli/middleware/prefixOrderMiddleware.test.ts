import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import type { MiddlewareContext } from './pipeline'
import type { PromptSlices } from '../../../shared/tokenization/types'

function ctx(over: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    sessionId: 's',
    cli: 'copilot-cli',
    model: 'gpt-5-mini',
    prompt: '',
    slices: { userText: '' },
    meta: { turnIndex: 0, isFirstTurn: true },
    notes: [],
    ...over,
  }
}

describe('prefixOrderMiddleware', () => {
  let prefixOrderMiddleware: typeof import('./prefixOrderMiddleware').prefixOrderMiddleware
  let assembleFromSlices: typeof import('./prefixOrderMiddleware').__test_assembleFromSlices

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('./prefixOrderMiddleware')
    prefixOrderMiddleware = mod.prefixOrderMiddleware
    assembleFromSlices = mod.__test_assembleFromSlices
  })

  // ── canonical order ──────────────────────────────────────────────────────

  describe('canonical ordering', () => {
    it('assembles slices in the canonical order: fleet → agent → notes → sources → userText', async () => {
      const slices: PromptSlices = {
        fleetPrefix: 'FLEET',
        agentPrompt: 'AGENT',
        notesFramed: 'NOTES',
        contextSources: 'SOURCES',
        userText: 'USER',
      }
      const result = await prefixOrderMiddleware(ctx({ slices, prompt: 'whatever-the-renderer-sent' }))

      // The order in the assembled string must be fleet → agent → notes → sources → user.
      const expected = 'FLEET\n\nAGENT\n\nNOTES\n\nSOURCES\n\nUSER'
      expect(result.prompt).toBe(expected)
      expect(result.prompt.indexOf('FLEET')).toBeLessThan(result.prompt.indexOf('AGENT'))
      expect(result.prompt.indexOf('AGENT')).toBeLessThan(result.prompt.indexOf('NOTES'))
      expect(result.prompt.indexOf('NOTES')).toBeLessThan(result.prompt.indexOf('SOURCES'))
      expect(result.prompt.indexOf('SOURCES')).toBeLessThan(result.prompt.indexOf('USER'))
    })

    it('includes filesFramed after notes and before sources — and never drops it', async () => {
      // Regression: the file-attachment block lives in the filesFramed slice.
      // An earlier version omitted it from the assembly order, so the reassembled
      // prompt silently dropped the file reference and the agent never saw it.
      const slices: PromptSlices = {
        agentPrompt: 'AGENT',
        notesFramed: 'NOTES',
        filesFramed: 'FILES',
        contextSources: 'SOURCES',
        userText: 'USER',
      }
      const result = await prefixOrderMiddleware(ctx({ slices, prompt: 'renderer-sent' }))
      expect(result.prompt).toBe('AGENT\n\nNOTES\n\nFILES\n\nSOURCES\n\nUSER')
      // The whole point: the file block must reach the assembled prompt.
      expect(result.prompt).toContain('FILES')
      expect(result.prompt.indexOf('NOTES')).toBeLessThan(result.prompt.indexOf('FILES'))
      expect(result.prompt.indexOf('FILES')).toBeLessThan(result.prompt.indexOf('SOURCES'))
    })

    it('assembles a files-only injection (the launchpad attach case)', async () => {
      // The exact shape onQuickStart sends: just userText + filesFramed.
      const slices: PromptSlices = { userText: 'describe this file', filesFramed: '<files>...</files>' }
      const result = await prefixOrderMiddleware(ctx({ slices, prompt: 'whatever' }))
      expect(result.prompt).toBe('<files>...</files>\n\ndescribe this file')
    })

    it('produces byte-identical output regardless of source field order in the slices object', async () => {
      // Different object construction orders — JS object key iteration order
      // would let a naive impl reshuffle these. The middleware must NOT care.
      const a: PromptSlices = {
        userText: 'U',
        agentPrompt: 'A',
        notesFramed: 'N',
      }
      const b: PromptSlices = {
        agentPrompt: 'A',
        notesFramed: 'N',
        userText: 'U',
      }
      const c: PromptSlices = {
        notesFramed: 'N',
        userText: 'U',
        agentPrompt: 'A',
      }

      const ra = await prefixOrderMiddleware(ctx({ slices: a }))
      const rb = await prefixOrderMiddleware(ctx({ slices: b }))
      const rc = await prefixOrderMiddleware(ctx({ slices: c }))

      expect(ra.prompt).toBe(rb.prompt)
      expect(rb.prompt).toBe(rc.prompt)
      expect(ra.prompt).toBe('A\n\nN\n\nU')
    })
  })

  // ── missing slices ───────────────────────────────────────────────────────

  describe('missing/empty slices', () => {
    it('skips undefined slices without inserting blank lines', async () => {
      const slices: PromptSlices = {
        userText: 'U',
        agentPrompt: 'A',
        // notesFramed, contextSources, fleetPrefix omitted
      }
      const result = await prefixOrderMiddleware(ctx({ slices }))
      expect(result.prompt).toBe('A\n\nU')
      // No three+ consecutive newlines anywhere.
      expect(/\n\n\n/.test(result.prompt)).toBe(false)
    })

    it('skips empty-string slices the same way as undefined ones', async () => {
      const slices: PromptSlices = {
        userText: 'U',
        agentPrompt: 'A',
        notesFramed: '',
        contextSources: '',
        fleetPrefix: '',
      }
      const result = await prefixOrderMiddleware(ctx({ slices }))
      expect(result.prompt).toBe('A\n\nU')
    })

    it('handles userText-only — no separator before, no prefix', async () => {
      const slices: PromptSlices = { userText: 'only-user' }
      const result = await prefixOrderMiddleware(ctx({ slices }))
      expect(result.prompt).toBe('only-user')
    })

    it('handles prefix-only (no userText)', async () => {
      const slices: PromptSlices = {
        userText: '',
        agentPrompt: 'AGENT',
      }
      const result = await prefixOrderMiddleware(ctx({ slices }))
      expect(result.prompt).toBe('AGENT')
    })

    it('handles fully empty slices object', async () => {
      const slices: PromptSlices = { userText: '' }
      const result = await prefixOrderMiddleware(ctx({ slices }))
      expect(result.prompt).toBe('')
    })
  })

  // ── slice text mutation guarantees ──────────────────────────────────────

  describe('slice immutability', () => {
    it('never mutates slice text — only reorders and concatenates', async () => {
      const slices: PromptSlices = {
        userText: 'user with    spaces and\ttab',
        agentPrompt: '  agent leading whitespace  ',
        notesFramed: 'notes\nwith\nlines',
      }
      const result = await prefixOrderMiddleware(ctx({ slices }))

      // The assembled prompt must contain each slice byte-for-byte.
      expect(result.prompt).toContain('user with    spaces and\ttab')
      expect(result.prompt).toContain('  agent leading whitespace  ')
      expect(result.prompt).toContain('notes\nwith\nlines')
    })

    it('preserves ctx.slices on the returned ctx unchanged', async () => {
      const slices: PromptSlices = {
        userText: 'U',
        agentPrompt: 'A',
      }
      const result = await prefixOrderMiddleware(ctx({ slices }))
      // Same object identity — we only mutate ctx.prompt, not ctx.slices.
      expect(result.slices).toBe(slices)
    })
  })

  // ── cacheBreakpoint ──────────────────────────────────────────────────────

  describe('cacheBreakpoint', () => {
    it('points at the byte offset where userText begins', async () => {
      const slices: PromptSlices = {
        userText: 'USER',
        agentPrompt: 'AGENT',
      }
      const result = await prefixOrderMiddleware(ctx({ slices }))
      // Prompt is 'AGENT\n\nUSER' — userText starts at byte 7 (after 'AGENT' + 2x '\n').
      expect(result.cacheBreakpoint).toBe('AGENT'.length + '\n\n'.length)
      expect(result.prompt.slice(result.cacheBreakpoint!)).toBe('USER')
    })

    it('is 0 when there is no stable prefix (userText only)', async () => {
      const slices: PromptSlices = { userText: 'just-user' }
      const result = await prefixOrderMiddleware(ctx({ slices }))
      expect(result.cacheBreakpoint).toBe(0)
    })

    it('equals prefix length when there is no userText', async () => {
      const slices: PromptSlices = { userText: '', agentPrompt: 'AGENT' }
      const result = await prefixOrderMiddleware(ctx({ slices }))
      expect(result.cacheBreakpoint).toBe('AGENT'.length)
    })

    it('is undefined when slices are absent', async () => {
      const c = ctx({ slices: undefined, prompt: 'raw' })
      const result = await prefixOrderMiddleware(c)
      expect(result.cacheBreakpoint).toBeUndefined()
    })
  })

  // ── no slices: pass-through ──────────────────────────────────────────────

  describe('no slices', () => {
    it('returns ctx unchanged when ctx.slices is undefined', async () => {
      const c = ctx({ slices: undefined, prompt: 'whatever' })
      const result = await prefixOrderMiddleware(c)
      // We don't try to reassemble — leave the prompt as-is.
      expect(result.prompt).toBe('whatever')
      expect(result).toBe(c) // same ctx reference
    })
  })

  // ── deterministic re-assembly ────────────────────────────────────────────

  describe('determinism', () => {
    it('produces byte-identical output across repeated calls with the same input', async () => {
      const slices: PromptSlices = {
        userText: 'U',
        agentPrompt: 'A',
        notesFramed: 'N',
        contextSources: 'S',
        fleetPrefix: 'F',
      }
      const outputs = new Set<string>()
      for (let i = 0; i < 5; i++) {
        const result = await prefixOrderMiddleware(ctx({ slices: { ...slices } }))
        outputs.add(result.prompt)
      }
      expect(outputs.size).toBe(1)
    })
  })

  // ── pure helper test ─────────────────────────────────────────────────────

  describe('assembleFromSlices (pure)', () => {
    it('returns { prompt, userTextByteOffset } correctly for a typical 4-slice prompt', () => {
      const { prompt, userTextByteOffset } = assembleFromSlices({
        userText: 'U',
        agentPrompt: 'A',
        notesFramed: 'N',
      })
      expect(prompt).toBe('A\n\nN\n\nU')
      // 'A\n\nN' is 4 bytes (A + \n + \n + N), plus '\n\n' separator before U = 6.
      expect(userTextByteOffset).toBe(6)
      expect(prompt.slice(userTextByteOffset)).toBe('U')
    })
  })
})
