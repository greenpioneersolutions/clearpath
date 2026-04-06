import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface WizardField {
  id: string; label: string; placeholder: string; type: 'text' | 'textarea'; required: boolean; helpText?: string
}

interface WizardOption {
  id: string; label: string; description: string; icon: string; fields: WizardField[]; promptTemplate: string
}

interface WizardConfig {
  title: string; subtitle: string; initialQuestion: string; options: WizardOption[]
}

interface NoteItem {
  id: string; title: string; content: string; tags: string[]; category: string
  attachments?: Array<{ id: string; name: string }>
  pinned: boolean; updatedAt: number
}

interface AgentItem {
  id: string; name: string; description: string; cli: string; source: string
}

interface AgentListResult {
  copilot: AgentItem[]; claude: AgentItem[]
}

interface SkillItem {
  id: string; name: string; description: string; scope: string; cli: string; enabled: boolean; path: string
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onLaunchSession: (opts: { cli: 'copilot' | 'claude'; name: string; initialPrompt: string; agent?: string }) => void
  defaultCli: 'copilot' | 'claude'
  /** Pre-select a wizard option by id (e.g. 'question', 'task') and skip to 'fill' step */
  initialOptionId?: string
  /** Jump directly to a step (e.g. 'context') */
  initialStep?: Step
}

