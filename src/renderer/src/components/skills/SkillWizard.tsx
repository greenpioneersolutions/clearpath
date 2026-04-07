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
  const [scope, setScope] = useState<'project' | 'global'>('global')
  const [cli, setCli] = useState<'claude' | 'copilot' | 'both'>('claude')
  const [body, setBody] = useState(initialContent ?? '')
  const [autoInvoke, setAutoInvoke] = useState(false)
  const [triggerType, setTriggerType] = useState('globs')
  const [triggerValue, setTriggerValue] = useState('')
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [requiresGitHub, setRequiresGitHub] = useState(false)
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
      tools: selectedTools.length > 0 ? selectedTools : undefined,
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
                <option value="global">Global — All Projects</option>
                <option value="project">This Project Only</option>
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

      {/* Step 3: Options — Auto-invoke, Tools, Model, Integrations */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Auto-invoke */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-800">Auto-invoke this skill</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  When turned <strong>on</strong>, the AI will automatically use this skill's instructions
                  whenever you work with matching files — no need to manually select it each time.
                  When <strong>off</strong>, you choose when to use the skill from the Skills panel or Session Wizard.
                </p>
              </div>
              <button onClick={() => setAutoInvoke(!autoInvoke)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ml-3 ${autoInvoke ? 'bg-indigo-600' : 'bg-gray-300'}`}
                role="switch"
                aria-checked={autoInvoke}
                aria-label="Toggle auto-invoke">
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoInvoke ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {autoInvoke && (
              <div className="space-y-2 pl-0 border-t border-gray-100 pt-3">
                <label className="block text-xs font-medium text-gray-600">When should this skill activate?</label>
                <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="globs">When I touch files that match a pattern</option>
                  <option value="always">Every time I start a session</option>
                </select>
                {triggerType === 'globs' && (
                  <div>
                    <input type="text" value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)}
                      placeholder="e.g. *.test.ts, *.spec.js"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <p className="text-[10px] text-gray-400 mt-1">
                      File patterns (globs) that trigger this skill. For example, <code className="bg-gray-100 px-1 rounded">*.test.ts</code> activates
                      when working with test files. Separate multiple patterns with commas.
                    </p>
                  </div>
                )}
                {triggerType === 'always' && (
                  <p className="text-[10px] text-gray-400">
                    This skill will be included in every session automatically. Best for general guidelines like coding standards.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Tools — clickable chips instead of free text */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Tools this skill needs
              <span className="text-gray-400 font-normal ml-1">(optional — select which capabilities the AI should use)</span>
            </label>
            <p className="text-[10px] text-gray-400 mb-2">
              Tools are actions the AI can take. Select the ones relevant to what this skill does.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(cli === 'copilot'
                ? [
                    { id: 'shell', label: 'Run Commands', desc: 'Execute shell/terminal commands' },
                    { id: 'read_file', label: 'Read Files', desc: 'Read file contents' },
                    { id: 'write_file', label: 'Write Files', desc: 'Modify existing files' },
                    { id: 'create_file', label: 'Create Files', desc: 'Create new files' },
                    { id: 'delete_file', label: 'Delete Files', desc: 'Remove files' },
                    { id: 'search_files', label: 'Search Code', desc: 'Search across the codebase' },
                    { id: 'browser', label: 'Browse Web', desc: 'Open and interact with websites' },
                    { id: 'fetch_url', label: 'Fetch URLs', desc: 'Download web content' },
                  ]
                : cli === 'claude'
                ? [
                    { id: 'Read', label: 'Read Files', desc: 'Read file contents' },
                    { id: 'Write', label: 'Write Files', desc: 'Create new files' },
                    { id: 'Edit', label: 'Edit Files', desc: 'Modify existing files' },
                    { id: 'Bash', label: 'Run Commands', desc: 'Execute shell commands' },
                    { id: 'Glob', label: 'Find Files', desc: 'Search for files by pattern' },
                    { id: 'Grep', label: 'Search Code', desc: 'Search file contents' },
                    { id: 'WebSearch', label: 'Web Search', desc: 'Search the internet' },
                    { id: 'WebFetch', label: 'Fetch URLs', desc: 'Download web content' },
                    { id: 'Agent', label: 'Sub-Agents', desc: 'Spawn helper agents' },
                    { id: 'TodoWrite', label: 'Task Tracking', desc: 'Create task checklists' },
                  ]
                : [
                    { id: 'Read', label: 'Read Files', desc: '' },
                    { id: 'Write', label: 'Write Files', desc: '' },
                    { id: 'Edit', label: 'Edit Files', desc: '' },
                    { id: 'Bash', label: 'Run Commands', desc: '' },
                    { id: 'Grep', label: 'Search Code', desc: '' },
                    { id: 'WebSearch', label: 'Web Search', desc: '' },
                  ]
              ).map((tool) => {
                const isSelected = selectedTools.includes(tool.id)
                return (
                  <button key={tool.id}
                    onClick={() => setSelectedTools((prev) =>
                      prev.includes(tool.id) ? prev.filter((t) => t !== tool.id) : [...prev, tool.id]
                    )}
                    title={tool.desc}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}>
                    {tool.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Model preference */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Preferred AI model
              <span className="text-gray-400 font-normal ml-1">
                (for {cli === 'both' ? 'Copilot & Claude' : cli === 'copilot' ? 'Copilot' : 'Claude Code'})
              </span>
            </label>
            <select value={model} onChange={(e) => setModel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Use default model</option>
              {(cli === 'copilot' || cli === 'both') && (
                <optgroup label="Copilot Models">
                  <option value="claude-sonnet-4.5">Claude Sonnet 4.5 (Recommended)</option>
                  <option value="claude-sonnet-4">Claude Sonnet 4</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6 (Most capable)</option>
                  <option value="gpt-5">GPT-5</option>
                  <option value="gpt-5.3-codex">GPT-5.3 Codex</option>
                  <option value="gemini-3-pro">Gemini 3 Pro</option>
                  <option value="gpt-5.4-mini">GPT-5.4 Mini (Fastest)</option>
                </optgroup>
              )}
              {(cli === 'claude' || cli === 'both') && (
                <optgroup label="Claude Code Models">
                  <option value="sonnet">Sonnet (Recommended)</option>
                  <option value="opus">Opus (Most capable)</option>
                  <option value="haiku">Haiku (Fastest)</option>
                </optgroup>
              )}
            </select>
          </div>

          {/* Integrations */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Integrations
              <span className="text-gray-400 font-normal ml-1">(optional — does this skill need external data?)</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setRequiresGitHub(!requiresGitHub)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                  requiresGitHub ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                GitHub
              </button>
              <span className="text-[10px] text-gray-400">
                {requiresGitHub
                  ? 'This skill expects access to GitHub data (issues, PRs, repos)'
                  : 'Enable if this skill needs to read or interact with GitHub'}
              </span>
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800">{name}</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{scope}</span>
              <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{cli === 'both' ? 'Copilot & Claude' : cli === 'copilot' ? 'Copilot' : 'Claude'}</span>
              {autoInvoke && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Auto-invoke</span>}
              {model && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{model}</span>}
              {requiresGitHub && <span className="text-[10px] bg-gray-800 text-white px-1.5 py-0.5 rounded">GitHub</span>}
            </div>
            <p className="text-xs text-gray-500">{description}</p>
            {selectedTools.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-gray-400">Tools:</span>
                {selectedTools.map((t) => <span key={t} className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{t}</span>)}
              </div>
            )}
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
