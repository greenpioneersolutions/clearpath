// Published context-window sizes (input tokens) for the models ClearPath
// supports. Sourced from each vendor's docs at time of writing — keep this
// table conservative; missing entries fall back to DEFAULT_CONTEXT_WINDOW.
//
// The number we care about for the meter is "what fraction of the budget is
// already used", so even a roughly-correct value is more useful than none.

const CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic — Claude family. Claude 3.5+ ship with a 200K window.
  'claude-sonnet-4.5':  200_000,
  'claude-sonnet-4.6':  200_000,
  'claude-opus-4.5':    200_000,
  'claude-opus-4.6':    200_000,
  'claude-opus-4.7':    200_000,
  'claude-haiku-4.5':   200_000,
  'sonnet':             200_000,
  'opus':               200_000,
  'haiku':              200_000,

  // OpenAI — GPT-5 family. 128K is the public default for chat variants.
  'gpt-5':              272_000,
  'gpt-5-mini':         128_000,
  'gpt-5.1-codex':      272_000,
  'gpt-4o':             128_000,
  'gpt-4o-mini':        128_000,
  'gpt-4-turbo':        128_000,
  'o1':                 200_000,
  'o3':                 200_000,
  'o4':                 200_000,

  // Google — Gemini 3 Pro.
  'gemini-3-pro':       1_000_000,
  'gemini-2.5-pro':     1_000_000,
}

export const DEFAULT_CONTEXT_WINDOW = 200_000

/**
 * Look up the input-token context-window size for a given model. Falls back
 * to `DEFAULT_CONTEXT_WINDOW` when the model isn't in the table — that keeps
 * the meter meaningful (just less precise) for new or local models.
 */
export function contextWindowFor(model: string | undefined | null): number {
  if (!model) return DEFAULT_CONTEXT_WINDOW
  const direct = CONTEXT_WINDOWS[model]
  if (direct !== undefined) return direct
  // Loose match on family prefix so "claude-sonnet-4.6-20260201" still maps.
  const lower = model.toLowerCase()
  for (const key of Object.keys(CONTEXT_WINDOWS)) {
    if (lower.startsWith(key.toLowerCase())) return CONTEXT_WINDOWS[key]
  }
  return DEFAULT_CONTEXT_WINDOW
}
