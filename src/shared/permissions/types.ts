// ── Per-tool permission broker — shared types ─────────────────────────────────
// Shared between main and renderer via the `rootDirs` virtual merge configured
// in tsconfig.main.json / tsconfig.renderer.json (same mechanism as
// src/shared/files/types.ts). Must remain dependency-free (no Node, no Electron,
// no React imports).

/** Coarse category a tool falls into, used to pick a default behaviour. */
export type ToolClass = 'read' | 'edit' | 'shell' | 'mcp' | 'other'

/** What to do with a tool request before any user interaction. */
export type ToolBehavior = 'allow' | 'prompt' | 'deny'

/** The user's (or policy's) decision for a single tool request. */
export type PermissionDecision = 'allow' | 'deny'

/** How long a granted "always" decision should stick. */
export type GrantScope = 'once' | 'session' | 'workspace'

/**
 * The default behaviour for each tool class plus the hard rules, derived from the
 * active Policy preset. Computed in the main process by `permissionProfileForPolicy`.
 */
export interface PermissionProfile {
  policyId: string
  policyName: string
  /** Default behaviour per tool class before consulting grants / prompting. */
  byClass: Record<ToolClass, ToolBehavior>
  /** Tool patterns that are always denied (from PolicyRules.blockedTools). */
  blockedTools: string[]
  /** File globs that are always denied for file-touching tools. */
  blockedFilePatterns: string[]
}

/**
 * A permission request as surfaced to the renderer modal. Carries only what the
 * UI needs — never the broker token. `inputPreview` is a redacted, single-line
 * summary of the tool input (never raw secrets / full file bodies).
 */
export interface PermissionRequest {
  /** Stable id the renderer echoes back via `permission:respond`. */
  requestId: string
  sessionId: string
  /** 'copilot' | 'claude' — which CLI asked. */
  cli: string
  sessionName?: string
  /** Raw tool name as the CLI reported it (e.g. "Bash", "shell(git status)"). */
  toolName: string
  /** Coarse classification used for the default decision + grant matching. */
  toolClass: ToolClass
  /** Redacted one-line preview of the tool input for display. */
  inputPreview: string
  /** Active policy name, for "Allowed/denied by <policy>" context in the UI. */
  policyName: string
  timestamp: number
}

/** The renderer's reply to a pending request. */
export interface PermissionResponse {
  requestId: string
  decision: PermissionDecision
  /** When set, remember this decision for future matching tools at this scope. */
  remember?: GrantScope
}

/** A persisted "always allow / always deny" grant. */
export interface ToolGrant {
  /** Match key — see `grantKey()` (cli + toolClass, or cli + exact toolName). */
  key: string
  decision: PermissionDecision
  scope: Exclude<GrantScope, 'once'>
  /** Present for session-scoped grants; absent for workspace-scoped. */
  sessionId?: string
  /** Present for workspace-scoped grants. */
  workspaceDir?: string
  createdAt: number
}
