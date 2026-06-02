// ── Persisted "always allow / always deny" tool grants ────────────────────────
// Remembers the user's "Always" choices so the broker doesn't re-prompt for the
// same kind of tool every headless turn. Grants are keyed by `cli:toolClass`
// (e.g. "claude:shell") and scoped to a session or a workspace dir.

import type { PermissionDecision, ToolClass, ToolGrant } from '../../shared/permissions/types'

/** Minimal persistence surface — real impl is electron-store; tests pass a fake. */
export interface GrantsBackend {
  get(): ToolGrant[]
  set(grants: ToolGrant[]): void
}

/** Match key for a grant: the CLI plus the coarse tool class. */
export function grantKey(cli: string, toolClass: ToolClass): string {
  return `${cli}:${toolClass}`
}

export class GrantsStore {
  constructor(private backend: GrantsBackend) {}

  /**
   * Find a still-applicable grant for this request. Session-scoped grants match
   * only the same session; workspace-scoped match any session in that dir.
   * Returns the remembered decision, or undefined to fall through to a prompt.
   */
  find(cli: string, toolClass: ToolClass, sessionId: string, workspaceDir?: string): PermissionDecision | undefined {
    const key = grantKey(cli, toolClass)
    const grants = this.backend.get()
    // Prefer the narrower (session) grant if both exist.
    const session = grants.find((g) => g.key === key && g.scope === 'session' && g.sessionId === sessionId)
    if (session) return session.decision
    const ws = grants.find((g) => g.key === key && g.scope === 'workspace' && !!workspaceDir && g.workspaceDir === workspaceDir)
    return ws?.decision
  }

  /** Record (or replace) a grant for the given scope. */
  record(args: {
    cli: string
    toolClass: ToolClass
    decision: PermissionDecision
    scope: 'session' | 'workspace'
    sessionId?: string
    workspaceDir?: string
    now: number
  }): void {
    const key = grantKey(args.cli, args.toolClass)
    const grants = this.backend.get().filter((g) => !sameTarget(g, key, args))
    grants.push({
      key,
      decision: args.decision,
      scope: args.scope,
      sessionId: args.scope === 'session' ? args.sessionId : undefined,
      workspaceDir: args.scope === 'workspace' ? args.workspaceDir : undefined,
      createdAt: args.now,
    })
    this.backend.set(grants)
  }

  /** Drop all session-scoped grants for a session (called on session delete/stop). */
  clearSession(sessionId: string): void {
    const grants = this.backend.get().filter((g) => !(g.scope === 'session' && g.sessionId === sessionId))
    this.backend.set(grants)
  }
}

function sameTarget(
  g: ToolGrant,
  key: string,
  args: { scope: 'session' | 'workspace'; sessionId?: string; workspaceDir?: string },
): boolean {
  if (g.key !== key || g.scope !== args.scope) return false
  if (args.scope === 'session') return g.sessionId === args.sessionId
  return g.workspaceDir === args.workspaceDir
}
