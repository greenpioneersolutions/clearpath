export { runPipeline, type Middleware, type MiddlewareContext } from './pipeline'
export { normalizeMiddleware } from './normalizeMiddleware'
export { lintMiddleware } from './lintMiddleware'
export { measureMiddleware } from './measureMiddleware'
export { prefixOrderMiddleware } from './prefixOrderMiddleware'
export { createRoutingMiddleware, type RoutingMiddlewareDeps } from './routingMiddleware'
export { createWarningMiddleware, type WarningMiddlewareDeps } from './warningMiddleware'

import type { Middleware } from './pipeline'
import { normalizeMiddleware } from './normalizeMiddleware'
import { lintMiddleware } from './lintMiddleware'
import { measureMiddleware } from './measureMiddleware'
import { prefixOrderMiddleware } from './prefixOrderMiddleware'
import { createRoutingMiddleware, type RoutingMiddlewareDeps } from './routingMiddleware'
import { createWarningMiddleware, type WarningMiddlewareDeps } from './warningMiddleware'

// Default order. Phases 4-5 plug additional middlewares in between, but the
// pipeline obeys these structural invariants:
//   1. `prefixOrderMiddleware` runs AFTER lint so it sees lint-cleaned slice
//      text — otherwise reassembly would bake stale whitespace into the
//      cache-stable prefix and the first-turn cache hit would never land.
//   2. `measureMiddleware` runs BEFORE routing so the classifier has a real
//      token count to score difficulty with.
//   3. Routing runs after measure so its classification feeds off final tokens;
//      mutating `ctx.model` here is what CLIManager threads back into
//      `turnOptions.model` for the adapter spawn.
//   4. Warning (Phase 5) runs LAST so it sees the routed model, final token
//      counts, and cache status — the renderer reads `ctx.notes` from
//      `cli:prompt-shaped.notes` and surfaces banners above the input.
export const defaultPipeline: Middleware[] = [
  normalizeMiddleware,
  lintMiddleware,
  prefixOrderMiddleware,
  measureMiddleware,
]

/**
 * Build the full pipeline including routing + warning middlewares. Each one
 * is gated on its deps being provided so test harnesses can wire only the
 * pieces they need. Callers that omit `routing` get the legacy 4-step
 * pipeline; omitting `warning` keeps routing but skips Phase 5 nudges. The
 * fan-out pattern (a `get*` getter closure rather than a frozen rules
 * snapshot) means runtime updates take effect on the next turn without
 * rebuilding the pipeline.
 */
export function buildPipeline(deps: {
  routing?: RoutingMiddlewareDeps
  warning?: WarningMiddlewareDeps
} = {}): Middleware[] {
  const pipeline: Middleware[] = [...defaultPipeline]
  if (deps.routing) pipeline.push(createRoutingMiddleware(deps.routing))
  if (deps.warning) pipeline.push(createWarningMiddleware(deps.warning))
  return pipeline
}
