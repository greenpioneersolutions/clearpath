/**
 * Unit tests for noteHandlers.ts — note CRUD, search, tags, categories,
 * attachments with path security validation.
 */

// ── Shared store data via globalThis ─────────────────────────────────────────

const STORE_KEY = '__noteHandlersTestStoreData' as const
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any)[STORE_KEY] = {} as Record<string, unknown>

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockAssertPath, mockGetWsRoots, mockIsSensitive } = vi.hoisted(() => ({
  mockAssertPath: vi.fn().mockImplementation((p: string) => p),
  mockGetWsRoots: vi.fn().mockReturnValue(['/home/user']),
  mockIsSensitive: vi.fn().mockReturnValue(false),
}))

// ── vi.mock declarations ────────────────────────────────────────────────────

vi.mock('electron-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = (globalThis as any)['__noteHandlersTestStoreData'] as Record<string, unknown>
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in sd)) sd[k] = JSON.parse(JSON.stringify(v))
          }
        }
      }
      get(key: string): unknown {
        const val = sd[key]
        return val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined
      }
      set(key: string, value: unknown): void {
        sd[key] = JSON.parse(JSON.stringify(value))
      }
    },
  }
})

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-key',
}))

vi.mock('../utils/pathSecurity', () => ({
  assertPathWithinRoots: (...args: unknown[]) => mockAssertPath(...args),
  getWorkspaceAllowedRoots: () => mockGetWsRoots(),
  isSensitiveSystemPath: (...args: unknown[]) => mockIsSensitive(...args),
}))

vi.mock('./complianceHandlers', () => ({
  addAuditEntry: vi.fn(),
}))

vi.mock('fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs')>()
  return {
    ...orig,
    readFileSync: vi.fn().mockReturnValue('file content'),
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ size: 1024 }),
  }
})

// ── Imports & helpers ───────────────────────────────────────────────────────

import { readFileSync, existsSync, statSync } from 'fs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storeData = (globalThis as any)[STORE_KEY] as Record<string, unknown>

function resetStore(): void {
  for (const key of Object.keys(storeData)) delete storeData[key]
  storeData.notes = []
}

type HandlerMap = Record<string, (...args: unknown[]) => unknown>

function extractHandlers(mockIpcMain: { handle: ReturnType<typeof vi.fn> }): HandlerMap {
  const handlers: HandlerMap = {}
  for (const call of mockIpcMain.handle.mock.calls) {
    handlers[call[0] as string] = call[1] as (...args: unknown[]) => unknown
  }
  return handlers
}

