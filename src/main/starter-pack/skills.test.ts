import { STARTER_SKILLS } from './skills'

describe('STARTER_SKILLS', () => {
  it('is a non-empty array', () => {
    expect(STARTER_SKILLS).toBeDefined()
    expect(Array.isArray(STARTER_SKILLS)).toBe(true)
    expect(STARTER_SKILLS.length).toBeGreaterThan(0)
  })

  it('contains exactly 7 skills', () => {
    expect(STARTER_SKILLS).toHaveLength(7)
  })

  it('has no duplicate IDs', () => {
    const ids = STARTER_SKILLS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  describe.each(STARTER_SKILLS)('skill "$name" (id=$id)', (skill) => {
    it('has all required string fields non-empty', () => {
      expect(skill.id).toEqual(expect.any(String))
      expect(skill.id.length).toBeGreaterThan(0)
      expect(skill.name).toEqual(expect.any(String))
      expect(skill.name.length).toBeGreaterThan(0)
      expect(skill.description).toEqual(expect.any(String))
      expect(skill.description.length).toBeGreaterThan(0)
      expect(skill.inputDescription).toEqual(expect.any(String))
      expect(skill.inputDescription.length).toBeGreaterThan(0)
      expect(skill.outputDescription).toEqual(expect.any(String))
      expect(skill.outputDescription.length).toBeGreaterThan(0)
      expect(skill.skillPrompt).toEqual(expect.any(String))
      expect(skill.skillPrompt.length).toBeGreaterThan(0)
    })

    it('has primaryAgents as a string array', () => {
      expect(Array.isArray(skill.primaryAgents)).toBe(true)
      skill.primaryAgents.forEach((a) => {
        expect(typeof a).toBe('string')
        expect(a.length).toBeGreaterThan(0)
      })
    })

    it('has secondaryAgents as a string array', () => {
      expect(Array.isArray(skill.secondaryAgents)).toBe(true)
      skill.secondaryAgents.forEach((a) => {
        expect(typeof a).toBe('string')
        expect(a.length).toBeGreaterThan(0)
      })
    })

    it('skillPrompt contains XML skill_definition tags', () => {
      expect(skill.skillPrompt).toContain('<skill_definition>')
      expect(skill.skillPrompt).toContain('</skill_definition>')
    })
  })

  it('contains the expected skill IDs', () => {
    const ids = STARTER_SKILLS.map((s) => s.id)
    expect(ids).toContain('audience-tone-rewrite')
    expect(ids).toContain('research-brief-source-verification')
    expect(ids).toContain('meeting-to-action')
    expect(ids).toContain('priority-execution-planner')
    expect(ids).toContain('feedback-difficult-conversation-prep')
    expect(ids).toContain('document-builder')
    expect(ids).toContain('concept-explainer')
  })
})
