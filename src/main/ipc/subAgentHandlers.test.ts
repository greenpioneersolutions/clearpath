import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const { mockResolveInShell } = vi.hoisted(() => ({
  mockResolveInShell: vi.fn(),
}))

vi.mock('../utils/shellEnv', () => ({
  resolveInShell: mockResolveInShell,
  getScopedSpawnEnv: vi.fn().mockReturnValue({ PATH: '/usr/bin' }),
}))

vi.mock('../utils/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}))

import { ipcMain } from 'electron'

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerCallback = (event: unknown, args?: unknown) => unknown

function getHandler(channel: string): HandlerCallback {
  const calls = vi.mocked(ipcMain.handle).mock.calls
  const match = calls.find((c) => c[0] === channel)
  if (!match) throw new Error(`No handler registered for channel: ${channel}`)
  return match[1] as HandlerCallback
}

const mockEvent = {}

function createMockCLIManager() {
  return {
    spawnSubAgent: vi.fn().mockResolvedValue({ id: 'sa-1', name: 'test', status: 'running' }),
    listSubAgents: vi.fn().mockReturnValue([]),
    getSubAgentOutput: vi.fn().mockReturnValue([]),
    killSubAgent: vi.fn().mockReturnValue(true),
    pauseSubAgent: vi.fn().mockReturnValue(true),
    resumeSubAgent: vi.fn().mockReturnValue(true),
    killAllSubAgents: vi.fn().mockReturnValue(0),
    sendSlashCommand: vi.fn(),
  }
}

// Dynamic imports after resetModules
let registerSubAgentHandlers: typeof import('./subAgentHandlers').registerSubAgentHandlers
let checkRateLimit: typeof import('../utils/rateLimiter').checkRateLimit

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('subAgentHandlers', () => {
  let mockCLI: ReturnType<typeof createMockCLIManager>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(ipcMain.handle).mockClear()
    vi.resetModules()

    const mod = await import('./subAgentHandlers')
    registerSubAgentHandlers = mod.registerSubAgentHandlers

    const rlMod = await import('../utils/rateLimiter')
    checkRateLimit = rlMod.checkRateLimit

    mockCLI = createMockCLIManager()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSubAgentHandlers(ipcMain, mockCLI as any)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('handler registration', () => {
    it('registers all expected channels', () => {
      const registered = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0])
      expect(registered).toEqual(expect.arrayContaining([
        'subagent:spawn',
        'subagent:list',
        'subagent:get-output',
        'subagent:kill',
        'subagent:pause',
        'subagent:resume',
        'subagent:kill-all',
        'subagent:pop-out',
        'subagent:fleet-status',
        'subagent:check-queue-installed',
      ]))
      expect(registered).toHaveLength(10)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:spawn
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:spawn', () => {
    it('delegates to cliManager.spawnSubAgent', async () => {
      const args = {
        name: 'test-agent',
        cli: 'copilot' as const,
        prompt: 'do something',
        model: 'claude-sonnet',
        workingDirectory: '/tmp',
      }

      const handler = getHandler('subagent:spawn')
      const result = await handler(mockEvent, args)

      // Handler migrates the legacy backend id before delegating.
      expect(mockCLI.spawnSubAgent).toHaveBeenCalledWith({ ...args, cli: 'copilot-cli' })
      expect(result).toEqual({ id: 'sa-1', name: 'test', status: 'running' })
    })

    it('returns rate limit error when throttled', async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterMs: 5000 })

      const handler = getHandler('subagent:spawn')
      const result = await handler(mockEvent, {
        name: 'test', cli: 'copilot', prompt: 'go',
      })

      expect(result).toEqual({ error: 'Rate limited — try again in 5s' })
      expect(mockCLI.spawnSubAgent).not.toHaveBeenCalled()
    })

    it('rounds up retry time to nearest second', async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterMs: 1200 })

      const handler = getHandler('subagent:spawn')
      const result = await handler(mockEvent, {
        name: 'test', cli: 'claude', prompt: 'go',
      })

      expect(result).toEqual({ error: 'Rate limited — try again in 2s' })
    })

    it('handles zero retryAfterMs', async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterMs: 0 })

      const handler = getHandler('subagent:spawn')
      const result = await handler(mockEvent, {
        name: 'test', cli: 'copilot', prompt: 'go',
      })

      expect(result).toEqual({ error: 'Rate limited — try again in 0s' })
    })

    it('handles undefined retryAfterMs', async () => {
      vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false })

      const handler = getHandler('subagent:spawn')
      const result = await handler(mockEvent, {
        name: 'test', cli: 'copilot', prompt: 'go',
      })

      // (rl.retryAfterMs ?? 0) / 1000 => 0, ceil => 0
      expect(result).toEqual({ error: 'Rate limited — try again in 0s' })
    })

    it('passes all optional fields', async () => {
      const args = {
        name: 'full-agent',
        cli: 'claude' as const,
        prompt: 'analyze codebase',
        model: 'opus',
        workingDirectory: '/project',
        permissionMode: 'auto',
        agent: 'my-agent',
        allowedTools: ['Read', 'Edit'],
        maxBudget: 5.0,
        maxTurns: 10,
      }

      const handler = getHandler('subagent:spawn')
      await handler(mockEvent, args)

      // Handler migrates the legacy backend id before delegating.
      expect(mockCLI.spawnSubAgent).toHaveBeenCalledWith({ ...args, cli: 'claude-cli' })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:list
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:list', () => {
    it('delegates to cliManager.listSubAgents', () => {
      const agents = [
        { id: '1', name: 'agent-a', status: 'running' },
        { id: '2', name: 'agent-b', status: 'completed' },
      ]
      mockCLI.listSubAgents.mockReturnValue(agents)

      const handler = getHandler('subagent:list')
      const result = handler(mockEvent)

      expect(result).toEqual(agents)
      expect(mockCLI.listSubAgents).toHaveBeenCalled()
    })

    it('returns empty array when no sub-agents', () => {
      const handler = getHandler('subagent:list')
      const result = handler(mockEvent)

      expect(result).toEqual([])
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:get-output
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:get-output', () => {
    it('delegates to cliManager.getSubAgentOutput', () => {
      const output = [{ type: 'text', content: 'hello' }]
      mockCLI.getSubAgentOutput.mockReturnValue(output)

      const handler = getHandler('subagent:get-output')
      const result = handler(mockEvent, { id: 'sa-1' })

      expect(mockCLI.getSubAgentOutput).toHaveBeenCalledWith('sa-1')
      expect(result).toEqual(output)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:kill
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:kill', () => {
    it('delegates to cliManager.killSubAgent', () => {
      const handler = getHandler('subagent:kill')
      const result = handler(mockEvent, { id: 'sa-1' })

      expect(mockCLI.killSubAgent).toHaveBeenCalledWith('sa-1')
      expect(result).toBe(true)
    })

    it('returns false when agent not found', () => {
      mockCLI.killSubAgent.mockReturnValue(false)

      const handler = getHandler('subagent:kill')
      const result = handler(mockEvent, { id: 'nonexistent' })

      expect(result).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:pause
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:pause', () => {
    it('delegates to cliManager.pauseSubAgent', () => {
      const handler = getHandler('subagent:pause')
      const result = handler(mockEvent, { id: 'sa-1' })

      expect(mockCLI.pauseSubAgent).toHaveBeenCalledWith('sa-1')
      expect(result).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:resume
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:resume', () => {
    it('delegates to cliManager.resumeSubAgent with prompt', () => {
      const handler = getHandler('subagent:resume')
      const result = handler(mockEvent, { id: 'sa-1', prompt: 'continue' })

      expect(mockCLI.resumeSubAgent).toHaveBeenCalledWith('sa-1', 'continue')
      expect(result).toBe(true)
    })

    it('delegates without prompt', () => {
      const handler = getHandler('subagent:resume')
      handler(mockEvent, { id: 'sa-1' })

      expect(mockCLI.resumeSubAgent).toHaveBeenCalledWith('sa-1', undefined)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:kill-all
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:kill-all', () => {
    it('delegates to cliManager.killAllSubAgents', () => {
      mockCLI.killAllSubAgents.mockReturnValue(3)

      const handler = getHandler('subagent:kill-all')
      const result = handler(mockEvent)

      expect(mockCLI.killAllSubAgents).toHaveBeenCalled()
      expect(result).toBe(3)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:pop-out
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:pop-out', () => {
    it('returns an object with windowId', () => {
      const handler = getHandler('subagent:pop-out')
      const result = handler(mockEvent, { id: 'sa-1', name: 'My Agent' }) as { windowId: unknown }

      expect(result).toHaveProperty('windowId')
    })

    it('loads dev URL when ELECTRON_RENDERER_URL is set', () => {
      const original = process.env['ELECTRON_RENDERER_URL']
      process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173'

      const handler = getHandler('subagent:pop-out')
      const result = handler(mockEvent, { id: 'sa-1', name: 'Dev Agent' }) as { windowId: unknown }

      expect(result).toHaveProperty('windowId')

      process.env['ELECTRON_RENDERER_URL'] = original
    })

    it('loads file in production mode', () => {
      const original = process.env['ELECTRON_RENDERER_URL']
      delete process.env['ELECTRON_RENDERER_URL']

      const handler = getHandler('subagent:pop-out')
      const result = handler(mockEvent, { id: 'sa-1', name: 'Prod Agent' }) as { windowId: unknown }

      expect(result).toHaveProperty('windowId')

      process.env['ELECTRON_RENDERER_URL'] = original
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:fleet-status
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:fleet-status', () => {
    it('sends /fleet slash command and returns { sent: true }', async () => {
      const handler = getHandler('subagent:fleet-status')
      const result = await handler(mockEvent, { sessionId: 'session-1' })

      expect(mockCLI.sendSlashCommand).toHaveBeenCalledWith('session-1', '/fleet')
      expect(result).toEqual({ sent: true })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // subagent:check-queue-installed
  // ═══════════════════════════════════════════════════════════════════════════

  describe('subagent:check-queue-installed', () => {
    it('returns installed: true when claude-code-queue is found', async () => {
      mockResolveInShell.mockResolvedValue('/usr/local/bin/claude-code-queue')

      const handler = getHandler('subagent:check-queue-installed')
      const result = await handler(mockEvent)

      expect(mockResolveInShell).toHaveBeenCalledWith('claude-code-queue')
      expect(result).toEqual({
        installed: true,
        path: '/usr/local/bin/claude-code-queue',
      })
    })

    it('returns installed: false when claude-code-queue is not found', async () => {
      mockResolveInShell.mockResolvedValue(null)

      const handler = getHandler('subagent:check-queue-installed')
      const result = await handler(mockEvent)

      expect(result).toEqual({ installed: false, path: null })
    })
  })
})
