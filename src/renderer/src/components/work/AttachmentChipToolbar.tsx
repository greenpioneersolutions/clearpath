import type { ReactNode, RefObject } from 'react'

/**
 * A single chip in the attachment toolbar. The parent owns popover open
 * state — the toolbar itself is purely presentational so the same row can
 * be rendered above or below the textarea without dragging stateful
 * coupling along with it.
 */
export interface AttachmentChip {
  /** Stable id used by the parent to identify which popover should open. */
  id: string
  /** Visible label, e.g. "+ Agent" or "Files (soon)". */
  label: string
  /** Optional selection count — shown as a small badge next to the label. */
  count?: number
  /** Disabled chips (e.g. Files this PR) render dimmed and don't fire onClick. */
  disabled?: boolean
  /** Native title attribute / accessibility hint. Used on the Files chip. */
  tooltip?: string
  /**
   * The chip's "type color" — must match the selected-attachment chip color
   * rendered above the input (violet for agent, indigo for skills, teal for
   * notes) so users can pattern-match the chip back to the chip-pill source.
   */
  accent: 'violet' | 'indigo' | 'teal' | 'gray' | 'sky' | 'amber'
  /**
   * `aria-controls` plumbing — set by the parent when managing focus +
   * keyboard semantics for the popover this chip owns.
   */
  ariaControls?: string
  /** Optional ref forwarded to the underlying button so the popover can anchor.
   *  Typed permissively so callers can pass either `useRef<HTMLButtonElement>(null)`
   *  (React 18's "current may be null but TS sees it as non-null") or the
   *  `RefObject<HTMLButtonElement | null>` shape used in newer typings. */
  buttonRef?: RefObject<HTMLButtonElement>
  /**
   * Optional popover node rendered inside the chip's relatively-positioned
   * wrapper so the popover's `absolute top-full left-0` anchors directly
   * beneath the chip. Caller passes a fully-constructed `<AttachmentPopover>`.
   */
  popover?: ReactNode
}

interface Props {
  chips: AttachmentChip[]
  /** id of the currently open popover, if any. The matching chip is rendered
   *  in its "open" state. */
  openChipId: string | null
  onChipClick: (id: string) => void
}

/**
 * Per-accent styling. We pre-compute these so the chip stays a one-liner.
 * `idle` = at rest, `open` = popover open against this chip, `selected` =
 * has a selection count but popover is closed.
 */
const ACCENT_STYLES: Record<AttachmentChip['accent'], { idle: string; open: string; selected: string }> = {
  violet: {
    idle:     'text-violet-200 border-violet-700/40 bg-violet-900/15 hover:bg-violet-900/30 hover:border-violet-600',
    open:     'text-violet-100 border-violet-500 bg-violet-900/40 ring-1 ring-violet-500/40',
    selected: 'text-violet-100 border-violet-600 bg-violet-900/30',
  },
  indigo: {
    idle:     'text-indigo-200 border-indigo-700/40 bg-indigo-900/15 hover:bg-indigo-900/30 hover:border-indigo-600',
    open:     'text-indigo-100 border-indigo-500 bg-indigo-900/40 ring-1 ring-indigo-500/40',
    selected: 'text-indigo-100 border-indigo-600 bg-indigo-900/30',
  },
  teal: {
    idle:     'text-teal-200 border-teal-700/40 bg-teal-900/15 hover:bg-teal-900/30 hover:border-teal-600',
    open:     'text-teal-100 border-teal-500 bg-teal-900/40 ring-1 ring-teal-500/40',
    selected: 'text-teal-100 border-teal-600 bg-teal-900/30',
  },
  gray: {
    idle:     'text-gray-400 border-gray-700/50 bg-gray-900/30',
    open:     'text-gray-300 border-gray-600 bg-gray-900/40',
    selected: 'text-gray-300 border-gray-700 bg-gray-900/30',
  },
  sky: {
    idle:     'text-sky-200 border-sky-700/40 bg-sky-900/15 hover:bg-sky-900/30 hover:border-sky-600',
    open:     'text-sky-100 border-sky-500 bg-sky-900/40 ring-1 ring-sky-500/40',
    selected: 'text-sky-100 border-sky-600 bg-sky-900/30',
  },
  amber: {
    idle:     'text-amber-200 border-amber-700/40 bg-amber-900/15 hover:bg-amber-900/30 hover:border-amber-600',
    open:     'text-amber-100 border-amber-500 bg-amber-900/40 ring-1 ring-amber-500/40',
    selected: 'text-amber-100 border-amber-600 bg-amber-900/30',
  },
}

/**
 * Horizontal toolbar of attachment chips under the QuickStart textarea.
 *
 * Visual + interaction contract:
 *  - One pill per attachment type
 *  - Click a chip → parent opens that chip's popover (parent owns state)
 *  - Click the same chip again → parent closes it
 *  - Click a different chip → parent closes the first, opens the second
 *  - Selection count badges appear inline on chips that have selections,
 *    so the toolbar doubles as a status line at rest
 *  - Disabled chips (Files this PR) render dimmed and are not clickable
 *
 * Layout note: each chip is wrapped in its own `relative` container so the
 * popover passed via `chip.popover` anchors beneath that specific chip
 * (popovers use `absolute top-full left-0` to position). The wrapper is
 * `inline-block` so the chips stay laid out in a flex row.
 *
 * Test ids:
 *  - `attachment-chip-toolbar`               — the row itself
 *  - `attachment-chip:<id>`                  — each chip button
 *  - `attachment-chip-count:<id>`            — the count badge, when present
 */
export default function AttachmentChipToolbar({
  chips,
  openChipId,
  onChipClick,
}: Props): JSX.Element {
  return (
    <div
      data-testid="attachment-chip-toolbar"
      role="toolbar"
      aria-label="Attach context to this chat"
      className="mt-3 flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => {
        const isOpen = openChipId === chip.id
        const hasSelection = !chip.disabled && typeof chip.count === 'number' && chip.count > 0
        const styles = ACCENT_STYLES[chip.accent]
        // open beats selected beats idle so the user always sees the strongest
        // state (we want "this popover is open" to read clearly even when it
        // already has selections).
        const accentClass = chip.disabled
          ? 'text-gray-600 border-gray-800 bg-gray-900/20 cursor-not-allowed'
          : isOpen
            ? styles.open
            : hasSelection
              ? styles.selected
              : styles.idle
        return (
          <div key={chip.id} className="relative">
            <button
              ref={chip.buttonRef}
              type="button"
              data-testid={`attachment-chip:${chip.id}`}
              disabled={chip.disabled}
              title={chip.tooltip}
              aria-haspopup={chip.disabled ? undefined : 'dialog'}
              aria-expanded={chip.disabled ? undefined : isOpen}
              aria-controls={chip.disabled ? undefined : chip.ariaControls}
              onClick={() => {
                if (chip.disabled) return
                onChipClick(chip.id)
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors ${accentClass}`}
            >
              <span>{chip.label}</span>
              {hasSelection && (
                <span
                  data-testid={`attachment-chip-count:${chip.id}`}
                  className="inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full bg-black/30 text-[10px] font-semibold tabular-nums"
                >
                  {chip.count}
                </span>
              )}
            </button>
            {chip.popover}
          </div>
        )
      })}
    </div>
  )
}
