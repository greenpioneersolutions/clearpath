import { app } from 'electron'
import { existsSync, accessSync, constants as fsConstants } from 'fs'
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
 * Resolve the clearmemory binary.
 *
 * - Tries the bundled location first (will only succeed once Slice F ships the
 *   binary in `resources/clearmemory/`).
 * - Falls back to the user's login-shell PATH.
 * - Returns `{ source: 'missing' }` with a user-facing install hint if neither
 *   location yields an executable binary.
 *
 * Callers should NEVER throw based on a missing binary — the UI handles it.
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

  return {
    path: '',
    source: 'missing',
    error: 'clearmemory binary not found. Install with: cargo install clearmemory',
  }
}
