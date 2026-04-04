import { useState, useEffect } from 'react'
import type { AgentDef } from '../types/ipc'

interface Props {
  isOpen: boolean
  onClose: () => void
  onCreated: (agent: AgentDef) => void
  workingDir?: string
  defaultCli?: 'copilot' | 'claude'
}

const COPILOT_TOOLS = [
  'shell', 'read_file', 'write_file', 'create_file',
  'delete_file', 'search_files', 'browser', 'fetch_url',
]
const CLAUDE_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'WebSearch', 'WebFetch', 'Agent', 'TodoWrite',
]
const COPILOT_MODELS = [
  'claude-sonnet-4.5',
  'claude-sonnet-4',
  'claude-opus-4-6',
  'gpt-5',
  'gpt-5.3-codex',
  'gemini-3-pro',
  'gpt-5.4-mini',
]
const CLAUDE_MODELS = [
  'sonnet',
  'opus',
  'haiku',
]

type Step = 'basic' | 'model-tools' | 'prompt'

interface FormState {
  cli: 'copilot' | 'claude'
  name: string
  description: string
  model: string
  tools: string[]
  prompt: string
}

const INITIAL_FORM: FormState = {
  cli: 'copilot',
  name: '',
  description: '',
  model: '',
  tools: [],
  prompt: '',
}

export function AgentWizard({ isOpen, onClose, onCreated, workingDir, defaultCli }: Props): JSX.Element | null {
  const [step, setStep] = useState<Step>('basic')
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM, cli: defaultCli ?? 'copilot' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync form CLI when wizard opens with a different defaultCli
  useEffect(() => {
    if (isOpen && defaultCli) {
      setForm((f) => f.cli !== defaultCli ? { ...INITIAL_FORM, cli: defaultCli } : f)
      setStep('basic')
    }
  }, [isOpen, defaultCli])

  if (!isOpen) return null

  const toolOptions = form.cli === 'copilot' ? COPILOT_TOOLS : CLAUDE_TOOLS
  const modelOptions = form.cli === 'copilot' ? COPILOT_MODELS : CLAUDE_MODELS

  const toggleTool = (tool: string) =>
    setForm((f) => ({
      ...f,
      tools: f.tools.includes(tool) ? f.tools.filter((t) => t !== tool) : [...f.tools, tool],
    }))

  const handleCreate = () => {
    setSaving(true)
    setError(null)
    const def: Omit<AgentDef, 'id' | 'source' | 'filePath'> = {
      cli: form.cli,
      name: form.name.trim(),
      description: form.description.trim(),
      model: form.model.trim() || undefined,
      tools: form.tools.length > 0 ? form.tools : undefined,
      prompt: form.prompt.trim() || undefined,
    }
    void (
      window.electronAPI.invoke('agent:create', { def, workingDir }) as Promise<{
        agentDef: AgentDef
      }>
    )
      .then(({ agentDef }) => {
        setSaving(false)
        setForm(INITIAL_FORM)
        setStep('basic')
        onCreated(agentDef)
      })
      .catch((e: unknown) => {
        setError(String(e))
        setSaving(false)
      })
  }

  const canAdvanceBasic = form.name.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Create Agent</h2>
            <StepIndicator step={step} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {step === 'basic' && 'Name, description, and target CLI'}
            {step === 'model-tools' && 'Optional model override and allowed tools'}
            {step === 'prompt' && 'System prompt that defines the agent behaviour'}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {step === 'basic' && (
            <>
              {/* CLI selector */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Target CLI</label>
                <div className="flex gap-2">
                  {(['copilot', 'claude'] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm((f) => ({ ...f, cli: c, tools: [], model: '' }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        form.cli === c
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

              <Field
                label="Name"
                required
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. Frontend Reviewer"
              />
              <Field
                label="Description"
                value={form.description}
                onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Briefly describe what this agent does"
              />
            </>
          )}

          {step === 'model-tools' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Model <span className="text-gray-400">(optional — leave blank for default)</span>
                </label>
                <input
                  type="text"
                  list="model-datalist"
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder={form.cli === 'copilot' ? 'claude-sonnet-4.5' : 'claude-sonnet-4-6'}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <datalist id="model-datalist">
                  {modelOptions.map((m) => <option key={m} value={m} />)}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Allowed Tools <span className="text-gray-400">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {toolOptions.map((tool) => (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        form.tools.includes(tool)
                          ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 'prompt' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                System Prompt <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={form.prompt}
                onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                rows={10}
                placeholder="You are an expert agent that..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 font-mono resize-none leading-relaxed"
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={() => {
              if (step === 'basic') { onClose(); setForm(INITIAL_FORM) }
              else if (step === 'model-tools') setStep('basic')
              else setStep('model-tools')
            }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {step === 'basic' ? 'Cancel' : 'Back'}
          </button>

          {step !== 'prompt' ? (
            <button
              onClick={() => setStep(step === 'basic' ? 'model-tools' : 'prompt')}
              disabled={step === 'basic' && !canAdvanceBasic}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}): JSX.Element {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
      />
    </div>
  )
}

function StepIndicator({ step }: { step: Step }): JSX.Element {
  const steps: Step[] = ['basic', 'model-tools', 'prompt']
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 w-6 rounded-full transition-colors ${
            steps.indexOf(step) >= i ? 'bg-indigo-500' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}
