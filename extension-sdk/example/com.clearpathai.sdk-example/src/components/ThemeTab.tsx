/**
 * Theme Tab — Demonstrates sdk.theme.get() and sdk.theme.onChange().
 *
 * Shows the current theme colors and subscribes to live changes.
 * Renders color swatches that update in real-time when the theme changes.
 */

import React, { useEffect, useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import type { ClearPathTheme } from '@clearpath/extension-sdk'
import { cardStyle, headingStyle, errorStyle, loadingStyle, labelStyle } from './shared-styles'

export function ThemeTab(): React.ReactElement {
  const sdk = useSDK()

  const [theme, setTheme] = useState<ClearPathTheme | null>(null)
  const [changeCount, setChangeCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Initial fetch
    sdk.theme.get().then(setTheme).catch((err) => setError(err.message))

    // Subscribe to changes
    const unsub = sdk.theme.onChange((newTheme) => {
      setTheme(newTheme)
      setChangeCount((c) => c + 1)
    })

    return unsub
  }, [sdk])

  const swatches = theme
    ? [
        { label: 'Primary', color: theme.primary },
        { label: 'Sidebar', color: theme.sidebar },
        { label: 'Accent', color: theme.accent },
      ]
    : []

  return (
    <div>
      <h2 style={headingStyle}>Theme (sdk.theme)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Read the host theme and subscribe to live changes. No special permission required.
      </p>

      {error && <div style={errorStyle}>{error}</div>}
      {!theme && !error && <div style={loadingStyle}>Loading theme...</div>}

      {theme && (
        <>
          {/* Theme mode */}
          <div style={{ ...cardStyle, marginBottom: '16px' }}>
            <h3 style={{ ...headingStyle, fontSize: '14px' }}>Mode</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: theme.isDark ? '#1e293b' : '#f1f5f9',
                  border: `2px solid ${theme.primary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                }}
              >
                {theme.isDark ? '\u263E' : '\u2600'}
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
                  {theme.isDark ? 'Dark Mode' : 'Light Mode'}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Theme changes observed: {changeCount}
                </div>
              </div>
            </div>
          </div>

          {/* Color swatches */}
          <div style={{ ...cardStyle, marginBottom: '16px' }}>
            <h3 style={{ ...headingStyle, fontSize: '14px' }}>Colors</h3>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {swatches.map(({ label, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '12px',
                      backgroundColor: color,
                      border: '2px solid #334155',
                      marginBottom: '6px',
                    }}
                  />
                  <div style={labelStyle}>{label}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#e2e8f0' }}>
                    {color}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Raw theme JSON */}
          <div style={cardStyle}>
            <h3 style={{ ...headingStyle, fontSize: '14px' }}>Raw Theme Object</h3>
            <pre
              style={{
                padding: '12px',
                backgroundColor: '#0f172a',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#e2e8f0',
                fontFamily: 'monospace',
              }}
            >
              {JSON.stringify(theme, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
