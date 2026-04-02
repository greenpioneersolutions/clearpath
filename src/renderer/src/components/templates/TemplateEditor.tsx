import { useState, useEffect } from 'react'
import type { PromptTemplate } from '../../types/template'
import { TEMPLATE_CATEGORIES } from '../../types/template'

interface Props {
  template?: PromptTemplate | null
  initialBody?: string
  onSaved: (t: PromptTemplate) => void
  onCancel: () => void
}

export default function TemplateEditor({ template, initialBody, onSaved, onCancel }: Props): JSX.Element {
  const [name, setName] = useState(template?.name ?? '')
  const [category, setCategory] = useState(template?.category ?? 'Custom')
  const [description, setDescription] = useState(template?.description ?? '')
  const [body, setBody] = useState(template?.body ?? initialBody ?? '')
  const [complexity, setComplexity] = useState(template?.complexity ?? 'medium')
  const [model, setModel] = useState(template?.recommendedModel ?? '')
  const [permMode, setPermMode] = useState(template?.recommendedPermissionMode ?? '')
  const [folder, setFolder] = useState(template?.folder ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const variables = (body.match(/\{\{[A-Z_][A-Z0-9_]*\}\}/g) ?? [])
    .map((m) => m.slice(2, -2))
    .filter((v, i, a) => a.indexOf(v) === i)

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) { setError('Name and body are required'); return }
    setSaving(true)
    setError('')
    const result = await window.electronAPI.invoke('templates:save', {
      id: template?.id,
      name: name.trim(), category, description: description.trim(), body,
      recommendedModel: model || undefined,
      recommendedPermissionMode: permMode || undefined,
      complexity, folder: folder || undefined,
    }) as PromptTemplate
    setSaving(false)
    onSaved(result)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {template ? 'Edit Template' : 'Create Template'}
        </h3>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fix auth bug"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description..."
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Prompt Body <span className="text-gray-400 font-normal">— use {'{{VARIABLE_NAME}}'} for placeholders</span>
        </label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)}
          rows={8} placeholder="Write your prompt template..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
        {variables.length > 0 && (
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {variables.map((v) => (
              <span key={v} className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono">
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Complexity</label>
          <select value={complexity} onChange={(e) => setComplexity(e.target.value as 'low' | 'medium' | 'high')}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Model (optional)</label>
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. sonnet"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Perm Mode (optional)</label>
          <select value={permMode} onChange={(e) => setPermMode(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Default</option>
            <option value="plan">Plan</option>
            <option value="acceptEdits">Accept Edits</option>
            <option value="auto">Auto</option>
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button onClick={() => void handleSave()} disabled={saving || !name.trim() || !body.trim()}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
        {saving ? 'Saving...' : template ? 'Update Template' : 'Save Template'}
      </button>
    </div>
  )
}
