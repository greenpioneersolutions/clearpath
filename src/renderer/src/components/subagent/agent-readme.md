# Subagent — Background Task Delegation & Process Management UI

## Purpose
This folder contains components for spawning, monitoring, and managing long-running background processes that delegate work to Claude Code CLI or GitHub Copilot CLI. Users can delegate tasks to independent sub-agents via DelegateTaskForm; ProcessCard and ProcessOutputViewer display individual agent status and output; FleetStatusPanel shows coordinated multi-agent activity from Copilot's `/fleet` command; TaskQueueView manages queued tasks with priority ordering (requires claude-code-queue package).

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| DelegateTaskForm.tsx | Form to spawn a new background sub-agent task | DelegateTaskForm component; fields: CLI (copilot/claude), prompt, task name, model, working directory, permission mode; IPC call `subagent:spawn`; returns SubAgentInfo |
| FleetStatusPanel.tsx | Panel showing coordinated agent activity from Copilot's `/fleet` command | FleetStatusPanel component; parses `/fleet` output into FleetAgent[] entries; regex parser for "Agent {name} — {status}: {task}" lines; listens to `cli:output` and `cli:turn-end` events |
| ProcessCard.tsx | Card displaying a single sub-agent with status, elapsed time, controls (Pause/Kill/Resume/PopOut) | ProcessCard component; status badges (running/completed/failed/killed); animated spinner for running; action buttons for Pause, Kill, Resume; elapsed time tracking via setInterval |
| ProcessOutputViewer.tsx | Scrollable output viewer for a single sub-agent; loads historical output and listens for new events | ProcessOutputViewer component; fetches `subagent:get-output` for log; listens to `subagent:output` events; renders OutputDisplay with permission response handler |
| TaskQueueView.tsx | Drag-and-drop queue UI for managing pending/running/completed tasks with priority ordering | TaskQueueView component; checks `subagent:check-queue-installed`; drag-and-drop reordering updates priority; status colors; Retry/Skip actions |

## Architecture Notes

### Data Flow: Subagent Lifecycle
1. **DelegateTaskForm** collects prompt + options → calls `subagent:spawn` IPC → spawns background process → returns SubAgentInfo with id, pid, status, startedAt
2. **ProcessCard** displays SubAgentInfo; user can Pause (SIGTERM) or Kill (SIGKILL); clicking "Resume" prompts for follow-up task
3. **ProcessOutputViewer** listens to `subagent:output` events streamed from the background process; accumulates messages in state; allows permission interactions via `subagent:resume`
4. **FleetStatusPanel** (Copilot-only) calls `subagent:fleet-status` IPC to query `/fleet` command; parses raw output into FleetAgent[] entries; listens to `cli:output` (raw lines) and `cli:turn-end` events

### Key State Management
- **DelegateTaskForm:** cli, prompt, name, model, workingDirectory, permissionMode, spawning, error
- **ProcessCard:** elapsed (formatted duration string); timerRef for live clock update; passed SubAgentInfo
- **ProcessOutputViewer:** messages (OutputMessage[]), loading; counterRef for auto-incrementing message IDs
- **FleetStatusPanel:** selectedSession, agents[], rawOutput[], fetching, lastFetched, bufferRef for accumulating lines, cleanupRef for listener unsubscribe functions
- **TaskQueueView:** installed (null/boolean), tasks[], paused, dragIndexRef for reordering

### IPC Calls Made
- `subagent:spawn` — Spawn background task; args: { name, cli, prompt, model?, workingDirectory?, permissionMode? }; returns SubAgentInfo
- `subagent:get-output` — Fetch historical output log for a sub-agent; args: { id }; returns ParsedOutput[]
- `subagent:resume` — Resume paused/completed agent with follow-up; args: { id, prompt }
- `subagent:fleet-status` — Query Copilot's /fleet command; args: { sessionId }; triggers `cli:output` + `cli:turn-end` events
- `subagent:check-queue-installed` — Check if claude-code-queue CLI is installed; returns { installed: boolean, path?: string }

### IPC Events Listened To
- `subagent:output` — Emitted when sub-agent writes output; { id, output: ParsedOutput }
- `cli:output` — Emitted when CLI outputs a line (used by FleetStatusPanel to parse fleet status); { sessionId, output: ParsedOutput }
- `cli:turn-end` — Emitted when CLI turn completes (used to finalize fleet parsing); { sessionId }

### Key Types Used
- `SubAgentInfo` — id, name, prompt, cli ('claude'|'copilot'), status ('running'|'completed'|'failed'|'killed'), startedAt (ms), endedAt (ms), pid, model, workingDirectory, permissionMode, resumeCount
- `FleetAgent` — name, status ('working'|'idle'|'done'|'error'), task (description), progress (optional)
- `ParsedOutput` — output object with content and type information (from OutputDisplay)
- `QueuedTask` — id, prompt, cli, model, status ('pending'|'running'|'completed'|'failed'|'rate-limited'), priority, estimatedTokens
- `SessionInfo` — sessionId, name, status ('running'|'idle'|'done'), etc. (from IPC types)

### Key Patterns
- **Duration formatting:** `formatDuration(startMs, endMs?)` converts elapsed milliseconds to human-readable "Xh Ym Zs" format
- **Live elapsed time:** ProcessCard uses setInterval to update elapsed duration every 1s while running; clears on cleanup
- **Fleet parsing:** regex `/Agent\s+"?([^"]+)"?\s*[—-]+\s*(working|idle|done|error)(?:\s*(?:on)?:\s*(.+))?/i` extracts agent name, status, task
- **Event listener cleanup:** FleetStatusPanel stores cleanup functions in cleanupRef array; calls on unmount or session change
- **Drag-and-drop reordering:** TaskQueueView uses dragIndexRef to track source; reorders tasks and updates priority values (1-indexed)
- **Status color mapping:** STATUS_STYLES record maps process status to Tailwind bg/text/dot classes with dark theme (green/blue/red/gray)

### Permission Response Handling
ProcessOutputViewer passes `onPermissionResponse` callback to OutputDisplay, which allows the AI to prompt the user for permission (yes/no) during task execution. Response is sent back via `subagent:resume` with prompt 'y' or 'n'.

## Business Context
**Feature:** Subagent delegation allows power users to spawn background processes that work independently. Use cases include:
- Long-running code analysis or refactoring tasks that would block the main UI
- Parallel task execution (multiple subagents working on different files)
- Integration with Copilot's fleet feature for coordinated multi-agent workflows
- Task queuing with priority management for batch operations

**User Workflow:**
1. User opens "Delegate Task" panel → DelegateTaskForm
2. Enters task description, selects CLI (Copilot or Claude), optional model and permission mode
3. Clicks "Delegate Task" → spawns background process → ProcessCard appears in list
4. ProcessCard shows live status, elapsed time, and output (ProcessOutputViewer)
5. User can Pause, Kill, or Resume (with follow-up prompt) the sub-agent
6. For Copilot: FleetStatusPanel shows coordinated agent activity via `/fleet` command
7. For batch workflows: TaskQueueView shows queued tasks with drag-and-drop priority reordering (if claude-code-queue installed)

**Permission Modes:** When a sub-agent needs approval to make changes, the permission mode controls auto-response:
- Plan — Show what will be done, wait for approval
- Accept Edits — Automatically apply changes
- Auto — Balance between Planning and Auto
- YOLO/Bypass — Skip all confirmations (for trusted tasks)
