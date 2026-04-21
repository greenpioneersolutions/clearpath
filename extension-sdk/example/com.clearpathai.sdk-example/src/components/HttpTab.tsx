/**
 * HTTP Tab — Demonstrates sdk.http.fetch().
 *
 * Fetches from an allowed domain (jsonplaceholder.typicode.com) and
 * displays the result. Also provides a custom URL input for testing
 * allowed domain enforcement.
 */

import React, { useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonStyle, buttonSecondaryStyle, inputStyle, labelStyle,
  errorStyle, successStyle, loadingStyle,
} from './shared-styles'

interface FetchResult {
  status: number
  headers: Record<string, string>
  body: string
}

export function HttpTab(): React.ReactElement {
  const sdk = useSDK()

  const [url, setUrl] = useState('https://jsonplaceholder.typicode.com/posts/1')
  const [method, setMethod] = useState('GET')
  const [result, setResult] = useState<FetchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFetch = async () => {
    try {
      setLoading(true)
      setError(null)
      setResult(null)
      const response = await sdk.http.fetch(url, { method })
      setResult(response)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const presetUrls = [
    { label: 'JSONPlaceholder Post #1', url: 'https://jsonplaceholder.typicode.com/posts/1', method: 'GET' },
    { label: 'JSONPlaceholder Users', url: 'https://jsonplaceholder.typicode.com/users', method: 'GET' },
    { label: 'JSONPlaceholder Todos', url: 'https://jsonplaceholder.typicode.com/todos?_limit=5', method: 'GET' },
    { label: 'GitHub API Root', url: 'https://api.github.com/', method: 'GET' },
  ]

  // Try to pretty-print JSON body
  let prettyBody = result?.body ?? ''
  try {
    if (prettyBody) {
      prettyBody = JSON.stringify(JSON.parse(prettyBody), null, 2)
    }
  } catch {
    // not JSON, leave as-is
  }

  return (
    <div>
      <h2 style={headingStyle}>HTTP (sdk.http)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Fetch from allowed domains. Requires <code>http:fetch</code> permission.
        Allowed: <code>api.github.com</code>, <code>jsonplaceholder.typicode.com</code>.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Request builder */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Request</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '12px' }}>
          <div style={{ width: '100px' }}>
            <label style={labelStyle}>Method</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>URL</label>
            <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <button style={buttonStyle} onClick={handleFetch} disabled={loading}>
            {loading ? 'Fetching...' : 'Send'}
          </button>
        </div>

        {/* Preset URLs */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {presetUrls.map((preset, i) => (
            <button
              key={i}
              style={{ ...buttonSecondaryStyle, fontSize: '11px', padding: '4px 10px' }}
              onClick={() => {
                setUrl(preset.url)
                setMethod(preset.method)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Response display */}
      {loading && <div style={loadingStyle}>Fetching...</div>}
      {result && (
        <div style={cardStyle}>
          <h3 style={{ ...headingStyle, fontSize: '14px' }}>Response</h3>
          <div style={{ marginBottom: '12px' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '2px 10px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: result.status < 400 ? '#065f46' : '#7f1d1d',
                color: result.status < 400 ? '#6ee7b7' : '#fca5a5',
              }}
            >
              {result.status}
            </span>
          </div>

          {/* Headers */}
          <details style={{ marginBottom: '12px' }}>
            <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '12px' }}>
              Response Headers ({Object.keys(result.headers).length})
            </summary>
            <pre
              style={{
                marginTop: '8px',
                padding: '8px',
                backgroundColor: '#0f172a',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#94a3b8',
                overflow: 'auto',
                maxHeight: '200px',
              }}
            >
              {JSON.stringify(result.headers, null, 2)}
            </pre>
          </details>

          {/* Body */}
          <div>
            <span style={{ ...labelStyle, marginBottom: '4px' }}>Body</span>
            <pre
              style={{
                padding: '12px',
                backgroundColor: '#0f172a',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#e2e8f0',
                overflow: 'auto',
                maxHeight: '400px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {prettyBody}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
