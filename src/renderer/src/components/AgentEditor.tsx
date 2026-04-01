import { useEffect, useState } from 'react'
import type { AgentDef } from '../types/ipc'

interface Props {
  agent: AgentDef | null
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

export function AgentEditor({ agent, isOpen, onClose, onSaved }: Props): JSX.Element | null {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!isOpen || !agent?.filePath) return

    setLoading(true)
    setError(null)
    setDirty(false)
    void (
      window.electronAPI.invoke('agent:read-file', { filePath: agent.filePath }) as Promise<string>
    ).then((c) => {
      setContent(c)
      setLoading(false)
    }).catch((e: unknown) => {
      setError(String(e))
      setLoading(false)
    })
  }, [isOpen, agent?.filePath])

  const handleSave = () => {
    if (!agent?.filePath) return
    setSaving(true)
    setError(null)
    void window.electronAPI
      .invoke('agent:write-file', { filePath: agent.filePath, content })
      .then(() => {
        setSaving(false)
        setDirty(false)
        onSaved()
      })
      .catch((e: unknown) => {
        setError(String(e))
        setSaving(false)
      })
  }

  if (!isOpen || !agent) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit Agent</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-sm">
              {agent.filePath}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Unsaved
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex-1 overflow-hidden relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              Loading…
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setDirty(true)
              }}
              className="w-full h-full resize-none p-5 font-mono text-xs text-gray-800 leading-relaxed outline-none bg-gray-50"
              spellCheck={false}
              placeholder="---&#10;name: My Agent&#10;description: What this agent does&#10;model: claude-sonnet-4-6&#10;tools:&#10;  - Read&#10;  - Write&#10;---&#10;&#10;System prompt here..."
            />
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="px-6 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">
            {error}
          </div>
        )}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-gray-400">
            Markdown file with YAML frontmatter
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !dirty}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
