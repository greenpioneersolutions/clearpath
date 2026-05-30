/**
 * Shared pricing helpers used by both the main process (PricingService,
 * CLIManager cost recording) and the renderer (cost analytics, Insights UI).
 *
 * `MODEL_PRICING` is back-compat re-exported as the legacy `{ input, output }`
 * shape so existing renderer call sites (and their tests) keep working while
 * the new typed shape gradually rolls out.
 */

import { DEFAULT_PRICING_TABLE, type ModelPriceEntry, type PricingTable } from './defaults'

export type { ModelPriceEntry, ModelProvider, PricingTable } from './defaults'
export { DEFAULT_PRICING_TABLE } from './defaults'

/**
 * Legacy compat: `Record<string, { input, output }>`. This is the shape the
 * renderer used to import from `types/cost.ts`. Keeping it stable means we
 * don't have to touch every analytics screen at once.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> =
  Object.fromEntries(
    Object.entries(DEFAULT_PRICING_TABLE.models).map(
      ([id, { input, output }]) => [id, { input, output }],
    ),
  )

const FALLBACK_PRICE = { input: 3, output: 15 } as const

/**
 * Resolve an aliased model id (e.g. `sonnet` → `claude-sonnet-4.5`) using the
 * given pricing table. If no alias is registered the id is returned as-is.
 */
export function resolveModelAlias(
  model: string,
  table: PricingTable = DEFAULT_PRICING_TABLE,
): string {
  const entry = table.models[model]
  return entry?.aliasOf && table.models[entry.aliasOf] ? entry.aliasOf : model
}

/**
 * Compute the estimated cost (USD) for a single turn.
 *
 * @param model         The model id reported by the CLI (alias or canonical).
 * @param inputTokens   Estimated input tokens for this turn.
 * @param outputTokens  Estimated output tokens for this turn.
 * @param table         Optional effective pricing table (defaults + overrides).
 *                      If omitted, the canonical defaults are used.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  table: PricingTable = DEFAULT_PRICING_TABLE,
): number {
  const lookup = (id: string): ModelPriceEntry | undefined => table.models[id]
  // Walk the alias chain once — defensively, in case an override repoints a
  // canonical id at another canonical id.
  let entry = lookup(model)
  if (entry?.aliasOf) {
    const target = lookup(entry.aliasOf)
    if (target) entry = target
  }
  const { input, output } = entry ?? FALLBACK_PRICE
  return (inputTokens * input + outputTokens * output) / 1_000_000
}
