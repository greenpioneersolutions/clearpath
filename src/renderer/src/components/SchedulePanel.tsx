import { useState, useEffect, useCallback } from 'react'
import type { PromptTemplate } from '../types/template'
import type { BackendId } from '../../../shared/backends'
import { providerOf } from '../../../shared/backends'

// ── Types (mirror backend) ──────────────────────────────────────────────────

interface JobExecution {
  id: string; startedAt: number; endedAt?: number; duration?: number
  status: string; output: string
}

interface ScheduledJob {
  id: string; name: string; description: string; prompt: string; cronExpression: string
  cli: BackendId; model?: string; permissionMode?: string; workingDirectory?: string
  flags: Record<string, string | boolean>; enabled: boolean; maxBudget?: number; maxTurns?: number
  createdAt: number; lastRunAt?: number; executions: JobExecution[]
}

type View = 'home' | 'create-custom' | 'create-from-template' | 'pick-template' | 'detail'

// ── Cron presets ─────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: 'Every morning at 9am', cron: '0 9 * * *' },
  { label: 'Every weeknight at midnight', cron: '0 0 * * 1-5' },
  { label: 'Every Monday at 9am', cron: '0 9 * * 1' },
  { label: 'Every Friday at 5pm', cron: '0 17 * * 5' },
  { label: 'Every hour', cron: '0 * * * *' },
]

function cronToHuman(expr: string): string {
  const p = CRON_PRESETS.find((pr) => pr.cron === expr)
  if (p) return p.label
  return `Cron: ${expr}`
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  cli: BackendId
}

