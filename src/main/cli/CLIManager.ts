import { randomUUID, createHash } from 'crypto'
import { log } from '../utils/logger'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import type { WebContents } from 'electron'
import type { SessionOptions, SessionInfo } from './types'
import type { ActiveSession, SubAgentProcess, SubAgentInfo, SubAgentStatus, ICLIAdapter, SessionHandle } from './types'
import { CopilotAdapter } from './CopilotAdapter'
import { ClaudeCodeAdapter } from './ClaudeCodeAdapter'
import { PluginManager } from '../plugins/PluginManager'
import { estimateCost, DEFAULT_PRICING_TABLE } from '../../shared/pricing'
import type { PricingService } from '../pricing/PricingService'
import type { BackendId } from '../../shared/backends'
import { isBackendId, migrateLegacyBackendId, providerOf } from '../../shared/backends'
import type { PromptSlices } from '../../shared/tokenization/types'
import { tokenCounter } from '../tokenization/TokenCounter'
import { buildPipeline, runPipeline, type MiddlewareContext, type Middleware } from './middleware'
import {
  DEFAULT_CACHE_POLICY,
  isAnthropicModel,
  minPrefixTokensFor,
  type CachePolicy,
} from '../tokenization/cachePolicy'
import { DEFAULT_ROUTING_RULES, type RoutingRules } from '../routing/RoutingRules'
import type { Difficulty } from '../routing/DifficultyClassifier'
import Store from 'electron-store'

export type NotifyCallback = (args: {
  type: string; severity: string; title: string; message: string; source: string; sessionId?: string
  action?: { label: string; ipcChannel?: string; navigate?: string; tab?: string; panel?: string; args?: Record<string, unknown> }
}) => void

export type AuditCallback = (entry: {
  actionType: 'session' | 'prompt' | 'tool-approval' | 'file-change' | 'config-change' | 'policy-violation' | 'security-warning'
  summary: string
  details: string
  sessionId?: string
}) => void

export type CostRecordCallback = (args: {
  sessionId: string; sessionName: string; cli: BackendId
  model: string; agent?: string; inputTokens: number; outputTokens: number
  totalTokens: number; estimatedCostUsd: number; promptCount: number; timestamp: number
  // Token Coach Phase 1: per-slice breakdown. All optional — undefined when
  // the renderer didn't ship slices for this turn.
  userPromptTokens?: number
  injectedContextTokens?: number
  agentPromptTokens?: number
  notesTokens?: number
  contextSourcesTokens?: number
  cachedInputTokens?: number
  cacheCreationTokens?: number
  // Token Coach Phase 4 — routing decision for this turn.
  // `routedModel` is the model the routing middleware picked (may equal
  // the original session model when routing was disabled or already on-tier).
  // `userOverride` is true when the user clicked the override chip; this
  // lets Phase 5's Insights page count overrides and suggest threshold tweaks.
  // `routedDifficulty` carries the classifier verdict for distribution charts.
  routedModel?: string
  userOverride?: boolean
  routedDifficulty?: 'trivial' | 'normal' | 'hard'
}) => void

// Persistent stores for session data that survives app restart
interface MessageLogEntry {
  type: string
  content: string
  metadata?: unknown
  sender?: 'user' | 'ai' | 'system'
  timestamp?: number
  /**
   * Notes the user attached when sending this message. Title is captured at
   * attach time and frozen here — the renderer's "shared N notes" chip reads
   * straight from this metadata, never from the notes store. That's why
   * deleting a note (or flag-toggling Notes off) doesn't break old transcripts.
   */
  attachedNotes?: Array<{ id: string; title: string }>
  /** Agent persona attached at session start. Frozen at attach time, names only. */
  attachedAgent?: { id: string; name: string }
  /** Skills the user tagged this chat with. Frozen at attach time, names only. */
  attachedSkills?: Array<{ id: string; name: string }>
}

interface PersistedSession {
  sessionId: string
  cli: BackendId
  name?: string
  firstPrompt?: string
  startedAt: number
  endedAt?: number
  archived?: boolean
  messageLog: MessageLogEntry[]
}

interface SessionStoreSchema {
  sessions: PersistedSession[]
}

const sessionStore = new Store<SessionStoreSchema>({
  name: 'clear-path-sessions',
  defaults: { sessions: [] },
  encryptionKey: getStoreEncryptionKey(),
})

