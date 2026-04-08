# Tools Components — MCP servers, permissions, and tool access control

## Purpose
Manages Model Context Protocol (MCP) servers, tool permission modes, tool allowlist/denylist, and responds to permission requests from running CLI sessions in real-time. These components are the UI for controlling what tools an AI agent can access and how permission prompts are handled.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| McpManager.tsx | Add/edit/remove/toggle MCP servers; supports user-scoped and project-scoped configs | McpManager |
| PermissionModeSelector.tsx | Radio button selector for Claude (default/plan/acceptEdits/auto/bypassPermissions) and Copilot (default/allow-all/allow-all-tools/yolo) permission presets | PermissionModeSelector |
| PermissionRequestHandler.tsx | Listens for 'cli:permission-request' events; shows pending requests, allows approve/deny, auto-approve toggle | PermissionRequestHandler |
| ToolToggles.tsx | Manage allowed/disallowed/denied/available/excluded tool lists; CLI-specific (Claude vs Copilot) with tag input | ToolToggles |

## Architecture Notes

**Pattern:** Thin UI layer + IPC invocations. McpManager and ToolToggles are config editors; PermissionRequestHandler is a real-time event listener.

**State management:**
- McpManager: Local state for servers list, add form (name, command, args, scope), error/success messages
- PermissionModeSelector: Controlled via parent props (claudeMode, copilotPreset, callbacks)
- PermissionRequestHandler: Stores pending + resolved requests; listens to IPC events via window.electronAPI.on()
- ToolToggles: Local state for each tool list; tag input UI with add/remove buttons

**Key IPC channels:**
- `tools:list-mcp-servers`, `tools:add-mcp-server`, `tools:toggle-mcp-server`, `tools:remove-mcp-server`
- `cli:list-sessions`, `cli:permission-request` (event), `cli:send-input`

**Event flow (PermissionRequestHandler):**
1. Component mounts → listens to `cli:permission-request` event
2. Event fires: { sessionId, request: ParsedOutput }
3. Component finds session from stored sessions list, builds PermissionRequest object
4. If autoApprove is on → auto-send 'y' input; else → show in UI
5. User clicks Allow/Deny → invoke `cli:send-input` with 'y' or 'n'
6. Request moves to resolved history, cleared on "Clear resolved" button

**MCP Server config:**
- User scope: stored in `~/.claude/mcp-config.json` or `~/.copilot/`
- Project scope: stored in `.claude/mcp-config.json` or `.github/copilot/mcp-config.json`
- Command + args: e.g. `npx @modelcontextprotocol/server-filesystem /path/to/dir`
- Toggle per-session enable/disable without deleting

**Permission modes:**
- **Claude:** default (prompt each), plan (auto-read, prompt-write), acceptEdits (auto-edits, prompt-shell), auto (most auto), bypassPermissions (all auto, dangerous)
- **Copilot:** default (prompt), allow-all (all permissions), allow-all-tools (file paths), yolo (no prompts, dangerous)

**Tool lists (ToolToggles):**
- **Both CLIs:** allowedTools (auto-approve patterns)
- **Claude only:** disallowedTools (hide from model)
- **Copilot only:** deniedTools (block), availableTools (whitelist), excludedTools (block)
- Each list is a string array; tag input UI with Enter to add, x to remove

**Permission modes visual:**
- Dangerous modes (bypassPermissions, yolo) highlighted in red with "Caution" label
- Active mode shows checkmark badge
- Descriptions explain behavior clearly

## Business Context

**User flows:**
1. Developer opens Tools tab to see/manage MCP servers for their workspace
2. Adds custom MCP server: enters name, command (e.g. `npx my-mcp-server`), args, scope
3. Toggles MCP servers on/off per session without deleting
4. Runs a CLI session (Copilot or Claude Code) that needs tool permissions
5. PermissionRequestHandler catches permission requests in real-time, displays in UI
6. Developer approves/denies each request, or enables auto-approve for testing
7. Sets permission mode (e.g. "Plan" for Claude: auto-approve reads, prompt writes)
8. Configures tool filters: allowed list, denied list, etc.
9. Copies MCP install command from PluginManager, runs in terminal, restarts session

Powers the **Tools/MCP management UI** and **real-time permission approval flow** during active sessions. Essential for managing tool scope, security, and development workflow.
