import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import type { BackendId } from '../../shared/backends'
import { providerOf } from '../../shared/backends'

/**
 * Token Coach Phase 5 — Insights "Efficiency" tab IPC handlers.
 *
 * Three read-only aggregation handlers that power the tab without adding any
 * new persistence. All math reads from the existing two stores:
 *
 *   - `clear-path-cost.json` — per-turn CostRecord rows (Phase 1+ schema)
 *   - `clear-path-sessions.json` — persisted session message logs, where the
 *     `attachedAgent` / `attachedNotes` metadata lives
 *
 * "Real data only" is non-negotiable here. Every handler must return a shape
 * the renderer can show without inventing numbers — when there's no usable
 * data, return empty arrays / zero values, NEVER fake a savings card.
 */

// ── Cost record shape (mirror of costHandlers — kept here so this module
// doesn't import handler internals). All Phase 1-4 fields are optional; we
// must defend against missing fields on legacy records.
//
// Exported for test fixtures (and other modules that consume the read-only
// efficiency surface) — the canonical record is still owned by costHandlers.
export interface EfficiencyCostRecord {
  id: string
  sessionId: string
  sessionName: string
  cli: BackendId | string  // legacy rows may have 'copilot'/'claude'
  model: string
  agent?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  promptCount: number
  timestamp: number
  // Phase 1 slice breakdown
  userPromptTokens?: number
  injectedContextTokens?: number
  agentPromptTokens?: number
  notesTokens?: number
  contextSourcesTokens?: number
  // Phase 3 cache
  cachedInputTokens?: number
  cacheCreationTokens?: number
  // Phase 4 routing
  routedModel?: string
  userOverride?: boolean
  routedDifficulty?: 'trivial' | 'normal' | 'hard'
}

interface MessageLogEntry {
  type: string
  content: string
  metadata?: unknown
  sender?: 'user' | 'ai' | 'system'
  timestamp?: number
  attachedNotes?: Array<{ id: string; title: string }>
  attachedAgent?: { id: string; name: string }
  attachedSkills?: Array<{ id: string; name: string }>
}

interface PersistedSession {
  sessionId: string
  cli: BackendId | string
  name?: string
  firstPrompt?: string
  startedAt: number
  endedAt?: number
  archived?: boolean
  messageLog: MessageLogEntry[]
}

interface CostStoreSchema {
  records: EfficiencyCostRecord[]
}

interface SessionStoreSchema {
  sessions: PersistedSession[]
}

// ── Public response shapes ──────────────────────────────────────────────────

export interface WhereDidTokensGoBreakdown {
  /** Total tokens across the window — sum of all slices. */
  total: number
  /** User-typed prompts. Sums `userPromptTokens` (falls back to inputTokens when slices absent). */
  user: number
  /** Agent / persona system prompts. */
  agent: number
  /** Framed notes blob. */
  notes: number
  /** Live context-source fetches. */
  contextSources: number
  /** Anthropic prompt-cache reads (Phase 3 — populated only on direct-API paths). */
  cached: number
  /** Output tokens — what the model produced back. */
  output: number
  /** Period covered (ms since epoch — lower bound). */
  since: number
  /** Number of cost records aggregated. Drives the "not enough data" empty state. */
  recordCount: number
}

export interface ContextBloatEntry {
  kind: 'note' | 'agent'
  /** Note id or agent id. Stable enough to dedupe across sessions. */
  id: string
  /** Display title — note.title or agent.name. */
  title: string
  /** Number of distinct sessions this entity was attached to in the window. */
  sessions: number
  /** Total tokens contributed across all attachments. */
  totalTokens: number
  /** Average tokens per attachment (totalTokens / sessions). */
  avgTokens: number
}

export type SavingsCardId =
  | 'enable-prompt-cache'
  | 'enable-auto-routing'
  | 'trim-large-note'

