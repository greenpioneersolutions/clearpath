import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { IpcRendererEvent } from 'electron'
import type { ParsedOutput, SessionInfo, HistoricalSession } from '../types/ipc'
import type { PromptTemplate } from '../types/template'
import OutputDisplay, { type OutputMessage, type UsageStats } from '../components/OutputDisplay'
import CommandInput from '../components/CommandInput'
import ModeIndicator, { type SessionMode, MODE_CYCLE } from '../components/ModeIndicator'
import NewSessionModal from '../components/NewSessionModal'
import Composer from '../components/composer/Composer'
import QuickCompose, { type QuickComposeConfig } from '../components/composer/QuickCompose'
import TemplateForm from '../components/templates/TemplateForm'
import SessionManager from '../components/SessionManager'
import SchedulePanel from '../components/SchedulePanel'

// Lazy-load panel contents
import Agents from './Agents'
import Tools from './Tools'
import FileExplorer from './FileExplorer'
import GitWorkflow from './GitWorkflow'
import Templates from './Templates'
import SubAgents from './SubAgents'
import KnowledgeBase from './KnowledgeBase'
import SkillsPanel from '../components/skills/SkillsPanel'
import SkillWizard from '../components/skills/SkillWizard'
import SessionSummary from '../components/shared/SessionSummary'
import WelcomeBack from '../components/shared/WelcomeBack'
import GitHubPanel from '../components/integrations/GitHubPanel'
import SessionWizard from '../components/wizard/SessionWizard'
import MemoryPicker from '../components/memory/MemoryPicker'
import NotesManager from '../components/memory/NotesManager'

// ── Panel definitions ────────────────────────────────────────────────────────

type PanelId = 'agents' | 'tools' | 'files' | 'git' | 'work-items' | 'templates' | 'skills' | 'subagents' | 'knowledge'

