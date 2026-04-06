import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import Store from 'electron-store'
import { checkRateLimit } from '../utils/rateLimiter'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { addAuditEntry } from './complianceHandlers'
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'

// ── Store registry — all electron-store names used by the app ────────────────

interface StoreEntry {
  id: string
  label: string
  storeName: string
  description: string
  clearHandler?: string // Existing IPC handler that clears this store
}

const STORE_REGISTRY: StoreEntry[] = [
  { id: 'sessions', label: 'Sessions', storeName: 'clear-path-sessions', description: 'Session message logs and metadata', clearHandler: 'session-history:clear' },
  { id: 'history', label: 'Session History', storeName: 'clear-path-history', description: 'Session history metadata' },
  { id: 'cost', label: 'Cost Data', storeName: 'clear-path-cost', description: 'Cost records, budget alerts, token usage', clearHandler: 'cost:clear' },
  { id: 'notifications', label: 'Notifications', storeName: 'clear-path-notifications', description: 'Notification history and preferences', clearHandler: 'notifications:clear-all' },
  { id: 'notes', label: 'Memories / Notes', storeName: 'clear-path-notes', description: 'Saved memories and notes' },
  { id: 'agents', label: 'Agent Profiles', storeName: 'clear-path-agents', description: 'Agent configurations and active selections' },
  { id: 'skills', label: 'Skill Usage Stats', storeName: 'clear-path-skills', description: 'Skill usage tracking and recommendations' },
  { id: 'templates', label: 'Templates', storeName: 'clear-path-templates', description: 'Saved prompt templates' },
  { id: 'workflows', label: 'Workflows', storeName: 'clear-path-workflows', description: 'Saved workflow compositions' },
  { id: 'compliance', label: 'Compliance Logs', storeName: 'clear-path-compliance', description: 'Audit and compliance log entries (not clearable — archived automatically)' },
  { id: 'learn', label: 'Learning Progress', storeName: 'clear-path-learn', description: 'Completed lessons, achievements, progress', clearHandler: 'learn:reset' },
  { id: 'onboarding', label: 'Onboarding', storeName: 'clear-path-onboarding', description: 'First-run and onboarding progress', clearHandler: 'onboarding:reset' },
  { id: 'dashboard', label: 'Dashboard Layout', storeName: 'clear-path-dashboard', description: 'Widget positions and dashboard state' },
  { id: 'settings', label: 'App Settings', storeName: 'clear-path-settings', description: 'CLI flags, model, budget, environment', clearHandler: 'settings:reset-all' },
  { id: 'workspaces', label: 'Workspaces', storeName: 'clear-path-workspaces', description: 'Workspace configurations' },
  { id: 'scheduler', label: 'Scheduled Tasks', storeName: 'clear-path-scheduler', description: 'Scheduled job definitions and history' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function getStoreSize(storeName: string): number {
  try {
    const storePath = join(
      process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'clear-path')
        : join(homedir(), '.config', 'clear-path'),
      `${storeName}.json`
    )
    if (!existsSync(storePath)) return 0
    return statSync(storePath).size
  } catch {
    return 0
  }
}

function getStoreEntryCount(storeName: string): number {
  try {
    const s = new Store({ name: storeName, encryptionKey: getStoreEncryptionKey() })
    const data = s.store
    // Count top-level keys, or array lengths for known list stores
    let count = 0
    for (const val of Object.values(data)) {
      if (Array.isArray(val)) count += val.length
      else if (typeof val === 'object' && val !== null) count += Object.keys(val).length
      else count += 1
    }
    return count
  } catch {
    return 0
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerDataManagementHandlers(ipcMain: IpcMain): void {
  /** Get storage stats for all stores. */
  ipcMain.handle('data:get-storage-stats', () => {
    let totalSize = 0
    const stores = STORE_REGISTRY.map((entry) => {
      const size = getStoreSize(entry.storeName)
      const entryCount = getStoreEntryCount(entry.storeName)
      totalSize += size
      return {
        id: entry.id,
        label: entry.label,
        description: entry.description,
        sizeBytes: size,
        sizeFormatted: formatBytes(size),
        entryCount,
      }
    })

    // Knowledge base files (on-disk, not electron-store)
    let kbSize = 0
    let kbFiles = 0
    try {
      const kbDir = join(process.cwd(), '.clear-path', 'knowledge-base')
      if (existsSync(kbDir)) {
        for (const f of readdirSync(kbDir)) {
          const fp = join(kbDir, f)
          const st = statSync(fp)
          if (st.isFile()) { kbSize += st.size; kbFiles++ }
        }
      }
    } catch { /* ok */ }

    return {
      stores,
      totalSizeBytes: totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      knowledgeBase: { files: kbFiles, sizeBytes: kbSize, sizeFormatted: formatBytes(kbSize) },
    }
  })

  /** Clear a single store by ID — requires OS-level confirmation dialog. */
  ipcMain.handle('data:clear-store', async (_e, args: { storeId: string }) => {
    const rl = checkRateLimit('data:clear-store')
    if (!rl.allowed) return { error: 'Rate limited — too many clear operations' }

    const entry = STORE_REGISTRY.find((e) => e.id === args.storeId)
    if (!entry) return { error: 'Unknown store' }

    // Prevent clearing compliance logs via this route
    if (entry.id === 'compliance') {
      return { error: 'Compliance logs cannot be cleared — they are archived automatically.' }
    }

    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Clear Data'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirm Data Deletion',
      message: `Clear all ${entry.label} data?`,
      detail: 'This action cannot be undone.',
    })
    if (response !== 1) return { canceled: true }

    try {
      const s = new Store({ name: entry.storeName, encryptionKey: getStoreEncryptionKey() })
      s.clear()
      addAuditEntry({ actionType: 'config-change', summary: `Store cleared: ${entry.label}`, details: JSON.stringify({ storeId: args.storeId }) })
      return { success: true, storeId: args.storeId }
    } catch (err) {
      return { error: String(err) }
    }
  })

  /** Clear all stores (factory reset) — requires OS-level confirmation dialog. */
  ipcMain.handle('data:clear-all', async () => {
    const rl = checkRateLimit('data:clear-all')
    if (!rl.allowed) return { error: 'Rate limited' }
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Factory Reset'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirm Factory Reset',
      message: 'Clear ALL application data?',
      detail: 'This will reset all settings, sessions, costs, notifications, and other data. Compliance logs will be preserved. This action cannot be undone.',
    })
    if (response !== 1) return { canceled: true }

    const results: Array<{ id: string; success: boolean }> = []
    for (const entry of STORE_REGISTRY) {
      // Skip compliance logs — they should not be clearable
      if (entry.id === 'compliance') {
        results.push({ id: entry.id, success: false })
        continue
      }
      try {
        const s = new Store({ name: entry.storeName, encryptionKey: getStoreEncryptionKey() })
        s.clear()
        results.push({ id: entry.id, success: true })
      } catch {
        results.push({ id: entry.id, success: false })
      }
    }
    addAuditEntry({ actionType: 'config-change', summary: 'Factory reset executed', details: JSON.stringify({ results }) })
    return { results }
  })

  /** Get notes for compaction (list with sizes). */
  ipcMain.handle('data:get-notes-for-compact', () => {
    try {
      const notesStore = new Store({ name: 'clear-path-notes', encryptionKey: getStoreEncryptionKey() })
      const notes = (notesStore.get('notes') ?? []) as Array<{
        id: string; title: string; content: string; tags: string[]; category: string; updatedAt: number
      }>
      return notes.map((n) => ({
        id: n.id,
        title: n.title,
        contentLength: n.content.length,
        tags: n.tags,
        category: n.category,
        updatedAt: n.updatedAt,
      }))
    } catch {
      return []
    }
  })

  /** Compact (merge) selected notes into one. */
  ipcMain.handle('data:compact-notes', (_e, args: { noteIds: string[]; newTitle: string; newCategory?: string; newTags?: string[] }) => {
    try {
      const notesStore = new Store({ name: 'clear-path-notes', encryptionKey: getStoreEncryptionKey() })
      const allNotes = (notesStore.get('notes') ?? []) as Array<{
        id: string; title: string; content: string; tags: string[]; category: string; pinned: boolean; updatedAt: number; createdAt: number; attachments?: unknown[]
      }>

      const selected = allNotes.filter((n) => args.noteIds.includes(n.id))
      if (selected.length < 2) return { error: 'Select at least 2 notes to compact' }

      // Merge content with section headers
      const mergedContent = selected
        .map((n) => `## ${n.title}\n\n${n.content}`)
        .join('\n\n---\n\n')

      // Merge tags (dedupe)
      const mergedTags = args.newTags ?? [...new Set(selected.flatMap((n) => n.tags))]

      // Create the compacted note
      const compactedNote = {
        id: `compact-${Date.now()}`,
        title: args.newTitle,
        content: mergedContent,
        tags: mergedTags,
        category: args.newCategory ?? selected[0].category,
        pinned: selected.some((n) => n.pinned),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attachments: selected.flatMap((n) => n.attachments ?? []),
      }

      // Replace selected notes with the compacted one
      const remaining = allNotes.filter((n) => !args.noteIds.includes(n.id))
      remaining.unshift(compactedNote)
      notesStore.set('notes', remaining)

      return {
        success: true,
        compactedNote: { id: compactedNote.id, title: compactedNote.title, contentLength: compactedNote.content.length },
        removedCount: selected.length,
      }
    } catch (err) {
      return { error: String(err) }
    }
  })
}
