import { log } from '../utils/logger'

/**
 * Token-counter routing table:
 *   - Anthropic models (claude-*, sonnet, opus, haiku) → @anthropic-ai/tokenizer
 *   - OpenAI / Copilot models (gpt-*, codex-*, o1, o3) → tiktoken
 *   - Anything else (Gemini, unknown) → 4-chars-per-token heuristic
 *
 * The two real tokenizers add native / wasm overhead, so we LRU-cache by
 * (model-family + string) to avoid re-tokenizing the same blob inside a single
 * turn — Phase 2's measure middleware will hit the same cache when it shapes
 * each prompt, and the cost record on turn-end hits it again on output.
 *
 * Tokenizer init is wrapped in try/catch and falls back to the heuristic with
 * a one-time warning log. A bad dependency must never break a session.
 */

type ModelFamily = 'anthropic' | 'openai' | 'unknown'

const CACHE_MAX = 500

class LRUCache<K, V> {
  private readonly map = new Map<K, V>()
  constructor(private readonly max: number) {}
  get(key: K): V | undefined {
    const v = this.map.get(key)
    if (v === undefined) return undefined
    // Re-insert to move to "most recent" position.
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }
  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }
  clear(): void { this.map.clear() }
  get size(): number { return this.map.size }
}

function familyFor(model: string): ModelFamily {
  const m = model.toLowerCase()
  if (
    m.startsWith('claude') ||
    m === 'sonnet' || m === 'opus' || m === 'haiku' ||
    m.includes('-sonnet') || m.includes('-opus') || m.includes('-haiku')
  ) return 'anthropic'
  if (
    m.startsWith('gpt-') ||
    m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') ||
    m.includes('codex') ||
    m === 'text-davinci' || m === 'davinci'
  ) return 'openai'
  return 'unknown'
}

/** Heuristic fallback used when no tokenizer is available for the family. */
function heuristic(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface TokenizerDeps {
  /** @anthropic-ai/tokenizer countTokens. Null means dep failed to load. */
  anthropicCount: ((text: string) => number) | null
  /** tiktoken encoder. Null means dep failed to load. */
  openaiEncoder: { encode: (text: string) => Int32Array | number[] } | null
}

/** Lazily load both tokenizer deps with try/catch isolation per package. */
export function loadDefaultDeps(): TokenizerDeps {
  let anthropicCount: ((text: string) => number) | null = null
  let openaiEncoder: { encode: (text: string) => Int32Array | number[] } | null = null

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const at = require('@anthropic-ai/tokenizer') as { countTokens?: (s: string) => number }
    if (typeof at?.countTokens === 'function') {
      anthropicCount = at.countTokens.bind(at)
    } else {
      log.warn('[TokenCounter] @anthropic-ai/tokenizer loaded but countTokens missing — falling back to heuristic')
    }
  } catch (err) {
    log.warn('[TokenCounter] @anthropic-ai/tokenizer init failed: %s', err)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tk = require('tiktoken') as { get_encoding?: (n: string) => unknown }
    const enc = tk.get_encoding?.('o200k_base') as
      | { encode: (s: string) => Int32Array | number[] }
      | undefined
    if (enc && typeof enc.encode === 'function') {
      openaiEncoder = enc
    } else {
      log.warn('[TokenCounter] tiktoken loaded but o200k_base encoding unavailable — falling back to heuristic')
    }
  } catch (err) {
    log.warn('[TokenCounter] tiktoken init failed: %s', err)
  }

  return { anthropicCount, openaiEncoder }
}

export class TokenCounter {
  private readonly cache = new LRUCache<string, number>(CACHE_MAX)
  private deps: TokenizerDeps | null
  private warnedFallback = new Set<ModelFamily>()

  /**
   * @param deps  Tokenizer deps. When `undefined`, lazy-loaded on first count().
   *              Pass `null` to force heuristic-only mode (used in tests).
   */
  constructor(deps?: TokenizerDeps | null) {
    this.deps = deps === undefined ? null : deps
    // `null` means "force heuristic mode"; `undefined` means lazy init.
    this.lazyInitNeeded = deps === undefined
  }

  private lazyInitNeeded: boolean

  private ensureInit(): void {
    if (!this.lazyInitNeeded) return
    this.lazyInitNeeded = false
    this.deps = loadDefaultDeps()
  }

  /**
   * Count tokens in `text` using the tokenizer that matches `model`'s family.
   * Falls back to the 4-char heuristic on any failure path.
   */
  count(text: string, model: string): number {
    if (!text) return 0
    this.ensureInit()
    const family = familyFor(model)
    const cacheKey = `${family}|${text}`
    const cached = this.cache.get(cacheKey)
    if (cached !== undefined) return cached

    let tokens: number
    try {
      if (family === 'anthropic' && this.deps?.anthropicCount) {
        tokens = this.deps.anthropicCount(text)
      } else if (family === 'openai' && this.deps?.openaiEncoder) {
        tokens = this.deps.openaiEncoder.encode(text).length
      } else {
        if (family !== 'unknown' && !this.warnedFallback.has(family)) {
          this.warnedFallback.add(family)
          log.warn(`[TokenCounter] no tokenizer available for family=${family}, using heuristic`)
        }
        tokens = heuristic(text)
      }
    } catch (err) {
      if (!this.warnedFallback.has(family)) {
        this.warnedFallback.add(family)
        log.warn(`[TokenCounter] tokenizer threw for family=${family}: %s — falling back to heuristic`, err)
      }
      tokens = heuristic(text)
    }

    this.cache.set(cacheKey, tokens)
    return tokens
  }

  /** Test-only: drop the cache between cases. */
  __clearCache(): void {
    this.cache.clear()
  }

  /** Test-only: inspect cache size. */
  __cacheSize(): number {
    return this.cache.size
  }
}

/** Process-wide singleton — every callsite shares one cache. */
export const tokenCounter = new TokenCounter()
