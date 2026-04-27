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

const CLI_BADGE_STYLE: Record<'copilot' | 'claude' | 'local', { bg: string; color: string; label: string }> = {
  copilot: { bg: 'rgba(91,79,196,0.18)', color: '#5B4FC4', label: 'Copilot' },
  claude: { bg: 'rgba(29,158,117,0.18)', color: '#1D9E75', label: 'Claude' },
  local: { bg: 'rgba(133,183,235,0.18)', color: '#85B7EB', label: 'Local' },
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
      className="h-9 w-full flex items-center gap-3 px-3 text-xs flex-shrink-0"
      style={{
        backgroundColor: 'rgba(29,158,117,0.10)',
        borderBottom: '1px solid rgba(29,158,117,0.30)',
      }}
    >
      <span className="text-[#5DCAA5] font-medium whitespace-nowrap">{countLabel}</span>

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
                  title={label}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-[#1D9E75]/30 hover:border-[#5DCAA5]/60 hover:bg-[#1D9E75]/15 transition-colors whitespace-nowrap text-gray-200"
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block rounded-full ${STATUS_DOT_CLASS[status]}`}
                    style={{ width: 8, height: 8 }}
                  />
                  <span className="truncate max-w-[160px]">{label}</span>
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
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
            className="text-[#5DCAA5] hover:text-white transition-colors px-1"
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
          className="text-[#5DCAA5] hover:text-white transition-colors ml-auto px-1"
        >
          ▸
        </button>
      )}
    </div>
  )
}
