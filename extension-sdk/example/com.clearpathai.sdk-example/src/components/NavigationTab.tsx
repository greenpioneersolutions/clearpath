/**
 * Navigation Tab — Demonstrates sdk.navigate().
 *
 * Provides buttons that navigate to different app routes.
 * Requires `navigation` permission.
 */

import React, { useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonStyle, buttonSecondaryStyle, inputStyle, labelStyle,
  errorStyle, successStyle,
} from './shared-styles'

const ROUTES = [
  { path: '/', label: 'Home / Dashboard', description: 'Navigate to the main dashboard' },
  { path: '/work', label: 'Work Area', description: 'Open the chat/compose work area' },
  { path: '/insights', label: 'Insights', description: 'View analytics and insights' },
  { path: '/configure', label: 'Configure', description: 'Open app settings' },
  { path: '/learn', label: 'Learn', description: 'Open the learning center' },
  { path: '/agents', label: 'Agents', description: 'Manage AI agents' },
  { path: '/file-explorer', label: 'File Explorer', description: 'Browse project files' },
  { path: '/workspaces', label: 'Workspaces', description: 'Manage workspaces' },
  { path: '/extensions/sdk-example', label: 'This Extension', description: 'Navigate back to this extension page' },
]

export function NavigationTab(): React.ReactElement {
  const sdk = useSDK()

  const [customPath, setCustomPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleNavigate = async (path: string) => {
    try {
      setError(null)
      setSuccess(null)
      await sdk.navigate(path)
      setSuccess(`Navigated to ${path}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div>
      <h2 style={headingStyle}>Navigation (sdk.navigate)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Programmatically navigate to different app routes.
        Requires <code>navigation</code> permission.
      </p>

      {error && <div style={errorStyle}>{error}</div>}
      {success && <div style={successStyle}>{success}</div>}

      {/* Custom path */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Custom Route</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Path</label>
            <input
              style={inputStyle}
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="/my-route"
              onKeyDown={(e) => e.key === 'Enter' && customPath.trim() && handleNavigate(customPath.trim())}
            />
          </div>
          <button
            style={buttonStyle}
            onClick={() => customPath.trim() && handleNavigate(customPath.trim())}
          >
            Navigate
          </button>
        </div>
      </div>

      {/* Preset routes */}
      <div style={cardStyle}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>App Routes</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ROUTES.map((route) => (
            <button
              key={route.path}
              style={{
                ...buttonSecondaryStyle,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                textAlign: 'left',
              }}
              onClick={() => handleNavigate(route.path)}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{route.label}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  {route.description}
                </div>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#7F77DD' }}>
                {route.path}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
