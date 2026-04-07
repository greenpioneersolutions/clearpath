import { useState } from 'react'

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

interface Props {
  skill: StarterSkill
  activeCli: 'copilot' | 'claude'
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

type Step = 'preview' | 'configure' | 'done'

export function StarterSkillWalkthrough({
  skill,
  activeCli,
  isOpen,
  onClose,
  onCreated,
}: Props): JSX.Element | null {
  const [step, setStep] = useState<Step>('preview')
  const [cli, setCli] = useState<'copilot' | 'claude'>(activeCli)
  const [scope, setScope] = useState<'project' | 'global'>('global')
  const [name, setName] = useState(skill.name)
  const [description, setDescription] = useState(skill.description)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      const cwd = (await window.electronAPI.invoke('app:get-cwd')) as string
      await window.electronAPI.invoke('skills:save', {
        name: name.trim(),
        description: description.trim(),
        body: skill.skillPrompt,
        scope,
        cli,
        workingDirectory: cwd,
      })
      setStep('done')
      onCreated()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setStep('preview')
    setName(skill.name)
    setDescription(skill.description)
    setCli(activeCli)
    setScope('global')
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <BoltIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {step === 'done' ? 'Skill Created!' : 'Try This Skill'}
                </h2>
                <p className="text-xs text-gray-400">
                  {step === 'preview' && 'From the Starter Pack'}
                  {step === 'configure' && 'Customize before creating'}
                  {step === 'done' && 'Ready to use'}
                </p>
              </div>
            </div>
            <StepDots current={step} />
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {/* ── Step 1: Preview ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{skill.name}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{skill.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-700 mb-1">Input</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{skill.inputDescription}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-700 mb-1">Output</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{skill.outputDescription}</p>
                </div>
              </div>

              {skill.primaryAgents.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-indigo-800 mb-1">
                    Works with Starter Pack Agents
                  </p>
                  <p className="text-xs text-indigo-600">
                    This skill pairs with {skill.primaryAgents.length} agent{skill.primaryAgents.length !== 1 ? 's' : ''} from the Starter Pack for best results.
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
                  Everything below has sensible defaults. Leave it as-is for a quick setup, or customize to your liking. You can always edit this skill later.
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

              {/* Scope */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Scope</label>
                <div className="flex gap-2">
                  {(['project', 'global'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setScope(s)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        scope === s
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {s === 'project' ? 'This Project Only' : 'Global (All Projects)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Skill Name
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
                  rows={2}
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

          {/* ── Step 3: Done ── */}
          {step === 'done' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{name}</h3>
                <p className="text-sm text-gray-500 mt-1">Your skill is ready to use!</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2">
                <p className="text-xs text-gray-700">
                  <span className="font-medium">CLI:</span>{' '}
                  {cli === 'copilot' ? 'GitHub Copilot' : 'Claude Code'}
                </p>
                <p className="text-xs text-gray-700">
                  <span className="font-medium">Scope:</span>{' '}
                  {scope === 'project' ? 'This Project' : 'Global'}
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-left">
                <p className="text-xs text-amber-700">
                  You can find this skill in the list below, toggle it on/off, or edit its content anytime.
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
                className="px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
              >
                Create This Skill
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
                className="px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors font-medium"
              >
                {saving ? 'Creating...' : 'Create Skill'}
              </button>
            </>
          )}

          {step === 'done' && (
            <>
              <div />
              <button
                onClick={handleClose}
                className="px-5 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
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

function StepDots({ current }: { current: Step }): JSX.Element {
  const steps: Step[] = ['preview', 'configure', 'done']
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 w-6 rounded-full transition-colors ${
            steps.indexOf(current) >= i ? 'bg-amber-500' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

function BoltIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}
