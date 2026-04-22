/**
 * Overview Tab — Displays extensionId, theme summary, and a high-level
 * status dashboard. Demonstrates sdk.extensionId and sdk.theme.get().
 */

import React, { useEffect, useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import type { ClearPathTheme } from '@clearpath/extension-sdk'
import { cardStyle, headingStyle, labelStyle, valueStyle, gridStyle, errorStyle, loadingStyle } from './shared-styles'

export function OverviewTab(): React.ReactElement {
  const sdk = useSDK()
  const [theme, setTheme] = useState<ClearPathTheme | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    sdk.theme.get().then(setTheme).catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <h2 style={headingStyle}>Extension Overview</h2>
      <p style={{ color: '#94a3b8', marginBottom: '20px' }}>
        This tab shows the extension's identity and current host theme.
        It exercises <code>sdk.extensionId</code> and <code>sdk.theme.get()</code>.
      </p>

      <div style={gridStyle}>
        {/* Extension identity card */}
        <div style={cardStyle}>
          <h3 style={{ ...headingStyle, fontSize: '14px' }}>Extension Identity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <span style={labelStyle}>Extension ID</span>
              <span style={valueStyle}>{sdk.extensionId}</span>
            </div>
          </div>
        </div>

        {/* Theme card */}
        <div style={cardStyle}>
          <h3 style={{ ...headingStyle, fontSize: '14px' }}>Current Theme</h3>
          {error && <div style={errorStyle}>{error}</div>}
          {!theme && !error && <div style={loadingStyle}>Loading theme...</div>}
          {theme && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <span style={labelStyle}>Mode</span>
                <span style={valueStyle}>{theme.isDark ? 'Dark' : 'Light'}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {(['primary', 'sidebar', 'accent'] as const).map((key) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        backgroundColor: theme[key],
                        border: '1px solid #334155',
                      }}
                    />
                    <span style={labelStyle}>
                      {key}: {theme[key]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
