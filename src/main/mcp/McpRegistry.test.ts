import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── In-memory electron-store mock, isolated per test file via vi.hoisted ──────

const { storeData } = vi.hoisted(() => ({
  storeData: {} as Record<string, unknown>,
}))

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [k, v] of Object.entries(opts.defaults)) {
            if (!(k in storeData)) {
              storeData[k] = JSON.parse(JSON.stringify(v))
            }
          }
        }
      }
      get(key: string, fallback?: unknown): unknown {
        const val = storeData[key]
        if (val === undefined) return fallback
        return JSON.parse(JSON.stringify(val))
      }
      set(key: string, value: unknown): void {
        storeData[key] = JSON.parse(JSON.stringify(value))
      }
      has(key: string): boolean {
        return key in storeData
      }
      delete(key: string): void {
        delete storeData[key]
      }
    },
  }
})

vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: () => 'test-encryption-key',
}))

import type { McpRegistryEntryInput } from '../../renderer/src/types/mcp'
// McpRegistry is loaded dynamically in beforeEach after resetModules so the
// electron-store mock registered above actually applies. Without this, the
// src/test/setup-coverage.ts glob pre-loads the real electron-store.
type McpRegistryType = import('./McpRegistry').McpRegistry
let McpRegistry: typeof import('./McpRegistry').McpRegistry

function makeInput(overrides: Partial<McpRegistryEntryInput> = {}): McpRegistryEntryInput {
  return {
    name: 'test-server',
    command: 'npx',
    args: ['-y', '@test/mcp'],
    env: {},
    secretRefs: {},
    scope: 'global',
    targets: { copilot: true, claude: true },
    enabled: true,
    source: 'custom',
    ...overrides,
  }
}

describe('McpRegistry', () => {
  let registry: McpRegistryType

  beforeEach(async () => {
    // Reset shared store between tests
    for (const k of Object.keys(storeData)) delete storeData[k]
    vi.clearAllMocks()
    // Reset modules so the electron-store mock is picked up by McpRegistry.
    // setup-coverage.ts force-loads every .ts file via import.meta.glob before
    // any test-file mocks are installed, so we must re-import here.
    vi.resetModules()
    McpRegistry = (await import('./McpRegistry')).McpRegistry
    registry = new McpRegistry()
  })

  describe('list', () => {
    it('returns empty array when store is empty', () => {
      expect(registry.list()).toEqual([])
    })

    it('returns fresh copies — mutating the result does not corrupt the store', () => {
      registry.add(makeInput({ name: 'a' }))
      const entries = registry.list()
      entries[0].name = 'mutated'
      expect(registry.list()[0].name).toBe('a')
    })
  })

  describe('add', () => {
    it('assigns id, createdAt, updatedAt', () => {
      const result = registry.add(makeInput({ name: 'github' }))
      expect(result.id).toBeTruthy()
      expect(result.createdAt).toBeTruthy()
      expect(result.updatedAt).toBe(result.createdAt)
      expect(result.name).toBe('github')
    })

    it('persists the entry so list() includes it', () => {
      registry.add(makeInput({ name: 'foo' }))
      const all = registry.list()
      expect(all).toHaveLength(1)
      expect(all[0].name).toBe('foo')
    })

    it('allows adding multiple entries', () => {
      registry.add(makeInput({ name: 'a' }))
      registry.add(makeInput({ name: 'b' }))
      registry.add(makeInput({ name: 'c' }))
      expect(registry.list()).toHaveLength(3)
    })

    it('generates unique ids for each entry', () => {
      const a = registry.add(makeInput({ name: 'a' }))
      const b = registry.add(makeInput({ name: 'b' }))
      expect(a.id).not.toBe(b.id)
    })
  })

  describe('get', () => {
    it('returns the entry matching an id', () => {
      const added = registry.add(makeInput({ name: 'target' }))
      const result = registry.get(added.id)
      expect(result).toBeDefined()
      expect(result!.name).toBe('target')
    })

    it('returns undefined for unknown id', () => {
      expect(registry.get('nonexistent-id')).toBeUndefined()
    })
  })

  describe('update', () => {
    it('merges partial fields and bumps updatedAt', async () => {
      const added = registry.add(makeInput({ name: 'orig' }))
      // Ensure timestamps diverge
      await new Promise((r) => setTimeout(r, 5))
      const updated = registry.update(added.id, { name: 'renamed', enabled: false })
      expect(updated).toBeDefined()
      expect(updated!.name).toBe('renamed')
      expect(updated!.enabled).toBe(false)
      expect(updated!.updatedAt).not.toBe(added.updatedAt)
      expect(updated!.createdAt).toBe(added.createdAt)
    })

    it('ignores id and createdAt in the partial payload', () => {
      const added = registry.add(makeInput({ name: 'orig' }))
      const updated = registry.update(added.id, {
        id: 'attempted-override',
        createdAt: '1970-01-01T00:00:00.000Z',
        name: 'renamed',
      })
      expect(updated!.id).toBe(added.id)
      expect(updated!.createdAt).toBe(added.createdAt)
      expect(updated!.name).toBe('renamed')
    })

    it('returns undefined for non-existent id', () => {
      expect(registry.update('ghost', { name: 'ghost' })).toBeUndefined()
    })
  })

  describe('remove', () => {
    it('removes the entry and returns true', () => {
      const added = registry.add(makeInput({ name: 'doomed' }))
      expect(registry.remove(added.id)).toBe(true)
      expect(registry.list()).toEqual([])
    })

    it('returns false for unknown id', () => {
      expect(registry.remove('nonexistent')).toBe(false)
    })

    it('leaves other entries untouched', () => {
      const keep = registry.add(makeInput({ name: 'keep' }))
      const drop = registry.add(makeInput({ name: 'drop' }))
      registry.remove(drop.id)
      const all = registry.list()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(keep.id)
    })
  })

  describe('toggle', () => {
    it('flips enabled to false', () => {
      const added = registry.add(makeInput({ enabled: true }))
      const toggled = registry.toggle(added.id, false)
      expect(toggled!.enabled).toBe(false)
    })

    it('flips enabled to true', () => {
      const added = registry.add(makeInput({ enabled: false }))
      const toggled = registry.toggle(added.id, true)
      expect(toggled!.enabled).toBe(true)
    })

    it('returns undefined for unknown id', () => {
      expect(registry.toggle('ghost', true)).toBeUndefined()
    })

    it('bumps updatedAt', async () => {
      const added = registry.add(makeInput({ enabled: true }))
      await new Promise((r) => setTimeout(r, 5))
      const toggled = registry.toggle(added.id, false)
      expect(toggled!.updatedAt).not.toBe(added.updatedAt)
    })
  })
})
