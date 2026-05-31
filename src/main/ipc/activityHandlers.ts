// ── Session activity log — store + IPC ────────────────────────────────────────
// Persists what each session's agent touched (files read/written, URLs fetched,
// commands run), fed by the PermissionBroker. The renderer reads it to show a
// "Files & activity" panel where outputs are one click away to open.

import type { IpcMain } from 'electron'
import { shell } from 'electron'
import { existsSync, statSync } from 'fs'
import { randomUUID } from 'crypto'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { isSensitiveSystemPath } from '../utils/pathSecurity'
import type { SessionActivityEntry } from '../../shared/activity/types'

interface ActivitySchema {
  bySession: Record<string, SessionActivityEntry[]>
}

const MAX_PER_SESSION = 500

let _store: Store<ActivitySchema> | null = null
function store(): Store<ActivitySchema> {
  if (!_store) {
    _store = new Store<ActivitySchema>({ name: 'clear-path-session-activity', encryptionKey: getStoreEncryptionKey() })
  }
  return _store
}

/**
 * Append a tool call to a session's activity log. De-dupes consecutive identical
 * entries (same kind+target+decision) so a tool retried verbatim isn't logged
 * twice in a row. Wired to `PermissionBroker.recordActivity` in index.ts.
 */
export function recordSessionActivity(entry: Omit<SessionActivityEntry, 'id'>): void {
  if (!entry.sessionId) return
  const all = store().get('bySession', {})
  const list = all[entry.sessionId] ?? []
  const last = list[list.length - 1]
  if (last && last.kind === entry.kind && last.target === entry.target && last.decision === entry.decision) {
    return // collapse immediate duplicates
  }
  list.push({ ...entry, id: randomUUID() })
  if (list.length > MAX_PER_SESSION) list.splice(0, list.length - MAX_PER_SESSION)
  all[entry.sessionId] = list
  store().set('bySession', all)
}

/** Drop a session's activity (called from the session-delete hook). */
export function clearSessionActivity(sessionId: string): void {
  const all = store().get('bySession', {})
  if (all[sessionId]) { delete all[sessionId]; store().set('bySession', all) }
}

export function registerActivityHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('activity:get-session', (_e, args: { sessionId: string }): SessionActivityEntry[] => {
    if (!args?.sessionId) return []
    return store().get('bySession', {})[args.sessionId] ?? []
  })

  ipcMain.handle('activity:clear-session', (_e, args: { sessionId: string }): { ok: boolean } => {
    if (args?.sessionId) clearSessionActivity(args.sessionId)
    return { ok: true }
  })

  // Open a file the agent produced/read in the OS default app. Guards against
  // opening sensitive system paths and non-existent files.
  ipcMain.handle('activity:open-file', async (_e, args: { path: string }): Promise<{ ok: boolean; error?: string }> => {
    const p = args?.path
    if (!p || typeof p !== 'string') return { ok: false, error: 'no path' }
    if (isSensitiveSystemPath(p)) return { ok: false, error: 'sensitive path' }
    try {
      if (!existsSync(p) || !statSync(p).isFile()) return { ok: false, error: 'file not found' }
    } catch { return { ok: false, error: 'file not found' } }
    const err = await shell.openPath(p)
    return err ? { ok: false, error: err } : { ok: true }
  })

  // Reveal a file in the OS file manager (Finder/Explorer).
  ipcMain.handle('activity:reveal-file', (_e, args: { path: string }): { ok: boolean } => {
    const p = args?.path
    if (!p || isSensitiveSystemPath(p) || !existsSync(p)) return { ok: false }
    shell.showItemInFolder(p)
    return { ok: true }
  })

  // Open a fetched URL in the default browser (http/https only).
  ipcMain.handle('activity:open-url', async (_e, args: { url: string }): Promise<{ ok: boolean }> => {
    const u = args?.url
    if (!u || !/^https?:\/\//i.test(u)) return { ok: false }
    await shell.openExternal(u)
    return { ok: true }
  })
}
