# Shared — Reusable UI components and utilities

## Purpose
Provides foundational, reusable components used across the application for common UI patterns like empty states, model selection, session summaries, and welcome screens.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| EmptyState.tsx | Generic empty state placeholder with icon, title, description, and optional action buttons | `EmptyState` |
| ModelPicker.tsx | Model selector dropdown supporting Copilot, Claude, and local (Ollama/LM Studio) backends | `ModelPicker` |
| SessionSummary.tsx | Post-session card showing stats (duration, prompt count, tool uses, errors) with continue/save/dismiss actions | `SessionSummary`, `formatDuration()` |
| WelcomeBack.tsx | Landing screen with primary "Start a session" CTA and a compact recent-sessions list (name + time-ago). "See all" opens SessionManager. | `WelcomeBack`, `timeAgo()` |

## Architecture Notes
- **ModelPicker Props:**
  ```typescript
  {
    currentBackend?: 'copilot' | 'claude' | 'local',
    currentModel: string,
    onChange: (model: string) => void,
    size?: 'compact' | 'full',
    allowInherit?: boolean
  }
  ```
- **IPC Calls Made:**
  - `local-models:detect` (ModelPicker) — detect Ollama/LM Studio models
- ModelPicker groups models by provider (Claude), cost tier (Copilot), or runtime (Local); renders HTML select dropdown
- SessionSummary counts user messages, errors, tool uses from message array; shows alert icon if errors occurred
- WelcomeBack renders a single primary CTA ("Start a session") plus a deprioritized compact list of up to 5 most recent sessions; each row is a button that invokes `onContinueSession`. A "See all" link opens SessionManager via `onBrowseAll`. No Quick Starts / starter-pack UI lives here anymore.
- EmptyState accepts primary + secondary action buttons; used throughout app for no-data states
- All components use Tailwind CSS; icons from Heroicons inline SVGs; dark mode by default (gray-900 bg); indigo-600 primary color

## Business Context
Provides consistent, reusable UI patterns across the application. ModelPicker supports multi-backend selection (Copilot, Claude, local LLMs). SessionSummary and WelcomeBack drive user engagement and session continuity.
