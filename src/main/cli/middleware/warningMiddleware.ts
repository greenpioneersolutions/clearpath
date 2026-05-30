import type { Middleware } from './pipeline'
import { contextWindowFor } from '../../../shared/tokenization/contextWindows'
import type { PricingTable } from '../../../shared/pricing/defaults'
import { estimateCost } from '../../../shared/pricing'

/**
 * Token Coach Phase 5 — pre-send warning middleware.
 *
 * Slots LAST in the pipeline so it sees the final routed model, the final
 * post-lint / post-reorder prompt, and the per-slice token breakdown. Emits
 * severity-prefixed one-liners into `ctx.notes`. The renderer reads them off
 * `cli:prompt-shaped.notes` and surfaces them as small banners above the
 * input.
 *
 * Warning rules (each gated by an explicit threshold — below threshold,
 * SILENT. No spammy warnings.):
 *
 *   1. High-cost: estimated turn cost > $0.05 — names the top contributing
 *      slice (e.g. "60% from agent prompt").
 *   2. Huge attachment: any single slice (notes, context-sources) > 5,000 tok.
 *   3. Context-window: total injected + user > 70% of the routed model's
 *      published context-window size.
 *   4. Cheap-route override: classifier said trivial but the user overrode
 *      to a more expensive tier — quantifies the cost multiplier.
 *
 * Deduplication: at most ONE warning per turn, ranked
 *      context-window > high-cost > huge-attachment > cheap-route-override.
 * Picking just the strongest signal keeps the banner stack short and the
 * actionable.
 *
 * Per spec: skip the wasted-output warning at pre-send time (no output info
 * available yet — would just be noise).
 *
 * Severity prefix convention (matches Phase 4):
 *   "warn:" — material cost / size concern. Renderer renders amber/red banner.
 *   "info:" — heads-up where no action is strictly needed. Renderer renders
 *             gray/teal banner.
 */

export interface WarningMiddlewareDeps {
  /**
   * Lazy lookup of the pricing table so user overrides + remote sync layers
   * take effect immediately. Same pattern as the routing rules getter.
   */
  getPricingTable: () => PricingTable
}

/** Estimated cost above which we surface the high-cost warning. */
export const HIGH_COST_USD_THRESHOLD = 0.05
/** Token threshold for the per-slice "huge attachment" warning. */
export const HUGE_SLICE_TOKEN_THRESHOLD = 5000
/** Context-window utilization threshold for the meter warning. */
export const CONTEXT_WINDOW_WARN_PCT = 0.7

interface SliceContribution {
  name: string
  tokens: number
}

/** Format a USD amount for the warning text — tight, no trailing zeros. */
function fmtUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`
  if (amount < 1) return `$${amount.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
  return `$${amount.toFixed(2)}`
}

