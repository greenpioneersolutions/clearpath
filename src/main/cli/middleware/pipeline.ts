import type { BackendId } from '../../../shared/backends'
import type { PromptSlices, SliceTokenBreakdown } from '../../../shared/tokenization/types'
import type { ClassificationResult } from '../../routing/DifficultyClassifier'
import { log } from '../../utils/logger'

/**
 * Per-turn context that flows through the pre-send middleware pipeline. Each
 * middleware receives this object, may mutate `prompt` / `slices` / `notes`,
 * and returns the same (or a new) ctx for the next middleware. Phases 3-5
 * extend this surface — keep the shape additive so they can layer on without
 * touching the existing middlewares.
 */
export interface MiddlewareContext {
  sessionId: string
  cli: BackendId
  model: string
  prompt: string
  slices?: PromptSlices
  meta: {
    turnIndex: number
    isFirstTurn: boolean
  }
  /** Populated by measureMiddleware. Undefined before measure has run. */
  tokens?: {
    userPrompt: number
    agentPrompt: number
    notesFramed: number
    contextSources: number
    fleetPrefix: number
    injectedTotal: number
    total: number
  }
  /**
   * Byte offset in `prompt` where the volatile `userText` slice starts.
   * Populated by `prefixOrderMiddleware` (Phase 3); undefined when the
   * pipeline ran without slices. Adapters that drive direct-API paths read
   * this to decide where to drop a `cache_control` breakpoint between the
   * stable prefix and the volatile suffix.
   */
  cacheBreakpoint?: number
  /**
   * Human-readable diagnostic notes appended by each middleware. The
   * `cli:prompt-shaped` event ships these so the renderer can surface lint
   * savings or other interventions to the user.
   */
  notes: string[]
  /**
   * Token Coach Phase 4 — routing fields.
   *
   * `routedModel` is the model the routing middleware decided this turn
   * should use. Always populated when routing is ENABLED (so the chip /
   * cost record always have a concrete value to display), undefined when
   * routing is disabled or skipped (e.g., user override). Note that this
   * may equal `ctx.model` — e.g., the session is already on the routed tier.
   *
   * `classification` is the raw heuristic output the chip uses for tooltips.
   *
   * `userOverride` carries an explicit per-turn model picked by the user via
   * the chip. When set, the routing middleware skips its decision and leaves
   * `ctx.model` set to `userOverride.model`. The cost record marks the turn
   * with `userOverride: true` so Insights (Phase 5) can count override
   * frequency and suggest threshold tweaks.
   */
  routedModel?: string
  classification?: ClassificationResult
  userOverride?: { model: string }
}

/**
 * A middleware is a pure (no-side-effect-on-shared-state) function that takes
 * the current ctx and returns the next one. May be sync or async — the
 * pipeline runner awaits each step regardless, so async / sync interop is
 * transparent at the call site.
 */
export type Middleware = (ctx: MiddlewareContext) => Promise<MiddlewareContext> | MiddlewareContext

/**
 * Run middlewares in order. If any throws, the error is logged and the LAST
 * successful ctx is returned — the goal is to never break a turn because of a
 * bug in a middleware. The caller can detect partial runs by checking which
 * middleware-specific fields are populated (e.g. `tokens` would be missing).
 */
export async function runPipeline(
  ctx: MiddlewareContext,
  mws: Middleware[],
): Promise<MiddlewareContext> {
  let current = ctx
  for (const mw of mws) {
    try {
      current = await mw(current)
    } catch (err) {
      log.warn('[pipeline] middleware threw, aborting pipeline: %s', err instanceof Error ? err.message : String(err))
      return current
    }
  }
  return current
}

// Re-export so internal consumers don't need to reach into shared/.
export type { SliceTokenBreakdown }
