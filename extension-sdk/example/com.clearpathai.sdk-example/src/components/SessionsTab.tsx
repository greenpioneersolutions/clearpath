/**
 * Sessions Tab — Demonstrates sdk.sessions.list(), sdk.sessions.getActive(),
 * and sdk.sessions.getMessages().
 *
 * Shows all sessions, highlights the active one, and lets the user
 * drill into message history.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonSecondaryStyle, buttonStyle,
  errorStyle, loadingStyle, tableStyle, thStyle, tdStyle, tagStyle, labelStyle,
} from './shared-styles'

interface Session {
  sessionId: string
  cli: 'copilot' | 'claude'
  name?: string
  status: 'running' | 'stopped'
  startedAt: number
  endedAt?: number
}

interface Message {
  type: string
  content: string
  sender?: 'user' | 'ai' | 'system'
  timestamp?: number
  metadata?: Record<string, unknown>
}

export function SessionsTab(): React.ReactElement {
  const sdk = useSDK()

  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [list, active] = await Promise.all([sdk.sessions.list(), sdk.sessions.getActive()])
      setSessions(list)
      setActiveId(active)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sdk])

  useEffect(() => {
    refresh()
  }, [refresh])

  const loadMessages = async (sessionId: string) => {
    try {
      setMsgLoading(true)
      setSelectedSession(sessionId)
      const msgs = await sdk.sessions.getMessages(sessionId)
      setMessages(msgs)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setMsgLoading(false)
    }
  }

  const formatTime = (ts: number) => new Date(ts).toLocaleString()

  return (
    <div>
      <h2 style={headingStyle}>Sessions (sdk.sessions)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        List sessions and read message history. Requires <code>sessions:read</code> permission.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Active session indicator */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Active Session</h3>
        <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#e2e8f0' }}>
          {activeId ? (
            <span>
              <span
                style={{
                  ...tagStyle,
                  backgroundColor: '#065f46',
                  color: '#6ee7b7',
                  marginRight: '8px',
                }}
              >
                RUNNING
              </span>
              {activeId}
            </span>
          ) : (
            <span style={{ color: '#94a3b8' }}>No active session</span>
          )}
        </div>
      </div>

      {/* Sessions list */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ ...headingStyle, marginBottom: 0 }}>
            All Sessions ({sessions.length})
          </h3>
          <button style={buttonSecondaryStyle} onClick={refresh}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={loadingStyle}>Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div style={loadingStyle}>No sessions found.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Session</th>
                <th style={thStyle}>CLI</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Started</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px' }}>
                    {s.name || s.sessionId.slice(0, 12) + '...'}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        ...tagStyle,
                        backgroundColor: s.cli === 'copilot' ? '#312e81' : '#7c2d12',
                        color: s.cli === 'copilot' ? '#a5b4fc' : '#fdba74',
                      }}
                    >
                      {s.cli}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        ...tagStyle,
                        backgroundColor: s.status === 'running' ? '#065f46' : '#334155',
                        color: s.status === 'running' ? '#6ee7b7' : '#94a3b8',
                      }}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: '12px' }}>{formatTime(s.startedAt)}</td>
                  <td style={tdStyle}>
                    <button
                      style={{ ...buttonStyle, padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => loadMessages(s.sessionId)}
                    >
                      Messages
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Message viewer */}
      {selectedSession && (
        <div style={{ ...cardStyle, marginTop: '16px' }}>
          <h3 style={{ ...headingStyle, fontSize: '14px' }}>
            Messages — {selectedSession.slice(0, 12)}...
          </h3>
          {msgLoading ? (
            <div style={loadingStyle}>Loading messages...</div>
          ) : messages.length === 0 ? (
            <div style={loadingStyle}>No messages in this session.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
              {messages.slice(0, 50).map((msg, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor:
                      msg.sender === 'user' ? '#312e81' : msg.sender === 'ai' ? '#1e293b' : '#1a1a2e',
                    borderLeft: `3px solid ${
                      msg.sender === 'user' ? '#5B4FC4' : msg.sender === 'ai' ? '#1D9E75' : '#334155'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ ...labelStyle, marginBottom: 0 }}>
                      {msg.sender ?? 'unknown'} / {msg.type}
                    </span>
                    {msg.timestamp && (
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#e2e8f0',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '100px',
                      overflow: 'hidden',
                    }}
                  >
                    {msg.content.slice(0, 500)}
                    {msg.content.length > 500 && '...'}
                  </div>
                </div>
              ))}
              {messages.length > 50 && (
                <div style={{ ...loadingStyle, textAlign: 'center' }}>
                  Showing 50 of {messages.length} messages
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
