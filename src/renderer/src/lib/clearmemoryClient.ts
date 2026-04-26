// ── ClearMemory renderer client ─────────────────────────────────────────────
// Thin typed wrappers around the `clearmemory:*` IPC surface. Every call
// returns a `Result<T>` so components can branch on `ok` without unpacking
// HTTP internals; the main-process handler is where the envelope is produced.
//
// This module is the single place in the renderer that knows about the IPC
// channel names for Clear Memory CRUD — components should import `recall`,
// `expand`, `retain`, `forget` from here rather than calling invoke() directly.

import type {
  BackupFile,
  BackupProgress,
  BackupSchedule,
  ClearMemoryConfig,
  ExpandResponse,
  ForgetResponse,
  ImportFormat,
  ImportProgress,
  McpStatus,
  RecallRequest,
  RecallResponse,
  RetainRequest,
  RetainResponse,
  Result,
  Stream,
  TagType,
  TagsByType,
} from '../../../shared/clearmemory/types'

export type { Result } from '../../../shared/clearmemory/types'

// The main-process handler always returns a `Result<T>`-shaped payload for
// CRUD channels. We still want to guard against unexpected shapes (a
// mis-registered handler, a stub that hasn't been upgraded yet) so we fold
// anything that doesn't match into an ok:false result.
async function invokeResult<T>(channel: string, payload?: unknown): Promise<Result<T>> {
  try {
    const raw = (await window.electronAPI.invoke(channel, payload)) as unknown
    if (raw && typeof raw === 'object' && 'ok' in raw) {
      const envelope = raw as Result<T>
      if (envelope.ok === true || envelope.ok === false) return envelope
    }
    // Back-compat: treat a bare payload as success.
    return { ok: true, data: raw as T }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function recall(params: RecallRequest): Promise<Result<RecallResponse>> {
  return invokeResult<RecallResponse>('clearmemory:recall', params)
}

export async function expand(id: string): Promise<Result<ExpandResponse>> {
  return invokeResult<ExpandResponse>('clearmemory:expand', { id })
}

export async function retain(params: RetainRequest): Promise<Result<RetainResponse>> {
  return invokeResult<RetainResponse>('clearmemory:retain', params)
}

export async function forget(id: string, reason?: string): Promise<Result<ForgetResponse>> {
  return invokeResult<ForgetResponse>('clearmemory:forget', { id, reason })
}

/**
 * Kick the daemon awake. Exposed so empty-state CTAs ("ClearMemory is not
 * running") can call it without re-implementing the lifecycle payload shape.
 */
export async function enable(
  tier: 'offline' | 'local_llm' | 'cloud' = 'offline',
): Promise<{ ok: boolean; error?: string; state?: string }> {
  try {
    const raw = (await window.electronAPI.invoke('clearmemory:enable', { tier })) as {
      ok?: boolean
      error?: string
      state?: string
    }
    return { ok: !!raw?.ok, error: raw?.error, state: raw?.state }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Streams (Slice D) ────────────────────────────────────────────────────────

export async function streamsList(): Promise<Result<{ streams: Stream[]; active?: string }>> {
  return invokeResult<{ streams: Stream[]; active?: string }>('clearmemory:streams-list')
}

export async function streamsDescribe(
  name: string,
): Promise<Result<{ name: string; description?: string; tags?: string[] }>> {
  return invokeResult<{ name: string; description?: string; tags?: string[] }>(
    'clearmemory:streams-describe',
    { name },
  )
}

export async function streamsCreate(
  params: { name: string; description?: string; tags?: string[] },
): Promise<Result<Stream>> {
  return invokeResult<Stream>('clearmemory:streams-create', params)
}

export async function streamsSwitch(name: string): Promise<Result<{ name: string }>> {
  return invokeResult<{ name: string }>('clearmemory:streams-switch', { name })
}

// ── Tags (Slice D) ───────────────────────────────────────────────────────────

export async function tagsList(type?: TagType): Promise<Result<TagsByType>> {
  return invokeResult<TagsByType>('clearmemory:tags-list', type ? { type } : {})
}

export async function tagsAdd(
  type: TagType,
  value: string,
): Promise<Result<{ type: TagType; value: string }>> {
  return invokeResult<{ type: TagType; value: string }>('clearmemory:tags-add', { type, value })
}

export async function tagsRemove(
  type: TagType,
  value: string,
): Promise<Result<{ type: TagType; value: string }>> {
  return invokeResult<{ type: TagType; value: string }>('clearmemory:tags-remove', { type, value })
}

export async function tagsRename(
  type: TagType,
  oldValue: string,
  newValue: string,
): Promise<Result<{ type: TagType; oldValue: string; newValue: string }>> {
  return invokeResult<{ type: TagType; oldValue: string; newValue: string }>(
    'clearmemory:tags-rename',
    { type, oldValue, newValue },
  )
}

// ── Import (Slice D — streaming) ─────────────────────────────────────────────

export async function importPickPath(
  mode?: 'file' | 'directory',
): Promise<Result<{ path: string }>> {
  return invokeResult<{ path: string }>('clearmemory:pick-import-path', mode ? { mode } : {})
}

export async function importPreview(
  path: string,
): Promise<Result<{ path: string; isDirectory: boolean; fileCount: number; sizeBytes: number; mdCount: number }>> {
  return invokeResult<{ path: string; isDirectory: boolean; fileCount: number; sizeBytes: number; mdCount: number }>(
    'clearmemory:import-preview',
    { path },
  )
}

export async function importStart(params: {
  path: string
  format: ImportFormat
  stream?: string
  autoTag?: boolean
}): Promise<Result<{ id: string }>> {
  return invokeResult<{ id: string }>('clearmemory:import', params)
}

export async function importCancel(id: string): Promise<Result<{ cancelled: boolean }>> {
  return invokeResult<{ cancelled: boolean }>('clearmemory:import-cancel', { id })
}

/**
 * Subscribe to import progress events, filtered by correlation id.
 * Returns an unsubscribe function.
 */
export function subscribeImportProgress(
  id: string,
  cb: (event: ImportProgress) => void,
): () => void {
  const off = window.electronAPI.on('clearmemory:import-progress', (...args: unknown[]) => {
    const payload = args[0] as ImportProgress | undefined
    if (!payload || payload.id !== id) return
    cb(payload)
  })
  return () => { off?.() }
}

// ── Config (Slice E) ─────────────────────────────────────────────────────────

export async function configGet(): Promise<Result<ClearMemoryConfig>> {
  return invokeResult<ClearMemoryConfig>('clearmemory:config-get')
}

export async function configSet(
  patch: Partial<ClearMemoryConfig>,
): Promise<Result<ClearMemoryConfig>> {
  return invokeResult<ClearMemoryConfig>('clearmemory:config-set', { patch })
}

// ── Reflect (Slice E) ────────────────────────────────────────────────────────

export async function reflect(
  query: string,
  stream?: string,
): Promise<Result<{ output: string }>> {
  return invokeResult<{ output: string }>(
    'clearmemory:reflect',
    stream ? { query, stream } : { query },
  )
}

// ── Backup / Restore (Slice E) ───────────────────────────────────────────────

export async function backupPickPath(): Promise<Result<{ path: string }>> {
  return invokeResult<{ path: string }>('clearmemory:pick-backup-path')
}

export async function backupsList(path: string): Promise<Result<BackupFile[]>> {
  return invokeResult<BackupFile[]>('clearmemory:list-backups', { path })
}

export async function backupNow(params: {
  path: string
  autoName?: boolean
  encrypt?: boolean
}): Promise<Result<{ id: string }>> {
  return invokeResult<{ id: string }>('clearmemory:backup-now', params)
}

export async function restoreNow(params: {
  path: string
  verify?: boolean
}): Promise<Result<{ id: string }>> {
  return invokeResult<{ id: string }>('clearmemory:restore-now', params)
}

export async function backupCancel(id: string): Promise<Result<{ cancelled: boolean }>> {
  return invokeResult<{ cancelled: boolean }>('clearmemory:backup-cancel', { id })
}

export async function backupScheduleGet(): Promise<Result<BackupSchedule>> {
  return invokeResult<BackupSchedule>('clearmemory:backup-schedule-get')
}

export async function backupScheduleSet(
  patch: Partial<BackupSchedule>,
): Promise<Result<BackupSchedule>> {
  return invokeResult<BackupSchedule>('clearmemory:backup-schedule-set', patch)
}

/**
 * Subscribe to backup/restore progress events, filtered by correlation id.
 * Returns an unsubscribe function.
 */
export function subscribeBackupProgress(
  id: string,
  cb: (event: BackupProgress) => void,
): () => void {
  const off = window.electronAPI.on('clearmemory:backup-progress', (...args: unknown[]) => {
    const payload = args[0] as BackupProgress | undefined
    if (!payload || payload.id !== id) return
    cb(payload)
  })
  return () => { off?.() }
}

// ── MCP (Slice E) ────────────────────────────────────────────────────────────

export async function mcpStatus(): Promise<Result<McpStatus>> {
  return invokeResult<McpStatus>('clearmemory:mcp-status')
}

export async function mcpRepair(): Promise<Result<McpStatus>> {
  return invokeResult<McpStatus>('clearmemory:mcp-repair')
}
