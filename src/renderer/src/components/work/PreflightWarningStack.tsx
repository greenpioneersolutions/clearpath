import { useEffect, useState, useRef } from 'react'
import PreflightWarning from './PreflightWarning'

/**
 * Token Coach Phase 5 — pre-flight warning stack.
 *
 * Subscribes to `cli:prompt-shaped` events (the same channel Phase 2's
 * ContextMeterChip uses for the post-lint breakdown). When a payload arrives
 * for the active session and the notes contain `warn:` or `info:` lines,
 * up to 2 banners are rendered above the chat input — oldest first, capped
 * for screen real-estate.
 *
 * Banners auto-dismiss when the user starts editing the prompt (they've
 * acknowledged the warning by acting on it). That signal is delivered via
 * the `editTick` prop, which the parent increments on every keystroke.
 *
 * Flag-gated by `showEfficiencyInsights` at the call site — when off, this
 * stack is not rendered at all. The middleware still fires on the main side
 * because turning it off mid-pipeline would mean the renderer can't decide
 * to render selectively later (cf. CostRecord fields which always populate).
 */

export interface PreflightWarningStackProps {
  /** Currently-selected session id. Banners reset on switch. */
  sessionId: string | null
  /** Monotonic counter incremented by the parent on each keystroke. Triggers auto-dismiss. */
  editTick: number
  /** Open the Notes ContextPicker tab. */
  onTrim: () => void
  /** Send `/compact` to the active session. */
  onCompact: () => void
}

interface Banner {
  /** Stable id for React's key — `${turnId}:${index}`. */
  key: string
  note: string
}

const MAX_BANNERS = 2

export default function PreflightWarningStack(props: PreflightWarningStackProps): JSX.Element | null {
  const { sessionId, editTick, onTrim, onCompact } = props
  const [banners, setBanners] = useState<Banner[]>([])
  const lastEditTickRef = useRef(editTick)

  // Subscribe to prompt-shaped events
  useEffect(() => {
    if (!sessionId) return
    const handler = (payload: {
      sessionId: string
      turnId?: string
      notes?: string[]
    }) => {
      if (payload.sessionId !== sessionId) return
      const incoming = (payload.notes ?? []).filter(
        (n) => n.startsWith('warn:') || n.startsWith('info:'),
      )
      if (incoming.length === 0) return
      setBanners((prev) => {
        const next: Banner[] = [
          ...prev,
          ...incoming.map((note, i) => ({ key: `${payload.turnId ?? 'no-turn'}:${i}:${Date.now()}:${i}`, note })),
        ]
        // Cap to MAX_BANNERS — show oldest first per spec.
        if (next.length > MAX_BANNERS) return next.slice(0, MAX_BANNERS)
        return next
      })
    }
    const off = window.electronAPI.on('cli:prompt-shaped', handler as (...args: unknown[]) => void)
    return () => off()
  }, [sessionId])

  // Reset banners when the active session changes.
  useEffect(() => {
    setBanners([])
  }, [sessionId])

  // Auto-dismiss on prompt edit — the user has seen the warning and is
  // addressing it (or sending anyway).
  useEffect(() => {
    if (editTick !== lastEditTickRef.current) {
      lastEditTickRef.current = editTick
      if (banners.length > 0) {
        setBanners([])
      }
    }
  }, [editTick, banners.length])

  if (banners.length === 0) return null

  const dismiss = (key: string) => {
    setBanners((prev) => prev.filter((b) => b.key !== key))
  }

  return (
    <div className="flex flex-col gap-0" data-testid="preflight-warning-stack">
      {banners.map((b) => (
        <PreflightWarning
          key={b.key}
          note={b.note}
          onTrim={onTrim}
          onCompact={onCompact}
          onDismiss={() => dismiss(b.key)}
        />
      ))}
    </div>
  )
}
