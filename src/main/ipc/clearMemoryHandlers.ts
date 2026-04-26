import { dialog, type IpcMain, type WebContents } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { statSync, readdirSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { extname, resolve as resolvePath, basename } from 'path'
import { homedir } from 'os'
import Store from 'electron-store'
import type { ChildProcess } from 'child_process'

/** Expand leading `~` or `~/` to the user's home dir. Leaves other inputs untouched. */
function expandTilde(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return resolvePath(homedir(), p.slice(2))
  return p
}
import type {
  InstallStatus,
  RecallRequest,
  RecallResponse,
  ExpandResponse,
  RetainRequest,
  RetainResponse,
  ForgetResponse,
  StatusResponse,
  ClearMemoryConfig,
  ClearMemoryTier,
  ClassificationLevel,
  Result,
  Stream,
  TagType,
  TagsByType,
  ImportFormat,
  ImportProgress,
  BackupFile,
  BackupSchedule,
  BackupProgress,
  McpStatus,
} from '../../shared/clearmemory/types'
import {
  clearMemoryService,
  ClearMemoryHttpError,
  ClearMemoryCliError,
  type ClearMemoryState,
  type InitProgressEvent,
} from '../clearmemory/ClearMemoryService'
import { resolveClearMemoryBinary } from '../clearmemory/binaryResolver'
import {
  assertPathWithinRoots,
  getImportAllowedRoots,
  isSensitiveSystemPath,
} from '../utils/pathSecurity'
import {
  readConfigToml,
  writeConfigPatch,
  validateConfigPatch,
  getDefaultConfig,
} from '../clearmemory/configFile'
import {
  enableMcpIntegration,
  disableMcpIntegration,
  getMcpIntegrationStatus,
} from '../clearmemory/mcpIntegration'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'

const execFileAsync = promisify(execFile)

// ── ClearMemory IPC handlers ─────────────────────────────────────────────────
// Slice B wired the lifecycle channels (install-status, enable, disable,
// status, get-logs). Slice C wires the CRUD channels to the real daemon:
//   - clearmemory:recall   → POST /v1/recall
//   - clearmemory:expand   → GET  /v1/expand/:id
//   - clearmemory:retain   → POST /v1/retain
//   - clearmemory:forget   → POST /v1/forget
//
// Every CRUD handler returns a Result<T> envelope so the renderer can switch
// on `ok` instead of unpacking HTTP mechanics. When the daemon isn't ready we
// short-circuit with `{ ok: false, error, state }` rather than throwing — the
// UI must degrade gracefully rather than crash.
//
// Security: the daemon only ever binds to 127.0.0.1. These handlers never
// accept a user-supplied base URL — the channel surface is the only contract.
// IDs that flow into URL path segments (`/v1/expand/:id`) are validated AND
// URL-encoded before interpolation to prevent path-traversal / injection.

// Track whether we've wired the state-change bridge yet (idempotent so tests
// can re-register handlers without leaking listeners).
let stateBridgeWired = false

// ── Backup schedule persistence (Slice E) ────────────────────────────────────
// We own scheduling in the main process via setInterval rather than rely on
// the upstream daemon's `--scheduled --interval` flag, because that flag only
// works while a `serve` process is attached to it and can't be reconfigured
// post-facto without a restart.

interface BackupScheduleStoreSchema {
  clearmemory: {
    backupSchedule?: BackupSchedule
  }
}

const DEFAULT_SCHEDULE: BackupSchedule = {
  enabled: false,
  intervalMs: 24 * 60 * 60 * 1000, // 24h
  path: '',
  encrypt: true,
  autoName: true,
}

let backupStore: Store<BackupScheduleStoreSchema> | null = null
function getBackupStore(): Store<BackupScheduleStoreSchema> {
  if (!backupStore) {
    backupStore = new Store<BackupScheduleStoreSchema>({
      name: 'clear-path-clearmemory',
      encryptionKey: getStoreEncryptionKey(),
      defaults: { clearmemory: { backupSchedule: DEFAULT_SCHEDULE } },
    })
  }
  return backupStore
}

function loadBackupSchedule(): BackupSchedule {
  const raw = getBackupStore().get('clearmemory') ?? {}
  return { ...DEFAULT_SCHEDULE, ...(raw.backupSchedule ?? {}) }
}

function saveBackupSchedule(next: BackupSchedule): void {
  getBackupStore().set('clearmemory', { backupSchedule: next })
}

let scheduledBackupTimer: NodeJS.Timeout | null = null

function stopScheduledBackup(): void {
  if (scheduledBackupTimer) {
    clearInterval(scheduledBackupTimer)
    scheduledBackupTimer = null
  }
}

/** Kick off the scheduled-backup interval based on persisted config. */
function restartScheduledBackup(onFire: () => void): void {
  stopScheduledBackup()
  const cfg = loadBackupSchedule()
  if (!cfg.enabled || !cfg.path || cfg.intervalMs < 60_000) return
  // Clamp to a sane floor to avoid a runaway timer if someone stuffs a tiny
  // value into the store (1 minute minimum).
  const intervalMs = Math.max(60_000, cfg.intervalMs)
  scheduledBackupTimer = setInterval(onFire, intervalMs)
}

// ── Active backup/restore processes ──────────────────────────────────────────
// Keyed by correlation id so `backup-cancel` can SIGTERM the right one.
const activeBackups = new Map<string, ChildProcess>()

/**
 * Extended install-status payload. We keep the original InstallStatus shape
 * (`binaryPresent`, `binaryPath`, etc.) for renderer back-compat and add the
 * Slice B fields requested by the UI (`installed`, `source`, `path`, `error`).
 */
interface InstallStatusV2 extends InstallStatus {
  installed: boolean
  source: 'bundled' | 'path' | 'missing'
  path?: string
}

interface StatusResponseV2 extends StatusResponse {
  serviceStatus: ClearMemoryState
  binarySource: 'bundled' | 'path' | 'missing'
  /** Last N stderr lines captured from the daemon when it's crashed. */
  stderrTail?: string[]
}

const ALLOWED_CLASSIFICATIONS: ReadonlySet<ClassificationLevel> = new Set<ClassificationLevel>([
  'public',
  'internal',
  'confidential',
  'pii',
])

// ── Result helpers ───────────────────────────────────────────────────────────

function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

function err<T>(message: string, extras?: Partial<Exclude<Result<T>, { ok: true }>>): Result<T> {
  return { ok: false, error: message, ...extras }
}

function notReady<T>(): Result<T> {
  return err<T>('Clear Memory daemon is not running', { state: clearMemoryService.status })
}

function fromCaughtError<T>(caught: unknown): Result<T> {
  if (caught instanceof ClearMemoryHttpError) {
    return err<T>(caught.message, {
      status: caught.status,
      body: caught.body,
      state: clearMemoryService.status,
    })
  }
  if (caught instanceof ClearMemoryCliError) {
    return err<T>(caught.message, {
      state: clearMemoryService.status,
      body: { stdout: caught.stdout, stderr: caught.stderr, code: caught.code },
    })
  }
  const message = caught instanceof Error ? caught.message : String(caught)
  return err<T>(message, { state: clearMemoryService.status })
}

// ── Input validation ─────────────────────────────────────────────────────────

/**
 * The upstream daemon hands out arbitrary string IDs. Before we interpolate
 * one into a URL path we reject anything that could escape the /v1/expand/…
 * segment or talk to a different origin.
 */
function isSafeMemoryId(id: unknown): id is string {
  if (typeof id !== 'string') return false
  if (id.length === 0 || id.length > 256) return false
  if (id.includes('..')) return false
  if (id.includes('/') || id.includes('\\')) return false
  if (id.includes('\0')) return false
  // No whitespace or control chars.
  // eslint-disable-next-line no-control-regex
  if (/[\s\x00-\x1f\x7f]/.test(id)) return false
  return true
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed.length > 0 && trimmed.length <= 256) out.push(trimmed)
  }
  return out.length > 0 ? out : undefined
}

