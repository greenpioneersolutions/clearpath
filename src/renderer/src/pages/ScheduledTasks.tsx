import { useState, useEffect, useCallback } from 'react'

interface JobExecution {
  id: string; startedAt: number; endedAt?: number; duration?: number;
  status: string; output: string; estimatedCost?: number
}

interface ScheduledJob {
  id: string; name: string; description: string; prompt: string; cronExpression: string;
  cli: 'copilot' | 'claude'; model?: string; permissionMode?: string; workingDirectory?: string;
  flags: Record<string, string | boolean>; enabled: boolean; maxBudget?: number; maxTurns?: number;
  createdAt: number; lastRunAt?: number; executions: JobExecution[]
}

type View = 'list' | 'create' | 'detail'

const PRESETS = [
  { label: 'Every morning at 9am', cron: '0 9 * * *' },
  { label: 'Every weeknight at midnight', cron: '0 0 * * 1-5' },
  { label: 'Every Monday at 9am', cron: '0 9 * * 1' },
  { label: 'Every Friday at 5pm', cron: '0 17 * * 5' },
  { label: 'Every hour', cron: '0 * * * *' },
]

function cronToHuman(expr: string): string {
  const p = PRESETS.find((pr) => pr.cron === expr)
  if (p) return p.label
  return `Cron: ${expr}`
}

function statusColor(status: string): string {
  if (status === 'success' || status === 'completed') return 'border-green-300 bg-green-50'
  if (status === 'failed' || status === 'timeout') return 'border-red-300 bg-red-50'
  if (status === 'missed') return 'border-yellow-300 bg-yellow-50'
  return 'border-gray-200'
}

