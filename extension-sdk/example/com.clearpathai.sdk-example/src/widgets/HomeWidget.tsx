/**
 * Home Widget — Panel contribution rendered in the `home:widgets` slot.
 *
 * Shows a compact status card on the home dashboard with:
 * - Extension identity and uptime
 * - Quick storage stats
 * - Recent event count
 *
 * Demonstrates panel contributions in the manifest.
 */

import React, { useEffect, useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'

export function HomeWidget(): React.ReactElement {
  const sdk = useSDK()

  const [keyCount, setKeyCount] = useState(0)
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)
  const [theme, setTheme] = useState<{ primary: string; isDark: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [keys, q, t] = await Promise.all([
          sdk.storage.keys(),
          sdk.storage.quota(),
          sdk.theme.get(),
        ])
        setKeyCount(keys.length)
        setQuota(q)
        setTheme(t)
      } catch (err) {
        setError((err as Error).message)
      }
    }
    load()
  }, [sdk])

  const styles = {
    container: {
      padding: '16px',
      borderRadius: '8px',
      backgroundColor: '#1e293b',
      border: '1px solid #334155',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '12px',
    },
    icon: {
      width: '24px',
      height: '24px',
      borderRadius: '6px',
      backgroundColor: '#5B4FC4',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '14px',
      color: '#fff',
    },
    title: {
      fontSize: '14px',
      fontWeight: 600,
      color: '#f8fafc',
    },
    stats: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: '8px',
    },
    stat: {
      textAlign: 'center' as const,
    },
    statValue: {
      fontSize: '18px',
      fontWeight: 700,
      color: '#f8fafc',
    },
    statLabel: {
      fontSize: '11px',
      color: '#94a3b8',
    },
    error: {
      color: '#f87171',
      fontSize: '12px',
    },
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>SDK Example: {error}</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.icon}>&lt;/&gt;</div>
        <span style={styles.title}>SDK Example</span>
        <span
          style={{
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '9999px',
            backgroundColor: '#065f46',
            color: '#6ee7b7',
            marginLeft: 'auto',
          }}
        >
          Active
        </span>
      </div>
      <div style={styles.stats}>
        <div style={styles.stat}>
          <div style={styles.statValue}>{keyCount}</div>
          <div style={styles.statLabel}>Keys Stored</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statValue}>
            {quota ? `${((quota.used / quota.limit) * 100).toFixed(0)}%` : '--'}
          </div>
          <div style={styles.statLabel}>Storage Used</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statValue}>
            {theme ? (theme.isDark ? 'Dark' : 'Light') : '--'}
          </div>
          <div style={styles.statLabel}>Theme</div>
        </div>
      </div>
    </div>
  )
}
