import type { Middleware } from './pipeline'
import { classify } from '../../routing/DifficultyClassifier'
import { resolveModelForDifficulty, type RoutingRules } from '../../routing/RoutingRules'
import { providerOf } from '../../../shared/backends'

/**
 * Token Coach Phase 4 — routing middleware.
 *
 * Slots AFTER `measureMiddleware` so `ctx.tokens.userPrompt` is populated and
 * the classifier has a real token count to work with. The decision flow:
 *
 *   1. If the rules are DISABLED, no-op. `ctx.model` stays as-is, no
 *      `routedModel` / `classification` set. End-state byte-identical to
 *      Phase 3 for users with the flag off.
 *   2. If `ctx.userOverride` is set, the user explicitly picked a model on
 *      the chip. We honor it absolutely — set `ctx.model = override` and
 *      record the override on `ctx.routedModel` so the cost record knows
 *      this turn was a user choice, not a routing decision.
 *   3. Otherwise, classify → resolve → mutate `ctx.model`. The classifier is
 *      pure-heuristic, so this is cheap on every turn.
 *
 * `ctx.notes` gets a one-line summary so the renderer can show the user why
 * we routed where we did, even without opening the chip's tooltip.
 *
 * IMPORTANT: this middleware constructs its classifier input from
 * `ctx.tokens.userPrompt` for length, but uses `ctx.slices?.userText ?? ctx.prompt`
 * for textual features (fence detection, multi-step keywords). Falling back
 * to the full prompt is critical for sessions that don't ship slices — the
 * classifier still works, just with a slightly more pessimistic length
 * because the injected context counts toward `userPrompt` when slices were
 * lumped into the user blob (cf. `measureMiddleware`'s legacy attribution).
 */

export interface RoutingMiddlewareDeps {
  /**
   * Lazy read so the middleware always picks up the current rules — the IPC
   * layer fan-out (`onRoutingRulesChange`) mutates the underlying object via
   * `setRoutingRules` on CLIManager, and the closure here reads through that
   * mutation. Same shape as the cachePolicy plumbing.
   */
  getRules: () => RoutingRules
}

export function createRoutingMiddleware(deps: RoutingMiddlewareDeps): Middleware {
  return (ctx) => {
    const rules = deps.getRules()

    // ── Disabled — no-op ────────────────────────────────────────────────────
    if (!rules.enabled) return ctx

    // ── User override — honor absolutely ────────────────────────────────────
    if (ctx.userOverride?.model) {
      const overrideModel = ctx.userOverride.model
      return {
        ...ctx,
        model: overrideModel,
        routedModel: overrideModel,
        notes: [...ctx.notes, `routing: user override → ${overrideModel}`],
      }
    }

    // ── Otherwise classify + route ──────────────────────────────────────────
    const provider = providerOf(ctx.cli)
    const userText = ctx.slices?.userText ?? ctx.prompt ?? ''
    const promptTokens = ctx.tokens?.userPrompt ?? 0

    const classification = classify({
      userText,
      promptTokens,
      hasAttachments: false,  // adapters don't currently surface attachment count to the pipeline
      attachmentCount: 0,
      hasSlashCommand: userText.trimStart().startsWith('/'),
      isContinuation: !ctx.meta.isFirstTurn,
    })

    const target = resolveModelForDifficulty(rules, provider, classification.difficulty)
    const topReason = classification.reasons[0] ?? classification.difficulty
    const note = `routing: ${classification.difficulty} (${Math.round(classification.confidence * 100)}%) → ${target} · ${topReason}`

    return {
      ...ctx,
      model: target,
      routedModel: target,
      classification,
      notes: [...ctx.notes, note],
    }
  }
}
