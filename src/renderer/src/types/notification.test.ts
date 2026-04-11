import {
  ALL_NOTIFICATION_TYPES,
  SEVERITY_STYLES,
  TYPE_LABELS,
} from './notification'

describe('ALL_NOTIFICATION_TYPES', () => {
  it('is a non-empty array', () => {
    expect(ALL_NOTIFICATION_TYPES).toBeDefined()
    expect(ALL_NOTIFICATION_TYPES.length).toBeGreaterThan(0)
  })

  it('contains only strings', () => {
    for (const t of ALL_NOTIFICATION_TYPES) {
      expect(typeof t).toBe('string')
    }
  })

  it('has no duplicates', () => {
    const unique = new Set(ALL_NOTIFICATION_TYPES)
    expect(unique.size).toBe(ALL_NOTIFICATION_TYPES.length)
  })
})

describe('SEVERITY_STYLES', () => {
  it('has entries for info, warning, critical', () => {
    expect(SEVERITY_STYLES.info).toBeDefined()
    expect(SEVERITY_STYLES.warning).toBeDefined()
    expect(SEVERITY_STYLES.critical).toBeDefined()
  })

  it('each entry has icon, bg, text, and border fields', () => {
    for (const severity of ['info', 'warning', 'critical'] as const) {
      const style = SEVERITY_STYLES[severity]
      expect(typeof style.icon).toBe('string')
      expect(typeof style.bg).toBe('string')
      expect(typeof style.text).toBe('string')
      expect(typeof style.border).toBe('string')
    }
  })
})

describe('TYPE_LABELS', () => {
  it('has a label for every notification type', () => {
    for (const t of ALL_NOTIFICATION_TYPES) {
      expect(TYPE_LABELS[t]).toBeDefined()
      expect(typeof TYPE_LABELS[t]).toBe('string')
      expect(TYPE_LABELS[t].length).toBeGreaterThan(0)
    }
  })

  it('label values are non-empty strings', () => {
    for (const label of Object.values(TYPE_LABELS)) {
      expect(typeof label).toBe('string')
      expect(label.trim().length).toBeGreaterThan(0)
    }
  })
})
