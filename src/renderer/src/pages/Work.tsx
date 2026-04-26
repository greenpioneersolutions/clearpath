import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import type { ParsedOutput, SessionInfo, HistoricalSession } from '../types/ipc'
import type { PromptTemplate } from '../types/template'
import type { BackendId } from '../../../shared/backends'
import { providerOf, migrateLegacyBackendId } from '../../../shared/backends'
import OutputDisplay, { type OutputMessage, type UsageStats } from '../components/OutputDisplay'
import ChatInputArea, { type ChatContextConfig } from '../components/ChatInputArea'
import ModeIndicator, { type SessionMode, MODE_CYCLE } from '../components/ModeIndicator'
import SessionSettingsModal, { type SessionSettingsEditChanges } from '../components/SessionSettingsModal'
import Composer from '../components/composer/Composer'
import TemplateForm from '../components/templates/TemplateForm'
import SessionManager from '../components/SessionManager'
import SchedulePanel from '../components/SchedulePanel'
import { useFeatureFlags } from '../contexts/FeatureFlagContext'

import SessionSummary from '../components/shared/SessionSummary'
import WelcomeBack from '../components/shared/WelcomeBack'
import SessionWizard from '../components/wizard/SessionWizard'
// Notes picker is now integrated into ChatInputArea via ContextPicker
import NotesManager from '../components/memory/NotesManager'
import ExtensionSlot from '../components/extensions/ExtensionSlot'

// ── Session state ────────────────────────────────────────────────────────────

function parseUsageStats(raw: string): UsageStats {
  const stats: UsageStats = { raw }
  const reqMatch = raw.match(/total usage est:\s*(.+)/i)
  if (reqMatch) stats.requests = reqMatch[1].trim()
  const apiMatch = raw.match(/api time spent:\s*(.+)/i)
  if (apiMatch) stats.apiTime = apiMatch[1].trim()
  const sessMatch = raw.match(/total session time:\s*(.+)/i)
  if (sessMatch) stats.sessionTime = sessMatch[1].trim()
  const codeMatch = raw.match(/total code changes:\s*(.+)/i)
  if (codeMatch) stats.codeChanges = codeMatch[1].trim()
  const modelMatch = raw.match(/(claude-\S+|gpt-\S+|gemini-\S+)\s+(.+)/i)
  if (modelMatch) stats.model = `${modelMatch[1]} — ${modelMatch[2].trim()}`
  return stats
}

interface ActiveSessionState {
  info: SessionInfo
  messages: OutputMessage[]
  mode: SessionMode
  msgIdCounter: number
  processing: boolean
  usageHistory: UsageStats[]
  /** Currently active model — updated when the user picks one via the ModelChip. */
  currentModel?: string
}