function normalizeClassification(value: unknown): ClassificationLevel | undefined {
  if (typeof value !== 'string') return undefined
  return ALLOWED_CLASSIFICATIONS.has(value as ClassificationLevel)
    ? (value as ClassificationLevel)
    : undefined
}

// ── Slice D validators ───────────────────────────────────────────────────────

/** Upstream accepts `[A-Za-z0-9_-]{1,64}` for stream names. Enforce same. */
const STREAM_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/
function isValidStreamName(value: unknown): value is string {
  return typeof value === 'string' && STREAM_NAME_RE.test(value)
}

const TAG_TYPES: ReadonlySet<TagType> = new Set<TagType>(['team', 'repo', 'project', 'domain'])
function isValidTagType(value: unknown): value is TagType {
  return typeof value === 'string' && TAG_TYPES.has(value as TagType)
}

/** Tag values are arbitrary strings but we clamp length and forbid control bytes. */
function isValidTagValue(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > 128) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value)) return false
  return true
}

const IMPORT_FORMATS: ReadonlySet<ImportFormat> = new Set<ImportFormat>([
  'auto', 'claude_code', 'copilot', 'chatgpt', 'slack', 'markdown', 'clear',
])
function isValidImportFormat(value: unknown): value is ImportFormat {
  return typeof value === 'string' && IMPORT_FORMATS.has(value as ImportFormat)
}

/** Track active import child processes so `clearmemory:import-cancel` can kill. */
const activeImports = new Map<string, ChildProcess>()

/** Currently-switched stream name. Updated whenever streams-switch succeeds. */
let activeStreamName: string | null = null

/**
 * Parse `streams list` output in either the `--json` form or the
 * default text table form.
 */
function parseStreamsList(stdout: string): { streams: Stream[]; parsedAsJson: boolean } {
  const trimmed = stdout.trim()
  if (!trimmed) return { streams: [], parsedAsJson: true }

  // JSON branch — try both {streams: [...]} and bare array forms.
  try {
    const parsed = JSON.parse(trimmed) as unknown
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { streams?: unknown[] }).streams))
        ? (parsed as { streams: unknown[] }).streams
        : null
    if (Array.isArray(list)) {
      const out: Stream[] = []
      for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue
        const rec = entry as Record<string, unknown>
        const name = typeof rec.name === 'string' ? rec.name
          : typeof rec.id === 'string' ? rec.id
          : null
        if (!name) continue
        const description = typeof rec.description === 'string' ? rec.description : undefined
        const tags = Array.isArray(rec.tags)
          ? rec.tags.filter((t): t is string => typeof t === 'string')
          : undefined
        out.push({ name, description, tags })
      }
      return { streams: out, parsedAsJson: true }
    }
  } catch {
    // fall through to text parsing
  }

  // Text branch — one stream per line. Accept the formats we've seen in the
  // CLI help output: "name", "name <tab> description", or a header-free table.
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out: Stream[] = []
  for (const line of lines) {
    // Skip probable headers / dividers.
    if (/^(name|stream|---|===)/i.test(line)) continue
    const parts = line.split(/\s{2,}|\t/)
    const name = parts[0]
    if (!name || !STREAM_NAME_RE.test(name)) continue
    out.push({
      name,
      description: parts.slice(1).join(' ').trim() || undefined,
    })
  }
  return { streams: out, parsedAsJson: false }
}

/**
 * Parse `streams describe <name>` output. JSON or text. Extracts description
 * and any tag-like lines.
 */
function parseStreamDescribe(stdout: string): { description?: string; tags?: string[] } {
  const trimmed = stdout.trim()
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const description = typeof parsed.description === 'string' ? parsed.description : undefined
    const tags = Array.isArray(parsed.tags)
      ? (parsed.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : undefined
    return { description, tags }
  } catch {
    // fall through
  }

  let description: string | undefined
  const tags: string[] = []
  for (const line of trimmed.split(/\r?\n/)) {
    const descMatch = line.match(/^\s*description\s*[:=]\s*(.+)$/i)
    if (descMatch) { description = descMatch[1].trim(); continue }
    const tagMatch = line.match(/^\s*(?:tag|-\s*tag)\s*[:=]?\s*([A-Za-z0-9_-]+:[^\s]+)/i)
    if (tagMatch) { tags.push(tagMatch[1]); continue }
    // Fallback: lines that look like `team: platform` inside a "Tags:" block.
    const dimMatch = line.match(/^\s*(team|repo|project|domain)\s*[:=]\s*(.+)$/i)
    if (dimMatch) { tags.push(`${dimMatch[1].toLowerCase()}:${dimMatch[2].trim()}`) }
  }
  return { description, tags: tags.length > 0 ? tags : undefined }
}

/** Parse `tags list` output into the 4-dim grouping the UI expects. */
function parseTagsList(stdout: string, filter?: TagType): TagsByType {
  const empty: TagsByType = { team: [], repo: [], project: [], domain: [] }
  const trimmed = stdout.trim()
  if (!trimmed) return empty

  // JSON branch.
  try {
    const parsed = JSON.parse(trimmed) as unknown
    // Shape 1: grouped object {team: [...], repo: [...], ...}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      const out: TagsByType = { ...empty }
      let anyMatch = false
      for (const dim of TAG_TYPES) {
        const v = obj[dim]
        if (Array.isArray(v)) {
          out[dim] = v.filter((x): x is string => typeof x === 'string')
          anyMatch = true
        }
      }
      // Shape 2 (nested under `.tags`):
      if (!anyMatch && obj.tags && typeof obj.tags === 'object') {
        const inner = obj.tags as Record<string, unknown>
        for (const dim of TAG_TYPES) {
          const v = inner[dim]
          if (Array.isArray(v)) {
            out[dim] = v.filter((x): x is string => typeof x === 'string')
            anyMatch = true
          }
        }
      }
      // Shape 3: flat array under .tags
      if (!anyMatch && Array.isArray(obj.tags)) {
        for (const raw of obj.tags as unknown[]) {
          if (typeof raw !== 'string') continue
          pushFlatTag(out, raw)
        }
        anyMatch = true
      }
      if (anyMatch) return filter ? pickDim(out, filter) : out
    }
    // Shape 4: flat array at the top level.
    if (Array.isArray(parsed)) {
      const out: TagsByType = { ...empty }
      for (const raw of parsed) {
        if (typeof raw === 'string') {
          pushFlatTag(out, raw)
        } else if (raw && typeof raw === 'object') {
          const rec = raw as Record<string, unknown>
          const t = typeof rec.type === 'string' ? rec.type : undefined
          const v = typeof rec.value === 'string' ? rec.value : undefined
          if (t && v && TAG_TYPES.has(t as TagType)) out[t as TagType].push(v)
        }
      }
      return filter ? pickDim(out, filter) : out
    }
  } catch {
    // fall through
  }

  // Text branch. Accept either "team:platform" or "- team:platform" per line.
  const out: TagsByType = { ...empty }
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s+/, '')
    if (!line) continue
    pushFlatTag(out, line)
  }
  return filter ? pickDim(out, filter) : out
}

