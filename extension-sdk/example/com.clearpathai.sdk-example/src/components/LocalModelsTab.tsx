/**
 * Local Models Tab — Demonstrates sdk.localModels.detect() and sdk.localModels.chat().
 *
 * Detects Ollama and LM Studio instances, lists their models, and provides
 * a simple chat interface to test local model interaction.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonStyle, buttonSecondaryStyle,
  errorStyle, loadingStyle, tagStyle, labelStyle, inputStyle, textareaStyle,
} from './shared-styles'

interface DetectResult {
  ollama: { connected: boolean; models: Array<{ name: string; size?: string }> }
  lmstudio: { connected: boolean; models: Array<{ name: string }> }
}

export function LocalModelsTab(): React.ReactElement {
  const sdk = useSDK()

  const [detection, setDetection] = useState<DetectResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Chat state
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedSource, setSelectedSource] = useState<'ollama' | 'lmstudio'>('ollama')
  const [chatInput, setChatInput] = useState('Hello! What model are you?')
  const [chatResponse, setChatResponse] = useState<string | null>(null)
  const [chatLoading, setChatLoading] = useState(false)

  const detect = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await sdk.localModels.detect()
      setDetection(result)

      // Auto-select first available model
      if (result.ollama.connected && result.ollama.models.length > 0) {
        setSelectedModel(result.ollama.models[0].name)
        setSelectedSource('ollama')
      } else if (result.lmstudio.connected && result.lmstudio.models.length > 0) {
        setSelectedModel(result.lmstudio.models[0].name)
        setSelectedSource('lmstudio')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sdk])

  useEffect(() => {
    detect()
  }, [detect])

  const handleChat = async () => {
    if (!selectedModel || !chatInput.trim()) return
    try {
      setChatLoading(true)
      setError(null)
      const result = await sdk.localModels.chat({
        model: selectedModel,
        messages: [{ role: 'user', content: chatInput }],
        source: selectedSource,
      })
      setChatResponse(result.content)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setChatLoading(false)
    }
  }

  const allModels = detection
    ? [
        ...detection.ollama.models.map((m) => ({ ...m, source: 'ollama' as const })),
        ...detection.lmstudio.models.map((m) => ({ ...m, source: 'lmstudio' as const })),
      ]
    : []

  return (
    <div>
      <h2 style={headingStyle}>Local Models (sdk.localModels)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Detect and interact with local AI models (Ollama, LM Studio).
        Requires <code>local-models:access</code> permission.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Connection status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {(['ollama', 'lmstudio'] as const).map((provider) => {
          const info = detection?.[provider]
          return (
            <div key={provider} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ ...headingStyle, fontSize: '14px', marginBottom: 0 }}>
                  {provider === 'ollama' ? 'Ollama' : 'LM Studio'}
                </h3>
                {loading ? (
                  <span style={loadingStyle}>Detecting...</span>
                ) : (
                  <span
                    style={{
                      ...tagStyle,
                      backgroundColor: info?.connected ? '#065f46' : '#334155',
                      color: info?.connected ? '#6ee7b7' : '#94a3b8',
                    }}
                  >
                    {info?.connected ? 'Connected' : 'Not Found'}
                  </span>
                )}
              </div>
              {info?.connected && (
                <div style={{ marginTop: '12px' }}>
                  <span style={labelStyle}>
                    {info.models.length} model{info.models.length !== 1 ? 's' : ''} available
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {info.models.map((m) => (
                      <span
                        key={m.name}
                        style={{
                          ...tagStyle,
                          backgroundColor: '#312e81',
                          color: '#a5b4fc',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setSelectedModel(m.name)
                          setSelectedSource(provider)
                        }}
                      >
                        {m.name}
                        {'size' in m && m.size ? ` (${m.size})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Refresh */}
      <div style={{ marginBottom: '16px' }}>
        <button style={buttonSecondaryStyle} onClick={detect}>
          Re-detect
        </button>
      </div>

      {/* Chat */}
      <div style={cardStyle}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Chat with Local Model</h3>
        {allModels.length === 0 ? (
          <div style={loadingStyle}>No local models detected. Start Ollama or LM Studio first.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Model</label>
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={`${selectedSource}:${selectedModel}`}
                onChange={(e) => {
                  const [src, ...rest] = e.target.value.split(':')
                  setSelectedSource(src as 'ollama' | 'lmstudio')
                  setSelectedModel(rest.join(':'))
                }}
              >
                {allModels.map((m) => (
                  <option key={`${m.source}:${m.name}`} value={`${m.source}:${m.name}`}>
                    [{m.source}] {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Message</label>
              <textarea
                style={textareaStyle}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
            </div>
            <button style={buttonStyle} onClick={handleChat} disabled={chatLoading}>
              {chatLoading ? 'Sending...' : 'Send'}
            </button>
            {chatResponse !== null && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#0f172a',
                  borderRadius: '6px',
                  borderLeft: '3px solid #1D9E75',
                }}
              >
                <span style={{ ...labelStyle, marginBottom: '4px' }}>Response</span>
                <div style={{ fontSize: '13px', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                  {chatResponse}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
