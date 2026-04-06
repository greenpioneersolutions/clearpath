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

// ── Component ────────────────────────────────────────────────────────────────

interface ContextSettings {
  showUseContext: boolean
  showMemories: boolean
  showAgents: boolean
  showSkills: boolean
}

export default function WizardSettings(): JSX.Element {
  const [config, setConfig] = useState<WizardConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingOption, setEditingOption] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [ctxSettings, setCtxSettings] = useState<ContextSettings>({ showUseContext: true, showMemories: true, showAgents: true, showSkills: true })

  const load = useCallback(async () => {
    setLoading(true)
    const [cfg, ctx] = await Promise.all([
      window.electronAPI.invoke('wizard:get-config') as Promise<WizardConfig>,
      window.electronAPI.invoke('wizard:get-context-settings') as Promise<ContextSettings>,
    ])
    setConfig(cfg)
    if (ctx) setCtxSettings(ctx)
    setLoading(false)
    setDirty(false)
  }, [])

  const updateCtxSetting = async (key: keyof ContextSettings, value: boolean) => {
    const updated = { ...ctxSettings, [key]: value }
    setCtxSettings(updated)
    await window.electronAPI.invoke('wizard:set-context-settings', { [key]: value })
  }

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!config) return
    setSaving(true)
    await window.electronAPI.invoke('wizard:save-config', { config })
    setSaving(false)
    setDirty(false)
  }

  const reset = async () => {
    const result = await window.electronAPI.invoke('wizard:reset-config') as { success: boolean; config: WizardConfig }
    if (result.success) {
      setConfig(result.config)
      setDirty(false)
      setEditingOption(null)
    }
  }

  const updateConfig = (updates: Partial<WizardConfig>) => {
    if (!config) return
    setConfig({ ...config, ...updates })
    setDirty(true)
  }

  const updateOption = (optionId: string, updates: Partial<WizardOption>) => {
    if (!config) return
    setConfig({
      ...config,
      options: config.options.map((o) => o.id === optionId ? { ...o, ...updates } : o),
    })
    setDirty(true)
  }

  const updateField = (optionId: string, fieldId: string, updates: Partial<WizardField>) => {
    if (!config) return
    setConfig({
      ...config,
      options: config.options.map((o) =>
        o.id === optionId
          ? { ...o, fields: o.fields.map((f) => f.id === fieldId ? { ...f, ...updates } : f) }
          : o
      ),
    })
    setDirty(true)
  }

  const addOption = () => {
    if (!config) return
    const id = `custom-${Date.now()}`
    const newOption: WizardOption = {
      id,
      label: 'New Option',
      description: 'Describe what this option is for',
      icon: '📝',
      fields: [
        { id: `${id}-f1`, label: 'First question', placeholder: 'Enter your answer...', type: 'textarea', required: true },
      ],
      promptTemplate: '{{' + `${id}-f1` + '}}',
    }
    setConfig({ ...config, options: [...config.options, newOption] })
    setEditingOption(id)
    setDirty(true)
  }

  const removeOption = (optionId: string) => {
    if (!config || config.options.length <= 1) return
    setConfig({ ...config, options: config.options.filter((o) => o.id !== optionId) })
    if (editingOption === optionId) setEditingOption(null)
    setDirty(true)
  }

  const addField = (optionId: string) => {
    if (!config) return
    const fieldId = `${optionId}-f${Date.now()}`
    const newField: WizardField = {
      id: fieldId, label: 'New Question', placeholder: 'Enter your answer...', type: 'textarea', required: false,
    }
    setConfig({
      ...config,
      options: config.options.map((o) =>
        o.id === optionId ? { ...o, fields: [...o.fields, newField] } : o
      ),
    })
    setDirty(true)
  }

  const removeField = (optionId: string, fieldId: string) => {
    if (!config) return
    const option = config.options.find((o) => o.id === optionId)
    if (!option || option.fields.length <= 1) return
    setConfig({
      ...config,
      options: config.options.map((o) =>
        o.id === optionId ? { ...o, fields: o.fields.filter((f) => f.id !== fieldId) } : o
      ),
    })
    setDirty(true)
  }

  if (loading || !config) return <div className="text-gray-400 text-sm">Loading wizard config...</div>

  const activeOption = editingOption ? config.options.find((o) => o.id === editingOption) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Wizard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customize the guided wizard that helps users build structured prompts</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void reset()}
            className="px-3 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Reset to Defaults
          </button>
          {dirty && (
            <button onClick={() => void save()} disabled={saving}
              className="px-4 py-1.5 text-xs bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Global settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">General</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Wizard Title</label>
            <input type="text" value={config.title}
              onChange={(e) => updateConfig({ title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Initial Question</label>
            <input type="text" value={config.initialQuestion}
              onChange={(e) => updateConfig({ initialQuestion: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Subtitle</label>
          <input type="text" value={config.subtitle}
            onChange={(e) => updateConfig({ subtitle: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
      </div>

      {/* Use Context settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Use Context</h3>
        <p className="text-xs text-gray-500">
          Control whether the "Use Context" option appears in the wizard, and which context types users can pick from.
        </p>

        <div className="space-y-3">
          {/* Master toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm text-gray-700">Show "Use Context" in wizard</span>
              <p className="text-[10px] text-gray-400 mt-0.5">When off, the option is hidden from the wizard entirely</p>
            </div>
            <button onClick={() => void updateCtxSetting('showUseContext', !ctxSettings.showUseContext)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${ctxSettings.showUseContext ? 'bg-indigo-600' : 'bg-gray-300'}`}
              role="switch"
              aria-checked={ctxSettings.showUseContext}
              aria-label="Toggle Use Context">
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${ctxSettings.showUseContext ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {ctxSettings.showUseContext && (
            <div className="pl-4 border-l-2 border-gray-200 space-y-3">
              {([
                { key: 'showMemories' as const, label: 'Memories', desc: 'Allow selecting saved notes and memories as context' },
                { key: 'showAgents' as const, label: 'Agents', desc: 'Allow selecting a specific agent for the session' },
                { key: 'showSkills' as const, label: 'Skills', desc: 'Allow selecting a skill to inject its instructions' },
              ]).map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                    <p className="text-[10px] text-gray-400">{desc}</p>
                  </div>
                  <button onClick={() => void updateCtxSetting(key, !ctxSettings[key])}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${ctxSettings[key] ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    role="switch"
                    aria-checked={ctxSettings[key]}
                    aria-label={`Toggle ${label}`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${ctxSettings[key] ? 'translate-x-3' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Options list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Options ({config.options.length})</h3>
          <button onClick={addOption}
            className="text-xs text-indigo-600 hover:text-indigo-500 font-medium transition-colors">
            + Add Option
          </button>
        </div>

        {config.options.map((option) => (
          <div key={option.id}
            className={`bg-white border rounded-xl overflow-hidden transition-all ${
              editingOption === option.id ? 'border-indigo-300 shadow-sm' : 'border-gray-200'
            }`}
          >
            {/* Option header */}
            <button
              onClick={() => setEditingOption(editingOption === option.id ? null : option.id)}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-xl">{option.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800">{option.label}</span>
                <p className="text-xs text-gray-500 truncate">{option.description}</p>
              </div>
              <span className="text-[10px] text-gray-400">{option.fields.length} fields</span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${editingOption === option.id ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Option editor */}
            {editingOption === option.id && activeOption && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-4 bg-gray-50">
                {/* Option metadata */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Icon (emoji)</label>
                    <input type="text" value={activeOption.icon}
                      onChange={(e) => updateOption(option.id, { icon: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-center" maxLength={4} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                    <input type="text" value={activeOption.label}
                      onChange={(e) => updateOption(option.id, { label: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input type="text" value={activeOption.description}
                      onChange={(e) => updateOption(option.id, { description: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
                  </div>
                </div>

                {/* Fields */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">Questions</span>
                    <button onClick={() => addField(option.id)}
                      className="text-[10px] text-indigo-600 hover:text-indigo-500 font-medium">+ Add Question</button>
                  </div>

                  {activeOption.fields.map((field, fi) => (
                    <div key={field.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-gray-400">Question {fi + 1} — ID: {field.id}</span>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 text-[10px] text-gray-500">
                            <input type="checkbox" checked={field.required}
                              onChange={(e) => updateField(option.id, field.id, { required: e.target.checked })}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                            Required
                          </label>
                          {activeOption.fields.length > 1 && (
                            <button onClick={() => removeField(option.id, field.id)}
                              className="text-[10px] text-red-500 hover:text-red-400">Remove</button>
                          )}
                        </div>
                      </div>
                      <input type="text" value={field.label}
                        onChange={(e) => updateField(option.id, field.id, { label: e.target.value })}
                        placeholder="Question text"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded" />
                      <input type="text" value={field.placeholder}
                        onChange={(e) => updateField(option.id, field.id, { placeholder: e.target.value })}
                        placeholder="Placeholder hint"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded text-gray-400" />
                      <input type="text" value={field.helpText ?? ''}
                        onChange={(e) => updateField(option.id, field.id, { helpText: e.target.value || undefined })}
                        placeholder="Help text (optional)"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded text-gray-400" />
                    </div>
                  ))}
                </div>

                {/* Prompt template */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Prompt Template
                    <span className="font-normal text-gray-400 ml-2">Use {'{{field_id}}'} for placeholders</span>
                  </label>
                  <textarea
                    value={activeOption.promptTemplate}
                    onChange={(e) => updateOption(option.id, { promptTemplate: e.target.value })}
                    rows={6}
                    className="w-full px-3 py-2.5 text-xs font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Available: {activeOption.fields.map((f) => `{{${f.id}}}`).join(', ')}
                  </p>
                </div>

                {/* Remove option */}
                {config.options.length > 1 && (
                  <div className="flex justify-end pt-2 border-t border-gray-100">
                    <button onClick={() => removeOption(option.id)}
                      className="text-xs text-red-500 hover:text-red-400 transition-colors">
                      Remove This Option
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
