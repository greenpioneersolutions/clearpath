import { STARTER_MEMORIES } from './memories'

describe('STARTER_MEMORIES', () => {
  it('is a non-empty array', () => {
    expect(STARTER_MEMORIES).toBeDefined()
    expect(Array.isArray(STARTER_MEMORIES)).toBe(true)
    expect(STARTER_MEMORIES.length).toBeGreaterThan(0)
  })

  it('contains exactly 5 memories', () => {
    expect(STARTER_MEMORIES).toHaveLength(5)
  })

  it('has no duplicate IDs', () => {
    const ids = STARTER_MEMORIES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  const validSetupPhases = ['onboarding', 'early', 'progressive', 'on-request'] as const

  describe.each(STARTER_MEMORIES)('memory "$name" (id=$id)', (memory) => {
    it('has all required string fields non-empty', () => {
      expect(memory.id).toEqual(expect.any(String))
      expect(memory.id.length).toBeGreaterThan(0)
      expect(memory.name).toEqual(expect.any(String))
      expect(memory.name.length).toBeGreaterThan(0)
      expect(memory.description).toEqual(expect.any(String))
      expect(memory.description.length).toBeGreaterThan(0)
      expect(memory.setupPrompt).toEqual(expect.any(String))
      expect(memory.setupPrompt.length).toBeGreaterThan(0)
      expect(memory.example).toEqual(expect.any(String))
      expect(memory.example.length).toBeGreaterThan(0)
      expect(memory.whatItUnlocks).toEqual(expect.any(String))
      expect(memory.whatItUnlocks.length).toBeGreaterThan(0)
    })

    it('has a valid setupPhase', () => {
      expect(validSetupPhases).toContain(memory.setupPhase)
    })

    it('has a non-empty fields array', () => {
      expect(Array.isArray(memory.fields)).toBe(true)
      expect(memory.fields.length).toBeGreaterThan(0)
    })

    it('each field has required MemoryFieldDef properties', () => {
      const validTypes = ['text', 'textarea', 'select', 'multiline-entries']
      memory.fields.forEach((field) => {
        expect(field.key).toEqual(expect.any(String))
        expect(field.key.length).toBeGreaterThan(0)
        expect(field.label).toEqual(expect.any(String))
        expect(field.label.length).toBeGreaterThan(0)
        expect(validTypes).toContain(field.type)
        expect(typeof field.required).toBe('boolean')
        expect(typeof field.placeholder).toBe('string')
        expect(field.helpText).toEqual(expect.any(String))
        expect(field.helpText.length).toBeGreaterThan(0)
      })
    })

    it('fields with type "select" have options array', () => {
      memory.fields
        .filter((f) => f.type === 'select')
        .forEach((field) => {
          expect(Array.isArray(field.options)).toBe(true)
          expect(field.options!.length).toBeGreaterThan(0)
          field.options!.forEach((opt) => {
            expect(typeof opt).toBe('string')
            expect(opt.length).toBeGreaterThan(0)
          })
        })
    })

    it('has no duplicate field keys', () => {
      const keys = memory.fields.map((f) => f.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })

  it('contains the expected memory IDs', () => {
    const ids = STARTER_MEMORIES.map((m) => m.id)
    expect(ids).toContain('work-profile')
    expect(ids).toContain('stakeholder-map')
    expect(ids).toContain('current-priorities')
    expect(ids).toContain('communication-preferences')
    expect(ids).toContain('working-preferences')
  })
})
