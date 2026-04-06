import { useState, useEffect, useCallback } from 'react'
import { ENV_VARS, type EnvVarDef } from '../../types/settings'

interface EnvVarInfo {
  value: string
  isSet: boolean
  isSensitive: boolean
}

interface Props {
  cli: 'copilot' | 'claude'
}

export default function EnvVarsEditor({ cli }: Props): JSX.Element {
  const [serverState, setServerState] = useState<Record<string, EnvVarInfo>>({})
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({})

  const relevantVars = ENV_VARS.filter((v) => v.cli === cli || v.cli === 'both')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('settings:get-env-vars') as Record<string, EnvVarInfo>
    setServerState(result)
    // Initialize edit values: for non-sensitive, show the actual value; for sensitive, show empty (placeholder)
    const edits: Record<string, string> = {}
    for (const [key, info] of Object.entries(result)) {
      edits[key] = info.isSensitive ? '' : info.value
    }
    setEditValues(edits)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (key: string, value: string) => {
    await window.electronAPI.invoke('settings:set-env-var', { key, value })
    setSaveStatus((prev) => ({ ...prev, [key]: 'Saved' }))
    setTimeout(() => setSaveStatus((prev) => ({ ...prev, [key]: '' })), 1500)
    // Reload to get fresh masked previews
    void load()
  }

  if (loading) {
    return <div className="py-8 text-center text-gray-400 text-sm">Loading environment variables...</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Environment Variables</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Set variables injected into CLI child processes. Sensitive values are encrypted via OS keychain.
        </p>
      </div>

      <div className="space-y-3">
        {relevantVars.map((envVar) => {
          const info = serverState[envVar.key]
          const isSet = info?.isSet ?? false
          const isSensitive = info?.isSensitive ?? envVar.isSensitive
          const maskedPreview = isSensitive ? (info?.value ?? '') : ''
          const editVal = editValues[envVar.key] ?? ''
          const status = saveStatus[envVar.key]

          return (
            <div key={envVar.key} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-medium text-gray-800">{envVar.key}</code>
                  {isSet && (
                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" title="Set" />
                  )}
                  {isSensitive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Encrypted</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {status && <span className="text-xs text-green-600">{status}</span>}
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">{envVar.description}</p>

              {/* Show masked preview for sensitive vars that are already set */}
              {isSensitive && isSet && maskedPreview && (
                <div className="mb-2 text-xs font-mono text-gray-400 bg-gray-50 rounded px-2 py-1">
                  Current: {maskedPreview}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type={isSensitive ? 'password' : 'text'}
                  value={editVal}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, [envVar.key]: e.target.value }))}
                  placeholder={isSensitive ? (isSet ? 'Enter new value to replace' : 'Enter value') : 'Not set'}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  onClick={() => void save(envVar.key, editVal)}
                  disabled={isSensitive && !editVal.trim()}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
                {isSet && (
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
