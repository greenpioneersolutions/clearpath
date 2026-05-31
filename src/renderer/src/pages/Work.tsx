import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom'
import type { ParsedOutput, SessionInfo, HistoricalSession } from '../types/ipc'
import type { PromptTemplate, HydratedTemplate } from '../types/template'
import type { BackendId } from '../../../shared/backends'
import { providerOf, migrateLegacyBackendId, pickReadyBackend } from '../../../shared/backends'
import { useAuthStatus, readyBackendsOf } from '../hooks/useAuthStatus'
import OutputDisplay, { type OutputMessage, type UsageStats } from '../components/OutputDisplay'
import SessionActivityPanel from '../components/activity/SessionActivityPanel'
import ChatInputArea, { type ChatContextConfig } from '../components/ChatInputArea'
import ModeIndicator, { type SessionMode, MODE_CYCLE } from '../components/ModeIndicator'
import SessionSettingsModal, { type SessionSettingsEditChanges } from '../components/SessionSettingsModal'
import Composer from '../components/composer/Composer'
import TemplateForm from '../components/templates/TemplateForm'
import SessionManager from '../components/SessionManager'
import SchedulePanel from '../components/SchedulePanel'
import { useFeatureFlags } from '../contexts/FeatureFlagContext'

import SessionSummary from '../components/shared/SessionSummary'
import WorkLaunchpad from '../components/work/WorkLaunchpad'
import CompactNudge from '../components/work/CompactNudge'
import PreflightWarningStack from '../components/work/PreflightWarningStack'
// Notes picker is now integrated into ChatInputArea via ContextPicker.
// The dedicated Notes management UI lives at /notes — there is no longer a
// Notes sub-tab inside Sessions.
import ExtensionSlot from '../components/extensions/ExtensionSlot'
import { dispatchOrForward } from '../lib/slashCommandDispatcher'

// The home page can hand us a prompt plus the model/agent/cli the user
// picked from the home popover. None of these are required — the auto-start
// effect below falls back to copilot-cli + defaults when they're absent.
interface PendingQuickPrompt {
  prompt: string
  cli?: BackendId
  model?: string
  agent?: string
  attachedAgent?: { id: string; name: string }
  /** Forwarded straight through to `cli:start-session` — see SessionOptions. */
  noAgent?: boolean
}

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
  /**
   * The concrete directory this session spawned in — the anchor for its
   * `.clear-path/uploads/<id>/` attachments. Captured at start and refreshed
   * after a mid-session attach so staging and the `<files>` framing always use
   * the SAME dir (otherwise re-resolving could pick a different root and the
   * agent's relative paths wouldn't exist). `undefined` until known.
   */
  workingDirectory?: string
  /**
   * Most recent post-lint token breakdown for this session. Driven by
   * `cli:prompt-shaped` (Token Coach Phase 2) so the meter chip can reflect
   * the actual numbers that went out the wire instead of the typing estimate.
   */
  lastShapedBreakdown?: import('../../../shared/tokenization/types').SliceTokenBreakdown
}

