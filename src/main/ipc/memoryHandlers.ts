import type { IpcMain } from 'electron'
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, statSync, unlinkSync,
} from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'

export interface ConfigFile {
  path: string
  name: string
  exists: boolean
  category: 'instructions' | 'settings' | 'agent' | 'skill' | 'command' | 'rule'
  cli: 'copilot' | 'claude' | 'both'
  isGlobal: boolean
}

export interface MemoryEntry {
  id: string
  path: string
  name: string
  content: string
  type: string
  description: string
  projectPath: string
  modifiedAt: number
}

function safeReadFile(p: string): string | null {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

function safeReadDir(dir: string): string[] {
  try { return readdirSync(dir) } catch { return [] }
}

function isDir(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}

function scanMdFiles(
  dir: string,
  category: ConfigFile['category'],
  cli: ConfigFile['cli'],
): ConfigFile[] {
  return safeReadDir(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      path: join(dir, f),
      name: f,
      exists: true,
      category,
      cli,
      isGlobal: false,
    }))
}

function listConfigFiles(
  cli: 'copilot' | 'claude',
  workingDirectory: string,
): ConfigFile[] {
  const home = homedir()
  const files: ConfigFile[] = []
  const add = (path: string, name: string, category: ConfigFile['category'], isGlobal = false) => {
    files.push({ path, name, exists: existsSync(path), category, cli, isGlobal })
  }

  if (cli === 'copilot') {
    add(join(workingDirectory, 'AGENTS.md'), 'AGENTS.md', 'instructions')
    add(join(workingDirectory, '.github', 'copilot', 'settings.json'), 'settings.json', 'settings')
    add(join(workingDirectory, '.github', 'copilot', 'settings.local.json'), 'settings.local.json', 'settings')
    add(join(home, '.copilot', 'config.json'), 'config.json (global)', 'settings', true)

    const agentsDir = join(workingDirectory, '.github', 'agents')
    files.push(
      ...safeReadDir(agentsDir)
        .filter((f) => f.endsWith('.agent.md') || f.endsWith('.md'))
        .map((f) => ({
          path: join(agentsDir, f),
          name: f,
          exists: true,
          category: 'agent' as const,
          cli: 'copilot' as const,
          isGlobal: false,
        })),
    )
  } else {
    add(join(workingDirectory, 'CLAUDE.md'), 'CLAUDE.md', 'instructions')
    add(join(home, '.claude', 'CLAUDE.md'), 'CLAUDE.md (global)', 'instructions', true)
    add(join(workingDirectory, '.claude', 'settings.json'), 'settings.json', 'settings')

    files.push(...scanMdFiles(join(workingDirectory, '.claude', 'agents'), 'agent', 'claude'))
    files.push(...scanMdFiles(join(workingDirectory, '.claude', 'skills'), 'skill', 'claude'))
    files.push(...scanMdFiles(join(workingDirectory, '.claude', 'commands'), 'command', 'claude'))
    files.push(...scanMdFiles(join(workingDirectory, '.claude', 'rules'), 'rule', 'claude'))
  }

  return files
}

function parseFrontmatter(content: string): { type: string; description: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return { type: 'unknown', description: '' }
  const fm = m[1]
  const type = (fm.match(/^type:\s*(.+)$/m)?.[1] ?? 'unknown').trim()
  const description = (fm.match(/^description:\s*(.+)$/m)?.[1] ?? '').trim()
  return { type, description }
}

function listMemoryEntries(cli: 'copilot' | 'claude'): MemoryEntry[] {
  const home = homedir()
  const entries: MemoryEntry[] = []

  if (cli === 'claude') {
    const projectsDir = join(home, '.claude', 'projects')
    for (const projectHash of safeReadDir(projectsDir)) {
      const projectDir = join(projectsDir, projectHash)
      if (!isDir(projectDir)) continue

      const memoryDir = join(projectDir, 'memory')
      for (const fileName of safeReadDir(memoryDir)) {
        if (!fileName.endsWith('.md')) continue
        const filePath = join(memoryDir, fileName)
        const content = safeReadFile(filePath) ?? ''
        const { type, description } = parseFrontmatter(content)
        let modifiedAt = Date.now()
        try { modifiedAt = statSync(filePath).mtimeMs } catch { /* ok */ }

        entries.push({
          id: `${projectHash}/${fileName}`,
          path: filePath,
          name: fileName.replace(/\.md$/, ''),
          content,
          type,
          description,
          projectPath: projectHash.replace(/-/g, '/').replace(/^\/+/, ''),
          modifiedAt,
        })
      }
    }
  } else {
    const copilotDir = join(home, '.copilot')
    for (const fileName of safeReadDir(copilotDir)) {
      if (!fileName.endsWith('.md')) continue
      const filePath = join(copilotDir, fileName)
      const content = safeReadFile(filePath) ?? ''
      let modifiedAt = Date.now()
      try { modifiedAt = statSync(filePath).mtimeMs } catch { /* ok */ }

      entries.push({
        id: fileName,
        path: filePath,
        name: fileName.replace(/\.md$/, ''),
        content,
        type: 'unknown',
        description: '',
        projectPath: '~/.copilot',
        modifiedAt,
      })
    }
  }

  return entries.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

export function registerMemoryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'memory:list-files',
    (_e, args: { cli: 'copilot' | 'claude'; workingDirectory: string }) =>
      listConfigFiles(args.cli, args.workingDirectory),
  )

  ipcMain.handle('memory:read-file', (_e, args: { path: string }) => {
    const content = safeReadFile(args.path)
    if (content === null) return { error: 'File not found or unreadable' }
    return { content }
  })

  ipcMain.handle('memory:write-file', (_e, args: { path: string; content: string }) => {
    try {
      mkdirSync(dirname(args.path), { recursive: true })
      writeFileSync(args.path, args.content, 'utf8')
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('memory:delete-file', (_e, args: { path: string }) => {
    try {
      unlinkSync(args.path)
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle(
    'memory:list-memory-entries',
    (_e, args: { cli: 'copilot' | 'claude' }) => listMemoryEntries(args.cli),
  )
}
