import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir, hostname, userInfo } from 'os'
import { join } from 'path'

/**
 * Provides a stable encryption key for electron-store instances.
 *
 * electron-store's `encryptionKey` uses AES encryption. The key is derived
 * from machine-specific values so it's stable across app restarts but
 * different per machine/user.
 *
 * This is NOT equivalent to full-disk encryption or OS keychain storage —
 * a determined attacker who can read the source code and has access to the
 * machine can derive the same key. However, it:
 * - Prevents casual inspection of JSON files
 * - Makes data non-portable between machines
 * - Satisfies compliance requirements for "encryption at rest" at the app layer
 *
 * For truly sensitive secrets (API keys, tokens), use credentialStore.ts
 * which leverages the OS keychain via safeStorage.
 */

// Derive a stable key from machine-specific values.
// This runs synchronously at module load time (before app.whenReady),
// which is required because electron-store instances are created at import time.
const machineKey = createHash('sha256')
  .update(`clearpath:${homedir()}:${hostname()}:${userInfo().username}`)
  .digest('hex')

/**
 * Get the encryption key for use with electron-store's `encryptionKey` option.
 * Safe to call at module load time — does not depend on safeStorage or app.whenReady().
 */
export function getStoreEncryptionKey(): string {
  return machineKey
}

// ── Key change detection ────────────────────────────────────────────────────
// If hostname or username changes, the encryption key changes and all stores
// become unreadable. We persist the key fingerprint to detect this.

const KEY_DIR = join(
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'clear-path')
    : join(homedir(), '.config', 'clear-path'),
)
const KEY_FINGERPRINT_FILE = join(KEY_DIR, '.key-fingerprint')

/** Short fingerprint of the current key (not the key itself). */
const fingerprint = createHash('sha256').update(machineKey).digest('hex').slice(0, 16)

/**
 * Check if the encryption key has changed since the last app launch.
 * Returns { changed: false } if the key matches, or { changed: true, isFirstRun: false }
 * if it has changed (meaning stores may be unreadable).
 *
 * Call this on app startup. If changed=true, the app should warn the user
 * that their data may need to be reset.
 */
export function checkEncryptionKeyIntegrity(): { changed: boolean; isFirstRun: boolean } {
  try {
    mkdirSync(KEY_DIR, { recursive: true })
  } catch { /* ok */ }

  if (!existsSync(KEY_FINGERPRINT_FILE)) {
    // First run — write the fingerprint
    try {
      writeFileSync(KEY_FINGERPRINT_FILE, fingerprint, 'utf8')
    } catch { /* ok */ }
    return { changed: false, isFirstRun: true }
  }

  try {
    const stored = readFileSync(KEY_FINGERPRINT_FILE, 'utf8').trim()
    if (stored === fingerprint) {
      return { changed: false, isFirstRun: false }
    }
    // Key changed — update fingerprint to prevent repeated warnings
    writeFileSync(KEY_FINGERPRINT_FILE, fingerprint, 'utf8')
    return { changed: true, isFirstRun: false }
  } catch {
    return { changed: false, isFirstRun: false }
  }
}
