import { useState, useEffect, useCallback } from 'react'
import type { PromptTemplate } from '../../types/template'
import { TEMPLATE_CATEGORIES } from '../../types/template'

const COMPLEXITY_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
}

interface Props {
  onSelect: (template: PromptTemplate) => void
  onEdit: (template: PromptTemplate) => void
}

export default function TemplateLibrary({ onSelect, onEdit }: Props): JSX.Element {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('templates:list', {
      category: category === 'all' ? undefined : category,
      search: search || undefined,
    }) as PromptTemplate[]
    setTemplates(result)
    setLoading(false)
  }, [search, category])

  useEffect(() => { void load() }, [load])

  const handleDelete = async (t: PromptTemplate) => {
    if (!confirm(`Delete template "${t.name}"?`)) return
    await window.electronAPI.invoke('templates:delete', { id: t.id })
    void load()
  }

  const handleExport = async (t: PromptTemplate) => {
    const result = await window.electronAPI.invoke('templates:export', { id: t.id }) as
      | { path: string } | { canceled?: boolean; error?: string }
    if ('path' in result) {
      setMessage(`Exported to ${result.path}`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const handleImport = async () => {
    const result = await window.electronAPI.invoke('templates:import') as
      | { template: PromptTemplate } | { canceled?: boolean; error?: string }
    if ('template' in result) {
      setMessage(`Imported "${result.template.name}"`)
      setTimeout(() => setMessage(''), 2000)
      void load()
    } else if ('error' in result && result.error) {
      setMessage(`Error: ${result.error}`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={() => void handleImport()}
          className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Import
        </button>
      </div>

      {message && (
        <div className={`text-xs px-3 py-2 rounded-lg ${
          message.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
        }`}>{message}</div>
      )}

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setCategory('all')}
          className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
            category === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >All</button>
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
              category === cat ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >{cat}</button>
        ))}
      </div>

      {/* Template grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">No templates found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition-colors group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 truncate">{t.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${COMPLEXITY_COLORS[t.complexity]}`}>
                  {t.complexity}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
                <span className="bg-gray-100 px-1.5 py-0.5 rounded">{t.category}</span>
                {t.source === 'builtin' && <span className="text-gray-300">built-in</span>}
                {t.variables.length > 0 && (
                  <span>{t.variables.length} variable{t.variables.length > 1 ? 's' : ''}</span>
                )}
                {t.usageCount > 0 && <span>used {t.usageCount}x</span>}
              </div>

              <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onSelect(t)}
                  className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Use
                </button>
                <button
                  onClick={() => onEdit(t)}
                  className="px-2.5 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => void handleExport(t)}
                  className="px-2.5 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Share
                </button>
                {t.source === 'user' && (
                  <button
                    onClick={() => void handleDelete(t)}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
