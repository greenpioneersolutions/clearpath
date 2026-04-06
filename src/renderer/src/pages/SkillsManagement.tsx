import { useState, useEffect, useCallback } from 'react'
import SkillWizard from '../components/skills/SkillWizard'

interface SkillInfo {
  id: string; name: string; description: string; scope: string; cli: string
  path: string; dirPath: string; enabled: boolean; autoInvoke: boolean
  autoInvokeTrigger?: string; tools?: string[]; model?: string
  content: string; modifiedAt: number
}

type View = 'list' | 'create' | 'detail'

export default function SkillsManagement(): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<SkillInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const cwd = await window.electronAPI.invoke('app:get-cwd') as string
    const list = await window.electronAPI.invoke('skills:list', { workingDirectory: cwd }) as SkillInfo[]
    setSkills(list)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleToggle = async (skill: SkillInfo) => {
    await window.electronAPI.invoke('skills:toggle', { path: skill.path, enabled: !skill.enabled })
    void load()
  }

  const handleDelete = async (skill: SkillInfo) => {
    if (!confirm(`Delete skill "${skill.name}"?`)) return
    await window.electronAPI.invoke('skills:delete', { dirPath: skill.dirPath })
    setSelected(null)
    void load()
  }

  const handleExport = async (skill: SkillInfo) => {
    const result = await window.electronAPI.invoke('skills:export', { path: skill.path, name: skill.name }) as
      { exportedPath?: string; canceled?: boolean }
    if (result.exportedPath) {
      setMessage(`Exported to ${result.exportedPath}`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const handleImport = async () => {
    const cwd = await window.electronAPI.invoke('app:get-cwd') as string
    const result = await window.electronAPI.invoke('skills:import', {
      scope: 'project', cli: 'claude', workingDirectory: cwd,
    }) as { name?: string; canceled?: boolean }
    if (result.name) {
      setMessage(`Imported "${result.name}"`)
      setTimeout(() => setMessage(''), 2000)
      void load()
    }
  }

  const filtered = skills.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  })

  const scopeColor: Record<string, string> = {
    project: 'bg-blue-100 text-blue-700',
    global: 'bg-purple-100 text-purple-700',
    plugin: 'bg-green-100 text-green-700',
    team: 'bg-orange-100 text-orange-700',
  }

  if (view === 'create') {
    return (
      <div className="max-w-2xl">
        <SkillWizard onSaved={() => { setView('list'); void load() }} onCancel={() => setView('list')} />
      </div>
    )
  }

  if (view === 'detail' && selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setView('list'); setSelected(null) }}
          className="text-xs text-gray-500 hover:text-gray-700">&larr; All Skills</button>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{selected.description}</p>
            <div className="flex gap-2 mt-2">
              <span className={`text-xs px-1.5 py-0.5 rounded ${scopeColor[selected.scope]}`}>{selected.scope}</span>
              <span className="text-xs text-gray-400">{selected.cli}</span>
              {selected.autoInvoke && <span className="text-xs text-yellow-600">&#9889; Auto-invoke: {selected.autoInvokeTrigger}</span>}
              {selected.model && <span className="text-xs text-gray-400">Model: {selected.model}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void handleExport(selected)}
              className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Export</button>
            <button onClick={() => void handleDelete(selected)}
              className="px-3 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50">Delete</button>
          </div>
        </div>

        {/* Metadata */}
        {selected.tools && selected.tools.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <span className="text-xs text-gray-500">Tools:</span>
            {selected.tools.map((t) => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{t}</span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="bg-gray-900 rounded-xl p-4 max-h-[400px] overflow-y-auto">
          <pre className="text-sm text-gray-200 font-mono whitespace-pre-wrap">{selected.content}</pre>
        </div>

        <p className="text-xs text-gray-400 font-mono">{selected.path}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Skills</h2>
          <p className="text-sm text-gray-500 mt-0.5">{skills.length} skill{skills.length !== 1 ? 's' : ''} installed</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void handleImport()}
            className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Import</button>
          <button onClick={() => setView('create')}
            className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">+ Create Skill</button>
        </div>
      </div>

      {message && <div className="text-xs px-3 py-2 rounded-lg bg-green-50 text-green-600">{message}</div>}

      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search skills..."
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">{skills.length === 0 ? 'No skills installed' : 'No skills match'}</p>
          <p className="text-xs text-gray-400 mt-1">Create your first skill or import one from a teammate</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {filtered.map((skill) => (
            <div key={skill.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
              <button onClick={() => { setSelected(skill); setView('detail') }} className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{skill.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${scopeColor[skill.scope]}`}>{skill.scope}</span>
                  <span className="text-[10px] text-gray-400">{skill.cli}</span>
                  {skill.autoInvoke && <span className="text-yellow-500 text-xs">&#9889;</span>}
                </div>
                {skill.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{skill.description}</p>}
              </button>
              <button onClick={() => void handleToggle(skill)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                  skill.enabled ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
                role="switch"
                aria-checked={skill.enabled}
                aria-label={`Toggle skill ${skill.name}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  skill.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
