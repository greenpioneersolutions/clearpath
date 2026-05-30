/**
 * Renderer-side slash command interceptor.
 *
 * ClearPath runs every turn as a fresh headless CLI spawn (`--print` /
 * `--prompt`), so in-session REPL slash commands like `/model` or `/clear`
 * can't be piped to a running child — they'd be received as user prompts and
 * the model would literally answer "/model gpt-5". This dispatcher catches
 * the commands that don't survive headless mode and routes them to real UI
 * actions. Anything not in the intercept set falls through to the caller's
 * `sendToCli` so existing pass-through behavior is preserved.
 *
 * Returns `true` if the command was handled locally and the caller should
 * NOT forward it to the CLI.
 */

export interface SlashDispatchHandlers {
  /** Apply a new model to the session — takes effect on the next message. */
  onModelChange: (model: string) => void
  /** Clear the session (renderer-side log + reset underlying CLI continuity). */
  onClear: () => void
  /** Navigate to the permissions settings page. */
  onPermissions: () => void
  /** Navigate to the cost / insights page. */
  onCost: () => void
  /** Stop the running session. */
  onExit: () => void
  /** Navigate to the learn / help page. */
  onHelp: () => void
  /** Navigate to the configure / settings page. */
  onConfig: () => void
  /** Emit a one-line status bubble explaining a command was a no-op. */
  onStatus: (text: string) => void
  /** Pass the command through to the CLI (the existing default behavior). */
  sendToCli: (command: string) => void
}

const COMPACT_INFO_MESSAGE =
  "ClearPath manages context automatically — no manual compaction needed."

const MODEL_USAGE_MESSAGE =
  "Usage: /model <name>. Tip: use the model chip below the chat to switch."

/**
 * Intercept a slash command. Returns true if it was handled locally and the
 * caller should NOT forward to the CLI. Returns false for any command not in
 * the intercept set — the caller is responsible for calling sendToCli in that
 * case (or letting the default catch-all do it; see dispatchOrForward below).
 */
export function dispatchSlashCommand(
  raw: string,
  h: SlashDispatchHandlers,
): boolean {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return false

  // Split into command + rest, preserving the rest as-is for the model arg.
  const firstSpace = trimmed.indexOf(' ')
  const cmd = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase()
  const rest = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim()

  switch (cmd) {
    case '/model': {
      if (!rest) {
        h.onStatus(MODEL_USAGE_MESSAGE)
        return true
      }
      h.onModelChange(rest)
      return true
    }
    case '/clear':
      h.onClear()
      return true
    case '/compact':
      h.onStatus(COMPACT_INFO_MESSAGE)
      return true
    case '/permissions':
      h.onPermissions()
      return true
    case '/cost':
    case '/usage':
      h.onCost()
      return true
    case '/exit':
      h.onExit()
      return true
    case '/help':
      h.onHelp()
      return true
    case '/config':
      h.onConfig()
      return true
    default:
      return false
  }
}

/**
 * Convenience: dispatch the command, and if not handled locally, forward to
 * the CLI. Call sites that always want one-or-the-other can use this instead
 * of branching on the return value themselves.
 */
export function dispatchOrForward(
  raw: string,
  h: SlashDispatchHandlers,
): void {
  const handled = dispatchSlashCommand(raw, h)
  if (!handled) h.sendToCli(raw)
}
