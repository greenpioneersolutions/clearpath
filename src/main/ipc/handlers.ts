import type { IpcMain } from 'electron'
import type { SessionOptions } from '../cli/types'
import type { CLIManager } from '../cli/CLIManager'
import { cleanupSessionUploads } from './fileAttachmentHandlers'
import type { AgentManager } from '../agents/AgentManager'
import { checkRateLimit } from '../utils/rateLimiter'
import { STARTER_AGENTS } from '../starter-pack/agents'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { existsSync, readFileSync } from 'fs'
import { providerOf } from '../../shared/backends'
import { sessionDefaultFlagKeysFor } from '../../shared/sessionDefaultFlags'

export function registerIpcHandlers(
  ipcMain: IpcMain,
  cliManager: CLIManager,
  agentManager?: AgentManager
): void {
  ipcMain.handle('cli:check-installed', () => cliManager.checkInstalled())

  ipcMain.handle('cli:check-auth', () => cliManager.checkAuth())

  ipcMain.handle('cli:start-session', async (_event, options: SessionOptions) => {
    const rl = checkRateLimit('cli:start-session')
    if (!rl.allowed) return { error: `Rate limited — try again in ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s` }

    let resolved = options
    const provider = providerOf(options.cli)

    // Read persisted settings once — reused for both the saved model and the
    // curated session-default flags below.
    let storedSettings: { model?: { copilot?: string; claude?: string }; flags?: Record<string, unknown> } | undefined
    try {
      const settingsStore = new Store({ name: 'clear-path-settings', encryptionKey: getStoreEncryptionKey() })
      storedSettings = settingsStore.get('settings') as typeof storedSettings
    } catch { /* settings not available */ }

    // Auto-inject the saved model from settings, or fall back to app defaults
    if (!resolved.model) {
      const DEFAULT_MODELS: Record<'copilot' | 'claude', string> = { copilot: 'gpt-5-mini', claude: 'sonnet' }
      const savedModel = storedSettings?.model?.[provider]
      const modelToUse = savedModel || DEFAULT_MODELS[provider] || ''
      if (modelToUse) resolved = { ...resolved, model: modelToUse }
    }

    // Apply curated session-default flags from Settings → CLI Flags. The builder
    // persists every configured flag under `settings.flags` keyed
    // `${provider}:${field}`; we merge only the allowlisted, transport-compatible
    // subset (see src/shared/sessionDefaultFlags.ts) onto the typed SessionOptions
    // fields. Explicit caller options always win — a stored default only fills a
    // field the caller left undefined.
    if (storedSettings?.flags) {
      const allowed = sessionDefaultFlagKeysFor(options.cli)
      const prefix = `${provider}:`
      const defaults: Record<string, unknown> = {}
      for (const [storeKey, value] of Object.entries(storedSettings.flags)) {
        if (!storeKey.startsWith(prefix)) continue
        const field = storeKey.slice(prefix.length)
        if (!allowed.has(field)) continue
        // Mirror the renderer's `isSet` check — skip cleared / empty values.
        if (value === undefined || value === null || value === '') continue
        if (Array.isArray(value) && value.length === 0) continue
        defaults[field] = value
      }
      if (Object.keys(defaults).length > 0) {
        const merged = { ...resolved } as Record<string, unknown>
        for (const [field, value] of Object.entries(defaults)) {
          if (merged[field] === undefined) merged[field] = value
        }
        resolved = merged as unknown as SessionOptions
      }
    }

    // Resolve the agent — either from explicit option or from stored active agent.
    // `noAgent: true` is the renderer's signal that the user explicitly chose
    // no agent (e.g. picked "(none)" in the Home or launchpad agent picker);
    // skip the stored-default fallback in that case so we don't silently
    // override their choice.
    let agentId = resolved.agent ?? null
    if (!agentId && !options.noAgent && agentManager) {
      const active = agentManager.getActiveAgents()
      agentId = active[providerOf(options.cli)] ?? null
    }

    let agentDisplayName: string | null = null

    if (agentId) {
      let agentResolved = false
      let agentSystemPrompt: string | null = null

      // 1. File-based agent — read the system prompt from the file
      if (agentId.includes(':file:') && agentManager) {
        const allAgents = agentManager.listAgents()
        const match = [...allAgents.copilot, ...allAgents.claude].find((a) => a.id === agentId)
        if (match?.filePath && existsSync(match.filePath)) {
          try {
            const content = readFileSync(match.filePath, 'utf8')
            const bodyMatch = /^---[\s\S]*?---\s*\n([\s\S]*)$/.exec(content)
            agentSystemPrompt = bodyMatch?.[1]?.trim() || null
            if (agentSystemPrompt && match.name) agentDisplayName = match.name
          } catch { /* file unreadable */ }
        }

        if (!agentSystemPrompt) {
          // File missing or unreadable — fall back to starter pack match
          const slug = agentId.split(':file:').pop()!
          const starterMatch = STARTER_AGENTS.find(
            (a) => a.id === slug || a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug
          )
          if (starterMatch) {
            agentSystemPrompt = starterMatch.systemPrompt
            agentDisplayName = starterMatch.name
          }
        }

        if (agentSystemPrompt) agentResolved = true
      }

      // 2. Starter pack agent ID or name (not a file agent)
      if (!agentResolved) {
        const starterAgent = STARTER_AGENTS.find(
          (a) => a.id === agentId || a.name === agentId
        )
        if (starterAgent) {
          agentSystemPrompt = starterAgent.systemPrompt
          agentDisplayName = starterAgent.name
          agentResolved = true
        }
      }

      // Inject agent prompt ONLY if the user actually provided a prompt.
      // If no user prompt, store the agent context for the first turn when the user types.
      if (agentResolved && agentSystemPrompt) {
        resolved = { ...resolved, agent: undefined }
        if (resolved.prompt?.trim()) {
          // Preserve the user's original prompt as displayPrompt so the chat
          // log + UI show the typed message, not the prepended agent system
          // prompt. Without this the messageLog gets the combined text and
          // the chat shows the entire agent definition on rehydrate.
          const userPrompt = resolved.prompt
          // Token Coach Phase 1: reflect the prepended agent prompt on slices
          // so the first turn's cost record attributes the agent system prompt
          // to its own slice, not lumped into userPromptTokens. Caller-supplied
          // agentPrompt wins so the renderer can override if it ever does its
          // own prepend.
          const callerSlices = resolved.promptSlices
          const promptSlices = callerSlices
            ? { ...callerSlices, agentPrompt: callerSlices.agentPrompt ?? agentSystemPrompt }
            : undefined
          resolved = {
            ...resolved,
            displayPrompt: resolved.displayPrompt ?? userPrompt,
            prompt: `${agentSystemPrompt}\n\n${userPrompt}`,
            ...(promptSlices ? { promptSlices } : {}),
          }
        } else {
          // No user prompt — store as agentContext so it gets prepended on the first real input
          resolved = { ...resolved, prompt: undefined, agentContext: agentSystemPrompt }
        }
      } else if (!agentResolved) {
        // Unresolved — don't pass a bad --agent flag
        resolved = { ...resolved, agent: undefined }
      }
    }

    const result = await cliManager.startSession(resolved)
    // CLI-not-ready guard fired in the main process — no session was created.
    // Pass the error envelope straight through; don't graft agentApplied onto it.
    if ('error' in result) return result
    // Surface the auto-applied agent so the renderer can show it in the chat
    // status and pre-select it in the input bar's quick config.
    return agentDisplayName
      ? { ...result, agentApplied: { id: agentId, name: agentDisplayName } }
      : result
  })

  ipcMain.handle(
    'cli:send-input',
    (
      _event,
      { sessionId, input, attachedNotes, promptSlices, userOverrideModel, attachedFiles }: {
        sessionId: string
        input: string
        attachedNotes?: Array<{ id: string; title: string }>
        promptSlices?: import('../../shared/tokenization/types').PromptSlices
        userOverrideModel?: string
        attachedFiles?: Array<{ id: string; name: string; relPath: string }>
      },
    ) => {
      cliManager.sendInput(sessionId, input, attachedNotes, promptSlices, userOverrideModel, attachedFiles)
    }
  )

  ipcMain.handle(
    'cli:send-slash-command',
    (_event, { sessionId, command }: { sessionId: string; command: string }) => {
      cliManager.sendSlashCommand(sessionId, command)
    }
  )

  // Apply a model to a session WITHOUT triggering a turn. Used by the model
  // chip and the /model slash command — the CLI's REPL /model is unreachable
  // in headless mode, so the renderer mutates session state directly and the
  // next user message will spawn with the new --model.
  ipcMain.handle(
    'session:update-model',
    (_event, { sessionId, model }: { sessionId: string; model: string }) => {
      cliManager.updateSessionModel(sessionId, model)
    }
  )

  // Reset a session's conversation history and drop the --continue chain so
  // the next message starts a brand-new underlying CLI session. Backs the
  // renderer-side /clear handler.
  ipcMain.handle(
    'session:reset',
    (_event, { sessionId }: { sessionId: string }) => {
      cliManager.resetSession(sessionId)
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

  // Session management operations.
  // On delete we also remove the session's staged file attachments
  // (`.clear-path/uploads/<sessionId>/`). The working directory is looked up
  // from the persisted session so the renderer needn't supply it. Any miss is
  // reclaimed later by `files:sweep-orphans`.
  ipcMain.handle('cli:delete-session', (_event, { sessionId }: { sessionId: string }) => {
    const wd = cliManager.getPersistedSessions().find((s) => s.sessionId === sessionId)?.workingDirectory
    if (wd) cleanupSessionUploads(wd, sessionId)
    return cliManager.deletePersistedSession(sessionId)
  })

  ipcMain.handle('cli:delete-sessions', (_event, { sessionIds }: { sessionIds: string[] }) => {
    const sessions = cliManager.getPersistedSessions()
    for (const id of sessionIds) {
      const wd = sessions.find((s) => s.sessionId === id)?.workingDirectory
      if (wd) cleanupSessionUploads(wd, id)
    }
    return cliManager.deletePersistedSessions(sessionIds)
  })

  ipcMain.handle('cli:archive-session', (_event, { sessionId, archived }: { sessionId: string; archived: boolean }) =>
    cliManager.archivePersistedSession(sessionId, archived)
  )

  ipcMain.handle('cli:archive-sessions', (_event, { sessionIds, archived }: { sessionIds: string[]; archived: boolean }) =>
    cliManager.archivePersistedSessions(sessionIds, archived)
  )

  ipcMain.handle('cli:rename-session', (_event, { sessionId, name }: { sessionId: string; name: string }) =>
    cliManager.renamePersistedSession(sessionId, name)
  )

  ipcMain.handle('cli:search-sessions', (_event, { query, useRegex }: { query: string; useRegex?: boolean }) =>
    cliManager.searchSessions(query, useRegex ?? false)
  )

  ipcMain.handle('app:get-cwd', () => process.cwd())
}
