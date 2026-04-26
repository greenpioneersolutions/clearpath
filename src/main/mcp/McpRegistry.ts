import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import type {
  McpRegistryEntry,
  McpRegistryEntryInput,
} from '../../renderer/src/types/mcp'

// ── Store schema ──────────────────────────────────────────────────────────────

interface McpRegistryStoreSchema {
  entries: McpRegistryEntry[]
}

const DEFAULTS: McpRegistryStoreSchema = { entries: [] }

/**
 * CRUD wrapper over the MCP registry electron-store.
 *
 * Store file: `~/Library/Application Support/clear-path/clear-path-mcps.json`
 *
 * Every mutation bumps `updatedAt` on the affected entry. All reads return
 * fresh copies — callers may mutate the result without corrupting the store.
 */
export class McpRegistry {
  private readonly store: Store<McpRegistryStoreSchema>

  constructor(storeInstance?: Store<McpRegistryStoreSchema>) {
    this.store =
      storeInstance ??
      new Store<McpRegistryStoreSchema>({
        name: 'clear-path-mcps',
        encryptionKey: getStoreEncryptionKey(),
        defaults: DEFAULTS,
      })
  }

  /** Return all registry entries (fresh copy; safe to mutate). */
  list(): McpRegistryEntry[] {
    const entries = (this.store.get('entries', []) as McpRegistryEntry[]) ?? []
    return entries.map((e) => ({ ...e }))
  }

  /** Look up a single entry by id. Returns undefined if not found. */
  get(id: string): McpRegistryEntry | undefined {
    const found = this.list().find((e) => e.id === id)
    return found
  }

  /** Insert a new entry, assigning a UUID and createdAt/updatedAt timestamps. */
  add(input: McpRegistryEntryInput): McpRegistryEntry {
    const now = new Date().toISOString()
    const entry: McpRegistryEntry = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    const entries = this.list()
    entries.push(entry)
    this.store.set('entries', entries)
    return entry
  }

  /**
   * Shallow-merge `partial` into the entry with id=`id` and bump `updatedAt`.
   * Returns the updated entry, or undefined if no entry matched.
   */
  update(id: string, partial: Partial<McpRegistryEntry>): McpRegistryEntry | undefined {
    const entries = this.list()
    const idx = entries.findIndex((e) => e.id === id)
    if (idx === -1) return undefined

    // Protect immutable fields
    const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...patch } = partial

    const updated: McpRegistryEntry = {
      ...entries[idx],
      ...patch,
      id: entries[idx].id,
      createdAt: entries[idx].createdAt,
      updatedAt: new Date().toISOString(),
    }
    entries[idx] = updated
    this.store.set('entries', entries)
    return updated
  }

  /** Remove an entry by id. Returns true if an entry was removed. */
  remove(id: string): boolean {
    const entries = this.list()
    const next = entries.filter((e) => e.id !== id)
    if (next.length === entries.length) return false
    this.store.set('entries', next)
    return true
  }

  /**
   * Flip `enabled` on the entry with id=`id` and bump `updatedAt`.
   * Returns the updated entry, or undefined if not found.
   */
  toggle(id: string, enabled: boolean): McpRegistryEntry | undefined {
    return this.update(id, { enabled })
  }
}
