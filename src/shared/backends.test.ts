import { describe, it, expect } from 'vitest'
import { pickReadyBackend, type BackendId } from './backends'

const ALL: BackendId[] = ['copilot-cli', 'copilot-sdk', 'claude-cli', 'claude-sdk']

describe('pickReadyBackend', () => {
  it('returns null when nothing is ready', () => {
    expect(pickReadyBackend([])).toBeNull()
    expect(pickReadyBackend([], { preferred: 'copilot-cli', lastUsed: 'claude-cli' })).toBeNull()
  })

  it('prefers the explicit preferred backend when it is ready', () => {
    expect(pickReadyBackend(ALL, { preferred: 'claude-sdk' })).toBe('claude-sdk')
  })

  it('ignores a preferred backend that is not ready and falls through', () => {
    // copilot not installed → preferred copilot-cli is not in ready set
    expect(pickReadyBackend(['claude-cli'], { preferred: 'copilot-cli' })).toBe('claude-cli')
  })

  it('falls back to last-used when preferred is absent/not ready', () => {
    expect(pickReadyBackend(['claude-cli', 'claude-sdk'], { lastUsed: 'claude-sdk' })).toBe('claude-sdk')
  })

  it('prefers a ready last-used over the Copilot default', () => {
    expect(pickReadyBackend(['copilot-cli', 'claude-cli'], { lastUsed: 'claude-cli' })).toBe('claude-cli')
  })

  it('defaults to copilot-cli when ready and no preference/last-used applies', () => {
    expect(pickReadyBackend(['copilot-cli', 'claude-cli'])).toBe('copilot-cli')
  })

  it('returns the only ready backend (the Claude-only fresh-install case)', () => {
    // The exact scenario from the bug report: only Claude CLI connected.
    expect(pickReadyBackend(['claude-cli'])).toBe('claude-cli')
    expect(pickReadyBackend(['claude-cli'], { preferred: 'copilot-cli', lastUsed: 'copilot-cli' })).toBe('claude-cli')
  })

  it('returns the first ready backend when copilot-cli is absent', () => {
    expect(pickReadyBackend(['claude-sdk', 'copilot-sdk'])).toBe('claude-sdk')
  })
})