export default function ScheduledTasks(): JSX.Element {
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [view, setView] = useState<View>('list')
  const [detailJob, setDetailJob] = useState<ScheduledJob | null>(null)
  const [expandedExec, setExpandedExec] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  // Form state
  const [form, setForm] = useState({
    name: '', description: '', prompt: '', cronExpression: '0 9 * * *',
    cli: 'claude' as 'copilot' | 'claude', model: '', permissionMode: '', workingDirectory: '',
    maxBudget: '', maxTurns: '', id: undefined as string | undefined,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const list = await window.electronAPI.invoke('scheduler:list') as ScheduledJob[]
    setJobs(list)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt.trim()) return
    await window.electronAPI.invoke('scheduler:save', {
      id: form.id,
      name: form.name.trim(), description: form.description.trim(),
      prompt: form.prompt.trim(), cronExpression: form.cronExpression,
      cli: form.cli, model: form.model || undefined,
      permissionMode: form.permissionMode || undefined,
      workingDirectory: form.workingDirectory || undefined,
      flags: {}, enabled: true,
      maxBudget: form.maxBudget ? parseFloat(form.maxBudget) : undefined,
      maxTurns: form.maxTurns ? parseInt(form.maxTurns) : undefined,
    })
    setView('list'); resetForm(); void load()
  }

  const resetForm = () => setForm({
    name: '', description: '', prompt: '', cronExpression: '0 9 * * *',
    cli: 'claude', model: '', permissionMode: '', workingDirectory: '',
    maxBudget: '', maxTurns: '', id: undefined,
  })

  const handleToggle = async (id: string, enabled: boolean) => {
    await window.electronAPI.invoke('scheduler:toggle', { id, enabled })
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, enabled } : j))
  }

  const handleRunNow = async (id: string) => {
    setMessage('Running...')
    await window.electronAPI.invoke('scheduler:run-now', { id })
    setMessage('Job started')
    setTimeout(() => setMessage(''), 2000)
    void load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scheduled task?')) return
    await window.electronAPI.invoke('scheduler:delete', { id })
    void load()
  }

  const handleDuplicate = async (id: string) => {
    await window.electronAPI.invoke('scheduler:duplicate', { id })
    void load()
  }

  const handleInstallTemplate = async (tpl: Record<string, unknown>) => {
    await window.electronAPI.invoke('scheduler:save', { ...tpl, enabled: false, flags: {} })
    setMessage('Template installed')
    setTimeout(() => setMessage(''), 2000)
    void load()
  }

  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([])
  useEffect(() => {
    void (window.electronAPI.invoke('scheduler:templates') as Promise<Array<Record<string, unknown>>>).then(setTemplates)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{jobs.filter((j) => j.enabled).length} active schedule{jobs.filter((j) => j.enabled).length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { resetForm(); setView('create') }}
          className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          + New Scheduled Task
        </button>
      </div>

      {message && <div className="text-xs px-3 py-2 rounded-lg bg-green-50 text-green-600">{message}</div>}

      {view === 'list' && (
        <>
          {/* Job cards */}
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : jobs.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-400 mb-2">No scheduled tasks</p>
              <p className="text-xs text-gray-400">Create one or install a template below</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const lastExec = job.executions[job.executions.length - 1]
                const lastStatus = lastExec?.status ?? 'never-run'
                return (
                  <div key={job.id} className={`bg-white border-2 rounded-xl px-5 py-4 transition-colors ${
                    !job.enabled ? 'border-gray-200 opacity-60' : statusColor(lastStatus)
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <button onClick={() => { setDetailJob(job); setView('detail') }} className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{job.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${job.cli === 'copilot' ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'}`}>{job.cli}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{cronToHuman(job.cronExpression)}</p>
                        {job.lastRunAt && <p className="text-xs text-gray-400 mt-0.5">Last run: {new Date(job.lastRunAt).toLocaleString()} — {lastStatus}</p>}
                      </button>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => void handleRunNow(job.id)} className="px-2 py-1 text-xs text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50">Run Now</button>
                        <button onClick={() => void handleToggle(job.id, !job.enabled)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${job.enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                          role="switch"
                          aria-checked={job.enabled}
                          aria-label={`Toggle task ${job.name}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${job.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                        <button onClick={() => void handleDuplicate(job.id)} className="text-xs text-gray-400 hover:text-gray-600">Dup</button>
                        <button onClick={() => void handleDelete(job.id)} className="text-xs text-gray-400 hover:text-red-500">Del</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Templates */}
          {templates.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Schedule Templates</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {templates.map((tpl, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800">{String(tpl['name'])}</span>
                      <p className="text-xs text-gray-500 mt-0.5">{String(tpl['description'])}</p>
                    </div>
                    <button onClick={() => void handleInstallTemplate(tpl)}
                      className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex-shrink-0">Install</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {view === 'create' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">{form.id ? 'Edit' : 'New'} Scheduled Task</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">CLI</label>
              <select value={form.cli} onChange={(e) => setForm({ ...form, cli: e.target.value as 'copilot' | 'claude' })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="copilot">Copilot</option><option value="claude">Claude Code</option>
              </select></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Prompt</label>
            <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Schedule</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESETS.map((p) => (
                <button key={p.cron} onClick={() => setForm({ ...form, cronExpression: p.cron })}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${form.cronExpression === p.cron ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{p.label}</button>
              ))}
            </div>
            <input type="text" value={form.cronExpression} onChange={(e) => setForm({ ...form, cronExpression: e.target.value })} placeholder="Custom cron expression" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-xs text-gray-400 mt-1">{cronToHuman(form.cronExpression)}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
              <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Default" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Max Budget ($)</label>
              <input type="number" value={form.maxBudget} onChange={(e) => setForm({ ...form, maxBudget: e.target.value })} placeholder="No limit" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Max Turns</label>
              <input type="number" value={form.maxTurns} onChange={(e) => setForm({ ...form, maxTurns: e.target.value })} placeholder="No limit" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setView('list'); resetForm() }} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={() => void handleSave()} disabled={!form.name.trim() || !form.prompt.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">Save</button>
          </div>
        </div>
      )}

      {view === 'detail' && detailJob && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <button onClick={() => setView('list')} className="text-xs text-gray-500 hover:text-gray-700 mb-1">← Back</button>
              <h3 className="text-sm font-semibold text-gray-900">{detailJob.name}</h3>
              <p className="text-xs text-gray-500">{cronToHuman(detailJob.cronExpression)} · {detailJob.cli}</p>
            </div>
            <button onClick={() => void handleRunNow(detailJob.id)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">Run Now</button>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2"><pre className="text-xs text-gray-600 whitespace-pre-wrap">{detailJob.prompt}</pre></div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Execution History ({detailJob.executions.length})</h4>
          {detailJob.executions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No executions yet</p>
          ) : (
            <div className="space-y-1">
              {[...detailJob.executions].reverse().map((exec) => (
                <div key={exec.id}>
                  <button onClick={() => setExpandedExec(expandedExec === exec.id ? null : exec.id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      exec.status === 'success' || exec.status === 'completed' ? 'bg-green-400' :
                      exec.status === 'failed' ? 'bg-red-400' : exec.status === 'missed' ? 'bg-yellow-400' : 'bg-gray-400'
                    }`} />
                    <span className="text-xs text-gray-500 w-[140px] flex-shrink-0">{new Date(exec.startedAt).toLocaleString()}</span>
                    <span className="text-xs text-gray-700 flex-1">{exec.status}</span>
                    {exec.duration && <span className="text-xs text-gray-400">{Math.round(exec.duration / 1000)}s</span>}
                  </button>
                  {expandedExec === exec.id && exec.output && (
                    <pre className="mx-3 mb-2 bg-gray-900 text-gray-200 text-xs font-mono p-3 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap">{exec.output}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
