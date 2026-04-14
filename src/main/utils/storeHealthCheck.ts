import Store from 'electron-store'
import { readdirSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { homedir } from 'os'
import { getStoreEncryptionKey } from './storeEncryption'

/**
 * Resolve the userData directory — the same location electron-store uses.
 * Called after app.whenReady() so app.getPath() is fully initialized.
 */
function getStoreDir(): string {
  try {
    return app.getPath('userData')
  } catch {
    return join(
      process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'clear-path')
        : join(homedir(), '.config', 'clear-path'),
    )
  }
}

/**
 * Probe all existing clear-path-*.json store files for corruption by
 * attempting a full read. Only checks files that exist on disk — missing
 * files are a fresh/empty store, not corruption.
 *
 * Uses a directory scan rather than a hardcoded name list so new stores
 * added in the future are covered automatically.
 *
 * Must be called after app.whenReady().
 *
 * @returns Array of store names (without .json) that failed to load.
 */
export function probeAllStores(): string[] {
  const corrupted: string[] = []
  const encryptionKey = getStoreEncryptionKey()
  const storeDir = getStoreDir()

  let entries: string[]
  try {
    entries = readdirSync(storeDir)
  } catch {
    return [] // Directory doesn't exist yet — fresh install, nothing to probe
  }

  for (const entry of entries) {
    if (!entry.startsWith('clear-path-') || !entry.endsWith('.json')) continue
    const name = entry.slice(0, -5) // strip .json
    try {
      const s = new Store<Record<string, unknown>>({ name, encryptionKey })
      void s.store // Force a full read — surfaces decryption and parse errors
    } catch {
      corrupted.push(name)
    }
  }

  return corrupted
}

/**
 * Delete all clear-path-*.json store files so the app can start fresh.
 * Also clears the encryption key fingerprint so the key-change warning
 * does not fire on the next launch.
 *
 * Uses a directory scan so future stores are covered without code changes.
 *
 * @returns Lists of successfully deleted and failed store file names.
 */
export function clearAllStoreFiles(): { deleted: string[]; failed: string[] } {
  const deleted: string[] = []
  const failed: string[] = []
  const storeDir = getStoreDir()

  let entries: string[]
  try {
    entries = readdirSync(storeDir)
  } catch {
    return { deleted, failed }
  }

  for (const entry of entries) {
    if (!entry.startsWith('clear-path-') || !entry.endsWith('.json')) continue
    const fp = join(storeDir, entry)
    try {
      unlinkSync(fp)
      deleted.push(entry)
    } catch {
      failed.push(entry)
    }
  }

  // Remove the key fingerprint so checkEncryptionKeyIntegrity() treats the
  // next launch as a first run rather than emitting a "key changed" warning.
  try {
    const fp = join(storeDir, '.key-fingerprint')
    if (existsSync(fp)) unlinkSync(fp)
  } catch { /* ok — non-fatal */ }

  return { deleted, failed }
}
