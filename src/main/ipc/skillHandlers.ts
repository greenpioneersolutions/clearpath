import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import Store from 'electron-store'
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  readdirSync, statSync, renameSync, unlinkSync, copyFileSync,
} from 'fs'
import { join, basename, dirname } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import { assertPathWithinRoots, isSensitiveSystemPath } from '../utils/pathSecurity'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { STARTER_SKILLS } from '../starter-pack'

// ── Types ────────────────────────────────────────────────────────────────────

interface SkillInfo {
  id: string
  name: string
  description: string
  scope: 'project' | 'global' | 'plugin' | 'team'
  cli: 'copilot' | 'claude' | 'both'
  path: string
  dirPath: string
  enabled: boolean
  autoInvoke: boolean
  autoInvokeTrigger?: string
  tools?: string[]
  model?: string
  content: string
  frontmatter: Record<string, unknown>
  modifiedAt: number
}

interface SkillStoreSchema {
  usageStats: Record<string, { count: number; lastUsed: number }>
  recommendations: string[]
}

const store = new Store<SkillStoreSchema>({
  name: 'clear-path-skills',
  encryptionKey: getStoreEncryptionKey(),
  defaults: { usageStats: {}, recommendations: [] },
})

// ── Frontmatter parsing ──────────────────────────────────────────────────────

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/)
  if (!match) return { frontmatter: {}, body: content }

  const fm: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      const val = line.slice(colonIdx + 1).trim()
      // Handle arrays (simple inline format)
      if (val.startsWith('[') && val.endsWith(']')) {
        fm[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
      } else if (val === 'true') fm[key] = true
      else if (val === 'false') fm[key] = false
      else fm[key] = val.replace(/^["']|["']$/g, '')
    }
  }
  return { frontmatter: fm, body: match[2].trim() }
}

function buildSkillMd(frontmatter: Record<string, unknown>, body: string): string {
  const lines = ['---']
  for (const [key, val] of Object.entries(frontmatter)) {
    if (val === undefined || val === null || val === '') continue
    if (Array.isArray(val)) {
      lines.push(`${key}: [${val.map((v) => `"${v}"`).join(', ')}]`)
    } else {
      lines.push(`${key}: ${val}`)
    }
  }
  lines.push('---', '', body)
  return lines.join('\n') + '\n'
}

// ── Disk scanning ────────────────────────────────────────────────────────────

