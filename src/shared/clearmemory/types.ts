// ── ClearMemory REST payload types ────────────────────────────────────────────
// Shared between main-process handlers and the renderer via IPC. This module
// MUST remain dependency-free (no Node, no Electron, no React imports) so both
// tsconfig roots (`src/main` + `src/shared` via `rootDirs`, `src/renderer` +
// `src/shared` via `rootDirs`) can include it without leaking environment-
// specific globals.
//
// Mirrors the upstream ClearMemory HTTP API bound at 127.0.0.1:8080. See
// /Users/jasonhumphrey/.claude/plans/please-review-https-github-com-greenpion-partitioned-hedgehog.md

// ── Core primitives ──────────────────────────────────────────────────────────

export type ClearMemoryTier = 'offline' | 'local_llm' | 'cloud'

export type ClassificationLevel = 'public' | 'internal' | 'confidential' | 'pii'

export interface MemoryRecord {
  id: string
  /** Short model-generated summary of the verbatim content. */
  summary: string
  /** Epoch ms. */
  timestamp: number
  stream?: string
  tags?: TagSet
  /** Populated by `expand`; omitted from list responses. */
  verbatim?: string
  tokens?: number
  classification?: ClassificationLevel
  /** Relevance score, present on recall responses. */
  score?: number
}

/** Four-dimension taxonomy: team / repo / project / domain. */
export interface TagSet {
  team?: string[]
  repo?: string[]
  project?: string[]
  domain?: string[]
}

export interface Stream {
  /**
   * Legacy field — Slice A/B modelled streams as `{id, name}`. Slice D sources
   * streams from the upstream `clearmemory streams list` CLI, which only
   * identifies a stream by its name. `id` is kept optional for back-compat
   * but `name` is the real primary key.
   */
  id?: string
  name: string
  description?: string
  memoryCount?: number
  createdAt?: number
  /** Flat list of `key:value` tag strings attached to the stream. */
  tags?: string[]
  /** True iff this is the currently-switched stream. */
  active?: boolean
}

export type TagType = 'team' | 'repo' | 'project' | 'domain'

/** Tags grouped by the 4-dim taxonomy. Always present with every key so the
 * renderer can `.map` without null-checks. */
export interface TagsByType {
  team: string[]
  repo: string[]
  project: string[]
  domain: string[]
}

/** Streaming progress event for `clearmemory:import`. */
export interface ImportProgress {
  id: string
  kind: 'log' | 'progress' | 'done' | 'error'
  message: string
  percent?: number
  imported?: number
  total?: number
}

// ── /v1/health ───────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error'
  version?: string
}

// ── /v1/status ───────────────────────────────────────────────────────────────

export interface StatusResponse {
  tier: ClearMemoryTier
  memories: number
  diskBytes: number
  uptimeSeconds: number
  p95LatencyMs?: number
  httpPort: number
  mcpPort: number
  ready: boolean
}

// ── /v1/recall ───────────────────────────────────────────────────────────────

/**
 * Request shape accepted by the IPC handler. The daemon contract (per README)
 * accepts `query`, `stream`, and free-form `tags`. The handler ships a
 * simplified `tags: string[]` surface to the renderer (e.g. `"team:platform"`)
 * and translates on the way in.
 */
export interface RecallRequest {
  query: string
  stream?: string
  tags?: string[]
  limit?: number
  topK?: number
  tokenBudget?: number
}

export interface RecallResponse {
  results: MemoryRecord[]
  totalMatched?: number
  latencyMs?: number
}

// ── /v1/expand/:id ───────────────────────────────────────────────────────────

/**
 * Shape returned by `GET /v1/expand/:id`. The upstream README documents fields
 * at the top level (`id`, `content`, `tags`, `timestamp`) — we accept both that
 * and a nested `{memory: MemoryRecord}` envelope so we don't break if the
 * daemon evolves.
 */
export interface ExpandResponse {
  id: string
  content: string
  summary?: string
  tags?: TagSet | string[]
  timestamp?: number
  stream?: string
  tokens?: number
  classification?: ClassificationLevel
}

// ── /v1/retain ───────────────────────────────────────────────────────────────

export interface RetainRequest {
  content: string
  stream?: string
  tags?: string[]
  classification?: ClassificationLevel
}

