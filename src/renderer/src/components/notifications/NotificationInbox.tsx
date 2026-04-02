import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { IpcRendererEvent } from 'electron'
import type { AppNotification, NotificationType } from '../../types/notification'
import { SEVERITY_STYLES, TYPE_LABELS } from '../../types/notification'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

type FilterTab = 'all' | 'sessions' | 'security' | 'budget' | 'agents' | 'history'

const FILTER_MAP: Record<FilterTab, NotificationType[] | null> = {
  all: null,
  sessions: ['session-complete', 'permission-request'],
  security: ['security-event', 'policy-violation'],
  budget: ['budget-alert', 'rate-limit'],
  agents: ['agent-status', 'schedule-result'],
  history: null,
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function NotificationInbox({ isOpen, onClose }: Props): JSX.Element {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const filterTypes = FILTER_MAP[filter]
    const list = await window.electronAPI.invoke('notifications:list', {
      limit: 200,
      type: filterTypes?.length === 1 ? filterTypes[0] : undefined,
      unreadOnly: filter !== 'history',
    }) as AppNotification[]
    // Client-side filter for multi-type tabs
    const filtered = filterTypes && filterTypes.length > 1
      ? list.filter((n) => filterTypes.includes(n.type))
      : list
    setNotifications(filtered)
    setLoading(false)
  }, [filter])

  useEffect(() => { if (isOpen) void load() }, [isOpen, load])

  // Listen for new notifications
  useEffect(() => {
    const off = window.electronAPI.on('notification:new', (_e: IpcRendererEvent, notif: AppNotification) => {
      setNotifications((prev) => [notif, ...prev])
    })
    return off
  }, [])

  const handleMarkRead = async (id: string) => {
    await window.electronAPI.invoke('notifications:mark-read', { id })
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }

  const handleMarkAllRead = async () => {
    await window.electronAPI.invoke('notifications:mark-all-read')
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleDismiss = async (id: string) => {
    await window.electronAPI.invoke('notifications:dismiss', { id })
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const handleClearAll = async () => {
    if (!confirm('Clear all notifications?')) return
    await window.electronAPI.invoke('notifications:clear-all')
    setNotifications([])
  }

  const handleAction = async (notif: AppNotification) => {
    if (notif.action) {
      // Deep-link navigation
      if (notif.action.navigate) {
        const params = new URLSearchParams()
        if (notif.action.tab) params.set('tab', notif.action.tab)
        if (notif.action.panel) params.set('panel', notif.action.panel)
        const query = params.toString()
        navigate(notif.action.navigate + (query ? `?${query}` : ''))
        onClose()
      }
      // IPC action
      if (notif.action.ipcChannel) {
        await window.electronAPI.invoke(notif.action.ipcChannel, notif.action.args ?? {})
      }
    }
    await handleMarkRead(notif.id)
  }

  if (!isOpen) return <></>

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute right-4 top-14 w-96 max-h-[600px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
          <div className="flex gap-2">
            <button onClick={() => void handleMarkAllRead()} className="text-xs text-indigo-600 hover:text-indigo-800">
              Mark all read
            </button>
            <button onClick={() => void handleClearAll()} className="text-xs text-gray-400 hover:text-red-500">
              Clear all
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-gray-100 flex-shrink-0 overflow-x-auto">
          {(['all', 'sessions', 'security', 'budget', 'agents', 'history'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              {filter === 'history' ? 'No notification history' : 'No notifications'}
            </div>
          ) : (
            <div>
              {notifications.map((n) => {
                const style = SEVERITY_STYLES[n.severity]
                const isExpanded = expanded === n.id
                return (
                  <div key={n.id} className={`border-b border-gray-50 ${!n.read ? 'bg-indigo-50/30' : ''}`}>
                    <button
                      onClick={() => { setExpanded(isExpanded ? null : n.id); if (!n.read) void handleMarkRead(n.id) }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-sm flex-shrink-0 mt-0.5">{style.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${n.read ? 'text-gray-600' : 'text-gray-900'}`}>
                              {n.title}
                            </span>
                            {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                            <span>{timeAgo(n.timestamp)}</span>
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded">{TYPE_LABELS[n.type]}</span>
                            <span>{n.source}</span>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); void handleDismiss(n.id) }}
                          className="text-gray-300 hover:text-red-400 flex-shrink-0 text-xs p-0.5">
                          x
                        </button>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3 pl-11">
                        <p className="text-xs text-gray-600 leading-relaxed mb-2">{n.message}</p>
                        {n.sessionId && (
                          <p className="text-xs text-gray-400 mb-2">Session: {n.sessionId.slice(0, 8)}</p>
                        )}
                        {n.action && (
                          <button onClick={() => void handleAction(n)}
                            className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">
                            {n.action.label}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
