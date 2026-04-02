import { useState, useEffect } from 'react'

interface StarterTemplate {
  id: string; name: string; description: string; content: string
}

interface Props {
  onSaved: () => void
  onCancel: () => void
  initialContent?: string
}

export default function SkillWizard({ onSaved, onCancel, initialContent }: Props): JSX.Element {
  const [step, setStep] = useState(1)
  const [starters, setStarters] = useState<StarterTemplate[]>([])

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<'project' | 'global'>('project')
  const [cli, setCli] = useState<'claude' | 'copilot' | 'both'>('claude')
  const [body, setBody] = useState(initialContent ?? '')
  const [autoInvoke, setAutoInvoke] = useState(false)
  const [triggerType, setTriggerType] = useState('globs')
  const [triggerValue, setTriggerValue] = useState('')
  const [tools, setTools] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (window.electronAPI.invoke('skills:get-starters') as Promise<StarterTemplate[]>).then(setStarters)
  }, [])

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) { setError('Name and content are required'); return }
    setSaving(true)
    const cwd = await window.electronAPI.invoke('app:get-cwd') as string
    await window.electronAPI.invoke('skills:save', {
      name: name.trim(), description: description.trim(), body: body.trim(),
      scope, cli, workingDirectory: cwd,
      autoInvoke, globs: autoInvoke && triggerType === 'globs' ? triggerValue : undefined,
      tools: tools.trim() ? tools.split(',').map((t) => t.trim()) : undefined,
      model: model || undefined,
    })
    setSaving(false)
    onSaved()
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Create Skill</h3>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${
              s === step ? 'bg-indigo-600 text-white' : s < step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>{s}</div>
          ))}
        </div>
      </div>

      {/* Step 1: Basics */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skill Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code Review Checklist"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {name && <p className="text-xs text-gray-400 mt-1 font-mono">Directory: {slug}/SKILL.md</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2} placeholder="1-3 sentences explaining what this skill does"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value as 'project' | 'global')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="project">This Project Only</option>
                <option value="global">Global — All Projects</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CLI Target</label>
              <select value={cli} onChange={(e) => setCli(e.target.value as 'claude' | 'copilot' | 'both')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="claude">Claude Code</option>
                <option value="copilot">GitHub Copilot</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>
          <button onClick={() => setStep(2)} disabled={!name.trim()}
            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40">
            Next: Content
          </button>
        </div>
      )}

      {/* Step 2: Content */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
            Skills are instructions injected into the AI's context. Write clear directives — what to check, how to format output, what rules to follow.
          </div>

          {/* Starter templates */}
          {!body && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Start from a template:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {starters.map((t) => (
                  <button key={t.id} onClick={() => { setBody(t.content); if (!name) setName(t.name); if (!description) setDescription(t.description) }}
                    className="text-left px-3 py-2 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 text-xs transition-colors">
                    <span className="font-medium text-gray-800">{t.name}</span>
                    <p className="text-gray-500 mt-0.5 truncate">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skill Content</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)}
              rows={12} placeholder="Write your skill instructions in markdown..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Back</button>
            <button onClick={() => setStep(3)} disabled={!body.trim()}
              className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40">
              Next: Options
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Auto-Invocation + Advanced */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-800">Auto-invoke this skill</span>
                <p className="text-xs text-gray-500 mt-0.5">Automatically include when trigger conditions are met</p>
              </div>
              <button onClick={() => setAutoInvoke(!autoInvoke)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoInvoke ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoInvoke ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {autoInvoke && (
              <div className="space-y-2">
                <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="globs">When file pattern matches</option>
                  <option value="always">Always</option>
                </select>
                {triggerType === 'globs' && (
                  <input type="text" value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)}
                    placeholder="e.g. *.test.ts, *.spec.js"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tools needed (comma-separated)</label>
              <input type="text" value={tools} onChange={(e) => setTools(e.target.value)}
                placeholder="e.g. Read, Bash, Grep"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Model preference</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Default</option>
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
                <option value="haiku">Haiku</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Back</button>
            <button onClick={() => setStep(4)}
              className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500">
              Next: Review
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Save */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">{name}</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{scope}</span>
              <span className="text-[10px] text-gray-400">{cli}</span>
              {autoInvoke && <span className="text-yellow-500 text-xs">&#9889; Auto-invoke</span>}
            </div>
            <p className="text-xs text-gray-500">{description}</p>
            <p className="text-xs text-gray-400 font-mono">{slug}/SKILL.md</p>
          </div>

          <div className="bg-gray-900 rounded-lg px-4 py-3 max-h-48 overflow-y-auto">
            <pre className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{body}</pre>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Back</button>
            <button onClick={() => void handleSave()} disabled={saving}
              className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500 disabled:opacity-40">
              {saving ? 'Saving...' : 'Save Skill'}
            </button>
          </div>
        </div>
      )}

      <button onClick={onCancel} className="w-full text-xs text-gray-400 hover:text-gray-600 text-center">Cancel</button>
    </div>
  )
}