export default function Work(): JSX.Element {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { flags } = useFeatureFlags()
  const [sessions, setSessions] = useState<Map<string, ActiveSessionState>>(new Map())
  const [showNewSession, setShowNewSession] = useState(false)
  const [showEditSession, setShowEditSession] = useState(false)
  const [workMode, setWorkMode] = useState<'session' | 'compose' | 'schedule'>('session')
  const [quickConfig, setQuickConfig] = useState<ChatContextConfig>({})
  const [activeTemplate, setActiveTemplate] = useState<PromptTemplate | null>(null)
  const [showSessionManager, setShowSessionManager] = useState(false)
  const [viewingStoppedSession, setViewingStoppedSession] = useState(false)
  // Session id whose "Files & activity" drawer is open (null = closed).
  const [activitySessionId, setActivitySessionId] = useState<string | null>(null)
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  // Mid-session file attachments, staged into the active session's uploads dir
  // and framed onto the NEXT send. Keyed by sessionId so switching sessions
  // never leaks one chat's pending files into another.
  const [pendingFilesBySession, setPendingFilesBySession] = useState<Record<string, Array<{ id: string; name: string; relPath: string }>>>({})
  const [selectedContextSources, setSelectedContextSources] = useState<import('../types/contextSources').SelectedContextSource[]>([])
  const [showSaveNoteModal, setShowSaveNoteModal] = useState<string | null>(null)
  // Token Coach Phase 4 — per-turn routing override. The ModelRoutingChip
  // writes here; we thread it into the next `cli:send-input` payload and
  // clear immediately after so the override is strictly per-turn.
  const [routingOverride, setRoutingOverride] = useState<string | null>(null)
  // Token Coach Phase 5 — monotonic counter incremented on every keystroke
  // in the chat input. PreflightWarningStack reads this to auto-dismiss its
  // banners when the user starts editing (signal: "I've seen the warning,
  // I'm addressing it"). Defaulting to 0 keeps stack mount neutral.
  const [editTick, setEditTick] = useState(0)
  // Per-session running token total — sum of cost records for the currently
  // selected session. Drives CompactNudge's 70% threshold check. Refreshed
  // on turn-end (where we re-read cost:list scoped to this session) so the
  // nudge can appear as soon as the cumulative usage crosses the threshold.
  const [sessionTokens, setSessionTokens] = useState<Map<string, number>>(new Map())
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const pendingQuickPrompt = useRef<PendingQuickPrompt | null>(null)
  // The quick-prompt we've already auto-started, used to make the Home→Work
  // hand-off idempotent. Two re-entry paths would otherwise double-spawn:
  //  1. React StrictMode double-invokes effects on mount.
  //  2. The first startSession changes the URL (`?id=`), so the deep-link
  //     effect re-runs against the still-present location.state and re-seeds
  //     pendingQuickPrompt.
  // Keying on the prompt text survives both (the key/path change between
  // re-entries, the prompt doesn't), so we never start the same hand-off twice.
  const startedQuickPrompt = useRef<string | null>(null)

  // Backend readiness — drives readiness-aware CLI defaults so we never launch
  // an uninstalled CLI. `readyBackendsRef` lets the callbacks below read the
  // latest set without re-creating themselves on every auth refresh.
  const auth = useAuthStatus()
  const readyBackends = readyBackendsOf(auth)
  const readyBackendsRef = useRef(readyBackends)
  readyBackendsRef.current = readyBackends
  // Track whether the auth probe has completed so callbacks can tell "nothing
  // connected" apart from "still checking". Only the former should block a launch.
  const authLoadedRef = useRef(auth.loaded)
  authLoadedRef.current = auth.loaded
  // Surfaced when a launch is blocked or the main process reports the CLI
  // isn't ready (CLI_NOT_READY). Rendered as a banner above the launchpad and
  // cleared on the next successful start.
  const [startError, setStartError] = useState<string | null>(null)
  // Non-blocking hint shown after a mid-session file attach that fell back to the
  // app-managed scratch dir (no real workspace selected). Files DID attach — this
  // just nudges the user to pick a workspace so the next session's files land in
  // their repo. Dismissed on click-through, on the next clean attach, or via ×.
  const [showWorkspaceNudge, setShowWorkspaceNudge] = useState(false)

  // selectedId is derived from the URL — `?id=<sessionId>`. When absent, the
  // launchpad renders. setSelectedId() pushes the id into the URL so deep
  // links + sidebar nav reset behave consistently.
  const selectedId = searchParams.get('id')
  const setSelectedId = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      const entries: Record<string, string> = {}
      prev.forEach((value, key) => { entries[key] = value })
      if (id) entries.id = id
      else delete entries.id
      return entries
    }, { replace: true })
  }, [setSearchParams])

  // ── Deep-link: parse URL params and location state ──────────────────────
  useEffect(() => {
    const tabRaw = searchParams.get('tab')
    // Back-compat redirect: pre-rename links used `?tab=memory` and
    // `?tab=notes` for the Notes sub-tab that lived under Sessions. Notes is
    // now its own top-level page at /notes — fold both legacy params into a
    // navigation so bookmarks and notification deep-links keep working.
    if (tabRaw === 'memory' || tabRaw === 'notes') {
      navigate('/notes', { replace: true })
      return
    }
    if (tabRaw && ['session', 'compose', 'schedule'].includes(tabRaw)) {
      setWorkMode(tabRaw as typeof workMode)
    }

    const state = location.state as {
      sessionId?: string
      quickPrompt?: string
      quickPromptCli?: BackendId
      quickPromptModel?: string
      quickPromptAgent?: string
      quickPromptAttachedAgent?: { id: string; name: string }
      quickPromptNoAgent?: boolean
      preSelectedNoteIds?: string[]
    } | null
    if (state?.sessionId) setSelectedId(state.sessionId)
    if (state?.quickPrompt) {
      pendingQuickPrompt.current = {
        prompt: state.quickPrompt,
        cli: state.quickPromptCli,
        model: state.quickPromptModel,
        agent: state.quickPromptAgent,
        attachedAgent: state.quickPromptAttachedAgent,
        noAgent: state.quickPromptNoAgent,
      }
    }
    // Pre-select notes when arriving from the Notes page via "Use in next
    // session →". The selection lives until the user sends or clears.
    if (state?.preSelectedNoteIds && state.preSelectedNoteIds.length > 0) {
      setSelectedNoteIds(new Set(state.preSelectedNoteIds))
    }
  }, [location, searchParams, setSelectedId, navigate])

  // ── Rehydrate sessions from main process on mount ──────────────────────
  // This recovers sessions that are still alive after navigating away and back.

  useEffect(() => {
    void (async () => {
      // 1. Load active in-memory sessions (still running in this app instance)
      const activeSessions = await window.electronAPI.invoke('cli:list-sessions') as SessionInfo[]

      // 2. Load persisted sessions from disk (survive app restart)
      const persisted = await window.electronAPI.invoke('cli:get-persisted-sessions') as
        Array<{ sessionId: string; cli: BackendId; name?: string; firstPrompt?: string; startedAt: number; endedAt?: number; workingDirectory?: string; messageLog: Array<{ type: string; content: string; metadata?: unknown; sender?: string; timestamp?: number; attachedNotes?: Array<{ id: string; title: string }>; attachedAgent?: { id: string; name: string }; attachedSkills?: Array<{ id: string; name: string }>; attachedFiles?: Array<{ id: string; name: string; relPath: string }>; attachedDirs?: Array<{ path: string; name: string }> }> }>

      // Build a set of active session IDs so we don't duplicate
      const activeIds = new Set(activeSessions.map((s) => s.sessionId))

      // Fetch message logs for active sessions in parallel
      const logs = await Promise.all(
        activeSessions.map(async (info) => {
          const log = await window.electronAPI.invoke('cli:get-message-log', { sessionId: info.sessionId }) as
            Array<{ type: string; content: string; metadata?: unknown; sender?: string; timestamp?: number; attachedNotes?: Array<{ id: string; title: string }>; attachedAgent?: { id: string; name: string }; attachedSkills?: Array<{ id: string; name: string }>; attachedFiles?: Array<{ id: string; name: string; relPath: string }>; attachedDirs?: Array<{ path: string; name: string }> }>
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
                // Restore the in-chat chip metadata (agent / skills / notes)
                // so the user bubble looks the same after navigating away
                // and coming back. Frozen at attach time on disk.
                attachedAgent: entry.attachedAgent,
                attachedSkills: entry.attachedSkills,
                attachedNotes: entry.attachedNotes,
                attachedFiles: entry.attachedFiles,
                attachedDirs: entry.attachedDirs,
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
            attachedAgent: entry.attachedAgent,
            attachedSkills: entry.attachedSkills,
            attachedNotes: entry.attachedNotes,
            attachedFiles: entry.attachedFiles,
                attachedDirs: entry.attachedDirs,
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
            workingDirectory: ps.workingDirectory,
          })
        }

        return updated
      })

    })()
  }, [])

  // Note: the launchpad replaces the old wizard auto-open behavior — the empty
  // state of /work IS the launchpad, so no explicit "first run" branching is
  // needed here.

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
      // Token Coach Phase 5 — re-tally the session's cumulative tokens so
      // CompactNudge can fire when the running total crosses 70%. Reading
      // `cost:list` scoped to "after sessionStartedAt" keeps the query cheap.
      void (async () => {
        try {
          const records = await window.electronAPI.invoke('cost:list', { since: 0 }) as Array<{ sessionId: string; totalTokens: number; inputTokens: number }>
          if (!Array.isArray(records)) return
          const total = records
            .filter((r) => r.sessionId === sessionId)
            .reduce((sum, r) => sum + (r.totalTokens ?? 0), 0)
          setSessionTokens((prev) => {
            const u = new Map(prev)
            u.set(sessionId, total)
            return u
          })
        } catch {
          /* ignore — nudge stays silent if cost store is unreachable */
        }
      })()
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

    const handlePromptShaped = (payload: {
      sessionId: string
      tokens?: import('../../../shared/tokenization/types').SliceTokenBreakdown
    }) => {
      if (!payload.tokens) return
      setSessions((prev) => {
        const s = prev.get(payload.sessionId)
        if (!s) return prev
        const updated = new Map(prev)
        updated.set(payload.sessionId, { ...s, lastShapedBreakdown: payload.tokens })
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
      window.electronAPI.on('cli:prompt-shaped', handlePromptShaped as (...args: unknown[]) => void),
    ]
    return () => cleanup.forEach((fn) => fn())
  }, [])

  // ── Session management ──────────────────────────────────────────────────

  const startSession = useCallback(async (opts: {
    cli: BackendId
    name?: string
    workingDirectory?: string
    initialPrompt?: string
    displayPrompt?: string
    agent?: string
    model?: string
    permissionMode?: string
    additionalDirs?: string[]
    contextSummary?: { memories: string[]; agent?: string; skill?: string }
    attachedAgent?: { id: string; name: string }
    attachedSkills?: Array<{ id: string; name: string }>
    attachedNotes?: Array<{ id: string; title: string }>
    /** Files staged for this session (frozen name + workspace-relative path). */
    attachedFiles?: Array<{ id: string; name: string; relPath: string }>
    /** Caller-provided session id — lets files be staged before the session starts. */
    sessionId?: string
    /** Per-session CLI toggle overrides, keyed by SessionOptions boolean field. */
    sessionFlags?: Record<string, boolean>
    /** Token Coach Phase 1: per-slice breakdown for accurate cost attribution. */
    promptSlices?: import('../types/ipc').SessionOptions['promptSlices']
    /** Explicit "user picked (none)" — disables server-side default-agent fallback. */
    noAgent?: boolean
  }) => {
    // Clear any prior "connect a CLI" banner — we're attempting a fresh start.
    setStartError(null)
    const startResult = (await window.electronAPI.invoke('cli:start-session', {
      cli: opts.cli, mode: 'interactive', name: opts.name, workingDirectory: opts.workingDirectory, prompt: opts.initialPrompt, displayPrompt: opts.displayPrompt, agent: opts.agent, model: opts.model, permissionMode: opts.permissionMode, additionalDirs: opts.additionalDirs, attachedNotes: opts.attachedNotes, attachedFiles: opts.attachedFiles, sessionId: opts.sessionId, promptSlices: opts.promptSlices, noAgent: opts.noAgent,
      // Per-session CLI toggle overrides (experimental/verbose/etc.) as explicit
      // typed fields so they beat the stored global defaults in the main-process merge.
      ...(opts.sessionFlags ?? {}),
    })) as
      | { sessionId: string; agentApplied?: { id: string; name: string } }
      | { error: string; code: 'CLI_NOT_READY' }
    // Main process guard: the CLI isn't installed/authenticated. No session was
    // created server-side, so surface the message without minting a ghost row.
    if ('error' in startResult) {
      setStartError(startResult.error)
      return
    }
    const { sessionId, agentApplied } = startResult
    const info: SessionInfo = { sessionId, name: opts.name, cli: opts.cli, status: 'running', startedAt: Date.now() }

    // Resolve effective agent for the chip: explicit attach wins; fall back to
    // server-side auto-applied agent (user's saved active agent for this CLI).
    const effectiveAgent = opts.attachedAgent ?? agentApplied
    const effectiveContext = opts.contextSummary ?? (agentApplied ? { memories: [], agent: agentApplied.name } : undefined)

    // Show the clean user message in chat, not the raw injected context
    const initial: OutputMessage[] = []
    if (opts.initialPrompt) {
      const userMsg = opts.displayPrompt ?? opts.initialPrompt
      initial.push({
        id: '0',
        output: { type: 'text', content: userMsg },
        sender: 'user',
        timestamp: Date.now(),
        attachedAgent: effectiveAgent,
        attachedSkills: opts.attachedSkills,
        attachedNotes: opts.attachedNotes,
        attachedFiles: opts.attachedFiles,
        attachedDirs: opts.additionalDirs && opts.additionalDirs.length > 0
          ? opts.additionalDirs.map((p) => ({ path: p, name: p.split('/').filter(Boolean).pop() || p }))
          : undefined,
      })
    }

    setSessions((prev) => { const u = new Map(prev); u.set(sessionId, { info, messages: initial, mode: 'normal', msgIdCounter: initial.length, processing: !!opts.initialPrompt, usageHistory: [], currentModel: opts.model, workingDirectory: opts.workingDirectory }); return u })
    setSelectedId(sessionId)

    // Pre-populate the context bar with what was selected (or auto-applied)
    if (effectiveContext) {
      setQuickConfig({
        agent: effectiveContext.agent || undefined,
        skill: effectiveContext.skill || undefined,
      })
    }
  }, [])

  // ── Zero-click new session ─────────────────────────────────────────────
  // Resolves CLI / model / working-dir from settings + active workspace and
  // hands off to `startSession` without opening a modal. Any failure
  // surfaces via the existing `cli:error` pipeline (chat bubble), so no
  // special unauth handling here — matches the Sessions page behaviour.
  // Resolve the directory a new session should run in. Without this anchor the
  // CLI inherits the Electron process cwd (home/app dir) and the AI can't see
  // the user's repos. Chain: active workspace's first repo → the user's default
  // working folder (set in the first-run wizard / Local Setup) → undefined.
  const resolveWorkingDirectory = useCallback(async (): Promise<string | undefined> => {
    try {
      const activeId = await window.electronAPI.invoke('workspace:get-active') as string | null
      if (activeId) {
        const workspaces = await window.electronAPI.invoke('workspace:list') as Array<{
          id: string; repoPaths: string[]
        }>
        const active = workspaces.find((w) => w.id === activeId)
        if (active && active.repoPaths.length > 0) return active.repoPaths[0]
      }
    } catch {
      // Workspace lookup is best-effort.
    }
    try {
      const defaultCwd = await window.electronAPI.invoke('locations:get-default-cwd') as string | null
      if (typeof defaultCwd === 'string' && defaultCwd) return defaultCwd
    } catch {
      // Locations lookup is best-effort; fall through to backend default.
    }
    return undefined
  }, [])

  // Reclaim file-attachment upload dirs whose session no longer exists. Runs
  // once on mount (best-effort) so crashes / manual session-store edits that
  // skipped the delete-time cleanup don't leak `.clear-path/uploads/<id>/`
  // folders. Cheap no-op when the feature was never used.
  useEffect(() => {
    void (async () => {
      try {
        const workingDirectory = await resolveWorkingDirectory()
        if (workingDirectory) {
          await window.electronAPI.invoke('files:sweep-orphans', { workingDirectory })
        }
      } catch {
        // Best-effort housekeeping — never block session load on it.
      }
    })()
  }, [resolveWorkingDirectory])

  const handleQuickStart = useCallback(async () => {
    const settings = await window.electronAPI.invoke('settings:get') as {
      preferredBackend?: BackendId
      model?: { copilot?: string; claude?: string }
    } | null

    // 1. Resolve CLI from readiness: preferred (if connected) → last-used (if
    //    connected) → any connected backend. Never default to an uninstalled
    //    CLI when we know what's connected.
    const lastUsedSession = sessionsRef.current.size > 0
      ? Array.from(sessionsRef.current.values()).sort((a, b) => b.info.startedAt - a.info.startedAt)[0]
      : undefined
    const preferred = settings?.preferredBackend
    const lastUsed = lastUsedSession?.info.cli
    const resolved = pickReadyBackend(readyBackendsRef.current, { preferred, lastUsed })
    let cli: BackendId
    if (resolved) {
      cli = resolved
    } else if (authLoadedRef.current) {
      // Auth probe finished and nothing is connected — block and route to auth.
      setStartError('Connect GitHub Copilot or Claude Code to start a session — open Configure → Authentication.')
      return
    } else {
      // Probe still running — stay optimistic with the saved/last-used default.
      cli = preferred ?? lastUsed ?? 'copilot-cli'
    }

    // 2. Resolve model: settings.model[provider] for that CLI
    const provider = providerOf(cli)
    const model = settings?.model?.[provider] || undefined

    // 3. Resolve working directory (workspace repo → default working folder)
    const workingDirectory = await resolveWorkingDirectory()

    await startSession({ cli, model, workingDirectory })
  }, [startSession, resolveWorkingDirectory])

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
  // The deep-link effect reads location.state.quickPrompt into
  // pendingQuickPrompt.current. Guard the actual start on the prompt text so
  // neither StrictMode's double-invoked effects nor the post-start URL change
  // (which re-runs the deep-link effect and re-seeds the ref) can spawn a
  // second session for the same hand-off.
  useEffect(() => {
    if (pendingQuickPrompt.current && startedQuickPrompt.current !== pendingQuickPrompt.current.prompt) {
      startedQuickPrompt.current = pendingQuickPrompt.current.prompt
      const q = pendingQuickPrompt.current
      pendingQuickPrompt.current = null
      // Prefer the CLI Home handed us; if it's missing, fall back to a ready
      // backend rather than a hardcoded (possibly uninstalled) Copilot.
      const cli = q.cli ?? pickReadyBackend(readyBackendsRef.current) ?? 'copilot-cli'
      void startSession({
        cli,
        model: q.model,
        agent: q.agent,
        attachedAgent: q.attachedAgent,
        noAgent: q.noAgent,
        name: q.prompt.slice(0, 30),
        initialPrompt: q.prompt,
      })
      setWorkMode('session')
    }
  }, [startSession, location.pathname, location.search])

  const stopSession = useCallback(async (sessionId: string) => {
    await window.electronAPI.invoke('cli:stop-session', { sessionId })
    setSessions((prev) => { const s = prev.get(sessionId); if (!s) return prev; const u = new Map(prev); u.set(sessionId, { ...s, info: { ...s.info, status: 'stopped' } }); return u })
  }, [])

  /**
   * Token Coach Phase 5 — "Fresh start" — spawn a new session with the same
   * agent + model selection but no conversation history. The old session
   * stays in the session list (not auto-deleted) so the user can archive or
   * revisit it. WorkingDirectory isn't tracked on the renderer-side
   * SessionInfo; the main process applies its default when omitted.
   */
  const handleFreshStart = useCallback(async () => {
    if (!selectedId) return
    const current = sessions.get(selectedId)
    if (!current) return
    await startSession({
      cli: current.info.cli,
      model: current.currentModel,
      name: current.info.name ? `${current.info.name} (fresh)` : undefined,
    })
  }, [selectedId, sessions, startSession])

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
    // If memories are selected, prepend them as context silently.
    // We resolve note titles BEFORE any setSessions / IPC so that the
    // optimistic user bubble, the persisted CLI message log, and the in-chat
    // "shared N notes" chip all see the same frozen titles. Titles snapshot
    // here cannot drift afterwards (note rename / delete / flag flip).
    void (async () => {
      let actualInput = input
      // Token Coach Phase 1: capture per-slice text as we assemble the prompt
      // so the cost record on turn-end can attribute tokens correctly.
      const slices: import('../types/ipc').SessionOptions['promptSlices'] = { userText: input }

      if (quickConfig.fleet) {
        const fleetPrefix = `[Fleet mode: You may use &prompt to dispatch sub-agents for parallel work. Break this task into independent parts and delegate them to work simultaneously when appropriate.]`
        actualInput = `${fleetPrefix}\n\n${actualInput}`
        slices.fleetPrefix = fleetPrefix
      }

      const capturedNotes: Array<{ id: string; title: string }> = []
      if (selectedNoteIds.size > 0) {
        // Snapshot titles BEFORE the bundle call so the in-chat chip / saved
        // metadata never drifts (note rename / delete after send).
        const ids = Array.from(selectedNoteIds)
        for (const noteId of ids) {
          const noteMeta = await window.electronAPI.invoke('notes:get', { id: noteId }) as { title?: string } | null
          capturedNotes.push({ id: noteId, title: noteMeta?.title ?? 'Untitled' })
        }
        // The bundle handler returns a framed XML-ish block the model can
        // parse cleanly. We prepend it as a preamble; the user's request
        // remains the trailing instruction.
        const bundle = await window.electronAPI.invoke('notes:get-bundle-for-prompt', { ids }) as
          { framedPrompt: string; noteCount: number; attachmentCount: number }
        if (bundle.framedPrompt) {
          actualInput = `${bundle.framedPrompt}\n\nUser request:\n${actualInput}`
          slices.notesFramed = bundle.framedPrompt
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
            const contextBlob = `[Reference context from connected sources]\n\n${contextBlocks.join('\n\n')}\n\n---`
            actualInput = `${contextBlob}\n\n${actualInput}`
            slices.contextSources = contextBlob
          }
        } catch {
          // Context fetch failed — send without it
        }
      }

      // Mid-session file attachments — frame by PATH (never inline content),
      // same reference bundle the launchpad uses. Files were already staged
      // into the session's uploads dir by handleAttachFiles.
      const capturedFiles = pendingFilesBySession[selectedId] ?? []
      if (capturedFiles.length > 0) {
        try {
          // Use the SAME dir handleAttachFiles staged into (pinned on the session),
          // not a fresh resolve — otherwise the bundle could frame a different
          // uploads root than where the files actually live.
          const workingDirectory = sessionsRef.current.get(selectedId)?.workingDirectory ?? await resolveWorkingDirectory()
          const bundle = await window.electronAPI.invoke('files:get-bundle-for-prompt', {
            workingDirectory, sessionId: selectedId, ids: capturedFiles.map((f) => f.id),
          }) as { framedPrompt: string; fileCount: number }
          if (bundle.framedPrompt) {
            actualInput = `${bundle.framedPrompt}\n\n${actualInput}`
            slices.filesFramed = bundle.framedPrompt
          }
        } catch {
          // Bundle fetch failed — send without the framing
        }
      }

      // Show only the user's original message in the chat (not the prepended
      // context). The "Sent with..." annotation surfaces what context was
      // attached. attachedNotes is what powers the in-chat chip.
      setSessions((prev) => {
        const s = prev.get(selectedId); if (!s) return prev
        const u = new Map(prev)
        const noteCount = capturedNotes.length
        const ctxCount = selectedContextSources.length
        const fileCount = capturedFiles.length
        const parts: string[] = []
        if (quickConfig.agent) parts.push(`Agent: ${quickConfig.agent}`)
        if (quickConfig.skill) parts.push(`Skill: ${quickConfig.skill}`)
        if (noteCount > 0) parts.push(`${noteCount} note${noteCount === 1 ? '' : 's'}`)
        if (fileCount > 0) parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`)
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
              attachedNotes: capturedNotes.length > 0 ? capturedNotes : undefined,
              attachedFiles: capturedFiles.length > 0 ? capturedFiles : undefined,
            },
          ],
          msgIdCounter: s.msgIdCounter + 1,
          processing: true,
        })
        return u
      })

      window.electronAPI.invoke('cli:send-input', {
        sessionId: selectedId,
        input: actualInput,
        attachedNotes: capturedNotes.length > 0 ? capturedNotes : undefined,
        attachedFiles: capturedFiles.length > 0 ? capturedFiles : undefined,
        promptSlices: slices,
        // Token Coach Phase 4 — per-turn override. Cleared immediately after
        // dispatch so the next turn re-routes fresh.
        userOverrideModel: routingOverride ?? undefined,
      })
      // Clear this session's pending files now that they've been framed + sent.
      if (capturedFiles.length > 0) {
        setPendingFilesBySession((prev) => ({ ...prev, [selectedId]: [] }))
      }
      if (routingOverride) setRoutingOverride(null)
    })()
  }, [selectedId, sessions, selectedNoteIds, selectedContextSources, quickConfig, routingOverride, pendingFilesBySession, resolveWorkingDirectory])

  /** Append a single status bubble to the active session's message log. */
  const appendStatus = useCallback((sessionId: string, content: string) => {
    setSessions((prev) => {
      const s = prev.get(sessionId); if (!s) return prev
      const u = new Map(prev)
      u.set(sessionId, {
        ...s,
        messages: [
          ...s.messages,
          {
            id: String(s.msgIdCounter),
            output: { type: 'status', content },
            sender: 'system',
            timestamp: Date.now(),
          },
        ],
        msgIdCounter: s.msgIdCounter + 1,
      })
      return u
    })
  }, [])

  const handleModelChange = useCallback((model: string) => {
    if (!selectedId || !model) return
    // ClearPath spawns a fresh headless CLI per turn — the REPL `/model`
    // command is unreachable. Instead, persist the new model on the session
    // server-side; the very next user message will spawn with --model <new>.
    void window.electronAPI.invoke('session:update-model', {
      sessionId: selectedId,
      model,
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
            output: { type: 'status', content: `Model switched to ${model} — applies to your next message.` },
            sender: 'system',
            timestamp: Date.now(),
          },
        ],
        msgIdCounter: s.msgIdCounter + 1,
      })
      return u
    })
  }, [selectedId])

  const handleSlashCommand = useCallback((command: string) => {
    if (!selectedId) return
    // /delegate is special — it routes through the same path as a sub-agent
    // spawn (& prefix), not a slash command.
    if (command.match(/^\/delegate\s+/i)) {
      handleSend(command)
      return
    }
    const sid = selectedId
    dispatchOrForward(command, {
      onModelChange: (model) => handleModelChange(model),
      onClear: () => {
        const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm('Clear this conversation? This starts a fresh CLI session — prior context will not be carried over.')
          : true
        if (!ok) return
        void window.electronAPI.invoke('session:reset', { sessionId: sid })
        setSessions((prev) => {
          const s = prev.get(sid); if (!s) return prev
          const u = new Map(prev)
          u.set(sid, {
            ...s,
            messages: [{
              id: '0',
              output: { type: 'status', content: 'Conversation cleared.' },
              sender: 'system',
              timestamp: Date.now(),
            }],
            msgIdCounter: 1,
          })
          return u
        })
      },
      onPermissions: () => navigate('/configure'),
      onCost: () => navigate('/insights'),
      onExit: () => { void stopSession(sid) },
      onHelp: () => navigate('/learn'),
      onConfig: () => navigate('/configure'),
      onStatus: (text) => appendStatus(sid, text),
      sendToCli: (cmd) =>
        void window.electronAPI.invoke('cli:send-slash-command', { sessionId: sid, command: cmd }),
    })
  }, [selectedId, handleSend, handleModelChange, navigate, stopSession, appendStatus])

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

  const handleTemplateSend = useCallback((result: HydratedTemplate) => {
    const { patch } = result
    // Apply the subset of the patch a live process can honor. Agent /
    // permission mode are launch-only and are dropped by TemplateForm in
    // `session` context, so they never reach here.
    if (patch.model) handleModelChange(patch.model)
    if (patch.attachedNotes?.length) {
      setSelectedNoteIds((prev) => {
        const next = new Set(prev)
        for (const id of patch.attachedNotes ?? []) next.add(id)
        return next
      })
    }
    if (patch.attachedSkills?.length) {
      // Mid-session skill is single-select; take the first.
      setQuickConfig((c) => ({ ...c, skill: patch.attachedSkills![0].name }))
    }
    // patch.pickedFiles mid-session staging is handled by the compose "+" file
    // attach flow (Phase 6); template-picked files surface there.
    handleSend(result.prompt)
    setActiveTemplate(null)
  }, [handleSend, handleModelChange])

  // Stage files into the active session's uploads dir for the next turn.
  const handleAttachFiles = useCallback(async () => {
    if (!selectedId) return
    // Prefer the dir this session ACTUALLY spawned in over a fresh resolve, so
    // mid-session files land in the same `.clear-path/uploads/<id>/` root the CLI
    // is running in (re-resolving could pick a different workspace). The handler
    // falls back to an app-managed scratch dir when neither is set, so this no
    // longer hard-fails without a workspace — it reports `usedFallback` instead.
    const knownDir = sessionsRef.current.get(selectedId)?.workingDirectory
    const workingDirectory = knownDir ?? await resolveWorkingDirectory()
    const res = await window.electronAPI.invoke('files:pick-and-stage', {
      workingDirectory,
      sessionId: selectedId,
    }) as { canceled?: boolean; attachments: Array<{ id: string; name: string; relPath: string }>; errors: string[]; baseDir?: string; usedFallback?: boolean }
    if (res.canceled) return
    // Pin the session to the dir staging actually used so the matching
    // `files:get-bundle-for-prompt` call (in handleSend) frames the same root.
    if (res.baseDir) {
      setSessions((prev) => {
        const s = prev.get(selectedId); if (!s || s.workingDirectory === res.baseDir) return prev
        const u = new Map(prev); u.set(selectedId, { ...s, workingDirectory: res.baseDir }); return u
      })
    }
    if (res.attachments.length > 0) {
      setPendingFilesBySession((prev) => ({
        ...prev,
        [selectedId]: [
          ...(prev[selectedId] ?? []),
          ...res.attachments
            .filter((a) => !(prev[selectedId] ?? []).some((x) => x.id === a.id))
            .map((a) => ({ id: a.id, name: a.name, relPath: a.relPath })),
        ],
      }))
      // Files attached, but into the scratch dir — nudge toward a real workspace.
      setShowWorkspaceNudge(Boolean(res.usedFallback))
    }
    if (res.errors?.length) appendStatus(selectedId, `Couldn't attach: ${res.errors.join('; ')}`)
  }, [selectedId, resolveWorkingDirectory, appendStatus])

  // The workspace nudge is tied to the last attach in the *current* session;
  // clear it when the user switches sessions so it never lingers out of context.
  useEffect(() => { setShowWorkspaceNudge(false) }, [selectedId])

  const handleRemovePendingFile = useCallback((id: string) => {
    if (!selectedId) return
    setPendingFilesBySession((prev) => ({
      ...prev,
      [selectedId]: (prev[selectedId] ?? []).filter((f) => f.id !== id),
    }))
  }, [selectedId])

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
  // Derive a sensible CLI default for the launchpad. Prefer the most recent
  // session's CLI, but only if it's actually connected — otherwise fall to a
  // ready backend so the picker never defaults to an uninstalled CLI. When
  // nothing is ready (or readiness hasn't loaded yet) we keep copilot-cli;
  // QuickStartCard shows its connect-CTA in the both-red case.
  const sessionLastUsedCli = selectedSession?.info.cli ?? recentSessions[0]?.info.cli
  const lastUsedCli: BackendId =
    pickReadyBackend(readyBackends, { lastUsed: sessionLastUsedCli }) ?? sessionLastUsedCli ?? 'copilot-cli'

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
                  <button
                    onClick={() => setActivitySessionId(selectedSession.info.sessionId)}
                    title="Files this session read/created, sites it fetched, commands it ran"
                    className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-md"
                  >
                    Files &amp; activity
                  </button>
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
                  {/* Token Coach Phase 5 — "Fresh start" button. Same workspace,
                      same agent, no carried history. Gated on showEfficiencyInsights. */}
                  {flags.showEfficiencyInsights && selectedSession.info.status === 'running' && (
                    <button
                      onClick={() => void handleFreshStart()}
                      title="Start a new conversation with the same setup. The old one stays accessible in the session list."
                      className="px-2 py-1 text-xs bg-teal-900/40 hover:bg-teal-800/60 text-teal-300 border border-teal-700/50 rounded-md"
                    >
                      Fresh start
                    </button>
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
              {/* Token Coach Phase 5 — 70% context-window nudge. Renders only
                  when the running token total crosses the threshold AND
                  showEfficiencyInsights is on. */}
              {flags.showEfficiencyInsights && selectedSession.info.status === 'running' && (
                <CompactNudge
                  sessionId={selectedSession.info.sessionId}
                  model={selectedSession.currentModel ?? (providerOf(selectedSession.info.cli) === 'copilot' ? 'gpt-5-mini' : 'sonnet')}
                  totalTokens={sessionTokens.get(selectedSession.info.sessionId) ?? 0}
                  onCompact={() => handleSlashCommand('/compact')}
                />
              )}
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
                          cli={selectedSession.info.cli}
                          context="session"
                          onSubmit={handleTemplateSend}
                          onCancel={() => setActiveTemplate(null)}
                        />
                      </div>
                    </div>
                  )}
                  <ExtensionSlot slotName="work:above-input" className="flex-shrink-0" />
                  {/* Token Coach Phase 5 — pre-flight cost/size warnings.
                      Subscribes to cli:prompt-shaped events for THIS session
                      and renders banners (max 2) above the chat input. The
                      middleware always emits notes; this surface is what
                      shows them to the user. Flag-gated. */}
                  {flags.showEfficiencyInsights && (
                    <PreflightWarningStack
                      sessionId={selectedSession.info.sessionId}
                      editTick={editTick}
                      onTrim={() => {
                        // Best-effort deep-link to the Notes management page —
                        // the deeper UX (open the picker on the relevant tab)
                        // can layer in once we know which slice triggered.
                        navigate('/notes')
                      }}
                      onCompact={() => handleSlashCommand('/compact')}
                    />
                  )}
                  {showWorkspaceNudge && (
                    <div
                      data-testid="work-workspace-nudge"
                      role="status"
                      className="mb-2 flex items-start gap-2 rounded-lg border border-sky-700/40 bg-sky-900/15 px-3 py-2"
                    >
                      <span className="text-sky-300 text-sm leading-5">ℹ</span>
                      <div className="flex-1">
                        <p className="text-sky-100 text-xs">
                          Files were attached to a temporary folder. Select a workspace so files land in your project.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setShowWorkspaceNudge(false); navigate('/workspaces') }}
                          className="mt-1 text-xs font-semibold text-violet-300 hover:text-violet-200"
                        >
                          Select a workspace →
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={() => setShowWorkspaceNudge(false)}
                        className="text-sky-400 hover:text-sky-200"
                      >×</button>
                    </div>
                  )}
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
                    attachedFiles={pendingFilesBySession[selectedSession.info.sessionId] ?? []}
                    onAttachFiles={() => { void handleAttachFiles() }}
                    onRemoveAttachedFile={handleRemovePendingFile}
                    currentModel={selectedSession.currentModel}
                    onModelChange={handleModelChange}
                    priorSessionTokens={sessionTokens.get(selectedSession.info.sessionId) ?? 0}
                    lastShapedBreakdown={selectedSession.lastShapedBreakdown}
                    routingOverride={routingOverride}
                    onRoutingOverride={setRoutingOverride}
                    isContinuation={selectedSession.messages.some((m) => m.sender === 'ai')}
                    onTextChange={() => setEditTick((t) => t + 1)}
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
            /* Launchpad: the default empty-state of /work — quick start, workflows, active + recent sessions. */
            <>
            {startError && (
              <div
                data-testid="work-start-error"
                role="alert"
                className="mb-4 flex items-start gap-3 rounded-xl border border-amber-700/40 bg-amber-900/15 px-4 py-3"
              >
                <span className="text-amber-300 text-sm">⚠</span>
                <div className="flex-1">
                  <p className="text-amber-100 text-sm">{startError}</p>
                  <button
                    type="button"
                    onClick={() => navigate('/configure?tab=setup')}
                    className="mt-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
                  >
                    Open Configure → Authentication →
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setStartError(null)}
                  className="text-amber-400 hover:text-amber-200"
                >×</button>
              </div>
            )}
            <WorkLaunchpad
              defaultCli={lastUsedCli}
              onQuickStart={({ prompt, displayPrompt, cli, model, agent, permissionMode, additionalDirs, attachedAgent, attachedSkills, attachedNotes, pickedFiles, sessionFlags, noAgent }) => {
                const shown = displayPrompt ?? prompt
                void (async () => {
                  // Anchor the session to the user's code so the AI can read it.
                  let workingDirectory = await resolveWorkingDirectory()

                  // Stage any picked files INTO the session's working dir, keyed by
                  // a pre-generated session id so their paths line up with the
                  // session we're about to start. Then frame them by path (the AI
                  // reads the real files with its own tools — content never inlined).
                  let initialPrompt = prompt
                  let attachedFiles: Array<{ id: string; name: string; relPath: string }> | undefined
                  let filesSessionId: string | undefined
                  let filesSlice: string | undefined
                  if (pickedFiles && pickedFiles.length > 0) {
                    // Guarantee a concrete, writable cwd even when no workspace is
                    // configured — otherwise the upload was silently dropped AND
                    // the CLI spawned in a read-only dir. The SAME dir is used for
                    // staging and the spawn below so relative paths always resolve.
                    const base = await window.electronAPI.invoke('files:ensure-base-dir', { preferred: workingDirectory }) as { dir: string }
                    workingDirectory = base.dir
                    filesSessionId = crypto.randomUUID()
                    const staged = await window.electronAPI.invoke('files:stage-paths', {
                      workingDirectory, sessionId: filesSessionId,
                      sourcePaths: pickedFiles.map((f) => f.sourcePath),
                    }) as { attachments: Array<{ id: string; name: string; relPath: string }>; errors: string[] }
                    if (staged.attachments.length > 0) {
                      attachedFiles = staged.attachments.map((a) => ({ id: a.id, name: a.name, relPath: a.relPath }))
                      const bundle = await window.electronAPI.invoke('files:get-bundle-for-prompt', {
                        workingDirectory, sessionId: filesSessionId, ids: staged.attachments.map((a) => a.id),
                      }) as { framedPrompt: string; fileCount: number }
                      if (bundle.framedPrompt) {
                        initialPrompt = `${bundle.framedPrompt}\n\nUser request:\n${prompt}`
                        filesSlice = bundle.framedPrompt
                      }
                    } else if (staged.errors.length > 0) {
                      // Never fail silently — tell the user why the file didn't attach.
                      setStartError(`Couldn't attach your file${pickedFiles.length === 1 ? '' : 's'}: ${staged.errors.join('; ')}`)
                    }
                  }

                  await startSession({
                    cli, model, agent, permissionMode, additionalDirs,
                    workingDirectory,
                    initialPrompt,
                    displayPrompt: shown,
                    name: shown.slice(0, 30),
                    attachedAgent,
                    attachedSkills,
                    attachedNotes,
                    attachedFiles,
                    sessionId: filesSessionId,
                    promptSlices: filesSlice ? { userText: prompt, filesFramed: filesSlice } : undefined,
                    sessionFlags,
                    noAgent,
                  })
                })()
              }}
              onOpenWorkflow={(id) => {
                setSearchParams((prev) => {
                  const entries: Record<string, string> = {}
                  prev.forEach((value, key) => { entries[key] = value })
                  entries.tab = 'compose'
                  entries.workflow = id
                  delete entries.id
                  return entries
                })
                setWorkMode('compose')
              }}
              onOpenActiveSession={(info) => {
                setSelectedId(info.sessionId)
                setViewingStoppedSession(false)
              }}
              onResumeSession={(sessionId, cli, name) => {
                if (sessions.has(sessionId)) {
                  setSelectedId(sessionId)
                  setViewingStoppedSession(true)
                } else {
                  void startSession({ cli, name: name ? `${name} (cont)` : undefined })
                }
              }}
              onSeeMoreSessions={() => setShowSessionManager(true)}
            />
            </>
          )
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
              workflowId={searchParams.get('workflow') ?? undefined}
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

      {/* Save as note modal — opened from "Save as Note" on AI
          response actions. The full Notes management UI lives at /notes. */}
      {showSaveNoteModal !== null && (
        <SaveNoteModal
          content={showSaveNoteModal}
          sessionName={selectedSession?.info.name}
          sessionId={selectedSession?.info.sessionId}
          onClose={() => setShowSaveNoteModal(null)}
        />
      )}

      {activitySessionId && (
        <SessionActivityPanel
          sessionId={activitySessionId}
          open={true}
          onClose={() => setActivitySessionId(null)}
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
          <h3 className="text-base font-semibold text-white">Save as Note</h3>
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
