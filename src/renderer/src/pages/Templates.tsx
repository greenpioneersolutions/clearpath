import { useState, useCallback } from 'react'
import type { PromptTemplate } from '../types/template'
import TemplateLibrary from '../components/templates/TemplateLibrary'
import TemplateForm from '../components/templates/TemplateForm'
import TemplateEditor from '../components/templates/TemplateEditor'
import TemplateStats from '../components/templates/TemplateStats'

type View = 'library' | 'use' | 'create' | 'edit' | 'stats'

export default function Templates(): JSX.Element {
  const [view, setView] = useState<View>('library')
  const [selected, setSelected] = useState<PromptTemplate | null>(null)
  const [editTarget, setEditTarget] = useState<PromptTemplate | null>(null)
  const [message, setMessage] = useState('')

  const handleSelect = (t: PromptTemplate) => {
    setSelected(t)
    setView('use')
  }

  const handleEdit = (t: PromptTemplate) => {
    setEditTarget(t)
    setView('edit')
  }

  const handleSend = useCallback(async (hydratedPrompt: string) => {
    // Get active sessions and send to the first running one
    const sessions = await window.electronAPI.invoke('cli:list-sessions') as Array<{ sessionId: string; status: string }>
    const running = sessions.filter((s) => s.status === 'running')

    if (running.length === 0) {
      setMessage('No active session — start a session first in the Sessions tab')
      setTimeout(() => setMessage(''), 3000)
      return
    }

    await window.electronAPI.invoke('cli:send-input', {
      sessionId: running[0].sessionId,
      input: hydratedPrompt,
    })
    setMessage('Prompt sent to active session')
    setTimeout(() => setMessage(''), 2000)
    setView('library')
    setSelected(null)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Reusable prompt templates for common tasks
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('stats')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              view === 'stats' ? 'bg-indigo-600 text-white' : 'text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => { setEditTarget(null); setView('create') }}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Create Template
          </button>
        </div>
      </div>

      {message && (
        <div className={`text-xs px-3 py-2 rounded-lg ${
          message.startsWith('No ') || message.startsWith('Error') ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-600'
        }`}>{message}</div>
      )}

      {/* Content */}
      {view === 'library' && (
        <TemplateLibrary onSelect={handleSelect} onEdit={handleEdit} />
      )}

      {view === 'use' && selected && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
          <TemplateForm
            template={selected}
            onSend={(prompt) => void handleSend(prompt)}
            onCancel={() => { setView('library'); setSelected(null) }}
          />
        </div>
      )}

      {(view === 'create' || view === 'edit') && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
          <TemplateEditor
            template={view === 'edit' ? editTarget : undefined}
            onSaved={() => { setView('library'); setEditTarget(null) }}
            onCancel={() => { setView('library'); setEditTarget(null) }}
          />
        </div>
      )}

      {view === 'stats' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <TemplateStats />
        </div>
      )}
    </div>
  )
}