const PANELS: Array<{ id: PanelId; icon: JSX.Element; label: string }> = [
  { id: 'agents', label: 'Agents', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
  { id: 'tools', label: 'Tools', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
  { id: 'files', label: 'Files', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg> },
  { id: 'git', label: 'Git', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg> },
  { id: 'work-items', label: 'Work Items', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
  { id: 'templates', label: 'Templates', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
  { id: 'skills', label: 'Skills', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg> },
  { id: 'subagents', label: 'Sub-Agents', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
  { id: 'knowledge', label: 'Knowledge', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
]

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
}

export default function Work(): JSX.Element {
  const navigate = useNavigate()
  const [activePanel, setActivePanel] = useState<PanelId | null>(null)
  const [sessions, setSessions] = useState<Map<string, ActiveSessionState>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNewSession, setShowNewSession] = useState(false)
  const [workMode, setWorkMode] = useState<'session' | 'wizard' | 'compose' | 'schedule' | 'memory'>('session')
  const [wizardChecked, setWizardChecked] = useState(false)
  const [quickConfig, setQuickConfig] = useState<QuickComposeConfig>({})
  const [activeTemplate, setActiveTemplate] = useState<PromptTemplate | null>(null)
  const [showSkillWizard, setShowSkillWizard] = useState(false)
  const [showSessionManager, setShowSessionManager] = useState(false)
  const [viewingStoppedSession, setViewingStoppedSession] = useState(false) // true = show conversation for a stopped session instead of welcome screen
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  const [showSaveNoteModal, setShowSaveNoteModal] = useState<string | null>(null) // content to save
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // ── Rehydrate sessions from main process on mount ──────────────────────
  // This recovers sessions that are still alive after navigating away and back.

  useEffect(() => {
    void (async () => {
      // 1. Load active in-memory sessions (still running in this app instance)
      const activeSessions = await window.electronAPI.invoke('cli:list-sessions') as SessionInfo[]

      // 2. Load persisted sessions from disk (survive app restart)
      const persisted = await window.electronAPI.invoke('cli:get-persisted-sessions') as
        Array<{ sessionId: string; cli: 'copilot' | 'claude'; name?: string; firstPrompt?: string; startedAt: number; endedAt?: number; messageLog: Array<{ type: string; content: string; metadata?: unknown; sender?: string }> }>

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
            const messages: OutputMessage[] = savedLog.map((entry, i) => ({
              id: String(i),
              output: { type: entry.type as OutputMessage['output']['type'], content: entry.content, metadata: entry.metadata as Record<string, unknown> | undefined },
            }))
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
    const handleOutput = (_e: IpcRendererEvent, { sessionId, output }: { sessionId: string; output: ParsedOutput }) => {
      setSessions((prev) => {
        const s = prev.get(sessionId)
        if (!s) return prev
        const updated = new Map(prev)
        updated.set(sessionId, { ...s, messages: [...s.messages, { id: String(s.msgIdCounter), output, timestamp: Date.now() }], msgIdCounter: s.msgIdCounter + 1 })
        return updated
      })
    }
    const handleError = (_e: IpcRendererEvent, { sessionId, error: errMsg }: { sessionId: string; error: string }) => {
      setSessions((prev) => {
        const s = prev.get(sessionId)
        if (!s) return prev
        const updated = new Map(prev)
        updated.set(sessionId, { ...s, messages: [...s.messages, { id: String(s.msgIdCounter), output: { type: 'error', content: errMsg.trim() }, timestamp: Date.now() }], msgIdCounter: s.msgIdCounter + 1 })
        return updated
      })
    }
    const handleExit = (_e: IpcRendererEvent, { sessionId, code }: { sessionId: string; code: number }) => {
      setSessions((prev) => {
        const s = prev.get(sessionId)
        if (!s) return prev
        // Only mark as stopped and show exit message for non-zero exits (real failures).
        // Exit code 0 on the per-turn model is normal — the CLI exited after responding.
        if (code !== 0) {
          const updated = new Map(prev)
          updated.set(sessionId, {
            ...s,
            info: { ...s.info, status: 'stopped' },
            messages: [...s.messages, { id: String(s.msgIdCounter), output: { type: 'error', content: `Session error (exit code ${code})` } }],
            msgIdCounter: s.msgIdCounter + 1,
            processing: false,
          })
          return updated
        }
        return prev
      })
    }
    const handleTurnStart = (_e: IpcRendererEvent, { sessionId }: { sessionId: string }) => {
      setSessions((prev) => { const s = prev.get(sessionId); if (!s) return prev; const u = new Map(prev); u.set(sessionId, { ...s, processing: true }); return u })
    }
    const handleTurnEnd = (_e: IpcRendererEvent, { sessionId }: { sessionId: string }) => {
      setSessions((prev) => { const s = prev.get(sessionId); if (!s) return prev; const u = new Map(prev); u.set(sessionId, { ...s, processing: false }); return u })
    }
    const handlePermission = (_e: IpcRendererEvent, { sessionId, request }: { sessionId: string; request: ParsedOutput }) => {
      setSessions((prev) => {
        const s = prev.get(sessionId)
        if (!s) return prev
        const updated = new Map(prev)
        updated.set(sessionId, { ...s, messages: [...s.messages, { id: String(s.msgIdCounter), output: request }], msgIdCounter: s.msgIdCounter + 1 })
        return updated
      })
    }

    const handleUsage = (_e: IpcRendererEvent, { sessionId, usage }: { sessionId: string; usage: string }) => {
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

  const startSession = useCallback(async (opts: { cli: 'copilot' | 'claude'; name?: string; workingDirectory?: string; initialPrompt?: string; agent?: string }) => {
    const { sessionId } = (await window.electronAPI.invoke('cli:start-session', {
      cli: opts.cli, mode: 'interactive', name: opts.name, workingDirectory: opts.workingDirectory, prompt: opts.initialPrompt, agent: opts.agent,
    })) as { sessionId: string }
    const info: SessionInfo = { sessionId, name: opts.name, cli: opts.cli, status: 'running', startedAt: Date.now() }
    const initial: OutputMessage[] = opts.initialPrompt ? [{ id: '0', output: { type: 'text', content: opts.initialPrompt }, sender: 'user', timestamp: Date.now() }] : []
    setSessions((prev) => { const u = new Map(prev); u.set(sessionId, { info, messages: initial, mode: 'normal', msgIdCounter: initial.length, processing: !!opts.initialPrompt, usageHistory: [] }); return u })
    setSelectedId(sessionId)
  }, [])

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
    // If memories are selected, prepend them as context silently
    // Uses notes:get-full-content to include both note text AND attached file contents
    void (async () => {
      let actualInput = input
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
      window.electronAPI.invoke('cli:send-input', { sessionId: selectedId, input: actualInput })
    })()

    // Show only the user's original message in the chat (not the prepended memory block)
    setSessions((prev) => {
      const s = prev.get(selectedId); if (!s) return prev
      const u = new Map(prev)
      const noteCount = selectedNoteIds.size
      const displayContent = noteCount > 0 ? `📎 ${noteCount} memor${noteCount === 1 ? 'y' : 'ies'} attached\n\n${input}` : input
      u.set(selectedId, { ...s, messages: [...s.messages, { id: String(s.msgIdCounter), output: { type: 'text', content: displayContent }, sender: 'user', timestamp: Date.now() }], msgIdCounter: s.msgIdCounter + 1, processing: true })
      return u
    })
  }, [selectedId, sessions, selectedNoteIds])

  const handleSlashCommand = useCallback((command: string) => {
    if (!selectedId) return
    // Intercept /delegate as a slash command too
    if (command.match(/^\/delegate\s+/i)) {
      handleSend(command)
      return
    }
    window.electronAPI.invoke('cli:send-slash-command', { sessionId: selectedId, command })
  }, [selectedId, handleSend])

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

  const togglePanel = (id: PanelId) => {
    setActivePanel(activePanel === id ? null : id)
    if (id !== 'skills') setShowSkillWizard(false)
  }

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
      Array<{ sessionId: string; cli: 'copilot' | 'claude'; name?: string; startedAt: number }>
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
  // Derive a sensible CLI default from the most recent session (or fall back to copilot)
  const lastUsedCli: 'copilot' | 'claude' = selectedSession?.info.cli ?? recentSessions[0]?.info.cli ?? 'copilot'

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Panel Toolbar */}
      <div className="w-12 flex flex-col items-center py-2 gap-1 flex-shrink-0" style={{ backgroundColor: 'var(--brand-dark-page)', borderRight: '1px solid var(--brand-dark-border)' }}>
        {PANELS.map((p) => (
          <button
            key={p.id}
            onClick={() => togglePanel(p.id)}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${
              activePanel === p.id
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            style={activePanel === p.id ? { backgroundColor: 'var(--brand-btn-primary)' } : {}}
            title={p.label}
          >
            {p.icon}
          </button>
        ))}
      </div>

      {/* Center: Session / Compose area */}
      <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--brand-dark-page)' }}>
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
            <button
              onClick={() => setWorkMode('wizard')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                workMode === 'wizard' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >Wizard</button>
            <button
              onClick={() => setWorkMode('compose')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                workMode === 'compose' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >Compose</button>
            <button
              onClick={() => setWorkMode('schedule')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                workMode === 'schedule' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >Schedule</button>
            <button
              onClick={() => setWorkMode('memory')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                workMode === 'memory' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >Memory</button>
          </div>

          {/* Session controls (only in session mode) */}
          {workMode === 'session' && (
            <>
              <select
                value={selectedId ?? ''}
                onChange={(e) => { setSelectedId(e.target.value || null); setViewingStoppedSession(false) }}
                className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[200px]"
              >
                <option value="">Select session...</option>
                {recentSessions.map(({ info }) => (
                  <option key={info.sessionId} value={info.sessionId}>
                    {info.name ?? info.sessionId.slice(0, 8)} ({info.cli}){info.status === 'stopped' ? ' - ended' : ''}
                  </option>
                ))}
              </select>

              <button onClick={() => setShowSessionManager(true)}
                className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 flex items-center gap-1 transition-colors"
                title="View all sessions"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                All
              </button>

              <button onClick={() => setShowNewSession(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1">
                + New
              </button>

              <div className="flex-1" />

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
                  <QuickCompose
                    config={quickConfig}
                    onConfigChange={setQuickConfig}
                    cli={selectedSession.info.cli}
                    onTemplateSelect={handleTemplateSelect}
                  />
                  <div className="flex items-center gap-2 px-3 py-1 border-t border-gray-800/50 bg-gray-950 flex-shrink-0">
                    <MemoryPicker
                      selectedIds={selectedNoteIds}
                      onToggle={(id) => setSelectedNoteIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })}
                      onClear={() => setSelectedNoteIds(new Set())}
                    />
                    {selectedNoteIds.size > 0 && (
                      <span className="text-[10px] text-indigo-400">{selectedNoteIds.size} memor{selectedNoteIds.size === 1 ? 'y' : 'ies'} attached</span>
                    )}
                  </div>
                  <CommandInput
                    cli={selectedSession.info.cli}
                    onSend={handleSend}
                    onSlashCommand={handleSlashCommand}
                    disabled={selectedSession.processing}
                    processing={selectedSession.processing}
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
              onNewSession={() => setShowNewSession(true)}
              onContinueSession={(info) => void startSession({ cli: info.cli, name: info.name ? `${info.name} (cont)` : undefined })}
              onViewSession={(sessionId) => { setSelectedId(sessionId); setViewingStoppedSession(true) }}
            />
          )
        )}

        {/* Wizard mode content */}
        {workMode === 'wizard' && (
          <SessionWizard
            defaultCli={lastUsedCli}
            onLaunchSession={(opts) => {
              void (async () => {
                await startSession({ cli: opts.cli, name: opts.name, initialPrompt: opts.initialPrompt, agent: opts.agent })
                setWorkMode('session')
              })()
            }}
          />
        )}

        {/* Compose mode content */}
        {workMode === 'compose' && (
          <div className="flex-1 flex flex-col bg-gray-50">
            <Composer
              onSendToSession={(prompt) => {
                if (selectedId) {
                  handleSend(prompt)
                  setWorkMode('session')
                }
              }}
              onSendToNewSession={(prompt) => {
                void (async () => {
                  await startSession({ cli: selectedSession?.info.cli ?? 'copilot', initialPrompt: prompt })
                  setWorkMode('session')
                })()
              }}
              cli={selectedSession?.info.cli ?? 'copilot'}
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
          <SchedulePanel cli={selectedSession?.info.cli ?? 'copilot'} />
        )}

        {/* Memory mode content */}
        {workMode === 'memory' && (
          <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
            <NotesManager />
          </div>
        )}
      </div>

      {/* Right: Contextual Panel (slides in) */}
      <div className={`transition-all duration-200 ease-in-out overflow-hidden ${
        activePanel ? 'w-[520px]' : 'w-0'
      }`}>
        <div className="w-[520px] h-full border-l border-gray-200 bg-white overflow-y-auto">
          {/* Panel header */}
          {activePanel && (
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
              <span className="text-sm font-semibold text-gray-800">
                {PANELS.find((p) => p.id === activePanel)?.label}
              </span>
              <button onClick={() => setActivePanel(null)}
                className="text-gray-400 hover:text-gray-600 text-xs">Close</button>
            </div>
          )}

          {/* Panel content */}
          <div className="p-4">
            {activePanel === 'agents' && <Agents />}
            {activePanel === 'tools' && <Tools />}
            {activePanel === 'files' && <FileExplorer />}
            {activePanel === 'git' && <GitWorkflow />}
            {activePanel === 'work-items' && (
              <GitHubPanel onInjectContext={(text) => {
                if (selectedId) {
                  handleSend(`Here is GitHub context for reference:\n\n${text}\n\nPlease review and summarize the key details.`)
                }
              }} />
            )}
            {activePanel === 'templates' && <Templates />}
            {activePanel === 'skills' && !showSkillWizard && (
              <SkillsPanel
                onInsertCommand={(cmd) => {
                  if (selectedId) {
                    handleSend(cmd)
                    setActivePanel(null)
                  }
                }}
                onCreateSkill={() => setShowSkillWizard(true)}
                onManageSkills={() => navigate('/configure')}
              />
            )}
            {activePanel === 'skills' && showSkillWizard && (
              <SkillWizard
                onSaved={() => { setShowSkillWizard(false) }}
                onCancel={() => setShowSkillWizard(false)}
              />
            )}
            {activePanel === 'subagents' && <SubAgents />}
            {activePanel === 'knowledge' && <KnowledgeBase />}
          </div>
        </div>
      </div>

      {/* New session modal */}
      {showNewSession && (
        <NewSessionModal
          onStart={(opts) => void startSession(opts)}
          onClose={() => setShowNewSession(false)}
          defaultCli={lastUsedCli}
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
