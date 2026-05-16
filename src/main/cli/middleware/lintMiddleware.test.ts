import { describe, it, expect, vi } from 'vitest'
import { lintMiddleware, __test_lintText } from './lintMiddleware'
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

describe('lintMiddleware', () => {
  it('trims trailing whitespace per line', async () => {
    const result = await lintMiddleware(ctx('hello   \nworld\t\nthird '))
    expect(result.prompt).toBe('hello\nworld\nthird')
  })

  it('collapses runs of 3+ blank lines down to at most 2', async () => {
    const input = 'a\n\n\n\n\nb'  // 4 blank lines between (5 newlines)
    const result = await lintMiddleware(ctx(input))
    // Implementation caps blankRun at 2 — so at most 2 blank LINES between
    // content lines = at most 3 consecutive newlines.
    expect(/\n\n\n\n+/.test(result.prompt)).toBe(false)
    // The 4 blank lines should now be collapsed to 2.
    expect(result.prompt).toBe('a\n\n\nb')
  })

  it('dedupes immediately-consecutive identical non-empty lines', async () => {
    const input = 'log\nlog\nlog\nother\nother'
    const result = await lintMiddleware(ctx(input))
    expect(result.prompt).toBe('log\nother')
  })

  it('does NOT modify content inside fenced code blocks', async () => {
    const input = [
      'before  ',           // trailing ws should trim
      '```ts',
      'const x = 1     ',   // INSIDE fence — must be preserved
      'const x = 1     ',   // dup INSIDE fence — must be preserved
      '```',
      'after  ',
    ].join('\n')
    const result = await lintMiddleware(ctx(input))
    const lines = result.prompt.split('\n')
    // Inside-fence lines preserved verbatim (incl. trailing ws + dup).
    expect(lines[2]).toBe('const x = 1     ')
    expect(lines[3]).toBe('const x = 1     ')
    // Outside-fence lines trimmed.
    expect(lines[0]).toBe('before')
    expect(lines[5]).toBe('after')
  })

  it('records lint savings in notes when changes were made', async () => {
    const result = await lintMiddleware(ctx('a   \nb   \nc   '))
    expect(result.notes.some((n) => n.startsWith('lint: trimmed'))).toBe(true)
  })

  it('does not record a note when nothing changed', async () => {
    const result = await lintMiddleware(ctx('clean'))
    expect(result.notes).toEqual([])
  })

  it('applies lint to each non-fleet slice when slices are present', async () => {
    const result = await lintMiddleware(ctx('hello   ', {
      userText: 'hello   ',
      agentPrompt: 'You are a coach.   \nsecond line.   ',
      notesFramed: 'note    ',
      contextSources: 'src    ',
    }))
    expect(result.slices?.userText).toBe('hello')
    expect(result.slices?.agentPrompt).toBe('You are a coach.\nsecond line.')
    expect(result.slices?.notesFramed).toBe('note')
    expect(result.slices?.contextSources).toBe('src')
  })

  it('handles unbalanced/unclosed fences without crashing', async () => {
    const input = '```ts\nopen but never closed\n   trailing-ws-inside-fence    '
    const result = await lintMiddleware(ctx(input))
    // Still inside fence — preserve trailing whitespace.
    expect(result.prompt.endsWith('inside-fence    ')).toBe(true)
  })

  it('lint helper reports trimmed char count', () => {
    const { trimmedChars } = __test_lintText('a   \nb   \nc')
    expect(trimmedChars).toBe(6)
  })
})