function scanSkillDir(dir: string, scope: SkillInfo['scope'], cli: SkillInfo['cli']): SkillInfo[] {
  if (!existsSync(dir)) return []
  const skills: SkillInfo[] = []

  for (const entry of readdirSync(dir)) {
    const entryPath = join(dir, entry)

    // Check for SKILL.md directly
    if (entry.toUpperCase() === 'SKILL.MD' || entry.toUpperCase() === 'SKILL.MD.DISABLED') {
      const enabled = !entry.endsWith('.disabled')
      const content = readFileSync(entryPath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(content)
      skills.push(makeSkillInfo(entryPath, dir, content, frontmatter, body, scope, cli, enabled))
      continue
    }

    // Check subdirectories for SKILL.md
    if (statSync(entryPath).isDirectory()) {
      const skillFile = join(entryPath, 'SKILL.md')
      const disabledFile = join(entryPath, 'SKILL.md.disabled')
      const filePath = existsSync(skillFile) ? skillFile : existsSync(disabledFile) ? disabledFile : null
      if (filePath) {
        const enabled = filePath === skillFile
        const content = readFileSync(filePath, 'utf8')
        const { frontmatter, body } = parseFrontmatter(content)
        skills.push(makeSkillInfo(filePath, entryPath, content, frontmatter, body, scope, cli, enabled))
      }
    }
  }

  return skills
}

function makeSkillInfo(
  path: string, dirPath: string, content: string,
  frontmatter: Record<string, unknown>, body: string,
  scope: SkillInfo['scope'], cli: SkillInfo['cli'], enabled: boolean,
): SkillInfo {
  let modifiedAt = Date.now()
  try { modifiedAt = statSync(path).mtimeMs } catch { /* ok */ }

  const autoInvoke = !!(frontmatter['autoInvoke'] || frontmatter['auto_invoke'] || frontmatter['globs'])
  let autoInvokeTrigger: string | undefined
  if (frontmatter['globs']) autoInvokeTrigger = `Files: ${frontmatter['globs']}`
  else if (frontmatter['autoInvoke']) autoInvokeTrigger = String(frontmatter['autoInvoke'])

  return {
    id: `${scope}:${basename(dirPath)}`,
    name: String(frontmatter['name'] ?? basename(dirPath)),
    description: String(frontmatter['description'] ?? ''),
    scope, cli, path, dirPath, enabled, autoInvoke, autoInvokeTrigger,
    tools: Array.isArray(frontmatter['tools']) ? frontmatter['tools'] as string[] : undefined,
    model: frontmatter['model'] ? String(frontmatter['model']) : undefined,
    content, frontmatter, modifiedAt,
  }
}

function listAllSkills(workingDirectory: string): SkillInfo[] {
  const home = homedir()
  const skills: SkillInfo[] = []

  // Claude Code skills
  skills.push(...scanSkillDir(join(workingDirectory, '.claude', 'skills'), 'project', 'claude'))
  skills.push(...scanSkillDir(join(home, '.claude', 'skills'), 'global', 'claude'))

  // Copilot skills (plugin-based or .github/)
  skills.push(...scanSkillDir(join(workingDirectory, '.github'), 'project', 'copilot'))
  skills.push(...scanSkillDir(join(home, '.copilot', 'skills'), 'global', 'copilot'))

  // Team skills (from shared folder)
  const teamStore = new Store({ name: 'clear-path-team', encryptionKey: getStoreEncryptionKey() })
  const sharedFolder = teamStore.get('sharedFolderPath', null) as string | null
  if (sharedFolder) {
    skills.push(...scanSkillDir(join(sharedFolder, 'skills'), 'team', 'both'))
  }

  return skills
}

// ── Starter templates ────────────────────────────────────────────────────────

const STARTER_TEMPLATES: Array<{ id: string; name: string; description: string; content: string }> = [
  {
    id: 'code-review', name: 'Code Review Skill',
    description: 'Comprehensive code review checklist',
    content: `When reviewing code, systematically check for:

## Security
- Input validation and sanitization
- SQL injection, XSS, command injection vulnerabilities
- Authentication and authorization issues
- Hardcoded secrets or credentials

## Error Handling
- All error paths handled (no swallowed errors)
- Appropriate error messages for users vs logs
- Graceful degradation on failures

## Performance
- N+1 query patterns
- Unnecessary re-renders or computations
- Missing pagination for large datasets
- Blocking I/O on the main thread

## Code Quality
- Clear naming conventions
- Functions do one thing well
- No deep nesting (max 3 levels)
- DRY — but don't over-abstract

Format findings as a severity-rated checklist: Critical > High > Medium > Low.`,
  },
  {
    id: 'test-writer', name: 'Test Writer Skill',
    description: 'Instructions for writing comprehensive tests',
    content: `When writing tests:

1. **Match the project's test framework** — detect what testing tools are already in use
2. **Cover the happy path first**, then edge cases, then error conditions
3. **Test behavior, not implementation** — tests should survive refactoring
4. **Use descriptive test names** that explain what is being verified
5. **Include boundary values**: empty strings, zero, null, max values, empty arrays
6. **Test async error paths**: rejected promises, timeout scenarios, network failures
7. **One assertion per test** when possible for clear failure messages
8. **Avoid mocking internals** — prefer integration tests with real dependencies
9. **Run existing tests first** to verify nothing is broken before adding new ones
10. **Aim for >80% coverage** but prioritize meaningful coverage over the number`,
  },
  {
    id: 'documentation', name: 'Documentation Skill',
    description: 'Generate clear, structured documentation',
    content: `When generating documentation:

- **Start with a one-line summary** of what the module/function does
- **Include usage examples** — working code that can be copied
- **Document parameters** with types, descriptions, and default values
- **Document return values** with types and possible values
- **Document thrown errors** and when they occur
- **Match the project's existing doc style** (JSDoc, docstrings, etc.)
- **Keep explanations concise** — developers scan, they don't read novels
- **Include edge case notes** for non-obvious behavior
- **Add a "Quick Start" section** for module-level docs`,
  },
  {
    id: 'security-audit', name: 'Security Audit Skill',
    description: 'OWASP-focused security scanning',
    content: `Perform a security audit checking for:

## OWASP Top 10
1. **Injection** — SQL, NoSQL, OS command, LDAP injection
2. **Broken Auth** — weak passwords, missing MFA, session fixation
3. **Sensitive Data Exposure** — unencrypted storage, missing HTTPS, exposed API keys
4. **XXE** — XML external entity processing
5. **Broken Access Control** — IDOR, missing authorization checks
6. **Security Misconfiguration** — default credentials, verbose errors, open CORS
7. **XSS** — reflected, stored, DOM-based cross-site scripting
8. **Insecure Deserialization** — untrusted data deserialization
9. **Vulnerable Components** — outdated dependencies with known CVEs
10. **Insufficient Logging** — missing audit trails, unmonitored security events

Rate each finding: **Critical** / **High** / **Medium** / **Low**
Include: file path, line number, vulnerability type, remediation steps.`,
  },
  {
    id: 'refactoring', name: 'Refactoring Skill',
    description: 'Improve code quality and reduce complexity',
    content: `When refactoring code:

- **Never change behavior** — refactoring means restructuring without altering what the code does
- **Run tests before and after** every change to verify nothing broke
- **One refactoring at a time** — don't combine multiple changes in one step
- **Extract long functions** — if a function is >30 lines, it's doing too much
- **Reduce nesting depth** — use early returns, guard clauses, extract helpers
- **Improve naming** — variables and functions should describe what they contain/do
- **Remove dead code** — delete commented-out code and unused functions
- **Simplify conditionals** — extract complex boolean expressions into named variables
- **Apply DRY** — but only for 3+ repetitions, not for 2 similar lines
- **Keep commits small** — one refactoring per commit for easy review/revert`,
  },
  {
    id: 'pr-description', name: 'PR Description Skill',
    description: 'Write clear pull request descriptions',
    content: `When writing a PR description:

## Summary (2-3 sentences)
- What changed and why
- Link to the relevant issue/ticket if applicable

## Changes Made
- List the key changes in bullet points
- Group related changes together
- Mention any architecture decisions or tradeoffs

## Testing
- What was tested (unit, integration, manual)
- How to verify the changes work
- Any test cases added or modified

## Screenshots (if UI changes)
- Before/after screenshots for visual changes

## Notes for Reviewers
- Areas that need careful review
- Known limitations or follow-up work needed

Keep the tone professional and concise. Focus on "why" more than "what".`,
  },
]

// ── Registration ─────────────────────────────────────────────────────────────

export function registerSkillHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('skills:list', (_e, args: { workingDirectory: string }) =>
    listAllSkills(args.workingDirectory),
  )

  ipcMain.handle('skills:get', (_e, args: { path: string }) => {
    // Path validation: only allow reading from skill directories
    const home = homedir()
    const allowedRoots = [
      join(home, '.claude', 'skills'),
      join(home, '.copilot', 'skills'),
      join(home, '.claude', 'commands'),
      process.cwd(),
    ]
    try {
      assertPathWithinRoots(args.path, allowedRoots)
      if (isSensitiveSystemPath(args.path)) return { error: 'Access denied' }
    } catch {
      return { error: 'Path not allowed' }
    }
    if (!existsSync(args.path)) return { error: 'Not found' }
    const content = readFileSync(args.path, 'utf8')
    const { frontmatter, body } = parseFrontmatter(content)
    return { content, frontmatter, body }
  })

  ipcMain.handle('skills:save', (_e, args: {
    name: string; description: string; body: string; scope: 'project' | 'global'
    cli: 'copilot' | 'claude' | 'both'; workingDirectory: string
    autoInvoke?: boolean; autoInvokeTrigger?: string; autoInvokeTriggerType?: string
    tools?: string[]; model?: string; globs?: string
    existingPath?: string // For editing existing skills
  }) => {
    const slug = args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const home = homedir()

    // Determine save directory
    let baseDir: string
    if (args.existingPath) {
      baseDir = dirname(args.existingPath)
    } else if (args.scope === 'global') {
      baseDir = args.cli === 'copilot'
        ? join(home, '.copilot', 'skills', slug)
        : join(home, '.claude', 'skills', slug)
    } else {
      baseDir = args.cli === 'copilot'
        ? join(args.workingDirectory, '.github', 'skills', slug)
        : join(args.workingDirectory, '.claude', 'skills', slug)
    }

    mkdirSync(baseDir, { recursive: true })

    // Build frontmatter
    const fm: Record<string, unknown> = {
      name: args.name,
      description: args.description,
    }
    if (args.autoInvoke && args.globs) fm['globs'] = args.globs
    if (args.tools?.length) fm['tools'] = args.tools
    if (args.model) fm['model'] = args.model

    const content = buildSkillMd(fm, args.body)
    const filePath = join(baseDir, 'SKILL.md')
    writeFileSync(filePath, content, 'utf8')

    return { path: filePath, dirPath: baseDir }
  })

  ipcMain.handle('skills:toggle', (_e, args: { path: string; enabled: boolean }) => {
    const enabledPath = args.path.replace(/\.disabled$/, '')
    const disabledPath = enabledPath + '.disabled'

    if (args.enabled && existsSync(disabledPath)) {
      renameSync(disabledPath, enabledPath)
      return { path: enabledPath }
    } else if (!args.enabled && existsSync(enabledPath)) {
      renameSync(enabledPath, disabledPath)
      return { path: disabledPath }
    }
    return { path: args.path }
  })

  ipcMain.handle('skills:delete', (_e, args: { dirPath: string }) => {
    // Delete the SKILL.md file (and .disabled variant)
    const skillFile = join(args.dirPath, 'SKILL.md')
    const disabledFile = join(args.dirPath, 'SKILL.md.disabled')
    if (existsSync(skillFile)) unlinkSync(skillFile)
    if (existsSync(disabledFile)) unlinkSync(disabledFile)
    return { success: true }
  })

  ipcMain.handle('skills:record-usage', (_e, args: { skillId: string }) => {
    const stats = store.get('usageStats')
    if (!stats[args.skillId]) stats[args.skillId] = { count: 0, lastUsed: 0 }
    stats[args.skillId].count++
    stats[args.skillId].lastUsed = Date.now()
    store.set('usageStats', stats)
    return stats[args.skillId]
  })

  ipcMain.handle('skills:get-usage-stats', () => store.get('usageStats'))

  ipcMain.handle('skills:get-starters', () => {
    // Merge starter pack skills (production agents) with legacy starter templates
    const packSkills = STARTER_SKILLS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      content: s.skillPrompt,
    }))
    return [...packSkills, ...STARTER_TEMPLATES]
  })

  ipcMain.handle('skills:export', async (_e, args: { path: string; name: string }) => {
    if (!existsSync(args.path)) return { error: 'File not found' }
    const content = readFileSync(args.path, 'utf8')
    const result = await dialog.showSaveDialog({
      defaultPath: `${args.name.toLowerCase().replace(/\s+/g, '-')}-skill.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    writeFileSync(result.filePath, content, 'utf8')
    return { exportedPath: result.filePath }
  })

  ipcMain.handle('skills:import', async (_e, args: { scope: 'project' | 'global'; cli: 'copilot' | 'claude'; workingDirectory: string }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    const content = readFileSync(result.filePaths[0], 'utf8')
    const { frontmatter } = parseFrontmatter(content)
    const name = String(frontmatter['name'] ?? basename(result.filePaths[0], '.md'))
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const home = homedir()

    const baseDir = args.scope === 'global'
      ? join(home, args.cli === 'copilot' ? '.copilot' : '.claude', 'skills', slug)
      : join(args.workingDirectory, args.cli === 'copilot' ? '.github' : '.claude', 'skills', slug)

    mkdirSync(baseDir, { recursive: true })
    copyFileSync(result.filePaths[0], join(baseDir, 'SKILL.md'))
    return { name, path: join(baseDir, 'SKILL.md') }
  })
}
