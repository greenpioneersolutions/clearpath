import { app } from 'electron'
import { existsSync, accessSync, constants as fsConstants } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { resolveInShell } from '../utils/shellEnv'

// ── ClearMemory binary resolution ────────────────────────────────────────────
// Resolves the `clearmemory` binary from one of two sources:
//   1. A bundled copy shipped inside the Electron resources tree (Slice F will
//      populate this — in Slice B the directory is typically empty and we fall
//      through to the PATH fallback).
//   2. The user's login-shell PATH via `which clearmemory`.
//
// Security: the binary name is hard-coded; we never accept a caller-supplied
// path. Resolution failure is a first-class return value, not an exception —
// the UI needs to render a graceful install CTA.

export type BinarySource = 'bundled' | 'path' | 'missing'

export interface BinaryResolution {
  path: string
  source: BinarySource
  error?: string
}

const BINARY_NAME = process.platform === 'win32' ? 'clearmemory.exe' : 'clearmemory'

/** Return the expected bundled path (may or may not exist on disk). */
function bundledBinaryPath(): string {
  if (app.isPackaged) {
    // In packaged builds, extraResources live under process.resourcesPath
    return join(process.resourcesPath, 'clearmemory', BINARY_NAME)
  }
  // In dev / unpackaged, we use the project-root `resources/clearmemory/` folder
  // so the same layout works in both modes.
  return join(app.getAppPath(), 'resources', 'clearmemory', BINARY_NAME)
}

/** Check if a file exists AND is executable by the current process. */
function isExecutable(filePath: string): boolean {
  if (!existsSync(filePath)) return false
  try {
    // On Windows, X_OK is effectively ignored — existsSync is the real check.
    accessSync(filePath, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Well-known absolute install locations to probe before declaring the binary
 * missing. These cover common cases where the binary exists but isn't on the
 * user's login-shell PATH (cargo install drops binaries here, but ~/.cargo/bin
 * isn't always on PATH unless rustup wrote a shell-rc snippet).
 */
function wellKnownInstallPaths(): string[] {
  const home = homedir()
  return [
    join(home, '.cargo', 'bin', BINARY_NAME),       // `cargo install` default
    join(home, '.local', 'bin', BINARY_NAME),       // user-bin convention
    '/usr/local/bin/' + BINARY_NAME,                // homebrew on x86 macOS / Linux
    '/opt/homebrew/bin/' + BINARY_NAME,             // homebrew on Apple Silicon
  ]
}

/**
 * Resolve the clearmemory binary.
 *
 * Resolution order:
 *   1. Bundled copy under `resources/clearmemory/` (Slice F).
 *   2. `which clearmemory` via the user's login shell (catches anything on PATH).
 *   3. Well-known absolute install paths (~/.cargo/bin, ~/.local/bin, brew dirs)
 *      — this saves users whose login shell doesn't export ~/.cargo/bin.
 *
 * Returns `{ source: 'missing' }` with a user-facing install hint if every
 * probe fails. Callers should NEVER throw based on a missing binary — the UI
 * handles it.
 */
export async function resolveClearMemoryBinary(): Promise<BinaryResolution> {
  // 1) Bundled copy
  const bundled = bundledBinaryPath()
  if (isExecutable(bundled)) {
    return { path: bundled, source: 'bundled' }
  }

  // 2) PATH fallback via the login shell (matches AuthManager's CLI detection
  //    pattern — ensures nvm / homebrew / ~/.local/bin etc. are all searched).
  const onPath = await resolveInShell('clearmemory')
  if (onPath && isExecutable(onPath)) {
    return { path: onPath, source: 'path' }
  }

  // 3) Well-known absolute install locations. cargo install puts binaries in
  //    ~/.cargo/bin but doesn't add it to PATH unless rustup managed the
  //    install. We probe absolute paths so the user doesn't have to fix their
  //    shell rc just to use the app.
  for (const candidate of wellKnownInstallPaths()) {
    if (isExecutable(candidate)) {
      return { path: candidate, source: 'path' }
    }
  }

  return {
    path: '',
    source: 'missing',
    error: 'clearmemory binary not found. Install from source: cargo install --git https://github.com/greenpioneersolutions/clearmemory clearmemory',
  }
}
