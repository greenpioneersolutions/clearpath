/**
 * Backend identifiers and helpers shared between main and renderer.
 *
 * We support four backends — two providers (Copilot, Claude) crossed with two
 * transports (CLI, SDK). The flat union is the canonical shape; `providerOf`
 * and `transportOf` are the two cheap getters everything else composes from.
 *
 * Legacy ids `'copilot'` and `'claude'` that predate the CLI/SDK split are
 * migrated to `'copilot-cli'` / `'claude-cli'` at application boot. See
 * `LEGACY_BACKEND_MIGRATION` below and the session-store migration in
 * [CLIManager](../main/cli/CLIManager.ts) for the one-time rewrite.
 */

export type BackendId =
  | 'copilot-cli'
  | 'copilot-sdk'
  | 'claude-cli'
  | 'claude-sdk'

export type BackendProvider = 'copilot' | 'claude'
export type BackendTransport = 'cli' | 'sdk'

/** Legacy ids that older persisted data may still contain. */
export type LegacyBackendId = 'copilot' | 'claude'

/** True when the id is a valid BackendId (not a legacy shape). */
export function isBackendId(id: unknown): id is BackendId {
  return id === 'copilot-cli' || id === 'copilot-sdk' ||
    id === 'claude-cli' || id === 'claude-sdk'
}

export function providerOf(id: BackendId | LegacyBackendId): BackendProvider {
  if (id === 'copilot' || id === 'copilot-cli' || id === 'copilot-sdk') return 'copilot'
  return 'claude'
}

export function transportOf(id: BackendId): BackendTransport {
  return id === 'copilot-sdk' || id === 'claude-sdk' ? 'sdk' : 'cli'
}

/** User-facing labels. Explicit CLI/SDK naming per product decision. */
export const BACKEND_LABELS: Record<BackendId, string> = {
  'copilot-cli': 'Copilot CLI',
  'copilot-sdk': 'Copilot SDK',
  'claude-cli':  'Claude CLI',
  'claude-sdk':  'Claude SDK',
}

export const BACKEND_SHORT_LABELS: Record<BackendId, string> = {
  'copilot-cli': 'Copilot',
  'copilot-sdk': 'Copilot',
  'claude-cli':  'Claude',
  'claude-sdk':  'Claude',
}

/**
 * One-time migration map applied to any persisted `cli` field. The
 * CLIManager applies this to `clear-path-sessions.json` at startup; other
 * stores/handlers that read legacy data should call `migrateLegacyBackendId`
 * before passing the value on.
 */
export const LEGACY_BACKEND_MIGRATION: Record<LegacyBackendId, BackendId> = {
  copilot: 'copilot-cli',
  claude:  'claude-cli',
}

/** Accept a legacy or modern id, always return a modern BackendId. */
export function migrateLegacyBackendId(id: string): BackendId {
  if (isBackendId(id)) return id
  if (id === 'copilot') return 'copilot-cli'
  if (id === 'claude') return 'claude-cli'
  // Unknown — default to copilot-cli so existing sessions don't get stranded.
  return 'copilot-cli'
}

/** Ordered list used to render the 2x2 setup wizard grid (Copilot row, Claude row). */
export const BACKEND_GRID_ORDER: BackendId[] = [
  'copilot-cli',
  'copilot-sdk',
  'claude-cli',
  'claude-sdk',
]
