import { useState, useEffect, useMemo } from 'react'
import type { PromptTemplate } from '../../types/template'
import { TEMPLATE_CATEGORIES } from '../../types/template'

interface Props {
  onStartFromTemplate: (template: PromptTemplate, filledValues: Record<string, string>) => void
  onStartFromScratch: () => void
  onRunNow: (hydratedPrompt: string) => void
}

export default function TemplateLauncher({ onStartFromTemplate, onStartFromScratch, onRunNow }: Props): JSX.Element {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState<PromptTemplate | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const result = await window.electronAPI.invoke('templates:list', {
        category: category === 'all' ? undefined : category,
        search: search || undefined,
      }) as PromptTemplate[]
      setTemplates(result)
      setLoading(false)
    })()
  }, [search, category])

  // When a template is selected, init form values
  const selectTemplate = (t: PromptTemplate) => {
    setSelected(t)
    const init: Record<string, string> = {}
    for (const v of t.variables) init[v] = ''
    setValues(init)
  }

  const hydrated = useMemo(() => {
    if (!selected) return ''
    let result = selected.body
    for (const [key, val] of Object.entries(values)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || `{{${key}}}`)
    }
    return result
  }, [selected, values])

  const allFilled = selected ? selected.variables.every((v) => values[v]?.trim()) : false

  // Template form view
  if (selected) {
    return (
      <div className="p-6 space-y-5 max-w-2xl mx-auto">
        <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-gray-700">
          &larr; Back to templates
        </button>

        <div>
          <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{selected.description}</p>
          <div className="flex gap-2 mt-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{selected.category}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              selected.complexity === 'low' ? 'bg-green-100 text-green-700' :
              selected.complexity === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
            }`}>{selected.complexity}</span>
            {selected.recommendedModel && <span className="text-xs text-gray-400">model: {selected.recommendedModel}</span>}
          </div>
        </div>

        {/* Variable form fields */}
        {selected.variables.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fill in Variables</h3>
            {selected.variables.map((v) => (
              <div key={v}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </label>
                <input
                  type="text" value={values[v] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                  placeholder={v.toLowerCase().replace(/_/g, ' ')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
        )}

        {/* Live preview */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Preview</h3>
          <div className="bg-gray-900 rounded-lg px-4 py-3 max-h-48 overflow-y-auto">
            <pre className="text-sm text-gray-200 font-mono whitespace-pre-wrap">
              {hydrated.split(/(\{\{[A-Z_]+\}\})/).map((part, i) =>
                part.match(/^\{\{[A-Z_]+\}\}$/)
                  ? <span key={i} className="bg-yellow-500/30 text-yellow-300 rounded px-0.5">{part}</span>
                  : part
              )}
            </pre>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => { onRunNow(hydrated); void window.electronAPI.invoke('templates:record-usage', { id: selected.id }) }}
            disabled={selected.variables.length > 0 && !allFilled}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Run Now
          </button>
          <button
            onClick={() => { onStartFromTemplate(selected, values); void window.electronAPI.invoke('templates:record-usage', { id: selected.id }) }}
            disabled={selected.variables.length > 0 && !allFilled}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add to Workflow
          </button>
        </div>
      </div>
    )
  }

  // Landing state — template browser
  return (
    <div className="p-6 space-y-6">
      <div className="text-center py-4">
        <h2 className="text-xl font-bold text-gray-900">Workflow Composer</h2>
        <p className="text-sm text-gray-500 mt-1">Build multi-step AI workflows or start from a template</p>
      </div>

      {/* Entry points */}
      <div className="flex gap-4 max-w-md mx-auto">
        <button onClick={onStartFromScratch}
          className="flex-1 py-6 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-center">
          <div className="text-2xl mb-1">+</div>
          <div className="text-sm font-medium text-gray-700">Start from Scratch</div>
          <div className="text-xs text-gray-400 mt-0.5">Blank multi-step canvas</div>
        </button>
        <div className="flex-1 py-6 bg-indigo-50 border-2 border-indigo-200 rounded-xl text-center">
          <div className="text-2xl mb-1">&#128196;</div>
          <div className="text-sm font-medium text-indigo-700">Start from Template</div>
          <div className="text-xs text-indigo-500 mt-0.5">Browse below</div>
        </div>
      </div>

      {/* Template browser */}
      <div className="space-y-3">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />

        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setCategory('all')}
            className={`px-2.5 py-1 text-xs rounded-lg ${category === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>All</button>
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`px-2.5 py-1 text-xs rounded-lg ${category === cat ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{cat}</button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse"/>)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {templates.map((t) => (
              <button key={t.id} onClick={() => selectTemplate(t)}
                className="text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-indigo-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">{t.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                    t.complexity === 'low' ? 'bg-green-100 text-green-700' :
                    t.complexity === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>{t.complexity}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</p>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{t.category}</span>
                  {t.variables.length > 0 && <span>{t.variables.length} var{t.variables.length > 1 ? 's' : ''}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
