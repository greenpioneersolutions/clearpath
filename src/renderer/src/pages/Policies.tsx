import { useState, useEffect, useCallback } from 'react'

interface PolicyRules {
  maxBudgetPerSession: number | null
  maxBudgetPerDay: number | null
  blockedTools: string[]
  blockedFilePatterns: string[]
  requiredPermissionMode: string | null
  allowedModels: string[]
  maxConcurrentAgents: number | null
  maxTurnsPerSession: number | null
}

interface PolicyPreset {
  id: string; name: string; description: string; rules: PolicyRules; isBuiltin: boolean; createdAt: number
}

interface PolicyViolation {
  id: string; timestamp: number; action: string; rule: string; details: string; presetName: string
}

type Tab = 'editor' | 'presets' | 'violations'

export default function Policies(): JSX.Element {
  const [tab, setTab] = useState<Tab>('presets')
  const [presets, setPresets] = useState<PolicyPreset[]>([])
  const [activeId, setActiveId] = useState('')
  const [violations, setViolations] = useState<PolicyViolation[]>([])
  const [editTarget, setEditTarget] = useState<PolicyPreset | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [p, a, v] = await Promise.all([
      window.electronAPI.invoke('policy:list-presets') as Promise<PolicyPreset[]>,
      window.electronAPI.invoke('policy:get-active') as Promise<{ activePresetId: string }>,
      window.electronAPI.invoke('policy:get-violations') as Promise<PolicyViolation[]>,
    ])
    setPresets(p)
    setActiveId(a.activePresetId)
    setViolations(v)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSetActive = async (id: string) => {
    await window.electronAPI.invoke('policy:set-active', { id })
    setActiveId(id)
    setMessage('Policy activated')
    setTimeout(() => setMessage(''), 2000)
    // Notify sidebar to refresh the policy badge
    window.dispatchEvent(new Event('sidebar:refresh'))
  }

  const handleExport = async (id: string) => {
    await window.electronAPI.invoke('policy:export', { id })
  }

  const handleImport = async () => {
    const result = await window.electronAPI.invoke('policy:import') as
      | { preset: PolicyPreset } | { canceled?: boolean; error?: string }
    if ('preset' in result) {
      setMessage(`Imported "${result.preset.name}"`)
      setTimeout(() => setMessage(''), 2000)
      void load()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this policy preset?')) return
    await window.electronAPI.invoke('policy:delete-preset', { id })
    void load()
  }

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading policies...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policies & Guardrails</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Active: <strong>{presets.find((p) => p.id === activeId)?.name ?? 'None'}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void handleImport()}
            className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Import
          </button>
          <button onClick={() => { setEditTarget(null); setTab('editor') }}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            + Create Policy
          </button>
        </div>
      </div>

      {message && <div className="text-xs px-3 py-2 rounded-lg bg-green-50 text-green-600">{message}</div>}

      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {([['presets', 'Presets'], ['violations', `Violations (${violations.length})`], ['editor', 'Editor']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>{l}</button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {tab === 'presets' && (
          <div className="space-y-3">
            {presets.map((p) => (
              <div key={p.id} className={`border rounded-xl px-4 py-3 transition-colors ${
                p.id === activeId ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{p.name}</span>
                      {p.isBuiltin && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">built-in</span>}
                      {p.id === activeId && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">active</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
                      {p.rules.maxBudgetPerSession && <span>Max ${p.rules.maxBudgetPerSession}/session</span>}
                      {p.rules.requiredPermissionMode && <span>Mode: {p.rules.requiredPermissionMode}</span>}
                      {p.rules.blockedTools.length > 0 && <span>{p.rules.blockedTools.length} blocked tools</span>}
                      {p.rules.maxConcurrentAgents && <span>Max {p.rules.maxConcurrentAgents} agents</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {p.id !== activeId && (
                      <button onClick={() => void handleSetActive(p.id)}
                        className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Activate</button>
                    )}
                    <button onClick={() => void handleExport(p.id)}
                      className="px-2 py-1 text-xs text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50">Export</button>
                    {!p.isBuiltin && (
                      <button onClick={() => void handleDelete(p.id)}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-red-500">Delete</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'violations' && (
          <div className="space-y-2">
            {violations.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-2xl">&#9989;</span>
                <p className="text-sm text-gray-500 mt-2">No policy violations recorded</p>
              </div>
            ) : violations.map((v) => (
              <div key={v.id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                <span className="w-2 h-2 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{v.rule}</p>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Action: {v.action} · Policy: {v.presetName} · {new Date(v.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'editor' && (
          <div className="text-center py-8 text-gray-400 text-sm">
            <p>Policy editor — create custom rule sets by combining constraints.</p>
            <p className="text-xs mt-1">Use the Presets tab to activate built-in policies, or Import a team policy file.</p>
          </div>
        )}
      </div>
    </div>
  )
}
