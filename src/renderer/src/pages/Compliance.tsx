import { useState, useEffect, useCallback } from 'react'

interface AuditEntry {
  id: string; timestamp: number; actionType: string; summary: string; details: string; sessionId?: string
}

type Tab = 'log' | 'protection' | 'security'

const ACTION_TYPES = ['', 'session', 'prompt', 'tool-approval', 'file-change', 'config-change', 'policy-violation', 'security-warning']

export default function Compliance(): JSX.Element {
  const [tab, setTab] = useState<Tab>('security')
  const [log, setLog] = useState<AuditEntry[]>([])
  const [securityEvents, setSecurityEvents] = useState<AuditEntry[]>([])
  const [filePatterns, setFilePatterns] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [newPattern, setNewPattern] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [l, se, fp] = await Promise.all([
      window.electronAPI.invoke('compliance:get-log', { limit: 100, actionType: filter || undefined, search: search || undefined }) as Promise<AuditEntry[]>,
      window.electronAPI.invoke('compliance:security-events', { limit: 10 }) as Promise<AuditEntry[]>,
      window.electronAPI.invoke('compliance:get-file-patterns') as Promise<string[]>,
    ])
    setLog(l); setSecurityEvents(se); setFilePatterns(fp)
    setLoading(false)
  }, [filter, search])

  useEffect(() => { void load() }, [load])

  const handleExport = async () => {
    const result = await window.electronAPI.invoke('compliance:export-snapshot') as { path?: string; canceled?: boolean }
    if (result.path) { setMessage(`Exported to ${result.path}`); setTimeout(() => setMessage(''), 3000) }
  }

  const handleAddPattern = () => {
    if (!newPattern.trim()) return
    const updated = [...filePatterns, newPattern.trim()]
    void window.electronAPI.invoke('compliance:set-file-patterns', { patterns: updated })
    setFilePatterns(updated)
    setNewPattern('')
  }

  const handleRemovePattern = (pattern: string) => {
    const updated = filePatterns.filter((p) => p !== pattern)
    void window.electronAPI.invoke('compliance:set-file-patterns', { patterns: updated })
    setFilePatterns(updated)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance & Security</h1>
          <p className="text-sm text-gray-500 mt-0.5">Audit log, sensitive data protection, and compliance exports</p>
        </div>
        <button onClick={() => void handleExport()}
          className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          Export Snapshot
        </button>
      </div>

      {message && <div className="text-xs px-3 py-2 rounded-lg bg-green-50 text-green-600">{message}</div>}

      {/* Security events summary */}
      <div className={`border rounded-xl p-4 ${securityEvents.length === 0 ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-lg ${securityEvents.length === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
            {securityEvents.length === 0 ? '\u2705' : '\u26A0\uFE0F'}
          </span>
          <span className={`text-sm font-medium ${securityEvents.length === 0 ? 'text-green-700' : 'text-yellow-700'}`}>
            {securityEvents.length === 0 ? 'All Clear — no security events' : `${securityEvents.length} recent security event${securityEvents.length > 1 ? 's' : ''}`}
          </span>
        </div>
        {securityEvents.length > 0 && (
          <div className="mt-2 space-y-1">
            {securityEvents.slice(0, 5).map((e) => (
              <div key={e.id} className="text-xs text-yellow-700 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                <span className="truncate">{e.summary}</span>
                <span className="text-yellow-500 flex-shrink-0">{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {([['security', 'Security Feed'], ['log', 'Audit Log'], ['protection', 'File Protection']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'
              }`}>{l}</button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {tab === 'security' && (
          <div className="space-y-2">
            {securityEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No security events recorded</div>
            ) : securityEvents.map((e) => (
              <div key={e.id} className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{e.summary}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{new Date(e.timestamp).toLocaleString()} · {e.actionType}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'log' && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <select value={filter} onChange={(e) => setFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {ACTION_TYPES.map((t) => <option key={t} value={t}>{t || 'All types'}</option>)}
              </select>
            </div>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {log.map((e) => (
                <div key={e.id}>
                  <button onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <span className="text-xs text-gray-400 flex-shrink-0 w-[140px]">{new Date(e.timestamp).toLocaleString()}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                      e.actionType === 'security-warning' ? 'bg-red-100 text-red-600' :
                      e.actionType === 'policy-violation' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>{e.actionType}</span>
                    <span className="text-sm text-gray-700 truncate flex-1">{e.summary}</span>
                  </button>
                  {expanded === e.id && (
                    <pre className="mx-3 mb-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {e.details}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'protection' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Protected File Patterns</h3>
              <p className="text-xs text-gray-500 mt-0.5">Files matching these patterns are blocked from AI access</p>
            </div>
            <div className="flex gap-2">
              <input type="text" value={newPattern} onChange={(e) => setNewPattern(e.target.value)}
                placeholder="e.g. *.key, .env*" onKeyDown={(e) => { if (e.key === 'Enter') handleAddPattern() }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={handleAddPattern} disabled={!newPattern.trim()}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40">Add</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {filePatterns.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-mono border border-red-200">
                  {p}
                  <button onClick={() => handleRemovePattern(p)} className="hover:text-red-900 ml-0.5">x</button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
