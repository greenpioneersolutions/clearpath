import { describe, it, expect } from 'vitest'
import { parseProgressPercent, extractTokenFromStdout } from './ClearMemoryService'

describe('parseProgressPercent', () => {
  it('returns the percent from a bare "N%" token', () => {
    expect(parseProgressPercent('45%')).toBe(45)
    expect(parseProgressPercent('0%')).toBe(0)
    expect(parseProgressPercent('100%')).toBe(100)
  })

  it('handles surrounding narrative text', () => {
    expect(parseProgressPercent('Downloading embedding model... 72%')).toBe(72)
    expect(parseProgressPercent('[progress] 50 % complete')).toBe(50)
  })

  it('computes percent from N/M fractions with units', () => {
    expect(parseProgressPercent('Downloading 120/240 MB')).toBe(50)
    expect(parseProgressPercent('written 1024/2048 bytes')).toBe(50)
    expect(parseProgressPercent('chunk 3/10')).toBe(30)
  })

  it('caps fractional results at [0, 100]', () => {
    expect(parseProgressPercent('processed 250/240 MB')).toBe(100)
  })

  it('returns null for non-progress lines', () => {
    expect(parseProgressPercent('hello world')).toBeNull()
    expect(parseProgressPercent('')).toBeNull()
    expect(parseProgressPercent('error: something went wrong')).toBeNull()
  })

  it('returns null for values outside 0-100 (bogus percents)', () => {
    // Regex matches up to 3 digits, but the value check rejects >100.
    expect(parseProgressPercent('load: 250%')).toBeNull()
  })

  it('returns null when denominator is zero', () => {
    expect(parseProgressPercent('chunk 5/0 MB')).toBeNull()
  })
})

describe('extractTokenFromStdout', () => {
  it('extracts from upstream "Raw:" line format', () => {
    // Matches `clearmemory auth create` real output shape.
    const stdout = [
      'Token created:',
      '  Raw:   cm_live_abc123def456',
      '  Hash:  sha256:xyz',
      '  Scope: read-write',
    ].join('\n')
    expect(extractTokenFromStdout(stdout)).toBe('cm_live_abc123def456')
  })

  it('extracts from a "Token:" line', () => {
    expect(extractTokenFromStdout('Token: abc-xyz-123')).toBe('abc-xyz-123')
  })

  it('extracts from a "Bearer:" line', () => {
    expect(extractTokenFromStdout('Bearer: abc')).toBe('abc')
  })

  it('extracts from JSON with a `token` field', () => {
    expect(extractTokenFromStdout('{"token": "tok_xyz", "scope": "rw"}')).toBe('tok_xyz')
  })

  it('extracts from JSON with alternative key names', () => {
    expect(extractTokenFromStdout('{"access_token": "a"}')).toBe('a')
    expect(extractTokenFromStdout('{"accessToken": "b"}')).toBe('b')
    expect(extractTokenFromStdout('{"auth_token": "c"}')).toBe('c')
    expect(extractTokenFromStdout('{"bearer": "d"}')).toBe('d')
  })

  it('strips surrounding quotes', () => {
    expect(extractTokenFromStdout('Token: "quoted-value"')).toBe('quoted-value')
    expect(extractTokenFromStdout("Token: 'squoted-value'")).toBe('squoted-value')
  })

  it('returns null for empty or whitespace input', () => {
    expect(extractTokenFromStdout('')).toBeNull()
    expect(extractTokenFromStdout('   \n\t  ')).toBeNull()
  })

  it('returns null when stdout has no recognisable token line', () => {
    expect(extractTokenFromStdout('Operation succeeded.')).toBeNull()
    expect(extractTokenFromStdout('{"unrelated": "field"}')).toBeNull()
  })

  it('does not false-positive on keys that merely contain "token"', () => {
    // Only lines whose key *starts with* a recognised keyword should match.
    expect(extractTokenFromStdout('my-token-field: abc')).toBeNull()
  })
})