type Step = 'choose' | 'fill' | 'context' | 'review'

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const CAT_COLORS: Record<string, string> = {
  meeting: 'bg-blue-900/30 text-blue-400', conversation: 'bg-green-900/30 text-green-400',
  reference: 'bg-purple-900/30 text-purple-400', outcome: 'bg-amber-900/30 text-amber-400',
  idea: 'bg-pink-900/30 text-pink-400', custom: 'bg-gray-800 text-gray-400',
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SessionWizard({ onLaunchSession, defaultCli, initialOptionId, initialStep }: Props): JSX.Element {
  const [config, setConfig] = useState<WizardConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('choose')
  const [selectedOption, setSelectedOption] = useState<WizardOption | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [cli, setCli] = useState<'copilot' | 'claude'>(defaultCli)
  const [sessionName, setSessionName] = useState('')
  const [builtPrompt, setBuiltPrompt] = useState('')

  // Context selections
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [contextPrompt, setContextPrompt] = useState('')

  // Context data
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [contextSearch, setContextSearch] = useState('')
  const [contextTab, setContextTab] = useState<'memories' | 'agents' | 'skills'>('memories')
  const [showFullPrompt, setShowFullPrompt] = useState(false)
  const [contextPage, setContextPage] = useState(0)
  const CONTEXT_PAGE_SIZE = 10

  // Context visibility settings
  const [ctxSettings, setCtxSettings] = useState({ showUseContext: true, showMemories: true, showAgents: true, showSkills: true })

  // ── Load config ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const [cfg, ctxCfg] = await Promise.all([
      window.electronAPI.invoke('wizard:get-config') as Promise<WizardConfig>,
      window.electronAPI.invoke('wizard:get-context-settings') as Promise<typeof ctxSettings>,
    ])
    setConfig(cfg)
    if (ctxCfg) setCtxSettings(ctxCfg)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // ── Auto-select option or step from props (deep-link from Home) ────────
  useEffect(() => {
    if (!config || loading) return
    if (initialStep === 'context') {
      setStep('context')
      void loadContext()
      return
    }
    if (initialOptionId) {
      const option = config.options.find((o) => o.id === initialOptionId)
      if (option) {
        setSelectedOption(option)
        setValues({})
        setStep('fill')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, loading])

  // ── Load context data when entering context step ─────────────────────────

  const loadContext = useCallback(async () => {
    // Get working directory for agent/skill scans
    let workingDir = '.'
    try {
      workingDir = await window.electronAPI.invoke('app:get-cwd') as string
    } catch { /* use default */ }

    const [noteResult, agentResult, skillResult] = await Promise.all([
      window.electronAPI.invoke('notes:list') as Promise<NoteItem[]>,
      window.electronAPI.invoke('agent:list', { workingDir }) as Promise<AgentListResult>,
      window.electronAPI.invoke('skills:list', { workingDirectory: workingDir }) as Promise<SkillItem[]>,
    ])
    setNotes(noteResult ?? [])
    // Flatten copilot + claude agents into one list
    const allAgents = [...(agentResult?.copilot ?? []), ...(agentResult?.claude ?? [])]
    setAgents(allAgents)
    setSkills(skillResult ?? [])
  }, [])

  // ── Step handlers ────────────────────────────────────────────────────────

  const handleChoose = (option: WizardOption) => {
    setSelectedOption(option)
    setValues({})
    setStep('fill')
  }

  const handleChooseContext = () => {
    setStep('context')
    void loadContext()
  }

  const handleFillComplete = async () => {
    if (!selectedOption) return
    const result = await window.electronAPI.invoke('wizard:build-prompt', {
      optionId: selectedOption.id,
      values,
    }) as { success: boolean; prompt?: string }

    if (result.success && result.prompt) {
      setBuiltPrompt(result.prompt)
      setStep('review')
    }
  }

  const handleContextComplete = async () => {
    // Build prompt from context selections — only include actual content that matters
    const parts: string[] = []

    // Add memory content
    if (selectedNoteIds.size > 0) {
      for (const noteId of selectedNoteIds) {
        const result = await window.electronAPI.invoke('notes:get-full-content', { id: noteId }) as { content?: string }
        const note = notes.find((n) => n.id === noteId)
        if (result.content) {
          parts.push(`--- Memory: ${note?.title ?? 'Untitled'} ---\n${result.content}`)
        }
      }
    }

    // Agent is passed via --agent flag, NOT embedded in prompt text
    // (handled in handleLaunch)

    // Read and inject actual skill content so the CLI receives the instructions
    if (selectedSkill) {
      const skill = skills.find((s) => s.id === selectedSkill)
      if (skill) {
        try {
          const result = await window.electronAPI.invoke('skills:get', { path: skill.path }) as { body?: string; content?: string }
          const skillBody = result.body || result.content || ''
          if (skillBody.trim()) {
            parts.push(`--- Skill: ${skill.name} ---\n${skillBody}`)
          }
        } catch {
          // Skill file unreadable — include name reference as fallback
          parts.push(`[Using skill: ${skill.name} — ${skill.description}]`)
        }
      }
    }

    let prompt = ''
    if (parts.length > 0) {
      prompt += `[Reference context]\n\n${parts.join('\n\n')}\n\n---\n\n`
    }
    prompt += contextPrompt || 'Please review the context provided above and help me work through it.'

    setBuiltPrompt(prompt)
    setSelectedOption({ id: 'context', label: 'Use Context', description: '', icon: '📚', fields: [], promptTemplate: '' })
    setStep('review')
  }

  const handleLaunch = async () => {
    if (!builtPrompt) return
    await window.electronAPI.invoke('wizard:mark-completed')
    const name = sessionName.trim() || `${selectedOption?.label ?? 'Context'} Session`
    // Pass the selected agent name so it gets forwarded as --agent flag
    const agentName = selectedAgent
      ? agents.find((a) => a.id === selectedAgent)?.name ?? undefined
      : undefined
    onLaunchSession({ cli, name, initialPrompt: builtPrompt, agent: agentName })
  }

  const handleReset = () => {
    setStep('choose')
    setSelectedOption(null)
    setValues({})
    setBuiltPrompt('')
    setSessionName('')
    setSelectedNoteIds(new Set())
    setSelectedAgent(null)
    setSelectedSkill(null)
    setContextPrompt('')
    setContextSearch('')
    setShowFullPrompt(false)
  }

  const toggleNoteId = (id: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading || !config) {
    return <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading wizard...</div>
  }

  // ── Step 1: Choose ─────────────────────────────────────────────────────────

  if (step === 'choose') {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold text-white">{config.title}</h1>
            <p className="text-sm text-gray-400 max-w-md mx-auto">{config.subtitle}</p>
          </div>

          <div className="text-center">
            <h2 className="text-sm font-medium text-gray-300">{config.initialQuestion}</h2>
          </div>

          {/* Dynamic options from config */}
          <div className="space-y-3">
            {config.options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleChoose(option)}
                className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-indigo-500/50 hover:bg-gray-900/80 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl flex-shrink-0 mt-0.5">{option.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">{option.label}</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{option.description}</p>
                  </div>
                  <svg className="w-5 h-5 text-gray-700 group-hover:text-indigo-400 flex-shrink-0 mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}

            {/* "Use Context" option — shown based on wizard context settings */}
            {ctxSettings.showUseContext && <div className="border-t border-gray-800 pt-3 mt-3">
              <button
                onClick={handleChooseContext}
                className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-purple-500/50 hover:bg-gray-900/80 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl flex-shrink-0 mt-0.5">📚</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">Use Context</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      Start from your saved memories, pick an agent or skill, and ask questions or work on tasks with that context loaded.
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-700 group-hover:text-purple-400 flex-shrink-0 mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>}
          </div>
        </div>
      </div>
    )
  }

  // ── Step: Context picker ───────────────────────────────────────────────────

  if (step === 'context') {
    const filteredNotes = contextSearch
      ? notes.filter((n) => n.title.toLowerCase().includes(contextSearch.toLowerCase()) || n.tags.some((t) => t.toLowerCase().includes(contextSearch.toLowerCase())))
      : notes
    const filteredAgents = contextSearch
      ? agents.filter((a) => a.name.toLowerCase().includes(contextSearch.toLowerCase()) || a.description.toLowerCase().includes(contextSearch.toLowerCase()))
      : agents
    const filteredSkills = contextSearch
      ? skills.filter((s) => s.name.toLowerCase().includes(contextSearch.toLowerCase()) || s.description.toLowerCase().includes(contextSearch.toLowerCase()))
      : skills

    const totalSelected = selectedNoteIds.size + (selectedAgent ? 1 : 0) + (selectedSkill ? 1 : 0)

    // Pagination for current tab
    const currentList = contextTab === 'memories' ? filteredNotes : contextTab === 'agents' ? filteredAgents : filteredSkills
    const totalPages = Math.ceil(currentList.length / CONTEXT_PAGE_SIZE)
    const safePage = Math.min(contextPage, Math.max(0, totalPages - 1))
    const pageStart = safePage * CONTEXT_PAGE_SIZE
    const pageEnd = pageStart + CONTEXT_PAGE_SIZE

    const paginatedNotes = filteredNotes.slice(pageStart, pageEnd)
    const paginatedAgents = filteredAgents.slice(pageStart, pageEnd)
    const paginatedSkills = filteredSkills.slice(pageStart, pageEnd)

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button onClick={handleReset} className="text-gray-500 hover:text-gray-300 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span>📚</span> Use Context
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Select memories, an agent, or a skill to use in your session. Everything is optional.</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={contextSearch} onChange={(e) => { setContextSearch(e.target.value); setContextPage(0) }}
              placeholder="Search memories, agents, skills..."
              className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Tabs — only show enabled context types */}
          <div className="flex rounded-lg bg-gray-800 p-0.5">
            {([
              ['memories', `Memories${selectedNoteIds.size > 0 ? ` (${selectedNoteIds.size})` : ''}`, ctxSettings.showMemories],
              ['agents', `Agents${selectedAgent ? ' (1)' : ''}`, ctxSettings.showAgents],
              ['skills', `Skills${selectedSkill ? ' (1)' : ''}`, ctxSettings.showSkills],
            ] as const).filter(([, , visible]) => visible).map(([key, label]) => (
              <button key={key}
                onClick={() => { setContextTab(key as typeof contextTab); setContextPage(0) }}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  contextTab === key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Memories tab */}
          {contextTab === 'memories' && (
            <div className="space-y-2">
              {filteredNotes.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">
                  {notes.length === 0 ? 'No memories yet. Create notes in the Memory tab.' : 'No matches found.'}
                </p>
              ) : paginatedNotes.map((note) => {
                const isSelected = selectedNoteIds.has(note.id)
                return (
                  <button key={note.id} onClick={() => toggleNoteId(note.id)}
                    className={`w-full text-left rounded-xl p-4 transition-all ${
                      isSelected ? 'bg-indigo-900/30 border border-indigo-600/50' : 'bg-gray-900 border border-gray-800 hover:border-gray-700'
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'
                      }`}>
                        {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {note.pinned && <span className="text-[10px]">📌</span>}
                          <span className="text-sm font-medium text-gray-200 truncate">{note.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${CAT_COLORS[note.category] ?? CAT_COLORS.custom}`}>{note.category}</span>
                          {note.tags.slice(0, 2).map((t) => <span key={t} className="text-[9px] text-gray-600">#{t}</span>)}
                          {(note.attachments?.length ?? 0) > 0 && (
                            <span className="text-[9px] text-gray-600 flex items-center gap-0.5">
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              {note.attachments!.length} file{note.attachments!.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          <span className="text-[9px] text-gray-600">{timeAgo(note.updatedAt)}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1 truncate">{note.content.slice(0, 100)}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Agents tab */}
          {contextTab === 'agents' && (
            <div className="space-y-2">
              {filteredAgents.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">
                  {agents.length === 0 ? 'No agents available. Create agents in the Agents panel.' : 'No matches found.'}
                </p>
              ) : paginatedAgents.map((agent) => {
                const isSelected = selectedAgent === agent.id
                return (
                  <button key={agent.id}
                    onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                    className={`w-full text-left rounded-xl p-4 transition-all ${
                      isSelected ? 'bg-green-900/20 border border-green-600/50' : 'bg-gray-900 border border-gray-800 hover:border-gray-700'
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected ? 'bg-green-600 border-green-600' : 'border-gray-600'
                      }`}>
                        {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-200">{agent.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">{agent.cli}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">{agent.description || 'No description'}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Skills tab */}
          {contextTab === 'skills' && (
            <div className="space-y-2">
              {filteredSkills.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">
                  {skills.length === 0 ? 'No skills available. Create skills in the Skills panel.' : 'No matches found.'}
                </p>
              ) : paginatedSkills.map((skill) => {
                const isSelected = selectedSkill === skill.id
                return (
                  <button key={skill.id}
                    onClick={() => setSelectedSkill(isSelected ? null : skill.id)}
                    className={`w-full text-left rounded-xl p-4 transition-all ${
                      isSelected ? 'bg-amber-900/20 border border-amber-600/50' : 'bg-gray-900 border border-gray-800 hover:border-gray-700'
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected ? 'bg-amber-600 border-amber-600' : 'border-gray-600'
                      }`}>
                        {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-200">{skill.name}</span>
                        <p className="text-[10px] text-gray-500 mt-0.5">{skill.description || 'No description'}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {currentList.length > CONTEXT_PAGE_SIZE && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-gray-500">
                {pageStart + 1}–{Math.min(pageEnd, currentList.length)} of {currentList.length}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setContextPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}
                  className="px-2 py-0.5 text-[10px] text-gray-400 border border-gray-700 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors">Prev</button>
                <button onClick={() => setContextPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}
                  className="px-2 py-0.5 text-[10px] text-gray-400 border border-gray-700 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors">Next</button>
              </div>
            </div>
          )}

          {/* Selection summary */}
          {totalSelected > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap text-xs">
                <span className="text-gray-400 font-medium">Selected:</span>
                {selectedNoteIds.size > 0 && (
                  <span className="px-2 py-0.5 rounded bg-indigo-900/30 text-indigo-400">
                    {selectedNoteIds.size} memor{selectedNoteIds.size === 1 ? 'y' : 'ies'}
                  </span>
                )}
                {selectedAgent && (
                  <span className="px-2 py-0.5 rounded bg-green-900/30 text-green-400">
                    Agent: {agents.find((a) => a.id === selectedAgent)?.name ?? selectedAgent}
                  </span>
                )}
                {selectedSkill && (
                  <span className="px-2 py-0.5 rounded bg-amber-900/30 text-amber-400">
                    Skill: {skills.find((s) => s.id === selectedSkill)?.name}
                  </span>
                )}
                <button onClick={() => { setSelectedNoteIds(new Set()); setSelectedAgent(null); setSelectedSkill(null) }}
                  className="text-gray-600 hover:text-gray-400 ml-auto transition-colors">Clear all</button>
              </div>
            </div>
          )}

          {/* Prompt input */}
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1.5">
              What would you like to do with this context? <span className="text-gray-600 font-normal">(optional)</span>
            </label>
            <textarea
              value={contextPrompt}
              onChange={(e) => setContextPrompt(e.target.value)}
              placeholder="e.g., Summarize the key points from these meeting notes, or Help me write a follow-up email based on this conversation..."
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </div>

          {/* Session options */}
          <div className="border-t border-gray-800 pt-5">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-400 mb-1">Session Name (optional)</label>
                <input type="text" value={sessionName} onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Context Session"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">AI Engine</label>
                <div className="flex rounded-lg bg-gray-800 p-0.5">
                  <button onClick={() => setCli('copilot')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${cli === 'copilot' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Copilot</button>
                  <button onClick={() => setCli('claude')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${cli === 'claude' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Claude</button>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button onClick={handleReset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Start Over</button>
            <button
              onClick={() => void handleContextComplete()}
              disabled={totalSelected === 0 && !contextPrompt.trim()}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Review Prompt
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: Fill in fields (dynamic options) ───────────────────────────────

  if (step === 'fill' && selectedOption) {
    const requiredFields = selectedOption.fields.filter((f) => f.required)
    const allRequiredFilled = requiredFields.every((f) => values[f.id]?.trim())

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={handleReset} className="text-gray-500 hover:text-gray-300 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span>{selectedOption.icon}</span> {selectedOption.label}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">{selectedOption.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div className="flex-1 h-0.5 bg-green-500" />
            <div className="w-3 h-3 rounded-full bg-indigo-500 ring-2 ring-indigo-500/30" />
            <div className="flex-1 h-0.5 bg-gray-700" />
            <div className="w-3 h-3 rounded-full bg-gray-700" />
          </div>

          <div className="space-y-5">
            {selectedOption.fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-200">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-1">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea value={values[field.id] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.placeholder} rows={3}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y" />
                ) : (
                  <input type="text" value={values[field.id] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                )}
                {field.helpText && <p className="text-xs text-gray-600">{field.helpText}</p>}
              </div>
            ))}
          </div>

          <div className="border-t border-gray-800 pt-5">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-400 mb-1">Session Name (optional)</label>
                <input type="text" value={sessionName} onChange={(e) => setSessionName(e.target.value)}
                  placeholder={`${selectedOption.label} Session`}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">AI Engine</label>
                <div className="flex rounded-lg bg-gray-800 p-0.5">
                  <button onClick={() => setCli('copilot')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${cli === 'copilot' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Copilot</button>
                  <button onClick={() => setCli('claude')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${cli === 'claude' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Claude</button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button onClick={handleReset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Start Over</button>
            <button onClick={() => void handleFillComplete()} disabled={!allRequiredFilled}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Review Prompt
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 3: Review and launch ──────────────────────────────────────────────

  if (step === 'review') {
    const isContextMode = selectedOption?.id === 'context'
    const selectedAgentObj = selectedAgent ? agents.find((a) => a.id === selectedAgent) : null
    const selectedSkillObj = selectedSkill ? skills.find((s) => s.id === selectedSkill) : null
    const selectedMemoryNames = [...selectedNoteIds].map((id) => notes.find((n) => n.id === id)?.title).filter(Boolean)
    const hasContextAttachments = isContextMode && (selectedAgentObj || selectedSkillObj || selectedMemoryNames.length > 0)

    // For context mode: show only the user's message, not the full injected prompt
    const displayPrompt = isContextMode ? (contextPrompt || 'Please review the context provided above and help me work through it.') : builtPrompt
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep(isContextMode ? 'context' : 'fill')} className="text-gray-500 hover:text-gray-300 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-base font-semibold text-white">Review Your Prompt</h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div className="flex-1 h-0.5 bg-green-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div className="flex-1 h-0.5 bg-green-500" />
            <div className="w-3 h-3 rounded-full bg-indigo-500 ring-2 ring-indigo-500/30" />
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className={`px-2 py-1 rounded ${cli === 'copilot' ? 'bg-green-900/30 text-green-400' : 'bg-orange-900/30 text-orange-400'}`}>
              {cli === 'copilot' ? 'Copilot' : 'Claude'}
            </span>
            <span>{sessionName || `${selectedOption?.label ?? 'Context'} Session`}</span>
          </div>

          {/* Context attachments summary — compact badges */}
          {hasContextAttachments && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Included context</span>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedMemoryNames.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-900/30 text-indigo-400 text-xs">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    {selectedMemoryNames.length} {selectedMemoryNames.length === 1 ? 'memory' : 'memories'}
                    <span className="text-indigo-600 text-[10px]">({selectedMemoryNames.join(', ')})</span>
                  </span>
                )}
                {selectedAgentObj && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-900/30 text-green-400 text-xs">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Agent: {selectedAgentObj.name}
                  </span>
                )}
                {selectedSkillObj && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-900/30 text-amber-400 text-xs">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Skill: {selectedSkillObj.name}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* User's message */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Your Message</span>
              <span className="text-[10px] text-gray-600">{displayPrompt.length} characters</span>
            </div>
            <div className="p-4">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{displayPrompt}</pre>
            </div>
          </div>

          {/* Expandable full prompt (for power users) */}
          {isContextMode && builtPrompt !== displayPrompt && (
            <div>
              <button
                onClick={() => setShowFullPrompt(!showFullPrompt)}
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
              >
                <svg className={`w-3 h-3 transition-transform ${showFullPrompt ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showFullPrompt ? 'Hide' : 'Show'} full prompt ({builtPrompt.length} characters)
              </button>
              {showFullPrompt && (
                <div className="mt-2 bg-gray-900/50 border border-gray-800/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <pre className="text-[11px] text-gray-500 whitespace-pre-wrap font-sans leading-relaxed">{builtPrompt}</pre>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(isContextMode ? 'context' : 'fill')}
              className="px-4 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors">
              Edit
            </button>
            <div className="flex items-center gap-3">
              <button onClick={handleReset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Start Over</button>
              <button onClick={() => void handleLaunch()}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20">
                Launch Session
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <div />
}