function makeNote(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'note-1',
    title: 'Test Note',
    content: 'Test content',
    tags: ['test'],
    category: 'reference',
    source: 'manual',
    attachments: [],
    createdAt: 1000,
    updatedAt: 2000,
    pinned: false,
    ...overrides,
  }
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('noteHandlers', () => {
  let handlers: HandlerMap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let electronMod: any

  beforeAll(async () => {
    vi.resetModules()
    electronMod = await import('electron')
    const mod = await import('./noteHandlers')
    mod.registerNoteHandlers(electronMod.ipcMain)
    handlers = extractHandlers(electronMod.ipcMain)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mockAssertPath.mockImplementation((p: string) => p)
    mockIsSensitive.mockReturnValue(false)
  })

  // ── Handler registration ──────────────────────────────────────────────

  describe('handler registration', () => {
    it('registers all expected IPC channels', () => {
      const expected = [
        'notes:list', 'notes:get', 'notes:create', 'notes:update', 'notes:delete',
        'notes:tags', 'notes:stats', 'notes:pick-files',
        'notes:read-attachment', 'notes:get-full-content',
      ]
      for (const ch of expected) {
        expect(handlers[ch]).toBeDefined()
      }
    })
  })

  // ── notes:list ────────────────────────────────────────────────────────

  describe('notes:list', () => {
    it('returns empty array when no notes exist', async () => {
      const result = await handlers['notes:list']({}) as unknown[]
      expect(result).toEqual([])
    })

    it('returns all notes sorted by updatedAt descending', async () => {
      storeData.notes = [
        makeNote({ id: 'a', updatedAt: 1000 }),
        makeNote({ id: 'b', updatedAt: 3000 }),
      ]
      const result = await handlers['notes:list']({}) as Array<Record<string, unknown>>
      expect(result[0].id).toBe('b')
      expect(result[1].id).toBe('a')
    })

    it('puts pinned notes first', async () => {
      storeData.notes = [
        makeNote({ id: 'a', updatedAt: 3000, pinned: false }),
        makeNote({ id: 'b', updatedAt: 1000, pinned: true }),
      ]
      const result = await handlers['notes:list']({}) as Array<Record<string, unknown>>
      expect(result[0].id).toBe('b')
    })

    it('filters by category', async () => {
      storeData.notes = [
        makeNote({ id: 'a', category: 'meeting' }),
        makeNote({ id: 'b', category: 'reference' }),
      ]
      const result = await handlers['notes:list'](
        {}, { category: 'meeting' },
      ) as Array<Record<string, unknown>>
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('a')
    })

    it('filters by tag', async () => {
      storeData.notes = [
        makeNote({ id: 'a', tags: ['important', 'work'] }),
        makeNote({ id: 'b', tags: ['personal'] }),
      ]
      const result = await handlers['notes:list'](
        {}, { tag: 'important' },
      ) as Array<Record<string, unknown>>
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('a')
    })

    it('filters pinned only', async () => {
      storeData.notes = [
        makeNote({ id: 'a', pinned: true }),
        makeNote({ id: 'b', pinned: false }),
      ]
      const result = await handlers['notes:list'](
        {}, { pinnedOnly: true },
      ) as Array<Record<string, unknown>>
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('a')
    })

    it('searches across title, content, and tags', async () => {
      storeData.notes = [
        makeNote({ id: 'a', title: 'Meeting Notes', content: 'discussed budget', tags: ['finance'] }),
        makeNote({ id: 'b', title: 'Random', content: 'nothing relevant', tags: ['misc'] }),
      ]
      const result = await handlers['notes:list'](
        {}, { search: 'budget' },
      ) as Array<Record<string, unknown>>
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('a')
    })

    it('search is case-insensitive', async () => {
      storeData.notes = [
        makeNote({ id: 'a', title: 'IMPORTANT Meeting' }),
      ]
      const result = await handlers['notes:list'](
        {}, { search: 'important' },
      ) as Array<Record<string, unknown>>
      expect(result).toHaveLength(1)
    })
  })

  // ── notes:get ─────────────────────────────────────────────────────────

  describe('notes:get', () => {
    it('returns a note by id', async () => {
      storeData.notes = [makeNote({ id: 'abc' })]
      const result = await handlers['notes:get']({}, { id: 'abc' }) as Record<string, unknown>
      expect(result.id).toBe('abc')
    })

    it('returns null for non-existent note', async () => {
      const result = await handlers['notes:get']({}, { id: 'nonexistent' })
      expect(result).toBeNull()
    })
  })

  // ── notes:create ──────────────────────────────────────────────────────

  describe('notes:create', () => {
    it('creates a note with all fields', async () => {
      const result = await handlers['notes:create']({}, {
        title: 'New Note',
        content: 'Some content',
        tags: ['work'],
        category: 'meeting',
        pinned: true,
      }) as Record<string, unknown>

      expect(result.title).toBe('New Note')
      expect(result.content).toBe('Some content')
      expect(result.tags).toEqual(['work'])
      expect(result.category).toBe('meeting')
      expect(result.pinned).toBe(true)
      expect(result.id).toBeDefined()
      expect(result.createdAt).toBeDefined()
      expect(result.updatedAt).toBeDefined()

      // Verify it was persisted
      const notes = storeData.notes as unknown[]
      expect(notes).toHaveLength(1)
    })

    it('applies default values for optional fields', async () => {
      const result = await handlers['notes:create']({}, {
        title: 'Minimal',
        content: 'body',
      }) as Record<string, unknown>

      expect(result.tags).toEqual([])
      expect(result.category).toBe('reference')
      expect(result.pinned).toBe(false)
      expect(result.attachments).toEqual([])
    })
  })

  // ── notes:update ──────────────────────────────────────────────────────

  describe('notes:update', () => {
    it('updates an existing note', async () => {
      storeData.notes = [makeNote({ id: 'u1', title: 'Old Title' })]
      const result = await handlers['notes:update']({}, {
        id: 'u1', title: 'New Title', pinned: true,
      }) as Record<string, unknown>

      expect(result.title).toBe('New Title')
      expect(result.pinned).toBe(true)
      expect(result.content).toBe('Test content') // unchanged
    })

    it('returns error for non-existent note', async () => {
      const result = await handlers['notes:update']({}, {
        id: 'missing', title: 'x',
      }) as Record<string, unknown>
      expect(result.error).toBe('Note not found')
    })

    it('updates updatedAt timestamp', async () => {
      storeData.notes = [makeNote({ id: 'u2', updatedAt: 1000 })]
      const before = Date.now()
      const result = await handlers['notes:update']({}, {
        id: 'u2', content: 'updated',
      }) as Record<string, unknown>

      expect(result.updatedAt as number).toBeGreaterThanOrEqual(before)
    })
  })

  // ── notes:delete ──────────────────────────────────────────────────────

  describe('notes:delete', () => {
    it('deletes an existing note', async () => {
      storeData.notes = [
        makeNote({ id: 'd1' }),
        makeNote({ id: 'd2' }),
      ]
      const result = await handlers['notes:delete']({}, { id: 'd1' }) as Record<string, unknown>
      expect(result.success).toBe(true)
      expect(storeData.notes).toHaveLength(1)
      expect((storeData.notes as Array<Record<string, unknown>>)[0].id).toBe('d2')
    })

    it('succeeds even if note does not exist (idempotent)', async () => {
      const result = await handlers['notes:delete']({}, { id: 'missing' }) as Record<string, unknown>
      expect(result.success).toBe(true)
    })
  })

  // ── notes:tags ────────────────────────────────────────────────────────

  describe('notes:tags', () => {
    it('returns unique sorted tags across all notes', async () => {
      storeData.notes = [
        makeNote({ tags: ['beta', 'alpha'] }),
        makeNote({ tags: ['alpha', 'gamma'] }),
      ]
      const result = await handlers['notes:tags']({}) as string[]
      expect(result).toEqual(['alpha', 'beta', 'gamma'])
    })

    it('returns empty array when no notes exist', async () => {
      const result = await handlers['notes:tags']({}) as string[]
      expect(result).toEqual([])
    })
  })

  // ── notes:stats ───────────────────────────────────────────────────────

  describe('notes:stats', () => {
    it('returns total count and breakdown by category', async () => {
      storeData.notes = [
        makeNote({ category: 'meeting' }),
        makeNote({ category: 'meeting' }),
        makeNote({ category: 'reference' }),
      ]
      const result = await handlers['notes:stats']({}) as Record<string, unknown>
      expect(result.total).toBe(3)
      expect((result.byCategory as Record<string, number>).meeting).toBe(2)
      expect((result.byCategory as Record<string, number>).reference).toBe(1)
    })

    it('returns zero total for empty notes', async () => {
      const result = await handlers['notes:stats']({}) as Record<string, unknown>
      expect(result.total).toBe(0)
      expect(result.byCategory).toEqual({})
    })
  })

  // ── notes:read-attachment ─────────────────────────────────────────────

  describe('notes:read-attachment', () => {
    it('reads a file within allowed roots', async () => {
      vi.mocked(readFileSync).mockReturnValue('attachment content')
      vi.mocked(existsSync).mockReturnValue(true)

      const result = await handlers['notes:read-attachment'](
        {}, { path: '/home/user/file.txt' },
      ) as Record<string, unknown>

      expect(result.content).toBe('attachment content')
    })

    it('blocks reading of sensitive paths', async () => {
      mockIsSensitive.mockReturnValue(true)

      const result = await handlers['notes:read-attachment'](
        {}, { path: '/home/user/.ssh/id_rsa' },
      ) as Record<string, unknown>

      expect(result.error).toContain('Access denied')
    })

    it('blocks reading outside allowed roots', async () => {
      mockAssertPath.mockImplementation(() => {
        throw new Error('Path not allowed')
      })

      const result = await handlers['notes:read-attachment'](
        {}, { path: '/etc/passwd' },
      ) as Record<string, unknown>

      expect(result.error).toContain('Path not allowed')
    })

    it('returns error when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await handlers['notes:read-attachment'](
        {}, { path: '/home/user/gone.txt' },
      ) as Record<string, unknown>

      expect(result.error).toContain('File not found')
    })
  })

  // ── notes:get-full-content ────────────────────────────────────────────

  describe('notes:get-full-content', () => {
    it('returns note content with attachment text', async () => {
      storeData.notes = [makeNote({
        id: 'fc1',
        content: 'Note body',
        attachments: [{
          id: 'att-1', path: '/home/user/data.txt', name: 'data.txt',
          sizeBytes: 100, addedAt: 1000,
        }],
      })]
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('attachment text here')

      const result = await handlers['notes:get-full-content'](
        {}, { id: 'fc1' },
      ) as Record<string, unknown>

      expect(result.content).toContain('Note body')
      expect(result.content).toContain('attachment text here')
      expect(result.content).toContain('data.txt')
      expect(result.attachmentCount).toBe(1)
    })

    it('returns error for non-existent note', async () => {
      const result = await handlers['notes:get-full-content'](
        {}, { id: 'missing' },
      ) as Record<string, unknown>
      expect(result.error).toBe('Note not found')
    })

    it('handles missing attachment files gracefully', async () => {
      storeData.notes = [makeNote({
        id: 'fc2',
        content: 'Body',
        attachments: [{
          id: 'att-2', path: '/home/user/deleted.txt', name: 'deleted.txt',
          sizeBytes: 50, addedAt: 1000,
        }],
      })]
      vi.mocked(existsSync).mockReturnValue(false)

      const result = await handlers['notes:get-full-content'](
        {}, { id: 'fc2' },
      ) as Record<string, unknown>

      expect(result.content).toContain('file not found')
      expect(result.attachmentCount).toBe(1)
    })

    it('returns content only when note has no attachments', async () => {
      storeData.notes = [makeNote({ id: 'fc3', content: 'Just text', attachments: [] })]

      const result = await handlers['notes:get-full-content'](
        {}, { id: 'fc3' },
      ) as Record<string, unknown>

      expect(result.content).toBe('Just text')
      expect(result.attachmentCount).toBe(0)
    })
  })

  // ── notes:pick-files ──────────────────────────────────────────────────

  describe('notes:pick-files', () => {
    it('returns canceled when dialog is canceled', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

      const result = await handlers['notes:pick-files']({}) as Record<string, unknown>
      expect(result.canceled).toBe(true)
    })

    it('returns attachments for valid text files', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/home/user/notes.txt'],
      })
      vi.mocked(statSync).mockReturnValue({ size: 1024 } as ReturnType<typeof statSync>)

      const result = await handlers['notes:pick-files']({}) as Record<string, unknown>
      const attachments = result.attachments as Array<Record<string, unknown>>
      expect(attachments).toHaveLength(1)
      expect(attachments[0].name).toBe('notes.txt')
      expect(attachments[0].sizeBytes).toBe(1024)
    })

    it('rejects files larger than 500KB', async () => {
      electronMod.dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/home/user/huge.txt'],
      })
      vi.mocked(statSync).mockReturnValue({ size: 600_000 } as ReturnType<typeof statSync>)

      const result = await handlers['notes:pick-files']({}) as Record<string, unknown>
      const errors = result.errors as string[]
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain('too large')
    })
  })
})
