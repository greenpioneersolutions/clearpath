import type { IpcMain } from 'electron'
import type { NotificationManager, NotificationType, NotificationSeverity, NotificationAction, NotificationPrefs, WebhookEndpoint } from '../notifications/NotificationManager'
import { randomUUID } from 'crypto'
import { checkRateLimit } from '../utils/rateLimiter'

export function registerNotificationHandlers(ipcMain: IpcMain, manager: NotificationManager): void {
  // ── Emit a notification ────────────────────────────────────────────────────

  ipcMain.handle('notifications:emit', (_e, args: {
    type: NotificationType
    severity: NotificationSeverity
    title: string
    message: string
    source: string
    sessionId?: string
    action?: NotificationAction
  }) => manager.emit(args))

  // ── Query ──────────────────────────────────────────────────────────────────

  ipcMain.handle('notifications:list', (_e, args?: { limit?: number; type?: string; unreadOnly?: boolean }) =>
    manager.getAll(args),
  )

  ipcMain.handle('notifications:unread-count', () => manager.getUnreadCount())

  ipcMain.handle('notifications:mark-read', (_e, args: { id: string }) => {
    manager.markRead(args.id)
    return { success: true }
  })

  ipcMain.handle('notifications:mark-all-read', () => {
    manager.markAllRead()
    return { success: true }
  })

  ipcMain.handle('notifications:dismiss', (_e, args: { id: string }) => {
    manager.dismiss(args.id)
    return { success: true }
  })

  ipcMain.handle('notifications:clear-all', () => {
    manager.clearAll()
    return { success: true }
  })

  // ── Preferences ────────────────────────────────────────────────────────────

  ipcMain.handle('notifications:get-prefs', () => manager.getPrefs())

  ipcMain.handle('notifications:set-prefs', (_e, args: { prefs: NotificationPrefs }) => {
    manager.setPrefs(args.prefs)
    return { success: true }
  })

  // ── Webhooks ───────────────────────────────────────────────────────────────

  ipcMain.handle('notifications:list-webhooks', () => manager.getWebhooks())

  ipcMain.handle('notifications:save-webhook', (_e, args: Omit<WebhookEndpoint, 'id'> & { id?: string }) => {
    // Validate webhook URL before saving
    if (args.url) {
      try {
        const parsed = new URL(args.url)
        if (parsed.protocol !== 'https:') {
          return { error: 'Only HTTPS webhook URLs are allowed' }
        }
        // Strip IPv6 brackets: URL.hostname returns "[::1]" for IPv6, strip to "::1"
        const host = parsed.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase()
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' ||
            host.startsWith('fd') || host.startsWith('fc') || host.startsWith('fe80') ||
            /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(host)) {
          return { error: 'Private/internal URLs are not allowed for webhooks' }
        }
      } catch {
        return { error: 'Invalid webhook URL' }
      }
    }
    const wh: WebhookEndpoint = { ...args, id: args.id ?? randomUUID() }
    manager.saveWebhook(wh)
    return wh
  })

  ipcMain.handle('notifications:delete-webhook', (_e, args: { id: string }) => {
    manager.deleteWebhook(args.id)
    return { success: true }
  })

  ipcMain.handle('notifications:test-webhook', (_e, args: { id: string }) => {
    const rl = checkRateLimit('notifications:test-webhook')
    if (!rl.allowed) return { success: false, error: `Rate limited — try again in ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s` }
    return manager.testWebhook(args.id)
  })
}
