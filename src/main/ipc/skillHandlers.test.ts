import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockGet,
  mockSet,
  existsSyncMock,
  readFileSyncMock,
  writeFileSyncMock,
  mkdirSyncMock,
  readdirSyncMock,
  statSyncMock,
  renameSyncMock,
  unlinkSyncMock,
  copyFileSyncMock,
  homedirMock,
  randomUUIDMock,
  showSaveDialogMock,
  showOpenDialogMock,
  assertPathWithinRootsMock,
  isSensitiveSystemPathMock,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  existsSyncMock: vi.fn().mockReturnValue(false),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readdirSyncMock: vi.fn().mockReturnValue([]),
  statSyncMock: vi.fn().mockReturnValue({ isDirectory: () => false, mtimeMs: 1000 }),
  renameSyncMock: vi.fn(),
  unlinkSyncMock: vi.fn(),
  copyFileSyncMock: vi.fn(),
  homedirMock: vi.fn().mockReturnValue('/mock/home'),
  randomUUIDMock: vi.fn().mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  showSaveDialogMock: vi.fn().mockResolvedValue({ canceled: true }),
  showOpenDialogMock: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  assertPathWithinRootsMock: vi.fn(),
  isSensitiveSystemPathMock: vi.fn().mockReturnValue(false),
}))

vi.mock('electron-store', () => ({
  default: class MockStore {
    constructor() {}
    get = mockGet
    set = mockSet
  },
}))

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('../utils/pathSecurity', () => ({
  assertPathWithinRoots: assertPathWithinRootsMock,
  isSensitiveSystemPath: isSensitiveSystemPathMock,
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
  mkdirSync: mkdirSyncMock,
  readdirSync: readdirSyncMock,
  statSync: statSyncMock,
  renameSync: renameSyncMock,
  unlinkSync: unlinkSyncMock,
  copyFileSync: copyFileSyncMock,
}))

vi.mock('os', () => ({
  homedir: homedirMock,
}))

vi.mock('crypto', () => ({
  randomUUID: randomUUIDMock,
}))

vi.mock('electron', async () => {
  const actual = await vi.importActual<typeof import('electron')>('electron')
  return {
    ...actual,
    dialog: {
      showSaveDialog: showSaveDialogMock,
      showOpenDialog: showOpenDialogMock,
    },
  }
})

