import { app } from 'electron'
import Store from 'electron-store'
import { readdirSync, existsSync, mkdirSync, cpSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'
import { ExtensionValidator } from './ExtensionValidator'
import type {
  ExtensionPermission,
  ExtensionSource,
  ExtensionStoreSchema,
  InstalledExtension,
} from './types'

/**
 * ExtensionRegistry discovers, validates, and tracks extensions.
 *
 * - Bundled extensions: <app resources>/extensions/ (read-only, shipped with app)
 * - User extensions: <userData>/extensions/ (writable, uploaded zips)
 *
 * State is persisted in an encrypted electron-store instance.
 */
export class ExtensionRegistry {
  private store: Store<ExtensionStoreSchema>
  private validator: ExtensionValidator
  private bundledDir: string
  private userDir: string

  constructor() {
    this.store = new Store<ExtensionStoreSchema>({
      name: 'clear-path-extensions',
      encryptionKey: getStoreEncryptionKey(),
      defaults: { registry: {} },
    })

    this.validator = new ExtensionValidator()

    // Bundled extensions live inside the app resources.
    // In production: <resources>/extensions/ (copied there by electron-builder extraResources)
    // In dev: <project root>/extensions/ (app.getAppPath() returns the compiled output dir,
    //         so we walk up to find the project root where extensions/ actually lives)
    if (app.isPackaged) {
      this.bundledDir = join(process.resourcesPath, 'extensions')
    } else {
      // In dev, app.getAppPath() → out/main/ or similar.
      // Walk up from __dirname until we find a directory that contains extensions/
      let found = join(app.getAppPath(), 'extensions')
      let dir = __dirname
      for (let i = 0; i < 5; i++) {
        const candidate = join(dir, 'extensions')
        if (existsSync(candidate)) {
          found = candidate
          break
        }
        dir = resolve(dir, '..')
      }
      this.bundledDir = found
    }

    // User-installed extensions go into the userData directory
    this.userDir = join(app.getPath('userData'), 'extensions')

    // Ensure user extensions directory exists
    if (!existsSync(this.userDir)) {
      mkdirSync(this.userDir, { recursive: true })
    }

    log.info('[ext-registry] Bundled dir: %s', this.bundledDir)
    log.info('[ext-registry] User dir: %s', this.userDir)
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  /**
   * Scan both bundled and user extension directories, validate manifests,
   * and reconcile with the persisted registry.
   */
  discoverAll(): { discovered: number; errors: Array<{ dir: string; errors: string[] }> } {
    const allErrors: Array<{ dir: string; errors: string[] }> = []
    let discovered = 0

    // Scan bundled extensions
    discovered += this.scanDirectory(this.bundledDir, 'bundled', allErrors)

    // Scan user extensions
    discovered += this.scanDirectory(this.userDir, 'user', allErrors)

    // Clean up registry entries for extensions that no longer exist on disk
    this.pruneOrphans()

    log.info('[ext-registry] Discovery complete: %d extensions found, %d errors', discovered, allErrors.length)
    return { discovered, errors: allErrors }
  }

  private scanDirectory(
    dir: string,
    source: ExtensionSource,
    errors: Array<{ dir: string; errors: string[] }>,
  ): number {
    if (!existsSync(dir)) return 0

    let count = 0
    let entries: string[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => d.name)
    } catch (err) {
      log.error('[ext-registry] Failed to read directory %s: %s', dir, err)
      return 0
    }

    for (const entry of entries) {
      const extDir = join(dir, entry)
      const result = this.validator.validateDirectory(extDir)

      if (!result.valid || !result.manifest) {
        log.warn('[ext-registry] Invalid extension at %s: %s', extDir, result.errors.join('; '))
        errors.push({ dir: extDir, errors: result.errors })
        continue
      }

      const manifest = result.manifest
      const hash = this.validator.hashManifest(extDir)
      const registry = this.store.get('registry')
      const existing = registry[manifest.id]

      if (existing) {
        // Update path and hash if changed (e.g., app update moved bundled extensions)
        if (existing.installPath !== extDir || existing.manifestHash !== hash) {
          log.info('[ext-registry] Updating registry entry for "%s"', manifest.id)
          registry[manifest.id] = {
            ...existing,
            manifest,
            installPath: extDir,
            manifestHash: hash,
            source,
          }
          this.store.set('registry', registry)
        }
      } else {
        // New extension — register it
        log.info('[ext-registry] Registering new extension: "%s" (%s)', manifest.name, manifest.id)
        const entry: InstalledExtension = {
          manifest,
          installPath: extDir,
          source,
          enabled: source === 'bundled', // Bundled extensions default to enabled
          installedAt: Date.now(),
          manifestHash: hash,
          grantedPermissions: source === 'bundled' ? [...manifest.permissions] : [],
          deniedPermissions: [],
          errorCount: 0,
          lastError: null,
        }
        registry[manifest.id] = entry
        this.store.set('registry', registry)
      }

      count++
    }

    return count
  }

  /** Remove registry entries whose directories no longer exist on disk. */
  private pruneOrphans(): void {
    const registry = this.store.get('registry')
    for (const [id, ext] of Object.entries(registry)) {
      if (!existsSync(ext.installPath)) {
        log.info('[ext-registry] Pruning orphaned extension: "%s" (path: %s)', id, ext.installPath)
        const updated = { ...registry }
        delete updated[id]
        this.store.set('registry', updated)
      }
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Get all registered extensions. */
  list(): InstalledExtension[] {
    const registry = this.store.get('registry')
    return Object.values(registry)
  }

  /** Get only enabled extensions. */
  listEnabled(): InstalledExtension[] {
    return this.list().filter((ext) => ext.enabled)
  }

  /** Get a single extension by ID. */
  get(extensionId: string): InstalledExtension | undefined {
    const registry = this.store.get('registry')
    return registry[extensionId]
  }

  /** Check if an extension ID is already registered. */
  has(extensionId: string): boolean {
    return !!this.get(extensionId)
  }

  /** Get all IPC channels registered by enabled extensions. */
  getAllExtensionChannels(): string[] {
    const channels: string[] = []
    for (const ext of this.listEnabled()) {
      if (ext.manifest.ipcChannels) {
        channels.push(...ext.manifest.ipcChannels)
      }
    }
    return channels
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Install an extension from an unpacked directory (post-zip extraction).
   * Returns the InstalledExtension entry or throws on validation failure.
   */
  install(sourceDir: string): InstalledExtension {
    const result = this.validator.validateDirectory(sourceDir)
    if (!result.valid || !result.manifest) {
      throw new Error(`Invalid extension: ${result.errors.join('; ')}`)
    }

    const manifest = result.manifest

    if (this.has(manifest.id)) {
      throw new Error(`Extension "${manifest.id}" is already installed. Uninstall it first.`)
    }

    // Copy to user extensions directory
    const targetDir = join(this.userDir, manifest.id)
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true })
    }
    cpSync(sourceDir, targetDir, { recursive: true })

    const hash = this.validator.hashManifest(targetDir)

    const entry: InstalledExtension = {
      manifest,
      installPath: targetDir,
      source: 'user',
      enabled: false, // User must enable after granting permissions
      installedAt: Date.now(),
      manifestHash: hash,
      grantedPermissions: [],
      deniedPermissions: [],
      errorCount: 0,
      lastError: null,
    }

    const registry = this.store.get('registry')
    registry[manifest.id] = entry
    this.store.set('registry', registry)
    log.info('[ext-registry] Installed extension: "%s" (%s)', manifest.name, manifest.id)
    return entry
  }

  /** Uninstall a user-installed extension. Bundled extensions can only be disabled. */
  uninstall(extensionId: string): void {
    const ext = this.get(extensionId)
    if (!ext) throw new Error(`Extension "${extensionId}" not found`)
    if (ext.source === 'bundled') {
      throw new Error(`Cannot uninstall bundled extension "${extensionId}". Disable it instead.`)
    }

    // Remove the extension directory
    if (existsSync(ext.installPath)) {
      rmSync(ext.installPath, { recursive: true })
    }

    // Remove from registry
    const registry = { ...this.store.get('registry') }
    delete registry[extensionId]
    this.store.set('registry', registry)

    log.info('[ext-registry] Uninstalled extension: "%s"', extensionId)
  }

  /** Enable or disable an extension. */
  setEnabled(extensionId: string, enabled: boolean): void {
    const ext = this.get(extensionId)
    if (!ext) throw new Error(`Extension "${extensionId}" not found`)

    this.updateEntry(extensionId, { enabled })
    log.info('[ext-registry] Extension "%s" %s', extensionId, enabled ? 'enabled' : 'disabled')
  }

  /** Grant permissions to an extension. */
  grantPermissions(extensionId: string, permissions: ExtensionPermission[]): void {
    const ext = this.get(extensionId)
    if (!ext) throw new Error(`Extension "${extensionId}" not found`)

    const current = new Set(ext.grantedPermissions)
    for (const perm of permissions) {
      current.add(perm)
    }
    const denied = ext.deniedPermissions.filter((p) => !current.has(p))

    this.updateEntry(extensionId, { grantedPermissions: [...current], deniedPermissions: denied })
    log.info('[ext-registry] Granted permissions to "%s": %s', extensionId, permissions.join(', '))
  }

  /** Revoke permissions from an extension. */
  revokePermissions(extensionId: string, permissions: ExtensionPermission[]): void {
    const ext = this.get(extensionId)
    if (!ext) throw new Error(`Extension "${extensionId}" not found`)

    const revokeSet = new Set(permissions)
    const granted = ext.grantedPermissions.filter((p) => !revokeSet.has(p))
    const denied = new Set(ext.deniedPermissions)
    for (const perm of permissions) {
      denied.add(perm)
    }

    this.updateEntry(extensionId, { grantedPermissions: granted, deniedPermissions: [...denied] })
    log.info('[ext-registry] Revoked permissions from "%s": %s', extensionId, permissions.join(', '))
  }

  /** Check if an extension has a specific permission granted. */
  hasPermission(extensionId: string, permission: ExtensionPermission): boolean {
    const ext = this.get(extensionId)
    if (!ext || !ext.enabled) return false
    return ext.grantedPermissions.includes(permission)
  }

  /** Record an error for an extension. Returns the new error count. */
  recordError(extensionId: string, error: string): number {
    const ext = this.get(extensionId)
    if (!ext) return 0

    const newCount = ext.errorCount + 1
    this.updateEntry(extensionId, { errorCount: newCount, lastError: error })

    log.warn('[ext-registry] Error #%d for "%s": %s', newCount, extensionId, error)
    return newCount
  }

  /** Reset error count (e.g., after re-enabling). */
  resetErrors(extensionId: string): void {
    this.updateEntry(extensionId, { errorCount: 0, lastError: null })
  }

  /**
   * Safely update fields on a registry entry.
   * electron-store uses dots as path separators, so we must read/write the
   * entire registry object to avoid mangling IDs that contain dots.
   */
  private updateEntry(extensionId: string, updates: Partial<InstalledExtension>): void {
    const registry = this.store.get('registry')
    const existing = registry[extensionId]
    if (!existing) return
    registry[extensionId] = { ...existing, ...updates }
    this.store.set('registry', registry)
  }

  /** Get the user extensions directory path. */
  getUserDir(): string {
    return this.userDir
  }

  /** Get the bundled extensions directory path. */
  getBundledDir(): string {
    return this.bundledDir
  }
}
