import { readFileSync, existsSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { createHash } from 'crypto'
import { app } from 'electron'
import { assertPathWithinRoots } from '../utils/pathSecurity'
import { log } from '../utils/logger'
import type { ExtensionManifest } from './types'
import { VALID_PERMISSIONS } from './types'

/** Regex for reverse-domain extension IDs: com.example.my-extension */
const ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+){2,}$/

/** Result of manifest validation. */
export interface ValidationResult {
  valid: boolean
  manifest?: ExtensionManifest
  errors: string[]
}

/**
 * Validates extension manifests and directories.
 */
export class ExtensionValidator {
  /**
   * Parse and validate a clearpath-extension.json manifest from a directory.
   */
  validateDirectory(extensionDir: string): ValidationResult {
    const errors: string[] = []
    const manifestPath = join(extensionDir, 'clearpath-extension.json')

    // 1. Check manifest file exists
    if (!existsSync(manifestPath)) {
      return { valid: false, errors: ['Missing clearpath-extension.json'] }
    }

    // 2. Parse JSON
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch (err) {
      return { valid: false, errors: [`Invalid JSON in manifest: ${err}`] }
    }

    if (!raw || typeof raw !== 'object') {
      return { valid: false, errors: ['Manifest must be a JSON object'] }
    }

    const manifest = raw as Record<string, unknown>

    // 3. Required string fields
    for (const field of ['id', 'name', 'version', 'description', 'author']) {
      if (typeof manifest[field] !== 'string' || (manifest[field] as string).trim() === '') {
        errors.push(`Missing or empty required field: ${field}`)
      }
    }
    if (errors.length > 0) return { valid: false, errors }

    const id = manifest.id as string

    // 4. ID format
    if (!ID_PATTERN.test(id)) {
      errors.push(
        `Invalid extension ID "${id}". Must be reverse-domain format (e.g., com.example.my-extension), lowercase alphanumeric with hyphens.`,
      )
    }

    // 5. Permissions validation
    if (!Array.isArray(manifest.permissions)) {
      errors.push('permissions must be an array')
    } else {
      for (const perm of manifest.permissions) {
        if (typeof perm !== 'string' || !VALID_PERMISSIONS.has(perm)) {
          errors.push(`Unknown permission: "${perm}"`)
        }
      }
    }

    // 6. Entry point validation — paths must stay within the extension directory
    if (manifest.main && typeof manifest.main === 'string') {
      const mainPath = join(extensionDir, manifest.main)
      try {
        assertPathWithinRoots(mainPath, [extensionDir])
      } catch {
        errors.push(`main entry "${manifest.main}" resolves outside the extension directory (path traversal)`)
      }
      if (!existsSync(mainPath)) {
        errors.push(`main entry file not found: ${manifest.main}`)
      }
    }

    if (manifest.renderer && typeof manifest.renderer === 'string') {
      const rendererPath = join(extensionDir, manifest.renderer)
      try {
        assertPathWithinRoots(rendererPath, [extensionDir])
      } catch {
        errors.push(`renderer entry "${manifest.renderer}" resolves outside the extension directory (path traversal)`)
      }
      if (!existsSync(rendererPath)) {
        errors.push(`renderer entry file not found: ${manifest.renderer}`)
      }
    }

    // 7. IPC namespace enforcement
    if (manifest.ipcNamespace && typeof manifest.ipcNamespace === 'string') {
      const ns = manifest.ipcNamespace as string
      if (manifest.ipcChannels && Array.isArray(manifest.ipcChannels)) {
        for (const ch of manifest.ipcChannels) {
          if (typeof ch !== 'string' || !ch.startsWith(ns + ':')) {
            errors.push(`IPC channel "${ch}" must start with namespace "${ns}:"`)
          }
        }
      }
    }

    // 8. minAppVersion check
    if (manifest.minAppVersion && typeof manifest.minAppVersion === 'string') {
      const appVersion = app.getVersion()
      if (this.compareVersions(appVersion, manifest.minAppVersion) < 0) {
        errors.push(
          `Extension requires ClearPathAI v${manifest.minAppVersion} but current version is v${appVersion}`,
        )
      }
    }

    // 9. Icon path validation (if provided)
    if (manifest.icon && typeof manifest.icon === 'string') {
      const iconPath = join(extensionDir, manifest.icon)
      try {
        assertPathWithinRoots(iconPath, [extensionDir])
      } catch {
        errors.push(`icon path "${manifest.icon}" resolves outside the extension directory`)
      }
    }

    // 10. allowedDomains validation (if provided)
    if (manifest.allowedDomains !== undefined) {
      if (!Array.isArray(manifest.allowedDomains)) {
        errors.push('allowedDomains must be an array of strings')
      } else {
        for (const domain of manifest.allowedDomains) {
          if (typeof domain !== 'string' || domain.trim() === '') {
            errors.push(`Invalid domain in allowedDomains: "${domain}"`)
          }
          // Block localhost/private domains
          const lower = String(domain).toLowerCase()
          if (
            lower === 'localhost' ||
            lower.startsWith('127.') ||
            lower.startsWith('10.') ||
            lower.startsWith('192.168.') ||
            lower.startsWith('169.254.')
          ) {
            errors.push(`Blocked private/local domain in allowedDomains: "${domain}"`)
          }
        }
      }
    }

    // 11. storageQuota validation
    if (manifest.storageQuota !== undefined) {
      if (typeof manifest.storageQuota !== 'number' || manifest.storageQuota <= 0) {
        errors.push('storageQuota must be a positive number (bytes)')
      }
      // Cap at 50 MB
      if (typeof manifest.storageQuota === 'number' && manifest.storageQuota > 50 * 1024 * 1024) {
        errors.push('storageQuota cannot exceed 50 MB')
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors }
    }

    return { valid: true, manifest: manifest as unknown as ExtensionManifest, errors: [] }
  }

  /**
   * Compute a SHA-256 hash of the manifest file for integrity tracking.
   */
  hashManifest(extensionDir: string): string {
    const manifestPath = join(extensionDir, 'clearpath-extension.json')
    const content = readFileSync(manifestPath)
    return createHash('sha256').update(content).digest('hex')
  }

  /**
   * Simple semver comparison. Returns negative if a < b, 0 if equal, positive if a > b.
   */
  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const va = pa[i] ?? 0
      const vb = pb[i] ?? 0
      if (va !== vb) return va - vb
    }
    return 0
  }
}
