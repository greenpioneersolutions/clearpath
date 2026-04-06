import { useState, useEffect, useCallback } from 'react'

// ── Types (inline, not imported from main process) ─────────────────────────

interface MemoryFieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiline-entries'
  required: boolean
  placeholder: string
  helpText: string
  options?: string[]
}

interface StarterMemoryDef {
  id: string
  name: string
  description: string
  setupPhase: 'onboarding' | 'early' | 'progressive' | 'on-request'
  setupPrompt: string
  fields: MemoryFieldDef[]
  example: string
  whatItUnlocks: string
}

interface MemorySetupState {
  workProfileComplete: boolean
  communicationPreferencesComplete: boolean
  currentPrioritiesComplete: boolean
  workingPreferencesComplete: boolean
  stakeholderMapEntries: number
  hasCompletedFirstInteraction: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PHASE_STYLES: Record<string, { badge: string; label: string }> = {
  onboarding: { badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30', label: 'Onboarding' },
  early: { badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30', label: 'Early' },
  progressive: { badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', label: 'Progressive' },
  'on-request': { badge: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: 'On Request' },
}

function isMemoryComplete(memoryId: string, state: MemorySetupState): boolean {
  switch (memoryId) {
    case 'work-profile':
      return state.workProfileComplete
    case 'communication-preferences':
      return state.communicationPreferencesComplete
    case 'current-priorities':
      return state.currentPrioritiesComplete
    case 'working-preferences':
      return state.workingPreferencesComplete
    case 'stakeholder-map':
      return state.stakeholderMapEntries > 0
    default:
      return false
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function StarterMemories(): JSX.Element {
  const [memories, setMemories] = useState<StarterMemoryDef[]>([])
  const [setupState, setSetupState] = useState<MemorySetupState | null>(null)
  const [savedData, setSavedData] = useState<Record<string, Record<string, unknown>>>({})
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, Record<string, unknown>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  // ── Load all data ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [defs, state] = await Promise.all([
        window.electronAPI.invoke('starter-pack:get-memories') as Promise<StarterMemoryDef[]>,
        window.electronAPI.invoke('starter-pack:get-setup-state') as Promise<MemorySetupState>,
      ])
      setMemories(defs)
      setSetupState(state)

      // Load saved data for each memory
      const dataMap: Record<string, Record<string, unknown>> = {}
      for (const mem of defs) {
        const data = await window.electronAPI.invoke('starter-pack:get-memory-data', {
          id: mem.id,
        }) as Record<string, unknown> | null
        if (data) {
          dataMap[mem.id] = data
        }
      }
      setSavedData(dataMap)
      setFormData(dataMap)
    } catch (err) {
      void err // starter memories are optional — fail silently
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // ── Form handlers ──────────────────────────────────────────────────────

  const updateField = (memoryId: string, fieldKey: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [memoryId]: {
        ...(prev[memoryId] ?? {}),
        [fieldKey]: value,
      },
    }))
  }

  const handleSave = async (memoryId: string) => {
    setSaving(memoryId)
    setSaveSuccess(null)
    try {
      const data = formData[memoryId] ?? {}
      await window.electronAPI.invoke('starter-pack:save-memory-data', {
        id: memoryId,
        data,
      })
      setSavedData((prev) => ({ ...prev, [memoryId]: data }))
      // Refresh setup state
      const newState = await window.electronAPI.invoke(
        'starter-pack:get-setup-state',
      ) as MemorySetupState
      setSetupState(newState)
      setSaveSuccess(memoryId)
      setTimeout(() => setSaveSuccess((prev) => (prev === memoryId ? null : prev)), 2000)
    } catch (err) {
      void err // save failure — form remains editable for retry
    }
    setSaving(null)
  }

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">Loading starter memories...</div>
    )
  }

  if (memories.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No starter memory definitions found.
      </div>
    )
  }

  const completedCount = setupState
    ? memories.filter((m) => isMemoryComplete(m.id, setupState)).length
    : 0

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          {completedCount} of {memories.length} memories configured
        </div>
        <button
          onClick={() => void loadData()}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-md transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / memories.length) * 100}%` }}
        />
      </div>

      {/* Memory cards */}
      <div className="space-y-3">
        {memories.map((mem) => {
          const complete = setupState ? isMemoryComplete(mem.id, setupState) : false
          const isExpanded = expandedId === mem.id
          const phaseStyle = PHASE_STYLES[mem.setupPhase] ?? PHASE_STYLES['on-request']
          const currentData = formData[mem.id] ?? {}

          return (
            <div
              key={mem.id}
              className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Card header */}
              <button
                onClick={() => toggleExpand(mem.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3"
              >
                {/* Completion indicator */}
                <div className="flex-shrink-0 mt-0.5">
                  {complete ? (
                    <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-green-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-gray-600" />
                  )}
                </div>

                {/* Title and description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-200">{mem.name}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded border ${phaseStyle.badge}`}
                    >
                      {phaseStyle.label}
                    </span>
                    {complete && (
                      <span className="text-xs text-green-400 font-medium">Complete</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{mem.description}</div>
                </div>

                {/* Expand indicator */}
                <div className="flex-shrink-0 text-gray-500 mt-0.5">
                  <svg
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded form */}
              {isExpanded && (
                <div className="border-t border-gray-700 px-4 py-4 space-y-4">
                  {/* What it unlocks */}
                  <div className="bg-gray-900/50 border border-gray-700/50 rounded-md px-3 py-2">
                    <div className="text-xs font-medium text-gray-500 mb-1">What it unlocks</div>
                    <div className="text-xs text-gray-400 leading-relaxed">
                      {mem.whatItUnlocks}
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-3">
                    {mem.fields.map((field) => (
                      <MemoryField
                        key={field.key}
                        field={field}
                        value={currentData[field.key] as string | undefined}
                        onChange={(val) => updateField(mem.id, field.key, val)}
                      />
                    ))}
                  </div>

                  {/* Example */}
                  <div className="bg-gray-900/50 border border-gray-700/50 rounded-md px-3 py-2">
                    <div className="text-xs font-medium text-gray-500 mb-1">Example</div>
                    <div className="text-xs text-gray-500 font-mono whitespace-pre-wrap leading-relaxed">
                      {mem.example}
                    </div>
                  </div>

                  {/* Save button */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => void handleSave(mem.id)}
                      disabled={saving === mem.id}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {saving === mem.id ? 'Saving...' : 'Save'}
                    </button>
                    {saveSuccess === mem.id && (
                      <span className="text-xs text-green-400">Saved successfully</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Field Renderer ─────────────────────────────────────────────────────────

function MemoryField({
  field,
  value,
  onChange,
}: {
  field: MemoryFieldDef
  value: string | undefined
  onChange: (val: string) => void
}): JSX.Element {
  const inputClasses =
    'w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors'

  return (
    <div>
      <label className="block text-xs font-medium text-gray-300 mb-1">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {field.helpText && (
        <div className="text-xs text-gray-500 mb-1.5">{field.helpText}</div>
      )}

      {field.type === 'select' && field.options ? (
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={inputClasses}
        >
          <option value="">Select...</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === 'textarea' || field.type === 'multiline-entries' ? (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${inputClasses} resize-y`}
        />
      ) : (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputClasses}
        />
      )}
    </div>
  )
}
