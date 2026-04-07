import { useState, useEffect } from 'react'
import type { AppNotification } from '../../types/notification'
import NotificationInbox from './NotificationInbox'

export default function NotificationBell(): JSX.Element {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  // Load initial count
  useEffect(() => {
    void (window.electronAPI.invoke('notifications:unread-count') as Promise<number>).then(setUnreadCount)
  }, [])

  // Listen for new notifications to update badge
  useEffect(() => {
    const off = window.electronAPI.on('notification:new', (_notif: AppNotification) => {
      setUnreadCount((c) => c + 1)
    })
    return off
  }, [])

  // When inbox closes, refresh count
  const handleClose = () => {
    setIsOpen(false)
    void (window.electronAPI.invoke('notifications:unread-count') as Promise<number>).then(setUnreadCount)
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-haspopup="dialog"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationInbox isOpen={isOpen} onClose={handleClose} />
    </>
  )
}
