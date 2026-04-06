import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import KeyboardShortcutModal from './KeyboardShortcutModal'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

// ── Route Announcer (screen reader page-change notifications) ────────────

const ROUTE_NAMES: Record<string, string> = {
  '/': 'Home',
  '/work': 'Work',
  '/insights': 'Insights',
  '/pr-scores': 'PR Scores',
  '/configure': 'Configure',
  '/learn': 'Learning Center',
}

function RouteAnnouncer(): JSX.Element {
  const location = useLocation()
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const name = ROUTE_NAMES[location.pathname] ?? 'Page'
    setAnnouncement(`Navigated to ${name}`)
  }, [location.pathname])

  return (
    <div aria-live="assertive" aria-atomic="true" role="status" className="sr-only">
      {announcement}
    </div>
  )
}

// ── Update Banner ────────────────────────────────────────────────────────

interface UpdateStatus {
  status: 'available' | 'downloaded'
  version: string
}

function UpdateBanner(): JSX.Element | null {
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsub = window.electronAPI.on('updater:status', (_e, data: unknown) => {
      const status = data as UpdateStatus
      setUpdate(status)
      setDismissed(false)
    })
    return unsub
  }, [])

  if (!update || dismissed) return null

  const handleRestart = () => {
    void window.electronAPI.invoke('updater:install')
  }

  return (
    <div role="status" aria-label="Application update" className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between text-sm">
      <span>
        {update.status === 'downloaded'
          ? `Update v${update.version} is ready — restart to apply.`
          : `Update v${update.version} is downloading...`}
      </span>
      <div className="flex items-center gap-2">
        {update.status === 'downloaded' && (
          <button onClick={handleRestart} aria-label={`Restart to update to version ${update.version}`}
            className="px-3 py-1 bg-white text-indigo-600 rounded font-medium text-xs hover:bg-indigo-50 transition-colors">
            Restart Now
          </button>
        )}
        <button onClick={() => setDismissed(true)} aria-label="Dismiss update notification"
          className="text-indigo-200 hover:text-white text-xs transition-colors">
          Later
        </button>
      </div>
    </div>
  )
}

// ── Layout ───────────────────────────────────────────────────────────────

export default function Layout(): JSX.Element {
  const mainRef = useRef<HTMLElement>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), [])
  useKeyboardShortcuts(toggleShortcuts)

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--brand-page-bg)' }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <UpdateBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main
          ref={mainRef}
          id="main-content"
          className="flex-1 overflow-auto"
          role="main"
          aria-label="Main content"
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
      <RouteAnnouncer />
      <KeyboardShortcutModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  )
}
