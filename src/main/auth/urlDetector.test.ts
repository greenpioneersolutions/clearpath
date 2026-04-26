import { describe, it, expect } from 'vitest'
import { parseBrowserUrl } from './urlDetector'

describe('parseBrowserUrl', () => {
  // ── Happy paths ───────────────────────────────────────────────────────────

  it('extracts a GitHub device-code URL from a copilot line', () => {
    const line = 'Visit https://github.com/login/device and enter code ABCD-1234'
    expect(parseBrowserUrl(line, 'copilot')).toBe('https://github.com/login/device')
  })

  it('extracts a GitHub device-code URL with query string', () => {
    const line = 'Open https://github.com/login/device?user_code=ABCD-1234 in your browser'
    expect(parseBrowserUrl(line, 'copilot')).toBe(
      'https://github.com/login/device?user_code=ABCD-1234',
    )
  })

  it('extracts a claude.ai URL from a claude login line', () => {
    const line = 'Please visit https://claude.ai/auth/cli?code=xyz to sign in'
    expect(parseBrowserUrl(line, 'claude')).toBe('https://claude.ai/auth/cli?code=xyz')
  })

  it('extracts a console.anthropic.com URL from a claude login line', () => {
    const line = 'Navigate to https://console.anthropic.com/login?session=abc'
    expect(parseBrowserUrl(line, 'claude')).toBe(
      'https://console.anthropic.com/login?session=abc',
    )
  })

  // ── No-match cases ────────────────────────────────────────────────────────

  it('returns null when line has no URL', () => {
    expect(parseBrowserUrl('Waiting for authentication…', 'copilot')).toBeNull()
    expect(parseBrowserUrl('Starting process', 'claude')).toBeNull()
  })

  it('returns null for empty or whitespace input', () => {
    expect(parseBrowserUrl('', 'copilot')).toBeNull()
    expect(parseBrowserUrl('', 'claude')).toBeNull()
  })

  it('ignores http:// (only https:// is accepted — security)', () => {
    const line = 'Visit http://github.com/login/device to continue'
    // No https match → falls through → generic regex also requires https → null
    expect(parseBrowserUrl(line, 'copilot')).toBeNull()
  })

  // ── Multiple URLs ─────────────────────────────────────────────────────────

  it('returns the FIRST matching URL when multiple appear on same line', () => {
    const line =
      'Visit https://github.com/login/device (help: https://docs.github.com/copilot)'
    expect(parseBrowserUrl(line, 'copilot')).toBe('https://github.com/login/device')
  })

  it('prefers CLI-specific match over generic even if generic comes first', () => {
    const line = 'See https://example.com/help or visit https://github.com/login/device'
    expect(parseBrowserUrl(line, 'copilot')).toBe('https://github.com/login/device')
  })

  it('falls back to generic https:// when CLI-specific pattern does not match', () => {
    const line = 'Authenticate at https://auth.example.com/oauth/device'
    expect(parseBrowserUrl(line, 'copilot')).toBe('https://auth.example.com/oauth/device')
  })

  // ── Trailing punctuation ──────────────────────────────────────────────────

  it('strips trailing period from URL', () => {
    const line = 'Visit https://github.com/login/device.'
    expect(parseBrowserUrl(line, 'copilot')).toBe('https://github.com/login/device')
  })

  it('strips trailing comma from URL', () => {
    const line = 'Visit https://github.com/login/device, then enter the code'
    expect(parseBrowserUrl(line, 'copilot')).toBe('https://github.com/login/device')
  })

  it('strips trailing closing paren from URL', () => {
    const line = '(authentication URL: https://github.com/login/device)'
    expect(parseBrowserUrl(line, 'copilot')).toBe('https://github.com/login/device')
  })

  // ── Cross-CLI tolerance ───────────────────────────────────────────────────

  it('copilot can still detect a claude.ai URL (defensive fallback)', () => {
    const line = 'Unexpected: https://claude.ai/auth/cli'
    expect(parseBrowserUrl(line, 'copilot')).toBe('https://claude.ai/auth/cli')
  })

  it('claude can still detect a github.com/login/device URL (defensive fallback)', () => {
    const line = 'Unexpected: https://github.com/login/device'
    expect(parseBrowserUrl(line, 'claude')).toBe('https://github.com/login/device')
  })

  // ── URL always starts with https (security contract) ──────────────────────

  it('every returned URL starts with https://', () => {
    const lines = [
      'Visit https://github.com/login/device',
      'Click https://claude.ai/auth/cli',
      'Open https://auth.example.com/device',
    ]
    for (const line of lines) {
      const url = parseBrowserUrl(line, 'copilot')
      expect(url).not.toBeNull()
      expect(url!.startsWith('https://')).toBe(true)
    }
  })
})
