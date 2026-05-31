import { useState, useEffect, useCallback } from 'react'
import type { AuthState, ProviderAuthState, AuthStatus } from '../types/ipc'
import type { BackendId } from '../../../shared/backends'

export interface ProviderReadiness {
  installed: boolean
  authenticated: boolean
}

export interface ProviderReadinessFull {
  cli: ProviderReadiness
  sdk: ProviderReadiness
  /** True when at least one transport (CLI or SDK) is installed AND authenticated. */
  ready: boolean
}

export interface AuthReadiness {
  copilot: ProviderReadinessFull
  claude:  ProviderReadinessFull
  /** False until the first auth probe completes. UIs can use this to avoid a red-flash on cold start. */
  loaded: boolean
  /** Re-read status from the main process (honors its 5-min cache). */
  refresh: () => void
  /**
   * Force main to re-run the real install + auth checks, bypassing its cache.
   * Use this to self-heal a stale "not authenticated" verdict (e.g. the user
   * signed in via the CLI and the cached cold-start probe missed it).
   */
  forceRefresh: () => void
}

/**
 * Flatten an `AuthReadiness` snapshot into the list of backends that are
 * installed AND authenticated. Shared by every "pick a CLI to launch" surface
 * (Home, Sessions launchpad) so they can't disagree about what's connected.
 * Returns `[]` before the probe completes (`loaded === false`).
 */
export function readyBackendsOf(auth: AuthReadiness): BackendId[] {
  if (!auth.loaded) return []
  const out: BackendId[] = []
  if (auth.copilot.cli.installed && auth.copilot.cli.authenticated) out.push('copilot-cli')
  if (auth.copilot.sdk.installed && auth.copilot.sdk.authenticated) out.push('copilot-sdk')
  if (auth.claude.cli.installed && auth.claude.cli.authenticated) out.push('claude-cli')
  if (auth.claude.sdk.installed && auth.claude.sdk.authenticated) out.push('claude-sdk')
  return out
}

function isProviderAuthState(v: unknown): v is ProviderAuthState {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.cli === 'object' && o.cli !== null && typeof o.sdk === 'object' && o.sdk !== null
}

function toReadiness(s: AuthStatus | undefined): ProviderReadiness {
  return { installed: !!s?.installed, authenticated: !!s?.authenticated }
}

function isReadyState(s: AuthStatus | undefined): boolean {
  return !!s?.installed && !!s?.authenticated
}

const EMPTY_PROVIDER: ProviderReadinessFull = {
  cli: { installed: false, authenticated: false },
  sdk: { installed: false, authenticated: false },
  ready: false,
}

/**
 * One source of truth for "is this provider connected and usable" across the app.
 * Both the sidebar dot and the sessions launchpad chip should consume this hook
 * — that way they can't disagree.
 *
 * Refreshes triggered by:
 *   - mount
 *   - `auth:status-changed` push event from AuthManager (after login/install)
 *   - legacy `sidebar:refresh` window event (workspace/policy changes piggyback on this)
 *
 * Deliberately no `useLocation` dependency — route changes used to be a
 * heuristic refresh in the old Sidebar, but with the push channel above we
 * don't need it, and keeping the hook router-agnostic means it works in
 * tests and any component without a MemoryRouter wrapper.
 */
export function useAuthStatus(): AuthReadiness {
  const [state, setState] = useState<Omit<AuthReadiness, 'refresh'>>({
    copilot: EMPTY_PROVIDER,
    claude:  EMPTY_PROVIDER,
    loaded: false,
  })

  const probe = useCallback(async (force = false): Promise<void> => {
    // Primary: auth:get-status (cached) or auth:refresh (forces a fresh probe).
    // Both resolve to the same AuthState shape — splits cli vs sdk readiness.
    try {
      const raw = await window.electronAPI.invoke(force ? 'auth:refresh' : 'auth:get-status') as AuthState | null
      if (raw && isProviderAuthState(raw.copilot) && isProviderAuthState(raw.claude)) {
        setState({
          copilot: {
            cli: toReadiness(raw.copilot.cli),
            sdk: toReadiness(raw.copilot.sdk),
            ready: isReadyState(raw.copilot.cli) || isReadyState(raw.copilot.sdk),
          },
          claude: {
            cli: toReadiness(raw.claude.cli),
            sdk: toReadiness(raw.claude.sdk),
            ready: isReadyState(raw.claude.cli) || isReadyState(raw.claude.sdk),
          },
          loaded: true,
        })
        return
      }
    } catch { /* fall through to legacy fallback below */ }

    // Fallback: cli:check-installed returns install state only. Treat "installed
    // but unknown auth" as not-ready so the UI doesn't promise something we
    // can't deliver — the next refresh will fill in the auth signal.
    try {
      const status = await window.electronAPI.invoke('cli:check-installed') as { copilot?: boolean; claude?: boolean } | null
      const copilotInstalled = !!status?.copilot
      const claudeInstalled  = !!status?.claude
      setState({
        copilot: {
          cli: { installed: copilotInstalled, authenticated: false },
          sdk: { installed: false, authenticated: false },
          ready: false,
        },
        claude: {
          cli: { installed: claudeInstalled, authenticated: false },
          sdk: { installed: false, authenticated: false },
          ready: false,
        },
        loaded: true,
      })
    } catch {
      setState((prev) => ({ ...prev, loaded: true }))
    }
  }, [])

  // Stable callbacks so consumers can safely list them in effect deps without
  // re-subscribing every render.
  const refresh = useCallback((): void => { void probe(false) }, [probe])
  const forceRefresh = useCallback((): void => { void probe(true) }, [probe])

  // Initial fetch.
  useEffect(() => { void probe(false) }, [probe])

  // Subscribe to AuthManager push events. AuthManager.refresh() broadcasts this
  // after login completes and after npm install completes, so the UI updates
  // without the user having to navigate or click anything.
  useEffect(() => {
    const handler = (): void => { void probe(false) }
    const off = window.electronAPI.on?.('auth:status-changed', handler)
    return () => { if (typeof off === 'function') off() }
  }, [probe])

  // Backward compatibility with code that still dispatches sidebar:refresh
  // (workspace switches, policy changes, etc. piggyback on this).
  useEffect(() => {
    const handler = (): void => { void probe(false) }
    window.addEventListener('sidebar:refresh', handler)
    return () => window.removeEventListener('sidebar:refresh', handler)
  }, [probe])

  return { ...state, refresh, forceRefresh }
}
