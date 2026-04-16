import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import Store from 'electron-store'
import { existsSync, statSync, mkdirSync } from 'fs'
import { basename, resolve, join, dirname } from 'path'
import { homedir } from 'os'
import { assertPathWithinRoots, getWorkspaceAllowedRoots, isSensitiveSystemPath } from '../utils/pathSecurity'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import { getScopedSpawnEnv } from '../utils/shellEnv'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { checkRateLimit } from '../utils/rateLimiter'

const execFileAsync = promisify(execFile)

interface Workspace {
  id: string
  name: string
  description: string
  repoPaths: string[]
  createdAt: number
}

interface RepoInfo {
  path: string
  name: string
  branch: string
  lastCommit: string
  lastAuthor: string
  uncommittedCount: number
}

interface WorkspaceStoreSchema {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
}

const store = new Store<WorkspaceStoreSchema>({
  name: 'clear-path-workspaces',
  encryptionKey: getStoreEncryptionKey(),
  defaults: { workspaces: [], activeWorkspaceId: null },
})

async function getRepoInfo(path: string): Promise<RepoInfo | null> {
  if (!existsSync(path)) return null
  try {
    const opts = { cwd: path, timeout: 10000, env: getScopedSpawnEnv('copilot') }
    const [branchRes, logRes, statusRes] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts),
      execFileAsync('git', ['log', '-1', '--format=%s|||%an'], opts),
      execFileAsync('git', ['status', '--porcelain'], opts),
    ])
    const [lastCommit, lastAuthor] = logRes.stdout.trim().split('|||')
    return {
      path, name: basename(path),
      branch: branchRes.stdout.trim(),
      lastCommit: lastCommit ?? '', lastAuthor: lastAuthor ?? '',
      uncommittedCount: statusRes.stdout.trim().split('\n').filter(Boolean).length,
    }
  } catch {
    return { path, name: basename(path), branch: 'unknown', lastCommit: '', lastAuthor: '', uncommittedCount: 0 }
  }
}

async function getActivityFeed(paths: string[], limit = 30): Promise<Array<{
  hash: string; message: string; author: string; date: string; repo: string
}>> {
  const entries: Array<{ hash: string; message: string; author: string; date: string; repo: string; ts: number }> = []
  for (const p of paths) {
    try {
      const { stdout } = await execFileAsync('git', [
        'log', `--max-count=${limit}`, '--format=%H|||%s|||%an|||%aI',
      ], { cwd: p, timeout: 10000, env: getScopedSpawnEnv('copilot') })
      const repo = basename(p)
      for (const line of stdout.trim().split('\n').filter(Boolean)) {
        const [hash, message, author, date] = line.split('|||')
        entries.push({ hash, message, author, date, repo, ts: new Date(date).getTime() })
      }
    } catch { /* skip */ }
  }
  return entries.sort((a, b) => b.ts - a.ts).slice(0, limit)
}

