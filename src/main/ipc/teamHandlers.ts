import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import Store from 'electron-store'
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  readdirSync, statSync, createWriteStream, createReadStream,
} from 'fs'
import { join, basename } from 'path'
import { randomUUID, createHmac } from 'crypto'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { pipeline } from 'stream/promises'
import { resolveInShell } from '../utils/shellEnv'
import { STARTER_AGENTS } from '../starter-pack'

const execFileAsync = promisify(execFile)

// ── Types ────────────────────────────────────────────────────────────────────

interface MarketplaceAgent {
  id: string
  name: string
  description: string
  author: string
  cli: 'copilot' | 'claude'
  category: string
  prompt: string
  tools?: string[]
  model?: string
  downloads: number
}

interface ActivityEntry {
  hash: string
  message: string
  author: string
  date: string
  repo: string
  isAiGenerated: boolean
}

interface TeamStoreSchema {
  sharedFolderPath: string | null
  marketplaceIndex: MarketplaceAgent[]
  installedMarketplaceIds: string[]
}

const store = new Store<TeamStoreSchema>({
  name: 'clear-path-team',
  defaults: {
    sharedFolderPath: null,
    marketplaceIndex: [],
    installedMarketplaceIds: [],
  },
  encryptionKey: getStoreEncryptionKey(),
})

// ── Config bundle integrity ─────────────────────────────────────────────────

/** Sign a config bundle with HMAC-SHA256 using the machine-derived key. */
function signBundle(bundle: Record<string, unknown>): string {
  const payload = JSON.stringify(bundle, Object.keys(bundle).filter(k => k !== '_signature').sort())
  return createHmac('sha256', getStoreEncryptionKey()).update(payload).digest('hex')
}

/** Verify a config bundle's HMAC signature. Returns true if valid or unsigned. */
function verifyBundleSignature(bundle: Record<string, unknown>): { valid: boolean; unsigned: boolean } {
  const sig = bundle['_signature'] as string | undefined
  if (!sig) return { valid: true, unsigned: true }
  const expected = signBundle(bundle)
  return { valid: sig === expected, unsigned: false }
}

// ── Built-in marketplace agents (generated from starter pack) ───────────────

const BUILTIN_MARKETPLACE: MarketplaceAgent[] = STARTER_AGENTS.map((agent, idx) => ({
  id: `mkt-${agent.id}`,
  name: agent.name,
  description: agent.description,
  author: 'Clear Path',
  cli: 'claude' as const,
  category: agent.category === 'spotlight' ? 'Core' : 'Advanced',
  prompt: agent.systemPrompt,
  model: undefined,
  downloads: 1000 - idx * 100,
}))

const LEGACY_BUILTIN_MARKETPLACE: MarketplaceAgent[] = [
  {
    id: 'mkt-code-review', name: 'Code Reviewer', description: 'Thorough code review with security and performance focus',
    author: 'Clear Path', cli: 'claude', category: 'Review',
    prompt: 'You are an expert code reviewer. Focus on security vulnerabilities, performance bottlenecks, error handling gaps, and code clarity. Provide specific, actionable feedback with file and line references. Prioritize issues by severity.',
    model: 'sonnet', downloads: 1240,
  },
  {
    id: 'mkt-test-writer', name: 'Test Generator', description: 'Generates comprehensive test suites matching project conventions',
    author: 'Clear Path', cli: 'claude', category: 'Testing',
    prompt: 'You are a testing specialist. Analyze the codebase to understand the test framework and conventions in use. Write tests that cover happy paths, edge cases, and error conditions. Use descriptive test names. Always run existing tests first to verify nothing is broken.',
    model: 'sonnet', downloads: 980,
  },
  {
    id: 'mkt-doc-writer', name: 'Documentation Writer', description: 'Generates clear, structured documentation from code',
    author: 'Clear Path', cli: 'claude', category: 'Documentation',
    prompt: 'You are a technical writer. Generate clear, well-structured documentation. Include code examples, parameter descriptions, and usage patterns. Match the existing documentation style in the project.',
    downloads: 756,
  },
  {
    id: 'mkt-security-auditor', name: 'Security Auditor', description: 'OWASP-focused security scanning and remediation',
    author: 'Clear Path', cli: 'claude', category: 'Security',
    prompt: 'You are a security specialist focused on the OWASP Top 10. Scan for injection vulnerabilities, broken auth, sensitive data exposure, XXE, broken access control, misconfigurations, XSS, insecure deserialization, known vulnerable components, and insufficient logging. Rate each finding as Critical/High/Medium/Low.',
    model: 'opus', downloads: 623,
  },
  {
    id: 'mkt-refactor-guide', name: 'Refactoring Guide', description: 'Identifies and applies safe refactoring patterns',
    author: 'Clear Path', cli: 'claude', category: 'Refactor',
    prompt: 'You are a refactoring expert. Identify code smells: long methods, deep nesting, duplicated logic, god classes, and feature envy. Apply safe refactoring patterns one at a time. Run tests between each change. Never change behavior.',
    downloads: 542,
  },
  {
    id: 'mkt-perf-optimizer', name: 'Performance Optimizer', description: 'Profiles and optimizes for speed and memory',
    author: 'Clear Path', cli: 'claude', category: 'Performance',
    prompt: 'You are a performance engineer. Profile the codebase for bottlenecks. Focus on: N+1 queries, unnecessary re-renders, blocking I/O, memory leaks, inefficient algorithms, and missing caching. Measure before and after each optimization.',
    downloads: 489,
  },
  {
    id: 'mkt-migration-helper', name: 'Migration Assistant', description: 'Guides through dependency and framework migrations',
    author: 'Clear Path', cli: 'claude', category: 'Migration',
    prompt: 'You are a migration specialist. Follow the official migration guide step by step. Update breaking API changes, fix deprecation warnings, and verify tests pass after each step. Document any manual steps required.',
    downloads: 401,
  },
  {
    id: 'mkt-api-designer', name: 'API Designer', description: 'Designs RESTful and GraphQL APIs following best practices',
    author: 'Clear Path', cli: 'copilot', category: 'Architecture',
    prompt: 'You are an API design expert. Design APIs following REST best practices: proper HTTP methods, consistent naming, pagination, error response format, versioning strategy, and authentication patterns. Document with OpenAPI/Swagger when applicable.',
    downloads: 367,
  },
  {
    id: 'mkt-git-workflow', name: 'Git Workflow Manager', description: 'Manages branches, PRs, and release workflows',
    author: 'Clear Path', cli: 'copilot', category: 'Git',
    prompt: 'You are a git workflow expert. Help with branch management, conflict resolution, release preparation, changelog generation, and PR creation. Follow the project\'s branching strategy and commit conventions.',
    tools: ['shell(git:*)'], downloads: 334,
  },
  {
    id: 'mkt-accessibility', name: 'Accessibility Checker', description: 'Audits UI for WCAG 2.1 compliance',
    author: 'Clear Path', cli: 'claude', category: 'Review',
    prompt: 'You are an accessibility expert focused on WCAG 2.1 compliance. Audit UI components for: proper semantic HTML, ARIA attributes, keyboard navigation, color contrast, screen reader compatibility, and focus management. Rate issues by WCAG level (A/AA/AAA).',
    downloads: 289,
  },
]

