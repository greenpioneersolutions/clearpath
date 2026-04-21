/**
 * Sidebar Widget — Compact status display rendered in the sidebar.
 *
 * Shows a minimal status indicator for the SDK Example extension.
 * Demonstrates `sidebarWidgets` contribution in the manifest.
 */

import React, { useEffect, useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'

export function StatusWidget(): React.ReactElement {
  const sdk = useSDK()

  const [keyCount, setKeyCount] = useState<number | null>(null)
  const [activeSession, setActiveSession] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [keys, active] = await Promise.all([
          sdk.storage.keys(),
          sdk.sessions.getActive(),
        ])
        setKeyCount(keys.length)
        setActiveSession(active)
      } catch {
        // Sidebar widget should fail silently
      }
    }
    load()

    // Refresh periodically
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [sdk])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        fontSize: '11px',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: activeSession ? '#4ade80' : '#94a3b8',
        }}
      />
      <span style={{ color: '#94a3b8' }}>SDK</span>
      {keyCount !== null && (
        <span
          style={{
            padding: '0 5px',
            borderRadius: '9999px',
            backgroundColor: '#312e81',
            color: '#a5b4fc',
            fontSize: '10px',
          }}
        >
          {keyCount}
        </span>
      )}
    </div>
  )
}