export interface SavingsSuggestion {
  id: string  // unique per card instance (e.g. trim-large-note:<noteId>)
  cardId: SavingsCardId
  title: string
  body: string
  estimatedSavingsUsd: number
  /** Renderer routes here when the user clicks the CTA. */
  ctaLink: string
  /** Renderer can use this to label the CTA button. */
  ctaLabel: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadCostRecords(): EfficiencyCostRecord[] {
  const store = new Store<CostStoreSchema>({
    name: 'clear-path-cost',
    encryptionKey: getStoreEncryptionKey(),
    defaults: { records: [] },
  })
  return store.get('records', [])
}

function loadPersistedSessions(): PersistedSession[] {
  const store = new Store<SessionStoreSchema>({
    name: 'clear-path-sessions',
    encryptionKey: getStoreEncryptionKey(),
    defaults: { sessions: [] },
  })
  return store.get('sessions', [])
}

/** Default analytics window: last 7 days. */
const DEFAULT_SINCE_MS = 7 * 24 * 60 * 60 * 1000

// ── Handler registration ────────────────────────────────────────────────────

export interface EfficiencyHandlerDeps {
  /**
   * Test injection. When provided, used in place of reading from the
   * electron-store-backed cost/session stores. Lets us drive deterministic
   * fixtures into the handlers without touching disk.
   */
  loadRecords?: () => EfficiencyCostRecord[]
  loadSessions?: () => PersistedSession[]
}

export function registerEfficiencyHandlers(
  ipcMain: IpcMain,
  deps: EfficiencyHandlerDeps = {},
): void {
  const records = deps.loadRecords ?? loadCostRecords
  const sessions = deps.loadSessions ?? loadPersistedSessions

  ipcMain.handle(
    'efficiency:where-did-tokens-go',
    (_e, args?: { since?: number }): WhereDidTokensGoBreakdown => {
      const since = args?.since ?? Date.now() - DEFAULT_SINCE_MS
      const rows = records().filter((r) => r.timestamp >= since)

      let user = 0
      let agent = 0
      let notes = 0
      let contextSources = 0
      let cached = 0
      let output = 0

      for (const r of rows) {
        // Slice fields are optional — when absent on legacy rows, attribute the
        // input total to the user bucket so the bar still sums correctly.
        if (r.userPromptTokens !== undefined) {
          user += r.userPromptTokens
          agent += r.agentPromptTokens ?? 0
          notes += r.notesTokens ?? 0
          contextSources += r.contextSourcesTokens ?? 0
        } else {
          user += r.inputTokens
        }
        cached += r.cachedInputTokens ?? 0
        output += r.outputTokens
      }

      // The breakdown represents tokens spent — including output for honesty.
      const total = user + agent + notes + contextSources + cached + output

      return { total, user, agent, notes, contextSources, cached, output, since, recordCount: rows.length }
    },
  )

  ipcMain.handle(
    'efficiency:top-context-bloat',
    (_e, args?: { since?: number; limit?: number }): ContextBloatEntry[] => {
      const since = args?.since ?? Date.now() - DEFAULT_SINCE_MS
      const limit = args?.limit ?? 10
      const allSessions = sessions().filter((s) => (s.startedAt ?? 0) >= since)

      // Pre-compute total notes/agent tokens by *session* from cost records so
      // we have a token cost to attribute to each attachment. We can't pin a
      // single attachment to a single cost record (CostRecord doesn't store
      // which note id contributed), so we approximate: each session's
      // notesTokens sum is divided evenly across the notes that session
      // attached. Same approach for agents.
      const allRecords = records().filter((r) => r.timestamp >= since)
      const sessionTokens = new Map<string, { notes: number; agent: number }>()
      for (const r of allRecords) {
        const cur = sessionTokens.get(r.sessionId) ?? { notes: 0, agent: 0 }
        cur.notes += r.notesTokens ?? 0
        cur.agent += r.agentPromptTokens ?? 0
        sessionTokens.set(r.sessionId, cur)
      }

      // Group attachments. Keys: `note:<id>` and `agent:<id>`.
      type Agg = {
        kind: 'note' | 'agent'
        title: string
        sessionIds: Set<string>
        totalTokens: number
      }
      const agg = new Map<string, Agg>()

      for (const s of allSessions) {
        const { notes: sessionNoteTokens = 0, agent: sessionAgentTokens = 0 } =
          sessionTokens.get(s.sessionId) ?? { notes: 0, agent: 0 }

        // Collect unique note ids attached anywhere in this session's log.
        const noteIdsForSession = new Map<string, string>()  // id -> title
        let agentForSession: { id: string; name: string } | undefined
        for (const entry of s.messageLog ?? []) {
          if (entry.attachedNotes) {
            for (const n of entry.attachedNotes) {
              if (!noteIdsForSession.has(n.id)) noteIdsForSession.set(n.id, n.title)
            }
          }
          if (entry.attachedAgent && !agentForSession) {
            agentForSession = entry.attachedAgent
          }
        }

        // Distribute the session's notes tokens evenly across attached notes.
        // Per-note token cost in this session = sessionNoteTokens / N.
        const noteCount = noteIdsForSession.size
        if (noteCount > 0) {
          const perNote = sessionNoteTokens / noteCount
          for (const [id, title] of noteIdsForSession) {
            const key = `note:${id}`
            const existing = agg.get(key) ?? {
              kind: 'note', title, sessionIds: new Set<string>(), totalTokens: 0,
            }
            existing.sessionIds.add(s.sessionId)
            existing.totalTokens += perNote
            agg.set(key, existing)
          }
        }

        if (agentForSession) {
          const key = `agent:${agentForSession.id}`
          const existing = agg.get(key) ?? {
            kind: 'agent', title: agentForSession.name, sessionIds: new Set<string>(), totalTokens: 0,
          }
          existing.sessionIds.add(s.sessionId)
          existing.totalTokens += sessionAgentTokens
          agg.set(key, existing)
        }
      }

      // Sort by total tokens desc, take top N.
      const out: ContextBloatEntry[] = []
      for (const [key, v] of agg) {
        const sessionsCount = v.sessionIds.size
        if (sessionsCount === 0 || v.totalTokens === 0) continue
        out.push({
          kind: v.kind,
          id: key.split(':').slice(1).join(':'),
          title: v.title,
          sessions: sessionsCount,
          totalTokens: Math.round(v.totalTokens),
          avgTokens: Math.round(v.totalTokens / sessionsCount),
        })
      }
      out.sort((a, b) => b.totalTokens - a.totalTokens)
      return out.slice(0, limit)
    },
  )

  ipcMain.handle(
    'efficiency:savings-suggestions',
    (_e, args?: { since?: number; cachePolicyEnabled?: boolean; routingEnabled?: boolean }): SavingsSuggestion[] => {
      const since = args?.since ?? Date.now() - DEFAULT_SINCE_MS
      // Phase 3 + 4 flags are passed in from the renderer (they live in main
      // settings stores we don't import here to avoid a cyclic). Defaults are
      // pessimistic — if we don't know, assume disabled so we don't suppress
      // a valid suggestion.
      const cachePolicyEnabled = args?.cachePolicyEnabled ?? false
      const routingEnabled = args?.routingEnabled ?? false

      const rows = records().filter((r) => r.timestamp >= since)
      const suggestions: SavingsSuggestion[] = []

      // ── Card 1: enable prompt caching ─────────────────────────────────────
      // Only valid when Phase 3 is OFF and the user has been sending a stable
      // agent prompt >= 1024 tok at least 5 times in the window.
      if (!cachePolicyEnabled) {
        const agentTurns = rows.filter((r) => (r.agentPromptTokens ?? 0) >= 1024)
        if (agentTurns.length >= 5) {
          // Estimate savings: cached reads cost ~10% of cold input. The agent
          // prompt is the most cacheable slice. Compute the cold input dollars
          // we paid on agent tokens; assume 90% of that becomes savings on
          // turns 2+ (turn 1 is a cache write).
          const totalAgentCostUsd = agentTurns.reduce((sum, r) => {
            // Per-row: derive input price share for the agent slice. We have
            // estimatedCostUsd and the slice split; share by token fraction.
            const share = r.agentPromptTokens! / Math.max(r.inputTokens, 1)
            // Output cost is excluded — caching only affects input.
            // We can't perfectly decompose without per-row input/output split,
            // so use the cost field weighted by input-share (input-share ≈
            // inputTokens / totalTokens).
            const inputShareOfCost = r.inputTokens / Math.max(r.totalTokens, 1)
            return sum + r.estimatedCostUsd * inputShareOfCost * share
          }, 0)
          const estimatedSavingsUsd = totalAgentCostUsd * 0.9 * ((agentTurns.length - 1) / Math.max(agentTurns.length, 1))
          if (estimatedSavingsUsd > 0) {
            suggestions.push({
              id: 'enable-prompt-cache',
              cardId: 'enable-prompt-cache',
              title: 'Enable prompt caching',
              body: `You spent ~${formatUsd(totalAgentCostUsd)} on cold-cache agent prompts this week across ${agentTurns.length} turns. Caching would have reused most of that.`,
              estimatedSavingsUsd,
              ctaLabel: 'Enable in Advanced settings',
              ctaLink: '/configure?tab=advanced',
            })
          }
        }
      }

      // ── Card 2: enable auto-routing ───────────────────────────────────────
      // Valid when Phase 4 is OFF and the user has been running short prompts
      // on expensive models. Heuristic: count rows where the model price >=
      // sonnet AND the user-prompt tokens are below 50 (a proxy for "looks
      // simple"). If that count is meaningful (>= 5), surface the card.
      if (!routingEnabled) {
        // Cheap proxy for "expensive model": rows where total cost / total
        // tokens (effective per-Mtok rate) > $2/Mtok. We don't import pricing
        // here — derive the rate from the row itself.
        const expensiveSimple = rows.filter((r) => {
          const userTokens = r.userPromptTokens ?? r.inputTokens
          if (userTokens > 50) return false
          if (r.totalTokens === 0) return false
          const effectiveRate = (r.estimatedCostUsd / r.totalTokens) * 1_000_000
          return effectiveRate > 2
        })
        if (expensiveSimple.length >= 5) {
          const wastedCostUsd = expensiveSimple.reduce((sum, r) => sum + r.estimatedCostUsd, 0)
          // A trivial-tier model is ~5-10× cheaper than opus. Estimate savings
          // as 80% of the total cost on those simple turns (re-routed to mini).
          const estimatedSavingsUsd = wastedCostUsd * 0.8
          if (estimatedSavingsUsd > 0) {
            suggestions.push({
              id: 'enable-auto-routing',
              cardId: 'enable-auto-routing',
              title: 'Enable auto-routing',
              body: `You used premium models on ${expensiveSimple.length} simple-looking prompts this week. Auto-routing would have sent them to a cheaper tier.`,
              estimatedSavingsUsd,
              ctaLabel: 'Enable in Advanced settings',
              ctaLink: '/configure?tab=advanced',
            })
          }
        }
      }

      // ── Card 3: trim a large note ─────────────────────────────────────────
      // Reuse the bloat aggregation to find any single note attached >= 5
      // times that exceeded 4000 tok per attachment on average. We re-run a
      // streamlined version here to avoid a cross-handler call in main.
      const allSessions = (deps.loadSessions ?? loadPersistedSessions)()
        .filter((s) => (s.startedAt ?? 0) >= since)
      const sessionTokens = new Map<string, number>()
      for (const r of rows) {
        sessionTokens.set(r.sessionId, (sessionTokens.get(r.sessionId) ?? 0) + (r.notesTokens ?? 0))
      }
      const noteAggregate = new Map<string, { title: string; sessionIds: Set<string>; total: number }>()
      for (const s of allSessions) {
        const sessNoteTokens = sessionTokens.get(s.sessionId) ?? 0
        if (sessNoteTokens === 0) continue
        const uniqNotes = new Map<string, string>()
        for (const e of s.messageLog ?? []) {
          if (e.attachedNotes) {
            for (const n of e.attachedNotes) {
              if (!uniqNotes.has(n.id)) uniqNotes.set(n.id, n.title)
            }
          }
        }
        const n = uniqNotes.size
        if (n === 0) continue
        const perNote = sessNoteTokens / n
        for (const [id, title] of uniqNotes) {
          const cur = noteAggregate.get(id) ?? { title, sessionIds: new Set<string>(), total: 0 }
          cur.sessionIds.add(s.sessionId)
          cur.total += perNote
          noteAggregate.set(id, cur)
        }
      }
      for (const [id, v] of noteAggregate) {
        const sessions = v.sessionIds.size
        if (sessions < 5) continue
        const avg = v.total / sessions
        if (avg < 4000) continue
        suggestions.push({
          id: `trim-large-note:${id}`,
          cardId: 'trim-large-note',
          title: `Trim "${v.title}"`,
          body: `Attached to ${sessions} sessions × ${Math.round(avg).toLocaleString()} tok avg. Trimming this note would shrink every future attachment.`,
          // Savings = (avg - target 2000) × sessions × $3/Mtok (rough). We use
          // the user's actual per-row cost rates by aggregating the notes
          // tokens × the median per-Mtok rate across the window.
          estimatedSavingsUsd: estimateNoteTrimSavings(v.total, rows),
          ctaLabel: 'Open in Notes',
          ctaLink: `/notes?id=${encodeURIComponent(id)}`,
        })
      }

      // Sort by savings desc, then alphabetical title for stability.
      suggestions.sort((a, b) =>
        b.estimatedSavingsUsd - a.estimatedSavingsUsd
        || a.title.localeCompare(b.title))
      return suggestions
    },
  )
}

// ── Local helpers ───────────────────────────────────────────────────────────

function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  if (amount < 1) return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(2)}`
}

/**
 * Rough estimate of $ saved by trimming a note. Computes the median per-Mtok
 * rate across the window's rows and applies a 50% reduction assumption
 * (typical note has lots of fluff). Returns 0 when there aren't enough rows
 * to derive a rate — better silent than wrong.
 */
function estimateNoteTrimSavings(totalTokens: number, rows: EfficiencyCostRecord[]): number {
  if (rows.length === 0 || totalTokens === 0) return 0
  const rates = rows
    .filter((r) => r.totalTokens > 0)
    .map((r) => (r.estimatedCostUsd / r.totalTokens) * 1_000_000)
  if (rates.length === 0) return 0
  rates.sort((a, b) => a - b)
  const medianRate = rates[Math.floor(rates.length / 2)]
  // 50% trim potential, conservative.
  return (totalTokens * medianRate * 0.5) / 1_000_000
}

// Expose for tests
export const __testing__ = { formatUsd, estimateNoteTrimSavings }
// Suppress unused-warning when providerOf isn't referenced (kept for future use)
void providerOf
