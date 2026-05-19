import { describe, it, expect, vi } from 'vitest'
import { TokenCounter, loadDefaultDeps, type TokenizerDeps } from './TokenCounter'

vi.mock('../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

/** Build a deps object with mocks (defaults to working tokenizers if not overridden). */
function makeDeps(overrides: Partial<TokenizerDeps> = {}): TokenizerDeps {
  return {
    anthropicCount: vi.fn().mockReturnValue(42),
    openaiEncoder: { encode: vi.fn().mockReturnValue(new Int32Array([1, 2, 3, 4, 5, 6, 7])) },
    ...overrides,
  }
}

describe('TokenCounter', () => {
  it('routes Anthropic models to @anthropic-ai/tokenizer', () => {
    const anthropicCount = vi.fn().mockReturnValue(42)
    const tc = new TokenCounter(makeDeps({ anthropicCount }))

    expect(tc.count('hello world', 'claude-sonnet-4.5')).toBe(42)
    expect(tc.count('different text', 'sonnet')).toBe(42)
    expect(tc.count('more text here', 'claude-opus-4.6')).toBe(42)
    expect(anthropicCount).toHaveBeenCalledTimes(3)
  })

  it('routes OpenAI/Copilot models to tiktoken', () => {
    const anthropicCount = vi.fn().mockReturnValue(999)
    const tiktokenEncode = vi.fn().mockReturnValue(new Int32Array([1, 2, 3, 4, 5, 6, 7]))
    const tc = new TokenCounter({ anthropicCount, openaiEncoder: { encode: tiktokenEncode } })

    expect(tc.count('hello world', 'gpt-5-mini')).toBe(7)
    expect(tc.count('different', 'gpt-4o')).toBe(7)
    expect(tc.count('codex prompt', 'gpt-5.1-codex')).toBe(7)
    expect(anthropicCount).not.toHaveBeenCalled()
    expect(tiktokenEncode).toHaveBeenCalledTimes(3)
  })

  it('falls back to heuristic (length/4) for unknown models', () => {
    const anthropicCount = vi.fn().mockReturnValue(99)
    const tc = new TokenCounter(makeDeps({ anthropicCount }))

    // 16 chars / 4 = 4
    expect(tc.count('hello world abcd', 'gemini-3-pro')).toBe(4)
    // 8 chars / 4 = 2
    expect(tc.count('abcdefgh', 'unknown')).toBe(2)
    // Real tokenizers shouldn't be invoked for unknown family.
    expect(anthropicCount).not.toHaveBeenCalled()
  })

  it('returns 0 for empty text regardless of model', () => {
    const tc = new TokenCounter(makeDeps())
    expect(tc.count('', 'claude-sonnet-4.5')).toBe(0)
    expect(tc.count('', 'gpt-5')).toBe(0)
    expect(tc.count('', 'unknown')).toBe(0)
  })

  it('caches repeated calls with the same text + family', () => {
    const anthropicCount = vi.fn().mockReturnValue(7)
    const tc = new TokenCounter({ anthropicCount, openaiEncoder: null })

    expect(tc.count('hello cache test', 'sonnet')).toBe(7)
    expect(tc.count('hello cache test', 'sonnet')).toBe(7)
    expect(tc.count('hello cache test', 'claude-opus-4.5')).toBe(7) // same family
    // Only one underlying call (cache hits the rest)
    expect(anthropicCount).toHaveBeenCalledTimes(1)
  })

  it('keeps separate cache slots for different families with same text', () => {
    const anthropicCount = vi.fn().mockReturnValue(11)
    const tiktokenEncode = vi.fn().mockReturnValue(new Int32Array([1, 2]))
    const tc = new TokenCounter({ anthropicCount, openaiEncoder: { encode: tiktokenEncode } })

    expect(tc.count('same text', 'sonnet')).toBe(11)
    expect(tc.count('same text', 'gpt-5-mini')).toBe(2)
    expect(anthropicCount).toHaveBeenCalledTimes(1)
    expect(tiktokenEncode).toHaveBeenCalledTimes(1)
  })

  it('falls back to heuristic when Anthropic tokenizer throws', () => {
    const tc = new TokenCounter({
      anthropicCount: () => { throw new Error('tokenizer broken') },
      openaiEncoder: null,
    })
    // 12 chars / 4 = 3
    expect(tc.count('abcdefghijkl', 'claude-sonnet-4.5')).toBe(3)
  })

  it('falls back to heuristic when tiktoken encoder throws', () => {
    const tc = new TokenCounter({
      anthropicCount: null,
      openaiEncoder: { encode: () => { throw new Error('wasm exploded') } },
    })
    // 8 chars / 4 = 2
    expect(tc.count('abcdefgh', 'gpt-5')).toBe(2)
  })

  it('falls back to heuristic when both deps are null (init failure case)', () => {
    const tc = new TokenCounter({ anthropicCount: null, openaiEncoder: null })

    // length/4 fallback for every family
    expect(tc.count('hello world test', 'sonnet')).toBe(4)
    expect(tc.count('hello world test', 'gpt-5-mini')).toBe(4)
    expect(tc.count('hello world test', 'unknown')).toBe(4)
  })

  it('exposes a process-wide singleton', async () => {
    const mod = await import('./TokenCounter')
    expect(mod.tokenCounter).toBeDefined()
    expect(typeof mod.tokenCounter.count).toBe('function')
    // The singleton lazily loads its deps from the real packages — exercise it.
    const tokens = mod.tokenCounter.count('hello world', 'sonnet')
    expect(tokens).toBeGreaterThan(0)
  })

  it('caps the LRU cache at its max', () => {
    const tc = new TokenCounter({
      anthropicCount: (s: string) => s.length,
      openaiEncoder: null,
    })

    // Push more than CACHE_MAX (500) distinct entries — cache should plateau.
    for (let i = 0; i < 600; i++) {
      tc.count(`text-${i}`, 'sonnet')
    }
    expect(tc.__cacheSize()).toBeLessThanOrEqual(500)
  })

  it('loadDefaultDeps loads real packages without throwing', () => {
    const deps = loadDefaultDeps()
    // At least one tokenizer should load successfully in a normal install.
    expect(deps.anthropicCount !== null || deps.openaiEncoder !== null).toBe(true)
  })

  it('singleton produces non-trivial token counts that match approximate expectations', async () => {
    const { tokenCounter } = await import('./TokenCounter')
    // Real Anthropic tokens for "hello world" should be a small positive int.
    const anthTokens = tokenCounter.count('hello world this is a longer sentence', 'sonnet')
    expect(anthTokens).toBeGreaterThan(0)
    expect(anthTokens).toBeLessThan(100)

    // Real tiktoken tokens for the same phrase.
    const oaiTokens = tokenCounter.count('hello world this is a longer sentence', 'gpt-5-mini')
    expect(oaiTokens).toBeGreaterThan(0)
    expect(oaiTokens).toBeLessThan(100)
  })
})
