import { useEffect, useState } from 'react'
import { contextWindowFor } from '../../../../shared/tokenization/contextWindows'

/**
 * Token Coach Phase 5 — soft-compact nudge at 70% of context window.
 *
 * Banner that appears at the top of the chat area when the running token
 * total for the session has crossed 70% of the routed model's context-window
 * size. Two CTAs: "Compact now" (dispatches /compact) and "Dismiss" (stores
 * a per-session dismissal in component state so we don't re-nudge for THIS
 * session).
 *
 * Why session-scoped dismissal: the user has acknowledged the warning for
 * this conversation — re-nudging on every turn would be spammy. They can
 * still kick off a new session ("Fresh start") which gets its own nudge
 * lifecycle.
 *
 * Why this lives as a separate component (not inline in Work.tsx): we need
 * to track dismissal per session, and pulling that state into Work would
 * couple the nudge lifecycle to the whole session map. A small component
 * with a Set of dismissed ids keeps the surface tight.
 */

const NUDGE_THRESHOLD = 0.7

export interface CompactNudgeProps {
  /** Currently active session id. Used as the dismissal key. */
  sessionId: string
  /** The routed model — drives contextWindowFor() lookup. */
  model: string
  /** Total tokens used in the session so far (sum of CostRecord.inputTokens or computed elsewhere). */
  totalTokens: number
  /** Called when the user clicks "Compact now". The caller dispatches /compact. */
  onCompact: () => void
}

export default function CompactNudge(props: CompactNudgeProps): JSX.Element | null {
  const { sessionId, model, totalTokens, onCompact } = props
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Reset the dismissal set when the session changes — different sessions
  // get their own lifecycle.
  useEffect(() => {
    // nothing to clear; dismissed is keyed by sessionId so old keys are inert
  }, [sessionId])

  const window = contextWindowFor(model)
  const pct = window > 0 ? totalTokens / window : 0

  if (pct < NUDGE_THRESHOLD) return null
  if (dismissed.has(sessionId)) return null

  const pctRounded = Math.round(pct * 100)
  // Compact normally reclaims ~50% of context — that's the typical effect.
  const projectedSavings = Math.round(totalTokens * 0.5)

  return (
    <div
      role="alert"
      data-testid="compact-nudge"
      className="flex items-center gap-3 px-4 py-2.5 mx-4 mt-3 mb-0 rounded-lg border border-amber-700/50 bg-amber-900/20 text-amber-200 text-xs"
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <span className="flex-1 leading-relaxed">
        You've used <strong className="font-semibold">{pctRounded}%</strong> of {model}'s context window.
      </span>
      <button
        type="button"
        onClick={onCompact}
        className="px-3 py-1 rounded text-[11px] font-medium bg-amber-700/40 hover:bg-amber-700/60 text-amber-100 transition-colors"
      >
        Compact now (saves ~{projectedSavings.toLocaleString()} tok)
      </button>
      <button
        type="button"
        onClick={() => setDismissed((prev) => new Set(prev).add(sessionId))}
        className="px-2 py-1 rounded text-[11px] font-medium text-amber-300/70 hover:text-amber-200 transition-colors"
      >
        Dismiss
      </button>
    </div>
  )
}
