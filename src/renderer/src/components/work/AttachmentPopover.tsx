import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface Props {
  /** When false the popover unmounts. Letting the parent unmount avoids
   *  keeping stale focus traps mounted in test environments. */
  open: boolean
  /** Ref to the chip button that anchors this popover. Used for click-outside
   *  detection so clicking the anchor doesn't double-fire (open + close in
   *  the same event loop). Typed as nullable-current at the call site since
   *  React `useRef<T>(null)` returns `RefObject<T>` whose `current` is
   *  effectively nullable. */
  anchorRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  /** Optional title rendered in the popover header. Mostly there so screen
   *  readers can announce "Pick an agent" when the popover opens. */
  title?: string
  /** Stable id so the chip's `aria-controls` can point at the popover. */
  id?: string
  /** Optional className tacked onto the popover root. The popover already
   *  carries sensible defaults — this is for callers that need an extra
   *  utility class (e.g. wider width for a long list). */
  className?: string
  children: ReactNode
}

/**
 * Reusable popover shell anchored below a chip in `AttachmentChipToolbar`.
 *
 * Behavior:
 *  - Closes on Escape
 *  - Closes on click outside the popover (and outside the anchor button —
 *    clicking the anchor goes back through the toolbar which will toggle it)
 *  - Focus trap while open, restoring focus to the previously-focused
 *    element (the chip) on close
 *  - Positioned `absolute` below the anchor — `left-0 top-full` works for
 *    every chip we ship today; basic auto-flip for narrow viewports isn't
 *    required this PR
 *
 * The shell is intentionally dumb: the popover body is `children`, so each
 * caller can drop its own `SectionPicker` inside without the shell knowing
 * what kind of list it's wrapping.
 */
export default function AttachmentPopover({
  open,
  anchorRef,
  onClose,
  title,
  id,
  className,
  children,
}: Props): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus trap fires only while the popover is mounted + open. Restoring
  // focus to the chip on close is the hook's built-in behavior — the chip
  // was `document.activeElement` when this effect mounted (because the user
  // clicked it to open the popover).
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      // Click inside the popover body: ignore.
      if (panelRef.current && panelRef.current.contains(target)) return
      // Click on the anchor chip: ignore. The parent toolbar already wires
      // up `onChipClick` to toggle, so we mustn't double-handle here.
      if (anchorRef.current && anchorRef.current.contains(target)) return
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={title}
      data-testid="attachment-popover"
      className={`absolute left-0 top-full mt-2 z-30 w-80 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl p-3 ${className ?? ''}`}
    >
      {title && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-200 text-sm leading-none"
          >
            &times;
          </button>
        </div>
      )}
      {children}
    </div>
  )
}
