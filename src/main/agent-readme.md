# Main Process — Electron app initialization and IPC orchestration

## Purpose
This folder contains the root entry point for the Electron main process. It initializes the Electron app, manages singletons (CLIManager, AuthManager, AgentManager, NotificationManager, SchedulerService), registers all IPC handlers, sets up auto-updates, and configures security policies (CSP, content isolation).

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| index.ts | App initialization, window creation, singleton setup, CSP headers, auto-updater | createWindow(), CLIManager, AuthManager, AgentManager, NotificationManager, SchedulerService |

## Architecture Notes
- **Singletons**: CLIManager, AuthManager, AgentManager, NotificationManager, and SchedulerService are instantiated before `app.ready()` to ensure IPC handlers are registered before the renderer window connects (Electron requirement).
- **IPC Registration**: Calls 34 handler registration functions to wire up all IPC channels for session management, auth, agents, settings, costs, compliance, notifications, notes, templates, teams, skills, workflows, integrations, dashboards, and more.
- **Notification Wiring**: CLIManager's `setNotifyCallback()` forwards events to NotificationManager.emit(); CLIManager's `setAuditCallback()` logs to encrypted compliance store; CLIManager's `setCostRecordCallback()` records cost data.
- **Auto-update**: Uses electron-updater to check GitHub Releases, notifies renderer via `updater:status` IPC, handles `updater:check` and `updater:install` requests.
- **Security**: CSP headers block inline scripts (except style-src for Tailwind/React); contextIsolation + sandbox enabled; shell PATH loaded early via initShellEnv().
- **Encryption**: Uses electron-store with encryption key derived from hostname/username; checks key integrity on startup.

## Business Context
Bootstraps the entire CoPilot Commander GUI application — a wrapper around GitHub Copilot CLI and Claude Code CLI. Enables the renderer process to interact with CLI binaries, manage sessions, record costs, handle authentication, and serve user-facing features via 34+ IPC channels.
