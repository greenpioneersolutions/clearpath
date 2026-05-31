import { useState, useMemo } from 'react'
import type { PromptTemplate, TemplateVariable, VariableType } from '../../types/template'
import { TEMPLATE_CATEGORIES, VARIABLE_TYPES, MULTI_CAPABLE_VARIABLE_TYPES } from '../../types/template'
import { parseTemplateBody, writeVariableAnnotation, isRequired } from '../../../../shared/templates/parse'

interface Props {
  template?: PromptTemplate | null
  initialBody?: string
  onSaved: (t: PromptTemplate) => void
  onCancel: () => void
}

/** Per-variable metadata the body annotation can't carry (label/required/multiple). */
type VarMeta = Record<string, { label?: string; required?: boolean; multiple?: boolean }>

const TYPE_LABELS: Record<VariableType, string> = {
  text: 'Text',
  longtext: 'Long text',
  select: 'Dropdown',
  directory: 'Folder',
  file: 'File',
  model: 'Model',
  agent: 'Agent',
  skill: 'Skill',
  note: 'Note',
  permissionMode: 'Permission mode',
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

  // Editor-only overlay for label/required/multiple, seeded from the template.
  const [varMeta, setVarMeta] = useState<VarMeta>(() => {
    const seed: VarMeta = {}
    for (const v of template?.variables ?? []) {
      seed[v.name] = { label: v.label, required: v.required, multiple: v.multiple }
    }
    return seed
  })

  // Body is the source of truth for name/type/options.
  const parsedVars = useMemo(() => parseTemplateBody(body), [body])

  /** Merge parsed structure with the editor overlay to get the saved shape. */
  const buildVariables = (): TemplateVariable[] =>
    parsedVars.map((v) => ({ ...v, ...varMeta[v.name] }))

  const setType = (v: TemplateVariable, type: VariableType) => {
    // select keeps its existing options; switching away from select drops them.
    setBody((b) => writeVariableAnnotation(b, v.name, type, type === 'select' ? v.options : undefined))
  }
  const setOptions = (v: TemplateVariable, optionsCsv: string) => {
    const options = optionsCsv.split(',').map((o) => o.trim()).filter(Boolean)
    setBody((b) => writeVariableAnnotation(b, v.name, 'select', options))
  }
  const setMeta = (nameKey: string, patch: Partial<VarMeta[string]>) => {
    setVarMeta((m) => ({ ...m, [nameKey]: { ...m[nameKey], ...patch } }))
  }

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
      variables: buildVariables(),
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
          Prompt Body <span className="text-gray-400 font-normal">— use {'{{VARIABLE_NAME}}'} for fill-in fields (add a type below)</span>
        </label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)}
          rows={8} placeholder="Write your prompt template..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
      </div>

      {/* Per-variable authoring rows. Type + options write back into the body
          annotation; label/required/multiple live in the editor overlay. */}
      {parsedVars.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">Variables</h4>
          {parsedVars.map((v) => {
            const meta = varMeta[v.name] ?? {}
            const canMultiple = MULTI_CAPABLE_VARIABLE_TYPES.includes(v.type)
            return (
              <div key={v.name} className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono">{`{{${v.name}}}`}</code>
                  <select
                    value={v.type}
                    onChange={(e) => setType(v, e.target.value as VariableType)}
                    aria-label={`Type for ${v.name}`}
                    className="ml-auto border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {VARIABLE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={meta.label ?? ''}
                    onChange={(e) => setMeta(v.name, { label: e.target.value || undefined })}
                    placeholder="Label (optional)"
                    className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={isRequired({ ...v, required: meta.required })}
                        onChange={(e) => setMeta(v.name, { required: e.target.checked })} />
                      Required
                    </label>
                    {canMultiple && (
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={!!meta.multiple}
                          onChange={(e) => setMeta(v.name, { multiple: e.target.checked })} />
                        Allow multiple
                      </label>
                    )}
                  </div>
                </div>
                {v.type === 'select' && (
                  <input
                    type="text"
                    value={(v.options ?? []).join(', ')}
                    onChange={(e) => setOptions(v, e.target.value)}
                    placeholder="Options, comma-separated (e.g. low, medium, high)"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

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
