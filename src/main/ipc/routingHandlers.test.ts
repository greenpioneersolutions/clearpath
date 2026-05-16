import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../utils/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { registerRoutingHandlers } from './routingHandlers'
import { DEFAULT_ROUTING_RULES, type RoutingRules } from '../routing/RoutingRules'

function createMockIpcMain() {
  return {
    handle: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
  }
}

function getHandler(ipcMain: ReturnType<typeof createMockIpcMain>, channel: string) {
  const call = ipcMain.handle.mock.calls.find((c: unknown[]) => c[0] === channel)
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

const mockEvent = {} as unknown

describe('registerRoutingHandlers', () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>
  let currentRules: RoutingRules

  beforeEach(() => {
    ipcMain = createMockIpcMain()
    currentRules = { ...DEFAULT_ROUTING_RULES, enabled: true }
    registerRoutingHandlers(ipcMain as never, { getRules: () => currentRules })
  })

  it('registers routing:classify', () => {
    const channels = ipcMain.handle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('routing:classify')
  })

  it('returns classification + routedModel for a trivial copilot prompt', () => {
    const handler = getHandler(ipcMain, 'routing:classify')
    const result = handler(mockEvent, {
      userText: 'What time is it?',
      promptTokens: 5,
      hasAttachments: false,
      attachmentCount: 0,
      hasSlashCommand: false,
      isContinuation: false,
      cli: 'copilot-cli',
    }) as { classification: { difficulty: string }; routedModel: string; enabled: boolean }

    expect(result.classification.difficulty).toBe('trivial')
    expect(result.routedModel).toBe(DEFAULT_ROUTING_RULES.copilot.trivial)
    expect(result.enabled).toBe(true)
  })

  it('returns enabled:false when rules are disabled', () => {
    currentRules = { ...DEFAULT_ROUTING_RULES, enabled: false }
    const handler = getHandler(ipcMain, 'routing:classify')
    const result = handler(mockEvent, {
      userText: 'hi', promptTokens: 1, hasAttachments: false,
      hasSlashCommand: false, isContinuation: false, cli: 'copilot-cli',
    }) as { enabled: boolean; routedModel: string }
    expect(result.enabled).toBe(false)
    // Still returns a routedModel so the chip can preview what it WOULD pick.
    expect(result.routedModel).toBeTruthy()
  })

  it('uses claude tier for claude CLI', () => {
    const handler = getHandler(ipcMain, 'routing:classify')
    const result = handler(mockEvent, {
      userText: 'Refactor the auth middleware everywhere',
      promptTokens: 10,
      hasAttachments: false,
      hasSlashCommand: false,
      isContinuation: false,
      cli: 'claude-cli',
    }) as { classification: { difficulty: string }; routedModel: string }
    expect(result.classification.difficulty).toBe('hard')
    expect(result.routedModel).toBe(DEFAULT_ROUTING_RULES.claude.hard)
  })

  it('coerces malformed inputs to safe defaults', () => {
    const handler = getHandler(ipcMain, 'routing:classify')
    const result = handler(mockEvent, {
      userText: 'hello',
      promptTokens: -5,         // negative — should clamp to 0
      attachmentCount: -1,
      hasAttachments: false,
      hasSlashCommand: false,
      isContinuation: false,
      cli: 'copilot-cli',
    }) as { classification: { difficulty: string }; routedModel: string }
    expect(result.classification.difficulty).toBeDefined()
    expect(result.routedModel).toBeTruthy()
  })
})
