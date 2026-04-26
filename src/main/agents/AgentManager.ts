import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'fs'
import { homedir } from 'os'
import { join, basename, extname } from 'path'
import { randomUUID } from 'crypto'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import type {
  AgentDef,
  AgentProfile,
  AgentListResult,
  ActiveAgents,
} from '../../renderer/src/types/ipc'
import type { BackendId, BackendProvider } from '../../shared/backends'
import { providerOf } from '../../shared/backends'

// Built-in CLI agents (explore, task, etc.) are no longer listed here.
// Users create their own agents via the Starter Pack walkthrough instead.

// ── Store schema ──────────────────────────────────────────────────────────────

interface AgentStoreSchema {
  profiles: AgentProfile[]
  enabledAgentIds: string[]
  activeAgents: ActiveAgents
}

// ── Frontmatter helpers ───────────────────────────────────────────────────────

interface FrontmatterResult {
  meta: Record<string, unknown>
  body: string
}

function parseFrontmatter(content: string): FrontmatterResult {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content)
  if (!match) return { meta: {}, body: content.trim() }

  const meta: Record<string, unknown> = {}
  const body = match[2].trim()
  const yamlLines = match[1].split('\n')

  let currentListKey: string | null = null
  let currentList: string[] = []

  const flushList = () => {
    if (currentListKey && currentList.length > 0) {
      meta[currentListKey] = currentList
      currentList = []
      currentListKey = null
    }
  }

  for (const rawLine of yamlLines) {
    const line = rawLine.replace(/\r$/, '')

    // List item:  - value
    const listItemMatch = /^\s+-\s+(.+)$/.exec(line)
    if (listItemMatch) {
      currentList.push(listItemMatch[1].trim())
      continue
    }

    flushList()

    // Key with value: key: value  OR  key:
    const kvMatch = /^([\w-]+):\s*(.*)$/.exec(line)
    if (!kvMatch) continue

    const key = kvMatch[1]
    const value = kvMatch[2].trim()

    if (!value) {
      // Start of a list block
      currentListKey = key
    } else if (value.includes(',')) {
      // Inline comma-separated list: tools: Read, Write, Bash
      meta[key] = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else {
      meta[key] = value
    }
  }
  flushList()

  return { meta, body }
}

function serializeToMarkdown(def: Omit<AgentDef, 'id' | 'source' | 'filePath'>): string {
  const lines: string[] = ['---']
  lines.push(`name: ${def.name}`)
  lines.push(`description: ${def.description}`)
  if (def.model) lines.push(`model: ${def.model}`)
  if (def.tools?.length) {
    lines.push('tools:')
    for (const t of def.tools) lines.push(`  - ${t}`)
  }
  lines.push('---', '')
  if (def.prompt) lines.push(def.prompt)
  return lines.join('\n')
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// ── File scanners ─────────────────────────────────────────────────────────────

/**
 * Scan a directory for agent markdown files. `provider` is the provider
 * family the agents belong to (copilot or claude). Each returned AgentDef is
 * tagged with the CLI-transport BackendId for that provider — downstream
 * session wizards can route the agent to the SDK backend of the same provider
 * without rescanning.
 */
function scanDirectory(dir: string, provider: BackendProvider, extFilter: string): AgentDef[] {
  if (!existsSync(dir)) return []

  const agents: AgentDef[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }

  const cli: BackendId = provider === 'copilot' ? 'copilot-cli' : 'claude-cli'

  for (const entry of entries) {
    if (!entry.endsWith(extFilter)) continue
    const filePath = join(dir, entry)

    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      continue
    }

    const { meta, body } = parseFrontmatter(content)
    const name = String(meta['name'] ?? basename(entry, extFilter)).trim()
    const id = `${provider}:file:${basename(entry, extFilter)}`

    const tools = Array.isArray(meta['tools'])
      ? (meta['tools'] as string[])
      : typeof meta['tools'] === 'string'
      ? [meta['tools'] as string]
      : undefined

    agents.push({
      id,
      name,
      description: String(meta['description'] ?? '').trim(),
      model: meta['model'] ? String(meta['model']).trim() : undefined,
      tools,
      prompt: body || undefined,
      source: 'file',
      cli,
      filePath,
    })
  }

  return agents
}

// ── AgentManager ──────────────────────────────────────────────────────────────

export class AgentManager {
  private _store: Store<AgentStoreSchema> | null = null

