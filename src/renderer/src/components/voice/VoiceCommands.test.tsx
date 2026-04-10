// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { matchVoiceCommand, VOICE_COMMANDS } from './VoiceCommands'

describe('VoiceCommands', () => {
  it('exports an array of voice commands', () => {
    expect(VOICE_COMMANDS).toBeInstanceOf(Array)
    expect(VOICE_COMMANDS.length).toBeGreaterThan(0)
  })

  it('matches "start a new session" to navigate:/work', () => {
    const cmd = matchVoiceCommand('start a new session')
    expect(cmd).not.toBeNull()
    expect(cmd!.action).toBe('navigate:/work')
  })

  it('matches "new session" to navigate:/work', () => {
    const cmd = matchVoiceCommand('new session')
    expect(cmd).not.toBeNull()
    expect(cmd!.action).toBe('navigate:/work')
  })

  it('matches "switch to autopilot" to mode:autopilot', () => {
    const cmd = matchVoiceCommand('switch to autopilot')
    expect(cmd).not.toBeNull()
    expect(cmd!.action).toBe('mode:autopilot')
  })

  it('matches "kill all agents" to killall', () => {
    const cmd = matchVoiceCommand('kill all agents')
    expect(cmd).not.toBeNull()
    expect(cmd!.action).toBe('killall')
  })

  it('matches "show me the cost" to navigate:/insights', () => {
    const cmd = matchVoiceCommand('show me the cost')
    expect(cmd).not.toBeNull()
    expect(cmd!.action).toBe('navigate:/insights')
  })

  it('matches "go to settings" to navigate:/configure', () => {
    const cmd = matchVoiceCommand('go to settings')
    expect(cmd).not.toBeNull()
    expect(cmd!.action).toBe('navigate:/configure')
  })

  it('matches "go to dashboard" to navigate:/', () => {
    const cmd = matchVoiceCommand('go to dashboard')
    expect(cmd).not.toBeNull()
    expect(cmd!.action).toBe('navigate:/')
  })

  it('returns null for unrecognized commands', () => {
    const cmd = matchVoiceCommand('do something random and unmatched')
    expect(cmd).toBeNull()
  })

  it('is case insensitive', () => {
    const cmd = matchVoiceCommand('SWITCH TO AUTOPILOT')
    expect(cmd).not.toBeNull()
    expect(cmd!.action).toBe('mode:autopilot')
  })

  it('each command has patterns, action, and description', () => {
    for (const cmd of VOICE_COMMANDS) {
      expect(cmd.patterns).toBeInstanceOf(Array)
      expect(cmd.patterns.length).toBeGreaterThan(0)
      expect(typeof cmd.action).toBe('string')
      expect(typeof cmd.description).toBe('string')
    }
  })
})
