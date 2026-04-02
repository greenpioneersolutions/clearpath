import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, statSync,
} from 'fs'
import { join, basename } from 'path'
import type { CLIManager } from '../cli/CLIManager'

interface KBFile {
  name: string
  path: string
  content: string
  lastUpdated: number
}

interface KBSection {
  id: string
  label: string
  filename: string
  prompt: string
}

const SECTIONS: KBSection[] = [
  { id: 'overview', label: 'Project Overview', filename: '01-overview.md', prompt: 'Write a project overview explaining: what this project does, its purpose, who it\'s for, and the key problems it solves.' },
  { id: 'architecture', label: 'Architecture', filename: '02-architecture.md', prompt: 'Document the architecture: component relationships, data flow between layers, key design patterns used, and how the system is structured.' },
  { id: 'directory', label: 'Directory Structure', filename: '03-directory-structure.md', prompt: 'Explain the directory structure: what each top-level directory contains, the organizational convention, and where to find specific types of files.' },
  { id: 'modules', label: 'Key Modules', filename: '04-key-modules.md', prompt: 'Document the key modules: what each major module does, its responsibilities, its public API, and how it interacts with other modules.' },
  { id: 'api', label: 'API Surface', filename: '05-api-surface.md', prompt: 'Document the API surface: endpoints, functions, classes, their parameters, return types, and usage examples.' },
  { id: 'data-models', label: 'Data Models', filename: '06-data-models.md', prompt: 'Document data models and database schema if applicable: entity relationships, field descriptions, validation rules, and migrations.' },
  { id: 'config', label: 'Configuration', filename: '07-configuration.md', prompt: 'Document configuration and environment variables: what each config option does, default values, and how to change them.' },
  { id: 'build-deploy', label: 'Build & Deploy', filename: '08-build-deploy.md', prompt: 'Document the build and deployment process: build commands, CI/CD pipeline, deployment targets, and release process.' },
  { id: 'testing', label: 'Testing Strategy', filename: '09-testing.md', prompt: 'Document the testing strategy: test frameworks used, how to run tests, test conventions, coverage expectations, and CI integration.' },
  { id: 'dependencies', label: 'Dependencies', filename: '10-dependencies.md', prompt: 'Document key dependencies: what each major dependency does, why it was chosen, and any version constraints.' },
]

function getKBDir(workingDirectory: string): string {
  return join(workingDirectory, '.clear-path', 'knowledge-base')
}

function listKBFiles(workingDirectory: string): KBFile[] {
  const dir = getKBDir(workingDirectory)
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const path = join(dir, f)
      return {
        name: f.replace(/\.md$/, '').replace(/^\d+-/, ''),
        path,
        content: readFileSync(path, 'utf8'),
        lastUpdated: statSync(path).mtimeMs,
      }
    })
}

function searchKB(workingDirectory: string, query: string): Array<{ file: string; snippet: string; line: number }> {
  const files = listKBFiles(workingDirectory)
  const results: Array<{ file: string; snippet: string; line: number }> = []
  const q = query.toLowerCase()

  for (const file of files) {
    const lines = file.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        results.push({
          file: file.name,
          snippet: lines.slice(Math.max(0, i - 1), i + 2).join('\n'),
          line: i + 1,
        })
      }
    }
  }

  return results.slice(0, 50)
}

