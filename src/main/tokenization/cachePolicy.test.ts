import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CACHE_POLICY,
  isAnthropicModel,
  minPrefixTokensFor,
  shouldCachePrefix,
  type CachePolicy,
} from './cachePolicy'

describe('cachePolicy', () => {
  // ── DEFAULT_CACHE_POLICY ────────────────────────────────────────────────

  describe('DEFAULT_CACHE_POLICY', () => {
    it('is disabled by default (safety: opt-in only)', () => {
      expect(DEFAULT_CACHE_POLICY.enabled).toBe(false)
    })

    it('uses the ephemeral TTL by default', () => {
      expect(DEFAULT_CACHE_POLICY.ttl).toBe('ephemeral')
    })
  })

  // ── isAnthropicModel ────────────────────────────────────────────────────

  describe('isAnthropicModel', () => {
    it('matches the bare family aliases', () => {
      expect(isAnthropicModel('sonnet')).toBe(true)
      expect(isAnthropicModel('opus')).toBe(true)
      expect(isAnthropicModel('haiku')).toBe(true)
    })

    it('matches claude-* prefixed model ids', () => {
      expect(isAnthropicModel('claude-3-5-sonnet')).toBe(true)
      expect(isAnthropicModel('claude-sonnet-4-5')).toBe(true)
      expect(isAnthropicModel('claude-opus-4-7-20251001')).toBe(true)
    })

    it('matches dasherized family suffixes', () => {
      expect(isAnthropicModel('foo-sonnet')).toBe(true)
      expect(isAnthropicModel('foo-opus')).toBe(true)
      expect(isAnthropicModel('foo-haiku')).toBe(true)
    })

    it('is case-insensitive', () => {
      expect(isAnthropicModel('Sonnet')).toBe(true)
      expect(isAnthropicModel('CLAUDE-OPUS-4-5')).toBe(true)
    })

    it('rejects OpenAI / Copilot / Codex models', () => {
      expect(isAnthropicModel('gpt-5-mini')).toBe(false)
      expect(isAnthropicModel('gpt-4')).toBe(false)
      expect(isAnthropicModel('codex')).toBe(false)
      expect(isAnthropicModel('o1-preview')).toBe(false)
    })

    it('rejects unknown / local models', () => {
      expect(isAnthropicModel('llama3')).toBe(false)
      expect(isAnthropicModel('mistral')).toBe(false)
      expect(isAnthropicModel('')).toBe(false)
    })
  })

  // ── minPrefixTokensFor ──────────────────────────────────────────────────

  describe('minPrefixTokensFor', () => {
    it('returns 4096 for Opus 4.5 / 4.6 / 4.7', () => {
      expect(minPrefixTokensFor('claude-opus-4.5')).toBe(4096)
      expect(minPrefixTokensFor('claude-opus-4.6')).toBe(4096)
      expect(minPrefixTokensFor('claude-opus-4.7')).toBe(4096)
    })

    it('returns 4096 for the dasherized Opus 4.5+ ids', () => {
      expect(minPrefixTokensFor('claude-opus-4-5')).toBe(4096)
      expect(minPrefixTokensFor('claude-opus-4-6-20251001')).toBe(4096)
      expect(minPrefixTokensFor('claude-opus-4-7')).toBe(4096)
    })

    it('returns 4096 for Haiku 4.5 (both formats)', () => {
      expect(minPrefixTokensFor('claude-haiku-4.5')).toBe(4096)
      expect(minPrefixTokensFor('claude-haiku-4-5')).toBe(4096)
    })

    it('returns 1024 for Sonnet 4.x (4096-min table does not match)', () => {
      expect(minPrefixTokensFor('claude-sonnet-4-5')).toBe(1024)
      expect(minPrefixTokensFor('claude-sonnet-4')).toBe(1024)
      expect(minPrefixTokensFor('sonnet')).toBe(1024)
    })

    it('returns 1024 for Opus 4.4 (below the 4.5 cutoff)', () => {
      // Older Opus 4.x — falls through to the 1024 default.
      expect(minPrefixTokensFor('claude-opus-4')).toBe(1024)
    })

    it('returns 1024 for unknown models (safe default)', () => {
      expect(minPrefixTokensFor('gpt-5-mini')).toBe(1024)
      expect(minPrefixTokensFor('llama3')).toBe(1024)
      expect(minPrefixTokensFor('')).toBe(1024)
    })

    it('is case-insensitive', () => {
      expect(minPrefixTokensFor('CLAUDE-OPUS-4.5')).toBe(4096)
      expect(minPrefixTokensFor('Claude-Haiku-4-5')).toBe(4096)
    })
  })

  // ── shouldCachePrefix ───────────────────────────────────────────────────

  describe('shouldCachePrefix', () => {
    const enabledPolicy: CachePolicy = { enabled: true, ttl: 'ephemeral' }
    const disabledPolicy: CachePolicy = { enabled: false, ttl: 'ephemeral' }

    it('returns false when policy is disabled, regardless of prefix size', () => {
      expect(shouldCachePrefix(99999, 'claude-sonnet-4-5', disabledPolicy)).toBe(false)
    })

    it('returns false for 0-token prefix', () => {
      expect(shouldCachePrefix(0, 'claude-sonnet-4-5', enabledPolicy)).toBe(false)
    })

    it('returns false for negative prefix sizes (defensive)', () => {
      expect(shouldCachePrefix(-1, 'claude-sonnet-4-5', enabledPolicy)).toBe(false)
    })

    it('returns true at exactly the per-model minimum (1024 for Sonnet)', () => {
      expect(shouldCachePrefix(1024, 'claude-sonnet-4-5', enabledPolicy)).toBe(true)
    })

    it('returns false one token below the per-model minimum', () => {
      expect(shouldCachePrefix(1023, 'claude-sonnet-4-5', enabledPolicy)).toBe(false)
    })

    it('returns true well above the per-model minimum', () => {
      expect(shouldCachePrefix(50000, 'claude-sonnet-4-5', enabledPolicy)).toBe(true)
    })

    it('uses the 4096 minimum for Opus 4.5+ (boundary cases)', () => {
      expect(shouldCachePrefix(4095, 'claude-opus-4-5', enabledPolicy)).toBe(false)
      expect(shouldCachePrefix(4096, 'claude-opus-4-5', enabledPolicy)).toBe(true)
      expect(shouldCachePrefix(4097, 'claude-opus-4-5', enabledPolicy)).toBe(true)
    })

    it('uses the 4096 minimum for Haiku 4.5 (boundary cases)', () => {
      expect(shouldCachePrefix(4095, 'claude-haiku-4-5', enabledPolicy)).toBe(false)
      expect(shouldCachePrefix(4096, 'claude-haiku-4-5', enabledPolicy)).toBe(true)
    })

    it('respects the 1024 minimum for Sonnet 4.5 even though Opus 4.5 needs 4096', () => {
      // Make sure the Opus 4.5 rule doesn't bleed into Sonnet 4.5 matching.
      expect(shouldCachePrefix(2048, 'claude-sonnet-4-5', enabledPolicy)).toBe(true)
    })

    it('returns true for OpenAI models with 1024 prefix (size threshold met, but the caller is expected to gate on isAnthropicModel)', () => {
      // shouldCachePrefix doesn't itself enforce the Anthropic check — the
      // caller (LocalModelAdapter.chatAnthropic) does. This test pins that
      // contract: shouldCachePrefix gates on policy.enabled + size only.
      expect(shouldCachePrefix(1024, 'gpt-5-mini', enabledPolicy)).toBe(true)
    })
  })
})
