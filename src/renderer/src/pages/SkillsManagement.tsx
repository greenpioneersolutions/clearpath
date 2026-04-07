import { useState, useEffect, useCallback } from 'react'
import SkillWizard from '../components/skills/SkillWizard'
import { StarterSkillWalkthrough } from '../components/StarterSkillWalkthrough'

interface SkillInfo {
  id: string; name: string; description: string; scope: string; cli: string
  path: string; dirPath: string; enabled: boolean; autoInvoke: boolean
  autoInvokeTrigger?: string; tools?: string[]; model?: string
  content: string; modifiedAt: number
}

interface StarterSkill {
  id: string
  name: string
  description: string
  inputDescription: string
  outputDescription: string
  primaryAgents: string[]
  secondaryAgents: string[]
  skillPrompt: string
}

interface StarterAgent {
  id: string
  name: string
  associatedSkills: string[]
}

interface AgentListResult {
  copilot: { name: string }[]
  claude: { name: string }[]
}

type View = 'list' | 'create' | 'detail'

export default function SkillsManagement(): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [starterSkills, setStarterSkills] = useState<StarterSkill[]>([])
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<SkillInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  // Walkthrough state
  const [walkthroughSkill, setWalkthroughSkill] = useState<StarterSkill | null>(null)

  // Agent-based recommendations
  const [missingForAgents, setMissingForAgents] = useState<
    { skill: StarterSkill; agentNames: string[] }[]
  >([])

  const load = useCallback(async () => {
    setLoading(true)
    const cwd = await window.electronAPI.invoke('app:get-cwd') as string
    const [list, starters, starterAgents, agentList] = await Promise.all([
      window.electronAPI.invoke('skills:list', { workingDirectory: cwd }) as Promise<SkillInfo[]>,
      window.electronAPI.invoke('starter-pack:get-skills') as Promise<StarterSkill[]>,
      window.electronAPI.invoke('starter-pack:get-agents') as Promise<StarterAgent[]>,
      window.electronAPI.invoke('agent:list', {}) as Promise<AgentListResult>,
    ])
    setSkills(list)
    setStarterSkills(Array.isArray(starters) ? starters : [])

    // Cross-reference: find skills that installed agents recommend but user doesn't have
    const installedSkillNames = new Set(list.map((s) => s.name.toLowerCase()))
    const installedAgentNames = new Set(
      [...(agentList.copilot ?? []), ...(agentList.claude ?? [])].map((a) => a.name.toLowerCase())
    )
    const starterAgentArr = Array.isArray(starterAgents) ? starterAgents : []
    const skillMap = new Map((Array.isArray(starters) ? starters : []).map((s) => [s.id, s]))

    // For each installed agent that matches a starter agent, collect its missing skills
    const gapMap = new Map<string, string[]>() // skillId → [agentName, ...]
    for (const sa of starterAgentArr) {
      if (!installedAgentNames.has(sa.name.toLowerCase())) continue
      for (const skillId of sa.associatedSkills) {
        const skill = skillMap.get(skillId)
        if (!skill || installedSkillNames.has(skill.name.toLowerCase())) continue
        if (!gapMap.has(skillId)) gapMap.set(skillId, [])
        gapMap.get(skillId)!.push(sa.name)
      }
    }

    const gaps = Array.from(gapMap.entries())
      .map(([skillId, agentNames]) => ({
        skill: skillMap.get(skillId)!,
        agentNames,
      }))
      .filter((g) => g.skill)

    setMissingForAgents(gaps)
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

  // Check if a starter skill was already created
  const createdSkillNames = new Set(skills.map((s) => s.name.toLowerCase()))
  const isStarterCreated = (starter: StarterSkill) =>
    createdSkillNames.has(starter.name.toLowerCase())

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
      <SkillDetailEditor
        skill={selected}
        scopeColor={scopeColor}
        onBack={() => { setView('list'); setSelected(null) }}
        onExport={() => void handleExport(selected)}
        onDelete={() => void handleDelete(selected)}
        onSaved={() => { void load() }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Skills</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Create and manage skills for your CLI sessions
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void handleImport()}
            className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Import</button>
          <button onClick={() => setView('create')}
            className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">+ Create Skill</button>
        </div>
      </div>

      {message && <div className="text-xs px-3 py-2 rounded-lg bg-green-50 text-green-600">{message}</div>}

      {/* ── Starter Pack: Try These Skills ── */}
      {starterSkills.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-1">
            <BoltIcon />
            <h3 className="text-sm font-semibold text-gray-900">Starter Pack</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Recommended skills to supercharge your agents. Pick one and we'll walk you through creating it.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {starterSkills.map((skill) => {
              const alreadyCreated = isStarterCreated(skill)
              return (
                <div
                  key={skill.id}
                  className={`relative bg-white border rounded-xl p-4 transition-all ${
                    alreadyCreated
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-gray-200 hover:shadow-md hover:border-amber-300 cursor-pointer'
                  }`}
                  onClick={() => { if (!alreadyCreated) setWalkthroughSkill(skill) }}
                >
                  {/* Badge */}
                  {alreadyCreated && (
                    <span className="absolute top-3 right-3 text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      Created
                    </span>
                  )}

                  <div className="pr-16">
                    <h4 className="text-sm font-semibold text-gray-900 mb-0.5">{skill.name}</h4>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{skill.description}</p>

                  {!alreadyCreated ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setWalkthroughSkill(skill) }}
                      className="w-full text-xs font-medium px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Try This Skill
                    </button>
                  ) : (
                    <p className="text-xs text-green-600 text-center py-1.5">
                      Already in your skills
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Recommended for Your Agents ── */}
      {missingForAgents.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-1">
            <LinkIcon />
            <h3 className="text-sm font-semibold text-gray-900">Recommended for Your Agents</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Based on the agents you've created, you're missing these skills that pair with them.
          </p>

          <div className="space-y-2">
            {missingForAgents.map(({ skill, agentNames }) => {
              const alreadyCreated = createdSkillNames.has(skill.name.toLowerCase())
              return (
                <div
                  key={skill.id}
                  className={`flex items-center gap-4 bg-white border rounded-xl px-4 py-3 transition-all ${
                    alreadyCreated
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-amber-200 hover:shadow-md cursor-pointer'
                  }`}
                  onClick={() => { if (!alreadyCreated) setWalkthroughSkill(skill) }}
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <BoltIconSmall />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{skill.name}</span>
                      {alreadyCreated && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Created</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{skill.description}</p>
                    <p className="text-[10px] text-amber-600 mt-1">
                      Pairs with: {agentNames.join(', ')}
                    </p>
                  </div>
                  {!alreadyCreated && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setWalkthroughSkill(skill) }}
                      className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0"
                    >
                      Create
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Your Skills ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
            Your Skills
            <span className="text-xs font-normal text-gray-400 ml-2 normal-case">
              {skills.length} skill{skills.length !== 1 ? 's' : ''} installed
            </span>
          </h3>
        </div>

        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills..."
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3" />

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-400 mb-2">
              {skills.length === 0 ? 'No skills yet' : 'No skills match'}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {skills.length === 0
                ? 'Pick one from the Starter Pack above, or create your own from scratch.'
                : 'Try a different search term'}
            </p>
            {skills.length === 0 && (
              <button onClick={() => setView('create')}
                className="text-sm text-indigo-600 hover:underline">
                Create from scratch
              </button>
            )}
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
      </section>

      {/* Walkthrough modal */}
      {walkthroughSkill && (
        <StarterSkillWalkthrough
          skill={walkthroughSkill}
          activeCli="copilot"
          isOpen={walkthroughSkill !== null}
          onClose={() => setWalkthroughSkill(null)}
          onCreated={() => void load()}
        />
      )}
    </div>
  )
}

// ── Skill Detail Editor ─────────────────────────────────────────────────────

function SkillDetailEditor({
  skill,
  scopeColor,
  onBack,
  onExport,
  onDelete,
  onSaved,
}: {
  skill: SkillInfo
  scopeColor: Record<string, string>
  onBack: () => void
  onExport: () => void
  onDelete: () => void
  onSaved: () => void
}): JSX.Element {
  const [editName, setEditName] = useState(skill.name)
  const [editDesc, setEditDesc] = useState(skill.description)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Parse the body out of the raw content on mount
  useEffect(() => {
    // Extract just the body (after frontmatter)
    const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(skill.content)
    setEditContent(match ? match[1].trim() : skill.content)
    setEditName(skill.name)
    setEditDesc(skill.description)
    setDirty(false)
  }, [skill])

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const cwd = await window.electronAPI.invoke('app:get-cwd') as string
      await window.electronAPI.invoke('skills:save', {
        name: editName.trim(),
        description: editDesc.trim(),
        body: editContent,
        scope: skill.scope as 'project' | 'global',
        cli: skill.cli as 'copilot' | 'claude' | 'both',
        workingDirectory: cwd,
        existingPath: skill.path,
        tools: skill.tools?.length ? skill.tools : undefined,
        model: skill.model || undefined,
      })
      setSaving(false)
      setDirty(false)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2000)
      onSaved()
    } catch (e) {
      setSaving(false)
      setSaveMsg(`Error: ${e}`)
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack}
        className="text-xs text-gray-500 hover:text-gray-700">&larr; All Skills</button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded ${scopeColor[skill.scope] ?? 'bg-gray-100 text-gray-600'}`}>{skill.scope}</span>
          <span className="text-xs text-gray-400">{skill.cli}</span>
          {skill.autoInvoke && <span className="text-xs text-yellow-600">&#9889; Auto-invoke: {skill.autoInvokeTrigger}</span>}
          {skill.model && <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{skill.model}</span>}
          {dirty && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Unsaved</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={onExport}
            className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Export</button>
          <button onClick={onDelete}
            className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50">Delete</button>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Skill Name</label>
        <input
          type="text"
          value={editName}
          onChange={(e) => { setEditName(e.target.value); setDirty(true) }}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
        <textarea
          value={editDesc}
          onChange={(e) => { setEditDesc(e.target.value); setDirty(true) }}
          rows={2}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
        />
      </div>

      {/* Tools */}
      {skill.tools && skill.tools.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-xs text-gray-500">Tools:</span>
          {skill.tools.map((t) => (
            <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      )}

      {/* Content editor */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Skill Content</label>
        <textarea
          value={editContent}
          onChange={(e) => { setEditContent(e.target.value); setDirty(true) }}
          rows={20}
          className="w-full text-sm border border-gray-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-300 resize-y font-mono leading-relaxed"
          spellCheck={false}
          placeholder="Skill instructions in markdown..."
        />
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-mono truncate max-w-md">{skill.path}</p>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-xs ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Icons ───────────────────────────────────────────────────────────────────

function BoltIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function BoltIconSmall(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function LinkIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  )
}
