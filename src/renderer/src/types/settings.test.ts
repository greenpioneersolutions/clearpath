import {
  DEFAULT_SETTINGS,
  COPILOT_MODELS,
  CLAUDE_MODELS,
  ENV_VARS,
} from './settings'

describe('DEFAULT_SETTINGS', () => {
  it('is defined and has required keys', () => {
    expect(DEFAULT_SETTINGS).toBeDefined()
    expect(DEFAULT_SETTINGS.flags).toBeDefined()
    expect(DEFAULT_SETTINGS.model).toBeDefined()
    expect(DEFAULT_SETTINGS.verbose).toBe(false)
    expect(DEFAULT_SETTINGS.envVars).toBeDefined()
  })

  it('has null budget and turns by default', () => {
    expect(DEFAULT_SETTINGS.maxBudgetUsd).toBeNull()
    expect(DEFAULT_SETTINGS.maxTurns).toBeNull()
  })

  it('has empty model defaults', () => {
    expect(DEFAULT_SETTINGS.model.copilot).toBe('')
    expect(DEFAULT_SETTINGS.model.claude).toBe('')
  })
})

describe('COPILOT_MODELS', () => {
  it('is a non-empty array', () => {
    expect(COPILOT_MODELS.length).toBeGreaterThan(0)
  })

  it('each model has required fields', () => {
    for (const m of COPILOT_MODELS) {
      expect(typeof m.id).toBe('string')
      expect(m.id.length).toBeGreaterThan(0)
      expect(typeof m.label).toBe('string')
      expect(typeof m.provider).toBe('string')
      expect(m.cli).toBe('copilot')
      expect(typeof m.costTier).toBe('string')
      expect(typeof m.description).toBe('string')
    }
  })

  it('has no duplicate ids', () => {
    const ids = COPILOT_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has exactly one default model', () => {
    const defaults = COPILOT_MODELS.filter((m) => m.isDefault)
    expect(defaults.length).toBe(1)
  })
})

describe('CLAUDE_MODELS', () => {
  it('is a non-empty array', () => {
    expect(CLAUDE_MODELS.length).toBeGreaterThan(0)
  })

  it('each model has required fields', () => {
    for (const m of CLAUDE_MODELS) {
      expect(typeof m.id).toBe('string')
      expect(m.id.length).toBeGreaterThan(0)
      expect(typeof m.label).toBe('string')
      expect(typeof m.provider).toBe('string')
      expect(m.cli).toBe('claude')
      expect(typeof m.costTier).toBe('string')
      expect(typeof m.description).toBe('string')
    }
  })

  it('has no duplicate ids', () => {
    const ids = CLAUDE_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has exactly one default model', () => {
    const defaults = CLAUDE_MODELS.filter((m) => m.isDefault)
    expect(defaults.length).toBe(1)
  })
})

describe('ENV_VARS', () => {
  it('is a non-empty array', () => {
    expect(ENV_VARS.length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    for (const v of ENV_VARS) {
      expect(typeof v.key).toBe('string')
      expect(v.key.length).toBeGreaterThan(0)
      expect(typeof v.label).toBe('string')
      expect(typeof v.description).toBe('string')
      expect(typeof v.isSensitive).toBe('boolean')
      expect(['copilot', 'claude', 'both']).toContain(v.cli)
    }
  })

  it('has no duplicate keys', () => {
    const keys = ENV_VARS.map((v) => v.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
