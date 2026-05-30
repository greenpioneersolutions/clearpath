import { existsSync, statSync } from 'fs'
import { basename } from 'path'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { log } from '../utils/logger'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { assertPathWithinRoots, getWorkspaceAllowedRoots, isSensitiveSystemPath } from '../utils/pathSecurity'

// ── Types ────────────────────────────────────────────────────────────────────

/** A directory the user has explicitly OK'd for the AI to read/write. */
export interface ApprovedFolder {
  /** Stable identifier. */
  id: string
  /** User-facing label (defaults to the folder basename). */
  label: string
  /** Absolute path on disk. */
  path: string
  /** When the folder was added (epoch ms). */
  addedAt: number
}

interface LocationsStoreSchema {
  /** Reusable approved folders — drive working dir + additional dirs. */
  approvedFolders: ApprovedFolder[]
  /** The primary working directory used when no workspace is active. */
  defaultWorkingDir: string | null
  /** Extra folders scanned for skills / agents / plugins discovery. */
  sourceFolders: string[]
}

/** Result of `addApproved` / `addSource`: either the entry or a friendly error. */
type AddResult<T> = { entry: T } | { error: string }

/** Health snapshot returned to the renderer for the Local Setup page. */
export interface LocationsHealth {
  defaultWorkingDir: { path: string; exists: boolean } | null
  approvedFolders: Array<ApprovedFolder & { exists: boolean }>
  sourceFolders: Array<{ path: string; exists: boolean }>
}

// ── Validation ─────────────────────────────────────────────────────────────--

/**
 * Validate a candidate folder path. Returns the resolved path on success or a
 * human-readable error string. Reuses the same security primitives the rest of
 * the app uses for file operations:
 *  - must exist and be a directory
 *  - must resolve within the user's home (no arbitrary system roots)
 *  - must not be a sensitive location (~/.ssh, /etc, /System, …)
 */
function validateFolder(path: string): { ok: string } | { error: string } {
  if (!path || !path.trim()) return { error: 'No path provided' }
  if (!existsSync(path)) return { error: 'Folder does not exist' }
  try {
    if (!statSync(path).isDirectory()) return { error: 'Path must be a folder' }
  } catch {
    return { error: 'Folder is not accessible' }
  }
  if (isSensitiveSystemPath(path)) {
    return { error: 'That location is protected and cannot be added' }
  }
  try {
    const resolved = assertPathWithinRoots(path, getWorkspaceAllowedRoots())
    return { ok: resolved }
  } catch {
    return { error: 'Folder must be inside your home directory' }
  }
}

/** Check existence without throwing — used by health(). */
function dirExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

// ── LocationsManager ─────────────────────────────────────────────────────────

/**
 * Owns the user's "local setup" — the folders ClearPath points the CLIs at and
 * the extra folders it scans for skills/agents/plugins. Modeled on
 * {@link ../plugins/PluginManager.PluginManager} (lazy encrypted electron-store).
 */
export class LocationsManager {
  private _store: Store<LocationsStoreSchema> | null = null

  private get store(): Store<LocationsStoreSchema> {
    if (!this._store) {
      this._store = new Store<LocationsStoreSchema>({
        name: 'clear-path-locations',
        encryptionKey: getStoreEncryptionKey(),
        defaults: {
          approvedFolders: [],
          defaultWorkingDir: null,
          sourceFolders: [],
        },
      })
    }
    return this._store
  }

  private readApproved(): ApprovedFolder[] {
    const raw = this.store.get('approvedFolders') as ApprovedFolder[] | undefined
    return Array.isArray(raw) ? raw : []
  }

  private readSources(): string[] {
    const raw = this.store.get('sourceFolders') as string[] | undefined
    return Array.isArray(raw) ? raw : []
  }

  // ── Approved folders ─────────────────────────────────────────────────────--

  listApproved(): ApprovedFolder[] {
    return this.readApproved()
  }

  /** Add an approved folder. Validates the path; dedupes on resolved path. */
  addApproved(path: string, label?: string): AddResult<ApprovedFolder> {
    const v = validateFolder(path)
    if ('error' in v) return { error: v.error }

    const folders = this.readApproved()
    const existing = folders.find((f) => f.path === v.ok)
    if (existing) return { entry: existing }

    const entry: ApprovedFolder = {
      id: randomUUID(),
      label: label?.trim() || basename(v.ok) || v.ok,
      path: v.ok,
      addedAt: Date.now(),
    }
    folders.push(entry)
    this.store.set('approvedFolders', folders)
    log.info(`[LocationsManager] approved folder added: ${v.ok}`)
    return { entry }
  }

  removeApproved(id: string): void {
    this.store.set('approvedFolders', this.readApproved().filter((f) => f.id !== id))
  }

  // ── Default working directory ────────────────────────────────────────────--

  getDefaultWorkingDir(): string | null {
    const dir = this.store.get('defaultWorkingDir') as string | null | undefined
    // Don't hand back a stale path the user has since deleted/moved.
    if (typeof dir === 'string' && dir && dirExists(dir)) return dir
    return null
  }

  /** Set (or clear with null) the default working directory. Validates non-null. */
  setDefaultWorkingDir(path: string | null): { ok: true } | { error: string } {
    if (path === null) {
      this.store.set('defaultWorkingDir', null)
      return { ok: true }
    }
    const v = validateFolder(path)
    if ('error' in v) return { error: v.error }
    this.store.set('defaultWorkingDir', v.ok)
    return { ok: true }
  }

  // ── Extra source folders (skills / agents / plugins discovery) ────────────--

  listSources(): string[] {
    return this.readSources()
  }

  addSource(path: string): AddResult<{ path: string }> {
    const v = validateFolder(path)
    if ('error' in v) return { error: v.error }
    const sources = this.readSources()
    if (!sources.includes(v.ok)) {
      sources.push(v.ok)
      this.store.set('sourceFolders', sources)
      log.info(`[LocationsManager] source folder added: ${v.ok}`)
    }
    return { entry: { path: v.ok } }
  }

  removeSource(path: string): void {
    this.store.set('sourceFolders', this.readSources().filter((p) => p !== path))
  }

  /**
   * Source folders that currently exist on disk — the form discovery consumers
   * (skills, agents, plugins) should use so a deleted folder never breaks a scan.
   */
  getExistingSourceFolders(): string[] {
    return this.readSources().filter(dirExists)
  }

  // ── Health ────────────────────────────────────────────────────────────────

  health(): LocationsHealth {
    const defaultDir = this.store.get('defaultWorkingDir') as string | null | undefined
    return {
      defaultWorkingDir: defaultDir
        ? { path: defaultDir, exists: dirExists(defaultDir) }
        : null,
      approvedFolders: this.readApproved().map((f) => ({ ...f, exists: dirExists(f.path) })),
      sourceFolders: this.readSources().map((p) => ({ path: p, exists: dirExists(p) })),
    }
  }
}
