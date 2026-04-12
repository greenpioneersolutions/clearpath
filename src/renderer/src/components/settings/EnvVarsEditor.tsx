import { useState, useEffect, useCallback } from 'react'
import type { EnvVarInfo } from '../../types/integrations'

interface Props {
  cli: 'copilot' | 'claude'
}

const SCOPE_OPTIONS = [
  { value: 'global', label: 'Global (all CLIs)' },
  { value: 'copilot', label: 'Copilot only' },
  { value: 'claude', label: 'Claude only' },
  { value: 'local', label: 'Local models only' },
]

export default function EnvVarsEditor({ cli }: Props): JSX.Element {
  const [vars, setVars] = useState<EnvVarInfo[]>([])
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [newVar, setNewVar] = useState({ key: '', scope: 'global' as string, isSensitive: false, description: '' })
  const [addError, setAddError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('settings:get-env-vars') as EnvVarInfo[]
    setVars(result)
    const edits: Record<string, string> = {}
    for (const info of result) {
      edits[info.key] = info.isSensitive ? '' : info.value
    }
    setEditValues(edits)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // Filter vars relevant to the current CLI tab
  const relevantVars = vars.filter((v) =>
    v.scope === 'global' || v.scope === cli
  )

  const save = async (key: string, value: string) => {
    await window.electronAPI.invoke('settings:set-env-var', { key, value })
    setSaveStatus((prev) => ({ ...prev, [key]: 'Saved' }))
    setTimeout(() => setSaveStatus((prev) => ({ ...prev, [key]: '' })), 1500)
    void load()
  }

  const handleAddVar = async () => {
    const key = newVar.key.trim().toUpperCase()
    if (!key) { setAddError('Variable name is required'); return }
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) { setAddError('Use UPPER_SNAKE_CASE (letters, numbers, underscores)'); return }
    if (vars.some(v => v.key === key)) { setAddError('Variable already exists'); return }

    await window.electronAPI.invoke('settings:set-env-var', {
      key,
      value: '',
      isSensitive: newVar.isSensitive,
      scope: newVar.scope,
      description: newVar.description.trim(),
    })
    setNewVar({ key: '', scope: 'global', isSensitive: false, description: '' })
    setShowAddForm(false)
    setAddError('')
    void load()
  }

  const handleDeleteVar = async (key: string) => {
    await window.electronAPI.invoke('settings:delete-env-var', { key })
    void load()
  }

  if (loading) {
    return <div className="py-8 text-center text-gray-400 text-sm">Loading environment variables...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Environment Variables</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Set variables injected into CLI child processes. Sensitive values are encrypted via OS keychain.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Add Variable'}
        </button>
      </div>

      {/* Add new variable form */}
      {showAddForm && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Variable Name</label>
              <input
                type="text"
                value={newVar.key}
                onChange={(e) => setNewVar(prev => ({ ...prev, key: e.target.value.toUpperCase() }))}
                placeholder="MY_API_KEY"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Scope</label>
              <select
                value={newVar.scope}
                onChange={(e) => setNewVar(prev => ({ ...prev, scope: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SCOPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Description (optional)</label>
            <input
              type="text"
              value={newVar.description}
              onChange={(e) => setNewVar(prev => ({ ...prev, description: e.target.value }))}
              placeholder="What this variable is used for"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newVar.isSensitive}
                onChange={(e) => setNewVar(prev => ({ ...prev, isSensitive: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Sensitive (encrypt in OS keychain)
            </label>
            <button
              onClick={() => void handleAddVar()}
              className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Add Variable
            </button>
          </div>
          {addError && <p className="text-xs text-red-500">{addError}</p>}
        </div>
      )}

      <div className="space-y-3">
        {relevantVars.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No environment variables configured for this CLI.</p>
        )}
        {relevantVars.map((envVar) => {
          const editVal = editValues[envVar.key] ?? ''
          const status = saveStatus[envVar.key]

          return (
            <div key={envVar.key} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-medium text-gray-800">{envVar.key}</code>
                  {envVar.isSet && (
                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" title="Set" />
                  )}
                  {envVar.isSensitive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Encrypted</span>
                  )}
                  {envVar.isBuiltIn && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">Built-in</span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                    {envVar.scope === 'global' ? 'Global' : envVar.scope}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {status && <span className="text-xs text-green-600">{status}</span>}
                  {!envVar.isBuiltIn && (
                    <button
                      onClick={() => void handleDeleteVar(envVar.key)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete variable"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {envVar.description && (
                <p className="text-xs text-gray-500 mb-2">{envVar.description}</p>
              )}

              {/* Show masked preview for sensitive vars that are already set */}
              {envVar.isSensitive && envVar.isSet && envVar.value && (
                <div className="mb-2 text-xs font-mono text-gray-400 bg-gray-50 rounded px-2 py-1">
                  Current: {envVar.value}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type={envVar.isSensitive ? 'password' : 'text'}
                  value={editVal}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, [envVar.key]: e.target.value }))}
                  placeholder={envVar.isSensitive ? (envVar.isSet ? 'Enter new value to replace' : 'Enter value') : 'Not set'}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  onClick={() => void save(envVar.key, editVal)}
                  disabled={envVar.isSensitive && !editVal.trim()}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
                {envVar.isSet && (
                  <button
                    onClick={() => {
                      setEditValues((prev) => ({ ...prev, [envVar.key]: '' }))
                      void save(envVar.key, '')
                    }}
                    className="px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
