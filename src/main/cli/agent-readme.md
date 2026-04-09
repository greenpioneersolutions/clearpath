# CLI — Session management and adapter layer for GitHub Copilot and Claude Code

## Purpose
Manages interactive CLI sessions, spawns and monitors copilot/claude subprocesses, handles input/output streaming, persists session history, tracks costs, audits actions, and adapts to different CLI interfaces via pluggable adapters.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| CLIManager.ts | Session lifecycle, message logging, session search, cost/audit tracking | CLIManager: startSession(), sendInput(), stopSession(), listSessions(), getSession(), getSessionMessageLog(), persistSession(), searchSessions(), setNotifyCallback(), setAuditCallback(), setCostRecordCallback() |
| CopilotAdapter.ts | GitHub Copilot CLI argument building and output parsing | CopilotAdapter: buildArgs(), parseOutput(), startSession(), sendInput(), sendSlashCommand() |
| ClaudeCodeAdapter.ts | Claude Code CLI argument building and output parsing | ClaudeCodeAdapter: buildArgs(), parseOutput(), startSession(), sendInput(), sendSlashCommand() |
| LocalModelAdapter.ts | Ollama/LM Studio HTTP adapter for local models | LocalModelAdapter: detectServers(), buildArgs(), parseOutput(), startSession(), sendInput(), sendSlashCommand(), streamChat() |
| types.ts | Session and adapter interfaces | ICLIAdapter, ActiveSession, SessionOptions, ParsedOutput, SubAgentInfo, SubAgentProcess, SubAgentStatus |

## Architecture Notes
- **Session store**: electron-store (encrypted) persists up to 50 sessions; purges sessions older than 30 days on startup; each session stores up to 500 messages.
- **Adapter pattern**: ICLIAdapter interface with implementations for Copilot, Claude, and Local models. Each adapter handles CLI-specific flags, output parsing (text/JSON/permissions/errors), and process I/O.
- **Output parsing**: Copilot parses JSON events (tool_call, permission_request, error, thinking) and plain text; Claude matches permission prompts via regex; strips ANSI codes uniformly.
- **Turn handling**: Each turn can process user input, append context if deferred agent was set, log output, estimate costs, and emit audit events.
- **Cost estimation**: Rough token counting (1 token ≈ 4 chars); pricing tables for gpt-5-mini, claude-sonnet-4.5, gemini-2.5-pro, etc.; cost callback invoked per completed turn.
- **Audit logging**: Hash-based prompt logging (SHA256 first 16 chars) + session lifecycle events + tool approvals recorded to encrypted compliance store.
- **Persisted sessions**: Rehydrated from electron-store on app restart; message log truncated to last 500 entries per session.

## Business Context
Core execution engine for the app. Spawns Copilot/Claude CLI processes, streams interactive output to the UI, records all interactions for history/search, tracks spending, and enforces audit compliance.
