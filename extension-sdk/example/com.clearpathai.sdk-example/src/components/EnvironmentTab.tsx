/**
 * Environment Tab — Demonstrates sdk.env.keys() and sdk.env.get().
 *
 * Lists available environment variable names and lets the user
 * inspect individual values.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonSecondaryStyle, inputStyle, labelStyle,
  errorStyle, loadingStyle, tableStyle, thStyle, tdStyle,
} from './shared-styles'

export function EnvironmentTab(): React.ReactElement {
  const sdk = useSDK()

  const [envKeys, setEnvKeys] = useState<string[]>([])
  const [envValues, setEnvValues] = useState<Record<string, string | undefined>>({})
  const [lookupKey, setLookupKey] = useState('')
  const [lookupResult, setLookupResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const keys = await sdk.env.keys()
      setEnvKeys(keys)

      // Fetch values for all keys
      const vals: Record<string, string | undefined> = {}
      for (const key of keys) {
        vals[key] = await sdk.env.get(key)
      }
      setEnvValues(vals)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sdk])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleLookup = async () => {
    if (!lookupKey.trim()) return
    try {
      const val = await sdk.env.get(lookupKey.trim())
      setLookupResult(val ?? '(undefined)')
    } catch (err) {
      setLookupResult(`Error: ${(err as Error).message}`)
    }
  }

  return (
    <div>
      <h2 style={headingStyle}>Environment (sdk.env)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Read environment variables configured in the app. Requires <code>env:read</code> permission.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Manual lookup */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Lookup Variable</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Variable Name</label>
            <input
              style={inputStyle}
              value={lookupKey}
              onChange={(e) => setLookupKey(e.target.value)}
              placeholder="GITHUB_TOKEN"
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            />
          </div>
          <button style={buttonSecondaryStyle} onClick={handleLookup}>
            Get
          </button>
        </div>
        {lookupResult !== null && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              backgroundColor: '#0f172a',
              borderRadius: '6px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#e2e8f0',
              wordBreak: 'break-all',
            }}
          >
            {lookupResult}
          </div>
        )}
      </div>

      {/* All environment variables */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ ...headingStyle, marginBottom: 0 }}>
            Available Variables ({envKeys.length})
          </h3>
          <button style={buttonSecondaryStyle} onClick={refresh}>
            Refresh
          </button>
        </div>
        {loading ? (
          <div style={loadingStyle}>Loading...</div>
        ) : envKeys.length === 0 ? (
          <div style={loadingStyle}>No environment variables configured.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Value</th>
              </tr>
            </thead>
            <tbody>
              {envKeys.map((key) => (
                <tr key={key}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{key}</td>
                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {envValues[key] ?? '(undefined)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
