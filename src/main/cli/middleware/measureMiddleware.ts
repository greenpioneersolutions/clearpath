import type { Middleware } from './pipeline'
import { computeBreakdown } from '../../tokenization/computeBreakdown'

/**
 * Tokenize each slice independently and populate `ctx.tokens` with the
 * breakdown. When `ctx.slices` is undefined we treat the entire prompt as the
 * user-text slice (the legacy single-slice attribution path). This middleware
 * is the last server-side step before the prompt is handed to the adapter —
 * emitting `cli:prompt-shaped` happens in CLIManager once the pipeline returns.
 */
export const measureMiddleware: Middleware = (ctx) => {
  const breakdown = computeBreakdown(ctx.slices, ctx.model, ctx.prompt)
  return { ...ctx, tokens: breakdown }
}
