import { useState, useEffect } from 'react'
import type { AgentDef } from '../types/ipc'
import { providerOf } from '../../../shared/backends'

interface StarterAgent {
  id: string
  name: string
  tagline: string
  description: string
  category: 'spotlight' | 'default'
  handles: string[]
  systemPrompt: string
  associatedSkills: string[]
}

interface StarterSkill {
  id: string
  name: string
  description: string
  skillPrompt: string
}

interface Props {
  agent: StarterAgent
  activeCli: 'copilot' | 'claude'
  isOpen: boolean
  onClose: () => void
  onCreated: (agent: AgentDef) => void
  onSkillsCreated?: () => void
}

type Step = 'preview' | 'configure' | 'done' | 'skills' | 'skills-done'

export function StarterAgentWalkthrough({
  agent,
  activeCli,
  isOpen,
  onClose,
  onCreated,
  onSkillsCreated,
}: Props): JSX.Element | null {
  const [step, setStep] = useState<Step>('preview')
  const [cli, setCli] = useState<'copilot' | 'claude'>(activeCli)
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdAgent, setCreatedAgent] = useState<AgentDef | null>(null)

  // Skills state
  const [associatedSkills, setAssociatedSkills] = useState<StarterSkill[]>([])
  const [existingSkillNames, setExistingSkillNames] = useState<Set<string>>(new Set())
  const [creatingSkills, setCreatingSkills] = useState(false)
  const [createdSkillCount, setCreatedSkillCount] = useState(0)

  // Load associated skills when the modal opens
  useEffect(() => {
    if (!isOpen || agent.associatedSkills.length === 0) return
    void (async () => {
      const [allStarters, cwd] = await Promise.all([
        window.electronAPI.invoke('starter-pack:get-skills') as Promise<StarterSkill[]>,
        window.electronAPI.invoke('app:get-cwd') as Promise<string>,
      ])
      const skillMap = new Map(allStarters.map((s) => [s.id, s]))
      const matched = agent.associatedSkills
        .map((id) => skillMap.get(id))
        .filter((s): s is StarterSkill => !!s)
      setAssociatedSkills(matched)

      // Check which skills already exist
      const installed = (await window.electronAPI.invoke('skills:list', {
        workingDirectory: cwd,
      })) as { name: string }[]
      setExistingSkillNames(new Set(installed.map((s) => s.name.toLowerCase())))
    })()
  }, [isOpen, agent.associatedSkills])

  // Skills that haven't been created yet
  const missingSkills = associatedSkills.filter(
    (s) => !existingSkillNames.has(s.name.toLowerCase())
  )

  if (!isOpen) return null

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = (await window.electronAPI.invoke('agent:create', {
        def: {
          cli,
          name: name.trim(),
          description: description.trim(),
          prompt: agent.systemPrompt,
        },
      })) as { agentDef: AgentDef }
      setCreatedAgent(result.agentDef)
      setStep('done')
      onCreated(result.agentDef)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAllSkills = async () => {
    setCreatingSkills(true)
    setError(null)
    let count = 0
    try {
      const cwd = (await window.electronAPI.invoke('app:get-cwd')) as string
      for (const skill of missingSkills) {
        await window.electronAPI.invoke('skills:save', {
          name: skill.name,
          description: skill.description,
          body: skill.skillPrompt,
          scope: 'global',
          cli,
          workingDirectory: cwd,
        })
        count++
        setCreatedSkillCount(count)
      }
      setStep('skills-done')
      onSkillsCreated?.()
    } catch (e) {
      setError(String(e))
    } finally {
      setCreatingSkills(false)
    }
  }

  const handleClose = () => {
    setStep('preview')
    setName(agent.name)
    setDescription(agent.description)
    setCli(activeCli)
    setError(null)
    setCreatedAgent(null)
    setCreatedSkillCount(0)
    onClose()
  }

  const hasSkillsToOffer = missingSkills.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                step === 'skills' || step === 'skills-done' ? 'bg-amber-100' : 'bg-indigo-100'
              }`}>
                {step === 'skills' || step === 'skills-done' ? <BoltIcon /> : <SparkleIcon />}
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {step === 'preview' && 'Try This Agent'}
                  {step === 'configure' && 'Try This Agent'}
                  {step === 'done' && 'Agent Created!'}
                  {step === 'skills' && 'Recommended Skills'}
                  {step === 'skills-done' && 'All Set!'}
                </h2>
                <p className="text-xs text-gray-400">
                  {step === 'preview' && 'From the Starter Pack'}
                  {step === 'configure' && 'Customize before creating'}
                  {step === 'done' && (hasSkillsToOffer ? 'One more thing...' : 'Ready to use')}
                  {step === 'skills' && `${missingSkills.length} skill${missingSkills.length !== 1 ? 's' : ''} to pair with ${agent.name}`}
                  {step === 'skills-done' && 'Agent and skills are ready'}
                </p>
              </div>
            </div>
            <StepDots current={step} hasSkillsStep={hasSkillsToOffer} />
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {/* ── Step 1: Preview ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{agent.name}</h3>
                <p className="text-sm text-indigo-600 mb-3">{agent.tagline}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{agent.description}</p>
              </div>

              {agent.handles.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-2">What this agent can help with:</p>
                  <ul className="space-y-1.5">
                    {agent.handles.slice(0, 5).map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                        <CheckCircle />
                        <span>{h}</span>
                      </li>
                    ))}
                    {agent.handles.length > 5 && (
                      <li className="text-xs text-gray-400 pl-6">
                        +{agent.handles.length - 5} more capabilities
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {hasSkillsToOffer && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-amber-800 mb-1">
                    Comes with {missingSkills.length} recommended skill{missingSkills.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-amber-600">
                    After creating this agent, we'll offer to set up the skills that make it shine.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Configure ── */}
          {step === 'configure' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
                <p className="text-xs text-blue-700">
                  Everything below has sensible defaults. You can leave it as-is and create now, or customize to your liking. You can always edit this agent later.
                </p>
              </div>

              {/* CLI selector */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Target CLI
                </label>
                <div className="flex gap-2">
                  {(['copilot', 'claude'] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCli(c)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        cli === c
                          ? c === 'copilot'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {c === 'copilot' ? 'GitHub Copilot' : 'Claude Code'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Done (Agent created — offer skills) ── */}
          {step === 'done' && createdAgent && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 py-2">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{createdAgent.name}</h3>
                  <p className="text-xs text-gray-500">
                    Agent created for {providerOf(createdAgent.cli) === 'copilot' ? 'GitHub Copilot' : 'Claude Code'}
                  </p>
                </div>
              </div>

              {hasSkillsToOffer ? (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <BoltIcon />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          This agent pairs with {missingSkills.length} skill{missingSkills.length !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          We recommend creating these skills to get the most out of your {agent.name}. We'll set them all up for you in one go.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {missingSkills.map((skill) => (
                        <div
                          key={skill.id}
                          className="flex items-start gap-2.5 bg-white rounded-lg px-3 py-2.5 border border-amber-100"
                        >
                          <div className="w-5 h-5 rounded bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <BoltIconSmall />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800">{skill.name}</p>
                            <p className="text-xs text-gray-500 line-clamp-1">{skill.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
                  <p className="text-xs text-indigo-700">
                    You can find this agent in the list below, edit its prompt and settings anytime, or set it as your active agent for sessions.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Creating skills ── */}
          {step === 'skills' && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 flex items-center justify-center mb-3 animate-pulse">
                  <BoltIcon />
                </div>
                <h3 className="text-sm font-bold text-gray-900">
                  Creating skills...
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {createdSkillCount} of {missingSkills.length} created
                </p>
              </div>

              <div className="space-y-1.5">
                {missingSkills.map((skill, i) => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50"
                  >
                    {i < createdSkillCount ? (
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : i === createdSkillCount ? (
                      <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-200 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${i < createdSkillCount ? 'text-gray-700' : i === createdSkillCount ? 'text-amber-700 font-medium' : 'text-gray-400'}`}>
                      {skill.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 5: Skills done ── */}
          {step === 'skills-done' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">You're all set!</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {createdAgent?.name} and {createdSkillCount} skill{createdSkillCount !== 1 ? 's' : ''} are ready to go.
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3">
                {/* Agent summary */}
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <SparkleIconSmall />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-800">{createdAgent?.name}</p>
                    <p className="text-[10px] text-gray-400">Agent</p>
                  </div>
                </div>

                {/* Skills summary */}
                {missingSkills.map((skill) => (
                  <div key={skill.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <BoltIconSmall />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{skill.name}</p>
                      <p className="text-[10px] text-gray-400">Skill</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-left">
                <p className="text-xs text-indigo-700">
                  You can edit any of these from the Agents and Skills pages. Toggle them on or off, tweak the prompts, or customize the settings to fit your workflow.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          {step === 'preview' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Not Now
              </button>
              <button
                onClick={() => setStep('configure')}
                className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Create This Agent
              </button>
            </>
          )}

          {step === 'configure' && (
            <>
              <button
                onClick={() => setStep('preview')}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => void handleCreate()}
                disabled={saving || !name.trim()}
                className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium"
              >
                {saving ? 'Creating...' : 'Create Agent'}
              </button>
            </>
          )}

          {step === 'done' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {hasSkillsToOffer ? 'Skip Skills' : 'Done'}
              </button>
              {hasSkillsToOffer ? (
                <button
                  onClick={() => {
                    setStep('skills')
                    void handleCreateAllSkills()
                  }}
                  className="px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium flex items-center gap-1.5"
                >
                  <BoltIconSmall />
                  Create {missingSkills.length} Skill{missingSkills.length !== 1 ? 's' : ''}
                </button>
              ) : (
                <button
                  onClick={handleClose}
                  className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Done
                </button>
              )}
            </>
          )}

          {step === 'skills' && (
            <>
              <div />
              <div className="text-xs text-gray-400">
                {creatingSkills ? 'Please wait...' : 'Done!'}
              </div>
            </>
          )}

          {step === 'skills-done' && (
            <>
              <div />
              <button
                onClick={handleClose}
                className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function StepDots({ current, hasSkillsStep }: { current: Step; hasSkillsStep: boolean }): JSX.Element {
  const steps: Step[] = hasSkillsStep
    ? ['preview', 'configure', 'done', 'skills-done']
    : ['preview', 'configure', 'done']

  // Map 'skills' to same index as 'skills-done' (it's a transitional state)
  const currentIdx = current === 'skills' ? steps.indexOf('skills-done') - 0.5 : steps.indexOf(current)

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-6 rounded-full transition-colors ${
            currentIdx >= i ? 'bg-indigo-500' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

function SparkleIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  )
}

function SparkleIconSmall(): JSX.Element {
  return (
    <svg className="w-3 h-3 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  )
}

function BoltIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function BoltIconSmall(): JSX.Element {
  return (
    <svg className="w-3 h-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function CheckCircle(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
