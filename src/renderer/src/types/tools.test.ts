import { createDefaultPermissionConfig } from './tools'

describe('createDefaultPermissionConfig', () => {
  it('returns a valid config for copilot', () => {
    const config = createDefaultPermissionConfig('copilot')
    expect(config.cli).toBe('copilot')
    expect(config.copilotPreset).toBe('default')
    expect(config.claudePermissionMode).toBeUndefined()
    expect(config.allowedTools).toEqual([])
    expect(config.disallowedTools).toEqual([])
    expect(config.deniedTools).toEqual([])
    expect(config.availableTools).toEqual([])
    expect(config.excludedTools).toEqual([])
  })

  it('returns a valid config for claude', () => {
    const config = createDefaultPermissionConfig('claude')
    expect(config.cli).toBe('claude')
    expect(config.claudePermissionMode).toBe('default')
    expect(config.copilotPreset).toBeUndefined()
    expect(config.allowedTools).toEqual([])
    expect(config.disallowedTools).toEqual([])
    expect(config.deniedTools).toEqual([])
    expect(config.availableTools).toEqual([])
    expect(config.excludedTools).toEqual([])
  })

  it('returns distinct objects on each call', () => {
    const a = createDefaultPermissionConfig('copilot')
    const b = createDefaultPermissionConfig('copilot')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
