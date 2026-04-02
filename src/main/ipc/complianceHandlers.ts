import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import Store from 'electron-store'
import { writeFileSync } from 'fs'
import { randomUUID } from 'crypto'

interface AuditEntry {
  id: string
  timestamp: number
  actionType: 'session' | 'prompt' | 'tool-approval' | 'file-change' | 'config-change' | 'policy-violation' | 'security-warning'
  summary: string
  details: string
  sessionId?: string
}

interface ComplianceStoreSchema {
  auditLog: AuditEntry[]
  fileProtectionPatterns: string[]
  sensitivePatterns: Array<{ name: string; pattern: string }>
}

const DEFAULT_FILE_PROTECTION = ['.env*', '*.pem', '*.key', '*credentials*', '*secret*', 'config/production.*']

const DEFAULT_SENSITIVE_PATTERNS = [
  { name: 'AWS Key', pattern: 'AKIA[0-9A-Z]{16}' },
  { name: 'API Key (sk-)', pattern: 'sk-[a-zA-Z0-9]{20,}' },
  { name: 'GitHub Token', pattern: 'ghp_[a-zA-Z0-9]{36}' },
  { name: 'Slack Token', pattern: 'xox[bpors]-[a-zA-Z0-9-]+' },
  { name: 'Connection String', pattern: '(?:postgres|mongodb|mysql)://[^\\s]+' },
  { name: 'Email', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}' },
]

const store = new Store<ComplianceStoreSchema>({
  name: 'clear-path-compliance',
  defaults: {
    auditLog: [],
    fileProtectionPatterns: DEFAULT_FILE_PROTECTION,
    sensitivePatterns: DEFAULT_SENSITIVE_PATTERNS,
  },
})

function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
  const full: AuditEntry = { ...entry, id: randomUUID(), timestamp: Date.now() }
  const log = store.get('auditLog')
  log.push(full)
  if (log.length > 5000) log.splice(0, log.length - 5000)
  store.set('auditLog', log)
  return full
}

export function registerComplianceHandlers(ipcMain: IpcMain): void {
  // Audit log
  ipcMain.handle('compliance:log-event', (_e, args: Omit<AuditEntry, 'id' | 'timestamp'>) =>
    addAuditEntry(args),
  )

  ipcMain.handle('compliance:get-log', (_e, args?: { limit?: number; actionType?: string; search?: string }) => {
    let log = store.get('auditLog')
    if (args?.actionType) log = log.filter((e) => e.actionType === args.actionType)
    if (args?.search) {
      const q = args.search.toLowerCase()
      log = log.filter((e) => e.summary.toLowerCase().includes(q) || e.details.toLowerCase().includes(q))
    }
    return log.slice(-(args?.limit ?? 100)).reverse()
  })

  // Sensitive data scanning
  ipcMain.handle('compliance:scan-text', (_e, args: { text: string }) => {
    const patterns = store.get('sensitivePatterns')
    const matches: Array<{ name: string; match: string; index: number }> = []

    for (const p of patterns) {
      try {
        const re = new RegExp(p.pattern, 'gi')
        let m: RegExpExecArray | null
        while ((m = re.exec(args.text)) !== null) {
          matches.push({ name: p.name, match: m[0].slice(0, 20) + (m[0].length > 20 ? '...' : ''), index: m.index })
        }
      } catch { /* invalid regex, skip */ }
    }

    if (matches.length > 0) {
      addAuditEntry({
        actionType: 'security-warning',
        summary: `Sensitive data detected: ${matches.map((m) => m.name).join(', ')}`,
        details: JSON.stringify(matches),
      })
    }

    return { hasSensitiveData: matches.length > 0, matches }
  })

  // File protection
  ipcMain.handle('compliance:get-file-patterns', () => store.get('fileProtectionPatterns'))

  ipcMain.handle('compliance:set-file-patterns', (_e, args: { patterns: string[] }) => {
    store.set('fileProtectionPatterns', args.patterns)
    return { success: true }
  })

  ipcMain.handle('compliance:check-file', (_e, args: { path: string }) => {
    const patterns = store.get('fileProtectionPatterns')
    const blocked = patterns.some((pattern) => {
      const re = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i')
      return re.test(args.path)
    })
    if (blocked) {
      addAuditEntry({
        actionType: 'security-warning',
        summary: `Protected file access blocked: ${args.path}`,
        details: JSON.stringify({ path: args.path }),
      })
    }
    return { blocked }
  })

  // Security events feed
  ipcMain.handle('compliance:security-events', (_e, args?: { limit?: number }) => {
    const log = store.get('auditLog')
    return log
      .filter((e) => ['security-warning', 'policy-violation'].includes(e.actionType))
      .slice(-(args?.limit ?? 10))
      .reverse()
  })

  // Compliance snapshot export
  ipcMain.handle('compliance:export-snapshot', async (_e, args?: { since?: number }) => {
    const since = args?.since ?? 0
    const log = store.get('auditLog').filter((e) => e.timestamp >= since)
    const filePatterns = store.get('fileProtectionPatterns')

    const snapshot = {
      exportedAt: new Date().toISOString(),
      auditLogEntries: log.length,
      auditLog: log,
      fileProtectionPatterns: filePatterns,
      summary: {
        totalEvents: log.length,
        securityWarnings: log.filter((e) => e.actionType === 'security-warning').length,
        policyViolations: log.filter((e) => e.actionType === 'policy-violation').length,
        sessions: log.filter((e) => e.actionType === 'session').length,
        prompts: log.filter((e) => e.actionType === 'prompt').length,
      },
    }

    const result = await dialog.showSaveDialog({
      defaultPath: `compliance-snapshot-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    writeFileSync(result.filePath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
    return { path: result.filePath }
  })

  ipcMain.handle('compliance:clear-log', () => {
    store.set('auditLog', [])
    return { success: true }
  })
}