export interface RetainResponse {
  id: string
  memory_id?: string
  summary?: string
  tokens?: number
  created_at?: number | string
}

// ── /v1/forget ───────────────────────────────────────────────────────────────

export interface ForgetRequest {
  id: string
  reason?: string
}

export interface ForgetResponse {
  ok?: boolean
  removed?: string
  memory_id?: string
  invalidated_at?: number | string
}

// ── /v1/streams ──────────────────────────────────────────────────────────────

export interface StreamsListResponse {
  streams: Stream[]
  active?: string
}

export interface StreamsCreateRequest {
  name: string
  description?: string
}

export interface StreamsCreateResponse {
  stream: Stream
}

export interface StreamsSwitchRequest {
  id: string
}

// ── /v1/tags ─────────────────────────────────────────────────────────────────

export interface TagsListResponse {
  tags: TagSet
}

export interface TagsMutationRequest {
  dimension: keyof TagSet
  value: string
}

// ── Reflect (MCP-only, Tier 2+) ──────────────────────────────────────────────

export interface ReflectRequest {
  query: string
  topK?: number
}

export interface ReflectResponse {
  narrative: string
  citations?: Array<{ id: string; summary: string }>
}

// ── Import / Backup / Restore (CLI-backed) ───────────────────────────────────

export type ImportFormat =
  | 'auto'
  | 'claude_code'
  | 'copilot'
  | 'chatgpt'
  | 'slack'
  | 'markdown'
  | 'clear'

export interface ImportRequest {
  path: string
  format: ImportFormat
  stream?: string
  tags?: TagSet
}

export interface ImportResponse {
  imported: number
  skipped: number
  errors?: string[]
}

export interface BackupRequest {
  destination: string
}

export interface BackupResponse {
  path: string
  sizeBytes: number
  createdAt: number
}

export interface RestoreRequest {
  path: string
}

export interface RestoreResponse {
  ok: boolean
  restored?: number
}

// ── Config (~/.clearmemory/config.toml) ──────────────────────────────────────

export interface ClearMemoryConfig {
  tier: ClearMemoryTier
  topK: number
  tokenBudget: number
  /** Optional legacy alias for retention.time_threshold_days. */
  retentionThresholdDays?: number
  /** Optional legacy alias kept for back-compat. */
  retentionMaxMemories?: number
  /** retention.time_threshold_days in config.toml */
  retentionTimeThresholdDays?: number
  /** retention.size_threshold_gb in config.toml */
  retentionSizeThresholdGb?: number
  /** retention.performance_threshold_ms in config.toml */
  retentionPerformanceThresholdMs?: number
  encryptionEnabled: boolean
}

// ── Backup / MCP (Slice E) ───────────────────────────────────────────────────

export interface BackupFile {
  name: string
  path: string
  sizeBytes: number
  modifiedAt: number
}

export interface BackupSchedule {
  enabled: boolean
  intervalMs: number
  path: string
  encrypt: boolean
  autoName: boolean
}

export interface BackupProgress {
  id: string
  kind: 'log' | 'progress' | 'done' | 'error'
  message: string
  percent?: number
}

export interface McpStatus {
  claude: boolean
  copilot: boolean
}

// ── Install / lifecycle status (local-only, not from daemon) ────────────────

export interface InstallStatus {
  binaryPresent: boolean
  binaryPath?: string
  version?: string
  platformArch: string
  error?: string
}

// ── Generic stub envelope ────────────────────────────────────────────────────
// Slice A returns these from every handler until the daemon lands in Slice B.

export interface StubEnvelope {
  ok: false
  stub: true
  message?: string
}

// ── Result envelope for CRUD handlers (Slice C) ─────────────────────────────
// Every CRUD handler returns `{ ok: true, data: T }` or
// `{ ok: false, error, state?, status?, body? }` so the renderer can switch
// on the boolean without unpacking HTTP specifics.

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: string
      /** Service state when the daemon wasn't ready (e.g. 'stopped'). */
      state?: string
      /** HTTP status from `ClearMemoryHttpError`, when applicable. */
      status?: number
      /** Parsed HTTP body from `ClearMemoryHttpError`, when applicable. */
      body?: unknown
    }
