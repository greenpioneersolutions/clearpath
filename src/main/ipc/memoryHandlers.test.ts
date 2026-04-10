/**
 * Unit tests for memoryHandlers.ts — config file listing, read, write, delete
 * with path security validation, and memory entries listing.
 */

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockAssertPath, mockGetMemoryRoots, mockIsSensitive } = vi.hoisted(() => ({
  mockAssertPath: vi.fn().mockImplementation((p: string) => p),
  mockGetMemoryRoots: vi.fn().mockReturnValue(['/home/user/.claude', '/home/user/.copilot', '/mock/cwd']),
  mockIsSensitive: vi.fn().mockReturnValue(false),
}))

// ── vi.mock declarations ────────────────────────────────────────────────────

vi.mock('../utils/pathSecurity', () => ({
  assertPathWithinRoots: mockAssertPath,
  getMemoryAllowedRoots: mockGetMemoryRoots,
  isSensitiveSystemPath: mockIsSensitive,
}))

vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs')>()
  return {
    ...orig,
    readFileSync: vi.fn().mockReturnValue(''),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => false, mtimeMs: 1000 }),
    unlinkSync: vi.fn(),
  }
})

// ── Imports & helpers ───────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, mkdirSync } from 'fs'

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(mockIpcMain: { handle: ReturnType<typeof vi.fn> }): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of mockIpcMain.handle.mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('memoryHandlers', () => {
  let handlers: HandlerMap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let electronMod: any

  beforeAll(async () => {
    vi.resetModules()
    electronMod = await import('electron')
    const mod = await import('./memoryHandlers')
    mod.registerMemoryHandlers(electronMod.ipcMain)
    handlers = extractHandlers(electronMod.ipcMain)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertPath.mockImplementation((p: string) => p)
    mockGetMemoryRoots.mockReturnValue(['/home/user/.claude', '/home/user/.copilot', '/mock/cwd'])
    mockIsSensitive.mockReturnValue(false)
  })

  // ── Handler registration ──────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC channels', () => {
      const expected = [
        'memory:list-files', 'memory:read-file',
        'memory:write-file', 'memory:delete-file',
        'memory:list-memory-entries',
      ]
      for (const ch of expected) {
        expect(handlers[ch]).toBeDefined()
      }
    })
  })

  // ── memory:list-files ─────────────────────────────────────────────────

  describe('memory:list-files', () => {
    it('lists copilot config files for a working directory', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readdirSync).mockReturnValue([])

      const result = await handlers['memory:list-files'](
        {}, { cli: 'copilot', workingDirectory: '/project' },
      ) as Array<Record<string, unknown>>

      expect(result.length).toBeGreaterThan(0)
      // Should include AGENTS.md and settings files
      const agentsMd = result.find((f) => f.name === 'AGENTS.md')
      expect(agentsMd).toBeDefined()
      expect(agentsMd!.cli).toBe('copilot')
    })

    it('lists claude config files for a working directory', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readdirSync).mockReturnValue([])

      const result = await handlers['memory:list-files'](
        {}, { cli: 'claude', workingDirectory: '/project' },
      ) as Array<Record<string, unknown>>

      const claudeMd = result.find((f) => f.name === 'CLAUDE.md')
      expect(claudeMd).toBeDefined()
      expect(claudeMd!.cli).toBe('claude')
    })

    it('includes existing .md files from claude agent directories', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readdirSync).mockImplementation((dir: string) => {
        if (typeof dir === 'string' && dir.endsWith('/agents')) {
          return ['my-agent.md'] as unknown as ReturnType<typeof readdirSync>
        }
        return [] as unknown as ReturnType<typeof readdirSync>
      })

      const result = await handlers['memory:list-files'](
        {}, { cli: 'claude', workingDirectory: '/project' },
      ) as Array<Record<string, unknown>>

      const agentFile = result.find((f) => f.name === 'my-agent.md')
      expect(agentFile).toBeDefined()
      expect(agentFile!.category).toBe('agent')
    })

    it('includes copilot .agent.md files from .github/agents', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readdirSync).mockImplementation((dir: string) => {
        if (typeof dir === 'string' && dir.endsWith('/agents')) {
          return ['reviewer.agent.md'] as unknown as ReturnType<typeof readdirSync>
        }
        return [] as unknown as ReturnType<typeof readdirSync>
      })

      const result = await handlers['memory:list-files'](
        {}, { cli: 'copilot', workingDirectory: '/project' },
      ) as Array<Record<string, unknown>>

      const agentFile = result.find((f) => f.name === 'reviewer.agent.md')
      expect(agentFile).toBeDefined()
      expect(agentFile!.category).toBe('agent')
    })
  })

  // ── memory:read-file ──────────────────────────────────────────────────

  describe('memory:read-file', () => {
    it('reads a file within allowed roots', async () => {
      vi.mocked(readFileSync).mockReturnValue('file content here')

      const result = await handlers['memory:read-file'](
        {}, { path: '/home/user/.claude/CLAUDE.md' },
      ) as Record<string, unknown>

      expect(result.content).toBe('file content here')
      expect(mockAssertPath).toHaveBeenCalledWith(
        '/home/user/.claude/CLAUDE.md',
        expect.any(Array),
      )
    })

    it('returns error when path is outside allowed roots', async () => {
      mockAssertPath.mockImplementation(() => {
        throw new Error('Path not allowed: /etc/passwd')
      })

      const result = await handlers['memory:read-file'](
        {}, { path: '/etc/passwd' },
      ) as Record<string, unknown>

      expect(result.error).toContain('Path not allowed')
    })

    it('returns error when file is not found', async () => {
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT') })

      const result = await handlers['memory:read-file'](
        {}, { path: '/home/user/.claude/missing.md' },
      ) as Record<string, unknown>

      expect(result.error).toContain('File not found')
    })
  })

  // ── memory:write-file ─────────────────────────────────────────────────

  describe('memory:write-file', () => {
    it('writes a file within allowed roots', async () => {
      const result = await handlers['memory:write-file'](
        {}, { path: '/home/user/.claude/CLAUDE.md', content: 'new content' },
      ) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(mkdirSync).toHaveBeenCalled()
      expect(writeFileSync).toHaveBeenCalledWith(
        '/home/user/.claude/CLAUDE.md', 'new content', 'utf8',
      )
    })

    it('blocks writes to sensitive system paths', async () => {
      mockIsSensitive.mockReturnValue(true)

      const result = await handlers['memory:write-file'](
        {}, { path: '/home/user/.ssh/id_rsa', content: 'malicious' },
      ) as Record<string, unknown>

      expect(result.error).toContain('Cannot write to sensitive')
      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('blocks writes outside allowed roots', async () => {
      mockAssertPath.mockImplementation(() => {
        throw new Error('Path not allowed')
      })

      const result = await handlers['memory:write-file'](
        {}, { path: '/etc/shadow', content: 'x' },
      ) as Record<string, unknown>

      expect(result.error).toContain('Path not allowed')
      expect(writeFileSync).not.toHaveBeenCalled()
    })
  })

  // ── memory:delete-file ────────────────────────────────────────────────

  describe('memory:delete-file', () => {
    it('deletes a file within allowed roots', async () => {
      const result = await handlers['memory:delete-file'](
        {}, { path: '/home/user/.claude/old.md' },
      ) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(unlinkSync).toHaveBeenCalledWith('/home/user/.claude/old.md')
    })

    it('blocks deletion of sensitive system paths', async () => {
      mockIsSensitive.mockReturnValue(true)

      const result = await handlers['memory:delete-file'](
        {}, { path: '/home/user/.ssh/id_rsa' },
      ) as Record<string, unknown>

      expect(result.error).toContain('Cannot delete sensitive')
      expect(unlinkSync).not.toHaveBeenCalled()
    })

    it('blocks deletion outside allowed roots', async () => {
      mockAssertPath.mockImplementation(() => {
        throw new Error('Path not allowed')
      })

      const result = await handlers['memory:delete-file'](
        {}, { path: '/etc/important' },
      ) as Record<string, unknown>

      expect(result.error).toContain('Path not allowed')
    })

    it('returns error when file does not exist', async () => {
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory')
      })

      const result = await handlers['memory:delete-file'](
        {}, { path: '/home/user/.claude/gone.md' },
      ) as Record<string, unknown>

      expect(result.error).toContain('ENOENT')
    })
  })

  // ── memory:list-memory-entries ─────────────────────────────────────────

  describe('memory:list-memory-entries', () => {
    it('lists claude memory entries from ~/.claude/projects', async () => {
      vi.mocked(readdirSync).mockImplementation((dir: string) => {
        if (typeof dir === 'string' && dir.endsWith('/projects')) {
          return ['project-hash-1'] as unknown as ReturnType<typeof readdirSync>
        }
        if (typeof dir === 'string' && dir.endsWith('/memory')) {
          return ['note.md'] as unknown as ReturnType<typeof readdirSync>
        }
        return [] as unknown as ReturnType<typeof readdirSync>
      })
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
        mtimeMs: 5000,
      } as unknown as ReturnType<typeof statSync>)
      vi.mocked(readFileSync).mockReturnValue(
        '---\ntype: user\ndescription: test entry\n---\nContent here',
      )

      const result = await handlers['memory:list-memory-entries'](
        {}, { cli: 'claude' },
      ) as Array<Record<string, unknown>>

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe('user')
      expect(result[0].description).toBe('test entry')
    })

    it('lists copilot memory entries from ~/.copilot', async () => {
      vi.mocked(readdirSync).mockReturnValue(
        ['memory.md', 'other.txt'] as unknown as ReturnType<typeof readdirSync>,
      )
      vi.mocked(readFileSync).mockReturnValue('Some copilot memory content')
      vi.mocked(statSync).mockReturnValue({ mtimeMs: 3000 } as ReturnType<typeof statSync>)

      const result = await handlers['memory:list-memory-entries'](
        {}, { cli: 'copilot' },
      ) as Array<Record<string, unknown>>

      // Only .md files should be included
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('memory')
      expect(result[0].type).toBe('unknown')
    })

    it('returns empty array when no entries exist', async () => {
      vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>)

      const result = await handlers['memory:list-memory-entries'](
        {}, { cli: 'claude' },
      ) as Array<Record<string, unknown>>

      expect(result).toEqual([])
    })

    it('sorts entries by modifiedAt descending', async () => {
      vi.mocked(readdirSync).mockReturnValue(
        ['old.md', 'new.md'] as unknown as ReturnType<typeof readdirSync>,
      )
      vi.mocked(readFileSync).mockReturnValue('content')
      let callCount = 0
      vi.mocked(statSync).mockImplementation(() => {
        callCount++
        return { mtimeMs: callCount === 1 ? 1000 : 5000 } as ReturnType<typeof statSync>
      })

      const result = await handlers['memory:list-memory-entries'](
        {}, { cli: 'copilot' },
      ) as Array<Record<string, unknown>>

      expect(result).toHaveLength(2)
      // Newer entry (higher mtimeMs) should be first
      expect((result[0].modifiedAt as number)).toBeGreaterThanOrEqual(
        result[1].modifiedAt as number,
      )
    })
  })
})
