import {
  COPILOT_FLAGS,
  CLAUDE_FLAGS,
  getFlagsForCli,
  getCategoriesForCli,
} from './flagDefs'

describe('COPILOT_FLAGS', () => {
  it('is a non-empty array', () => {
    expect(COPILOT_FLAGS.length).toBeGreaterThan(0)
  })

  it('each flag has required fields', () => {
    for (const f of COPILOT_FLAGS) {
      expect(typeof f.key).toBe('string')
      expect(f.key.length).toBeGreaterThan(0)
      expect(typeof f.flag).toBe('string')
      expect(typeof f.label).toBe('string')
      expect(typeof f.description).toBe('string')
      expect(['boolean', 'string', 'enum', 'tags', 'number']).toContain(f.type)
      expect(typeof f.category).toBe('string')
      expect(f.cli).toBe('copilot')
    }
  })

  it('has no duplicate keys', () => {
    const keys = COPILOT_FLAGS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('enum flags have enumValues', () => {
    for (const f of COPILOT_FLAGS) {
      if (f.type === 'enum') {
        expect(Array.isArray(f.enumValues)).toBe(true)
        expect(f.enumValues!.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('CLAUDE_FLAGS', () => {
  it('is a non-empty array', () => {
    expect(CLAUDE_FLAGS.length).toBeGreaterThan(0)
  })

  it('each flag has required fields', () => {
    for (const f of CLAUDE_FLAGS) {
      expect(typeof f.key).toBe('string')
      expect(f.key.length).toBeGreaterThan(0)
      expect(typeof f.flag).toBe('string')
      expect(typeof f.label).toBe('string')
      expect(typeof f.description).toBe('string')
      expect(['boolean', 'string', 'enum', 'tags', 'number']).toContain(f.type)
      expect(typeof f.category).toBe('string')
      expect(f.cli).toBe('claude')
    }
  })

  it('has no duplicate keys', () => {
    const keys = CLAUDE_FLAGS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('enum flags have enumValues', () => {
    for (const f of CLAUDE_FLAGS) {
      if (f.type === 'enum') {
        expect(Array.isArray(f.enumValues)).toBe(true)
        expect(f.enumValues!.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('getFlagsForCli', () => {
  it('returns COPILOT_FLAGS for copilot', () => {
    expect(getFlagsForCli('copilot')).toBe(COPILOT_FLAGS)
  })

  it('returns CLAUDE_FLAGS for claude', () => {
    expect(getFlagsForCli('claude')).toBe(CLAUDE_FLAGS)
  })
})

describe('getCategoriesForCli', () => {
  it('returns non-empty categories for copilot', () => {
    const cats = getCategoriesForCli('copilot')
    expect(cats.length).toBeGreaterThan(0)
  })

  it('returns non-empty categories for claude', () => {
    const cats = getCategoriesForCli('claude')
    expect(cats.length).toBeGreaterThan(0)
  })

  it('returns unique categories (no duplicates)', () => {
    for (const cli of ['copilot', 'claude'] as const) {
      const cats = getCategoriesForCli(cli)
      expect(new Set(cats).size).toBe(cats.length)
    }
  })

  it('categories match those found in the flags', () => {
    for (const cli of ['copilot', 'claude'] as const) {
      const cats = getCategoriesForCli(cli)
      const flags = getFlagsForCli(cli)
      const flagCats = new Set(flags.map((f) => f.category))
      expect(new Set(cats)).toEqual(flagCats)
    }
  })
})
