import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BackendId } from '../../../../shared/backends'
import { providerOf } from '../../../../shared/backends'
import { useActiveSessions, type SessionStatus } from '../../hooks/useActiveSessions'

const COLLAPSE_KEY = 'activeSessionsBannerCollapsed'

const STATUS_DOT_CLASS: Record<SessionStatus, string> = {
  idle: 'bg-gray-500',
  processing: 'animate-pulse bg-[#1D9E75]',
  'awaiting-permission': 'animate-pulse bg-red-500',
  error: 'bg-red-500',
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Idle',
  processing: 'Working',
  'awaiting-permission': 'Awaiting permission',
  error: 'Error',
}

// Saturated, AA-contrast (≥4.5:1 with white text) backgrounds for the CLI tag
// pill. The teal/blue brand colors are too light on white text on their own,
// so the badges use darker shades that still read as the same hue family.
const CLI_BADGE_STYLE: Record<'copilot' | 'claude' | 'local', { bg: string; label: string }> = {
  copilot: { bg: '#5B4FC4', label: 'Copilot' },
  claude: { bg: '#047857', label: 'Claude' },
  local: { bg: '#1D4ED8', label: 'Local' },
}

function chipLabel(name: string | undefined, sessionId: string): string {
  if (name && name.trim()) return name.length > 24 ? `${name.slice(0, 24)}…` : name
  return `Session ${sessionId.slice(0, 8)}`
}

export default function ActiveSessionsBanner(): JSX.Element | null {
  const navigate = useNavigate()
  const { sessions, statusById } = useActiveSessions()
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      // localStorage unavailable — best effort
    }
  }, [collapsed])

  if (sessions.length === 0) return null

  const countLabel = `${sessions.length} active session${sessions.length === 1 ? '' : 's'}`

  return (
    <div
      data-testid="active-sessions-banner"
      role="status"
      aria-label="Active CLI sessions"
      className="h-9 w-full flex items-center gap-3 px-3 text-xs flex-shrink-0 border-b"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--brand-accent) 12%, var(--brand-card-bg))',
        borderBottomColor: 'var(--brand-accent)',
      }}
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-gray-900">
        <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-[#047857] animate-pulse" />
        {countLabel}
      </span>

      {!collapsed && (
        <>
          <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-thin">
            {sessions.map((s) => {
              const status: SessionStatus = statusById[s.sessionId] ?? 'idle'
              const provider = providerOf(s.cli as BackendId)
              const badge = CLI_BADGE_STYLE[provider]
              const label = chipLabel(s.name, s.sessionId)
              return (
                <button
                  key={s.sessionId}
                  data-testid="active-session-chip"
                  data-session-id={s.sessionId}
                  data-chip-id={`active-session-chip-${s.sessionId}`}
                  type="button"
                  onClick={() => navigate(`/work?id=${encodeURIComponent(s.sessionId)}`)}
                  title={`${label} · ${STATUS_LABEL[status]}`}
                  aria-label={`Open session ${label}, ${STATUS_LABEL[status]}`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border bg-white text-gray-900 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#047857] transition-shadow whitespace-nowrap font-medium"
                  style={{ borderColor: 'var(--brand-accent)' }}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block rounded-full ${STATUS_DOT_CLASS[status]}`}
                    style={{ width: 8, height: 8 }}
                  />
                  <span className="truncate max-w-[160px]">{label}</span>
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: badge.bg }}
                  >
                    {badge.label}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            data-testid="active-sessions-banner-toggle"
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse active sessions banner"
            className="text-emerald-800 hover:text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] rounded transition-colors px-1 font-bold"
          >
            ▾
          </button>
        </>
      )}

      {collapsed && (
        <button
          data-testid="active-sessions-banner-toggle"
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand active sessions banner"
          className="text-emerald-800 hover:text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] rounded transition-colors ml-auto px-1 font-bold"
        >
          ▸
        </button>
      )}
    </div>
  )
}