  private get store(): Store<AgentStoreSchema> {
    if (!this._store) {
      this._store = new Store<AgentStoreSchema>({
        name: 'clear-path-agents',
        encryptionKey: getStoreEncryptionKey(),
        defaults: {
          profiles: [],
          enabledAgentIds: [],
          activeAgents: { copilot: null, claude: null },
        },
      })
    }
    return this._store
  }

  // ── Agent discovery ──────────────────────────────────────────────────────

  listAgents(workingDir?: string): AgentListResult {
    const copilotCustom = this.scanCopilotAgents(workingDir)
    const claudeAgents = this.scanClaudeAgents(workingDir)

    return {
      copilot: copilotCustom,
      claude: claudeAgents,
    }
  }

  private scanCopilotAgents(workingDir?: string): AgentDef[] {
    const results: AgentDef[] = []

    // Global agents
    results.push(...scanDirectory(join(homedir(), '.github', 'agents'), 'copilot', '.agent.md'))

    // Project-level agents
    if (workingDir && workingDir !== homedir()) {
      results.push(...scanDirectory(join(workingDir, '.github', 'agents'), 'copilot', '.agent.md'))
    }

    return results
  }

  private scanClaudeAgents(workingDir?: string): AgentDef[] {
    const results: AgentDef[] = []

    // Global agents
    results.push(...scanDirectory(join(homedir(), '.claude', 'agents'), 'claude', '.md'))

    // Project-level agents
    if (workingDir) {
      results.push(...scanDirectory(join(workingDir, '.claude', 'agents'), 'claude', '.md'))
    }

    return results
  }

  // ── File CRUD ─────────────────────────────────────────────────────────────

  createAgent(
    def: Omit<AgentDef, 'id' | 'source' | 'filePath'>,
    workingDir?: string
  ): { filePath: string; agentDef: AgentDef } {
    const slug = slugify(def.name) || randomUUID().slice(0, 8)
    let filePath: string

    const provider = providerOf(def.cli)
    if (provider === 'copilot') {
      const dir = join(workingDir ?? homedir(), '.github', 'agents')
      mkdirSync(dir, { recursive: true })
      filePath = join(dir, `${slug}.agent.md`)
    } else {
      const dir = join(workingDir ?? homedir(), '.claude', 'agents')
      mkdirSync(dir, { recursive: true })
      filePath = join(dir, `${slug}.md`)
    }

    const content = serializeToMarkdown(def)
    writeFileSync(filePath, content, 'utf8')

    const id = `${provider}:file:${slug}`
    const agentDef: AgentDef = { ...def, id, source: 'file', filePath }
    return { filePath, agentDef }
  }

  readAgentFile(filePath: string): string {
    return readFileSync(filePath, 'utf8')
  }

  writeAgentFile(filePath: string, content: string): void {
    writeFileSync(filePath, content, 'utf8')
  }

  deleteAgent(filePath: string): void {
    if (existsSync(filePath)) unlinkSync(filePath)
  }

  // ── Enabled / active agent state ─────────────────────────────────────────

  getEnabledAgentIds(): string[] {
    return this.store.get('enabledAgentIds')
  }

  setEnabledAgentIds(ids: string[]): void {
    this.store.set('enabledAgentIds', ids)
  }

  getActiveAgents(): ActiveAgents {
    return this.store.get('activeAgents')
  }

  setActiveAgent(cli: 'copilot' | 'claude', agentId: string | null): void {
    const current = this.store.get('activeAgents')
    this.store.set('activeAgents', { ...current, [cli]: agentId })
  }

  // ── Profiles ─────────────────────────────────────────────────────────────

  getProfiles(): AgentProfile[] {
    return this.store.get('profiles')
  }

  saveProfile(name: string, enabledAgentIds: string[]): AgentProfile {
    const profiles = this.store.get('profiles')
    const existing = profiles.find((p) => p.name === name)

    if (existing) {
      existing.enabledAgentIds = enabledAgentIds
      this.store.set('profiles', profiles)
      return existing
    }

    const profile: AgentProfile = {
      id: randomUUID(),
      name,
      enabledAgentIds,
      createdAt: Date.now(),
    }
    this.store.set('profiles', [...profiles, profile])
    return profile
  }

  applyProfile(profileId: string): string[] | null {
    const profile = this.store.get('profiles').find((p) => p.id === profileId)
    if (!profile) return null
    this.store.set('enabledAgentIds', profile.enabledAgentIds)
    return profile.enabledAgentIds
  }

  deleteProfile(profileId: string): void {
    const profiles = this.store.get('profiles').filter((p) => p.id !== profileId)
    this.store.set('profiles', profiles)
  }
}