export function registerKnowledgeBaseHandlers(ipcMain: IpcMain, cliManager: CLIManager): void {
  ipcMain.handle('kb:list-files', (_e, args: { cwd: string }) => listKBFiles(args.cwd))

  ipcMain.handle('kb:read-file', (_e, args: { path: string }) => {
    try { return { content: readFileSync(args.path, 'utf8') } }
    catch { return { error: 'File not found' } }
  })

  ipcMain.handle('kb:search', (_e, args: { cwd: string; query: string }) =>
    searchKB(args.cwd, args.query),
  )

  ipcMain.handle('kb:get-sections', () => SECTIONS)

  ipcMain.handle('kb:generate', async (_e, args: {
    cwd: string
    sectionIds: string[]
    cli: 'copilot' | 'claude'
    model?: string
    maxBudget?: number
    depth: 'quick' | 'standard' | 'deep'
  }) => {
    const kbDir = getKBDir(args.cwd)
    mkdirSync(kbDir, { recursive: true })

    const depthInstruction = args.depth === 'quick'
      ? 'Be concise — 1-2 paragraphs per topic.'
      : args.depth === 'deep'
        ? 'Be exhaustive — include code examples, edge cases, and detailed explanations.'
        : 'Provide detailed but focused coverage.'

    const selectedSections = SECTIONS.filter((s) => args.sectionIds.includes(s.id))
    const results: Array<{ sectionId: string; status: string }> = []

    for (const section of selectedSections) {
      const fullPrompt = `${section.prompt}\n\n${depthInstruction}\n\nOutput your response as well-formatted Markdown. Do not include any preamble or meta-commentary — just the documentation content.`

      try {
        const info = await cliManager.spawnSubAgent({
          name: `KB: ${section.label}`,
          cli: args.cli,
          prompt: fullPrompt,
          model: args.model,
          workingDirectory: args.cwd,
          maxBudget: args.maxBudget ? args.maxBudget / selectedSections.length : undefined,
        })

        // Wait for completion
        const maxWait = 300_000
        const start = Date.now()
        while (Date.now() - start < maxWait) {
          await new Promise((r) => setTimeout(r, 2000))
          const agents = cliManager.listSubAgents()
          const agent = agents.find((a) => a.id === info.id)
          if (!agent || agent.status !== 'running') break
        }

        const output = cliManager.getSubAgentOutput(info.id)
        const content = output
          .filter((o) => o.type === 'text')
          .map((o) => o.content)
          .join('')

        if (content.trim()) {
          writeFileSync(join(kbDir, section.filename), content.trim() + '\n', 'utf8')
          results.push({ sectionId: section.id, status: 'success' })
        } else {
          results.push({ sectionId: section.id, status: 'empty' })
        }
      } catch {
        results.push({ sectionId: section.id, status: 'failed' })
      }
    }

    return { results, kbDir }
  })

  ipcMain.handle('kb:update', async (_e, args: { cwd: string; cli: 'copilot' | 'claude'; model?: string }) => {
    const kbDir = getKBDir(args.cwd)
    if (!existsSync(kbDir)) return { error: 'No knowledge base found. Generate one first.' }

    const prompt = 'Review the existing knowledge base files in .clear-path/knowledge-base/ against the current state of the codebase. Update any sections that are outdated, add coverage for new modules or files, and note any significant architectural changes since the last update.'

    const info = await cliManager.spawnSubAgent({
      name: 'KB: Update',
      cli: args.cli, prompt,
      model: args.model,
      workingDirectory: args.cwd,
      permissionMode: 'acceptEdits',
    })

    return { agentId: info.id, status: 'started' }
  })

  ipcMain.handle('kb:ask', async (_e, args: { cwd: string; question: string; cli: 'copilot' | 'claude' }) => {
    const kbDir = getKBDir(args.cwd)
    const context = existsSync(kbDir)
      ? `Use the knowledge base documentation in ${kbDir} as context. `
      : ''

    const prompt = `${context}Answer this question about the codebase: ${args.question}`

    const info = await cliManager.spawnSubAgent({
      name: `KB Q&A: ${args.question.slice(0, 30)}`,
      cli: args.cli, prompt,
      workingDirectory: args.cwd,
      permissionMode: 'plan',
    })

    return { agentId: info.id }
  })

  ipcMain.handle('kb:export-merged', (_e, args: { cwd: string }) => {
    const files = listKBFiles(args.cwd)
    if (files.length === 0) return { error: 'No knowledge base files found' }

    const merged = files
      .map((f) => `# ${f.name.charAt(0).toUpperCase() + f.name.slice(1)}\n\n${f.content}`)
      .join('\n\n---\n\n')

    return { content: merged }
  })

  ipcMain.handle('kb:export-file', async (_e, args: { cwd: string }) => {
    const files = listKBFiles(args.cwd)
    if (files.length === 0) return { error: 'No knowledge base files found' }

    const merged = files
      .map((f) => `# ${f.name.charAt(0).toUpperCase() + f.name.slice(1)}\n\n${f.content}`)
      .join('\n\n---\n\n')

    const result = await dialog.showSaveDialog({
      defaultPath: 'knowledge-base.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    writeFileSync(result.filePath, merged, 'utf8')
    return { path: result.filePath }
  })
}
