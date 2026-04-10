import { STARTER_AGENTS } from './agents'

describe('STARTER_AGENTS', () => {
  it('is a non-empty array', () => {
    expect(STARTER_AGENTS).toBeDefined()
    expect(Array.isArray(STARTER_AGENTS)).toBe(true)
    expect(STARTER_AGENTS.length).toBeGreaterThan(0)
  })

  it('contains exactly 6 agents', () => {
    expect(STARTER_AGENTS).toHaveLength(6)
  })

  it('has no duplicate IDs', () => {
    const ids = STARTER_AGENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  describe.each(STARTER_AGENTS)('agent "$name" (id=$id)', (agent) => {
    it('has all required string fields non-empty', () => {
      expect(agent.id).toEqual(expect.any(String))
      expect(agent.id.length).toBeGreaterThan(0)
      expect(agent.name).toEqual(expect.any(String))
      expect(agent.name.length).toBeGreaterThan(0)
      expect(agent.tagline).toEqual(expect.any(String))
      expect(agent.tagline.length).toBeGreaterThan(0)
      expect(agent.icon).toEqual(expect.any(String))
      expect(agent.icon.length).toBeGreaterThan(0)
      expect(agent.description).toEqual(expect.any(String))
      expect(agent.description.length).toBeGreaterThan(0)
      expect(agent.systemPrompt).toEqual(expect.any(String))
      expect(agent.systemPrompt.length).toBeGreaterThan(0)
    })

    it('has a valid category', () => {
      expect(['spotlight', 'default']).toContain(agent.category)
    })

    it('has a numeric displayOrder', () => {
      expect(agent.displayOrder).toEqual(expect.any(Number))
      expect(agent.displayOrder).toBeGreaterThan(0)
    })

    it('has non-empty handles array', () => {
      expect(Array.isArray(agent.handles)).toBe(true)
      expect(agent.handles.length).toBeGreaterThan(0)
      agent.handles.forEach((h) => {
        expect(typeof h).toBe('string')
        expect(h.length).toBeGreaterThan(0)
      })
    })

    it('has non-empty doesNotHandle array', () => {
      expect(Array.isArray(agent.doesNotHandle)).toBe(true)
      expect(agent.doesNotHandle.length).toBeGreaterThan(0)
    })

    it('has associatedSkills as a non-empty string array', () => {
      expect(Array.isArray(agent.associatedSkills)).toBe(true)
      expect(agent.associatedSkills.length).toBeGreaterThan(0)
      agent.associatedSkills.forEach((s) => {
        expect(typeof s).toBe('string')
        expect(s.length).toBeGreaterThan(0)
      })
    })

    it('has primaryMemories as a non-empty string array', () => {
      expect(Array.isArray(agent.primaryMemories)).toBe(true)
      expect(agent.primaryMemories.length).toBeGreaterThan(0)
    })

    it('has secondaryMemories as a string array', () => {
      expect(Array.isArray(agent.secondaryMemories)).toBe(true)
    })

    it('has handoffTriggers with valid structure', () => {
      expect(Array.isArray(agent.handoffTriggers)).toBe(true)
      agent.handoffTriggers.forEach((trigger) => {
        expect(trigger.condition).toEqual(expect.any(String))
        expect(trigger.condition.length).toBeGreaterThan(0)
        expect(trigger.targetAgentId).toEqual(expect.any(String))
        expect(trigger.targetAgentId.length).toBeGreaterThan(0)
        expect(trigger.suggestionText).toEqual(expect.any(String))
        expect(trigger.suggestionText.length).toBeGreaterThan(0)
      })
    })

    it('handoffTriggers reference valid agent IDs', () => {
      const allIds = STARTER_AGENTS.map((a) => a.id)
      agent.handoffTriggers.forEach((trigger) => {
        expect(allIds).toContain(trigger.targetAgentId)
      })
    })
  })

  it('has unique displayOrder values', () => {
    const orders = STARTER_AGENTS.map((a) => a.displayOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('contains the expected agent IDs', () => {
    const ids = STARTER_AGENTS.map((a) => a.id)
    expect(ids).toContain('communication-coach')
    expect(ids).toContain('research-analyst')
    expect(ids).toContain('chief-of-staff')
    expect(ids).toContain('strategy-decision-partner')
    expect(ids).toContain('technical-reviewer')
    expect(ids).toContain('document-builder')
  })
})
