import { useState, useEffect, useCallback } from 'react'
import type { WebhookEndpoint, NotificationType } from '../../types/notification'
import { ALL_NOTIFICATION_TYPES, TYPE_LABELS } from '../../types/notification'

function genId(): string {
  return 'wh-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export default function WebhookManager(): JSX.Element {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', url: '', type: 'generic-json' as WebhookEndpoint['type'] })
  const [enabledTypes, setEnabledTypes] = useState<Set<NotificationType>>(new Set())
  const [testResults, setTestResults] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const list = await window.electronAPI.invoke('notifications:list-webhooks') as WebhookEndpoint[]
    setWebhooks(list)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) return
    const wh: WebhookEndpoint = {
      id: editId ?? genId(),
      name: form.name.trim(), url: form.url.trim(), type: form.type,
      enabledTypes: Array.from(enabledTypes),
      enabled: true,
    }
    await window.electronAPI.invoke('notifications:save-webhook', wh)
    setShowAdd(false); setEditId(null)
    setForm({ name: '', url: '', type: 'generic-json' })
    setEnabledTypes(new Set())
    void load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook?')) return
    await window.electronAPI.invoke('notifications:delete-webhook', { id })
    void load()
  }

  const handleTest = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: 'Testing...' }))
    const result = await window.electronAPI.invoke('notifications:test-webhook', { id }) as
      { success: boolean; error?: string }
    setTestResults((prev) => ({
      ...prev,
      [id]: result.success ? 'Success!' : `Failed: ${result.error}`,
    }))
    setTimeout(() => setTestResults((prev) => { const n = { ...prev }; delete n[id]; return n }), 4000)
  }

  const startEdit = (wh: WebhookEndpoint) => {
    setEditId(wh.id)
    setForm({ name: wh.name, url: wh.url, type: wh.type })
    setEnabledTypes(new Set(wh.enabledTypes))
    setShowAdd(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Webhook Endpoints</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Forward notifications to Slack, HTTP endpoints, or email
          </p>
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setEditId(null); setForm({ name: '', url: '', type: 'generic-json' }); setEnabledTypes(new Set()) }}
          className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          {showAdd ? 'Cancel' : '+ Add Webhook'}
        </button>
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Slack alerts"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">URL</label>
              <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://hooks.slack.com/..."
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as WebhookEndpoint['type'] })}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="generic-json">Generic JSON</option>
                <option value="slack-webhook">Slack Webhook</option>
                <option value="email-smtp">Email (SMTP)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Notification Types to Forward</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_NOTIFICATION_TYPES.map((type) => (
                <button key={type}
                  onClick={() => setEnabledTypes((prev) => { const n = new Set(prev); n.has(type) ? n.delete(type) : n.add(type); return n })}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    enabledTypes.has(type) ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}>
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => void handleSave()} disabled={!form.name.trim() || !form.url.trim()}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {editId ? 'Update' : 'Add'} Webhook
          </button>
        </div>
      )}

      {/* Webhook list */}
      {loading ? (
        <div className="py-4 text-center text-gray-400 text-sm">Loading...</div>
      ) : webhooks.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-400">No webhooks configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => (
            <div key={wh.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{wh.name}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{wh.type}</span>
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{wh.url}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {wh.enabledTypes.map((t) => (
                      <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-1 py-0.5 rounded">{TYPE_LABELS[t]}</span>
                    ))}
                  </div>
                  {testResults[wh.id] && (
                    <p className={`text-xs mt-1 ${testResults[wh.id]?.startsWith('Failed') ? 'text-red-500' : 'text-green-500'}`}>
                      {testResults[wh.id]}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => void handleTest(wh.id)}
                    className="px-2 py-1 text-xs text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50">Test</button>
                  <button onClick={() => startEdit(wh)}
                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Edit</button>
                  <button onClick={() => void handleDelete(wh.id)}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-red-500">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
