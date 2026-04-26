import { useEffect, useState } from 'react'
import type { AppSettings } from '../../types/settings'
import type { AuthState } from '../../types/ipc'
import type { BackendId } from '../../../../shared/backends'
import { BACKEND_LABELS, BACKEND_GRID_ORDER, providerOf, transportOf } from '../../../../shared/backends'

/**
 * Lets the user pin a "default backend" that session wizards and the Work
 * page will pre-select. Shows readiness badges for each of the 4 backends
 * pulled from AuthManager. Writes `settings.preferredBackend` via
 * `settings:set`.
 */
export function DefaultBackendSelector(): JSX.Element {
  const [preferred, setPreferred] = useState<BackendId | ''>('')
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    void (async () => {
      const settings = await window.electronAPI.invoke('settings:get') as AppSettings
      const authState = await window.electronAPI.invoke('auth:get-status') as AuthState
      if (!mounted) return
      setPreferred(settings.preferredBackend ?? '')
      setAuth(authState)
    })()
    const off = window.electronAPI.on('auth:status-changed', (s: unknown) => {
      if (mounted) setAuth(s as AuthState)
    })
    return () => { mounted = false; off() }
  }, [])

  const handleChange = async (next: BackendId | '') => {
    setSaving(true)
    const settings = await window.electronAPI.invoke('settings:get') as AppSettings
    const updated: AppSettings = { ...settings, preferredBackend: next || undefined }
    await window.electronAPI.invoke('settings:set', { settings: updated })
    setPreferred(next)
    setSaving(false)
  }

  const ready = (id: BackendId): boolean => {
    if (!auth) return false
    const provider = providerOf(id)
    const status = transportOf(id) === 'cli'
      ? auth[provider].cli
      : auth[provider].sdk
    return status.installed && status.authenticated
  }

  return (
    <section className="border border-gray-200 rounded-xl p-5 space-y-3 bg-white">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Default backend</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          New sessions and wizards start with this backend unless you pick a different one inline.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={`flex items-center gap-2 text-xs cursor-pointer rounded-lg border px-3 py-2 transition-colors ${preferred === '' ? 'bg-indigo-50 border-indigo-300' : 'border-gray-200 hover:bg-gray-50'}`}>
          <input
            type="radio"
            name="preferred-backend"
            value=""
            checked={preferred === ''}
            onChange={() => void handleChange('')}
            disabled={saving}
          />
          <span>Auto (use last session)</span>
        </label>
        {BACKEND_GRID_ORDER.map((id) => {
          const isReady = ready(id)
          return (
            <label
              key={id}
              className={`flex items-center gap-2 text-xs cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
                preferred === id ? 'bg-indigo-50 border-indigo-300' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="preferred-backend"
                value={id}
                checked={preferred === id}
                onChange={() => void handleChange(id)}
                disabled={saving}
              />
              <span className="flex-1">{BACKEND_LABELS[id]}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  isReady ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
                title={isReady ? 'Installed and authenticated' : 'Not ready — see setup wizard'}
              >
                {isReady ? 'Ready' : 'Not ready'}
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
