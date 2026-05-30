/**
 * Token Coach Phase 4 — shared types for the routing chip + settings.
 *
 * These mirror the main-process types in `src/main/routing/`. We don't import
 * from main into the renderer because the main routing module pulls in
 * Node-only deps elsewhere in its tree — keeping a small renderer-side mirror
 * is cheaper than threading those through the renderer bundle.
 */

export type Difficulty = 'trivial' | 'normal' | 'hard'

export interface ClassificationResult {
  difficulty: Difficulty
  confidence: number
  reasons: string[]
}

export interface RoutingTier {
  trivial: string
  normal: string
  hard: string
}

export interface RoutingRules {
  enabled: boolean
  copilot: RoutingTier
  claude: RoutingTier
}