export default function Work(): JSX.Element {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { flags } = useFeatureFlags()
  const [sessions, setSessions] = useState<Map<string, ActiveSessionState>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNewSession, setShowNewSession] = useState(false)
  const [showEditSession, setShowEditSession] = useState(false)
  const [workMode, setWorkMode] = useState<'session' | 'wizard' | 'compose' | 'schedule' | 'memory'>('session')
  const [wizardChecked, setWizardChecked] = useState(false)
  const [quickConfig, setQuickConfig] = useState<ChatContextConfig>({})
  const [activeTemplate, setActiveTemplate] = useState<PromptTemplate | null>(null)
  const [showSessionManager, setShowSessionManager] = useState(false)
  const [viewingStoppedSession, setViewingStoppedSession] = useState(false) // true = show conversation for a stopped session instead of welcome screen
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  const [selectedContextSources, setSelectedContextSources] = useState<import('../types/contextSources').SelectedContextSource[]>([])
  const [showSaveNoteModal, setShowSaveNoteModal] = useState<string | null>(null) // content to save
  const [wizardOptionId, setWizardOptionId] = useState<string | undefined>(undefined)
  const [wizardStep, setWizardStep] = useState<string | undefined>(undefined)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const pendingQuickPrompt = useRef<string | null>(null)

  // ── Deep-link: parse URL params and location state ──────────────────────
  useEffect(() => {
    const tab = searchParams.get('tab') as typeof workMode | null
    if (tab && ['session', 'wizard', 'compose', 'schedule', 'memory'].includes(tab)) setWorkMode(tab)

    // Wizard deep-link: ?wizardOption=question or ?wizardStep=context
    const wo = searchParams.get('wizardOption')
    if (wo) setWizardOptionId(wo)
    const ws = searchParams.get('wizardStep')
    if (ws) setWizardStep(ws)

    const state = location.state as { sessionId?: string; quickPrompt?: string } | null
    if (state?.sessionId) setSelectedId(state.sessionId)
    if (state?.quickPrompt) pendingQuickPrompt.current = state.quickPrompt
  }, [location, searchParams])

  // ── Rehydrate sessions from main process on mount ──────────────────────
  // This recovers sessions that are still alive after navigating away and back.

  useEffect(() => {
    void (async () => {
      // 1. Load active in-memory sessions (still running in this app instance)
      const activeSessions = await window.electronAPI.invoke('cli:list-sessions') as SessionInfo[]

      // 2. Load persisted sessions from disk (survive app restart)
      const persisted = await window.electronAPI.invoke('cli:get-persisted-sessions') as
        Array<{ sessionId: string; cli: BackendId; name?: string; firstPrompt?: string; startedAt: number; endedAt?: number; messageLog: Array<{ type: string; content: string; metadata?: unknown; sender?: string }> }>

      // Build a set of active session IDs so we don't duplicate
      const activeIds = new Set(activeSessions.map((s) => s.sessionId))

      // Fetch message logs for active sessions in parallel
      const logs = await Promise.all(
        activeSessions.map(async (info) => {
          const log = await window.electronAPI.invoke('cli:get-message-log', { sessionId: info.sessionId }) as
            Array<{ type: string; content: string; metadata?: unknown }>
          return { sessionId: info.sessionId, log }
        })
      )
      const logMap = new Map(logs.map((l) => [l.sessionId, l.log]))

      setSessions((prev) => {
        const updated = new Map(prev)

        // Add active sessions
        for (const info of activeSessions) {
          if (!updated.has(info.sessionId)) {
            const savedLog = logMap.get(info.sessionId) ?? []
            const messages: OutputMessage[] = savedLog.map((entry, i) => {
              const e = entry as Record<string, unknown>
              return {
                id: String(i),
                output: { type: entry.type as OutputMessage['output']['type'], content: entry.content, metadata: entry.metadata as Record<string, unknown> | undefined },
                sender: (e.sender as OutputMessage['sender']) ?? undefined,
                timestamp: (e.timestamp as number) ?? undefined,
              }
            })
            if (messages.length === 0) {
              messages.push({ id: '0', output: { type: 'status', content: `Session restored (${info.cli})` } })
            }
            updated.set(info.sessionId, {
              info,
              messages,
              mode: 'normal',
              msgIdCounter: messages.length,
              processing: false,
              usageHistory: [],
            })
          }
        }

        // Add persisted sessions (previous app sessions) that aren't currently active
        for (const ps of persisted) {
          if (activeIds.has(ps.sessionId) || updated.has(ps.sessionId)) continue
          const messages: OutputMessage[] = ps.messageLog.map((entry, i) => ({
            id: String(i),
            output: { type: entry.type as OutputMessage['output']['type'], content: entry.content, metadata: entry.metadata as Record<string, unknown> | undefined },
            sender: (entry.sender as OutputMessage['sender']) ?? undefined,
            timestamp: (entry as Record<string, unknown>).timestamp as number | undefined,
          }))
          if (messages.length === 0) continue // Skip empty sessions
          const info: SessionInfo = {
            sessionId: ps.sessionId,
            name: ps.name,
            cli: ps.cli,
            status: 'stopped', // persisted sessions are always stopped (not running)
            startedAt: ps.startedAt,
          }
          updated.set(ps.sessionId, {
            info,
            messages,
            mode: 'normal',
            msgIdCounter: messages.length,
            processing: false,
            usageHistory: [],
          })
        }

        return updated
      })

      // Auto-select the first running session, or the most recent persisted one
      setSelectedId((prev) => {
        if (prev) return prev
        const running = activeSessions.find((s) => s.status === 'running')
        if (running) return running.sessionId
        if (activeSessions.length > 0) return activeSessions[0].sessionId
        if (persisted.length > 0) return persisted[0].sessionId
        return null
      })
    })()
  }, [])

  // ── Check wizard state — default to wizard tab if never used ─────────────

  useEffect(() => {
    // Skip auto-wizard if arriving with a quick prompt or explicit tab param
    if (pendingQuickPrompt.current) { setWizardChecked(true); return }
    const urlTab = searchParams.get('tab')
    if (urlTab) { setWizardChecked(true); return }

    void (async () => {
      const state = await window.electronAPI.invoke('wizard:get-state') as { hasCompletedWizard: boolean }
      if (!state.hasCompletedWizard) {
        setWorkMode('wizard')
      }
      setWizardChecked(true)
    })()
  }, [])

  // ── IPC event listeners ─────────────────────────────────────────────────

  useEffect(() => {
    const handleOutput = ({ sessionId, output }: { sessionId: string; output: ParsedOutput }) => {
      setSessions((prev) => {
        const s = prev.get(sessionId)
        if (!s) return prev
        const updated = new Map(prev)
        updated.set(sessionId, { ...s, messages: [...s.messages, { id: String(s.msgIdCounter), output, sender: 'ai' as const, timestamp: Date.now(), turnId: output.turnId }], msgIdCounter: s.msgIdCounter + 1 })
        return updated
      })
    }
    const handleError = ({ sessionId, error: errMsg }: { sessionId: string; error: string }) => {
      setSessions((prev) => {
        const s = prev.get(sessionId)
        if (!s) return prev
        const updated = new Map(prev)
        updated.set(sessionId, { ...s, messages: [...s.messages, { id: String(s.msgIdCounter), output: { type: 'error', content: errMsg.trim() }, timestamp: Date.now() }], msgIdCounter: s.msgIdCounter + 1 })
        return updated
      })
    }
    const handleExit = ({ sessionId, code }: { sessionId: string; code: number }) => {
      setSessions((prev) => {
        const s = prev.get(sessionId)
        if (!s) return prev
        // Exit code 0 on the per-turn model is normal — the CLI exited after responding.
        if (code === 0) return prev

        // Non-zero exit: show a gentle status message instead of a blocking error.
        // Keep the session as 'running' so users can retry by sending another message.
        // The CLI process will be respawned on the next input.
        const updated = new Map(prev)
        updated.set(sessionId, {
          ...s,
          messages: [...s.messages, { id: String(s.msgIdCounter), output: { type: 'status', content: 'The AI process ended unexpectedly. You can continue typing — a new process will start automatically.' }, sender: 'system' as const, timestamp: Date.now() }],
          msgIdCounter: s.msgIdCounter + 1,
          processing: false,
        })
        return updated
      })
    }
    const handleTurnStart = ({ sessionId }: { sessionId: string }) => {
      setSessions((prev) => { const s = prev.get(sessionId); if (!s) return prev; const u = new Map(prev); u.set(sessionId, { ...s, processing: true }); return u })
    }
    const handleTurnEnd = ({ sessionId }: { sessionId: string }) => {
      setSessions((prev) => { const s = prev.get(sessionId); if (!s) return prev; const u = new Map(prev); u.set(sessionId, { ...s, processing: false }); return u })
      void window.electronAPI.invoke('starter-pack:record-interaction')
    }
    const handlePermission = ({ sessionId, request }: { sessionId: string; request: ParsedOutput }) => {
      setSessions((prev) => {
        const s = prev.get(sessionId)
        if (!s) return prev
        const updated = new Map(prev)
        updated.set(sessionId, { ...s, messages: [...s.messages, { id: String(s.msgIdCounter), output: request }], msgIdCounter: s.msgIdCounter + 1 })
        return updated
      })
    }

    const handleUsage = ({ sessionId, usage }: { sessionId: string; usage: string }) => {
      setSessions((prev) => {
        const s = prev.get(sessionId)
        if (!s) return prev
        const stats = parseUsageStats(usage)
        const updated = new Map(prev)
        updated.set(sessionId, { ...s, usageHistory: [...s.usageHistory, stats] })
        return updated
      })
    }

    const cleanup = [
      window.electronAPI.on('cli:output', handleOutput),
      window.electronAPI.on('cli:error', handleError),
      window.electronAPI.on('cli:exit', handleExit),
      window.electronAPI.on('cli:turn-start', handleTurnStart),
      window.electronAPI.on('cli:turn-end', handleTurnEnd),
      window.electronAPI.on('cli:permission-request', handlePermission),
      window.electronAPI.on('cli:usage', handleUsage),
    ]
    return () => cleanup.forEach((fn) => fn())
  }, [])

  // ── Session management ──────────────────────────────────────────────────

  const startSession = useCallback(async (opts: { cli: BackendId; name?: string; workingDirectory?: string; initialPrompt?: string; displayPrompt?: string; agent?: string; model?: string; contextSummary?: { memories: string[]; agent?: string; skill?: string } }) => {
    const { sessionId } = (await window.electronAPI.invoke('cli:start-session', {
      cli: opts.cli, mode: 'interactive', name: opts.name, workingDirectory: opts.workingDirectory, prompt: opts.initialPrompt, displayPrompt: opts.displayPrompt, agent: opts.agent, model: opts.model,
    })) as { sessionId: string }
    const info: SessionInfo = { sessionId, name: opts.name, cli: opts.cli, status: 'running', startedAt: Date.now() }

    // Show the clean user message in chat, not the raw injected context
    const initial: OutputMessage[] = []
    if (opts.initialPrompt) {
      // If we have context (memories, agent, skill), show a summary card instead of raw text
      if (opts.contextSummary) {
        const parts: string[] = []
        if (opts.contextSummary.agent) parts.push(`**Agent:** ${opts.contextSummary.agent}`)
        if (opts.contextSummary.memories.length > 0) parts.push(`**Memories:** ${opts.contextSummary.memories.join(', ')}`)
        if (opts.contextSummary.skill) parts.push(`**Skill:** ${opts.contextSummary.skill}`)
        if (parts.length > 0) {
          initial.push({ id: 'ctx', output: { type: 'status', content: `Session launched with context:\n${parts.join(' · ')}` }, sender: 'system', timestamp: Date.now() })
        }
      }
      // Show the user's actual message (not the full injected prompt)
      const userMsg = opts.displayPrompt ?? opts.initialPrompt
      initial.push({ id: '0', output: { type: 'text', content: userMsg }, sender: 'user', timestamp: Date.now() })
    }

    setSessions((prev) => { const u = new Map(prev); u.set(sessionId, { info, messages: initial, mode: 'normal', msgIdCounter: initial.length, processing: !!opts.initialPrompt, usageHistory: [], currentModel: opts.model }); return u })
    setSelectedId(sessionId)

    // Pre-populate the context bar with what was selected in the wizard
    if (opts.contextSummary) {
      setQuickConfig({
        agent: opts.contextSummary.agent || undefined,
        skill: opts.contextSummary.skill || undefined,
      })
    }
  }, [])

  // ── Zero-click new session ─────────────────────────────────────────────
  // Resolves CLI / model / working-dir from settings + active workspace and
  // hands off to `startSession` without opening a modal. Any failure
  // surfaces via the existing `cli:error` pipeline (chat bubble), so no
  // special unauth handling here — matches the Sessions page behaviour.
  const handleQuickStart = useCallback(async () => {
    const settings = await window.electronAPI.invoke('settings:get') as {
      preferredBackend?: BackendId
      model?: { copilot?: string; claude?: string }
    } | null

    // 1. Resolve CLI: explicit default → last-used session's CLI → copilot-cli
    let cli: BackendId = 'copilot-cli'
    if (settings?.preferredBackend) {
      cli = settings.preferredBackend
    } else if (sessionsRef.current.size > 0) {
      const lastUsed = Array.from(sessionsRef.current.values())
        .sort((a, b) => b.info.startedAt - a.info.startedAt)[0]
      if (lastUsed) cli = lastUsed.info.cli
    }

    // 2. Resolve model: settings.model[provider] for that CLI
    const provider = providerOf(cli)
    const model = settings?.model?.[provider] || undefined

    // 3. Resolve working directory from the active workspace's first repo path
    let workingDirectory: string | undefined
    try {
      const activeId = await window.electronAPI.invoke('workspace:get-active') as string | null
      if (activeId) {
        const workspaces = await window.electronAPI.invoke('workspace:list') as Array<{
          id: string; repoPaths: string[]
        }>
        const active = workspaces.find((w) => w.id === activeId)
        if (active && active.repoPaths.length > 0) workingDirectory = active.repoPaths[0]
      }
    } catch {
      // Workspace lookup is best-effort; empty workingDirectory falls back to backend default.
    }

    await startSession({ cli, model, workingDirectory })
  }, [startSession])

  // ── Edit an existing session's settings ──────────────────────────────
  const handleEditSessionSave = useCallback(async (changes: SessionSettingsEditChanges) => {
    if (!selectedId) return
    if (changes.model) handleModelChange(changes.model)
    if (changes.name) {
      await window.electronAPI.invoke('cli:rename-session', { sessionId: selectedId, name: changes.name })
      setSessions((prev) => {
        const s = prev.get(selectedId); if (!s) return prev
        const u = new Map(prev)
        u.set(selectedId, { ...s, info: { ...s.info, name: changes.name } })
        return u
      })
    }
  }, [selectedId])

  // ── Auto-start session from Home page quick prompt ─────────────────────
  useEffect(() => {
    if (pendingQuickPrompt.current) {
      const p = pendingQuickPrompt.current
      pendingQuickPrompt.current = null
      void startSession({ cli: 'copilot-cli', name: p.slice(0, 30), initialPrompt: p })
      setWorkMode('session')
    }
  }, [startSession])

  const stopSession = useCallback(async (sessionId: string) => {
    await window.electronAPI.invoke('cli:stop-session', { sessionId })
    setSessions((prev) => { const s = prev.get(sessionId); if (!s) return prev; const u = new Map(prev); u.set(sessionId, { ...s, info: { ...s.info, status: 'stopped' } }); return u })
  }, [])

  const handleSend = useCallback((input: string) => {
    if (!selectedId) return
    const trimmed = input.trim()

    // ── Sub-agent delegation ──────────────────────────────────────────
    // &prompt  → spawn a background sub-agent (mirrors Copilot CLI's & prefix)
    // /delegate prompt → same thing as a slash command
    const delegateMatch = trimmed.match(/^&\s*(.+)$/s) ?? trimmed.match(/^\/delegate\s+(.+)$/si)
    if (delegateMatch) {
      const prompt = delegateMatch[1].trim()
      const session = sessions.get(selectedId)
      const cli = session?.info.cli ?? 'copilot'

      // Show it in the chat as a delegation notice
      setSessions((prev) => {
        const s = prev.get(selectedId); if (!s) return prev
        const u = new Map(prev)
        u.set(selectedId, {
          ...s,
          messages: [
            ...s.messages,
            { id: String(s.msgIdCounter), output: { type: 'text', content: `&${prompt}` }, sender: 'user', timestamp: Date.now() },
            { id: String(s.msgIdCounter + 1), output: { type: 'status', content: `Delegating to background sub-agent (${cli})...` }, sender: 'system' },
          ],
          msgIdCounter: s.msgIdCounter + 2,
        })
        return u
      })

      // Spawn the sub-agent
      void (async () => {
        try {
          const info = await window.electronAPI.invoke('subagent:spawn', {
            name: prompt.slice(0, 50),
            cli,
            prompt,
            workingDirectory: session?.info.sessionId ? undefined : undefined,
          }) as { id: string; name: string }

          setSessions((prev) => {
            const s = prev.get(selectedId); if (!s) return prev
            const u = new Map(prev)
            u.set(selectedId, {
              ...s,
              messages: [
                ...s.messages,
                { id: String(s.msgIdCounter), output: { type: 'status', content: `Sub-agent spawned: "${info.name}" — track it in the Sub-Agents panel` } },
              ],
              msgIdCounter: s.msgIdCounter + 1,
            })
            return u
          })
        } catch (err) {
          setSessions((prev) => {
            const s = prev.get(selectedId); if (!s) return prev
            const u = new Map(prev)
            u.set(selectedId, {
              ...s,
              messages: [
                ...s.messages,
                { id: String(s.msgIdCounter), output: { type: 'error', content: `Failed to delegate: ${String(err)}` } },
              ],
              msgIdCounter: s.msgIdCounter + 1,
            })
            return u
          })
        }
      })()

      return
    }

    // ── Normal send ───────────────────────────────────────────────────
    // If fleet mode is active, instruct the AI to use parallel sub-agents
    // If memories are selected, prepend them as context silently
    void (async () => {
      let actualInput = input
      if (quickConfig.fleet) {
        actualInput = `[Fleet mode: You may use &prompt to dispatch sub-agents for parallel work. Break this task into independent parts and delegate them to work simultaneously when appropriate.]\n\n${actualInput}`
      }
      if (selectedNoteIds.size > 0) {
        const blocks: string[] = []
        for (const noteId of selectedNoteIds) {
          const result = await window.electronAPI.invoke('notes:get-full-content', { id: noteId }) as { content?: string; error?: string }
          const noteMeta = await window.electronAPI.invoke('notes:get', { id: noteId }) as { title?: string } | null
          if (result.content) {
            blocks.push(`--- Memory: ${noteMeta?.title ?? 'Untitled'} ---\n${result.content}`)
          }
        }
        if (blocks.length > 0) {
          actualInput = `[Reference context from saved memories]\n\n${blocks.join('\n\n')}\n\n---\n\n${input}`
        }
        setSelectedNoteIds(new Set()) // Clear after sending
      }
      // Context source injection — fetch live data from extensions/integrations
      if (selectedContextSources.length > 0) {
        try {
          const results = await window.electronAPI.invoke('context-sources:fetch-multi',
            selectedContextSources.map((s) => ({ providerId: s.providerId, params: s.params })),
          ) as Array<{ success: boolean; providerId: string; context: string }>
          const contextBlocks: string[] = []
          for (const r of results) {
            if (r.success && r.context) {
              const source = selectedContextSources.find((s) => s.providerId === r.providerId)
              contextBlocks.push(`--- Context: ${source?.label ?? r.providerId} ---\n${r.context}`)
            }
          }
          if (contextBlocks.length > 0) {
            actualInput = `[Reference context from connected sources]\n\n${contextBlocks.join('\n\n')}\n\n---\n\n${actualInput}`
          }
        } catch {
          // Context fetch failed — send without it
        }
      }
      window.electronAPI.invoke('cli:send-input', { sessionId: selectedId, input: actualInput })
    })()

    // Show only the user's original message in the chat (not the prepended context).
    // Build a "Sent with..." annotation that surfaces what context was actually attached
    // — makes the invisible visible.
    setSessions((prev) => {
      const s = prev.get(selectedId); if (!s) return prev
      const u = new Map(prev)
      const noteCount = selectedNoteIds.size
      const ctxCount = selectedContextSources.length
      const parts: string[] = []
      if (quickConfig.agent) parts.push(`Prompt: ${quickConfig.agent}`)
      if (quickConfig.skill) parts.push(`Playbook: ${quickConfig.skill}`)
      if (noteCount > 0) parts.push(`${noteCount} note${noteCount === 1 ? '' : 's'}`)
      if (ctxCount > 0) parts.push(`${ctxCount} source${ctxCount === 1 ? '' : 's'}`)
      if (quickConfig.fleet) parts.push('Parallel Mode')
      const contextAnnotation = parts.length > 0 ? `Sent with ${parts.join(' + ')}` : undefined
      u.set(selectedId, {
        ...s,
        messages: [
          ...s.messages,
          {
            id: String(s.msgIdCounter),
            output: { type: 'text', content: input },
            sender: 'user',
            timestamp: Date.now(),
            contextAnnotation,
          },
        ],
        msgIdCounter: s.msgIdCounter + 1,
        processing: true,
      })
      return u
    })
  }, [selectedId, sessions, selectedNoteIds, selectedContextSources, quickConfig])

  const handleSlashCommand = useCallback((command: string) => {
    if (!selectedId) return
    // Intercept /delegate as a slash command too
    if (command.match(/^\/delegate\s+/i)) {
      handleSend(command)
      return
    }
    window.electronAPI.invoke('cli:send-slash-command', { sessionId: selectedId, command })
  }, [selectedId, handleSend])

  const handleModelChange = useCallback((model: string) => {
    if (!selectedId || !model) return
    // Send `/model <name>` to the running CLI session
    void window.electronAPI.invoke('cli:send-slash-command', {
      sessionId: selectedId,
      command: `/model ${model}`,
    })
    setSessions((prev) => {
      const s = prev.get(selectedId); if (!s) return prev
      const u = new Map(prev)
      u.set(selectedId, {
        ...s,
        currentModel: model,
        messages: [
          ...s.messages,
          {
            id: String(s.msgIdCounter),
            output: { type: 'status', content: `Model switched to ${model}` },
            sender: 'system',
            timestamp: Date.now(),
          },
        ],
        msgIdCounter: s.msgIdCounter + 1,
      })
      return u
    })
  }, [selectedId])

  const handlePermissionResponse = useCallback((response: 'y' | 'n') => {
    if (!selectedId) return
    window.electronAPI.invoke('cli:send-input', { sessionId: selectedId, input: response })
  }, [selectedId])

  const handleTemplateSelect = useCallback((template: PromptTemplate) => {
    if (template.variables.length === 0) {
      // No variables — send the template body directly
      handleSend(template.body)
      void window.electronAPI.invoke('templates:record-usage', { id: template.id })
    } else {
      // Has variables — show the inline form to fill them in
      setActiveTemplate(template)
    }
  }, [handleSend])

  const handleTemplateSend = useCallback((hydratedPrompt: string) => {
    handleSend(hydratedPrompt)
    setActiveTemplate(null)
  }, [handleSend])

  const handleModeToggle = useCallback(() => {
    if (!selectedId) return
    setSessions((prev) => {
      const s = prev.get(selectedId); if (!s) return prev
      const nextMode = MODE_CYCLE[(MODE_CYCLE.indexOf(s.mode) + 1) % MODE_CYCLE.length]
      const u = new Map(prev); u.set(selectedId, { ...s, mode: nextMode }); return u
    })
    window.electronAPI.invoke('cli:send-input', { sessionId: selectedId, input: '\x1b[Z' })
  }, [selectedId])

  const handleSessionManagerSelect = useCallback(async (sessionId: string) => {
    // If the session is already in our map, just select it
    if (sessions.has(sessionId)) {
      setSelectedId(sessionId)
      return
    }
    // Otherwise load it from persisted storage
    const log = await window.electronAPI.invoke('cli:get-message-log', { sessionId }) as
      Array<{ type: string; content: string; metadata?: unknown; sender?: string }>
    const persisted = await window.electronAPI.invoke('cli:get-persisted-sessions') as
      Array<{ sessionId: string; cli: BackendId; name?: string; startedAt: number }>
    const ps = persisted.find((s) => s.sessionId === sessionId)
    if (!ps) return

    const messages: OutputMessage[] = log.map((entry, i) => ({
      id: String(i),
      output: { type: entry.type as OutputMessage['output']['type'], content: entry.content, metadata: entry.metadata as Record<string, unknown> | undefined },
      sender: (entry.sender as OutputMessage['sender']) ?? undefined,
    }))
    const info: SessionInfo = { sessionId: ps.sessionId, name: ps.name, cli: ps.cli, status: 'stopped', startedAt: ps.startedAt }
    setSessions((prev) => {
      const u = new Map(prev)
      u.set(sessionId, { info, messages, mode: 'normal', msgIdCounter: messages.length, processing: false, usageHistory: [] })
      return u
    })
    setSelectedId(sessionId)
  }, [sessions])

  const handleDeleteCurrentSession = useCallback(() => {
    if (!selectedId) return
    void window.electronAPI.invoke('cli:delete-session', { sessionId: selectedId })
    setSessions((prev) => { const u = new Map(prev); u.delete(selectedId); return u })
    setSelectedId(null)
  }, [selectedId])

  const activeSessions = Array.from(sessions.values())
  // Show only the 5 most recent in the dropdown, sorted by startedAt desc
  const recentSessions = [...activeSessions]
    .sort((a, b) => b.info.startedAt - a.info.startedAt)
    .slice(0, 5)
  const selectedSession = selectedId ? sessions.get(selectedId) ?? null : null
  // Derive a sensible CLI default from the most recent session (or fall back to copilot-cli)
  const lastUsedCli: BackendId = selectedSession?.info.cli ?? recentSessions[0]?.info.cli ?? 'copilot-cli'

  return (
    <div className="flex h-full overflow-hidden">
      {/* Center: Session / Compose area (full-width) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0" style={{ backgroundColor: 'var(--brand-dark-page)' }}>
        {/* Header bar with mode toggle */}
        <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ backgroundColor: 'var(--brand-dark-page)', borderBottom: '1px solid var(--brand-dark-border)' }}>
          {/* Mode toggle */}
          <div className="flex rounded-lg p-0.5 flex-shrink-0" style={{ backgroundColor: 'var(--brand-dark-card)' }}>
            <button
              onClick={() => setWorkMode('session')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                workMode === 'session' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >Session</button>
            {flags.showSessionWizard && (
            <button
              onClick={() => setWorkMode('wizard')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                workMode === 'wizard' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >Wizard</button>
            )}
            {flags.showComposer && (
            <button
              onClick={() => setWorkMode('compose')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                workMode === 'compose' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >Compose</button>
            )}
            {flags.showScheduler && (
            <button
              onClick={() => setWorkMode('schedule')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                workMode === 'schedule' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >Schedule</button>
            )}
            {flags.showMemory && (
            <button
              onClick={() => setWorkMode('memory')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                workMode === 'memory' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >Memory</button>
            )}
          </div>

          {/* Session controls (only in session mode) */}
          {workMode === 'session' && (
            <>
              <div className="flex-1 flex items-center justify-center min-w-0 gap-2">
                {selectedId && selectedSession && (
                  <>
                    <span className="text-xs text-gray-400 truncate" title={`${selectedSession.info.name ?? 'Session'} · ${providerOf(selectedSession.info.cli) === 'copilot' ? 'Copilot' : 'Claude Code'} · ${selectedSession.currentModel ?? 'default model'}`}>
                      {selectedSession.info.name ?? 'Session'}
                      <span className="text-gray-600 mx-1.5">·</span>
                      {providerOf(selectedSession.info.cli) === 'copilot' ? 'Copilot' : 'Claude Code'}
                      <span className="text-gray-600 mx-1.5">·</span>
                      {selectedSession.currentModel ?? 'default model'}
                    </span>
                    <button
                      onClick={() => setShowEditSession(true)}
                      className="text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
                      title="Edit session"
                      aria-label="Edit session"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {selectedSession && (
                <>
                  <ModeIndicator mode={selectedSession.mode} onToggle={handleModeToggle} />
                  {selectedSession.processing && (
                    <span className="flex items-center gap-1.5 text-xs text-yellow-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /> Thinking...
                    </span>
                  )}
                  {selectedSession.info.status === 'running' ? (
                    <button onClick={() => void stopSession(selectedSession.info.sessionId)}
                      className="px-2 py-1 text-xs bg-red-900/50 hover:bg-red-800/60 text-red-300 border border-red-700/50 rounded-md">
                      Stop
                    </button>
                  ) : (
                    <span className="text-xs text-gray-500">Stopped</span>
                  )}
                </>
              )}

              <button onClick={() => setShowSessionManager(true)}
                className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 flex items-center gap-1 transition-colors"
                title="View all sessions"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                All
              </button>

              <button onClick={() => void handleQuickStart()}
                className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1">
                + New
              </button>
            </>
          )}
        </div>

        {/* Session mode content */}
        {workMode === 'session' && (
          selectedSession && (selectedSession.info.status === 'running' || viewingStoppedSession) ? (
            <div className="flex-1 flex flex-col min-h-0">
              <OutputDisplay messages={selectedSession.messages} onPermissionResponse={handlePermissionResponse} processing={selectedSession.processing} usageHistory={selectedSession.usageHistory}
                onSaveAsNote={(content) => setShowSaveNoteModal(content)} />
              {selectedSession.info.status === 'running' ? (
                <>
                  {/* Inline template form (shown when a template with variables is selected) */}
                  {activeTemplate && (
                    <div className="border-t border-gray-800 bg-gray-900/90 backdrop-blur-sm p-4">
                      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-5 shadow-lg">
                        <TemplateForm
                          template={activeTemplate}
                          onSend={handleTemplateSend}
                          onCancel={() => setActiveTemplate(null)}
                        />
                      </div>
                    </div>
                  )}
                  <ExtensionSlot slotName="work:above-input" className="flex-shrink-0" />
                  <ChatInputArea
                    cli={selectedSession.info.cli}
                    onSend={handleSend}
                    onSlashCommand={handleSlashCommand}
                    disabled={selectedSession.processing}
                    processing={selectedSession.processing}
                    hasActiveSession={selectedSession.info.status === 'running'}
                    config={quickConfig}
                    onConfigChange={setQuickConfig}
                    selectedNoteIds={selectedNoteIds}
                    onToggleNote={(id) =>
                      setSelectedNoteIds((prev) => {
                        const next = new Set(prev)
                        next.has(id) ? next.delete(id) : next.add(id)
                        return next
                      })
                    }
                    onClearNotes={() => setSelectedNoteIds(new Set())}
                    selectedContextSources={selectedContextSources}
                    onToggleContextSource={(source) => {
                      setSelectedContextSources((prev) => {
                        const exists = prev.find((s) => s.providerId === source.providerId)
                        if (exists) return prev.filter((s) => s.providerId !== source.providerId)
                        return [...prev, source]
                      })
                    }}
                    onRemoveContextSource={(providerId) =>
                      setSelectedContextSources((prev) => prev.filter((s) => s.providerId !== providerId))
                    }
                    onClearContextSources={() => setSelectedContextSources([])}
                    onTemplateSelect={handleTemplateSelect}
                    currentModel={selectedSession.currentModel}
                    onModelChange={handleModelChange}
                  />
                </>
              ) : (
                /* Viewing a stopped session — show a bar to go back or continue */
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-800 bg-gray-900 flex-shrink-0">
                  <button
                    onClick={() => setViewingStoppedSession(false)}
                    className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                  <span className="text-xs text-gray-500">
                    {selectedSession.info.name ?? selectedSession.info.sessionId.slice(0, 8)} — Ended
                  </span>
                  <button
                    onClick={() => void startSession({ cli: selectedSession.info.cli, name: selectedSession.info.name ? `${selectedSession.info.name} (cont)` : undefined })}
                    className="px-3 py-1.5 text-xs text-indigo-400 border border-indigo-700/50 rounded-lg hover:bg-indigo-900/30 transition-colors"
                  >
                    Continue from this session
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Welcome back / no session screen — shown when no session is selected OR selected session is stopped */
            <WelcomeBack
              recentSessions={recentSessions.map((s) => ({ info: s.info, messages: s.messages }))}
              onStartBlank={() => void handleQuickStart()}
              onContinueSession={(info) => void startSession({ cli: info.cli, name: info.name ? `${info.name} (cont)` : undefined })}
              onBrowseAll={() => setShowSessionManager(true)}
            />
          )
        )}

        {/* Wizard mode content */}
        {workMode === 'wizard' && (
          <SessionWizard
            defaultCli={lastUsedCli}
            initialOptionId={wizardOptionId}
            initialStep={wizardStep as 'choose' | 'fill' | 'context' | 'review' | undefined}
            onLaunchSession={(opts) => {
              void (async () => {
                await startSession({ cli: opts.cli, name: opts.name, initialPrompt: opts.initialPrompt, displayPrompt: opts.displayPrompt, agent: opts.agent, model: opts.model, contextSummary: opts.contextSummary })
                // If fleet mode was enabled, set it in the context bar
                if (opts.fleetMode) {
                  setQuickConfig((prev) => ({ ...prev, fleet: true }))
                }
                setWorkMode('session')
              })()
            }}
          />
        )}

        {/* Compose mode content */}
        {workMode === 'compose' && (
          <div className="flex-1 flex flex-col min-h-0 bg-gray-50 overflow-y-auto">
            <Composer
              onSendToSession={(prompt) => {
                if (selectedId) {
                  handleSend(prompt)
                  setWorkMode('session')
                }
              }}
              onSendToNewSession={(prompt) => {
                void (async () => {
                  await startSession({ cli: selectedSession?.info.cli ?? 'copilot-cli', initialPrompt: prompt })
                  setWorkMode('session')
                })()
              }}
              cli={selectedSession?.info.cli ?? 'copilot-cli'}
              hasActiveSession={!!selectedSession && selectedSession.info.status === 'running'}
              activeSessionName={selectedSession?.info.name ?? selectedSession?.info.sessionId.slice(0, 8)}
              sessions={recentSessions.filter((s) => s.info.status === 'running').map((s) => ({
                id: s.info.sessionId,
                name: s.info.name ?? s.info.sessionId.slice(0, 8),
                cli: s.info.cli,
                status: s.info.status,
              }))}
            />
          </div>
        )}

        {/* Schedule mode content */}
        {workMode === 'schedule' && (
          <div className="flex-1 overflow-y-auto">
            <SchedulePanel cli={selectedSession?.info.cli ?? 'copilot-cli'} />
          </div>
        )}

        {/* Memory mode content */}
        {workMode === 'memory' && (
          <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
            <NotesManager />
          </div>
        )}
      </div>

      {/* Create-mode fallback — retained for callers that still want the full
          New Session dialog (e.g. starter prompts). "+ New" no longer opens it. */}
      {showNewSession && (
        <SessionSettingsModal
          mode="create"
          onStart={(opts) => void startSession(opts)}
          onClose={() => setShowNewSession(false)}
          defaultCli={lastUsedCli}
        />
      )}

      {/* Edit-mode modal — opened by the gear icon in the top bar. */}
      {showEditSession && selectedSession && (
        <SessionSettingsModal
          mode="edit"
          existingSession={selectedSession.info}
          currentModel={selectedSession.currentModel}
          onSave={(changes) => void handleEditSessionSave(changes)}
          onClose={() => setShowEditSession(false)}
        />
      )}

      {/* Session manager modal */}
      {showSessionManager && (
        <SessionManager
          onClose={() => setShowSessionManager(false)}
          onSelectSession={(id) => void handleSessionManagerSelect(id)}
          currentSessionId={selectedId}
        />
      )}

      {/* Save as memory note modal */}
      {showSaveNoteModal !== null && (
        <SaveNoteModal
          content={showSaveNoteModal}
          sessionName={selectedSession?.info.name}
          sessionId={selectedSession?.info.sessionId}
          onClose={() => setShowSaveNoteModal(null)}
        />
      )}
    </div>
  )
}

// ── Save Note Modal ──────────────────────────────────────────────────────────

function SaveNoteModal({ content, sessionName, sessionId, onClose }: {
  content: string; sessionName?: string; sessionId?: string; onClose: () => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('outcome')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await window.electronAPI.invoke('notes:create', {
      title: title.trim() || 'Untitled Note',
      content,
      category,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      source: sessionId ? `session:${sessionId}` : 'manual',
      sessionName,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(onClose, 800)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fadeIn" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">Save as Memory</h3>
          <p className="text-xs text-gray-500 mt-0.5">Save this AI response so you can reference it later</p>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Title</label>
            <input
              type="text" value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Meeting follow-up email draft, Auth refactor analysis..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="outcome">Outcome</option>
                <option value="meeting">Meeting</option>
                <option value="conversation">Conversation</option>
                <option value="reference">Reference</option>
                <option value="idea">Idea</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400 mb-1">Tags (comma separated)</label>
              <input type="text" value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., q2, auth, email"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Content preview</label>
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 max-h-32 overflow-y-auto">
              <p className="text-xs text-gray-400 whitespace-pre-wrap">{content.slice(0, 500)}{content.length > 500 ? '...' : ''}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancel</button>
          <button onClick={() => void handleSave()} disabled={saving || saved}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
              saved ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500'
            } disabled:opacity-60`}>
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Memory'}
          </button>
        </div>
      </div>
    </div>
  )
}
