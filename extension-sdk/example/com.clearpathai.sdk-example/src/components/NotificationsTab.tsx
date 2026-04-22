/**
 * Notifications Tab — Demonstrates sdk.notifications.emit().
 *
 * Lets the user compose and send notifications with different severities.
 */

import React, { useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonStyle, inputStyle, labelStyle,
  errorStyle, successStyle,
} from './shared-styles'

export function NotificationsTab(): React.ReactElement {
  const sdk = useSDK()

  const [title, setTitle] = useState('SDK Example Notification')
  const [message, setMessage] = useState('This notification was sent from the SDK Example extension.')
  const [severity, setSeverity] = useState<'info' | 'warning'>('info')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const handleEmit = async () => {
    if (!title.trim() || !message.trim()) return
    try {
      setSending(true)
      setError(null)
      setSuccess(null)
      await sdk.notifications.emit({ title: title.trim(), message: message.trim(), severity })
      setSuccess(`Notification emitted with severity "${severity}"`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  const presets = [
    { title: 'Build Complete', message: 'Your project build finished successfully.', severity: 'info' as const },
    { title: 'High Cost Alert', message: 'Session spending has exceeded the daily threshold.', severity: 'warning' as const },
    { title: 'Extension Ready', message: 'SDK Example extension has completed initialization.', severity: 'info' as const },
  ]

  return (
    <div>
      <h2 style={headingStyle}>Notifications (sdk.notifications)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Emit user-facing notifications. Requires <code>notifications:emit</code> permission.
      </p>

      {error && <div style={errorStyle}>{error}</div>}
      {success && <div style={successStyle}>{success}</div>}

      <div style={cardStyle}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Compose Notification</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Message</label>
            <input style={inputStyle} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Severity</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['info', 'warning'] as const).map((s) => (
                <button
                  key={s}
                  style={{
                    ...buttonStyle,
                    backgroundColor: severity === s ? (s === 'warning' ? '#d97706' : '#5B4FC4') : '#334155',
                    fontSize: '12px',
                    padding: '6px 14px',
                  }}
                  onClick={() => setSeverity(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button style={buttonStyle} onClick={handleEmit} disabled={sending}>
            {sending ? 'Sending...' : 'Emit Notification'}
          </button>
        </div>
      </div>

      {/* Presets */}
      <div style={{ ...cardStyle, marginTop: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Quick Presets</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {presets.map((preset, i) => (
            <button
              key={i}
              style={{
                ...buttonStyle,
                backgroundColor: '#334155',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onClick={() => {
                setTitle(preset.title)
                setMessage(preset.message)
                setSeverity(preset.severity)
              }}
            >
              <span>{preset.title}</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: preset.severity === 'warning' ? '#92400e' : '#312e81',
                  color: preset.severity === 'warning' ? '#fbbf24' : '#a5b4fc',
                }}
              >
                {preset.severity}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
