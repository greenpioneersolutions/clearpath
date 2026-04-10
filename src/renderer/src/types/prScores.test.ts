import {
  DEFAULT_PR_SCORES_CONFIG,
  getScoreColor,
  getScoreLabel,
} from './prScores'

describe('DEFAULT_PR_SCORES_CONFIG', () => {
  it('is defined with correct defaults', () => {
    expect(DEFAULT_PR_SCORES_CONFIG).toBeDefined()
    expect(DEFAULT_PR_SCORES_CONFIG.defaultTimeRangeDays).toBe(30)
    expect(DEFAULT_PR_SCORES_CONFIG.labelFilters).toEqual([])
    expect(DEFAULT_PR_SCORES_CONFIG.excludeLabels).toEqual([])
    expect(DEFAULT_PR_SCORES_CONFIG.includeCodeAnalysis).toBe(false)
    expect(DEFAULT_PR_SCORES_CONFIG.enableAiReview).toBe(false)
  })
})

describe('getScoreColor', () => {
  it('returns green for scores >= 75', () => {
    expect(getScoreColor(75)).toBe('#10b981')
    expect(getScoreColor(100)).toBe('#10b981')
    expect(getScoreColor(90)).toBe('#10b981')
  })

  it('returns yellow for scores >= 60 and < 75', () => {
    expect(getScoreColor(60)).toBe('#f59e0b')
    expect(getScoreColor(74)).toBe('#f59e0b')
  })

  it('returns orange for scores >= 40 and < 60', () => {
    expect(getScoreColor(40)).toBe('#f97316')
    expect(getScoreColor(59)).toBe('#f97316')
  })

  it('returns red for scores < 40', () => {
    expect(getScoreColor(39)).toBe('#ef4444')
    expect(getScoreColor(0)).toBe('#ef4444')
    expect(getScoreColor(10)).toBe('#ef4444')
  })
})

describe('getScoreLabel', () => {
  it('returns Excellent for scores >= 80', () => {
    expect(getScoreLabel(80)).toBe('Excellent')
    expect(getScoreLabel(100)).toBe('Excellent')
  })

  it('returns Good for scores >= 60 and < 80', () => {
    expect(getScoreLabel(60)).toBe('Good')
    expect(getScoreLabel(79)).toBe('Good')
  })

  it('returns Fair for scores >= 40 and < 60', () => {
    expect(getScoreLabel(40)).toBe('Fair')
    expect(getScoreLabel(59)).toBe('Fair')
  })

  it('returns Needs Attention for scores < 40', () => {
    expect(getScoreLabel(39)).toBe('Needs Attention')
    expect(getScoreLabel(0)).toBe('Needs Attention')
  })
})