export default function SchedulePanel({ cli }: Props): JSX.Element {
  const [view, setView] = useState<View>('home')
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [scheduleTemplates, setScheduleTemplates] = useState<Array<Record<string, unknown>>>([])
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null)
  const [detailJob, setDetailJob] = useState<ScheduledJob | null>(null)
  const [expandedExec, setExpandedExec] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  // Form state
  const [form, setForm] = useState<{
    name: string; description: string; prompt: string; cronExpression: string
    cli: BackendId; model: string; maxBudget: string; maxTurns: string
  }>({
    name: '', description: '', prompt: '', cronExpression: '0 9 * * *',
    cli, model: '', maxBudget: '', maxTurns: '',
  })

  const flash = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 2500) }

  const loadJobs = useCallback(async () => {
    const list = await window.electronAPI.invoke('scheduler:list') as ScheduledJob[]
    setJobs(list)
  }, [])

  useEffect(() => {
    void loadJobs()
    void (window.electronAPI.invoke('scheduler:templates') as Promise<Array<Record<string, unknown>>>).then(setScheduleTemplates)
  }, [loadJobs])

  const loadPromptTemplates = useCallback(async () => {
    const list = await window.electronAPI.invoke('templates:list', {}) as PromptTemplate[]
    setPromptTemplates(list)
  }, [])

  const resetForm = () => setForm({
    name: '', description: '', prompt: '', cronExpression: '0 9 * * *',
    cli, model: '', maxBudget: '', maxTurns: '',
  })

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt.trim()) return
    await window.electronAPI.invoke('scheduler:save', {
      name: form.name.trim(), description: form.description.trim(),
      prompt: form.prompt.trim(), cronExpression: form.cronExpression,
      cli: form.cli, model: form.model || undefined,
      flags: {}, enabled: true,
      maxBudget: form.maxBudget ? parseFloat(form.maxBudget) : undefined,
      maxTurns: form.maxTurns ? parseInt(form.maxTurns) : undefined,
    })
    resetForm()
    flash('Schedule created')
    setView('home')
    void loadJobs()
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await window.electronAPI.invoke('scheduler:toggle', { id, enabled })
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, enabled } : j))
  }

  const handleRunNow = async (id: string) => {
    flash('Running...')
    await window.electronAPI.invoke('scheduler:run-now', { id })
    flash('Job started')
    void loadJobs()
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.invoke('scheduler:delete', { id })
    if (detailJob?.id === id) { setDetailJob(null); setView('home') }
    void loadJobs()
  }

  const handleInstallScheduleTemplate = async (tpl: Record<string, unknown>) => {
    await window.electronAPI.invoke('scheduler:save', { ...tpl, enabled: false, flags: {} })
    flash('Template installed as schedule')
    void loadJobs()
  }

  // When user picks a prompt template to schedule
  const handlePickPromptTemplate = (t: PromptTemplate) => {
    setSelectedTemplate(t)
    setForm({
      ...form,
      name: `Scheduled: ${t.name}`,
      description: t.description,
      prompt: t.body,
      cli: t.recommendedModel?.includes('copilot') ? 'copilot-cli' : cli,
    })
    setView('create-from-template')
  }

  const activeCount = jobs.filter((j) => j.enabled).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Toast */}
        {message && (
          <div className="mb-4 text-xs px-3 py-2 rounded-lg animate-fadeIn"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)', color: 'var(--brand-accent-light)', border: '1px solid color-mix(in srgb, var(--brand-accent) 20%, transparent)' }}>
            {message}
          </div>
        )}

        {/* ── Home view ──────────────────────────────────────────────────── */}
        {view === 'home' && (
          <div className="space-y-8">
            {/* Header */}
            <div>
              <h2 className="text-white font-semibold text-lg">Schedule</h2>
              <p className="text-gray-500 text-sm mt-0.5">
                Automate recurring tasks. {activeCount > 0 ? `${activeCount} active schedule${activeCount !== 1 ? 's' : ''}.` : 'No active schedules yet.'}
              </p>
            </div>

            {/* Two action cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => { resetForm(); setView('create-custom') }}
                className="group bg-gray-900 border border-gray-800 hover:border-indigo-500/40 rounded-2xl p-5 text-left transition-all hover:shadow-lg hover:shadow-indigo-500/5"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600/10 flex items-center justify-center mb-3 group-hover:bg-indigo-600/20 transition-colors">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h3 className="text-white font-medium text-sm">Create Custom Schedule</h3>
                <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                  Write your own prompt and set a cron schedule for recurring execution.
                </p>
              </button>

              <button
                onClick={() => { void loadPromptTemplates(); setView('pick-template') }}
                className="group bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left transition-all hover:shadow-lg"
                style={{ ['--tw-shadow-color' as string]: 'color-mix(in srgb, var(--brand-accent-light) 5%, transparent)' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' }}>
                  <svg className="w-5 h-5" style={{ color: 'var(--brand-accent-light)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-white font-medium text-sm">Schedule a Template</h3>
                <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                  Pick from your prompt templates and put it on autopilot.
                </p>
              </button>
            </div>

            {/* Active schedules */}
            {jobs.length > 0 && (
              <div>
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Your Schedules</h3>
                <div className="space-y-2">
                  {jobs.map((job) => {
                    const lastExec = job.executions[job.executions.length - 1]
                    const statusColor = !job.enabled ? 'bg-gray-600'
                      : lastExec?.status === 'success' || lastExec?.status === 'completed' ? 'bg-green-400'
                      : lastExec?.status === 'failed' ? 'bg-red-400'
                      : 'bg-gray-500'
                    return (
                      <div key={job.id} className={`bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3 transition-all ${!job.enabled ? 'opacity-50' : ''}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
                        <button onClick={() => { setDetailJob(job); setView('detail') }} className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-200 text-sm font-medium truncate">{job.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${providerOf(job.cli) === 'copilot' ? 'bg-purple-900/40 text-purple-300' : 'bg-orange-900/40 text-orange-300'}`}>{job.cli}</span>
                          </div>
                          <span className="text-gray-600 text-xs">{cronToHuman(job.cronExpression)}</span>
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => void handleRunNow(job.id)} className="px-2 py-1 text-[11px] text-indigo-400 border border-indigo-800 rounded-lg hover:bg-indigo-900/30 transition-colors">Run</button>
                          <button onClick={() => void handleToggle(job.id, !job.enabled)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${job.enabled ? 'bg-indigo-600' : 'bg-gray-700'}`}
                            role="switch"
                            aria-checked={job.enabled}
                            aria-label={`Toggle schedule ${job.name}`}>
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${job.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                          <button onClick={() => void handleDelete(job.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Schedule templates from backend */}
            {scheduleTemplates.length > 0 && (
              <div>
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Quick-Start Templates</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {scheduleTemplates.map((tpl, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-200 text-sm font-medium">{String(tpl['name'])}</span>
                        <p className="text-gray-600 text-xs mt-0.5">{String(tpl['description'])}</p>
                        <span className="text-gray-700 text-[10px]">{cronToHuman(String(tpl['cronExpression']))}</span>
                      </div>
                      <button onClick={() => void handleInstallScheduleTemplate(tpl)}
                        className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex-shrink-0 transition-colors">
                        Install
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Pick prompt template to schedule ────────────────────────── */}
        {view === 'pick-template' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('home')} className="text-gray-500 hover:text-gray-300 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h2 className="text-white font-semibold text-base">Schedule a Template</h2>
                <p className="text-gray-500 text-xs">Choose a prompt template to run on a schedule</p>
              </div>
            </div>

            {promptTemplates.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-sm">No prompt templates found.</p>
                <p className="text-gray-600 text-xs mt-1">Create templates in the Templates panel first.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {promptTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handlePickPromptTemplate(t)}
                    className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-200 text-sm font-medium">{t.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">{t.category}</span>
                          {t.variables.length > 0 && (
                            <span className="text-[10px] text-yellow-500">{t.variables.length} variable{t.variables.length !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        <p className="text-gray-600 text-xs mt-0.5 truncate">{t.description}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Create form (custom or from template) ──────────────────── */}
        {(view === 'create-custom' || view === 'create-from-template') && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={() => { setView('home'); resetForm(); setSelectedTemplate(null) }} className="text-gray-500 hover:text-gray-300 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h2 className="text-white font-semibold text-base">
                  {view === 'create-from-template' && selectedTemplate
                    ? `Schedule: ${selectedTemplate.name}`
                    : 'New Custom Schedule'}
                </h2>
                <p className="text-gray-500 text-xs">Set up the prompt and choose when it runs</p>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              {/* Name + CLI */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Nightly Tests"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">CLI</label>
                  <select value={form.cli} onChange={(e) => setForm({ ...form, cli: e.target.value as BackendId })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500">
                    <option value="copilot-cli">Copilot CLI</option>
                    <option value="claude-cli">Claude CLI</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief summary of what this does"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Prompt</label>
                <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={5}
                  placeholder="What should the AI do each time this runs?"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 font-mono focus:outline-none focus:border-indigo-500 resize-y" />
                {selectedTemplate && selectedTemplate.variables.length > 0 && (
                  <p className="text-yellow-500/70 text-[11px] mt-1">
                    This template has variables ({selectedTemplate.variables.map(v => `{{${v}}}`).join(', ')}). Fill them in above before saving.
                  </p>
                )}
              </div>

              {/* Schedule presets */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Schedule</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CRON_PRESETS.map((p) => (
                    <button key={p.cron} onClick={() => setForm({ ...form, cronExpression: p.cron })}
                      className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                        form.cronExpression === p.cron ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
                      }`}>{p.label}</button>
                  ))}
                </div>
                <input type="text" value={form.cronExpression} onChange={(e) => setForm({ ...form, cronExpression: e.target.value })}
                  placeholder="Custom cron expression"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                <p className="text-gray-600 text-[11px] mt-1">{cronToHuman(form.cronExpression)}</p>
              </div>

              {/* Advanced options */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Model</label>
                  <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="Default"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Max Budget ($)</label>
                  <input type="number" value={form.maxBudget} onChange={(e) => setForm({ ...form, maxBudget: e.target.value })}
                    placeholder="No limit"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Max Turns</label>
                  <input type="number" value={form.maxTurns} onChange={(e) => setForm({ ...form, maxTurns: e.target.value })}
                    placeholder="No limit"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setView('home'); resetForm(); setSelectedTemplate(null) }}
                  className="px-4 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors">Cancel</button>
                <button onClick={() => void handleSave()} disabled={!form.name.trim() || !form.prompt.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors">
                  Create Schedule
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Detail view ────────────────────────────────────────────── */}
        {view === 'detail' && detailJob && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('home')} className="text-gray-500 hover:text-gray-300 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="flex-1">
                <h2 className="text-white font-semibold text-base">{detailJob.name}</h2>
                <p className="text-gray-500 text-xs">{cronToHuman(detailJob.cronExpression)} &middot; {detailJob.cli}</p>
              </div>
              <button onClick={() => void handleRunNow(detailJob.id)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">Run Now</button>
            </div>

            {/* Prompt */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1.5">Prompt</p>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{detailJob.prompt}</pre>
            </div>

            {/* Execution history */}
            <div>
              <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Execution History ({detailJob.executions.length})
              </h3>
              {detailJob.executions.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-6">No executions yet. Click "Run Now" to test.</p>
              ) : (
                <div className="space-y-1">
                  {[...detailJob.executions].reverse().map((exec) => (
                    <div key={exec.id}>
                      <button onClick={() => setExpandedExec(expandedExec === exec.id ? null : exec.id)}
                        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-900 transition-colors">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          exec.status === 'success' || exec.status === 'completed' ? 'bg-green-400' :
                          exec.status === 'failed' ? 'bg-red-400' : exec.status === 'missed' ? 'bg-yellow-400' : 'bg-gray-500'
                        }`} />
                        <span className="text-xs text-gray-500 w-[140px] flex-shrink-0">{new Date(exec.startedAt).toLocaleString()}</span>
                        <span className="text-xs text-gray-300 flex-1">{exec.status}</span>
                        {exec.duration && <span className="text-xs text-gray-600">{Math.round(exec.duration / 1000)}s</span>}
                        <svg className={`w-3 h-3 text-gray-600 transition-transform ${expandedExec === exec.id ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {expandedExec === exec.id && exec.output && (
                        <pre className="mx-3 mb-2 bg-gray-900 border border-gray-800 text-gray-300 text-xs font-mono p-3 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap">{exec.output}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
