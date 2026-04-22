/**
 * Events Tab — Demonstrates sdk.events.on().
 *
 * Subscribes to various host events and displays a live event log.
 * Shows how to subscribe, unsubscribe, and handle events in real-time.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonStyle, buttonSecondaryStyle, buttonDangerStyle,
  inputStyle, labelStyle, errorStyle, loadingStyle, successStyle,
} from './shared-styles'

interface EventEntry {
  id: number
  event: string
  data: unknown
  timestamp: number
}

const DEFAULT_SUBSCRIPTIONS = [
  'session:started',
  'session:stopped',
  'turn:started',
  'turn:ended',
  'theme-changed',
  'notification:emitted',
]

export function EventsTab(): React.ReactElement {
  const sdk = useSDK()

  const [events, setEvents] = useState<EventEntry[]>([])
  const [subscriptions, setSubscriptions] = useState<string[]>([])
  const [newEvent, setNewEvent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [roundTripStatus, setRoundTripStatus] = useState<string | null>(null)
  const [roundTripSending, setRoundTripSending] = useState(false)
  const unsubFns = useRef<Map<string, () => void>>(new Map())
  const eventIdRef = useRef(0)

  const subscribe = useCallback(
    (eventName: string) => {
      if (unsubFns.current.has(eventName)) return // Already subscribed

      const unsub = sdk.events.on(eventName, (data) => {
        const entry: EventEntry = {
          id: ++eventIdRef.current,
          event: eventName,
          data,
          timestamp: Date.now(),
        }
        setEvents((prev) => [entry, ...prev].slice(0, 200))
      })

      unsubFns.current.set(eventName, unsub)
      setSubscriptions((prev) => [...prev, eventName])
    },
    [sdk],
  )

  const unsubscribe = useCallback((eventName: string) => {
    const unsub = unsubFns.current.get(eventName)
    if (unsub) {
      unsub()
      unsubFns.current.delete(eventName)
      setSubscriptions((prev) => prev.filter((s) => s !== eventName))
    }
  }, [])

  // Subscribe to default events on mount
  useEffect(() => {
    for (const evt of DEFAULT_SUBSCRIPTIONS) {
      subscribe(evt)
    }

    return () => {
      // Cleanup all subscriptions on unmount
      for (const unsub of unsubFns.current.values()) {
        unsub()
      }
      unsubFns.current.clear()
    }
  }, [subscribe])

  const handleAddSubscription = () => {
    const name = newEvent.trim()
    if (!name) return
    if (subscriptions.includes(name)) {
      setError(`Already subscribed to "${name}"`)
      return
    }
    setError(null)
    subscribe(name)
    setNewEvent('')
  }

  const clearLog = () => setEvents([])

  const handleRoundTrip = async () => {
    try {
      setRoundTripSending(true)
      setRoundTripStatus(null)
      await sdk.notifications.emit({
        title: 'Events Round-trip Test',
        message: 'Emitted from EventsTab — watch for notification:emitted below.',
        severity: 'info',
      })
      setRoundTripStatus('Notification emitted — notification:emitted event should appear in the log.')
    } catch (err) {
      setRoundTripStatus(`Error: ${(err as Error).message}`)
    } finally {
      setRoundTripSending(false)
    }
  }

  return (
    <div>
      <h2 style={headingStyle}>Events (sdk.events)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Subscribe to host app events and view them in real-time.
        Uses <code>sdk.events.on()</code> to register callbacks.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Round-trip demo */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Notification Round-trip Demo</h3>
        <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '10px' }}>
          Click the button to emit a notification via <code>sdk.notifications.emit()</code>.
          The host fires a <code>notification:emitted</code> event back — watch it appear in
          the Event Log below. Make sure <code>notification:emitted</code> is subscribed.
        </p>
        <button
          id="test-round-trip"
          style={buttonStyle}
          onClick={handleRoundTrip}
          disabled={roundTripSending}
        >
          {roundTripSending ? 'Sending...' : 'Emit Notification + Watch Event'}
        </button>
        {roundTripStatus && (
          <div style={{ ...successStyle, marginTop: '10px', fontSize: '12px' }}>
            {roundTripStatus}
          </div>
        )}
      </div>

      {/* Active subscriptions */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>
          Active Subscriptions ({subscriptions.length})
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {subscriptions.length === 0 ? (
            <span style={loadingStyle}>No active subscriptions.</span>
          ) : (
            subscriptions.map((name) => (
              <span
                key={name}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  backgroundColor: '#312e81',
                  color: '#a5b4fc',
                  fontSize: '12px',
                }}
              >
                {name}
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f87171',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: 0,
                    lineHeight: 1,
                  }}
                  onClick={() => unsubscribe(name)}
                  title={`Unsubscribe from ${name}`}
                >
                  x
                </button>
              </span>
            ))
          )}
        </div>

        {/* Add new subscription */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Event Name</label>
            <input
              style={inputStyle}
              value={newEvent}
              onChange={(e) => setNewEvent(e.target.value)}
              placeholder="custom:my-event"
              onKeyDown={(e) => e.key === 'Enter' && handleAddSubscription()}
            />
          </div>
          <button style={buttonStyle} onClick={handleAddSubscription}>
            Subscribe
          </button>
        </div>
      </div>

      {/* Event log */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ ...headingStyle, marginBottom: 0 }}>
            Event Log ({events.length})
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={buttonDangerStyle} onClick={clearLog}>
              Clear
            </button>
          </div>
        </div>

        {events.length === 0 ? (
          <div style={loadingStyle}>
            Waiting for events... Interact with the app to generate events.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '500px', overflowY: 'auto' }}>
            {events.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#0f172a',
                  borderRadius: '6px',
                  fontSize: '12px',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ color: '#64748b', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11px' }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span
                  style={{
                    padding: '1px 8px',
                    borderRadius: '9999px',
                    backgroundColor: '#312e81',
                    color: '#a5b4fc',
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.event}
                </span>
                <span
                  style={{
                    color: '#94a3b8',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {entry.data !== undefined ? JSON.stringify(entry.data) : '(no data)'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
