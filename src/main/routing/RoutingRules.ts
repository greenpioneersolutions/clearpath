import type { Difficulty } from './DifficultyClassifier'

/**
 * Token Coach Phase 4 — routing-rules schema + defaults.
 *
 * Per-CLI mapping from difficulty → model id. Stored on `AppSettings` (one
 * roundtrip on boot, fan-out via `onRoutingRulesChange` to every consumer
 * that needs an in-memory copy — same pattern as `cachePolicy`).
 *
 * Why per-CLI: Copilot supports model strings (`gpt-5-mini`,
 * `claude-sonnet-4.5`, `claude-opus-4.6`) while Claude Code uses shorthand
 * (`haiku`, `sonnet`, `opus`) — sharing a single mapping would inject the
 * wrong identifier into one or the other adapter. The local adapter is
 * deliberately omitted today (its model list is per-deployment); it'll get
 * a section in a later slice if/when we want to route locally.
 */

export interface RoutingTier {
  trivial: string
  normal: string
  hard: string
}

export interface RoutingRules {
  /**
   * Master switch. When false, the routing middleware no-ops:
   * `ctx.model` is untouched and the chip / IPC report the SESSION model
   * with no override. When true, the rules apply and the chip surfaces the
   * decision before send.
   */
  enabled: boolean
  copilot: RoutingTier
  claude: RoutingTier
}

/**
 * Defaults — chosen from the existing model lists ([COPILOT_MODELS in
 * src/renderer/src/types/settings.ts] and the Claude shorthand set). These
 * are conservative starting points; users tune via the RoutingSettings UI.
 *
 * - **Copilot trivial: gpt-5-mini** (free tier — included in plan)
 * - **Copilot normal: claude-sonnet-4.5** (1x credit — balanced default)
 * - **Copilot hard: claude-opus-4.6** (3x credit — most capable)
 *
 * - **Claude trivial: haiku** (cheapest, fast)
 * - **Claude normal: sonnet** (balanced default)
 * - **Claude hard: opus** (deep reasoning)
 */
export const DEFAULT_ROUTING_RULES: RoutingRules = {
  enabled: false,
  copilot: {
    trivial: 'gpt-5-mini',
    normal: 'claude-sonnet-4.5',
    hard: 'claude-opus-4.6',
  },
  claude: {
    trivial: 'haiku',
    normal: 'sonnet',
    hard: 'opus',
  },
}

/**
 * Resolve a difficulty bucket to the model id for the given CLI provider.
 * Falls back to the bucket on the default rules when a rule is missing,
 * which can happen if a stored rules row was written before we added a tier.
 */
export function resolveModelForDifficulty(
  rules: RoutingRules,
  provider: 'copilot' | 'claude',
  difficulty: Difficulty,
): string {
  const tier = provider === 'copilot' ? rules.copilot : rules.claude
  const value = tier?.[difficulty]
  if (value && typeof value === 'string' && value.length > 0) return value
  // Defensive fallback — should never trip with the typed schema, but if a
  // user hand-edited the settings file we'd rather degrade than throw.
  const fallbackTier = provider === 'copilot' ? DEFAULT_ROUTING_RULES.copilot : DEFAULT_ROUTING_RULES.claude
  return fallbackTier[difficulty]
}
