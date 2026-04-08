# Notifications — Real-time user alerts and webhook integration

## Purpose
This folder manages the notification system that keeps users informed of important events (sessions complete, permission requests, budget alerts, agent status updates, etc.). It includes a notification bell UI component, an expandable inbox panel with filtering and categorization, user preference controls, and webhook endpoint management for forwarding notifications to external services like Slack and email.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| NotificationBell.tsx | Bell icon in header; shows unread count badge; toggles inbox visibility | `NotificationBell()` - manages local unread count state |
| NotificationInbox.tsx | Expandable panel displaying notifications with filter tabs (all, sessions, security, budget, agents, history), expansion, read/unread marking, and action handling | `NotificationInbox({ isOpen, onClose })` - loads notifications list, handles mark-read/dismiss/clear-all, supports deep-link navigation via notification actions |
| NotificationPreferences.tsx | Settings table for per-notification-type delivery channels (inbox, desktop, webhook); quiet hours configuration | `NotificationPreferences()` - IPC calls to get/set prefs, toggle channels, configure quiet hours |
| WebhookManager.tsx | Add/edit/delete/test webhook endpoints; supports generic-json, slack-webhook, email-smtp types; per-endpoint notification type filtering | `WebhookManager()` - IPC calls to list/save/delete/test webhooks |

## Architecture Notes
- **IPC Calls Made:**
  - `notifications:unread-count` — fetch badge count
  - `notification:new` — listen for real-time notification events
  - `notifications:list` — fetch filtered notification list (supports limit, type, unreadOnly)
  - `notifications:mark-read`, `notifications:mark-all-read`, `notifications:dismiss`, `notifications:clear-all` — update notification state
  - `notifications:get-prefs`, `notifications:set-prefs` — load/save user preferences
  - `notifications:list-webhooks`, `notifications:save-webhook`, `notifications:delete-webhook`, `notifications:test-webhook` — manage webhooks

- **Key State Management:**
  - NotificationBell tracks local unreadCount and isOpen; listens for `notification:new` events to increment badge
  - NotificationInbox manages full notifications array, active filter tab, expanded notification ID, and loading state
  - NotificationPreferences holds NotificationPrefs object (channels: inbox/desktop/webhook per type, quietHoursEnabled/Start/End)
  - WebhookManager tracks array of WebhookEndpoint objects, form state (name/url/type), enabledTypes Set, and test results

- **Key Patterns:**
  - Notifications filter by tab using FILTER_MAP which maps filter names to NotificationType arrays
  - Each notification item can have an action with navigate (route + tab/panel params) or ipcChannel (invoke with args)
  - Time formatting uses timeAgo() helper (just now, Xm ago, Xh ago, Xd ago)
  - Webhook creation uses auto-generated IDs (wh- prefix + random hash + timestamp)
  - Severity and type labels are imported from types/notification constants (SEVERITY_STYLES, TYPE_LABELS)

- **UI Composition:**
  - NotificationBell is placed in app header; triggers NotificationInbox modal overlay
  - NotificationInbox is a fixed overlay panel (right-aligned, top-positioned)
  - Both preference and webhook manager components are self-contained panels that can be embedded in Settings views
  - useFocusTrap hook applied to inbox for keyboard accessibility

## Business Context
Notifications power real-time awareness of async events: sub-agent completion, permission prompts, rate limit warnings, security alerts, budget overages, and session status. Webhook integration enables integration with Slack, email, and custom HTTP endpoints so users can receive alerts outside the app. The quiet hours feature allows users to suppress non-critical notifications during off-hours (e.g., 9 PM to 9 AM).
