/**
 * Store corruption recovery handler.
 *
 * ORDERING REQUIREMENT: This module MUST be the very first import in index.ts.
 * Vite/Rollup bundles modules in dependency-tree order, so placing this first
 * ensures its module-level side effects (process.on + app.once registrations)
 * run before any electron-store constructor is ever called.
 *
 * WHY THIS EXISTS:
 * electron-store (via conf) reads and decrypts the store file synchronously in
 * its constructor. If the file is corrupted or the encryption key has changed,
 * the constructor throws a SyntaxError / crypto error. Because many handler
 * modules create Store instances at module-load time, a corrupted file crashes
 * the entire app before app.whenReady() is even registered — making it
 * impossible to show a dialog through normal means.
 *
 * HOW IT WORKS:
 * 1. process.on('uncaughtException') catches the Store constructor throw.
 *    The exception is swallowed (not re-thrown) so Node.js keeps the event
 *    loop alive and Electron can continue initializing.
 * 2. All store files are deleted synchronously right inside the handler so
 *    the very next launch starts with clean empty stores.
 * 3. app.once('ready') fires because Electron's C++ side (Chromium init)
 *    completes regardless of JS module-load failures. The handler shows a
 *    native dialog explaining what happened and lets the user restart or quit.
 */

import { app, dialog } from 'electron'
import { readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

function getStoreDir(): string {
  // app.getPath('userData') works before app.ready in Electron and returns
  // the exact directory that electron-store uses. Fall back to the conventional
  // path if the app object isn't ready yet (belt-and-suspenders).
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
 * Delete every clear-path-*.json store file by scanning the userData directory.
 * Uses a directory scan rather than a hardcoded list so new stores are covered
 * automatically without needing to update this file.
 */
function deleteAllStoreFiles(): void {
  const storeDir = getStoreDir()
  try {
    const entries = readdirSync(storeDir)
    for (const entry of entries) {
      if (entry.startsWith('clear-path-') && entry.endsWith('.json')) {
        try { unlinkSync(join(storeDir, entry)) } catch { /* ok — best-effort */ }
      }
    }
  } catch { /* ok — directory may not exist yet */ }

  // Clear the key fingerprint so checkEncryptionKeyIntegrity() treats the
  // next launch as a first run and doesn't emit a spurious "key changed" warning.
  try { unlinkSync(join(storeDir, '.key-fingerprint')) } catch { /* ok */ }
}

function isStoreCorruptionError(err: Error): boolean {
  const stack = err.stack ?? ''
  return (
    stack.includes('conf/dist/source/index.js') ||
    stack.includes('electron-store/index.js') ||
    (err instanceof SyntaxError && (
      err.message.includes('is not valid JSON') ||
      err.message.includes('Unexpected token')
    )) ||
    (err as NodeJS.ErrnoException).code === 'ERR_CRYPTO_INVALID_AUTH_TAG'
  )
}

async function showRecoveryDialog(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Quit', 'Restart App'],
    defaultId: 1,
    cancelId: 0,
    title: 'Corrupted Data Detected',
    message: 'ClearPath AI detected corrupted local data.',
    detail:
      'One or more data stores could not be loaded (corrupted file, disk error, ' +
      'or an encryption key change after a system migration).\n\n' +
      'All local app data has been cleared so the app can start cleanly. ' +
      'Your CLI tools, GitHub account, and any external services are not affected.\n\n' +
      'Click "Restart App" to relaunch now, or "Quit" to exit.',
  })

  if (response === 1) {
    app.relaunch()
    app.exit(0)
  } else {
    app.quit()
  }
}

// ── Module-level side effects (run immediately when this module is first evaluated) ──

let _recoveryMode = false

/**
 * Catch Store constructor crashes that happen during module loading.
 * When caught, stores are deleted immediately and a flag is set.
 * The exception is swallowed so the Node.js event loop stays alive.
 */
process.on('uncaughtException', (err: Error) => {
  if (isStoreCorruptionError(err) && !_recoveryMode) {
    _recoveryMode = true
    // Delete stores synchronously — must happen now so the relaunch is clean.
    deleteAllStoreFiles()
    // Do NOT re-throw. Letting the event loop continue allows app.ready to fire
    // so we can show the recovery dialog.
    return
  }

  // Not a store error (or already handled). Re-throw so Node.js default
  // handling applies (process exit with stack trace visible in dev).
  throw err
})

/**
 * Show the recovery dialog once Electron's Chromium side is ready.
 * This fires even when module loading crashed, because app.ready is emitted
 * by Electron's C++ layer regardless of JS failures.
 *
 * In normal (non-crash) startups, _recoveryMode is false and this is a no-op.
 */
function registerRecoveryHandler(): void {
  app.once('ready', () => {
    if (!_recoveryMode) return
    void showRecoveryDialog()
  })
}

// Guard against the rare edge case where app.ready already fired before this
// module was evaluated (e.g. very fast Chromium init on subsequent restarts).
if (app.isReady()) {
  if (_recoveryMode) void showRecoveryDialog()
} else {
  registerRecoveryHandler()
}
