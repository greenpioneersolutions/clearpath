/**
 * Storage Tab — Key-value editor demonstrating sdk.storage.
 *
 * Exercises: get, set, delete, keys, quota
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonStyle, buttonSecondaryStyle, buttonDangerStyle,
  inputStyle, errorStyle, successStyle, loadingStyle, tableStyle, thStyle, tdStyle, labelStyle,
} from './shared-styles'

export function StorageTab(): React.ReactElement {
  const sdk = useSDK()

  const [keys, setKeys] = useState<string[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [fetchedKeys, fetchedQuota] = await Promise.all([sdk.storage.keys(), sdk.storage.quota()])
      setKeys(fetchedKeys)
      setQuota(fetchedQuota)

      // Fetch all values
      const vals: Record<string, string> = {}
      for (const key of fetchedKeys) {
        const val = await sdk.storage.get(key)
        vals[key] = typeof val === 'string' ? val : JSON.stringify(val)
      }
      setValues(vals)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sdk])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleSet = async () => {
    if (!newKey.trim()) return
    try {
      setError(null)
      // Try to parse as JSON, fall back to raw string
      let parsed: unknown = newValue
      try {
        parsed = JSON.parse(newValue)
      } catch {
        // keep as string
      }
      await sdk.storage.set(newKey.trim(), parsed)
      setSuccess(`Set "${newKey.trim()}" successfully`)
      setNewKey('')
      setNewValue('')
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (key: string) => {
    try {
      setError(null)
      await sdk.storage.delete(key)
      setSuccess(`Deleted "${key}"`)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div>
      <h2 style={headingStyle}>Storage (sdk.storage)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Key-value store scoped to this extension. Persists across restarts.
      </p>

      {error && <div style={errorStyle}>{error}</div>}
      {success && <div style={successStyle}>{success}</div>}

      {/* Quota display */}
      {quota && (
        <div style={{ ...cardStyle, marginBottom: '16px' }}>
          <h3 style={{ ...headingStyle, fontSize: '14px' }}>Quota</h3>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <span style={labelStyle}>Used</span>
              <span style={{ color: '#e2e8f0', fontSize: '14px' }}>
                {(quota.used / 1024).toFixed(1)} KB
              </span>
            </div>
            <div>
              <span style={labelStyle}>Limit</span>
              <span style={{ color: '#e2e8f0', fontSize: '14px' }}>
                {(quota.limit / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <div>
              <span style={labelStyle}>Usage</span>
              <span style={{ color: '#e2e8f0', fontSize: '14px' }}>
                {((quota.used / quota.limit) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div
            style={{
              marginTop: '8px',
              height: '6px',
              backgroundColor: '#334155',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min((quota.used / quota.limit) * 100, 100)}%`,
                backgroundColor: quota.used / quota.limit > 0.8 ? '#f87171' : '#5B4FC4',
                borderRadius: '3px',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}

      {/* Add new key-value */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Add / Update Entry</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Key</label>
            <input
              style={inputStyle}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="my-key"
            />
          </div>
          <div style={{ flex: 2 }}>
            <label style={labelStyle}>Value (string or JSON)</label>
            <input
              style={inputStyle}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder='{"hello": "world"}'
            />
          </div>
          <button style={buttonStyle} onClick={handleSet}>
            Set
          </button>
        </div>
      </div>

      {/* Key listing */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ ...headingStyle, marginBottom: 0 }}>
            Stored Keys ({keys.length})
          </h3>
          <button style={buttonSecondaryStyle} onClick={refresh}>
            Refresh
          </button>
        </div>
        {loading ? (
          <div style={loadingStyle}>Loading...</div>
        ) : keys.length === 0 ? (
          <div style={loadingStyle}>No keys stored yet.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Key</th>
                <th style={thStyle}>Value</th>
                <th style={{ ...thStyle, width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
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
                    {values[key] ?? '...'}
                  </td>
                  <td style={tdStyle}>
                    <button
                      style={{ ...buttonDangerStyle, padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => handleDelete(key)}
                    >
                      Delete
                    </button>
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
