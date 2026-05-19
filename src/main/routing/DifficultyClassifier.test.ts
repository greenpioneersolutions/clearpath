import { describe, it, expect } from 'vitest'
import { classify, type ClassifierInput } from './DifficultyClassifier'

function input(over: Partial<ClassifierInput> = {}): ClassifierInput {
  return {
    userText: '',
    promptTokens: 0,
    hasAttachments: false,
    attachmentCount: 0,
    hasSlashCommand: false,
    isContinuation: false,
    ...over,
  }
}

describe('DifficultyClassifier', () => {
  describe('trivial', () => {
    it('classifies a short question as trivial with high confidence', () => {
      const text = 'What time is it in Tokyo?'
      const result = classify(input({
        userText: text,
        promptTokens: 8,
      }))
      expect(result.difficulty).toBe('trivial')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result.reasons.length).toBeGreaterThan(0)
    })

    it('boosts confidence when the prompt also starts with a slash', () => {
      const baseline = classify(input({
        userText: 'help me',
        promptTokens: 3,
      }))
      const withSlash = classify(input({
        userText: '/help',
        promptTokens: 2,
        hasSlashCommand: true,
      }))
      expect(withSlash.confidence).toBeGreaterThanOrEqual(baseline.confidence)
    })

    it('classifies a short non-question as trivial when all other gates pass', () => {
      const result = classify(input({
        userText: 'Hi there',
        promptTokens: 3,
      }))
      expect(result.difficulty).toBe('trivial')
    })
  })

  describe('hard', () => {
    it('classifies a multi-step refactor request as hard', () => {
      const result = classify(input({
        userText: 'Refactor the authentication middleware across all backends',
        promptTokens: 12,
      }))
      expect(result.difficulty).toBe('hard')
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
      expect(result.reasons.some((r) => r.toLowerCase().includes('refactor'))).toBe(true)
    })

    it('classifies a 600-token stack trace paste as hard (length + code fence)', () => {
      const fence = '```\n' + Array(20).fill('at Object.<anonymous>').join('\n') + '\n```'
      const result = classify(input({
        userText: 'Help with this error:\n' + fence,
        promptTokens: 600,
      }))
      expect(result.difficulty).toBe('hard')
      // Two hard signals (length + fence) → confidence above 0.7
      expect(result.confidence).toBeGreaterThan(0.75)
    })

    it('classifies a request with thinking-mode keyword as hard', () => {
      const result = classify(input({
        userText: 'Think hard about whether this design will scale.',
        promptTokens: 12,
      }))
      expect(result.difficulty).toBe('hard')
    })

    it('classifies ≥ 2 attachments as hard', () => {
      const result = classify(input({
        userText: 'Summarize these',
        promptTokens: 5,
        hasAttachments: true,
        attachmentCount: 3,
      }))
      expect(result.difficulty).toBe('hard')
      expect(result.reasons.some((r) => r.includes('3 attachments'))).toBe(true)
    })
  })

  describe('normal', () => {
    it('classifies "add a comment to this function" with one attachment as normal', () => {
      const result = classify(input({
        userText: 'Add a comment to this function explaining the side effects',
        promptTokens: 50,
        hasAttachments: true,
        attachmentCount: 1,
      }))
      expect(result.difficulty).toBe('normal')
      expect(result.confidence).toBeCloseTo(0.6, 1)
    })

    it('classifies a medium prompt with a short code fence as normal', () => {
      const fence = '```\nconst x = 1\nconst y = 2\n```'
      const result = classify(input({
        userText: 'Explain this:\n' + fence,
        promptTokens: 60,
      }))
      expect(result.difficulty).toBe('normal')
    })
  })

  describe('continuation penalty', () => {
    it('downgrades a hard turn to normal when it stems from a single signal', () => {
      // Long prompt is the only hard signal; continuation should downgrade.
      const result = classify(input({
        userText: 'thanks, do the same for line 50',
        promptTokens: 450,
        isContinuation: true,
      }))
      expect(result.difficulty).toBe('normal')
      expect(result.reasons.some((r) => r.includes('continuation'))).toBe(true)
    })

    it('does NOT downgrade when ≥ 2 hard signals fire', () => {
      // refactor keyword + length both fire.
      const result = classify(input({
        userText: 'Please refactor the authentication middleware across the entire codebase.',
        promptTokens: 450,
        isContinuation: true,
      }))
      expect(result.difficulty).toBe('hard')
    })

    it('does NOT downgrade when a substantive code fence is present', () => {
      const fence = '```\n' + Array(8).fill('line').join('\n') + '\n```'
      const result = classify(input({
        userText: 'Look at this:\n' + fence,
        promptTokens: 80,
        isContinuation: true,
      }))
      expect(result.difficulty).toBe('hard')
    })

    it('downgrades normal to trivial when continuation', () => {
      const result = classify(input({
        userText: 'And the same for the next file please',
        promptTokens: 50,
        hasAttachments: true,
        attachmentCount: 1,
        isContinuation: true,
      }))
      expect(result.difficulty).toBe('trivial')
    })
  })

  describe('confidence is always in [0, 1]', () => {
    it.each([
      ['empty', input({ userText: '' })],
      ['short', input({ userText: 'hi', promptTokens: 1 })],
      ['hard', input({ userText: 'refactor all of it', promptTokens: 5 })],
      ['long', input({ userText: 'x'.repeat(5000), promptTokens: 1200 })],
      ['continuation hard', input({ userText: 'refactor everything', promptTokens: 1500, isContinuation: true })],
    ])('case: %s', (_label, ctx) => {
      const result = classify(ctx)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('reasons[]', () => {
    it('always includes at least one reason for non-empty input', () => {
      const result = classify(input({ userText: 'hello world', promptTokens: 2 }))
      expect(result.reasons.length).toBeGreaterThan(0)
    })

    it('surfaces multi-step keyword in reasons for hard prompts', () => {
      const result = classify(input({
        userText: 'Implement the new auth flow',
        promptTokens: 7,
      }))
      expect(result.reasons.some((r) => r.includes('implement'))).toBe(true)
    })
  })
})
