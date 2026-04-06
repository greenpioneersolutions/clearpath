import { resolve, sep } from 'path'
import { realpathSync, lstatSync } from 'fs'
import { homedir } from 'os'

/**
 * Validate that a resolved path stays within one of the allowed root directories.
 * Resolves symlinks to prevent escape via symlink traversal.
 * Throws if the path escapes all allowed roots.
 */
export function assertPathWithinRoots(filePath: string, allowedRoots: string[]): string {
  const resolved = resolve(filePath)

  // Attempt to resolve symlinks (fall back to resolved path if target doesn't exist yet)
  let real: string
  try {
    real = realpathSync(resolved)
  } catch {
    // File may not exist yet (e.g., creating a new file). Validate the parent instead.
    const parent = resolve(resolved, '..')
    try {
      real = realpathSync(parent) + sep + resolved.split(sep).pop()
    } catch {
      real = resolved
    }
  }

  for (const root of allowedRoots) {
    const resolvedRoot = resolve(root)
    if (real === resolvedRoot || real.startsWith(resolvedRoot + sep)) {
      return real
    }
  }

  throw new Error(`Path not allowed: ${filePath} (resolves to ${real})`)
}

/**
 * Returns the standard set of allowed roots for memory/config file operations:
 * - ~/.claude/
 * - ~/.copilot/
 * - ~/.github/
 * - Current working directory
 * - Home directory .config/clear-path/
 */
export function getMemoryAllowedRoots(workingDirectory?: string): string[] {
  const home = homedir()
  const roots = [
    resolve(home, '.claude'),
    resolve(home, '.copilot'),
    resolve(home, '.github'),
  ]
  if (workingDirectory) {
    roots.push(resolve(workingDirectory))
  }
  // Also allow the current working directory
  roots.push(resolve(process.cwd()))
  return roots
}

/**
 * Returns allowed roots for workspace/file operations:
 * - Home directory and its subdirectories (but not system directories)
 */
export function getWorkspaceAllowedRoots(): string[] {
  const home = homedir()
  return [home]
}

/**
 * Check if a path points to a sensitive system location that should never be written to.
 */
export function isSensitiveSystemPath(filePath: string): boolean {
  const resolved = resolve(filePath)
  const home = homedir()

  const sensitivePatterns = [
    resolve(home, '.ssh'),
    resolve(home, '.aws'),
    resolve(home, '.gnupg'),
    resolve(home, '.config', 'gcloud'),
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/var',
    '/System',
    '/Library',
  ]

  return sensitivePatterns.some(
    (p) => resolved === p || resolved.startsWith(p + sep),
  )
}