const MAX_PERSISTED_SESSIONS = 50
const MAX_PERSISTED_MESSAGES = 500
/** Auto-purge sessions older than 30 days to minimize data exposure at rest. */
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export class CLIManager {
  private readonly sessions = new Map<string, ActiveSession>()
  private readonly subAgents = new Map<string, SubAgentProcess>()
  /**
   * Adapter registry keyed by BackendId. SDK adapters slot in here alongside
   * CLI adapters — selection is a single Map.get() in `adapterFor`, no branching
   * on provider/transport at the call site.
   *
   * NOTE: the SDK entries are `null` until their adapters land (phases 2-3).
   * `adapterFor` falls back to the matching CLI adapter so the build is green
   * during plumbing and starting an SDK-labelled session won't blow up.
   */
  private readonly adapters: Map<BackendId, ICLIAdapter | null>
  private readonly copilot = new CopilotAdapter()
  private readonly claude = new ClaudeCodeAdapter()
  private readonly pluginManager = new PluginManager()

  private readonly getWebContents: () => WebContents | null
  private onNotify: NotifyCallback | null = null
  private onCostRecord: CostRecordCallback | null = null
  private onAudit: AuditCallback | null = null
  private onExtensionEvent: ((event: string, data: unknown) => Promise<void>) | null = null
  /**
   * Token Coach Phase 3 — cache policy used by direct-API adapters (today:
   * LocalModelAdapter when pointed at Anthropic). Defaults to the safe
   * disabled policy; the IPC layer pushes the user's stored policy in at
   * boot via `setCachePolicy`. CLI passthroughs ignore this — their caching
   * lives inside the CLI binary.
   */
  private cachePolicy: CachePolicy = { ...DEFAULT_CACHE_POLICY }
  /**
   * Token Coach Phase 4 — per-CLI routing rules. Same fan-out shape as
   * cachePolicy: settings layer pushes the stored rules in at boot via
   * `setRoutingRules`, and the routing middleware reads through this
   * field on every turn via the closure-captured getter we hand to
   * `buildPipeline`.
   */
  private routingRules: RoutingRules = {
    enabled: DEFAULT_ROUTING_RULES.enabled,
    copilot: { ...DEFAULT_ROUTING_RULES.copilot },
    claude: { ...DEFAULT_ROUTING_RULES.claude },
  }
  /**
   * The composed middleware pipeline. Built once in the constructor with a
   * closure-captured `getRules` so the routing middleware always reads the
   * live rules (no extra IPC roundtrip per turn).
   */
  private readonly pipeline: Middleware[]
  /**
   * Optional injection. When set, cost estimation pulls from the live merged
   * defaults+remote+overrides table so users who override pricing in Cost
   * Settings see their effective rates applied. When unset, the shared module's
   * hardcoded defaults are used — keeps existing tests and constructor call
   * sites that don't supply the service running.
   */
  private pricingService: PricingService | null = null

  constructor(getWebContents: () => WebContents | null) {
    this.getWebContents = getWebContents

    this.adapters = new Map<BackendId, ICLIAdapter | null>([
      ['copilot-cli', this.copilot],
      ['copilot-sdk', null],  // populated in phase 3
      ['claude-cli',  this.claude],
      ['claude-sdk',  null],  // populated in phase 2
    ])

    // Build the pipeline ONCE. The routing middleware reads through
    // `this.routingRules` on every turn via the getter closure, so updates
    // from `setRoutingRules` take effect on the next turn without rebuilding.
    // The Phase 5 warning middleware reads the live pricing table the same
    // way (via the PricingService when wired, or shared defaults otherwise).
    this.pipeline = buildPipeline({
      routing: { getRules: () => this.routingRules },
      warning: {
        getPricingTable: () =>
          this.pricingService?.getEffectiveTable() ?? DEFAULT_PRICING_TABLE,
      },
    })

    // One-time migration: rewrite legacy `cli: 'copilot' | 'claude'` to new BackendId
    // shape on any persisted sessions. Idempotent — runs every boot but is a no-op
    // once migration has been applied.
    this.migratePersistedSessions()

    // Auto-purge expired sessions on startup
    this.purgeExpiredSessions()
  }

  /**
   * Resolve a BackendId to the adapter that handles it. Falls back to the
   * matching CLI adapter while SDK adapters are still being built (phases 2-3),
   * so an out-of-the-box install with only the CLIs still works when a profile
   * happens to be set to an SDK backend.
   */
  private adapterFor(backend: BackendId): ICLIAdapter {
    const adapter = this.adapters.get(backend)
    if (adapter) return adapter
    // SDK adapter not yet registered — fall through to CLI for same provider.
    return providerOf(backend) === 'copilot' ? this.copilot : this.claude
  }

  /**
   * Register an adapter for a backend. Used by the SDK adapter modules to
   * install themselves once their runtime deps are available (phase 2 / 3).
   */
  registerAdapter(backend: BackendId, adapter: ICLIAdapter): void {
    this.adapters.set(backend, adapter)
  }

  /**
   * Rewrite persisted `cli: 'copilot' | 'claude'` entries to modern BackendId
   * values. Safe to call repeatedly.
   */
  private migratePersistedSessions(): void {
    const sessions = sessionStore.get('sessions')
    let rewritten = 0
    for (const s of sessions) {
      // `as string` because TypeScript now says `cli: BackendId` but older
      // persisted rows have legacy values still on disk.
      const raw = s.cli as string
      if (!isBackendId(raw)) {
        s.cli = migrateLegacyBackendId(raw)
        rewritten++
      }
    }
    if (rewritten > 0) {
      sessionStore.set('sessions', sessions)
      log.info(`[CLIManager] Migrated ${rewritten} persisted session(s) to new backend ids`)
    }
  }

  /** Remove persisted sessions older than the retention TTL. */
  private purgeExpiredSessions(): void {
    const cutoff = Date.now() - SESSION_RETENTION_MS
    const sessions = sessionStore.get('sessions')
    const before = sessions.length
    const kept = sessions.filter((s) => {
      const ts = s.endedAt ?? s.startedAt
      return ts >= cutoff
    })
    if (kept.length < before) {
      sessionStore.set('sessions', kept)
      log.info(`[CLIManager] Purged ${before - kept.length} expired sessions (older than 30 days)`)
    }
  }

  // ── Session persistence helpers ──────────────────────────────────────────

  /** Save a session's message log to persistent storage */
  private persistSession(sessionId: string, session: ActiveSession): void {
    const sessions = sessionStore.get('sessions')
    const entry: PersistedSession = {
      sessionId,
      cli: session.info.cli,
      name: session.info.name,
      firstPrompt: session.lastPrompt || undefined,
      startedAt: session.info.startedAt,
      endedAt: session.info.status === 'stopped' ? Date.now() : undefined,
      messageLog: session.messageLog.slice(-MAX_PERSISTED_MESSAGES),
    }
    const idx = sessions.findIndex((s) => s.sessionId === sessionId)
    if (idx >= 0) {
      sessions[idx] = entry
    } else {
      sessions.unshift(entry)
      if (sessions.length > MAX_PERSISTED_SESSIONS) sessions.splice(MAX_PERSISTED_SESSIONS)
    }
    sessionStore.set('sessions', sessions)
  }

  /** Get all persisted sessions (for history/restore) */
  getPersistedSessions(): PersistedSession[] {
    return sessionStore.get('sessions')
  }

  /** Get a single persisted session's message log */
  getPersistedMessageLog(sessionId: string): MessageLogEntry[] {
    const sessions = sessionStore.get('sessions')
    return sessions.find((s) => s.sessionId === sessionId)?.messageLog ?? []
  }

  /** Delete a persisted session permanently */
  deletePersistedSession(sessionId: string): void {
    const sessions = sessionStore.get('sessions').filter((s) => s.sessionId !== sessionId)
    sessionStore.set('sessions', sessions)
    // Also remove from in-memory map if present
    this.sessions.delete(sessionId)
  }

  /** Delete multiple sessions at once */
  deletePersistedSessions(sessionIds: string[]): void {
    const idSet = new Set(sessionIds)
    const sessions = sessionStore.get('sessions').filter((s) => !idSet.has(s.sessionId))
    sessionStore.set('sessions', sessions)
    for (const id of sessionIds) this.sessions.delete(id)
  }

  /** Toggle archive flag on a session */
  archivePersistedSession(sessionId: string, archived: boolean): void {
    const sessions = sessionStore.get('sessions')
    const idx = sessions.findIndex((s) => s.sessionId === sessionId)
    if (idx >= 0) {
      sessions[idx] = { ...sessions[idx], archived }
      sessionStore.set('sessions', sessions)
    }
  }

  /** Toggle archive flag on multiple sessions at once */
  archivePersistedSessions(sessionIds: string[], archived: boolean): void {
    if (sessionIds.length === 0) return
    const idSet = new Set(sessionIds)
    const sessions = sessionStore.get('sessions').map((s) =>
      idSet.has(s.sessionId) ? { ...s, archived } : s,
    )
    sessionStore.set('sessions', sessions)
  }

  /** Rename a persisted session */
  renamePersistedSession(sessionId: string, name: string): void {
    const sessions = sessionStore.get('sessions')
    const idx = sessions.findIndex((s) => s.sessionId === sessionId)
    if (idx >= 0) {
      sessions[idx] = { ...sessions[idx], name }
      sessionStore.set('sessions', sessions)
    }
    // Also update in-memory if active
    const active = this.sessions.get(sessionId)
    if (active) active.info.name = name
  }

  /** Search across all session content using regex or plain text */
  searchSessions(query: string, useRegex: boolean): Array<{ sessionId: string; name?: string; cli: string; startedAt: number; archived?: boolean; matches: Array<{ content: string; sender?: string; lineIndex: number }> }> {
    const sessions = sessionStore.get('sessions')
    log.debug(`[CLIManager] searchSessions regex=${useRegex} sessionsCount=${sessions.length}`)
    let matcher: (text: string) => boolean
    try {
      matcher = useRegex
        ? ((re) => (text: string) => re.test(text))(new RegExp(query, 'gi'))
        : (text: string) => text.toLowerCase().includes(query.toLowerCase())
    } catch {
      // Invalid regex — fall back to literal match
      matcher = (text: string) => text.toLowerCase().includes(query.toLowerCase())
    }

    const results: Array<{ sessionId: string; name?: string; cli: string; startedAt: number; archived?: boolean; matches: Array<{ content: string; sender?: string; lineIndex: number }> }> = []

    for (const session of sessions) {
      const matches: Array<{ content: string; sender?: string; lineIndex: number }> = []

      // Search session name and first prompt as well
      if (session.name && matcher(session.name)) {
        matches.push({ content: `Session: ${session.name}`, sender: 'system', lineIndex: -1 })
      }
      if (session.firstPrompt && matcher(session.firstPrompt)) {
        matches.push({ content: session.firstPrompt.slice(0, 200), sender: 'user', lineIndex: -1 })
      }

      // Search message content
      const log = session.messageLog ?? []
      for (let i = 0; i < log.length; i++) {
        const entry = log[i]
        if (entry.content && matcher(entry.content)) {
          matches.push({ content: entry.content.slice(0, 200), sender: entry.sender, lineIndex: i })
        }
      }
      if (matches.length > 0) {
        results.push({
          sessionId: session.sessionId,
          name: session.name,
          cli: session.cli,
          startedAt: session.startedAt,
          archived: session.archived,
          matches: matches.slice(0, 10),
        })
      }
    }
    log.debug(`[CLIManager] searchSessions found ${results.length} sessions with matches`)
    return results
  }

  /** Register a callback for slice-level notification emissions. */
  setNotifyCallback(cb: NotifyCallback): void {
    this.onNotify = cb
  }

  /**
   * Update the cache policy. Called from the settings IPC layer on boot and
   * whenever the user toggles the policy in Settings. Defensively copies the
   * input so external mutation doesn't reach our state.
   */
  setCachePolicy(policy: CachePolicy): void {
    this.cachePolicy = { ...policy }
  }

  /** Read the active cache policy. Exposed for tests + the IPC echo path. */
  getCachePolicy(): CachePolicy {
    return { ...this.cachePolicy }
  }

  /**
   * Update the routing rules. Called from the settings IPC fan-out (boot +
   * every `settings:set-routing-rules`). Defensively copies so external
   * mutation doesn't reach the pipeline closure.
   */
  setRoutingRules(rules: RoutingRules): void {
    this.routingRules = {
      enabled: rules.enabled,
      copilot: { ...rules.copilot },
      claude: { ...rules.claude },
    }
  }

  /** Read the active routing rules. Exposed for tests + the IPC echo path. */
  getRoutingRules(): RoutingRules {
    return {
      enabled: this.routingRules.enabled,
      copilot: { ...this.routingRules.copilot },
      claude: { ...this.routingRules.claude },
    }
  }

  /** Register a callback for cost recording on each completed turn. */
  setCostRecordCallback(cb: CostRecordCallback): void {
    this.onCostRecord = cb
  }

  /** Register a callback for audit logging. */
  setAuditCallback(cb: AuditCallback): void {
    this.onAudit = cb
  }

  /** Register a callback for broadcasting extension lifecycle events. */
  setExtensionEventCallback(cb: (event: string, data: unknown) => Promise<void>): void {
    this.onExtensionEvent = cb
  }

  /**
   * Inject the PricingService so cost estimation honors user overrides and
   * remote-sync layers. Optional — without it, the shared module's defaults
   * are used (which is what unit tests rely on).
   */
  setPricingService(service: PricingService): void {
    this.pricingService = service
  }

  /** Log a prompt to the audit trail (hashed, not plaintext). */
  private auditPrompt(sessionId: string, cli: string, input: string): void {
    if (!this.onAudit) return
    const hash = createHash('sha256').update(input).digest('hex').slice(0, 16)
    this.onAudit({
      actionType: 'prompt',
      summary: `Prompt sent to ${cli} (${input.length} chars)`,
      details: JSON.stringify({ cli, charCount: input.length, promptHash: hash }),
      sessionId,
    })
  }

  /** Log a session lifecycle event to the audit trail. */
  private auditSession(sessionId: string, action: string, cli: string, details?: Record<string, unknown>): void {
    if (!this.onAudit) return
    this.onAudit({
      actionType: 'session',
      summary: `Session ${action}: ${cli}`,
      details: JSON.stringify({ cli, action, ...details }),
      sessionId,
    })
  }

  /**
   * Tokenize each captured slice independently and emit a CostRecord with
   * per-slice attribution. When no slices were captured (e.g. legacy call path),
   * the entire prompt is attributed to `userPromptTokens` and slice fields stay
   * undefined so the record looks like the pre–Token Coach shape.
   *
   * Output tokens come from re-tokenizing the assistant's stdout. For CLIs we
   * only see the rendered text, so this is an approximation — Phase 3 will
   * upgrade direct-API paths to use the provider's reported usage tokens.
   */
  private estimateCostFromOutput(
    sessionId: string,
    session: ActiveSession,
    outputBytes: number,
    inputPrompt?: string,
    slices?: PromptSlices,
    rawOutput?: string,
    cacheUsage?: { cachedInputTokens: number; cacheCreationTokens: number },
    routing?: { routedModel: string; userOverride: boolean; difficulty: Difficulty },
  ): void {
    if (!this.onCostRecord) return
    // Phase 4 — when routing fired, the turn's actual API call went to the
    // routed model. Use that for token-cost math; otherwise fall back to the
    // session's stored model. Either way the resolved `model` is what the
    // cost record's primary `model` field carries.
    const model = routing?.routedModel
      ?? session.originalOptions.model
      ?? (providerOf(session.info.cli) === 'copilot' ? 'gpt-5-mini' : 'sonnet')

    // Tokenize each slice. When `slices` is undefined we fall back to
    // tokenizing the full prompt as one user blob.
    let userPromptTokens: number | undefined
    let agentPromptTokens: number | undefined
    let notesTokens: number | undefined
    let contextSourcesTokens: number | undefined
    let injectedContextTokens: number | undefined
    let inputTokens: number

    if (slices) {
      userPromptTokens     = tokenCounter.count(slices.userText, model)
      agentPromptTokens    = slices.agentPrompt    ? tokenCounter.count(slices.agentPrompt,    model) : 0
      notesTokens          = slices.notesFramed    ? tokenCounter.count(slices.notesFramed,    model) : 0
      contextSourcesTokens = slices.contextSources ? tokenCounter.count(slices.contextSources, model) : 0
      const fleetTokens    = slices.fleetPrefix    ? tokenCounter.count(slices.fleetPrefix,    model) : 0
      injectedContextTokens = agentPromptTokens + notesTokens + contextSourcesTokens + fleetTokens
      inputTokens = userPromptTokens + injectedContextTokens
    } else {
      const fullPrompt = inputPrompt ?? ''
      inputTokens = fullPrompt ? tokenCounter.count(fullPrompt, model) : 0
      // No slice info — attribute everything to userPromptTokens for legibility.
      userPromptTokens = inputTokens
    }

    const outputTokens = rawOutput
      ? tokenCounter.count(rawOutput, model)
      // Last-ditch fallback when we don't have the raw text — degrade to bytes/4.
      : Math.ceil(outputBytes / 4)
    const totalTokens = inputTokens + outputTokens

    // Cost is computed from the effective pricing table — defaults + user
    // overrides + optional remote-sync layer — when PricingService is injected.
    // Falls back to the shared module defaults when it's not (unit tests).
    const cost = estimateCost(
      model,
      inputTokens,
      outputTokens,
      this.pricingService?.getEffectiveTable(),
    )

    this.onCostRecord({
      sessionId,
      sessionName: session.info.name ?? sessionId.slice(0, 8),
      cli: session.info.cli,
      model,
      agent: session.originalOptions.agent,
      inputTokens, outputTokens, totalTokens,
      estimatedCostUsd: cost,
      promptCount: 1,
      timestamp: Date.now(),
      // Slice fields — undefined when slices weren't provided so the row keeps
      // the legacy shape on disk.
      userPromptTokens,
      injectedContextTokens,
      agentPromptTokens,
      notesTokens,
      contextSourcesTokens,
      // Token Coach Phase 3 — populated only when an adapter that owns its
      // own API call reported real cache stats from the response. CLI
      // passthroughs leave these undefined; the Insights UI distinguishes
      // "0 cached tokens" from "no cache data" by the undefined sentinel.
      cachedInputTokens: cacheUsage?.cachedInputTokens,
      cacheCreationTokens: cacheUsage?.cacheCreationTokens,
      // Token Coach Phase 4 — only populated when the routing middleware
      // actually fired. Insights uses these to compute the routing
      // distribution + count overrides per period.
      routedModel: routing?.routedModel,
      userOverride: routing?.userOverride,
      routedDifficulty: routing?.difficulty,
    })
  }

  /**
   * Install-state by provider. Keeps the existing two-key shape so legacy
   * callers stay compatible — SDK install-state rides on AuthManager now,
   * not on this method.
   */
  async checkInstalled(): Promise<{ copilot: boolean; claude: boolean }> {
    const [copilot, claude] = await Promise.all([
      this.copilot.isInstalled(),
      this.claude.isInstalled(),
    ])
    return { copilot, claude }
  }

  async checkAuth(): Promise<{ copilot: boolean; claude: boolean }> {
    const [copilot, claude] = await Promise.all([
      this.copilot.isAuthenticated(),
      this.claude.isAuthenticated(),
    ])
    return { copilot, claude }
  }

  // ── Session lifecycle ────────────────────────────────────────────────────

  async startSession(options: SessionOptions): Promise<{ sessionId: string }> {
    const adapter = this.adapterFor(options.cli)
    const sessionId = randomUUID()

    // Ensure adapter binary is resolved
    await adapter.isInstalled()

    // Inject enabled plugin dirs for this CLI unless the caller already provided some.
    // This is what wires the Plugins page through to every spawned session.
    // Plugins are addressed by provider (copilot | claude), not by transport.
    if (!options.pluginDirs || options.pluginDirs.length === 0) {
      const enabledPlugins = this.pluginManager.getEnabledPaths(providerOf(options.cli))
      if (enabledPlugins.length > 0) {
        options = { ...options, pluginDirs: enabledPlugins }
      }
    }

    log.info(`[CLIManager] startSession cli=${options.cli} sessionId=${sessionId.slice(0, 8)} plugins=${options.pluginDirs?.length ?? 0}`)

    const session: ActiveSession = {
      info: {
        sessionId,
        name: options.name,
        cli: options.cli,
        status: 'running',
        startedAt: Date.now(),
      },
      process: null,
      adapter,
      buffer: '',
      originalOptions: options,
      turnCount: 0,
      processingTurn: false,
      turnOutputBytes: 0,
      turnRawOutput: '',
      lastPrompt: options.displayPrompt?.trim() || options.prompt || '',
      currentSlices: options.promptSlices,
      messageLog: [],
    }

    // If context was injected (displayPrompt differs from prompt), log a status
    // summary so rehydrated sessions show what context was used, not raw prompt text.
    if (options.prompt?.trim() && options.displayPrompt?.trim() && options.displayPrompt !== options.prompt) {
      session.messageLog.push({ type: 'status', content: 'Session launched with context attached', sender: 'system', timestamp: Date.now() })
    }

    // Log the user's actual message (displayPrompt) — not the full injected prompt
    if (options.prompt?.trim()) {
      const logContent = options.displayPrompt?.trim() || options.prompt
      const entry: MessageLogEntry = { type: 'text', content: logContent, sender: 'user', timestamp: Date.now() }
      if (options.attachedNotes && options.attachedNotes.length > 0) {
        entry.attachedNotes = options.attachedNotes.map((n) => ({ id: n.id, title: n.title }))
      }
      if (options.attachedAgent) {
        entry.attachedAgent = { id: options.attachedAgent.id, name: options.attachedAgent.name }
      }
      if (options.attachedSkills && options.attachedSkills.length > 0) {
        entry.attachedSkills = options.attachedSkills.map((s) => ({ id: s.id, name: s.name }))
      }
      session.messageLog.push(entry)
    }

    this.sessions.set(sessionId, session)

    // Audit: session started
    this.auditSession(sessionId, 'started', options.cli, {
      model: options.model, agent: options.agent, permissionMode: options.permissionMode,
    })

    // Persist session creation immediately
    this.persistSession(sessionId, session)

    // Broadcast session:started to extensions
    void this.onExtensionEvent?.('session:started', {
      sessionId,
      cli: session.info.cli,
      name: session.info.name,
    })

    // If an initial prompt was given, run the first turn immediately.
    // runTurn is now async (Phase 2 middleware pipeline) — we await it here so
    // that by the time startSession returns, the adapter has already been
    // invoked. Renderer callers always treat `cli:start-session` as
    // fire-and-forget anyway, so the extra microtask isn't observable.
    if (options.prompt?.trim()) {
      await this.runTurn(sessionId, options.prompt.trim())
    }

    return { sessionId }
  }

  async sendInput(
    sessionId: string,
    input: string,
    attachedNotes?: Array<{ id: string; title: string }>,
    promptSlices?: PromptSlices,
    userOverrideModel?: string,
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.info.status !== 'running') return

    // Token Coach Phase 4 — per-turn user override. We stash it on
    // `originalOptions.userOverrideModel` so `runTurn` reads it from the same
    // place as a `cli:start-session`-supplied override. `runTurn` clears it
    // after reading so it never persists across turns.
    if (userOverrideModel) {
      session.originalOptions = { ...session.originalOptions, userOverrideModel }
    }

    if (session.processingTurn) {
      log.debug(`[CLIManager] turn in progress — ignoring input (${input.length} chars)`)
      return
    }

    // Log user input to message history
    if (input !== 'y' && input !== 'n' && !input.startsWith('\x1b')) {
      const entry: MessageLogEntry = { type: 'text', content: input, sender: 'user', timestamp: Date.now() }
      if (attachedNotes && attachedNotes.length > 0) {
        entry.attachedNotes = attachedNotes.map((n) => ({ id: n.id, title: n.title }))
      }
      session.messageLog.push(entry)
    }

    // If there's a deferred agent context (session started without a prompt),
    // prepend it to the first real user input so the AI gets the agent instructions.
    let actualInput = input
    let effectiveSlices: PromptSlices | undefined = promptSlices
    if (session.originalOptions.agentContext && session.turnCount === 0) {
      const agentCtx = session.originalOptions.agentContext
      actualInput = `${agentCtx}\n\n${input}`
      // Reflect the prepended agent context on the slices we ship through to
      // the cost record. If the caller already attributed an agentPrompt, the
      // explicit value wins; otherwise we backfill from agentContext.
      if (effectiveSlices) {
        effectiveSlices = { ...effectiveSlices, agentPrompt: effectiveSlices.agentPrompt ?? agentCtx }
      }
      // Clear it so it's not re-injected on subsequent turns
      session.originalOptions = { ...session.originalOptions, agentContext: undefined }
    }

    // Stash the per-turn slices on the session so the cost path on turn-end
    // can read them. Undefined = legacy fallback to single-slice attribution.
    session.currentSlices = effectiveSlices
    await this.runTurn(sessionId, actualInput)
  }

  async sendSlashCommand(sessionId: string, command: string): Promise<void> {
    // Slash commands go through the same turn mechanism
    await this.sendInput(sessionId, command)
  }

  /**
   * Update the model used for future turns of a session. ClearPath spawns a
   * fresh headless CLI per turn, so the CLI's own `/model` REPL command is
   * unreachable — mutating `originalOptions.model` here is what makes the
   * next `runTurn` spawn with `--model <new>`. Both adapters honor
   * `options.model` in `buildArgs()` on every spawn (see CopilotAdapter.ts
   * and ClaudeCodeAdapter.ts).
   */
  updateSessionModel(sessionId: string, model: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (!model || typeof model !== 'string') return
    session.originalOptions = { ...session.originalOptions, model }
    this.auditSession(sessionId, 'model-changed', session.info.cli, { model })
    this.persistSession(sessionId, session)
  }

  /**
   * Reset a session's conversation: clear the renderer-visible log, drop the
   * `--continue` chain so the next spawn starts a fresh underlying CLI
   * session, and SIGTERM any in-flight child process. Used to implement
   * `/clear` as a real action instead of letting it get echoed to the CLI as
   * a prompt.
   */
  resetSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.process) {
      session.process.kill('SIGTERM')
      session.process = null
    }
    session.processingTurn = false
    session.messageLog = []
    session.turnCount = 0
    // Drop both continue and resume so the next spawn starts a brand-new CLI
    // session instead of stitching to whatever conversation the CLI had on
    // disk for this cwd.
    session.originalOptions = {
      ...session.originalOptions,
      continue: false,
      resume: undefined,
    }
    this.auditSession(sessionId, 'cleared', session.info.cli)
    this.persistSession(sessionId, session)
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.process) {
      session.process.kill('SIGTERM')
      session.process = null
    }
    session.info.status = 'stopped'
    session.processingTurn = false

    // Audit: session stopped
    this.auditSession(sessionId, 'stopped', session.info.cli, { turnCount: session.turnCount })

    // Persist final state with endedAt timestamp
    this.persistSession(sessionId, session)

    // Broadcast session:stopped to extensions
    void this.onExtensionEvent?.('session:stopped', {
      sessionId,
      exitCode: 0,
    })
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s.info }))
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId)?.info
  }

  getSessionMessageLog(sessionId: string): Array<{ type: string; content: string; metadata?: unknown }> {
    return this.sessions.get(sessionId)?.messageLog ?? []
  }

  // ── Per-turn spawning ─────────────────────────────────────────────────────

  /**
   * Spawns a headless (one-shot) process for a single turn of the conversation.
   * Both CLIs have purpose-built headless modes that output cleanly to stdout
   * over a plain pipe:
   *   - Claude Code: --print  (exits after responding)
   *   - Copilot CLI: --prompt (exits after responding)
   *
   * Conversation continuity is handled by the CLI itself via --continue, which
   * resumes the most-recently-closed session in the working directory.
   */
  private async runTurn(sessionId: string, input: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.info.status !== 'running') return

    // Allocate the turn id up front so `cli:prompt-shaped` can carry it —
    // the renderer pairs that event to the user bubble by turn id.
    const turnId = randomUUID()

    // Run the pre-send middleware pipeline (Token Coach Phase 2). Normalize +
    // lint the prompt, tokenize each slice, and emit `cli:prompt-shaped` with
    // the post-lint breakdown so the renderer's context meter can update.
    // Pipeline errors are swallowed inside runPipeline — we always proceed with
    // *some* ctx, falling back to the original prompt if anything threw.
    const model =
      session.originalOptions.model ??
      (providerOf(session.info.cli) === 'copilot' ? 'gpt-5-mini' : 'sonnet')
    let promptForAdapter = input
    // Per-turn user override of routing — set by the renderer via
    // `userOverrideModel` on SessionOptions. We read it ONCE here and clear
    // it so it doesn't carry to subsequent turns (overrides are per-turn).
    const userOverride: { model: string } | undefined = session.originalOptions.userOverrideModel
      ? { model: session.originalOptions.userOverrideModel }
      : undefined
    if (session.originalOptions.userOverrideModel) {
      session.originalOptions = { ...session.originalOptions, userOverrideModel: undefined }
    }
    // Carry the routing decision forward even when the pipeline path errors
    // out — initialize on the session before runPipeline so the cost-record
    // path on turn-end still gets at least the userOverride flag.
    session.currentRouting = undefined
    let routedModelForSpawn: string | undefined
    try {
      const initialCtx: MiddlewareContext = {
        sessionId,
        cli: session.info.cli,
        model,
        prompt: input,
        slices: session.currentSlices,
        meta: {
          turnIndex: session.turnCount,
          isFirstTurn: session.turnCount === 0,
        },
        notes: [],
        ...(userOverride ? { userOverride } : {}),
      }
      const finalCtx = await runPipeline(initialCtx, this.pipeline)
      promptForAdapter = finalCtx.prompt
      session.currentSlices = finalCtx.slices

      // Token Coach Phase 4 — capture the routing decision on the session so
      // (a) the spawn below uses the routed model, and (b) the cost-record
      // path on turn-end can report routedModel + userOverride + difficulty.
      if (finalCtx.routedModel) {
        routedModelForSpawn = finalCtx.routedModel
        session.currentRouting = {
          routedModel: finalCtx.routedModel,
          userOverride: !!finalCtx.userOverride,
          // When userOverride is set the classifier didn't run — default the
          // difficulty to "normal" so the cost row still has a sensible value.
          difficulty: finalCtx.classification?.difficulty ?? 'normal',
        }
      }

      // Token Coach Phase 3 — assemble the cacheStatus payload extension. The
      // breakpoint comes from prefixOrderMiddleware (byte offset where the
      // volatile user-text suffix starts). Eligibility is a function of the
      // policy flag + the prefix's token count + per-model minimum.
      //
      // For CLI passthroughs (Copilot CLI / Claude Code CLI) we can't inject
      // cache_control directly, but the stable-prefix discipline still helps —
      // we report `eligible:false` with `reason:'cli-passthrough'` so the UI
      // knows not to claim cache savings on those paths.
      let cacheStatus: { breakpointTokens: number; eligible: boolean; reason?: string } | undefined
      if (finalCtx.tokens) {
        const breakpointTokens = (finalCtx.tokens.fleetPrefix ?? 0)
          + (finalCtx.tokens.agentPrompt ?? 0)
          + (finalCtx.tokens.notesFramed ?? 0)
          + (finalCtx.tokens.contextSources ?? 0)

        const isDirectApi = false // Phase 3: CLIManager only drives CLI adapters; LocalModelAdapter rides on its own IPC.
        const isAnthropic = isAnthropicModel(model)
        const meetsMin = breakpointTokens >= minPrefixTokensFor(model)

        let eligible = false
        let reason: string | undefined
        if (!this.cachePolicy.enabled) {
          reason = 'policy-disabled'
        } else if (!isDirectApi) {
          reason = 'cli-passthrough'
        } else if (!isAnthropic) {
          reason = 'non-anthropic-model'
        } else if (!meetsMin) {
          reason = `prefix-below-min (${breakpointTokens} < ${minPrefixTokensFor(model)})`
        } else {
          eligible = true
        }

        cacheStatus = { breakpointTokens, eligible, reason }
      }

      const wcShape = this.getWebContents()
      if (wcShape && !wcShape.isDestroyed() && finalCtx.tokens) {
        // Phase 4 routing payload — included only when the middleware
        // actually made a decision. Renderer reads it to mark the override
        // chip with the after-the-fact routing record (the live preview comes
        // from the `routing:classify` IPC).
        const routingPayload = finalCtx.routedModel
          ? {
              routedModel: finalCtx.routedModel,
              userOverride: !!finalCtx.userOverride,
              difficulty: finalCtx.classification?.difficulty ?? 'normal',
              reasons: finalCtx.classification?.reasons ?? [],
              confidence: finalCtx.classification?.confidence ?? 0,
            }
          : undefined
        wcShape.send('cli:prompt-shaped', {
          sessionId,
          turnId,
          tokens: finalCtx.tokens,
          notes: finalCtx.notes,
          // Optional — phases that don't compute it leave it off.
          ...(cacheStatus ? { cacheStatus } : {}),
          ...(routingPayload ? { routing: routingPayload } : {}),
        })
      }
    } catch (err) {
      // Defensive: runPipeline shouldn't throw, but if a callback above does
      // (e.g. webContents.send threw because of a malformed payload) we'd
      // rather log + send the un-rewritten prompt than break the turn.
      log.warn('[CLIManager] middleware pipeline failed, sending original prompt: %s', err instanceof Error ? err.message : String(err))
    }

    // If the session was stopped while the pipeline was running, bail out
    // before spawning the adapter — `await` above is the only suspension
    // point in this method, so a stop() between then and here is observable.
    const stillRunning = this.sessions.get(sessionId)
    if (!stillRunning || stillRunning.info.status !== 'running') return

    const turnOptions: SessionOptions = {
      ...session.originalOptions,
      // Force headless mode so the CLI writes plain text to stdout
      mode: 'prompt',
      prompt: promptForAdapter,
      // After the first turn, always continue the session the CLI just created
      continue: session.turnCount > 0 ? true : session.originalOptions.continue,
      // Don't re-resume a named session on turn 2+ — let --continue handle it
      resume: session.turnCount === 0 ? session.originalOptions.resume : undefined,
      // Token Coach Phase 4 — thread the routed model back into the spawn
      // options so the adapter emits `--model <routed>` for this turn. The
      // routing decision is per-turn — `session.originalOptions.model` stays
      // unchanged so subsequent turns re-route fresh against the live rules.
      // When routing didn't run (disabled or errored), `routedModelForSpawn`
      // is undefined and the original session model wins, preserving today's
      // behavior byte-for-byte for flag-off users.
      ...(routedModelForSpawn ? { model: routedModelForSpawn } : {}),
    }

    // Log turn start — do NOT log prompt content or full args in production
    log.info(`[CLIManager] runTurn #${session.turnCount} cli=${session.info.cli} inputLen=${promptForAdapter.length}`)
    log.debug(`[CLIManager] args:`, session.adapter.buildArgs(turnOptions))

    // Audit: prompt sent (audited against the post-lint version, since that's
    // what actually went out the wire).
    this.auditPrompt(sessionId, session.info.cli, promptForAdapter)

    const proc = session.adapter.startSession(turnOptions)
    session.process = proc
    session.buffer = ''
    session.processingTurn = true
    session.turnOutputBytes = 0
    session.turnRawOutput = ''
    // Persist the post-lint prompt so the cost path (and any audit reader)
    // sees the same bytes the adapter actually received.
    session.lastPrompt = promptForAdapter
    ;(session as ActiveSession & { turnStartedAt: number }).turnStartedAt = Date.now()

    log.info(`[CLIManager] spawned pid=${proc.pid ?? 'unknown'} for session ${sessionId.slice(0, 8)}`)
    log.debug(`[CLIManager] turn #${session.turnCount} started — waiting for CLI response...`)

    // Threaded onto every output event for this turn so the renderer can
    // group streaming fragments into one bubble.
    session.currentTurnId = turnId

    // Notify renderer a turn started
    const wc0 = this.getWebContents()
    if (wc0 && !wc0.isDestroyed()) {
      wc0.send('cli:turn-start', { sessionId, turnId })
    }

    // Broadcast turn:started to extensions
    void this.onExtensionEvent?.('turn:started', { sessionId })

    this.attachListeners(sessionId, session, proc)
  }

  // ── Sub-agent / delegated task management ─────────────────────────────────

  async spawnSubAgent(options: {
    name: string
    cli: BackendId
    prompt: string
    model?: string
    workingDirectory?: string
    permissionMode?: string
    agent?: string
    allowedTools?: string[]
    maxBudget?: number
    maxTurns?: number
  }): Promise<SubAgentInfo> {
    const adapter = this.adapterFor(options.cli)
    await adapter.isInstalled()
    const id = randomUUID()

    const sessionOpts: SessionOptions = {
      cli: options.cli,
      mode: 'prompt',
      prompt: options.prompt,
      model: options.model,
      workingDirectory: options.workingDirectory,
      agent: options.agent,
      allowedTools: options.allowedTools,
      maxBudget: options.maxBudget,
      maxTurns: options.maxTurns,
    }

    const provider = providerOf(options.cli)
    if (provider === 'claude' && options.permissionMode) {
      sessionOpts.permissionMode = options.permissionMode as SessionOptions['permissionMode']
    }
    if (provider === 'copilot' && options.permissionMode === 'yolo') {
      sessionOpts.yolo = true
    }

    // Inject enabled plugin dirs so sub-agents get the same plugin context as sessions.
    const enabledPlugins = this.pluginManager.getEnabledPaths(provider)
    if (enabledPlugins.length > 0) sessionOpts.pluginDirs = enabledPlugins

    const proc = adapter.startSession(sessionOpts)

    const info: SubAgentInfo = {
      id,
      name: options.name,
      cli: options.cli,
      status: 'running',
      prompt: options.prompt,
      model: options.model,
      workingDirectory: options.workingDirectory,
      permissionMode: options.permissionMode,
      startedAt: Date.now(),
      pid: proc.pid,
    }

    const subAgent: SubAgentProcess = {
      info,
      process: proc,
      adapter,
      buffer: '',
      outputLog: [],
    }

    this.subAgents.set(id, subAgent)
    this.attachSubAgentListeners(id, subAgent, proc)

    // Notify renderer
    const wc = this.getWebContents()
    if (wc && !wc.isDestroyed()) {
      wc.send('subagent:spawned', info)
    }

    return info
  }

  private attachSubAgentListeners(id: string, subAgent: SubAgentProcess, proc: SessionHandle): void {
    proc.stdout?.on('data', (chunk: Buffer) => {
      const raw = chunk.toString()
      subAgent.buffer += raw
      const lines = subAgent.buffer.split(/\r\n|\r|\n/)
      subAgent.buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        const parsed = subAgent.adapter.parseOutput(line)
        subAgent.outputLog.push(parsed)

        const wc = this.getWebContents()
        if (wc && !wc.isDestroyed()) {
          wc.send('subagent:output', { id, output: parsed })
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const raw = chunk.toString()
      const parsed = { type: 'error' as const, content: raw.trim() }
      subAgent.outputLog.push(parsed)

      const wc = this.getWebContents()
      if (wc && !wc.isDestroyed()) {
        wc.send('subagent:output', { id, output: parsed })
      }
    })

    proc.on('error', (err) => {
      this.updateSubAgentStatus(id, 'failed')
      const parsed = { type: 'error' as const, content: `Spawn error: ${err.message}` }
      subAgent.outputLog.push(parsed)
      subAgent.process = null
    })

    proc.on('exit', (code, signal) => {
      // Flush remaining buffer
      if (subAgent.buffer.trim()) {
        const parsed = subAgent.adapter.parseOutput(subAgent.buffer)
        subAgent.outputLog.push(parsed)
        subAgent.buffer = ''
      }

      subAgent.process = null
      subAgent.info.exitCode = code ?? undefined
      subAgent.info.endedAt = Date.now()

      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        this.updateSubAgentStatus(id, 'killed')
      } else if (code !== 0) {
        this.updateSubAgentStatus(id, 'failed')
      } else {
        this.updateSubAgentStatus(id, 'completed')
      }

      // Record cost for completed sub-agents. Routed through the same
      // estimateCost helper as primary turns so a single source of truth
      // applies — no more `opus: [15, 75]` divergence with the main map.
      if (this.onCostRecord && code === 0) {
        const model = subAgent.info.model ?? (providerOf(subAgent.info.cli) === 'copilot' ? 'claude-sonnet-4.5' : 'sonnet')
        const rawOutput = subAgent.outputLog.map((o) => o.content).join('\n')
        const inputTokens = subAgent.info.prompt ? tokenCounter.count(subAgent.info.prompt, model) : 0
        const outputTokens = rawOutput ? tokenCounter.count(rawOutput, model) : 0
        this.onCostRecord({
          sessionId: id, sessionName: subAgent.info.name,
          cli: subAgent.info.cli, model,
          agent: undefined, inputTokens, outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCostUsd: estimateCost(
            model,
            inputTokens,
            outputTokens,
            this.pricingService?.getEffectiveTable(),
          ),
          promptCount: 1, timestamp: Date.now(),
        })
      }
    })
  }

  private updateSubAgentStatus(id: string, status: SubAgentStatus): void {
    const sa = this.subAgents.get(id)
    if (!sa) return
    sa.info.status = status
    if (!sa.info.endedAt && status !== 'running') {
      sa.info.endedAt = Date.now()
    }
    const wc = this.getWebContents()
    if (wc && !wc.isDestroyed()) {
      wc.send('subagent:status-changed', sa.info)
    }
    // Notify on completion or failure only — keep it clean, with deep links
    if (this.onNotify) {
      if (status === 'completed') {
        this.onNotify({
          type: 'session-complete', severity: 'info',
          title: `${sa.info.name} completed`,
          message: 'Task finished successfully.',
          source: 'sub-agent-monitor', sessionId: id,
          action: { label: 'View Output', ipcChannel: '', navigate: '/work', panel: 'subagents' },
        })
      } else if (status === 'failed') {
        this.onNotify({
          type: 'error', severity: 'warning',
          title: `${sa.info.name} failed`,
          message: 'Task did not complete. Check Sub-Agents panel for details.',
          source: 'sub-agent-monitor', sessionId: id,
          action: { label: 'View Details', ipcChannel: '', navigate: '/work', panel: 'subagents' },
        })
      }
    }
  }

  killSubAgent(id: string): boolean {
    const sa = this.subAgents.get(id)
    if (!sa || !sa.process) return false
    sa.process.kill('SIGTERM')
    return true
  }

  pauseSubAgent(id: string): boolean {
    const sa = this.subAgents.get(id)
    if (!sa || !sa.process) return false
    // Send Ctrl+C (SIGINT) to interrupt current operation
    sa.process.kill('SIGINT')
    return true
  }

  resumeSubAgent(id: string, followUpPrompt?: string): boolean {
    const sa = this.subAgents.get(id)
    if (!sa || !sa.process) return false
    const msg = followUpPrompt?.trim() || 'continue'
    sa.process.stdin?.write(msg + '\n')
    return true
  }

  killAllSubAgents(): number {
    let count = 0
    for (const [id, sa] of this.subAgents) {
      if (sa.process) {
        sa.process.kill('SIGTERM')
        count++
      }
    }
    return count
  }

  listSubAgents(): SubAgentInfo[] {
    return Array.from(this.subAgents.values()).map((sa) => ({ ...sa.info }))
  }

  getSubAgentOutput(id: string): import('./types').ParsedOutput[] {
    return this.subAgents.get(id)?.outputLog ?? []
  }

  // ── Session listeners (existing) ─────────────────────────────────────────

  private attachListeners(sessionId: string, session: ActiveSession, proc: SessionHandle): void {
    proc.stdout?.on('data', (chunk: Buffer) => {
      const raw = chunk.toString()
      // Only log byte count in production — never log AI output content
      log.debug(`[CLIManager:${session.info.cli}] stdout (${raw.length}b)`)

      session.turnOutputBytes += raw.length
      // Accumulate raw output up to 256KB so we can tokenize the assistant
      // response accurately at turn-end. Past that cap we drop further bytes
      // and tokenization degrades to the bytes/4 heuristic on the overflow.
      if ((session.turnRawOutput?.length ?? 0) < 256 * 1024) {
        session.turnRawOutput = (session.turnRawOutput ?? '') + raw
      }
      session.buffer += raw
      const lines = session.buffer.split(/\r\n|\r|\n/)
      session.buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        const parsed = session.adapter.parseOutput(line)
        log.debug(`[CLIManager:${session.info.cli}] parsed: ${parsed.type} (${parsed.content.length} chars)`)

        const wc = this.getWebContents()
        if (!wc || wc.isDestroyed()) continue

        // Store in message log for rehydration (cap at 500 entries)
        if (parsed.content.trim()) {
          session.messageLog.push({ type: parsed.type, content: parsed.content, metadata: parsed.metadata, sender: 'ai', timestamp: Date.now() })
          if (session.messageLog.length > 500) session.messageLog.splice(0, session.messageLog.length - 500)
        }

        if (parsed.type === 'permission-request') {
          wc.send('cli:permission-request', { sessionId, request: parsed })
        } else {
          wc.send('cli:output', { sessionId, output: { ...parsed, turnId: session.currentTurnId } })
        }
      }
    })

    // Track recent stderr messages for deduplication (avoids spam from repeated policy warnings)
    const recentStderr = new Set<string>()
    let stderrFlushTimer: ReturnType<typeof setTimeout> | null = null

    proc.stderr?.on('data', (chunk: Buffer) => {
      const raw = chunk.toString()
      log.debug(`[CLIManager:${session.info.cli}] stderr (${raw.length}b)`)
      const wc = this.getWebContents()
      if (!wc || wc.isDestroyed()) return

      const trimmed = raw.trim()
      if (!trimmed) return

      // Detect usage/stats output and send as usage event instead of error
      const isUsageStats = /total usage est|premium request|api time spent|session time|code changes|breakdown by ai model/i.test(trimmed)
      if (isUsageStats) {
        wc.send('cli:usage', { sessionId, usage: trimmed })
        return
      }

      // Detect agent-not-found errors — suppress and show a gentle status instead
      const isAgentError = /no (?:such )?agent|agent.*not found|cannot find agent|unknown agent/i.test(trimmed)
      if (isAgentError) {
        log.warn(`[CLIManager:${session.info.cli}] agent error suppressed: ${trimmed.slice(0, 100)}`)
        wc.send('cli:output', { sessionId, output: { type: 'status', content: 'Agent not found — running without agent. You can re-create it from the Agents page.', turnId: session.currentTurnId } })
        session.messageLog.push({ type: 'status', content: 'Agent not found — running without agent.', sender: 'system', timestamp: Date.now() })
        return
      }

      // Detect organization policy / MCP warnings — show as status, not error
      const isPolicyWarning = /(?:mcp\s+server|organization.*policy|disabled\s+by|third[- ]party|only\s+built[- ]in)/i.test(trimmed)

      // Deduplicate repeated messages — suppress exact duplicates within a rolling window
      const dedupeKey = trimmed.slice(0, 200)
      if (recentStderr.has(dedupeKey)) {
        log.debug(`[CLIManager:${session.info.cli}] suppressed duplicate stderr`)
        return
      }
      recentStderr.add(dedupeKey)

      // Clear the dedup set periodically so genuinely new messages come through
      if (stderrFlushTimer) clearTimeout(stderrFlushTimer)
      stderrFlushTimer = setTimeout(() => recentStderr.clear(), 30_000)

      if (isPolicyWarning) {
        // Send as a status message (grey pill) instead of a red error block
        wc.send('cli:output', { sessionId, output: { type: 'status', content: trimmed, metadata: { source: 'policy' }, turnId: session.currentTurnId } })
        session.messageLog.push({ type: 'status', content: trimmed, metadata: { source: 'policy' }, sender: 'system', timestamp: Date.now() })
      } else {
        wc.send('cli:error', { sessionId, error: trimmed })
      }
    })

    proc.on('error', (err) => {
      log.error(`[CLIManager:${session.info.cli}] spawn error:`, err.message)
      session.processingTurn = false
      session.process = null
      const endedTurnId = session.currentTurnId
      session.currentTurnId = undefined
      const wc = this.getWebContents()
      if (!wc || wc.isDestroyed()) return
      wc.send('cli:error', { sessionId, error: `Failed to start process: ${err.message}` })
      wc.send('cli:turn-end', { sessionId, turnId: endedTurnId })
    })

    proc.on('exit', (code, signal) => {
      const duration = Date.now() - (session.info.startedAt ?? Date.now())
      log.info(`[CLIManager] turn complete — session=${sessionId.slice(0, 8)} cli=${session.info.cli} exit=${code} signal=${signal} outputBytes=${session.turnOutputBytes} elapsed=${Math.round(duration / 1000)}s`)

      // Flush any remaining buffer
      if (session.buffer.trim()) {
        const parsed = session.adapter.parseOutput(session.buffer)
        session.buffer = ''
        const wc = this.getWebContents()
        if (wc && !wc.isDestroyed()) {
          wc.send('cli:output', { sessionId, output: { ...parsed, turnId: session.currentTurnId } })
        }
      }

      session.process = null
      session.processingTurn = false
      session.turnCount++

      // Capture then clear the turn id so any late events (shouldn't happen,
      // but safe) don't get attributed to a turn that's already ended.
      const endedTurnId = session.currentTurnId
      session.currentTurnId = undefined

      const wc = this.getWebContents()
      if (!wc || wc.isDestroyed()) return

      if (code !== 0) {
        // Non-zero exit — send turn-end so the UI stops showing the processing
        // indicator, but keep the session alive so the user can retry.
        // The stderr handler already showed any error messages to the user.
        wc.send('cli:turn-end', { sessionId, turnId: endedTurnId })

        // Only notify on first-turn failures (likely auth/install issues)
        if (session.turnCount === 1) {
          this.onNotify?.({
            type: 'error', severity: 'warning',
            title: `Session issue`,
            message: `The ${providerOf(session.info.cli) === 'copilot' ? 'Copilot' : 'Claude'} process exited unexpectedly. You can try again from the session.`,
            source: 'cli-manager', sessionId,
            action: { label: 'View Session', navigate: '/work' },
          })
        }
      } else {
        // Turn completed normally — session stays open for next input
        wc.send('cli:turn-end', { sessionId, turnId: endedTurnId })
        // Record cost for this completed turn — per-slice attribution when
        // the renderer supplied slices, single-slice fallback otherwise.
        // Cache usage (Phase 3) is forwarded only when an adapter reported it.
        this.estimateCostFromOutput(
          sessionId,
          session,
          session.turnOutputBytes,
          session.lastPrompt,
          session.currentSlices,
          session.turnRawOutput,
          session.currentCacheUsage,
          session.currentRouting,
        )
        // Reset so the next turn doesn't inherit stale cache/routing numbers.
        session.currentCacheUsage = undefined
        session.currentRouting = undefined
      }

      // Broadcast turn:ended to extensions with timing and token data.
      // Use the real tokenizer for the model in play — bytes/4 was the old
      // pre–Token Coach approximation.
      const turnStartedAt = (session as ActiveSession & { turnStartedAt?: number }).turnStartedAt
      const durationMs = turnStartedAt ? Date.now() - turnStartedAt : 0
      const extModel = session.originalOptions.model ?? (providerOf(session.info.cli) === 'copilot' ? 'gpt-5-mini' : 'sonnet')
      const inputTokens = session.lastPrompt
        ? tokenCounter.count(session.lastPrompt, extModel)
        : 0
      const outputTokens = session.turnRawOutput
        ? tokenCounter.count(session.turnRawOutput, extModel)
        : Math.ceil(session.turnOutputBytes / 4)
      void this.onExtensionEvent?.('turn:ended', {
        sessionId,
        turnIndex: session.turnCount - 1,
        durationMs,
        inputTokens,
        outputTokens,
        hadError: code !== 0,
        model: session.originalOptions.model ?? 'default',
        cli: session.info.cli,
        promptLength: session.lastPrompt.length,
        responseLength: session.turnOutputBytes,
      })

      // Persist session data (message log + metadata) to disk after every turn
      this.persistSession(sessionId, session)
    })
  }
}
