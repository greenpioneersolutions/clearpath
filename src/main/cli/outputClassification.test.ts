import { describe, it, expect } from 'vitest'
import { isUsageSummary } from './outputClassification'

describe('isUsageSummary', () => {
  // Regression: Copilot's end-of-turn summary lines used to slip through and
  // render as a red error block. Each fragment must be recognised on its own
  // because they can arrive as separate stderr chunks.
  it('matches Copilot summary lines (the false-error regression)', () => {
    expect(isUsageSummary('Changes   +0 -0')).toBe(true)
    expect(isUsageSummary('Changes +12 -3')).toBe(true)
    expect(isUsageSummary('Requests   0 Premium (18s)')).toBe(true)
    expect(isUsageSummary('Tokens   ↑ 55.4k (30.5k cached) • ↓ 1.8k (1.2k reasoning)')).toBe(true)
  })

  it('matches the full multi-line summary as one chunk', () => {
    const chunk = 'Changes +0 -0\nRequests 0 Premium (18s)\nTokens ↑ 55.4k (30.5k cached) • ↓ 1.8k (1.2k reasoning)'
    expect(isUsageSummary(chunk)).toBe(true)
  })

  it('still matches the original usage-stat phrasings', () => {
    expect(isUsageSummary('Total usage estimate: ...')).toBe(true)
    expect(isUsageSummary('Premium requests used: 3')).toBe(true)
    expect(isUsageSummary('Breakdown by AI model')).toBe(true)
    expect(isUsageSummary('API time spent: 4s')).toBe(true)
  })

  it('does NOT swallow genuine errors that merely mention tokens/changes', () => {
    expect(isUsageSummary('Error: failed to apply changes to file')).toBe(false)
    expect(isUsageSummary('Error: invalid token in request header')).toBe(false)
    expect(isUsageSummary('Could not write changes: permission denied')).toBe(false)
    expect(isUsageSummary('TypeError: cannot read property of undefined')).toBe(false)
    expect(isUsageSummary('')).toBe(false)
  })

  // Finding A (PR #62): patterns must be line-anchored so mid-sentence mentions
  // of premium/changes/tokens in a real error aren't misclassified as usage.
  it('does NOT swallow errors that mention premium/changes/tokens mid-line', () => {
    expect(isUsageSummary('Error: 5 premium requests failed')).toBe(false)
    expect(isUsageSummary('changes detected in 3 files')).toBe(false)
    expect(isUsageSummary('the build introduced code changes that broke CI')).toBe(false)
    expect(isUsageSummary('Error: token ↑ limit exceeded in request')).toBe(false)
  })

  it('matches a Tokens line that is not the first line of a multi-line chunk', () => {
    expect(isUsageSummary('Changes +0 -0\nRequests 0 Premium (18s)\nTokens ↑ 55.4k (30.5k cached)')).toBe(true)
  })
})
