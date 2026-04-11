import { STARTER_PROMPTS } from './prompts'

describe('STARTER_PROMPTS', () => {
  it('is a non-empty array', () => {
    expect(STARTER_PROMPTS).toBeDefined()
    expect(Array.isArray(STARTER_PROMPTS)).toBe(true)
    expect(STARTER_PROMPTS.length).toBeGreaterThan(0)
  })

  it('contains exactly 6 prompts', () => {
    expect(STARTER_PROMPTS).toHaveLength(6)
  })

  it('has no duplicate IDs', () => {
    const ids = STARTER_PROMPTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  describe.each(STARTER_PROMPTS)('prompt "$displayText" (id=$id)', (prompt) => {
    it('has all required string fields non-empty', () => {
      expect(prompt.id).toEqual(expect.any(String))
      expect(prompt.id.length).toBeGreaterThan(0)
      expect(prompt.displayText).toEqual(expect.any(String))
      expect(prompt.displayText.length).toBeGreaterThan(0)
      expect(prompt.targetAgentId).toEqual(expect.any(String))
      expect(prompt.targetAgentId.length).toBeGreaterThan(0)
    })

    it('has a valid category', () => {
      expect(['spotlight', 'default']).toContain(prompt.category)
    })

    it('has a numeric displayOrder', () => {
      expect(prompt.displayOrder).toEqual(expect.any(Number))
      expect(prompt.displayOrder).toBeGreaterThan(0)
    })

    it('has a non-empty followUpQuestions array', () => {
      expect(Array.isArray(prompt.followUpQuestions)).toBe(true)
      expect(prompt.followUpQuestions.length).toBeGreaterThan(0)
      prompt.followUpQuestions.forEach((q) => {
        expect(typeof q).toBe('string')
        expect(q.length).toBeGreaterThan(0)
      })
    })
  })

  it('has unique displayOrder values', () => {
    const orders = STARTER_PROMPTS.map((p) => p.displayOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('contains the expected prompt IDs', () => {
    const ids = STARTER_PROMPTS.map((p) => p.id)
    expect(ids).toContain('communication-draft')
    expect(ids).toContain('research-brief')
    expect(ids).toContain('meeting-followup')
    expect(ids).toContain('decision-analysis')
    expect(ids).toContain('technical-review')
    expect(ids).toContain('weekly-planning')
  })
})