function pushFlatTag(out: TagsByType, raw: string): void {
  const idx = raw.indexOf(':')
  if (idx < 1) return
  const dim = raw.slice(0, idx).toLowerCase()
  const value = raw.slice(idx + 1).trim()
  if (!value) return
  if (TAG_TYPES.has(dim as TagType)) {
    out[dim as TagType].push(value)
  }
}

function pickDim(all: TagsByType, filter: TagType): TagsByType {
  return {
    team: filter === 'team' ? all.team : [],
    repo: filter === 'repo' ? all.repo : [],
    project: filter === 'project' ? all.project : [],
    domain: filter === 'domain' ? all.domain : [],
  }
}

/** Parse "X/Y imported" or "N%" lines into ImportProgress fields. */
function parseImportProgressLine(line: string): Pick<ImportProgress, 'percent' | 'imported' | 'total'> {
  const result: Pick<ImportProgress, 'percent' | 'imported' | 'total'> = {}
  const pctMatch = line.match(/(\d{1,3})\s*%/)
  if (pctMatch) {
    const n = parseInt(pctMatch[1], 10)
    if (Number.isFinite(n) && n >= 0 && n <= 100) result.percent = n
  }
  const fracMatch = line.match(/(\d+)\s*\/\s*(\d+)\s*(?:imported|records|files|memories|items)?/i)
  if (fracMatch) {
    const imp = parseInt(fracMatch[1], 10)
    const tot = parseInt(fracMatch[2], 10)
    if (Number.isFinite(imp)) result.imported = imp
    if (Number.isFinite(tot)) result.total = tot
    if (result.percent == null && tot > 0) {
      result.percent = Math.max(0, Math.min(100, Math.round((imp / tot) * 100)))
    }
  }
  return result
}

