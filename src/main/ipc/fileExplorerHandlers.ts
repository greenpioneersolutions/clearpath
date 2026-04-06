import type { IpcMain } from 'electron'
import { readdirSync, statSync, watch } from 'fs'
import { join, relative, resolve } from 'path'
import type { WebContents } from 'electron'
import { assertPathWithinRoots, getWorkspaceAllowedRoots, isSensitiveSystemPath } from '../utils/pathSecurity'
import { checkRateLimit } from '../utils/rateLimiter'

interface FileEntry {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size: number
  modifiedAt: number
}

function readDir(dirPath: string, rootPath: string, depth = 0, maxDepth = 3): FileEntry[] {
  if (depth > maxDepth) return []
  const entries: FileEntry[] = []

  try {
    for (const name of readdirSync(dirPath)) {
      if (name.startsWith('.') || name === 'node_modules' || name === '__pycache__') continue
      const fullPath = join(dirPath, name)
      try {
        const stat = statSync(fullPath)
        const entry: FileEntry = {
          name,
          path: fullPath,
          relativePath: relative(rootPath, fullPath),
          isDirectory: stat.isDirectory(),
          size: stat.size,
          modifiedAt: stat.mtimeMs,
        }
        entries.push(entry)
        if (stat.isDirectory() && depth < maxDepth) {
          entries.push(...readDir(fullPath, rootPath, depth + 1, maxDepth))
        }
      } catch { /* skip inaccessible */ }
    }
  } catch { /* skip unreadable dir */ }

  return entries
}

const PROTECTED_PATTERNS = [
  /\.env/i, /\.pem$/i, /\.key$/i, /credentials/i, /secret/i,
  /config\/production/i, /\.aws\//i, /\.ssh\//i,
]

function isProtectedFile(filePath: string): boolean {
  return PROTECTED_PATTERNS.some((p) => p.test(filePath))
}

export function registerFileExplorerHandlers(ipcMain: IpcMain, getWebContents: () => WebContents | null): void {
  const watchers = new Map<string, ReturnType<typeof watch>>()

  ipcMain.handle('files:list', (_e, args: { cwd: string; maxDepth?: number }) => {
    try {
      assertPathWithinRoots(args.cwd, getWorkspaceAllowedRoots())
      if (isSensitiveSystemPath(args.cwd)) {
        return []
      }
    } catch {
      return []
    }
    return readDir(args.cwd, args.cwd, 0, args.maxDepth ?? 3)
  })

  ipcMain.handle('files:is-protected', (_e, args: { path: string }) => isProtectedFile(args.path))

  ipcMain.handle('files:watch', (_e, args: { cwd: string }) => {
    if (watchers.has(args.cwd)) return { already: true }

    const rl = checkRateLimit('files:watch')
    if (!rl.allowed) return { error: 'Too many file watchers — try again shortly' }

    try {
      assertPathWithinRoots(args.cwd, getWorkspaceAllowedRoots())
      if (isSensitiveSystemPath(args.cwd)) {
        return { error: 'Cannot watch sensitive directory' }
      }
    } catch {
      return { error: 'Directory not within allowed roots' }
    }

    try {
      const watcher = watch(args.cwd, { recursive: true }, (eventType, filename) => {
        if (!filename || filename.includes('node_modules')) return
        const wc = getWebContents()
        if (wc && !wc.isDestroyed()) {
          wc.send('files:changed', { cwd: args.cwd, eventType, filename })
        }
      })
      watchers.set(args.cwd, watcher)
      return { watching: true }
    } catch {
      return { error: 'Failed to watch directory' }
    }
  })

  ipcMain.handle('files:unwatch', (_e, args: { cwd: string }) => {
    const watcher = watchers.get(args.cwd)
    if (watcher) { watcher.close(); watchers.delete(args.cwd) }
    return { success: true }
  })
}