export function createWarningMiddleware(deps: WarningMiddlewareDeps): Middleware {
  return (ctx) => {
    // Without tokens we have nothing to score — silent no-op.
    if (!ctx.tokens) return ctx

    const t = ctx.tokens
    const model = ctx.routedModel ?? ctx.model
    const table = deps.getPricingTable()

    // Estimate this turn's input-only cost. Output is unknowable pre-send so
    // we score conservatively against input only; the threshold is calibrated
    // against that ($0.05 input on Opus ~= 10k tokens).
    const inputCost = estimateCost(model, t.total, 0, table)

    // ── Rule 1: High cost ───────────────────────────────────────────────────
    const highCost = inputCost > HIGH_COST_USD_THRESHOLD

    // ── Rule 2: Huge attachment ─────────────────────────────────────────────
    // Walk the slice contributions and find the single biggest one over the
    // threshold. We treat notes and context-sources as the candidates here —
    // user text is what they're typing right now, agent prompt is fixed by
    // their persona choice, and fleet is a flag they toggle deliberately.
    const sliceContribs: SliceContribution[] = [
      { name: 'notes', tokens: t.notesFramed },
      { name: 'context sources', tokens: t.contextSources },
    ]
    const hugeSlice = sliceContribs
      .filter((s) => s.tokens > HUGE_SLICE_TOKEN_THRESHOLD)
      .sort((a, b) => b.tokens - a.tokens)[0]

    // ── Rule 3: Context window ──────────────────────────────────────────────
    const cw = contextWindowFor(model)
    const pct = t.total / cw
    const contextHigh = pct >= CONTEXT_WINDOW_WARN_PCT

    // ── Rule 4: Cheap-route override ────────────────────────────────────────
    // The user override path on Phase 4 leaves `classification` undefined and
    // sets `userOverride` directly. To detect "trivial but overrode up", we
    // need (a) the classifier *would* have said trivial AND (b) the override
    // model exists. Today the routing middleware short-circuits on override
    // (doesn't classify), so we only catch this if a future revision attaches
    // the classification to override turns. For now, this branch fires when
    // `classification.difficulty === 'trivial'` AND `userOverride.model` is
    // set — which currently only happens if downstream code adds classification
    // to override turns. Conservative: if we can't be sure, stay silent.
    let cheapRouteOverride: { override: string; multiplier: number } | undefined
    if (ctx.userOverride?.model && ctx.classification?.difficulty === 'trivial') {
      // Compute the cost multiplier override vs. trivial-tier price.
      // We don't know what model the trivial tier WOULD have routed to here —
      // approximate by comparing the override's input price against gpt-5-mini
      // (the canonical "cheap" tier baseline). When the price math fails (no
      // pricing data, missing alias), we degrade gracefully and skip.
      const overrideCost = estimateCost(ctx.userOverride.model, 1_000_000, 0, table)
      const cheapBaseline = estimateCost('gpt-5-mini', 1_000_000, 0, table)
      if (overrideCost > 0 && cheapBaseline > 0) {
        const multiplier = overrideCost / cheapBaseline
        if (multiplier >= 2) {
          cheapRouteOverride = { override: ctx.userOverride.model, multiplier }
        }
      }
    }

    // ── Pick at most ONE warning (strongest first) ──────────────────────────
    const notes: string[] = []

    if (contextHigh) {
      const pctRounded = Math.round(pct * 100)
      notes.push(
        `warn: you're at ${pctRounded}% of ${model}'s context window. Consider /compact or a fresh start.`,
      )
    } else if (highCost) {
      // Find the slice contributing the most to the cost (by token share of total).
      const contributions: SliceContribution[] = [
        { name: 'user prompt', tokens: t.userPrompt },
        { name: 'agent prompt', tokens: t.agentPrompt },
        { name: 'notes', tokens: t.notesFramed },
        { name: 'context sources', tokens: t.contextSources },
        { name: 'fleet prefix', tokens: t.fleetPrefix },
      ]
      const top = contributions.sort((a, b) => b.tokens - a.tokens)[0]
      const share = t.total > 0 ? Math.round((top.tokens / t.total) * 100) : 0
      const topLabel = top.tokens > 0 ? ` ${share}% from ${top.name}.` : ''
      notes.push(
        `warn: this prompt would cost ~${fmtUsd(inputCost)}.${topLabel}`,
      )
    } else if (hugeSlice) {
      const suggestion = hugeSlice.name === 'notes'
        ? 'consider trimming — you can prune this in Notes.'
        : 'consider trimming.'
      notes.push(
        `warn: ${hugeSlice.name} is ${hugeSlice.tokens.toLocaleString()} tok. ${suggestion}`,
      )
    } else if (cheapRouteOverride) {
      notes.push(
        `info: this prompt looks simple but you've overridden to ${cheapRouteOverride.override}. Costs ~${cheapRouteOverride.multiplier.toFixed(0)}× more than the auto-route.`,
      )
    }

    if (notes.length === 0) return ctx
    return { ...ctx, notes: [...ctx.notes, ...notes] }
  }
}
