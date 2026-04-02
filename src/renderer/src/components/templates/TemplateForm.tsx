import { useState, useMemo } from 'react'
import type { PromptTemplate } from '../../types/template'

interface Props {
  template: PromptTemplate
  onSend: (hydratedPrompt: string) => void
  onCancel: () => void
}

export default function TemplateForm({ template, onSend, onCancel }: Props): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const v of template.variables) init[v] = ''
    return init
  })

  const hydrated = useMemo(() => {
    let result = template.body
    for (const [key, val] of Object.entries(values)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `{{${key}}}`)
    }
    return result
  }, [template.body, values])

  const allFilled = template.variables.every((v) => values[v]?.trim())

  const handleSend = () => {
    onSend(hydrated)
    // Record usage
    void window.electronAPI.invoke('templates:record-usage', { id: template.id })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
          <div className="flex gap-2 mt-2 text-xs text-gray-400">
            <span className="bg-gray-100 px-1.5 py-0.5 rounded">{template.category}</span>
            {template.recommendedModel && (
              <span>model: {template.recommendedModel}</span>
            )}
            {template.recommendedPermissionMode && (
              <span>mode: {template.recommendedPermissionMode}</span>
            )}
          </div>
        </div>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      {/* Variable inputs */}
      {template.variables.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">Fill in Variables</h4>
          {template.variables.map((v) => (
            <div key={v}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <code className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono">
                  {`{{${v}}}`}
                </code>
              </label>
              <input
                type="text"
                value={values[v] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                placeholder={v.toLowerCase().replace(/_/g, ' ')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* Preview */}
      <div>
        <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">Preview</h4>
        <div className="bg-gray-900 rounded-lg px-4 py-3 max-h-48 overflow-y-auto">
          <pre className="text-sm text-gray-200 font-mono whitespace-pre-wrap">{hydrated}</pre>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSend}
          disabled={template.variables.length > 0 && !allFilled}
          className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Send to Active Session
        </button>
      </div>
    </div>
  )
}
