# Notifications — Multi-channel notification delivery and preferences

## Purpose
Centralized notification system supporting inbox, desktop OS notifications, and webhook dispatch (Slack, generic JSON). Manages notification history, user preferences (quiet hours, per-type toggles), and webhook endpoints with SSRF protection. All notifications are encrypted at rest.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| NotificationManager.ts | Notification emission, delivery, history, and webhook management | `NotificationManager` class; `emit()`, `getAll()`, `getUnreadCount()`, `markRead()`, `markAllRead()`, `clearAll()`, `dismiss()`, `getPrefs()`, `setPrefs()`, `getWebhooks()`, `saveWebhook()`, `deleteWebhook()`, `testWebhook()` |

## Architecture Notes

### Notification Types
Defined as union type: `'session-complete' | 'permission-request' | 'rate-limit' | 'budget-alert' | 'security-event' | 'policy-violation' | 'agent-status' | 'schedule-result' | 'error'`

### Notification Schema (`AppNotification`)
- `id`: UUID
- `timestamp`: Creation time (ms)
- `type`: NotificationType
- `severity`: `'info' | 'warning' | 'critical'`
- `title`, `message`: Display text
- `source`: Origin (e.g., "scheduler", "webhook-test")
- `sessionId?`: Associated session
- `action?`: IPC channel and optional navigation deep-link
- `read`: Boolean flag

### Delivery Pipeline
1. **Inbox** (renderer) — if `prefs.inbox[type]` is true, emit `notification:new` IPC event
2. **Desktop Push** — if `prefs.desktop[type]` and severity check pass
3. **Quiet Hours** — during quiet window (e.g., 22:00–07:00), only critical notifications push
4. **Webhook Async** — dispatch to enabled webhooks asynchronously (non-blocking)

### Webhook Security
- **SSRF Protection**: `isWebhookUrlSafe()` blocks:
  - Non-HTTPS URLs
  - Localhost and 127.0.0.1
  - Private IPs (10.x, 172.16–31.x, 192.168.x, link-local)
  - AWS metadata service (169.254.169.254)
- **Secret Redaction**: `redactSecrets()` masks GitHub tokens, API keys, AWS keys, Slack tokens before external transmission
- **Webhook Types**: `'slack-webhook' | 'generic-json' | 'email-smtp'`

### Data Storage
- Uses `electron-store` with encryption key from `storeEncryption.ts`
- Store name: `clear-path-notifications`
- Schema: `NotificationStoreSchema` with `notifications[]`, `webhooks[]`, `prefs`
- Notifications capped at 500 entries
- Webhooks stored encrypted

### Preferences Schema (`NotificationPrefs`)
- `inbox`, `desktop`, `webhook`: Per-type boolean toggles
- `quietHoursEnabled`: Boolean
- `quietHoursStart`, `quietHoursEnd`: HH:MM strings

## Business Context
Provides multi-channel alerting for:
- Scheduled job completions/failures
- Rate limit or budget warnings
- Permission requests
- Security events and policy violations
- Agent status changes
- Session completion summaries

Users configure preferences in Settings to control:
- Which notification types appear in inbox
- Which trigger desktop OS notifications
- Quiet hours (no disruption during off-hours, unless critical)
- Webhook endpoints for integration with Slack, monitoring systems, etc.

## Integration Points
- Receives calls from `SchedulerService.ts`, CLI managers, and any IPC handler
- Emits IPC: `notification:new` (to renderer)
- Reads/writes encrypted store
- Makes HTTPS requests to webhooks (with SSRF and secret redaction)
