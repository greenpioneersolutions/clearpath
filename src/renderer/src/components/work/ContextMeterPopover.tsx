import type { SliceTokenBreakdown } from '../../../../shared/tokenization/types'
import { useFlag } from '../../contexts/FeatureFlagContext'

interface Props {
  breakdown: SliceTokenBreakdown
  contextWindow: number
  /**
   * Cumulative tokens consumed by prior turns in this session — surfaces as
   * its own row so the totals shown here match the chip's headline (which
   * adds this to the current draft).
   */
  priorSessionTokens?: number
  onClose: () => void
}

// Slice colors mirror the chip colors used on the active-context strip so
// users connect "I attached 2 notes (indigo chip)" to "indigo wedge in the
// breakdown popover".
const SLICES: Array<{ key: keyof Omit<SliceTokenBreakdown, 'injectedTotal' | 'total'>; label: string; color: string }> = [
  { key: 'userPrompt',     label: 'Your message',  color: 'bg-gray-400'   },
  { key: 'agentPrompt',    label: 'Prompt',        color: 'bg-green-400'  },
  { key: 'notesFramed',    label: 'Notes',         color: 'bg-indigo-400' },
  { key: 'contextSources', label: 'Sources',       color: 'bg-teal-400'   },
  { key: 'fleetPrefix',    label: 'Parallel mode', color: 'bg-sky-400'    },
]

/**
 * Popover detail for the context meter — horizontal stacked bar + per-slice
 * legend. Stays small (no chart lib) so it's instant to open.
 *
 * Token Coach Phase 3 — when `showPromptCache` is on AND the breakdown carries
 * real cache stats (`cachedInputTokens > 0`), a small "cached" badge is shown
 * next to the slices that benefit from the cached prefix (agent + notes).
 * The number itself comes from the API response — never invented — so CLI
 * passthroughs (where breakdown.cachedInputTokens is undefined) get no badge,
 * not a fake "0 cached".
 */
export default function ContextMeterPopover({ breakdown, contextWindow, priorSessionTokens = 0, onClose }: Props): JSX.Element {
  const showPromptCache = useFlag('showPromptCache')
  // Total here matches the chip's headline so the two numbers reconcile.
  const draftTotal = breakdown.total
  const total = draftTotal + priorSessionTokens
  const visibleSlices = SLICES.filter((s) => breakdown[s.key] > 0)
  const percentOfWindow = contextWindow > 0 ? (total / contextWindow) * 100 : 0
  const cachedTokens = breakdown.cachedInputTokens ?? 0
  // Cached badge only appears on slices that are part of the stable prefix —
  // agent + notes today. We never put it on userPrompt (the volatile suffix)
  // or contextSources (in-flux per turn).
  const showCachedBadge = showPromptCache && cachedTokens > 0
  const CACHED_BADGE_SLICES = new Set<keyof SliceTokenBreakdown>(['agentPrompt', 'notesFramed'])

  return (
    <div
      role="dialog"
      aria-label="Context meter details"
      className="absolute bottom-full left-0 mb-2 w-72 rounded-xl shadow-2xl border z-30 animate-fadeIn"
      style={{ backgroundColor: 'var(--brand-dark-card)', borderColor: 'var(--brand-dark-border)' }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--brand-dark-border)' }}>
        <span className="text-xs font-semibold text-gray-200">Context budget</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs leading-none"
          aria-label="Close context meter details"
        >
          &times;
        </button>
      </div>

      <div className="px-3 py-3 space-y-3">
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-lg font-semibold text-gray-100">{total.toLocaleString()}</span>
            <span className="text-[11px] text-gray-500">{percentOfWindow.toFixed(1)}% of {contextWindow.toLocaleString()}</span>
          </div>
          {/* Stacked-bar visualization. History segment renders first so the
              visual order matches the legend (history at top, then slices). */}
          <div className="h-2 rounded-full overflow-hidden flex bg-gray-800">
            {priorSessionTokens > 0 && total > 0 && (
              <div
                className="bg-amber-400/70"
                style={{ width: `${(priorSessionTokens / total) * 100}%` }}
                title={`Conversation history: ${priorSessionTokens.toLocaleString()} tokens`}
              />
            )}
            {visibleSlices.map((s) => {
              const value = breakdown[s.key]
              const pct = total > 0 ? (value / total) * 100 : 0
              if (pct === 0) return null
              return (
                <div
                  key={s.key}
                  className={s.color}
                  style={{ width: `${pct}%` }}
                  title={`${s.label}: ${value.toLocaleString()} tokens`}
                />
              )
            })}
          </div>
        </div>

        <div className="space-y-1">
          {priorSessionTokens > 0 && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400/70" aria-hidden />
                Conversation history
              </span>
              <span className="text-gray-400 tabular-nums">
                {priorSessionTokens.toLocaleString()} ({total > 0 ? ((priorSessionTokens / total) * 100).toFixed(0) : 0}%)
              </span>
            </div>
          )}
          {visibleSlices.map((s) => {
            const value = breakdown[s.key]
            const pct = total > 0 ? (value / total) * 100 : 0
            const sliceHasCacheBadge = showCachedBadge && CACHED_BADGE_SLICES.has(s.key)
            return (
              <div key={s.key} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-gray-300">
                  <span className={`inline-block w-2 h-2 rounded-full ${s.color}`} aria-hidden />
                  {s.label}
                  {sliceHasCacheBadge && (
                    <span
                      className="inline-flex items-center px-1 py-px rounded text-[9px] font-semibold uppercase tracking-wide bg-teal-500/15 text-teal-300 border border-teal-500/30"
                      title="This prefix will be reused at ~10% of normal cost on the next turn."
                      aria-label="Cached — reused from previous turn"
                    >
                      cached
                    </span>
                  )}
                </span>
                <span className="text-gray-400 tabular-nums">{value.toLocaleString()} ({pct.toFixed(0)}%)</span>
              </div>
            )
          })}
        </div>

        {showCachedBadge && (
          <div
            className="text-[10px] text-teal-300 leading-snug pt-1 border-t"
            style={{ borderColor: 'var(--brand-dark-border)' }}
          >
            {cachedTokens.toLocaleString()} tokens reused from prompt cache this turn — about a 90% discount on the cached portion.
          </div>
        )}

        <p className="text-[10px] text-gray-500 leading-snug pt-1 border-t" style={{ borderColor: 'var(--brand-dark-border)' }}>
          The larger your prompt, the more it costs each turn. Trim what the AI doesn't need to save tokens.
        </p>
      </div>
    </div>
  )
}