// ── Config bundle export/import ──────────────────────────────────────────────

async function exportConfigBundle(): Promise<string | null> {
  // Gather all config from various stores
  const bundle: Record<string, unknown> = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: null,
    agents: null,
    templates: null,
    profiles: null,
  }

  // Read from each store file
  const configDir = join(require('os').homedir(), '.config', 'clear-path')
  const storeNames = [
    'clear-path-settings',
    'clear-path-agents',
    'clear-path-templates',
  ]

  for (const name of storeNames) {
    // electron-store saves to the app's userData path
    const possiblePaths = [
      join(require('electron').app.getPath('userData'), `${name}.json`),
    ]
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        try {
          bundle[name] = JSON.parse(readFileSync(p, 'utf8'))
        } catch { /* skip */ }
      }
    }
  }

  const result = await dialog.showSaveDialog({
    defaultPath: 'clear-path-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return null

  // Sign the bundle for integrity verification on import
  bundle['_signature'] = signBundle(bundle)
  writeFileSync(result.filePath, JSON.stringify(bundle, null, 2) + '\n', 'utf8')
  return result.filePath
}

async function importConfigBundle(): Promise<{ success: boolean; error?: string }> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return { success: false }

  try {
    const raw = readFileSync(result.filePaths[0], 'utf8')
    const bundle = JSON.parse(raw) as Record<string, unknown>

    if (!bundle['version']) return { success: false, error: 'Invalid config bundle' }

    // Verify integrity signature if present
    const integrity = verifyBundleSignature(bundle)
    if (!integrity.valid) {
      return { success: false, error: 'Config bundle signature verification failed — the file may have been tampered with. Import aborted.' }
    }

    // Size limit: reject bundles larger than 5MB to prevent disk/memory exhaustion
    if (raw.length > 5 * 1024 * 1024) {
      return { success: false, error: 'Config bundle is too large (>5MB)' }
    }

    // Schema validation: verify imported data has expected structure
    for (const name of ['clear-path-settings', 'clear-path-agents', 'clear-path-templates']) {
      const data = bundle[name]
      if (data !== undefined && data !== null) {
        if (typeof data !== 'object') {
          return { success: false, error: `Invalid data type for ${name}: expected object, got ${typeof data}` }
        }
        // Verify JSON round-trip (catch circular refs, prototype pollution)
        try {
          JSON.parse(JSON.stringify(data))
        } catch {
          return { success: false, error: `Invalid data structure in ${name}` }
        }
      }
    }

    // Apply each store's data
    const { app } = require('electron')
    const userData = app.getPath('userData')
    const storeNames = [
      'clear-path-settings',
      'clear-path-agents',
      'clear-path-templates',
    ]

    for (const name of storeNames) {
      if (bundle[name]) {
        const filePath = join(userData, `${name}.json`)
        writeFileSync(filePath, JSON.stringify(bundle[name], null, 2) + '\n', 'utf8')
      }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Git activity feed ────────────────────────────────────────────────────────

async function getGitActivity(workingDirectory: string, limit = 30): Promise<ActivityEntry[]> {
  try {
    const { stdout } = await execFileAsync('git', [
      'log', `--max-count=${limit}`,
      '--format=%H|||%s|||%an|||%aI',
    ], { cwd: workingDirectory, timeout: 10000 })

    const repo = basename(workingDirectory)
    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [hash, message, author, date] = line.split('|||')
      const aiPatterns = /co-authored-by:.*claude|co-authored-by:.*copilot|generated.*with|ai-assisted/i
      return {
        hash, message, author, date, repo,
        isAiGenerated: aiPatterns.test(message) || aiPatterns.test(author),
      }
    })
  } catch {
    return []
  }
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerTeamHandlers(ipcMain: IpcMain): void {
  // Config bundle
  ipcMain.handle('team:export-bundle', () => exportConfigBundle())
  ipcMain.handle('team:import-bundle', () => importConfigBundle())

  // Shared folder
  ipcMain.handle('team:get-shared-folder', () => store.get('sharedFolderPath'))

  ipcMain.handle('team:set-shared-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    const path = result.filePaths[0]
    store.set('sharedFolderPath', path)
    return { path }
  })

  ipcMain.handle('team:clear-shared-folder', () => {
    store.set('sharedFolderPath', null)
    return { success: true }
  })

  ipcMain.handle('team:list-shared-configs', () => {
    const folder = store.get('sharedFolderPath')
    if (!folder || !existsSync(folder)) return []
    return readdirSync(folder)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const filePath = join(folder, f)
        let name = f.replace(/\.json$/, '')
        let description = ''
        try {
          const data = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
          if (data['name']) name = String(data['name'])
          if (data['description']) description = String(data['description'])
        } catch { /* ignore */ }
        return { fileName: f, name, description, path: filePath, modifiedAt: statSync(filePath).mtimeMs }
      })
  })

  ipcMain.handle('team:apply-shared-config', (_e, args: { path: string }) => {
    try {
      const raw = readFileSync(args.path, 'utf8')
      const data = JSON.parse(raw) as Record<string, unknown>

      // Verify integrity if signed
      const integrity = verifyBundleSignature(data)
      if (!integrity.valid) {
        return { success: false, error: 'Shared config signature verification failed — the file may have been tampered with.' }
      }

      // Size limit
      if (raw.length > 5 * 1024 * 1024) {
        return { success: false, error: 'Shared config is too large (>5MB)' }
      }

      // Validate settings structure
      if (data['settings'] !== undefined && (typeof data['settings'] !== 'object' || data['settings'] === null)) {
        return { success: false, error: 'Invalid settings structure in shared config' }
      }

      // Apply settings if present
      if (data['settings']) {
        const { app } = require('electron')
        const settingsPath = join(app.getPath('userData'), 'clear-path-settings.json')
        writeFileSync(settingsPath, JSON.stringify({ settings: data['settings'] }, null, 2) + '\n', 'utf8')
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Marketplace
  ipcMain.handle('team:list-marketplace', () => {
    const custom = store.get('marketplaceIndex')
    const installed = new Set(store.get('installedMarketplaceIds'))
    return [...BUILTIN_MARKETPLACE, ...LEGACY_BUILTIN_MARKETPLACE, ...custom].map((a) => ({
      ...a,
      installed: installed.has(a.id),
    }))
  })

  ipcMain.handle('team:install-marketplace-agent', (_e, args: { id: string }) => {
    const all = [...BUILTIN_MARKETPLACE, ...LEGACY_BUILTIN_MARKETPLACE, ...store.get('marketplaceIndex')]
    const agent = all.find((a) => a.id === args.id)
    if (!agent) return { error: 'Agent not found' }

    const ids = store.get('installedMarketplaceIds')
    if (!ids.includes(args.id)) {
      ids.push(args.id)
      store.set('installedMarketplaceIds', ids)
    }
    return { success: true, agent }
  })

  ipcMain.handle('team:uninstall-marketplace-agent', (_e, args: { id: string }) => {
    const ids = store.get('installedMarketplaceIds').filter((i) => i !== args.id)
    store.set('installedMarketplaceIds', ids)
    return { success: true }
  })

  // Activity feed
  ipcMain.handle('team:git-activity', (_e, args: { workingDirectory: string; limit?: number }) =>
    getGitActivity(args.workingDirectory, args.limit),
  )

  // Setup wizard check
  ipcMain.handle('team:check-setup', async () => {
    const [copilot, claude] = await Promise.all([
      resolveInShell('copilot'),
      resolveInShell('claude'),
    ])
    return {
      copilotInstalled: !!copilot,
      claudeInstalled: !!claude,
      copilotPath: copilot,
      claudePath: claude,
    }
  })
}