vi.mock('../starter-pack', () => ({
  STARTER_SKILLS: [
    {
      id: 'starter-skill-1',
      name: 'Starter Skill One',
      description: 'A starter skill',
      skillPrompt: 'Do starter things',
    },
  ],
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => unknown

function extractHandlers(ipcMainMock: { handle: ReturnType<typeof vi.fn> }): Map<string, HandlerFn> {
  const map = new Map<string, HandlerFn>()
  for (const call of ipcMainMock.handle.mock.calls) {
    map.set(call[0] as string, call[1] as HandlerFn)
  }
  return map
}

const mockEvent = {}

function makeSkillMd(opts: { name?: string; description?: string; globs?: string; tools?: string; model?: string } = {}): string {
  const lines = ['---']
  if (opts.name) lines.push(`name: ${opts.name}`)
  if (opts.description) lines.push(`description: ${opts.description}`)
  if (opts.globs) lines.push(`globs: ${opts.globs}`)
  if (opts.tools) lines.push(`tools: ${opts.tools}`)
  if (opts.model) lines.push(`model: ${opts.model}`)
  lines.push('---', '', 'Skill body content')
  return lines.join('\n')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('skillHandlers', () => {
  let handlers: Map<string, HandlerFn>
  let ipcMainMock: { handle: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    // Defaults
    existsSyncMock.mockReturnValue(false)
    readdirSyncMock.mockReturnValue([])
    homedirMock.mockReturnValue('/mock/home')
    mockGet.mockImplementation((key: string) => {
      const defaults: Record<string, unknown> = {
        usageStats: {},
        recommendations: [],
        sharedFolderPath: null,
      }
      return defaults[key] ?? null
    })

    ipcMainMock = { handle: vi.fn() }

    const mod = await import('./skillHandlers')
    mod.registerSkillHandlers(ipcMainMock as never)
    handlers = extractHandlers(ipcMainMock)
  })

  // ── Registration ──────────────────────────────────────────────────────────

  it('registers all expected IPC channels', () => {
    const expected = [
      'skills:list',
      'skills:get',
      'skills:save',
      'skills:toggle',
      'skills:delete',
      'skills:record-usage',
      'skills:get-usage-stats',
      'skills:get-starters',
      'skills:export',
      'skills:import',
    ]
    for (const channel of expected) {
      expect(handlers.has(channel), `missing handler for ${channel}`).toBe(true)
    }
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(expected.length)
  })

  // ── skills:list ───────────────────────────────────────────────────────────

  describe('skills:list', () => {
    it('returns empty array when no skill directories exist', () => {
      const result = handlers.get('skills:list')!(mockEvent, { workingDirectory: '/project' })
      expect(result).toEqual([])
    })

    it('discovers SKILL.md files in project claude skills directory', () => {
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/project/.claude/skills') return true
        return false
      })
      readdirSyncMock.mockImplementation((p: string) => {
        if (p === '/project/.claude/skills') return ['my-skill']
        return []
      })
      statSyncMock.mockImplementation((p: string) => {
        if (p === '/project/.claude/skills/my-skill') return { isDirectory: () => true, mtimeMs: 2000 }
        if (p === '/project/.claude/skills/my-skill/SKILL.md') return { isDirectory: () => false, mtimeMs: 2000 }
        return { isDirectory: () => false, mtimeMs: 1000 }
      })
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/project/.claude/skills') return true
        if (p === '/project/.claude/skills/my-skill/SKILL.md') return true
        return false
      })
      readFileSyncMock.mockReturnValue(makeSkillMd({ name: 'My Skill', description: 'Does things' }))

      const result = handlers.get('skills:list')!(mockEvent, { workingDirectory: '/project' }) as {
        id: string; name: string; scope: string; cli: string; enabled: boolean
      }[]

      expect(result.length).toBeGreaterThanOrEqual(1)
      const skill = result.find((s) => s.name === 'My Skill')
      expect(skill).toBeTruthy()
      expect(skill!.scope).toBe('project')
      expect(skill!.cli).toBe('claude')
      expect(skill!.enabled).toBe(true)
    })

    it('detects disabled skills (SKILL.md.disabled)', () => {
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/project/.claude/skills') return true
        if (p === '/project/.claude/skills/my-skill/SKILL.md') return false
        if (p === '/project/.claude/skills/my-skill/SKILL.md.disabled') return true
        return false
      })
      readdirSyncMock.mockImplementation((p: string) => {
        if (p === '/project/.claude/skills') return ['my-skill']
        return []
      })
      statSyncMock.mockImplementation((p: string) => {
        if (p === '/project/.claude/skills/my-skill') return { isDirectory: () => true, mtimeMs: 1000 }
        return { isDirectory: () => false, mtimeMs: 1000 }
      })
      readFileSyncMock.mockReturnValue(makeSkillMd({ name: 'Disabled Skill' }))

      const result = handlers.get('skills:list')!(mockEvent, { workingDirectory: '/project' }) as {
        enabled: boolean; name: string
      }[]
      const skill = result.find((s) => s.name === 'Disabled Skill')
      expect(skill).toBeTruthy()
      expect(skill!.enabled).toBe(false)
    })

    it('discovers SKILL.MD at root of skills dir (not in subdirectory)', () => {
      existsSyncMock.mockImplementation((p: string) => {
        if (p === '/project/.claude/skills') return true
        return false
      })
      readdirSyncMock.mockImplementation((p: string) => {
        if (p === '/project/.claude/skills') return ['SKILL.MD']
        return []
      })
      // The entry is not a directory but is a SKILL.MD file directly
      statSyncMock.mockImplementation(() => ({ isDirectory: () => false, mtimeMs: 1000 }))
      readFileSyncMock.mockReturnValue(makeSkillMd({ name: 'Root Skill' }))

      const result = handlers.get('skills:list')!(mockEvent, { workingDirectory: '/project' }) as {
        name: string
      }[]
      const skill = result.find((s) => s.name === 'Root Skill')
      expect(skill).toBeTruthy()
    })
  })

  // ── skills:get ────────────────────────────────────────────────────────────

  describe('skills:get', () => {
    it('returns parsed skill content when path is valid', () => {
      existsSyncMock.mockReturnValue(true)
      readFileSyncMock.mockReturnValue(makeSkillMd({ name: 'Test', description: 'Desc' }))

      const result = handlers.get('skills:get')!(mockEvent, {
        path: '/mock/home/.claude/skills/test/SKILL.md',
      }) as { content: string; frontmatter: Record<string, unknown>; body: string }

      expect(result.content).toContain('Test')
      expect(result.frontmatter.name).toBe('Test')
      expect(result.body).toBe('Skill body content')
    })

    it('returns error when path fails security check', () => {
      assertPathWithinRootsMock.mockImplementation(() => {
        throw new Error('Path not allowed')
      })

      const result = handlers.get('skills:get')!(mockEvent, { path: '/etc/passwd' })
      expect(result).toEqual({ error: 'Path not allowed' })
    })

    it('returns error for sensitive system path', () => {
      assertPathWithinRootsMock.mockReturnValue(undefined) // doesn't throw
      isSensitiveSystemPathMock.mockReturnValue(true)

      const result = handlers.get('skills:get')!(mockEvent, { path: '/mock/home/.ssh/id_rsa' })
      expect(result).toEqual({ error: 'Access denied' })
    })

    it('returns error when file does not exist', () => {
      assertPathWithinRootsMock.mockReturnValue(undefined) // doesn't throw
      isSensitiveSystemPathMock.mockReturnValue(false)
      existsSyncMock.mockReturnValue(false)

      const result = handlers.get('skills:get')!(mockEvent, {
        path: '/mock/home/.claude/skills/missing/SKILL.md',
      })
      expect(result).toEqual({ error: 'Not found' })
    })
  })

  // ── skills:save ───────────────────────────────────────────────────────────

  describe('skills:save', () => {
    it('saves a new global claude skill', () => {
      const result = handlers.get('skills:save')!(mockEvent, {
        name: 'My New Skill',
        description: 'Does stuff',
        body: 'Skill instructions here',
        scope: 'global',
        cli: 'claude',
        workingDirectory: '/project',
      }) as { path: string; dirPath: string }

      expect(mkdirSyncMock).toHaveBeenCalledWith(
        '/mock/home/.claude/skills/my-new-skill',
        { recursive: true },
      )
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/mock/home/.claude/skills/my-new-skill/SKILL.md',
        expect.stringContaining('name: My New Skill'),
        'utf8',
      )
      expect(result.path).toBe('/mock/home/.claude/skills/my-new-skill/SKILL.md')
    })

    it('saves a project-scoped copilot skill', () => {
      handlers.get('skills:save')!(mockEvent, {
        name: 'Copilot Skill',
        description: 'For copilot',
        body: 'Instructions',
        scope: 'project',
        cli: 'copilot',
        workingDirectory: '/my/project',
      })

      expect(mkdirSyncMock).toHaveBeenCalledWith(
        '/my/project/.github/skills/copilot-skill',
        { recursive: true },
      )
    })

    it('saves a global copilot skill', () => {
      handlers.get('skills:save')!(mockEvent, {
        name: 'Global Copilot',
        description: 'For copilot globally',
        body: 'Instructions',
        scope: 'global',
        cli: 'copilot',
        workingDirectory: '/project',
      })

      expect(mkdirSyncMock).toHaveBeenCalledWith(
        '/mock/home/.copilot/skills/global-copilot',
        { recursive: true },
      )
    })

    it('saves a project-scoped claude skill', () => {
      handlers.get('skills:save')!(mockEvent, {
        name: 'Project Claude',
        description: 'desc',
        body: 'body',
        scope: 'project',
        cli: 'claude',
        workingDirectory: '/project',
      })

      expect(mkdirSyncMock).toHaveBeenCalledWith(
        '/project/.claude/skills/project-claude',
        { recursive: true },
      )
    })

    it('uses existingPath directory when editing', () => {
      handlers.get('skills:save')!(mockEvent, {
        name: 'Edited Skill',
        description: 'edited',
        body: 'edited body',
        scope: 'global',
        cli: 'claude',
        workingDirectory: '/project',
        existingPath: '/mock/home/.claude/skills/existing/SKILL.md',
      })

      expect(mkdirSyncMock).toHaveBeenCalledWith(
        '/mock/home/.claude/skills/existing',
        { recursive: true },
      )
    })

    it('includes globs in frontmatter when autoInvoke is true', () => {
      handlers.get('skills:save')!(mockEvent, {
        name: 'Auto Skill',
        description: 'auto invoke',
        body: 'do things',
        scope: 'global',
        cli: 'claude',
        workingDirectory: '/project',
        autoInvoke: true,
        globs: '**/*.ts',
      })

      const writtenContent = writeFileSyncMock.mock.calls[0][1] as string
      expect(writtenContent).toContain('globs: **/*.ts')
    })

    it('includes tools and model in frontmatter', () => {
      handlers.get('skills:save')!(mockEvent, {
        name: 'Full Skill',
        description: 'all fields',
        body: 'body',
        scope: 'global',
        cli: 'claude',
        workingDirectory: '/project',
        tools: ['Read', 'Edit'],
        model: 'opus',
      })

      const writtenContent = writeFileSyncMock.mock.calls[0][1] as string
      expect(writtenContent).toContain('tools: ["Read", "Edit"]')
      expect(writtenContent).toContain('model: opus')
    })

    it('strips leading/trailing hyphens from slug', () => {
      handlers.get('skills:save')!(mockEvent, {
        name: '--Dashed Name--',
        description: 'desc',
        body: 'body',
        scope: 'global',
        cli: 'claude',
        workingDirectory: '/project',
      })

      expect(mkdirSyncMock).toHaveBeenCalledWith(
        '/mock/home/.claude/skills/dashed-name',
        { recursive: true },
      )
    })
  })

  // ── skills:toggle ─────────────────────────────────────────────────────────

  describe('skills:toggle', () => {
    it('enables a disabled skill by renaming .disabled to normal', () => {
      existsSyncMock.mockImplementation((p: string) =>
        p === '/skills/test/SKILL.md.disabled' ? true : false,
      )

      const result = handlers.get('skills:toggle')!(mockEvent, {
        path: '/skills/test/SKILL.md.disabled',
        enabled: true,
      }) as { path: string }

      expect(renameSyncMock).toHaveBeenCalledWith(
        '/skills/test/SKILL.md.disabled',
        '/skills/test/SKILL.md',
      )
      expect(result.path).toBe('/skills/test/SKILL.md')
    })

    it('disables an enabled skill by appending .disabled', () => {
      existsSyncMock.mockImplementation((p: string) =>
        p === '/skills/test/SKILL.md' ? true : false,
      )

      const result = handlers.get('skills:toggle')!(mockEvent, {
        path: '/skills/test/SKILL.md',
        enabled: false,
      }) as { path: string }

      expect(renameSyncMock).toHaveBeenCalledWith(
        '/skills/test/SKILL.md',
        '/skills/test/SKILL.md.disabled',
      )
      expect(result.path).toBe('/skills/test/SKILL.md.disabled')
    })

    it('returns original path if file does not exist for enable', () => {
      existsSyncMock.mockReturnValue(false)

      const result = handlers.get('skills:toggle')!(mockEvent, {
        path: '/skills/test/SKILL.md',
        enabled: true,
      }) as { path: string }

      expect(renameSyncMock).not.toHaveBeenCalled()
      expect(result.path).toBe('/skills/test/SKILL.md')
    })

    it('returns original path if file does not exist for disable', () => {
      existsSyncMock.mockReturnValue(false)

      const result = handlers.get('skills:toggle')!(mockEvent, {
        path: '/skills/test/SKILL.md',
        enabled: false,
      }) as { path: string }

      expect(renameSyncMock).not.toHaveBeenCalled()
      expect(result.path).toBe('/skills/test/SKILL.md')
    })
  })

  // ── skills:delete ─────────────────────────────────────────────────────────

  describe('skills:delete', () => {
    it('deletes both SKILL.md and SKILL.md.disabled if they exist', () => {
      existsSyncMock.mockReturnValue(true)

      const result = handlers.get('skills:delete')!(mockEvent, {
        dirPath: '/skills/test',
      })

      expect(unlinkSyncMock).toHaveBeenCalledWith('/skills/test/SKILL.md')
      expect(unlinkSyncMock).toHaveBeenCalledWith('/skills/test/SKILL.md.disabled')
      expect(result).toEqual({ success: true })
    })

    it('only deletes files that exist', () => {
      existsSyncMock.mockImplementation((p: string) =>
        p === '/skills/test/SKILL.md' ? true : false,
      )

      handlers.get('skills:delete')!(mockEvent, { dirPath: '/skills/test' })

      expect(unlinkSyncMock).toHaveBeenCalledWith('/skills/test/SKILL.md')
      expect(unlinkSyncMock).toHaveBeenCalledTimes(1)
    })

    it('handles no files existing', () => {
      existsSyncMock.mockReturnValue(false)

      const result = handlers.get('skills:delete')!(mockEvent, { dirPath: '/skills/empty' })
      expect(result).toEqual({ success: true })
      expect(unlinkSyncMock).not.toHaveBeenCalled()
    })
  })

  // ── skills:record-usage ───────────────────────────────────────────────────

  describe('skills:record-usage', () => {
    it('creates new usage entry for first use', () => {
      mockGet.mockImplementation((key: string) =>
        key === 'usageStats' ? {} : null,
      )

      const result = handlers.get('skills:record-usage')!(mockEvent, {
        skillId: 'project:my-skill',
      }) as { count: number; lastUsed: number }

      expect(result.count).toBe(1)
      expect(result.lastUsed).toBeGreaterThan(0)
      expect(mockSet).toHaveBeenCalledWith('usageStats', expect.objectContaining({
        'project:my-skill': { count: 1, lastUsed: expect.any(Number) },
      }))
    })

    it('increments existing usage count', () => {
      mockGet.mockImplementation((key: string) =>
        key === 'usageStats'
          ? { 'project:my-skill': { count: 5, lastUsed: 1000 } }
          : null,
      )

      const result = handlers.get('skills:record-usage')!(mockEvent, {
        skillId: 'project:my-skill',
      }) as { count: number }

      expect(result.count).toBe(6)
    })
  })

  // ── skills:get-usage-stats ────────────────────────────────────────────────

  describe('skills:get-usage-stats', () => {
    it('returns stored usage stats', () => {
      const stats = { 'skill-a': { count: 10, lastUsed: 5000 } }
      mockGet.mockImplementation((key: string) =>
        key === 'usageStats' ? stats : null,
      )

      const result = handlers.get('skills:get-usage-stats')!(mockEvent)
      expect(result).toEqual(stats)
    })
  })

  // ── skills:get-starters ───────────────────────────────────────────────────

  describe('skills:get-starters', () => {
    it('returns merged starter pack skills and legacy starter templates', () => {
      const result = handlers.get('skills:get-starters')!(mockEvent) as {
        id: string; name: string; content?: string
      }[]

      expect(result.length).toBeGreaterThan(0)
      // Check our mocked starter pack skill is present
      const packSkill = result.find((s) => s.id === 'starter-skill-1')
      expect(packSkill).toBeTruthy()
      expect(packSkill!.content).toBe('Do starter things')

      // Legacy starter templates should also be present
      const legacySkill = result.find((s) => s.id === 'code-review')
      expect(legacySkill).toBeTruthy()
      expect(legacySkill!.name).toBe('Code Review Skill')
    })
  })

  // ── skills:export ─────────────────────────────────────────────────────────

  describe('skills:export', () => {
    it('returns error when file does not exist', async () => {
      existsSyncMock.mockReturnValue(false)

      const result = await handlers.get('skills:export')!(mockEvent, {
        path: '/missing/SKILL.md',
        name: 'Missing',
      })
      expect(result).toEqual({ error: 'File not found' })
    })

    it('returns canceled when dialog is canceled', async () => {
      existsSyncMock.mockReturnValue(true)
      readFileSyncMock.mockReturnValue('skill content')
      showSaveDialogMock.mockResolvedValue({ canceled: true })

      const result = await handlers.get('skills:export')!(mockEvent, {
        path: '/skills/test/SKILL.md',
        name: 'Test Skill',
      })
      expect(result).toEqual({ canceled: true })
    })

    it('exports skill file to selected path', async () => {
      existsSyncMock.mockReturnValue(true)
      readFileSyncMock.mockReturnValue('---\nname: Test\n---\nSkill body')
      showSaveDialogMock.mockResolvedValue({
        canceled: false,
        filePath: '/tmp/exported-skill.md',
      })

      const result = await handlers.get('skills:export')!(mockEvent, {
        path: '/skills/test/SKILL.md',
        name: 'Test Skill',
      }) as { exportedPath: string }

      expect(result.exportedPath).toBe('/tmp/exported-skill.md')
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/tmp/exported-skill.md',
        '---\nname: Test\n---\nSkill body',
        'utf8',
      )
    })
  })

  // ── skills:import ─────────────────────────────────────────────────────────

  describe('skills:import', () => {
    it('returns canceled when dialog is canceled', async () => {
      showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })

      const result = await handlers.get('skills:import')!(mockEvent, {
        scope: 'global',
        cli: 'claude',
        workingDirectory: '/project',
      })
      expect(result).toEqual({ canceled: true })
    })

    it('imports skill to global claude directory', async () => {
      showOpenDialogMock.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/my-skill.md'],
      })
      readFileSyncMock.mockReturnValue(makeSkillMd({ name: 'Imported Skill' }))

      const result = await handlers.get('skills:import')!(mockEvent, {
        scope: 'global',
        cli: 'claude',
        workingDirectory: '/project',
      }) as { name: string; path: string }

      expect(result.name).toBe('Imported Skill')
      expect(mkdirSyncMock).toHaveBeenCalledWith(
        '/mock/home/.claude/skills/imported-skill',
        { recursive: true },
      )
      expect(copyFileSyncMock).toHaveBeenCalledWith(
        '/tmp/my-skill.md',
        '/mock/home/.claude/skills/imported-skill/SKILL.md',
      )
    })

    it('imports skill to project copilot directory', async () => {
      showOpenDialogMock.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/cop-skill.md'],
      })
      readFileSyncMock.mockReturnValue(makeSkillMd({ name: 'Copilot Import' }))

      const result = await handlers.get('skills:import')!(mockEvent, {
        scope: 'project',
        cli: 'copilot',
        workingDirectory: '/my/project',
      }) as { name: string; path: string }

      expect(result.name).toBe('Copilot Import')
      expect(mkdirSyncMock).toHaveBeenCalledWith(
        '/my/project/.github/skills/copilot-import',
        { recursive: true },
      )
    })

    it('falls back to filename when frontmatter has no name', async () => {
      showOpenDialogMock.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/unnamed-skill.md'],
      })
      readFileSyncMock.mockReturnValue('---\ndescription: no name here\n---\nbody')

      const result = await handlers.get('skills:import')!(mockEvent, {
        scope: 'global',
        cli: 'claude',
        workingDirectory: '/project',
      }) as { name: string }

      expect(result.name).toBe('unnamed-skill')
    })
  })
})