export function registerClearMemoryHandlers(
  ipcMain: IpcMain,
  getWebContents?: () => WebContents | null,
): void {
  // ── Forward service events to the renderer ─────────────────────────────────
  if (!stateBridgeWired && getWebContents) {
    stateBridgeWired = true

    clearMemoryService.on('state-change', (state: ClearMemoryState) => {
      const wc = getWebContents()
      if (!wc || wc.isDestroyed()) return
      wc.send('clearmemory:state-change', { state })
    })

    clearMemoryService.on('init-progress', (payload: InitProgressEvent) => {
      const wc = getWebContents()
      if (!wc || wc.isDestroyed()) return
      wc.send('clearmemory:init-progress', payload)
    })
  }

  // ── Lifecycle / install ────────────────────────────────────────────────────

  ipcMain.handle('clearmemory:install-status', async (): Promise<InstallStatusV2> => {
    const resolved = await resolveClearMemoryBinary()
    const installed = resolved.source !== 'missing'

    let version: string | undefined
    if (installed) {
      try {
        const { stdout } = await execFileAsync(resolved.path, ['--version'], { timeout: 5_000 })
        version = stdout.trim().split(/\r?\n/)[0]
      } catch {
        // version probe is best-effort
      }
    }

    return {
      installed,
      source: resolved.source,
      path: installed ? resolved.path : undefined,
      binaryPresent: installed,
      binaryPath: installed ? resolved.path : undefined,
      version,
      platformArch: `${process.platform}-${process.arch}`,
      error: resolved.error,
    }
  })

  ipcMain.handle(
    'clearmemory:enable',
    async (_e, args?: { tier?: ClearMemoryTier }): Promise<
      { ok: true; state: ClearMemoryState } | { ok: false; error: string; state: ClearMemoryState }
    > => {
      const tier: ClearMemoryTier = args?.tier ?? 'offline'

      try {
        await clearMemoryService.ensureInitialized(tier)
        await clearMemoryService.start()

        if (clearMemoryService.status === 'missing-binary') {
          return {
            ok: false,
            error: 'clearmemory binary not found. Install with: cargo install clearmemory',
            state: clearMemoryService.status,
          }
        }

        if (clearMemoryService.status !== 'ready') {
          return {
            ok: false,
            error: `Clear Memory daemon did not reach ready state (current: ${clearMemoryService.status})`,
            state: clearMemoryService.status,
          }
        }

        // Best-effort MCP registration. NEVER fails the enable — MCP wiring
        // hiccups shouldn't break the user-facing "Enable" toggle, and the
        // Config tab exposes a Re-register button for recovery.
        try {
          const binaryPath = clearMemoryService.binaryInfo.path
          if (binaryPath) {
            const mcpResult = await enableMcpIntegration(binaryPath)
            if (!mcpResult.ok) {
              log.warn('[clearmemory:enable] MCP wiring partial: claude=%s copilot=%s errors=%s',
                String(mcpResult.claude),
                String(mcpResult.copilot),
                mcpResult.errors.join('; '))
            }
          }
        } catch (e) {
          log.warn('[clearmemory:enable] MCP wiring threw: %s', (e as Error).message)
        }

        return { ok: true, state: clearMemoryService.status }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        log.warn('[clearmemory:enable] failed: %s', msg)
        return { ok: false, error: msg, state: clearMemoryService.status }
      }
    },
  )

  ipcMain.handle('clearmemory:disable', async (): Promise<{ ok: true }> => {
    // Tear down MCP entries BEFORE the daemon stops so any CLI using them
    // sees a clean state. Best-effort — errors are logged but never thrown.
    try {
      const result = await disableMcpIntegration()
      if (!result.ok) {
        log.warn('[clearmemory:disable] MCP teardown partial: %s', result.errors.join('; '))
      }
    } catch (e) {
      log.warn('[clearmemory:disable] MCP teardown threw: %s', (e as Error).message)
    }

    await clearMemoryService.stop()
    return { ok: true }
  })

  // ── Status / health ────────────────────────────────────────────────────────

  ipcMain.handle('clearmemory:status', async (): Promise<StatusResponseV2> => {
    const { httpPort, mcpPort } = clearMemoryService.ports
    const { source } = clearMemoryService.binaryInfo
    const state = clearMemoryService.status

    const base: StatusResponseV2 = {
      tier: 'offline',
      memories: 0,
      diskBytes: 0,
      uptimeSeconds: clearMemoryService.uptimeSec,
      httpPort,
      mcpPort,
      ready: false,
      serviceStatus: state,
      binarySource: source,
    }

    if (state === 'crashed') {
      base.stderrTail = clearMemoryService.getStderrTail(20)
    }

    if (state !== 'ready') return base

    try {
      const live = await clearMemoryService.request<Partial<StatusResponse>>('GET', '/v1/status')
      return {
        ...base,
        tier: (live.tier as ClearMemoryTier) ?? base.tier,
        memories: live.memories ?? 0,
        diskBytes: live.diskBytes ?? 0,
        uptimeSeconds: live.uptimeSeconds ?? base.uptimeSeconds,
        p95LatencyMs: live.p95LatencyMs,
        httpPort: live.httpPort ?? base.httpPort,
        mcpPort: live.mcpPort ?? base.mcpPort,
        ready: live.ready ?? true,
      }
    } catch (e) {
      log.warn('[clearmemory:status] /v1/status failed: %s', (e as Error).message)
      return { ...base, ready: false }
    }
  })

  /** Return the current log ring buffer — handy for surfacing crash diagnostics. */
  ipcMain.handle('clearmemory:get-logs', async () => {
    return clearMemoryService.getLogs()
  })

  // ── CRUD (Slice C) ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'clearmemory:recall',
    async (_e, args?: Partial<RecallRequest>): Promise<Result<RecallResponse>> => {
      if (clearMemoryService.status !== 'ready') return notReady<RecallResponse>()

      const query = typeof args?.query === 'string' ? args.query : ''
      const stream = typeof args?.stream === 'string' && args.stream.trim().length > 0
        ? args.stream.trim()
        : undefined
      const tags = normalizeStringArray(args?.tags)
      // The plan uses `limit`; daemon README uses `top_k`. Send both for safety.
      const limitRaw = typeof args?.limit === 'number' && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(500, Math.floor(args.limit)))
        : undefined
      const topKRaw = typeof args?.topK === 'number' && Number.isFinite(args.topK)
        ? Math.max(1, Math.min(500, Math.floor(args.topK)))
        : undefined
      const topK = topKRaw ?? limitRaw

      const payload: Record<string, unknown> = { query }
      if (stream) payload.stream = stream
      if (tags) payload.tags = tags
      if (topK) payload.top_k = topK
      if (limitRaw) payload.limit = limitRaw

      try {
        const data = await clearMemoryService.request<RecallResponse>('POST', '/v1/recall', payload)
        // Upstream may return `{results: []}` with no totalMatched — surface
        // the length as a fallback so the UI can show a count without
        // extra branching.
        if (data && typeof data === 'object' && !('totalMatched' in data)) {
          ;(data as RecallResponse).totalMatched = (data as RecallResponse).results?.length ?? 0
        }
        return ok(data)
      } catch (caught) {
        log.warn('[clearmemory:recall] failed: %s', (caught as Error).message)
        return fromCaughtError<RecallResponse>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:expand',
    async (_e, args?: { id?: unknown }): Promise<Result<ExpandResponse>> => {
      if (!isSafeMemoryId(args?.id)) {
        return err<ExpandResponse>('Invalid memory id')
      }
      if (clearMemoryService.status !== 'ready') return notReady<ExpandResponse>()

      const safeId = encodeURIComponent(args.id as string)
      try {
        const data = await clearMemoryService.request<ExpandResponse>(
          'GET',
          `/v1/expand/${safeId}`,
        )
        return ok(data)
      } catch (caught) {
        log.warn('[clearmemory:expand] failed: %s', (caught as Error).message)
        return fromCaughtError<ExpandResponse>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:retain',
    async (_e, args?: Partial<RetainRequest>): Promise<Result<RetainResponse>> => {
      const content = typeof args?.content === 'string' ? args.content.trim() : ''
      if (content.length < 2) {
        return err<RetainResponse>('Memory content must be at least 2 characters')
      }
      if (content.length > 1_000_000) {
        return err<RetainResponse>('Memory content exceeds maximum length (1 MB)')
      }
      if (clearMemoryService.status !== 'ready') return notReady<RetainResponse>()

      const tags = normalizeStringArray(args?.tags)
      const classification = normalizeClassification(args?.classification)
      const stream = typeof args?.stream === 'string' && args.stream.trim().length > 0
        ? args.stream.trim()
        : undefined

      const payload: Record<string, unknown> = { content }
      if (tags) payload.tags = tags
      if (classification) payload.classification = classification
      if (stream) payload.stream = stream

      try {
        const data = await clearMemoryService.request<RetainResponse>('POST', '/v1/retain', payload)
        // Upstream README uses `memory_id` in some examples and `id` in others.
        // Normalize so the renderer can always read `.id`.
        const normalized: RetainResponse = { ...data, id: data.id ?? data.memory_id ?? '' }
        return ok(normalized)
      } catch (caught) {
        log.warn('[clearmemory:retain] failed: %s', (caught as Error).message)
        return fromCaughtError<RetainResponse>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:forget',
    async (
      _e,
      args?: { id?: unknown; reason?: unknown },
    ): Promise<Result<ForgetResponse>> => {
      if (!isSafeMemoryId(args?.id)) {
        return err<ForgetResponse>('Invalid memory id')
      }
      if (clearMemoryService.status !== 'ready') return notReady<ForgetResponse>()

      const reason = typeof args?.reason === 'string' && args.reason.trim().length > 0
        ? args.reason.trim().slice(0, 2_000)
        : undefined

      const payload: Record<string, unknown> = { memory_id: args.id as string }
      if (reason) payload.reason = reason

      try {
        const data = await clearMemoryService.request<ForgetResponse>(
          'POST',
          '/v1/forget',
          payload,
        )
        return ok(data)
      } catch (caught) {
        log.warn('[clearmemory:forget] failed: %s', (caught as Error).message)
        return fromCaughtError<ForgetResponse>(caught)
      }
    },
  )

  // ── Streams (Slice D) ──────────────────────────────────────────────────────

  ipcMain.handle(
    'clearmemory:streams-list',
    async (): Promise<Result<{ streams: Stream[]; active?: string }>> => {
      if (clearMemoryService.status !== 'ready') return notReady()

      try {
        // Try --json first, fall back to text.
        let streams: Stream[]
        let parsedAsJson = false
        try {
          const { stdout } = await clearMemoryService.execCli(['streams', 'list'], { json: true })
          ;({ streams, parsedAsJson } = parseStreamsList(stdout))
        } catch (jsonErr) {
          log.warn('[clearmemory:streams-list] --json failed, falling back: %s', (jsonErr as Error).message)
          const { stdout } = await clearMemoryService.execCli(['streams', 'list'])
          ;({ streams, parsedAsJson } = parseStreamsList(stdout))
        }

        // Best-effort enrich with descriptions for streams missing one. Cap at
        // 20 entries so a large list doesn't fan out into N+1 calls.
        const needsDescribe = streams.filter((s) => !s.description).slice(0, 20)
        if (needsDescribe.length > 0) {
          await Promise.all(needsDescribe.map(async (s) => {
            try {
              const { stdout } = await clearMemoryService.execCli(
                ['streams', 'describe', s.name],
                { json: true, timeoutMs: 5_000 },
              )
              const parsed = parseStreamDescribe(stdout)
              if (parsed.description) s.description = parsed.description
              if (!s.tags && parsed.tags) s.tags = parsed.tags
            } catch {
              // describe is best-effort
            }
          }))
        }

        // Mark the active stream if we've tracked a switch in this session.
        if (activeStreamName) {
          for (const s of streams) s.active = s.name === activeStreamName
        }

        log.info('[clearmemory:streams-list] %d streams (json=%s)', streams.length, String(parsedAsJson))
        return ok({ streams, active: activeStreamName ?? undefined })
      } catch (caught) {
        log.warn('[clearmemory:streams-list] failed: %s', (caught as Error).message)
        return fromCaughtError<{ streams: Stream[]; active?: string }>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:streams-describe',
    async (
      _e,
      args?: { name?: unknown },
    ): Promise<Result<{ name: string; description?: string; tags?: string[] }>> => {
      if (!isValidStreamName(args?.name)) {
        return err<{ name: string; description?: string; tags?: string[] }>('Invalid stream name')
      }
      if (clearMemoryService.status !== 'ready') return notReady()

      try {
        let parsed: { description?: string; tags?: string[] }
        try {
          const { stdout } = await clearMemoryService.execCli(
            ['streams', 'describe', args.name as string],
            { json: true },
          )
          parsed = parseStreamDescribe(stdout)
        } catch {
          const { stdout } = await clearMemoryService.execCli(
            ['streams', 'describe', args.name as string],
          )
          parsed = parseStreamDescribe(stdout)
        }
        return ok({ name: args.name as string, ...parsed })
      } catch (caught) {
        log.warn('[clearmemory:streams-describe] failed: %s', (caught as Error).message)
        return fromCaughtError<{ name: string; description?: string; tags?: string[] }>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:streams-create',
    async (
      _e,
      args?: { name?: unknown; description?: unknown; tags?: unknown },
    ): Promise<Result<Stream>> => {
      if (!isValidStreamName(args?.name)) {
        return err<Stream>('Invalid stream name (1-64 chars, alphanumeric, _ or -)')
      }
      if (clearMemoryService.status !== 'ready') return notReady()

      const description = typeof args?.description === 'string' && args.description.trim().length > 0
        ? args.description.trim().slice(0, 500)
        : undefined
      const tags = normalizeStringArray(args?.tags) ?? []

      const cliArgs = ['streams', 'create', args.name as string]
      if (description) cliArgs.push('--description', description)
      for (const t of tags) cliArgs.push('--tag', t)

      try {
        await clearMemoryService.execCli(cliArgs)
        return ok<Stream>({ name: args.name as string, description, tags })
      } catch (caught) {
        log.warn('[clearmemory:streams-create] failed: %s', (caught as Error).message)
        return fromCaughtError<Stream>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:streams-switch',
    async (
      _e,
      args?: { name?: unknown },
    ): Promise<Result<{ name: string }>> => {
      if (!isValidStreamName(args?.name)) {
        return err<{ name: string }>('Invalid stream name')
      }
      if (clearMemoryService.status !== 'ready') return notReady()

      try {
        await clearMemoryService.execCli(['streams', 'switch', args.name as string])
        activeStreamName = args.name as string
        return ok({ name: args.name as string })
      } catch (caught) {
        log.warn('[clearmemory:streams-switch] failed: %s', (caught as Error).message)
        return fromCaughtError<{ name: string }>(caught)
      }
    },
  )

  // ── Tags (Slice D) ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'clearmemory:tags-list',
    async (
      _e,
      args?: { type?: unknown },
    ): Promise<Result<TagsByType>> => {
      if (clearMemoryService.status !== 'ready') return notReady()

      const filter = isValidTagType(args?.type) ? args!.type as TagType : undefined
      const cliArgs = ['tags', 'list']
      if (filter) cliArgs.push('--type', filter)

      try {
        let data: TagsByType
        try {
          const { stdout } = await clearMemoryService.execCli(cliArgs, { json: true })
          data = parseTagsList(stdout, filter)
        } catch (jsonErr) {
          log.warn('[clearmemory:tags-list] --json failed, falling back: %s', (jsonErr as Error).message)
          const { stdout } = await clearMemoryService.execCli(cliArgs)
          data = parseTagsList(stdout, filter)
        }
        return ok(data)
      } catch (caught) {
        log.warn('[clearmemory:tags-list] failed: %s', (caught as Error).message)
        return fromCaughtError<TagsByType>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:tags-add',
    async (
      _e,
      args?: { type?: unknown; value?: unknown },
    ): Promise<Result<{ type: TagType; value: string }>> => {
      if (!isValidTagType(args?.type)) return err<{ type: TagType; value: string }>('Invalid tag type')
      if (!isValidTagValue(args?.value)) return err<{ type: TagType; value: string }>('Invalid tag value')
      if (clearMemoryService.status !== 'ready') return notReady()

      try {
        await clearMemoryService.execCli([
          'tags', 'add',
          '--type', args.type as string,
          '--value', args.value as string,
        ])
        return ok({ type: args.type as TagType, value: args.value as string })
      } catch (caught) {
        log.warn('[clearmemory:tags-add] failed: %s', (caught as Error).message)
        return fromCaughtError<{ type: TagType; value: string }>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:tags-remove',
    async (
      _e,
      args?: { type?: unknown; value?: unknown },
    ): Promise<Result<{ type: TagType; value: string }>> => {
      if (!isValidTagType(args?.type)) return err<{ type: TagType; value: string }>('Invalid tag type')
      if (!isValidTagValue(args?.value)) return err<{ type: TagType; value: string }>('Invalid tag value')
      if (clearMemoryService.status !== 'ready') return notReady()

      try {
        await clearMemoryService.execCli([
          'tags', 'remove',
          '--type', args.type as string,
          '--value', args.value as string,
        ])
        return ok({ type: args.type as TagType, value: args.value as string })
      } catch (caught) {
        log.warn('[clearmemory:tags-remove] failed: %s', (caught as Error).message)
        return fromCaughtError<{ type: TagType; value: string }>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:tags-rename',
    async (
      _e,
      args?: { type?: unknown; oldValue?: unknown; newValue?: unknown },
    ): Promise<Result<{ type: TagType; oldValue: string; newValue: string }>> => {
      type R = { type: TagType; oldValue: string; newValue: string }
      if (!isValidTagType(args?.type)) return err<R>('Invalid tag type')
      if (!isValidTagValue(args?.oldValue)) return err<R>('Invalid old value')
      if (!isValidTagValue(args?.newValue)) return err<R>('Invalid new value')
      if (clearMemoryService.status !== 'ready') return notReady<R>()

      try {
        await clearMemoryService.execCli([
          'tags', 'rename',
          '--type', args.type as string,
          '--old', args.oldValue as string,
          '--new', args.newValue as string,
        ])
        return ok({
          type: args.type as TagType,
          oldValue: args.oldValue as string,
          newValue: args.newValue as string,
        })
      } catch (caught) {
        log.warn('[clearmemory:tags-rename] failed: %s', (caught as Error).message)
        return fromCaughtError<R>(caught)
      }
    },
  )

  // ── Reflect (Tier 2+) ──────────────────────────────────────────────────────
  //
  // Upstream behaviour at the time of this slice: the `reflect` subcommand
  // checks the configured tier and prints "Reflect requires Tier 2 or higher."
  // for offline installs. On Tier 2+ it currently prints a placeholder
  // "Reflect: <query>" — full synthesis is in active development upstream.
  // We surface whatever the CLI gives us and let the UI present the
  // "still maturing" note.

  ipcMain.handle(
    'clearmemory:reflect',
    async (
      _e,
      args?: { query?: unknown; stream?: unknown },
    ): Promise<Result<{ output: string }>> => {
      type R = { output: string }
      if (clearMemoryService.status !== 'ready') return notReady<R>()

      const query = typeof args?.query === 'string' ? args.query.trim() : ''
      if (query.length < 1 || query.length > 1_000) {
        return err<R>('Query must be 1-1000 characters')
      }
      if (args?.stream != null && !isValidStreamName(args.stream)) {
        return err<R>('Invalid stream name')
      }

      const cliArgs = ['reflect', query]
      if (typeof args?.stream === 'string') cliArgs.push('--stream', args.stream)

      try {
        const { stdout, stderr } = await clearMemoryService.execCli(cliArgs, {
          timeoutMs: 60_000,
        })
        const output = (stdout || stderr || '').trim()
        return ok({ output })
      } catch (caught) {
        log.warn('[clearmemory:reflect] failed: %s', (caught as Error).message)
        return fromCaughtError<R>(caught)
      }
    },
  )

  // ── Import (Slice D — streaming) ───────────────────────────────────────────

  /** Open a native file/dir picker. Returns the chosen absolute path. */
  ipcMain.handle(
    'clearmemory:pick-import-path',
    async (
      _e,
      args?: { mode?: 'file' | 'directory' },
    ): Promise<Result<{ path: string }>> => {
      const mode = args?.mode === 'directory' ? 'directory' : args?.mode === 'file' ? 'file' : undefined
      const properties: Array<'openFile' | 'openDirectory'> = mode === 'directory'
        ? ['openDirectory']
        : mode === 'file'
          ? ['openFile']
          : ['openFile', 'openDirectory']
      try {
        const result = await dialog.showOpenDialog({ properties })
        if (result.canceled || result.filePaths.length === 0) {
          return err<{ path: string }>('Cancelled')
        }
        return ok({ path: result.filePaths[0] })
      } catch (caught) {
        return fromCaughtError<{ path: string }>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:import-preview',
    async (
      _e,
      args?: { path?: unknown },
    ): Promise<Result<{ path: string; isDirectory: boolean; fileCount: number; sizeBytes: number; mdCount: number }>> => {
      type R = { path: string; isDirectory: boolean; fileCount: number; sizeBytes: number; mdCount: number }
      if (typeof args?.path !== 'string' || args.path.length === 0) {
        return err<R>('Path is required')
      }
      const expanded = expandTilde(args.path)
      // Path safety.
      try {
        if (isSensitiveSystemPath(expanded)) {
          return err<R>('Path not allowed (sensitive system location)')
        }
        assertPathWithinRoots(expanded, getImportAllowedRoots())
      } catch (pathErr) {
        return err<R>((pathErr as Error).message)
      }

      try {
        const resolved = resolvePath(expanded)
        const stat = statSync(resolved)
        if (stat.isFile()) {
          return ok<R>({
            path: resolved,
            isDirectory: false,
            fileCount: 1,
            sizeBytes: stat.size,
            mdCount: extname(resolved).toLowerCase() === '.md' ? 1 : 0,
          })
        }
        if (stat.isDirectory()) {
          // Shallow scan — deep recursion would be slow for large trees.
          const entries = readdirSync(resolved, { withFileTypes: true })
          let fileCount = 0
          let sizeBytes = 0
          let mdCount = 0
          for (const e of entries) {
            if (!e.isFile()) continue
            fileCount += 1
            if (extname(e.name).toLowerCase() === '.md') mdCount += 1
            try {
              const s = statSync(resolvePath(resolved, e.name))
              sizeBytes += s.size
            } catch { /* ignore */ }
          }
          return ok<R>({ path: resolved, isDirectory: true, fileCount, sizeBytes, mdCount })
        }
        return err<R>('Path is neither a file nor a directory')
      } catch (caught) {
        return fromCaughtError<R>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:import',
    async (
      _e,
      args?: { path?: unknown; format?: unknown; stream?: unknown; autoTag?: unknown },
    ): Promise<Result<{ id: string }>> => {
      type R = { id: string }

      if (clearMemoryService.status !== 'ready') return notReady<R>()

      if (typeof args?.path !== 'string' || args.path.length === 0) {
        return err<R>('Import path is required')
      }
      if (!isValidImportFormat(args?.format)) {
        return err<R>('Invalid import format')
      }
      if (args?.stream != null && !isValidStreamName(args.stream)) {
        return err<R>('Invalid stream name')
      }

      // Path safety.
      const expanded = expandTilde(args.path)
      let resolvedPath: string
      try {
        if (isSensitiveSystemPath(expanded)) {
          return err<R>('Path not allowed (sensitive system location)')
        }
        resolvedPath = assertPathWithinRoots(expanded, getImportAllowedRoots())
      } catch (pathErr) {
        return err<R>((pathErr as Error).message)
      }

      const cliArgs = ['import', resolvedPath, '--format', args.format as string]
      if (typeof args.stream === 'string') cliArgs.push('--stream', args.stream)
      if (args.autoTag === true) cliArgs.push('--auto-tag')

      const id = randomUUID()

      const emit = (payload: ImportProgress): void => {
        const w = getWebContents?.()
        if (!w || w.isDestroyed()) return
        w.send('clearmemory:import-progress', payload)
      }

      let child: ChildProcess
      try {
        child = clearMemoryService.spawnCli(cliArgs)
      } catch (caught) {
        return fromCaughtError<R>(caught)
      }

      activeImports.set(id, child)

      const onLine = (kind: 'log' | 'progress' | 'error') => (chunk: Buffer) => {
        const text = chunk.toString()
        for (const raw of text.split(/\r?\n/)) {
          const line = raw.trim()
          if (!line) continue
          const metrics = parseImportProgressLine(line)
          const isProgress = metrics.percent != null || metrics.imported != null
          const evtKind: ImportProgress['kind'] = isProgress
            ? 'progress'
            : kind
          emit({ id, kind: evtKind, message: line, ...metrics })
        }
      }
      child.stdout?.on('data', onLine('log'))
      child.stderr?.on('data', onLine('error'))

      child.on('exit', (code, signal) => {
        activeImports.delete(id)
        if (code === 0) {
          emit({ id, kind: 'done', message: 'Import complete', percent: 100 })
        } else if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          emit({ id, kind: 'error', message: `Import cancelled (${signal})` })
        } else {
          emit({ id, kind: 'error', message: `Import exited with code ${code}` })
        }
      })

      child.on('error', (err) => {
        activeImports.delete(id)
        emit({ id, kind: 'error', message: err.message })
      })

      // Spawn confirmation so the renderer can subscribe to progress by id.
      emit({ id, kind: 'log', message: `Starting import (${args.format})…` })
      return ok({ id })
    },
  )

  ipcMain.handle(
    'clearmemory:import-cancel',
    async (
      _e,
      args?: { id?: unknown },
    ): Promise<Result<{ cancelled: boolean }>> => {
      if (typeof args?.id !== 'string' || args.id.length === 0) {
        return err<{ cancelled: boolean }>('Missing import id')
      }
      const child = activeImports.get(args.id)
      if (!child) return ok({ cancelled: false })
      try {
        child.kill('SIGTERM')
        return ok({ cancelled: true })
      } catch (caught) {
        return fromCaughtError<{ cancelled: boolean }>(caught)
      }
    },
  )

  // ── Backup / Restore (Slice E) ─────────────────────────────────────────────

  /** Open a native folder picker for choosing where backups land. */
  ipcMain.handle(
    'clearmemory:pick-backup-path',
    async (): Promise<Result<{ path: string }>> => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
        })
        if (result.canceled || result.filePaths.length === 0) {
          return err<{ path: string }>('Cancelled')
        }
        return ok({ path: result.filePaths[0] })
      } catch (caught) {
        return fromCaughtError<{ path: string }>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:list-backups',
    async (_e, args?: { path?: unknown }): Promise<Result<BackupFile[]>> => {
      if (typeof args?.path !== 'string' || args.path.length === 0) {
        return err<BackupFile[]>('Path is required')
      }
      const expanded = expandTilde(args.path)
      let root: string
      try {
        if (isSensitiveSystemPath(expanded)) {
          return err<BackupFile[]>('Path not allowed (sensitive system location)')
        }
        root = assertPathWithinRoots(expanded, getImportAllowedRoots())
      } catch (pathErr) {
        return err<BackupFile[]>((pathErr as Error).message)
      }

      try {
        if (!existsSync(root)) return ok<BackupFile[]>([])
        const entries = readdirSync(root, { withFileTypes: true })
        const out: BackupFile[] = []
        for (const e of entries) {
          if (!e.isFile()) continue
          if (extname(e.name).toLowerCase() !== '.cmb') continue
          const full = resolvePath(root, e.name)
          try {
            const s = statSync(full)
            out.push({
              name: e.name,
              path: full,
              sizeBytes: s.size,
              modifiedAt: s.mtimeMs,
            })
          } catch { /* ignore */ }
        }
        out.sort((a, b) => b.modifiedAt - a.modifiedAt)
        return ok(out)
      } catch (caught) {
        return fromCaughtError<BackupFile[]>(caught)
      }
    },
  )

  /**
   * Run `clearmemory backup <path> [--auto-name] [--no-encrypt]`. Progress
   * events stream to the renderer via `clearmemory:backup-progress`.
   */
  ipcMain.handle(
    'clearmemory:backup-now',
    async (
      _e,
      args?: { path?: unknown; autoName?: unknown; encrypt?: unknown },
    ): Promise<Result<{ id: string }>> => {
      type R = { id: string }
      if (clearMemoryService.status !== 'ready') return notReady<R>()

      if (typeof args?.path !== 'string' || args.path.length === 0) {
        return err<R>('Backup path is required')
      }
      const expanded = expandTilde(args.path)
      let resolvedPath: string
      try {
        if (isSensitiveSystemPath(expanded)) {
          return err<R>('Path not allowed (sensitive system location)')
        }
        resolvedPath = assertPathWithinRoots(expanded, getImportAllowedRoots())
      } catch (pathErr) {
        return err<R>((pathErr as Error).message)
      }

      const autoName = args?.autoName !== false
      const encrypt = args?.encrypt !== false

      const cliArgs = ['backup', resolvedPath]
      if (autoName) cliArgs.push('--auto-name')
      if (!encrypt) cliArgs.push('--no-encrypt')

      const id = randomUUID()
      const emit = (payload: BackupProgress): void => {
        const w = getWebContents?.()
        if (!w || w.isDestroyed()) return
        w.send('clearmemory:backup-progress', payload)
      }

      let child: ChildProcess
      try {
        child = clearMemoryService.spawnCli(cliArgs)
      } catch (caught) {
        return fromCaughtError<R>(caught)
      }

      activeBackups.set(id, child)

      const onLine = (kind: 'log' | 'error') => (chunk: Buffer): void => {
        const text = chunk.toString()
        for (const raw of text.split(/\r?\n/)) {
          const line = raw.trim()
          if (!line) continue
          const metrics = parseImportProgressLine(line)
          const isProgress = metrics.percent != null
          const evtKind: BackupProgress['kind'] = isProgress ? 'progress' : kind
          const payload: BackupProgress = { id, kind: evtKind, message: line }
          if (metrics.percent != null) payload.percent = metrics.percent
          emit(payload)
        }
      }
      child.stdout?.on('data', onLine('log'))
      child.stderr?.on('data', onLine('error'))

      child.on('exit', (code, signal) => {
        activeBackups.delete(id)
        if (code === 0) {
          emit({ id, kind: 'done', message: 'Backup complete', percent: 100 })
        } else if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          emit({ id, kind: 'error', message: `Backup cancelled (${signal})` })
        } else {
          emit({ id, kind: 'error', message: `Backup exited with code ${code}` })
        }
      })

      child.on('error', (e) => {
        activeBackups.delete(id)
        emit({ id, kind: 'error', message: e.message })
      })

      emit({ id, kind: 'log', message: `Starting backup to ${resolvedPath}…` })
      return ok({ id })
    },
  )

  ipcMain.handle(
    'clearmemory:restore-now',
    async (
      _e,
      args?: { path?: unknown; verify?: unknown },
    ): Promise<Result<{ id: string }>> => {
      type R = { id: string }
      if (clearMemoryService.status !== 'ready') return notReady<R>()

      if (typeof args?.path !== 'string' || args.path.length === 0) {
        return err<R>('Backup path is required')
      }
      if (!args.path.toLowerCase().endsWith('.cmb')) {
        return err<R>('Restore file must be a .cmb bundle')
      }
      const expanded = expandTilde(args.path)
      let resolvedPath: string
      try {
        if (isSensitiveSystemPath(expanded)) {
          return err<R>('Path not allowed (sensitive system location)')
        }
        resolvedPath = assertPathWithinRoots(expanded, getImportAllowedRoots())
      } catch (pathErr) {
        return err<R>((pathErr as Error).message)
      }
      if (!existsSync(resolvedPath)) {
        return err<R>(`Backup file not found: ${resolvedPath}`)
      }

      const verify = args?.verify === true

      const cliArgs = ['restore', resolvedPath]
      if (verify) cliArgs.push('--verify')

      const id = randomUUID()
      const emit = (payload: BackupProgress): void => {
        const w = getWebContents?.()
        if (!w || w.isDestroyed()) return
        w.send('clearmemory:backup-progress', payload)
      }

      let child: ChildProcess
      try {
        child = clearMemoryService.spawnCli(cliArgs)
      } catch (caught) {
        return fromCaughtError<R>(caught)
      }

      activeBackups.set(id, child)

      const onLine = (kind: 'log' | 'error') => (chunk: Buffer): void => {
        const text = chunk.toString()
        for (const raw of text.split(/\r?\n/)) {
          const line = raw.trim()
          if (!line) continue
          const metrics = parseImportProgressLine(line)
          const isProgress = metrics.percent != null
          const evtKind: BackupProgress['kind'] = isProgress ? 'progress' : kind
          const payload: BackupProgress = { id, kind: evtKind, message: line }
          if (metrics.percent != null) payload.percent = metrics.percent
          emit(payload)
        }
      }
      child.stdout?.on('data', onLine('log'))
      child.stderr?.on('data', onLine('error'))

      child.on('exit', async (code, signal) => {
        activeBackups.delete(id)
        if (code === 0) {
          emit({ id, kind: 'log', message: 'Restore complete — restarting daemon…' })
          try {
            await clearMemoryService.stop()
            await clearMemoryService.start()
            emit({ id, kind: 'done', message: 'Restore complete. Daemon restarted.', percent: 100 })
          } catch (e) {
            emit({
              id, kind: 'error',
              message: `Restore completed but daemon restart failed: ${(e as Error).message}`,
            })
          }
        } else if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          emit({ id, kind: 'error', message: `Restore cancelled (${signal})` })
        } else {
          emit({ id, kind: 'error', message: `Restore exited with code ${code}` })
        }
      })

      child.on('error', (e) => {
        activeBackups.delete(id)
        emit({ id, kind: 'error', message: e.message })
      })

      emit({ id, kind: 'log', message: `Starting restore from ${basename(resolvedPath)}…` })
      return ok({ id })
    },
  )

  ipcMain.handle(
    'clearmemory:backup-cancel',
    async (
      _e,
      args?: { id?: unknown },
    ): Promise<Result<{ cancelled: boolean }>> => {
      if (typeof args?.id !== 'string' || args.id.length === 0) {
        return err<{ cancelled: boolean }>('Missing backup id')
      }
      const child = activeBackups.get(args.id)
      if (!child) return ok({ cancelled: false })
      try {
        child.kill('SIGTERM')
        return ok({ cancelled: true })
      } catch (caught) {
        return fromCaughtError<{ cancelled: boolean }>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:backup-schedule-get',
    async (): Promise<Result<BackupSchedule>> => {
      return ok(loadBackupSchedule())
    },
  )

  ipcMain.handle(
    'clearmemory:backup-schedule-set',
    async (_e, args?: Partial<BackupSchedule>): Promise<Result<BackupSchedule>> => {
      const current = loadBackupSchedule()
      const next: BackupSchedule = { ...current, ...(args ?? {}) }

      // Shallow validation — UI owns the richer form checks.
      if (typeof next.enabled !== 'boolean') next.enabled = false
      if (typeof next.intervalMs !== 'number' || !Number.isFinite(next.intervalMs) || next.intervalMs < 60_000) {
        next.intervalMs = DEFAULT_SCHEDULE.intervalMs
      }
      if (typeof next.path !== 'string') next.path = ''
      if (typeof next.encrypt !== 'boolean') next.encrypt = true
      if (typeof next.autoName !== 'boolean') next.autoName = true

      saveBackupSchedule(next)

      // Re-arm the interval.
      restartScheduledBackup(() => {
        void runScheduledBackup()
      })

      return ok(next)
    },
  )

  // ── Config ─────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'clearmemory:config-get',
    async (): Promise<Result<ClearMemoryConfig>> => {
      // Prefer the live JSON from the CLI if the binary is available; fall
      // back to reading the file directly. Both paths converge on the same
      // ClearMemoryConfig shape.
      try {
        const { config } = await readConfigToml()

        // Best-effort enrichment via `clearmemory --json config show` — if
        // this succeeds we trust its values over the disk scan, since the
        // daemon might have in-memory overrides we can't see.
        if (clearMemoryService.binaryInfo.path) {
          try {
            const { stdout } = await clearMemoryService.execCli(['config', 'show'], {
              json: true,
              timeoutMs: 5_000,
            })
            const enriched = mergeCliConfigJson(config, stdout)
            return ok(enriched)
          } catch (e) {
            log.warn('[clearmemory:config-get] `config show --json` failed, using file: %s', (e as Error).message)
          }
        }

        return ok(config)
      } catch (caught) {
        log.warn('[clearmemory:config-get] failed: %s', (caught as Error).message)
        // Absolute last-resort — hand back defaults so the UI can still render.
        return ok(getDefaultConfig())
      }
    },
  )

  ipcMain.handle(
    'clearmemory:config-set',
    async (
      _e,
      args?: { patch?: Partial<ClearMemoryConfig> },
    ): Promise<Result<ClearMemoryConfig>> => {
      const patch = args?.patch
      if (!patch || typeof patch !== 'object') {
        return err<ClearMemoryConfig>('Missing config patch')
      }

      const validation = validateConfigPatch(patch)
      if (!validation.ok) {
        return err<ClearMemoryConfig>(validation.error)
      }

      try {
        const merged = await writeConfigPatch(patch)

        // Restart the daemon so the new config takes effect. Best-effort — we
        // don't unwind the file write if restart fails; the user can retry
        // from the Status tab.
        try {
          await clearMemoryService.stop()
          await clearMemoryService.start()
        } catch (e) {
          log.warn('[clearmemory:config-set] daemon restart failed: %s', (e as Error).message)
        }

        return ok(merged)
      } catch (caught) {
        log.warn('[clearmemory:config-set] failed: %s', (caught as Error).message)
        return fromCaughtError<ClearMemoryConfig>(caught)
      }
    },
  )

  // ── MCP integration ────────────────────────────────────────────────────────

  ipcMain.handle(
    'clearmemory:mcp-status',
    async (): Promise<Result<McpStatus>> => {
      try {
        const status = getMcpIntegrationStatus()
        return ok(status)
      } catch (caught) {
        return fromCaughtError<McpStatus>(caught)
      }
    },
  )

  ipcMain.handle(
    'clearmemory:mcp-repair',
    async (): Promise<Result<McpStatus>> => {
      const binaryPath = clearMemoryService.binaryInfo.path
        || (await resolveClearMemoryBinary()).path
      if (!binaryPath) {
        return err<McpStatus>('ClearMemory binary path not resolved')
      }
      try {
        const result = await enableMcpIntegration(binaryPath)
        return ok({ claude: result.claude, copilot: result.copilot })
      } catch (caught) {
        return fromCaughtError<McpStatus>(caught)
      }
    },
  )

  // ── Arm the scheduled backup interval on first handler registration ────────
  // (Idempotent; safe to re-run on hot-reload in tests.)
  restartScheduledBackup(() => {
    void runScheduledBackup()
  })
}

// ── Helpers that are registered-handler-adjacent but shared ──────────────────

/**
 * Fire a scheduled backup run. Silent — never surfaces progress to the
 * renderer (the UI owns interactive backup runs). Logs errors to the log
 * ring so users can inspect them in the Status tab.
 */
async function runScheduledBackup(): Promise<void> {
  const cfg = loadBackupSchedule()
  if (!cfg.enabled || !cfg.path) return
  if (clearMemoryService.status !== 'ready') {
    log.info('[clearmemory:scheduled-backup] skipping — daemon not ready')
    return
  }

  const expanded = (cfg.path.startsWith('~/') || cfg.path === '~')
    ? (cfg.path === '~' ? homedir() : resolvePath(homedir(), cfg.path.slice(2)))
    : cfg.path
  let resolved: string
  try {
    if (isSensitiveSystemPath(expanded)) {
      log.warn('[clearmemory:scheduled-backup] path rejected (sensitive): %s', expanded)
      return
    }
    resolved = assertPathWithinRoots(expanded, getImportAllowedRoots())
  } catch (e) {
    log.warn('[clearmemory:scheduled-backup] path rejected: %s', (e as Error).message)
    return
  }

  const cliArgs = ['backup', resolved]
  if (cfg.autoName) cliArgs.push('--auto-name')
  if (!cfg.encrypt) cliArgs.push('--no-encrypt')

  try {
    await clearMemoryService.execCli(cliArgs, { timeoutMs: 10 * 60 * 1000 })
    log.info('[clearmemory:scheduled-backup] completed → %s', resolved)
  } catch (e) {
    log.warn('[clearmemory:scheduled-backup] failed: %s', (e as Error).message)
  }
}

/** Merge `clearmemory --json config show` output onto a ClearMemoryConfig. */
function mergeCliConfigJson(base: ClearMemoryConfig, stdout: string): ClearMemoryConfig {
  const trimmed = stdout.trim()
  if (!trimmed) return base
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const out: ClearMemoryConfig = { ...base }

    // Accept both flat (e.g. `tier`) and sectioned (`general.tier`) shapes.
    const sectioned = parsed as {
      general?: Record<string, unknown>
      retrieval?: Record<string, unknown>
      retention?: Record<string, unknown>
      encryption?: Record<string, unknown>
    }
    const general = sectioned.general ?? parsed
    const retrieval = sectioned.retrieval ?? parsed
    const retention = sectioned.retention ?? parsed
    const encryption = sectioned.encryption ?? parsed

    const tier = (general as { tier?: unknown }).tier
    if (tier === 'offline' || tier === 'local_llm' || tier === 'cloud') out.tier = tier

    const topK = (retrieval as { top_k?: unknown }).top_k
    if (typeof topK === 'number' && Number.isFinite(topK)) out.topK = topK

    const tb = (retrieval as { token_budget?: unknown }).token_budget
    if (typeof tb === 'number' && Number.isFinite(tb)) out.tokenBudget = tb

    const td = (retention as { time_threshold_days?: unknown }).time_threshold_days
    if (typeof td === 'number' && Number.isFinite(td)) out.retentionTimeThresholdDays = td

    const sg = (retention as { size_threshold_gb?: unknown }).size_threshold_gb
    if (typeof sg === 'number' && Number.isFinite(sg)) out.retentionSizeThresholdGb = sg

    const pm = (retention as { performance_threshold_ms?: unknown }).performance_threshold_ms
    if (typeof pm === 'number' && Number.isFinite(pm)) out.retentionPerformanceThresholdMs = pm

    const enc = (encryption as { enabled?: unknown }).enabled
    if (typeof enc === 'boolean') out.encryptionEnabled = enc

    return out
  } catch {
    return base
  }
}
