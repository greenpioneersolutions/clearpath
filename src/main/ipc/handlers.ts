import type { IpcMain } from 'electron'
import type { SessionOptions } from '../cli/types'
import type { CLIManager } from '../cli/CLIManager'
import type { AgentManager } from '../agents/AgentManager'
import { checkRateLimit } from '../utils/rateLimiter'
import { STARTER_AGENTS } from '../starter-pack/agents'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

// Starter pack agent IDs — these exist only in memory, not as CLI agent files.
// When one is active, we inject its system prompt into the session prompt
// instead of passing --agent (which would fail with "no agent with that name").
const STARTER_AGENT_IDS = new Set(STARTER_AGENTS.map((a) => a.id))

export function registerIpcHandlers(
  ipcMain: IpcMain,
  cliManager: CLIManager,
  agentManager?: AgentManager
): void {
  ipcMain.handle('cli:check-installed', () => cliManager.checkInstalled())

  ipcMain.handle('cli:check-auth', () => cliManager.checkAuth())

  ipcMain.handle('cli:start-session', (_event, options: SessionOptions) => {
    const rl = checkRateLimit('cli:start-session')
    if (!rl.allowed) return { error: `Rate limited — try again in ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s` }

    let resolved = options

    // Auto-inject the saved model from settings, or fall back to app defaults
    if (!resolved.model) {
      const DEFAULT_MODELS: Record<string, string> = { copilot: 'gpt-5-mini', claude: 'sonnet' }
      let modelToUse = DEFAULT_MODELS[options.cli] ?? ''
      try {
        const settingsStore = new Store({ name: 'clear-path-settings', encryptionKey: getStoreEncryptionKey() })
        const settings = settingsStore.get('settings') as { model?: { copilot?: string; claude?: string } } | undefined
        const savedModel = settings?.model?.[options.cli]
        if (savedModel) modelToUse = savedModel
      } catch { /* settings not available */ }
      if (modelToUse) resolved = { ...resolved, model: modelToUse }
    }

    // Resolve the agent — either from explicit option or from stored active agent
    let agentId = resolved.agent ?? null
    let agentWasExplicit = !!resolved.agent
    if (!agentId && agentManager) {
      const active = agentManager.getActiveAgents()
      agentId = active[options.cli] ?? null
    }

    if (agentId) {
      // Check by ID or by name (wizard passes display name like "Communication Coach")
      const starterAgent = STARTER_AGENTS.find((a) => a.id === agentId || a.name === agentId)
      if (starterAgent) {
        // Starter pack agent: inject system prompt into the initial prompt
        // instead of passing --agent (CLI doesn't have these as files)
        const systemContext = `[System: You are "${starterAgent.name}". ${starterAgent.systemPrompt}]\n\n`
        resolved = {
          ...resolved,
          agent: undefined, // don't pass --agent
          prompt: resolved.prompt ? systemContext + resolved.prompt : systemContext,
        }
      } else if (agentId.includes(':file:')) {
        // File-based agent: pass the file path via --agent flag
        const flagValue = agentId.split(':file:').pop()!
        resolved = { ...resolved, agent: flagValue }
      } else if (agentWasExplicit) {
        // Explicitly requested agent (not auto-injected): pass as-is
        resolved = { ...resolved, agent: agentId }
      } else {
        // Unrecognized agent ID (not file-based, not starter pack, not explicit) — skip it.
        resolved = { ...resolved, agent: undefined }
      }
    }

    return cliManager.startSession(resolved)
  })

  ipcMain.handle(
    'cli:send-input',
    (_event, { sessionId, input }: { sessionId: string; input: string }) => {
      cliManager.sendInput(sessionId, input)
    }
  )

  ipcMain.handle(
    'cli:send-slash-command',
    (_event, { sessionId, command }: { sessionId: string; command: string }) => {
      cliManager.sendSlashCommand(sessionId, command)
    }
  )

  ipcMain.handle('cli:stop-session', (_event, { sessionId }: { sessionId: string }) =>
    cliManager.stopSession(sessionId)
  )

  ipcMain.handle('cli:list-sessions', () => cliManager.listSessions())

  ipcMain.handle('cli:get-session', (_event, { sessionId }: { sessionId: string }) =>
    cliManager.getSession(sessionId)
  )

  ipcMain.handle('cli:get-message-log', (_event, { sessionId }: { sessionId: string }) => {
    // Try in-memory first (active sessions), fall back to persisted store
    const inMemory = cliManager.getSessionMessageLog(sessionId)
    if (inMemory.length > 0) return inMemory
    return cliManager.getPersistedMessageLog(sessionId)
  })

  // Persisted session history (survives app restart)
  ipcMain.handle('cli:get-persisted-sessions', () =>
    cliManager.getPersistedSessions()
  )

  // Session management operations
  ipcMain.handle('cli:delete-session', (_event, { sessionId }: { sessionId: string }) =>
    cliManager.deletePersistedSession(sessionId)
  )

  ipcMain.handle('cli:delete-sessions', (_event, { sessionIds }: { sessionIds: string[] }) =>
    cliManager.deletePersistedSessions(sessionIds)
  )

  ipcMain.handle('cli:archive-session', (_event, { sessionId, archived }: { sessionId: string; archived: boolean }) =>
    cliManager.archivePersistedSession(sessionId, archived)
  )

  ipcMain.handle('cli:rename-session', (_event, { sessionId, name }: { sessionId: string; name: string }) =>
    cliManager.renamePersistedSession(sessionId, name)
  )

  ipcMain.handle('cli:search-sessions', (_event, { query, useRegex }: { query: string; useRegex?: boolean }) =>
    cliManager.searchSessions(query, useRegex ?? false)
  )

  ipcMain.handle('app:get-cwd', () => process.cwd())
}
