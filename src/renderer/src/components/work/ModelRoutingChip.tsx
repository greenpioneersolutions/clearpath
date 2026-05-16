import { useState, useEffect, useRef, useMemo } from 'react'
import type { BackendId } from '../../../../shared/backends'
import type { Difficulty, ClassificationResult } from '../../types/routing'

interface Props {
  cli: BackendId
  /** Current user text — re-classified on change (debounced). */
  userText: string
  /** True when the user has files attached (e.g., to bump difficulty). */
  hasAttachments?: boolean
  attachmentCount?: number
  /** True for turn 2+ (lets the classifier apply the continuation penalty). */
  isContinuation?: boolean
  /**
   * Token count for the user text. The renderer's ContextMeterChip already
   * computes this via `tokenizer:count-multi`; the Work page can pass it
   * straight through here so we don't double-tokenize.
   */
  promptTokens?: number
  /**
   * Current user-override (per-turn) — driven by Work.tsx state. The chip
   * highlights the active tier when this matches one of the routed tiers,
   * or shows it as a separate "override" pill otherwise.
   */
  userOverride?: string | null
  /** Setter for the per-turn override. Pass an empty string / null to clear. */
  onOverride: (model: string | null) => void
}

interface ClassifyResult {
  classification: ClassificationResult
  routedModel: string
  enabled: boolean
}

const DEBOUNCE_MS = 250

/**
 * Token Coach Phase 4 — Model routing chip.
 *
 * Sits next to the `ContextMeterChip` in the chat input area. Shows the
 * model the pipeline will pick on send, plus a top-line reason. Click a
 * tier button to OVERRIDE the routing decision for the next send only;
 * the override clears after the turn fires.
 *
 * Flag-gated by `showModelRouting` — when off, the chip never mounts.
 *
 * Tier labels follow the user-readable naming pattern (model name + tier
 * word in parens), e.g. `Sonnet (normal)`. Matches the accepted UX
 * principle that we prefer concrete names over abstract jargon for
 * non-technical users.
 */
export default function ModelRoutingChip(props: Props): JSX.Element | null {
  const {
    cli,
    userText,
    hasAttachments = false,
    attachmentCount = 0,
    isContinuation = false,
    promptTokens = 0,
    userOverride,
    onOverride,
  } = props

  const [state, setState] = useState<ClassifyResult | null>(null)
  const [showReasons, setShowReasons] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflightRef = useRef(0)

  // Stable key so we only re-classify when something actually changed.
  const key = useMemo(
    () => JSON.stringify({
      u: userText,
      t: promptTokens,
      a: hasAttachments,
      ac: attachmentCount,
      c: isContinuation,
      cli,
    }),
    [userText, promptTokens, hasAttachments, attachmentCount, isContinuation, cli],
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const myCallId = ++inflightRef.current
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const result = await window.electronAPI.invoke('routing:classify', {
            userText: userText ?? '',
            promptTokens,
            hasAttachments,
            attachmentCount,
            hasSlashCommand: (userText ?? '').trimStart().startsWith('/'),
            isContinuation,
            cli,
          }) as ClassifyResult
          if (myCallId !== inflightRef.current) return
          setState(result)
        } catch {
          // IPC failure — keep whatever we last had.
        }
      })()
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!state) {
    // Render a placeholder so the layout doesn't jump on first classify.
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-gray-800/40 border-gray-700 text-gray-500">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        routing…
      </span>
    )
  }

  const { classification, routedModel, enabled } = state
  const activeModel = userOverride && userOverride.length > 0 ? userOverride : routedModel
  const isOverriding = !!userOverride && userOverride !== routedModel

  // Tier buttons — labeled with the model + parens-tier so non-technical
  // users can read at a glance ("Haiku (trivial)") instead of guessing
  // what "trivial" means abstractly.
  const tiers: Array<{ key: Difficulty; label: string }> = [
    { key: 'trivial', label: 'trivial' },
    { key: 'normal', label: 'normal' },
    { key: 'hard', label: 'hard' },
  ]

  const handleTier = async (tier: Difficulty) => {
    try {
      const result = await window.electronAPI.invoke('routing:resolve-tier', {
        cli,
        tier,
      }) as { model: string }
      const target = result.model
      // If the picked tier resolves to the model we'd route anyway, clear
      // the override — there's no reason to mark the turn as overridden.
      onOverride(target === routedModel ? null : target)
    } catch {
      /* swallow */
    }
  }

  const tooltip = classification.reasons.length > 0
    ? classification.reasons.join(' · ')
    : `difficulty: ${classification.difficulty}`

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setShowReasons((v) => !v)}
        title={tooltip}
        aria-label={`Model routing: ${activeModel}. ${tooltip}`}
        aria-expanded={showReasons}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
          enabled
            ? 'bg-gray-800/40 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600'
            : 'bg-gray-900/40 border-gray-800 text-gray-500'
        }`}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        {enabled ? (
          <span>
            Routed to <span className="text-white">{activeModel}</span> ({classification.difficulty})
          </span>
        ) : (
          <span>Routing off</span>
        )}
        {isOverriding && (
          <span className="ml-1 text-[10px] px-1 rounded bg-indigo-900/60 text-indigo-200 border border-indigo-700/60">override</span>
        )}
      </button>

      {/* Tier picker — only rendered when routing is enabled */}
      {enabled && (
        <div className="inline-flex items-center gap-1">
          {tiers.map((t) => {
            const isActive = classification.difficulty === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => void handleTier(t.key)}
                aria-pressed={isActive}
                aria-label={`Force ${t.label} tier for this turn`}
                title={`Force ${t.label} tier for this turn`}
                className={`px-1.5 py-0.5 text-[10px] rounded-md border transition-colors ${
                  isActive
                    ? 'bg-indigo-900/40 border-indigo-700/60 text-indigo-200'
                    : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                }`}
              >
                {t.label}
              </button>
            )
          })}
          {userOverride && (
            <button
              type="button"
              onClick={() => onOverride(null)}
              title="Clear override"
              className="px-1 py-0.5 text-[10px] text-gray-500 hover:text-gray-300"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Reasons popover */}
      {showReasons && classification.reasons.length > 0 && (
        <div
          role="dialog"
          aria-label="Routing reasons"
          className="absolute bottom-full left-0 mb-1 z-40 min-w-[16rem] max-w-[24rem] rounded-md border bg-gray-900 border-gray-700 p-2 shadow-xl text-[11px] text-gray-200"
        >
          <div className="font-medium mb-1 text-gray-100">
            {classification.difficulty} · {Math.round(classification.confidence * 100)}%
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            {classification.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
