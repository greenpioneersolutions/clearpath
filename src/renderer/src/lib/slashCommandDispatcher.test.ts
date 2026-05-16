import { describe, it, expect, vi } from 'vitest'
import { dispatchSlashCommand, dispatchOrForward, type SlashDispatchHandlers } from './slashCommandDispatcher'

function makeHandlers(): SlashDispatchHandlers & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {
    onModelChange: [],
    onClear: [],
    onPermissions: [],
    onCost: [],
    onExit: [],
    onHelp: [],
    onConfig: [],
    onStatus: [],
    sendToCli: [],
  }
  const track = (name: string) => (...args: unknown[]) => { calls[name].push(args) }
  return {
    calls,
    onModelChange: vi.fn(track('onModelChange')),
    onClear: vi.fn(track('onClear')),
    onPermissions: vi.fn(track('onPermissions')),
    onCost: vi.fn(track('onCost')),
    onExit: vi.fn(track('onExit')),
    onHelp: vi.fn(track('onHelp')),
    onConfig: vi.fn(track('onConfig')),
    onStatus: vi.fn(track('onStatus')),
    sendToCli: vi.fn(track('sendToCli')),
  }
}

describe('dispatchSlashCommand', () => {
  it('returns false for non-slash input (caller forwards)', () => {
    const h = makeHandlers()
    expect(dispatchSlashCommand('hello world', h)).toBe(false)
    expect(h.calls.sendToCli).toHaveLength(0)
  })

  it('intercepts /model <name> and calls onModelChange with the arg', () => {
    const h = makeHandlers()
    expect(dispatchSlashCommand('/model gpt-5', h)).toBe(true)
    expect(h.calls.onModelChange).toEqual([['gpt-5']])
    expect(h.calls.sendToCli).toHaveLength(0)
  })

  it('handles /model with multi-token argument (preserves the rest verbatim)', () => {
    const h = makeHandlers()
    dispatchSlashCommand('/model claude-sonnet-4.5 extra junk', h)
    expect(h.calls.onModelChange).toEqual([['claude-sonnet-4.5 extra junk']])
  })

  it('emits a usage hint when /model is called with no arg', () => {
    const h = makeHandlers()
    expect(dispatchSlashCommand('/model', h)).toBe(true)
    expect(h.calls.onModelChange).toHaveLength(0)
    expect(h.calls.onStatus).toHaveLength(1)
    expect(h.calls.onStatus[0][0]).toMatch(/Usage:.*\/model <name>/)
  })

  it('intercepts /clear', () => {
    const h = makeHandlers()
    expect(dispatchSlashCommand('/clear', h)).toBe(true)
    expect(h.calls.onClear).toHaveLength(1)
  })

  it('intercepts /compact with an explainer status', () => {
    const h = makeHandlers()
    expect(dispatchSlashCommand('/compact', h)).toBe(true)
    expect(h.calls.onStatus).toHaveLength(1)
    expect(h.calls.onStatus[0][0]).toMatch(/automatically/i)
  })

  it('intercepts /permissions, /cost, /usage, /exit, /help, /config', () => {
    const h = makeHandlers()
    expect(dispatchSlashCommand('/permissions', h)).toBe(true)
    expect(dispatchSlashCommand('/cost', h)).toBe(true)
    expect(dispatchSlashCommand('/usage', h)).toBe(true)
    expect(dispatchSlashCommand('/exit', h)).toBe(true)
    expect(dispatchSlashCommand('/help', h)).toBe(true)
    expect(dispatchSlashCommand('/config', h)).toBe(true)
    expect(h.calls.onPermissions).toHaveLength(1)
    expect(h.calls.onCost).toHaveLength(2)
    expect(h.calls.onExit).toHaveLength(1)
    expect(h.calls.onHelp).toHaveLength(1)
    expect(h.calls.onConfig).toHaveLength(1)
  })

  it('matches commands case-insensitively', () => {
    const h = makeHandlers()
    dispatchSlashCommand('/CLEAR', h)
    dispatchSlashCommand('/Model gpt-5', h)
    expect(h.calls.onClear).toHaveLength(1)
    expect(h.calls.onModelChange).toEqual([['gpt-5']])
  })

  it('returns false for unknown slash commands so caller forwards them', () => {
    const h = makeHandlers()
    expect(dispatchSlashCommand('/review', h)).toBe(false)
    expect(dispatchSlashCommand('/context', h)).toBe(false)
    expect(dispatchSlashCommand('/login', h)).toBe(false)
    expect(h.calls.sendToCli).toHaveLength(0)
  })

  it('trims surrounding whitespace', () => {
    const h = makeHandlers()
    dispatchSlashCommand('   /clear   ', h)
    expect(h.calls.onClear).toHaveLength(1)
  })
})

describe('dispatchOrForward', () => {
  it('routes unknown slash commands to sendToCli verbatim', () => {
    const h = makeHandlers()
    dispatchOrForward('/review', h)
    expect(h.calls.sendToCli).toEqual([['/review']])
  })

  it('does NOT call sendToCli when the dispatcher handles the command locally', () => {
    const h = makeHandlers()
    dispatchOrForward('/model gpt-5', h)
    dispatchOrForward('/clear', h)
    dispatchOrForward('/compact', h)
    expect(h.calls.sendToCli).toHaveLength(0)
    expect(h.calls.onModelChange).toHaveLength(1)
    expect(h.calls.onClear).toHaveLength(1)
    expect(h.calls.onStatus).toHaveLength(1)
  })

  it('routes plain (non-slash) input to sendToCli — caller normally calls onSend for these, but dispatchOrForward is defensive', () => {
    const h = makeHandlers()
    dispatchOrForward('plain text', h)
    expect(h.calls.sendToCli).toEqual([['plain text']])
  })
})
