import { DEFAULT_ACCESSIBILITY } from './accessibility'

describe('DEFAULT_ACCESSIBILITY', () => {
  it('is defined', () => {
    expect(DEFAULT_ACCESSIBILITY).toBeDefined()
  })

  it('has correct default values', () => {
    expect(DEFAULT_ACCESSIBILITY.fontScale).toBe(1.0)
    expect(DEFAULT_ACCESSIBILITY.reducedMotion).toBe(false)
    expect(DEFAULT_ACCESSIBILITY.highContrast).toBe(false)
    expect(DEFAULT_ACCESSIBILITY.focusStyle).toBe('ring')
    expect(DEFAULT_ACCESSIBILITY.screenReaderMode).toBe(false)
    expect(DEFAULT_ACCESSIBILITY.keyboardShortcutsEnabled).toBe(true)
  })

  it('has all required fields', () => {
    expect(typeof DEFAULT_ACCESSIBILITY.fontScale).toBe('number')
    expect(typeof DEFAULT_ACCESSIBILITY.reducedMotion).toBe('boolean')
    expect(typeof DEFAULT_ACCESSIBILITY.highContrast).toBe('boolean')
    expect(typeof DEFAULT_ACCESSIBILITY.focusStyle).toBe('string')
    expect(typeof DEFAULT_ACCESSIBILITY.screenReaderMode).toBe('boolean')
    expect(typeof DEFAULT_ACCESSIBILITY.keyboardShortcutsEnabled).toBe('boolean')
  })
})
