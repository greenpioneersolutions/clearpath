import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockGet,
  mockSet,
  readFileSyncMock,
  writeFileSyncMock,
  randomUUIDMock,
  showSaveDialogMock,
  showOpenDialogMock,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  randomUUIDMock: vi.fn().mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  showSaveDialogMock: vi.fn().mockResolvedValue({ canceled: true }),
  showOpenDialogMock: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
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

vi.mock('fs', () => ({
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}))

vi.mock('crypto', () => ({
  randomUUID: randomUUIDMock,
}))

// dialog is part of the electron mock, but we need to override the specific methods
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

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => unknown

function extractHandlers(ipcMainMock: { handle: ReturnType<typeof vi.fn> }): Map<string, HandlerFn> {
  const map = new Map<string, HandlerFn>()
  for (const call of ipcMainMock.handle.mock.calls) {
    map.set(call[0] as string, call[1] as HandlerFn)
  }
  return map
}

const mockEvent = {} // IPC event object, not used by handlers

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('templateHandlers', () => {
  let handlers: Map<string, HandlerFn>
  let ipcMainMock: { handle: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    // Default: no user templates in store
    mockGet.mockReturnValue([])

    ipcMainMock = { handle: vi.fn() }

    const mod = await import('./templateHandlers')
    mod.registerTemplateHandlers(ipcMainMock as never)
    handlers = extractHandlers(ipcMainMock)
  })

  // ── Registration ──────────────────────────────────────────────────────────

  it('registers all expected IPC channels', () => {
    const expected = [
      'templates:list',
      'templates:get',
      'templates:save',
      'templates:delete',
      'templates:record-usage',
      'templates:usage-stats',
      'templates:export',
      'templates:import',
    ]
    for (const channel of expected) {
      expect(handlers.has(channel), `missing handler for ${channel}`).toBe(true)
    }
    expect(ipcMainMock.handle).toHaveBeenCalledTimes(expected.length)
  })

  // ── templates:list ────────────────────────────────────────────────────────

  describe('templates:list', () => {
    it('returns all built-in templates when store is empty', () => {
      const result = handlers.get('templates:list')!(mockEvent)
      expect(Array.isArray(result)).toBe(true)
      // Built-in templates exist
      const templates = result as { id: string; source: string; name: string }[]
      expect(templates.length).toBeGreaterThan(0)
      // All should be builtin source since store is empty
      expect(templates.every((t) => t.source === 'builtin')).toBe(true)
    })

    it('merges user templates with builtins', () => {
      const userTemplate = {
        id: 'user-1',
        name: 'My Template',
        category: 'Custom',
        description: 'Test',
        body: 'Hello {{NAME}}',
        complexity: 'low',
        variables: ['NAME'],
        source: 'user',
        usageCount: 0,
        totalCost: 0,
        createdAt: 1000,
      }
      mockGet.mockReturnValue([userTemplate])

      const result = handlers.get('templates:list')!(mockEvent) as { id: string }[]
      expect(result.find((t) => t.id === 'user-1')).toBeTruthy()
      // Builtins should still be present
      const builtinCount = result.filter((r: { id: string }) => r.id.startsWith('builtin-')).length
      expect(builtinCount).toBeGreaterThan(0)
    })

    it('user template overrides builtin with same ID', () => {
      const overriddenBuiltin = {
        id: 'builtin-review-pr-for-security',
        name: 'My Custom Security Review',
        category: 'Code Review',
        description: 'Customized',
        body: 'Do my custom review',
        complexity: 'high',
        variables: [],
        source: 'user',
        usageCount: 5,
        totalCost: 1.5,
        createdAt: 2000,
      }
      mockGet.mockReturnValue([overriddenBuiltin])

      const result = handlers.get('templates:list')!(mockEvent) as { id: string; name: string }[]
      const matches = result.filter((t) => t.id === 'builtin-review-pr-for-security')
      expect(matches).toHaveLength(1)
      expect(matches[0].name).toBe('My Custom Security Review')
    })

    it('filters by category', () => {
      const result = handlers.get('templates:list')!(mockEvent, { category: 'Bug Fix' }) as { category: string }[]
      expect(result.length).toBeGreaterThan(0)
      expect(result.every((t) => t.category === 'Bug Fix')).toBe(true)
    })

    it('filters by search term (name, description, body)', () => {
      const result = handlers.get('templates:list')!(mockEvent, { search: 'security' }) as { name: string }[]
      expect(result.length).toBeGreaterThan(0)
      // Each result should have "security" somewhere in name/desc/body
      for (const t of result) {
        const combined = `${t.name} ${(t as Record<string, string>).description} ${(t as Record<string, string>).body}`.toLowerCase()
        expect(combined).toContain('security')
      }
    })

    it('filters by both category and search', () => {
      const result = handlers.get('templates:list')!(mockEvent, {
        category: 'Code Review',
        search: 'performance',
      }) as { category: string }[]
      expect(result.length).toBeGreaterThan(0)
      expect(result.every((t) => t.category === 'Code Review')).toBe(true)
    })

    it('returns empty array when no matches', () => {
      const result = handlers.get('templates:list')!(mockEvent, { search: 'zzz_no_match_zzz' })
      expect(result).toEqual([])
    })

    it('returns all templates when no args provided', () => {
      const result = handlers.get('templates:list')!(mockEvent)
      expect(Array.isArray(result)).toBe(true)
      expect((result as unknown[]).length).toBeGreaterThan(0)
    })
  })

  // ── templates:get ─────────────────────────────────────────────────────────

  describe('templates:get', () => {
    it('returns a builtin template by id', () => {
      const result = handlers.get('templates:get')!(mockEvent, { id: 'builtin-fix-failing-test' })
      expect(result).not.toBeNull()
      expect((result as { name: string }).name).toBe('Fix Failing Test')
    })

    it('returns a user template by id', () => {
      const userTemplate = {
        id: 'user-123',
        name: 'Custom',
        category: 'Custom',
        description: 'desc',
        body: 'body',
        complexity: 'low',
        variables: [],
        source: 'user',
        usageCount: 0,
        totalCost: 0,
        createdAt: 1000,
      }
      mockGet.mockReturnValue([userTemplate])

      const result = handlers.get('templates:get')!(mockEvent, { id: 'user-123' })
      expect(result).not.toBeNull()
      expect((result as { name: string }).name).toBe('Custom')
    })

    it('returns null for non-existent id', () => {
      const result = handlers.get('templates:get')!(mockEvent, { id: 'does-not-exist' })
      expect(result).toBeNull()
    })
  })

  // ── templates:save ────────────────────────────────────────────────────────

  describe('templates:save', () => {
    it('creates a new template with generated id', () => {
      const result = handlers.get('templates:save')!(mockEvent, {
        name: 'New Template',
        category: 'Custom',
        description: 'A new one',
        body: 'Do {{THING}} with {{STUFF}}',
      })

      expect(mockSet).toHaveBeenCalledWith('templates', expect.any(Array))
      const saved = mockSet.mock.calls[0][1][0]
      expect(saved.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
      expect(saved.name).toBe('New Template')
      expect(saved.variables).toEqual(['THING', 'STUFF'])
      expect(saved.source).toBe('user')
      expect(saved.usageCount).toBe(0)
      expect((result as { id: string }).id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    })

    it('uses provided id when present', () => {
      handlers.get('templates:save')!(mockEvent, {
        id: 'my-custom-id',
        name: 'With ID',
        category: 'Test',
        description: 'desc',
        body: 'body',
      })

      const saved = mockSet.mock.calls[0][1][0]
      expect(saved.id).toBe('my-custom-id')
    })

    it('updates existing template preserving usage stats', () => {
      const existing = {
        id: 'existing-id',
        name: 'Old Name',
        category: 'Old',
        description: 'old',
        body: 'old body',
        complexity: 'low',
        variables: [],
        source: 'user',
        usageCount: 10,
        totalCost: 5.0,
        lastUsedAt: 9000,
        createdAt: 1000,
      }
      mockGet.mockReturnValue([existing])

      handlers.get('templates:save')!(mockEvent, {
        id: 'existing-id',
        name: 'Updated Name',
        category: 'Updated',
        description: 'updated desc',
        body: 'new body {{VAR}}',
      })

      const saved = mockSet.mock.calls[0][1][0]
      expect(saved.name).toBe('Updated Name')
      expect(saved.usageCount).toBe(10)
      expect(saved.totalCost).toBe(5.0)
      expect(saved.lastUsedAt).toBe(9000)
      expect(saved.createdAt).toBe(1000)
      expect(saved.variables).toEqual(['VAR'])
    })

    it('defaults complexity to medium', () => {
      handlers.get('templates:save')!(mockEvent, {
        name: 'T',
        category: 'C',
        description: 'd',
        body: 'b',
      })
      const saved = mockSet.mock.calls[0][1][0]
      expect(saved.complexity).toBe('medium')
    })

    it('extracts variables from body', () => {
      handlers.get('templates:save')!(mockEvent, {
        name: 'T',
        category: 'C',
        description: 'd',
        body: '{{FOO}} and {{BAR}} and {{FOO}}',
      })
      const saved = mockSet.mock.calls[0][1][0]
      // Should be deduplicated
      expect(saved.variables).toEqual(['FOO', 'BAR'])
    })
  })

  // ── templates:delete ──────────────────────────────────────────────────────

  describe('templates:delete', () => {
    it('removes template by id', () => {
      mockGet.mockReturnValue([
        { id: 'keep', name: 'Keep' },
        { id: 'remove', name: 'Remove' },
      ])

      const result = handlers.get('templates:delete')!(mockEvent, { id: 'remove' })
      expect(result).toEqual({ success: true })
      const remaining = mockSet.mock.calls[0][1]
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('keep')
    })

    it('succeeds even if id does not exist', () => {
      mockGet.mockReturnValue([])
      const result = handlers.get('templates:delete')!(mockEvent, { id: 'nonexistent' })
      expect(result).toEqual({ success: true })
    })
  })

  // ── templates:record-usage ────────────────────────────────────────────────

  describe('templates:record-usage', () => {
    it('increments usage on existing user template', () => {
      const template = {
        id: 'user-1',
        name: 'T',
        usageCount: 3,
        totalCost: 1.5,
        lastUsedAt: 1000,
      }
      mockGet.mockReturnValue([template])

      const result = handlers.get('templates:record-usage')!(mockEvent, { id: 'user-1', cost: 0.5 })
      expect(result).toEqual({ success: true })
      expect(mockSet).toHaveBeenCalledWith('templates', expect.any(Array))
      const updated = mockSet.mock.calls[0][1][0]
      expect(updated.usageCount).toBe(4)
      expect(updated.totalCost).toBe(2.0)
      expect(updated.lastUsedAt).toBeGreaterThan(1000)
    })

    it('handles cost being undefined (defaults to 0)', () => {
      const template = { id: 'user-1', usageCount: 0, totalCost: 0 }
      mockGet.mockReturnValue([template])

      handlers.get('templates:record-usage')!(mockEvent, { id: 'user-1' })
      const updated = mockSet.mock.calls[0][1][0]
      expect(updated.usageCount).toBe(1)
      expect(updated.totalCost).toBe(0)
    })

    it('copies builtin to user store on first usage', () => {
      // No user templates in store
      mockGet.mockReturnValue([])

      handlers.get('templates:record-usage')!(mockEvent, {
        id: 'builtin-fix-failing-test',
        cost: 0.3,
      })

      expect(mockSet).toHaveBeenCalledWith('templates', expect.any(Array))
      const saved = mockSet.mock.calls[0][1]
      expect(saved).toHaveLength(1)
      expect(saved[0].id).toBe('builtin-fix-failing-test')
      expect(saved[0].usageCount).toBe(1)
      expect(saved[0].totalCost).toBe(0.3)
    })

    it('does nothing for unknown id (not in user store or builtins)', () => {
      mockGet.mockReturnValue([])

      const result = handlers.get('templates:record-usage')!(mockEvent, { id: 'unknown-id' })
      expect(result).toEqual({ success: true })
      // set should NOT be called because neither findIndex found it nor builtin matched
      expect(mockSet).not.toHaveBeenCalled()
    })
  })

  // ── templates:usage-stats ─────────────────────────────────────────────────

  describe('templates:usage-stats', () => {
    it('returns only templates with usageCount > 0, sorted by count descending', () => {
      mockGet.mockReturnValue([
        { id: 'a', name: 'A', category: 'C', usageCount: 5, totalCost: 2.5, lastUsedAt: 100, source: 'user' },
        { id: 'b', name: 'B', category: 'C', usageCount: 0, totalCost: 0, source: 'user' },
        { id: 'c', name: 'C', category: 'D', usageCount: 10, totalCost: 5.0, lastUsedAt: 200, source: 'user' },
      ])

      const result = handlers.get('templates:usage-stats')!(mockEvent) as {
        templateId: string; usageCount: number; avgCost: number
      }[]
      expect(result).toHaveLength(2)
      // Sorted descending by usageCount
      expect(result[0].templateId).toBe('c')
      expect(result[0].usageCount).toBe(10)
      expect(result[0].avgCost).toBe(0.5)
      expect(result[1].templateId).toBe('a')
      expect(result[1].usageCount).toBe(5)
      expect(result[1].avgCost).toBe(0.5)
    })

    it('returns empty array when no templates have usage', () => {
      mockGet.mockReturnValue([])
      const result = handlers.get('templates:usage-stats')!(mockEvent)
      expect(result).toEqual([])
    })

    it('includes builtin templates with usage in results', () => {
      // A builtin template that has been copied to user store with usage
      mockGet.mockReturnValue([{
        id: 'builtin-fix-failing-test',
        name: 'Fix Failing Test',
        category: 'Bug Fix',
        usageCount: 3,
        totalCost: 0.9,
        lastUsedAt: 500,
        source: 'builtin',
      }])

      const result = handlers.get('templates:usage-stats')!(mockEvent) as { templateId: string }[]
      // The user-store copy overrides the builtin, so it should appear once
      expect(result.find((r) => r.templateId === 'builtin-fix-failing-test')).toBeTruthy()
    })
  })

  // ── templates:export ──────────────────────────────────────────────────────

  describe('templates:export', () => {
    it('returns error for non-existent template', async () => {
      const result = await handlers.get('templates:export')!(mockEvent, { id: 'no-such-id' })
      expect(result).toEqual({ error: 'Not found' })
    })

    it('returns canceled when user cancels save dialog', async () => {
      showSaveDialogMock.mockResolvedValue({ canceled: true })
      const result = await handlers.get('templates:export')!(mockEvent, { id: 'builtin-fix-failing-test' })
      expect(result).toEqual({ canceled: true })
    })

    it('writes markdown file with frontmatter and returns path', async () => {
      showSaveDialogMock.mockResolvedValue({
        canceled: false,
        filePath: '/tmp/export.md',
      })

      const result = await handlers.get('templates:export')!(mockEvent, { id: 'builtin-fix-failing-test' })
      expect(result).toEqual({ path: '/tmp/export.md' })
      expect(writeFileSyncMock).toHaveBeenCalledWith(
        '/tmp/export.md',
        expect.stringContaining('name: Fix Failing Test'),
        'utf8',
      )
      // Verify frontmatter structure
      const writtenContent = writeFileSyncMock.mock.calls[0][1] as string
      expect(writtenContent).toContain('---')
      expect(writtenContent).toContain('category: Bug Fix')
    })

    it('includes recommendedModel in export when present', async () => {
      // Create a user template with recommendedModel
      mockGet.mockReturnValue([{
        id: 'with-model',
        name: 'Model Template',
        category: 'Test',
        description: 'desc',
        body: 'body text',
        recommendedModel: 'gpt-5',
        complexity: 'high',
        variables: [],
        source: 'user',
        usageCount: 0,
        totalCost: 0,
        createdAt: 1000,
      }])
      showSaveDialogMock.mockResolvedValue({
        canceled: false,
        filePath: '/tmp/model-export.md',
      })

      await handlers.get('templates:export')!(mockEvent, { id: 'with-model' })
      const writtenContent = writeFileSyncMock.mock.calls[0][1] as string
      expect(writtenContent).toContain('recommendedModel: gpt-5')
    })
  })

  // ── templates:import ──────────────────────────────────────────────────────

  describe('templates:import', () => {
    it('returns canceled when user cancels open dialog', async () => {
      showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })
      const result = await handlers.get('templates:import')!(mockEvent)
      expect(result).toEqual({ canceled: true })
    })

    it('returns error when file has no frontmatter', async () => {
      showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/bad.md'] })
      readFileSyncMock.mockReturnValue('Just plain text without frontmatter')

      const result = await handlers.get('templates:import')!(mockEvent)
      expect(result).toEqual({ error: 'No YAML frontmatter found' })
    })

    it('imports a valid template file', async () => {
      showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/good.md'] })
      readFileSyncMock.mockReturnValue(
        '---\nname: Imported\ncategory: Custom\ndescription: A test\ncomplexity: high\n---\nDo {{ACTION}} on {{TARGET}}',
      )
      mockGet.mockReturnValue([])

      const result = (await handlers.get('templates:import')!(mockEvent)) as {
        template: { name: string; category: string; variables: string[]; complexity: string; source: string }
      }

      expect(result.template).toBeDefined()
      expect(result.template.name).toBe('Imported')
      expect(result.template.category).toBe('Custom')
      expect(result.template.variables).toEqual(['ACTION', 'TARGET'])
      expect(result.template.complexity).toBe('high')
      expect(result.template.source).toBe('user')
      expect(mockSet).toHaveBeenCalledWith('templates', expect.any(Array))
    })

    it('defaults name to "Imported Template" and category to "Custom" when missing', async () => {
      showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/minimal.md'] })
      readFileSyncMock.mockReturnValue('---\ncomplexity: low\n---\nHello world')
      mockGet.mockReturnValue([])

      const result = (await handlers.get('templates:import')!(mockEvent)) as {
        template: { name: string; category: string }
      }
      expect(result.template.name).toBe('Imported Template')
      expect(result.template.category).toBe('Custom')
    })

    it('returns error on file read failure', async () => {
      showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/fail.md'] })
      readFileSyncMock.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const result = (await handlers.get('templates:import')!(mockEvent)) as { error: string }
      expect(result.error).toContain('ENOENT')
    })
  })
})