export function registerWorkspaceHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('workspace:list', () => store.get('workspaces'))
  ipcMain.handle('workspace:get-active', () => store.get('activeWorkspaceId'))

  ipcMain.handle('workspace:create', (_e, args: { name: string; description?: string }) => {
    const ws: Workspace = {
      id: randomUUID(), name: args.name, description: args.description ?? '',
      repoPaths: [], createdAt: Date.now(),
    }
    const workspaces = store.get('workspaces')
    workspaces.push(ws)
    store.set('workspaces', workspaces)
    return ws
  })

  ipcMain.handle('workspace:set-active', (_e, args: { id: string | null }) => {
    store.set('activeWorkspaceId', args.id)
    return { success: true }
  })

  ipcMain.handle('workspace:add-repo', async (_e, args: { workspaceId: string }) => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    const workspaces = store.get('workspaces')
    const ws = workspaces.find((w) => w.id === args.workspaceId)
    if (!ws) return { error: 'Workspace not found' }
    const path = result.filePaths[0]
    if (!ws.repoPaths.includes(path)) ws.repoPaths.push(path)
    store.set('workspaces', workspaces)
    return { path }
  })

  ipcMain.handle('workspace:remove-repo', (_e, args: { workspaceId: string; path: string }) => {
    const workspaces = store.get('workspaces')
    const ws = workspaces.find((w) => w.id === args.workspaceId)
    if (ws) {
      ws.repoPaths = ws.repoPaths.filter((p) => p !== args.path)
      store.set('workspaces', workspaces)
    }
    return { success: true }
  })

  ipcMain.handle('workspace:delete', (_e, args: { id: string }) => {
    store.set('workspaces', store.get('workspaces').filter((w) => w.id !== args.id))
    if (store.get('activeWorkspaceId') === args.id) store.set('activeWorkspaceId', null)
    return { success: true }
  })

  ipcMain.handle('workspace:get-repo-info', async (_e, args: { paths: string[] }) => {
    const results = await Promise.all(args.paths.map(getRepoInfo))
    return results.filter(Boolean)
  })

  ipcMain.handle('workspace:activity-feed', (_e, args: { paths: string[]; limit?: number }) =>
    getActivityFeed(args.paths, args.limit),
  )

  // Clone a repo from URL into a workspace
  ipcMain.handle('workspace:clone-repo', async (_e, args: { workspaceId: string; url: string; targetDir?: string }) => {
    const rl = checkRateLimit('workspace:clone-repo')
    if (!rl.allowed) return { success: false, error: 'Rate limited — too many clone operations' }
    const workspaces = store.get('workspaces')
    const ws = workspaces.find((w) => w.id === args.workspaceId)
    if (!ws) return { success: false, error: 'Workspace not found' }

    // Derive repo name from URL
    const repoName = args.url.replace(/\.git$/, '').split('/').pop() ?? 'repo'

    // Determine target directory
    let cloneDir: string
    if (args.targetDir) {
      // Validate targetDir is within allowed roots and not a sensitive path
      try {
        assertPathWithinRoots(args.targetDir, getWorkspaceAllowedRoots())
        if (isSensitiveSystemPath(args.targetDir)) {
          return { success: false, error: 'Cannot clone into sensitive system directory' }
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
      cloneDir = resolve(args.targetDir)
    } else {
      // Default to ~/ClearPath-repos/<workspace-name>/<repo-name>
      const home = homedir()
      const safeWsName = ws.name.replace(/[^a-zA-Z0-9_-]/g, '-')
      cloneDir = join(home, 'ClearPath-repos', safeWsName, repoName)
    }

    // Check if already exists
    if (existsSync(cloneDir)) {
      // Directory exists — check if it's the same repo, if so just add it
      try {
        const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
          cwd: cloneDir, timeout: 5000, env: getScopedSpawnEnv('copilot'),
        })
        if (stdout.trim() === args.url || stdout.trim() === args.url.replace(/\.git$/, '')) {
          // Same repo, just add to workspace
          if (!ws.repoPaths.includes(cloneDir)) {
            ws.repoPaths.push(cloneDir)
            store.set('workspaces', workspaces)
          }
          return { success: true, path: cloneDir, alreadyExisted: true }
        }
      } catch { /* not a git repo or different remote */ }
      return { success: false, error: `Directory already exists: ${cloneDir}` }
    }

    // Clone
    try {
      mkdirSync(dirname(cloneDir), { recursive: true })

      await execFileAsync('git', ['clone', args.url, cloneDir], {
        timeout: 120_000, // 2 minutes for large repos
        env: getScopedSpawnEnv('copilot'),
      })

      // Add to workspace
      if (!ws.repoPaths.includes(cloneDir)) {
        ws.repoPaths.push(cloneDir)
        store.set('workspaces', workspaces)
      }

      return { success: true, path: cloneDir }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Update workspace metadata
  ipcMain.handle('workspace:update', (_e, args: { id: string; name?: string; description?: string }) => {
    const workspaces = store.get('workspaces')
    const ws = workspaces.find((w) => w.id === args.id)
    if (!ws) return { error: 'Workspace not found' }
    if (args.name !== undefined) ws.name = args.name
    if (args.description !== undefined) ws.description = args.description
    store.set('workspaces', workspaces)
    return { success: true }
  })
}
