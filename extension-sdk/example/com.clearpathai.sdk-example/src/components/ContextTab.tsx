/**
 * Context Tab — Demonstrates sdk.context.estimateTokens().
 *
 * Provides a text input and shows the estimated token count.
 * Useful for understanding context budget planning.
 */

import React, { useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonStyle, textareaStyle, labelStyle,
  errorStyle, loadingStyle,
} from './shared-styles'

export function ContextTab(): React.ReactElement {
  const sdk = useSDK()

  const [text, setText] = useState(
    'The quick brown fox jumps over the lazy dog. This is a sample text for token estimation.',
  )
  const [result, setResult] = useState<{ tokens: number; method: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEstimate = async () => {
    if (!text.trim()) return
    try {
      setLoading(true)
      setError(null)
      const estimate = await sdk.context.estimateTokens(text)
      setResult(estimate)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const charCount = text.length
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div>
      <h2 style={headingStyle}>Context (sdk.context)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Estimate token counts for text. Requires <code>context:estimate</code> permission.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={cardStyle}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Token Estimator</h3>

        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Input Text</label>
          <textarea
            style={{ ...textareaStyle, minHeight: '120px' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste text here to estimate its token count..."
          />
        </div>

        {/* Input stats */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div>
            <span style={labelStyle}>Characters</span>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>{charCount}</span>
          </div>
          <div>
            <span style={labelStyle}>Words</span>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>{wordCount}</span>
          </div>
          <div>
            <span style={labelStyle}>Chars/Word</span>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
              {wordCount > 0 ? (charCount / wordCount).toFixed(1) : 'N/A'}
            </span>
          </div>
        </div>

        <button style={buttonStyle} onClick={handleEstimate} disabled={loading}>
          {loading ? 'Estimating...' : 'Estimate Tokens'}
        </button>

        {/* Result */}
        {result && (
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: '#0f172a',
              borderRadius: '8px',
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', gap: '24px', alignItems: 'baseline' }}>
              <div>
                <span style={labelStyle}>Estimated Tokens</span>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#7F77DD' }}>
                  {result.tokens}
                </div>
              </div>
              <div>
                <span style={labelStyle}>Method</span>
                <div style={{ fontSize: '14px', color: '#e2e8f0' }}>{result.method}</div>
              </div>
              <div>
                <span style={labelStyle}>Chars/Token</span>
                <div style={{ fontSize: '14px', color: '#e2e8f0' }}>
                  {result.tokens > 0 ? (charCount / result.tokens).toFixed(2) : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick test presets */}
      <div style={{ ...cardStyle, marginTop: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Sample Texts</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { label: 'Short sentence', text: 'Hello, world!' },
            { label: 'Code snippet', text: 'function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}' },
            { label: 'Markdown heading', text: '# Extension SDK Reference\n\n## Overview\n\nThe ClearPathAI Extension SDK provides a comprehensive API for building extensions.' },
            { label: 'JSON object', text: JSON.stringify({ id: 1, name: 'example', tags: ['sdk', 'extension'], nested: { deep: true } }, null, 2) },
          ].map((preset) => (
            <button
              key={preset.label}
              style={{
                ...buttonStyle,
                backgroundColor: '#334155',
                textAlign: 'left',
                fontSize: '12px',
              }}
              onClick={() => setText(preset.text)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
