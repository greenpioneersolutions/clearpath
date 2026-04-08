# Shared — Reusable UI components and utilities

## Purpose
Provides foundational, reusable components used across the application for common UI patterns like empty states, model selection, session summaries, and welcome screens.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| EmptyState.tsx | Generic empty state placeholder with icon, title, description, and optional action buttons | `EmptyState` |
| ModelPicker.tsx | Model selector dropdown supporting Copilot, Claude, and local (Ollama/LM Studio) backends | `ModelPicker` |
| SessionSummary.tsx | Post-session card showing stats (duration, prompt count, tool uses, errors) with continue/save/dismiss actions | `SessionSummary`, `formatDuration()` |
| WelcomeBack.tsx | Landing screen showing quick-start suggestions, recent sessions with pagination, new session CTA | `WelcomeBack`, `timeAgo()`, `sessionDuration()`, `getFirstPrompt()` |

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
  - `starter-pack:get-prompts` (WelcomeBack) — fetch quick-start templates
- ModelPicker groups models by provider (Claude), cost tier (Copilot), or runtime (Local); renders HTML select dropdown
- SessionSummary counts user messages, errors, tool uses from message array; shows alert icon if errors occurred
- WelcomeBack loads recent sessions with CLI badge (Copilot green, Claude orange), first user message preview, time ago + prompt count + duration, hover actions (View, Continue)
- EmptyState accepts primary + secondary action buttons; used throughout app for no-data states
- All components use Tailwind CSS; icons from Heroicons inline SVGs; dark mode by default (gray-900 bg); indigo-600 primary color

## Business Context
Provides consistent, reusable UI patterns across the application. ModelPicker supports multi-backend selection (Copilot, Claude, local LLMs). SessionSummary and WelcomeBack drive user engagement and session continuity.
