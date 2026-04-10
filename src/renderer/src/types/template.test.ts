import { TEMPLATE_CATEGORIES } from './template'

describe('TEMPLATE_CATEGORIES', () => {
  it('is a non-empty array', () => {
    expect(TEMPLATE_CATEGORIES).toBeDefined()
    expect(TEMPLATE_CATEGORIES.length).toBeGreaterThan(0)
  })

  it('contains only non-empty strings', () => {
    for (const cat of TEMPLATE_CATEGORIES) {
      expect(typeof cat).toBe('string')
      expect(cat.trim().length).toBeGreaterThan(0)
    }
  })

  it('has no duplicates', () => {
    const unique = new Set(TEMPLATE_CATEGORIES)
    expect(unique.size).toBe(TEMPLATE_CATEGORIES.length)
  })

  it('includes expected categories', () => {
    expect(TEMPLATE_CATEGORIES).toContain('Code Review')
    expect(TEMPLATE_CATEGORIES).toContain('Bug Fix')
    expect(TEMPLATE_CATEGORIES).toContain('Testing')
    expect(TEMPLATE_CATEGORIES).toContain('Custom')
  })
})
