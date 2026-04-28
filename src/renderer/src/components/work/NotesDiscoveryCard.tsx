import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFlag } from '../../contexts/FeatureFlagContext'

const DISMISS_KEY = 'clearpath:notes-discovery-dismissed'

/**
 * One-time discovery nudge for the Notes feature. Renders only when:
 *   1. `showNotes` flag is on (live — toggling off hides it immediately)
 *   2. User has zero saved notes
 *   3. User has completed >= 1 session (active or persisted)
 *   4. The card hasn't been dismissed (localStorage)
 *
 * Returns null otherwise. Clicking the primary CTA navigates to the dedicated
 * /notes page where the user creates their first note in the full editor.
 */
export default function NotesDiscoveryCard(): JSX.Element | null {
  const showNotes = useFlag('showNotes')
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!showNotes) return

    // Honor prior dismissal across mounts.
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      // localStorage unavailable (private mode, etc.) — fall through; the
      // worst case is the card reappears on next mount.
    }

    let cancelled = false
    void (async () => {
      try {
        const notes = (await window.electronAPI.invoke('notes:list')) as Array<unknown>
        if (cancelled) return
        if (Array.isArray(notes) && notes.length > 0) return // Already have notes — no nudge.

        const persisted = (await window.electronAPI.invoke('cli:get-persisted-sessions')) as Array<{
          sessionId: string
          name?: string
          startedAt: number
          messageLog?: Array<unknown>
        }>
        const active = (await window.electronAPI.invoke('cli:list-sessions')) as Array<{
          sessionId: string
          name?: string
          startedAt: number
        }>
        if (cancelled) return

        const completed = [...(persisted ?? []), ...(active ?? [])]
        if (completed.length === 0) return

        setVisible(true)
      } catch {
        // Best-effort; silent failure is fine for a discovery card.
      }
    })()

    return () => { cancelled = true }
  }, [showNotes])

  const dismiss = () => {
    setVisible(false)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Ignore storage failures.
    }
  }

  if (!visible) return null

  return (
    <div
      data-testid="notes-discovery-card"
      className="rounded-2xl border p-4 flex items-start gap-3"
      style={{ backgroundColor: 'var(--brand-dark-card)', borderColor: 'var(--brand-dark-border)' }}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-900/40 text-indigo-300 flex items-center justify-center text-sm" aria-hidden>
        📝
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white">You ran a session — save what you learned</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Capture the takeaway as a note. Attach it to the next session so the AI starts with the right context.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/notes')}
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            Go to Notes →
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
