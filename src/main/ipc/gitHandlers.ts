import type { IpcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getSpawnEnv } from '../utils/shellEnv'

const execFileAsync = promisify(execFile)
const GIT_OPTS = { timeout: 15000, env: getSpawnEnv() }

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { ...GIT_OPTS, cwd })
  return stdout.trim()
}

interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: Array<{ file: string; status: string }>
  modified: Array<{ file: string; status: string }>
  untracked: string[]
}

interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  isAiCommit: boolean
}

interface GitWorktree {
  path: string
  branch: string
  commit: string
  isMain: boolean
}

async function getStatus(cwd: string): Promise<GitStatus> {
  const [branchRaw, statusRaw] = await Promise.all([
    git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    git(['status', '--porcelain', '-b'], cwd),
  ])

  const lines = statusRaw.split('\n')
  const branchLine = lines[0] ?? ''
  const aheadMatch = branchLine.match(/ahead (\d+)/)
  const behindMatch = branchLine.match(/behind (\d+)/)

  const staged: Array<{ file: string; status: string }> = []
  const modified: Array<{ file: string; status: string }> = []
  const untracked: string[] = []

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const idx = line[0]
    const wt = line[1]
    const file = line.slice(3)

    if (idx === '?') { untracked.push(file); continue }
    if (idx !== ' ' && idx !== '?') staged.push({ file, status: idx })
    if (wt !== ' ' && wt !== '?') modified.push({ file, status: wt })
  }

  return {
    branch: branchRaw,
    ahead: aheadMatch ? parseInt(aheadMatch[1]) : 0,
    behind: behindMatch ? parseInt(behindMatch[1]) : 0,
    staged, modified, untracked,
  }
}

async function getLog(cwd: string, limit = 20): Promise<GitCommit[]> {
  const raw = await git([
    'log', `--max-count=${limit}`,
    '--format=%H|||%h|||%s|||%an|||%aI',
  ], cwd)

  return raw.split('\n').filter(Boolean).map((line) => {
    const [hash, shortHash, message, author, date] = line.split('|||')
    const aiPattern = /co-authored-by:.*(?:claude|copilot)|ai-assisted|generated.*with/i
    return {
      hash, shortHash, message, author, date,
      isAiCommit: aiPattern.test(message) || aiPattern.test(author),
    }
  })
}

async function getDiff(cwd: string, ref?: string): Promise<string> {
  if (ref) {
    return git(['diff', ref], cwd)
  }
  return git(['diff', '--staged'], cwd).then((staged) =>
    staged || git(['diff'], cwd)
  )
}

async function getFileDiff(cwd: string, file: string): Promise<string> {
  return git(['diff', 'HEAD', '--', file], cwd)
}

async function listWorktrees(cwd: string): Promise<GitWorktree[]> {
  const raw = await git(['worktree', 'list', '--porcelain'], cwd)
  const worktrees: GitWorktree[] = []
  let current: Partial<GitWorktree> = {}

  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current as GitWorktree)
      current = { path: line.slice(9), isMain: false }
    } else if (line.startsWith('HEAD ')) {
      current.commit = line.slice(5, 12)
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace('refs/heads/', '')
    } else if (line === 'bare') {
      current.isMain = true
    }
  }
  if (current.path) worktrees.push(current as GitWorktree)

  // First worktree is the main one
  if (worktrees.length > 0) worktrees[0].isMain = true
  return worktrees
}

async function createWorktree(cwd: string, branchName: string): Promise<string> {
  const wtPath = join(cwd, '..', `${branchName}-worktree`)
  await git(['worktree', 'add', '-b', branchName, wtPath], cwd)
  return wtPath
}

async function removeWorktree(cwd: string, wtPath: string): Promise<void> {
  await git(['worktree', 'remove', wtPath], cwd)
}

function readBranchProtection(cwd: string): { protected: string[] } {
  const settingsPath = join(cwd, '.github', 'copilot', 'settings.json')
  if (!existsSync(settingsPath)) return { protected: ['main', 'master'] }
  try {
    const data = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>
    const branches = data['protectedBranches'] as string[] | undefined
    return { protected: branches ?? ['main', 'master'] }
  } catch {
    return { protected: ['main', 'master'] }
  }
}

export function registerGitHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('git:status', (_e, args: { cwd: string }) => getStatus(args.cwd))
  ipcMain.handle('git:log', (_e, args: { cwd: string; limit?: number }) => getLog(args.cwd, args.limit))
  ipcMain.handle('git:diff', (_e, args: { cwd: string; ref?: string }) => getDiff(args.cwd, args.ref))
  ipcMain.handle('git:file-diff', (_e, args: { cwd: string; file: string }) => getFileDiff(args.cwd, args.file))
  ipcMain.handle('git:revert-file', (_e, args: { cwd: string; file: string }) => git(['checkout', 'HEAD', '--', args.file], args.cwd))
  ipcMain.handle('git:worktrees', (_e, args: { cwd: string }) => listWorktrees(args.cwd))
  ipcMain.handle('git:create-worktree', (_e, args: { cwd: string; branch: string }) => createWorktree(args.cwd, args.branch))
  ipcMain.handle('git:remove-worktree', (_e, args: { cwd: string; path: string }) => removeWorktree(args.cwd, args.path))
  ipcMain.handle('git:branch-protection', (_e, args: { cwd: string }) => readBranchProtection(args.cwd))
}
