// ── Session activity log — shared types ───────────────────────────────────────
// A per-session record of what an agent touched: files read, files written
// (artifacts), websites fetched, and commands run. Sourced from the
// PermissionBroker (it sees every tool call + its decision). Shared between main
// and renderer via `rootDirs`. Dependency-free.

export type ActivityKind = 'read' | 'write' | 'fetch' | 'shell' | 'tool'

export interface SessionActivityEntry {
  id: string
  sessionId: string
  /** 'copilot' | 'claude'. */
  cli: string
  kind: ActivityKind
  /** Raw tool name (e.g. "Read", "Bash", "fetch"). */
  toolName: string
  /** The path / URL / command the tool acted on, when known. */
  target?: string
  /** Whether the tool call was allowed or denied. */
  decision: 'allow' | 'deny'
  timestamp: number
}
