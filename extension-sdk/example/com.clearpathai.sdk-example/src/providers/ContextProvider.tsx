/**
 * Context Provider — Component that serves as the renderer-side support
 * for the context provider contribution declared in the manifest.
 *
 * The actual context building happens in main.ts (sdk-example:ctx-demo handler).
 * This module exists to demonstrate how an extension might also expose a
 * React component for context preview/configuration in the renderer.
 *
 * In practice, context providers are IPC-based (main process), but an
 * extension could show a preview of what context it would produce.
 */

import React, { useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'

/**
 * ContextPreview — Renders a preview of the context that the sdk-example:ctx-demo
 * handler would return. This is not a required component for context providers,
 * but demonstrates how one could build a preview UI.
 */
export function ContextPreview(): React.ReactElement {
  const sdk = useSDK()

  const [topic, setTopic] = useState('')
  const [estimatedTokens, setEstimatedTokens] = useState<number | null>(null)

  const handleEstimate = async () => {
    // Build a preview string similar to what the main process handler produces
    const preview = [
      '## SDK Example Extension Context',
      '',
      `**Topic**: ${topic || '(none)'}`,
      '**Counter**: (stored value)',
      '**Events**: (stored count)',
    ].join('\n')

    try {
      const result = await sdk.context.estimateTokens(preview)
      setEstimatedTokens(result.tokens)
    } catch {
      // Gracefully handle if context:estimate is not available
      setEstimatedTokens(Math.ceil(preview.length / 4))
    }
  }

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>
        Context Provider Preview
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>
        The <code>sdk-example:ctx-demo</code> handler in the main process builds
        context from extension state. Enter a topic to preview the estimated token cost.
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          style={{
            flex: 1,
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            backgroundColor: '#0f172a',
            color: '#e2e8f0',
            fontSize: '12px',
          }}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Optional topic..."
        />
        <button
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#5B4FC4',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer',
          }}
          onClick={handleEstimate}
        >
          Estimate
        </button>
      </div>
      {estimatedTokens !== null && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#7F77DD' }}>
          Estimated tokens: ~{estimatedTokens}
        </div>
      )}
    </div>
  )
}
