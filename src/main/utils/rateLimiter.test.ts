import { describe, it, expect, beforeEach } from 'vitest'
import { defineRateLimit, checkRateLimit } from './rateLimiter'

describe('rateLimiter', () => {
  describe('checkRateLimit', () => {
    it('allows calls when no limit is defined for the name', () => {
      const result = checkRateLimit('unknown-operation')
      expect(result.allowed).toBe(true)
      expect(result.retryAfterMs).toBeUndefined()
    })

    it('allows calls within the rate limit', () => {
      defineRateLimit('test:basic', 3, 60_000)
      expect(checkRateLimit('test:basic').allowed).toBe(true)
      expect(checkRateLimit('test:basic').allowed).toBe(true)
      expect(checkRateLimit('test:basic').allowed).toBe(true)
    })

    it('rejects calls exceeding the rate limit', () => {
      defineRateLimit('test:exceed', 2, 60_000)
      expect(checkRateLimit('test:exceed').allowed).toBe(true)
      expect(checkRateLimit('test:exceed').allowed).toBe(true)
      // Third call should be rejected
      const result = checkRateLimit('test:exceed')
      expect(result.allowed).toBe(false)
      expect(result.retryAfterMs).toBeGreaterThan(0)
    })

    it('provides a retryAfterMs value when throttled', () => {
      defineRateLimit('test:retry', 1, 5_000)
      checkRateLimit('test:retry') // first call succeeds
      const result = checkRateLimit('test:retry')
      expect(result.allowed).toBe(false)
      expect(result.retryAfterMs).toBeDefined()
      expect(result.retryAfterMs!).toBeLessThanOrEqual(5_000)
      expect(result.retryAfterMs!).toBeGreaterThan(0)
    })
  })

  describe('defineRateLimit', () => {
    it('can redefine a limit to increase capacity', () => {
      defineRateLimit('test:redefine', 1, 60_000)
      expect(checkRateLimit('test:redefine').allowed).toBe(true)
      expect(checkRateLimit('test:redefine').allowed).toBe(false)

      // Redefine with higher limit (resets timestamps)
      defineRateLimit('test:redefine', 5, 60_000)
      expect(checkRateLimit('test:redefine').allowed).toBe(true)
    })
  })
})
