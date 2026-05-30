import { useState, useEffect, useRef, useMemo } from 'react'
import type { PromptSlices, SliceTokenBreakdown } from '../../../../shared/tokenization/types'
import { contextWindowFor } from '../../../../shared/tokenization/contextWindows'
import ContextMeterPopover from './ContextMeterPopover'

interface Props {
  /** The post-lint or pre-send slice text. Re-counted whenever any slice changes. */
  slices: PromptSlices
  /** Active model so we route to the right tokenizer + context-window size. */
  model: string
  /**
   * Optional: when the main process emits `cli:prompt-shaped` after the
   * pipeline runs, the parent feeds us the post-lint breakdown so the meter
   * reflects what actually went out the wire, not the pre-send estimate.
   */
  postLintBreakdown?: SliceTokenBreakdown | null
  /**
   * Tokens already consumed by the conversation so far (sum across prior
   * turns from `cost:list`). The chip's headline number and percent add this
   * to the current input so a returning user sees how much of the context
   * window the conversation has used — not just the empty draft. Without
   * this the chip reads 0% after every send, which is confusing.
   *
   * NOTE: this is a cumulative total (input + output across turns), so it
   * slightly overestimates the next-turn context window size. The popover
   * surfaces it on its own row so the meaning is explicit.
   */
  priorSessionTokens?: number
}

const EMPTY_BREAKDOWN: SliceTokenBreakdown = {
  userPrompt: 0,
  agentPrompt: 0,
  notesFramed: 0,
  contextSources: 0,
  fleetPrefix: 0,
  injectedTotal: 0,
  total: 0,
}

/**
 * Live context meter chip that sits above the chat input. Shows current
 * token count + % of context window. Click opens the per-slice popover.
 *
 * Token counting is debounced 250ms — fast enough to feel live while typing,
 * slow enough that the IPC round-trip doesn't drown out the tokenizer.
 */
export default function ContextMeterChip({ slices, model, postLintBreakdown, priorSessionTokens = 0 }: Props): JSX.Element {
  const [breakdown, setBreakdown] = useState<SliceTokenBreakdown>(EMPTY_BREAKDOWN)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflightRef = useRef(0)

  const contextWindow = useMemo(() => contextWindowFor(model), [model])

  // Stable key for slice contents so the debounce only runs when something
  // actually changed. We rely on shallow-equality of slice strings — that's
  // what changes when the user types.
  const slicesKey = JSON.stringify({
    u: slices.userText ?? '',
    a: slices.agentPrompt ?? '',
    n: slices.notesFramed ?? '',
    c: slices.contextSources ?? '',
    f: slices.fleetPrefix ?? '',
    m: model,
  })

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const myCallId = ++inflightRef.current
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const result = await window.electronAPI.invoke('tokenizer:count-multi', {
            slices,
            model,
          }) as SliceTokenBreakdown
          // Drop the result if a newer request started while we were waiting.
          if (myCallId !== inflightRef.current) return
          setBreakdown(result ?? EMPTY_BREAKDOWN)
        } catch {
          // Channel not wired or IPC failure — keep whatever we already have.
        }
      })()
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slicesKey])

  // Adopt the post-lint breakdown whenever the parent passes one in — this
  // is the "actual" count after the middleware pipeline trimmed whitespace.
  useEffect(() => {
    if (postLintBreakdown) setBreakdown(postLintBreakdown)
  }, [postLintBreakdown])

  // Headline = current draft + conversation history. Conversation history
  // is the source of truth for "how full is my context" once a session has
  // any turns; the draft just adds the next slice on top.
  const total = breakdown.total + priorSessionTokens
  const percentOfWindow = contextWindow > 0 ? (total / contextWindow) * 100 : 0
  // Bar segments rendered against the brand-dark background — width clamped
  // 0..100 so a runaway prompt doesn't visually overflow the chip.
  const filledPct = Math.min(100, Math.max(0, percentOfWindow))

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Open context details"
        aria-label="Context meter — click for details"
        aria-expanded={open}
        className="inline-flex items-center gap-2 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-gray-800/40 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
      >
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className="tabular-nums">{total.toLocaleString()} tok</span>
        <span className="inline-block w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden" aria-hidden>
          <span
            className={
              filledPct > 80 ? 'block h-full bg-amber-500' :
              filledPct > 50 ? 'block h-full bg-indigo-400' :
                               'block h-full bg-teal-400'
            }
            style={{ width: `${filledPct}%` }}
          />
        </span>
        <span className="text-gray-500 tabular-nums">{percentOfWindow.toFixed(percentOfWindow < 10 ? 1 : 0)}%</span>
      </button>

      {open && (
        <ContextMeterPopover
          breakdown={breakdown}
          contextWindow={contextWindow}
          priorSessionTokens={priorSessionTokens}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
