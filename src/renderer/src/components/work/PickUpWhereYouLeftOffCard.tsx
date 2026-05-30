import { useEffect, useState } from 'react'
import type { SessionInfo } from '../../types/ipc'
import type { BackendId } from '../../../../shared/backends'
import { LAUNCHPAD_COPY } from '../../copy/launchpad'
import ActiveSessionsCard from './ActiveSessionsCard'
import RecentSessionsCard from './RecentSessionsCard'

interface Props {
  /** Click handler for an active running session — typically opens it in the Work view. */
  onOpenActiveSession: (info: SessionInfo) => void
  /** Click handler for a recent session row — typically resumes the session. */
  onResumeSession: (sessionId: string, cli: BackendId, name?: string) => void
  /** Click handler for the "See all →" link — opens the full SessionManager modal. */
  onSeeMore: () => void
}

interface PersistedSessionRow {
  sessionId: string
  status?: 'running' | 'stopped'
  archived?: boolean
}

/**
 * Composition wrapper for the launchpad's "continue work" surface.
 *
 * Renders one card shell with header "Pick up where you left off" and stacks
 * the existing ActiveSessionsCard + RecentSessionsCard inside it. The wrapper
 * does its own lightweight IPC fetch *purely* to detect the "both empty" state
 * so it can render a single merged empty message instead of two stacked ones.
 *
 * The sub-cards retain ownership of their own data, rendering, and live updates.
 * This wrapper does not duplicate their list rendering — it only short-circuits
 * to the merged empty state when both lists confirm zero entries.
 */
export default function PickUpWhereYouLeftOffCard({
  onOpenActiveSession,
  onResumeSession,
  onSeeMore,
}: Props): JSX.Element {
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [recentCount, setRecentCount] = useState<number | null>(null)

  // Pull counts once and refresh whenever a turn boundary or session exit
  // happens — same event hooks ActiveSessionsCard uses internally so the
  // merged empty state stays in sync without the sub-cards reporting up.
  useEffect(() => {
    let cancelled = false

    const refreshActive = async () => {
      try {
        const list = (await window.electronAPI.invoke('cli:list-sessions')) as Array<{
          status?: 'running' | 'stopped'
        }> | null
        if (cancelled) return
        const running = (Array.isArray(list) ? list : []).filter((s) => s.status === 'running')
        setActiveCount(running.length)
      } catch {
        if (!cancelled) setActiveCount(0)
      }
    }

    const refreshRecent = async () => {
      try {
        const list = (await window.electronAPI.invoke(
          'cli:get-persisted-sessions',
        )) as PersistedSessionRow[] | null
        if (cancelled) return
        const recent = (Array.isArray(list) ? list : []).filter(
          (s) => s.status !== 'running' && !s.archived,
        )
        setRecentCount(recent.length)
      } catch {
        if (!cancelled) setRecentCount(0)
      }
    }

    void refreshActive()
    void refreshRecent()

    const cleanup = [
      window.electronAPI.on('cli:turn-start', () => {
        void refreshActive()
      }),
      window.electronAPI.on('cli:turn-end', () => {
        void refreshActive()
      }),
      window.electronAPI.on('cli:exit', () => {
        void refreshActive()
        void refreshRecent()
      }),
    ]

    return () => {
      cancelled = true
      cleanup.forEach((fn) => fn())
    }
  }, [])

  const bothLoaded = activeCount !== null && recentCount !== null
  const bothEmpty = bothLoaded && activeCount === 0 && recentCount === 0

  return (
    <section
      data-testid="pick-up-where-you-left-off-card"
      className="rounded-2xl p-6 shadow-lg"
      style={{
        background: 'linear-gradient(135deg, rgba(91,79,196,0.10) 0%, rgba(133,183,235,0.06) 100%)',
        border: '1px solid rgba(127,119,221,0.25)',
      }}
    >
      <header className="mb-4 flex items-start gap-3">
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'rgba(91,79,196,0.25)', color: '#7F77DD' }}
          aria-hidden
        >
          {/* Compass-style icon to match the brand "find your way" cue. */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-white text-lg font-semibold">{LAUNCHPAD_COPY.pickUp.title}</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {LAUNCHPAD_COPY.pickUp.subtitle}
          </p>
        </div>
      </header>

      {bothEmpty ? (
        <div
          data-testid="pick-up-merged-empty"
          className="text-sm text-gray-500 py-10 text-center"
        >
          {LAUNCHPAD_COPY.pickUp.emptyAll}
        </div>
      ) : (
        <div className="space-y-4">
          <ActiveSessionsCard onOpenSession={onOpenActiveSession} />
          <RecentSessionsCard
            onResumeSession={onResumeSession}
            onSeeMore={onSeeMore}
            limit={3}
          />
        </div>
      )}
    </section>
  )
}
