/**
 * Feature Flags Tab — Demonstrates sdk.featureFlags.getAll(), .get(), .set().
 *
 * Shows all feature flags with toggle switches. Demonstrates both read
 * (feature-flags:read) and write (feature-flags:write) permissions.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonSecondaryStyle, buttonStyle,
  errorStyle, successStyle, loadingStyle, labelStyle, inputStyle,
} from './shared-styles'

export function FeatureFlagsTab(): React.ReactElement {
  const sdk = useSDK()

  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lookupKey, setLookupKey] = useState('')
  const [lookupResult, setLookupResult] = useState<boolean | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const allFlags = await sdk.featureFlags.getAll()
      setFlags(allFlags)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sdk])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleToggle = async (key: string, currentValue: boolean) => {
    try {
      setError(null)
      setSuccess(null)
      await sdk.featureFlags.set(key, !currentValue)
      setSuccess(`Flag "${key}" set to ${!currentValue}`)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleLookup = async () => {
    if (!lookupKey.trim()) return
    try {
      const val = await sdk.featureFlags.get(lookupKey.trim())
      setLookupResult(val)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const flagEntries = Object.entries(flags)

  return (
    <div>
      <h2 style={headingStyle}>Feature Flags (sdk.featureFlags)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Read and toggle feature flags. Requires <code>feature-flags:read</code> and <code>feature-flags:write</code> permissions.
      </p>

      {error && <div style={errorStyle}>{error}</div>}
      {success && <div style={successStyle}>{success}</div>}

      {/* Individual flag lookup */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Lookup Flag</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Flag Key</label>
            <input
              style={inputStyle}
              value={lookupKey}
              onChange={(e) => setLookupKey(e.target.value)}
              placeholder="sdkExampleEnabled"
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            />
          </div>
          <button style={buttonSecondaryStyle} onClick={handleLookup}>
            Check
          </button>
        </div>
        {lookupResult !== null && (
          <div style={{ marginTop: '8px', color: '#e2e8f0', fontSize: '14px' }}>
            <code>{lookupKey}</code> = <strong>{lookupResult ? 'true' : 'false'}</strong>
          </div>
        )}
      </div>

      {/* All flags */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ ...headingStyle, marginBottom: 0 }}>
            All Flags ({flagEntries.length})
          </h3>
          <button style={buttonSecondaryStyle} onClick={refresh}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={loadingStyle}>Loading flags...</div>
        ) : flagEntries.length === 0 ? (
          <div style={loadingStyle}>No feature flags registered.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {flagEntries.map(([key, value]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  backgroundColor: '#0f172a',
                  borderRadius: '6px',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#e2e8f0' }}>
                  {key}
                </span>
                <button
                  style={{
                    ...buttonStyle,
                    backgroundColor: value ? '#065f46' : '#334155',
                    color: value ? '#6ee7b7' : '#94a3b8',
                    padding: '4px 14px',
                    fontSize: '12px',
                    minWidth: '60px',
                  }}
                  onClick={() => handleToggle(key, value)}
                >
                  {value ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
