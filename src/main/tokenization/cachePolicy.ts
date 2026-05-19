/**
 * Anthropic prompt-cache policy + per-model minimum-prefix sizes.
 *
 * Two prongs to Phase 3:
 *
 * (A) **Stable-prefix discipline** for ALL CLI paths. The pipeline keeps the
 *     byte order of injected slices identical turn-to-turn so the underlying
 *     CLI's own caching engages. This benefits Copilot CLI + Claude Code CLI
 *     transparently — we never inject `cache_control` into a CLI path, we just
 *     stop accidentally invalidating their cache by reordering our injections.
 *
 * (B) **Direct `cache_control` injection** for the Anthropic-pointed direct-API
 *     paths we own (LocalModelAdapter today). Only available where ClearPath
 *     constructs the API request — for CLI passthroughs we have no API call to
 *     decorate.
 *
 * Verified against Anthropic prompt-caching docs:
 *   https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 *
 * Minimum cacheable prefix:
 *   - Sonnet 4.x / Opus 4.x (≤ 4.4) / Haiku 3.5             → 1024 tokens
 *   - Opus 4.5 / 4.6 / 4.7 + Haiku 4.5                       → 4096 tokens
 *
 * TTLs:
 *   - `ephemeral` — 5 minutes (default, no extra cost)
 *   - `1h`        — 1 hour extended TTL (costs more on the write, cheaper across longer sessions)
 *
 * Up to 4 cache_control breakpoints per request (we only use 1 today — between
 * the stable prefix and the volatile user-text suffix).
 */

export type CacheTtl = 'ephemeral' | '1h'

export interface CachePolicy {
  /** Master toggle. When false, all helpers behave as if caching were unsupported. */
  enabled: boolean
  /** Which TTL marker we pass to cache_control. */
  ttl: CacheTtl
}

export const DEFAULT_CACHE_POLICY: CachePolicy = {
  enabled: false,
  ttl: 'ephemeral',
}

/**
 * Per-model minimum prefix size (in tokens) for cache_control to take effect.
 * Models not listed default to 1024 — the conservative pre-4.5 family minimum.
 *
 * The match is substring-based (`includes`) and case-insensitive because users
 * type model strings in many forms: `opus-4.5`, `claude-opus-4-5`,
 * `claude-opus-4-5-20251001`, etc. Order matters — longer/more-specific
 * patterns first so `opus-4.7` doesn't accidentally match the `opus` fallback.
 */
const MIN_PREFIX_TOKENS_TABLE: Array<{ pattern: string; minTokens: number }> = [
  // 4096-token minimum family: Opus 4.5+ and Haiku 4.5.
  { pattern: 'opus-4.7',  minTokens: 4096 },
  { pattern: 'opus-4-7',  minTokens: 4096 },
  { pattern: 'opus-4.6',  minTokens: 4096 },
  { pattern: 'opus-4-6',  minTokens: 4096 },
  { pattern: 'opus-4.5',  minTokens: 4096 },
  { pattern: 'opus-4-5',  minTokens: 4096 },
  { pattern: 'haiku-4.5', minTokens: 4096 },
  { pattern: 'haiku-4-5', minTokens: 4096 },
]

/** Default minimum for any Anthropic model not listed above. */
const DEFAULT_MIN_PREFIX_TOKENS = 1024

/**
 * Minimum cacheable prefix size (in tokens) for the given model. Always
 * returns a number — for non-Anthropic models the value is meaningless but
 * still safe to compare against (the caller is expected to check
 * `isAnthropicModel` first).
 */
export function minPrefixTokensFor(model: string): number {
  const m = model.toLowerCase()
  for (const entry of MIN_PREFIX_TOKENS_TABLE) {
    if (m.includes(entry.pattern)) return entry.minTokens
  }
  return DEFAULT_MIN_PREFIX_TOKENS
}

/**
 * True iff `model` belongs to the Anthropic family (claude-* / sonnet / opus /
 * haiku). Mirrors the routing in TokenCounter so the two stay in sync.
 *
 * NOTE: kept as a separate helper instead of importing TokenCounter's internal
 * `familyFor` so we don't widen TokenCounter's public surface area just for
 * this check.
 */
export function isAnthropicModel(model: string): boolean {
  const m = model.toLowerCase()
  return (
    m.startsWith('claude') ||
    m === 'sonnet' || m === 'opus' || m === 'haiku' ||
    m.includes('-sonnet') || m.includes('-opus') || m.includes('-haiku')
  )
}

/**
 * True iff a stable prefix of `prefixTokens` is large enough to benefit from
 * cache_control on `model`, given `policy`. Caller is expected to have already
 * verified the model is Anthropic and the request is going through a direct-API
 * path we own — this helper just enforces the size threshold.
 */
export function shouldCachePrefix(
  prefixTokens: number,
  model: string,
  policy: CachePolicy,
): boolean {
  if (!policy.enabled) return false
  if (prefixTokens <= 0) return false
  return prefixTokens >= minPrefixTokensFor(model)
}
