import { useState, useEffect, useCallback } from 'react'

interface SkillInfo {
  id: string; name: string; description: string; scope: string; cli: string
  path: string; dirPath: string; enabled: boolean; autoInvoke: boolean
  autoInvokeTrigger?: string; modifiedAt: number
}

interface Props {
  onInsertCommand: (command: string) => void
  onCreateSkill: () => void
  onManageSkills: () => void
}

export default function SkillsPanel({ onInsertCommand, onCreateSkill, onManageSkills }: Props): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [cwd, setCwd] = useState('.')

  const load = useCallback(async () => {
    setLoading(true)
    const cwdResult = await window.electronAPI.invoke('app:get-cwd') as string
    setCwd(cwdResult)
    const list = await window.electronAPI.invoke('skills:list', { workingDirectory: cwdResult }) as SkillInfo[]
    setSkills(list)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleToggle = async (skill: SkillInfo) => {
    await window.electronAPI.invoke('skills:toggle', { path: skill.path, enabled: !skill.enabled })
    void load()
  }

  const handleUse = (skill: SkillInfo) => {
    const slug = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    onInsertCommand(`/${slug}`)
    void window.electronAPI.invoke('skills:record-usage', { skillId: skill.id })
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

  return (
    <div className="space-y-3">
      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search skills..."
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">
          {skills.length === 0 ? 'No skills installed' : 'No skills match your search'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((skill) => (
            <div key={skill.id} className={`bg-white border border-gray-200 rounded-lg px-3 py-2.5 transition-colors ${
              !skill.enabled ? 'opacity-50' : ''
            }`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-800 truncate">{skill.name}</span>
                    {skill.autoInvoke && (
                      <span className="text-yellow-500 text-xs" title={skill.autoInvokeTrigger ?? 'Auto-invokes'}>&#9889;</span>
                    )}
                  </div>
                  {skill.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{skill.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${scopeColor[skill.scope] ?? 'bg-gray-100 text-gray-600'}`}>
                      {skill.scope}
                    </span>
                    <span className="text-[10px] text-gray-400">{skill.cli}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => handleUse(skill)}
                    className="px-2 py-1 text-[10px] bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors">
                    Use
                  </button>
                  <button onClick={() => void handleToggle(skill)}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                      skill.enabled ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      skill.enabled ? 'translate-x-3' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom actions */}
      <div className="pt-2 flex gap-2 border-t border-gray-200">
        <button onClick={onCreateSkill}
          className="flex-1 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium">
          + Create Skill
        </button>
        <button onClick={onManageSkills}
          className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors">
          Manage
        </button>
      </div>
    </div>
  )
}
