export type NotificationType =
  | 'session-complete' | 'permission-request' | 'rate-limit'
  | 'budget-alert' | 'security-event' | 'policy-violation'
  | 'agent-status' | 'schedule-result' | 'error'

export type NotificationSeverity = 'info' | 'warning' | 'critical'

export interface NotificationAction {
  label: string
  ipcChannel: string
  args?: Record<string, unknown>
  navigate?: string
  tab?: string
  panel?: string
}

export interface AppNotification {
  id: string
  timestamp: number
  type: NotificationType
  severity: NotificationSeverity
  title: string
  message: string
  source: string
  sessionId?: string
  action?: NotificationAction
  read: boolean
}

export interface WebhookEndpoint {
  id: string
  name: string
  url: string
  type: 'slack-webhook' | 'generic-json' | 'email-smtp'
  enabledTypes: NotificationType[]
  enabled: boolean
}

export interface NotificationPrefs {
  inbox: Record<NotificationType, boolean>
  desktop: Record<NotificationType, boolean>
  webhook: Record<NotificationType, boolean>
  quietHoursEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
}

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'session-complete', 'permission-request', 'rate-limit',
  'budget-alert', 'security-event', 'policy-violation',
  'agent-status', 'schedule-result', 'error',
]

export const SEVERITY_STYLES: Record<NotificationSeverity, { icon: string; bg: string; text: string; border: string }> = {
  info:     { icon: '\u2139\uFE0F', bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  warning:  { icon: '\u26A0\uFE0F', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  critical: { icon: '\uD83D\uDED1', bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
}

export const TYPE_LABELS: Record<NotificationType, string> = {
  'session-complete': 'Sessions',
  'permission-request': 'Permissions',
  'rate-limit': 'Rate Limits',
  'budget-alert': 'Budget',
  'security-event': 'Security',
  'policy-violation': 'Policy',
  'agent-status': 'Agents',
  'schedule-result': 'Schedules',
  'error': 'Errors',
}
