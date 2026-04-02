import { useState, useEffect, useCallback } from 'react'
import { ENV_VARS, type EnvVarDef } from '../../types/settings'

interface Props {
  cli: 'copilot' | 'claude'
}

export default function EnvVarsEditor({ cli }: Props): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({})

  const relevantVars = ENV_VARS.filter((v) => v.cli === cli || v.cli === 'both')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('settings:get-env-vars') as Record<string, string>
    setValues(result)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (key: string, value: string) => {
    await window.electronAPI.invoke('settings:set-env-var', { key, value })
    setSaveStatus((prev) => ({ ...prev, [key]: 'Saved' }))
    setTimeout(() => setSaveStatus((prev) => ({ ...prev, [key]: '' })), 1500)
  }

  const toggleShow = (key: string) => {
    setShowValues((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const mask = (value: string) => {
    if (!value) return ''
    if (value.length <= 8) return '*'.repeat(value.length)
    return value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4)
  }

  if (loading) {
    return <div className="py-8 text-center text-gray-400 text-sm">Loading environment variables...</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Environment Variables</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Set variables injected into CLI child processes. Token values are masked.
        </p>
      </div>

      <div className="space-y-3">
        {relevantVars.map((envVar) => {
          const val = values[envVar.key] ?? ''
          const isShowing = showValues[envVar.key]
          const status = saveStatus[envVar.key]

          return (
            <div key={envVar.key} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-medium text-gray-800">{envVar.key}</code>
                  {val && (
                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" title="Set" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {status && <span className="text-xs text-green-600">{status}</span>}
                  {envVar.isSensitive && val && (
                    <button
                      onClick={() => toggleShow(envVar.key)}
                      className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {isShowing ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">{envVar.description}</p>
              <div className="flex gap-2">
                <input
                  type={envVar.isSensitive && !isShowing ? 'password' : 'text'}
                  value={val}
                  onChange={(e) => setValues((prev) => ({ ...prev, [envVar.key]: e.target.value }))}
                  placeholder={envVar.isSensitive ? '••••••••' : 'Not set'}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  onClick={() => void save(envVar.key, val)}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex-shrink-0"
                >
                  Save
                </button>
                {val && (
                  <button
                    onClick={() => {
                      setValues((prev) => ({ ...prev, [envVar.key]: '' }))
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
