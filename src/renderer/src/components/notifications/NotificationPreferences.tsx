import { useState, useEffect, useCallback } from 'react'
import type { NotificationPrefs, NotificationType } from '../../types/notification'
import { ALL_NOTIFICATION_TYPES, TYPE_LABELS } from '../../types/notification'

function makeDefaultChannelPrefs(enabledByDefault: boolean): Record<NotificationType, boolean> {
  const result = {} as Record<NotificationType, boolean>
  for (const t of ALL_NOTIFICATION_TYPES) result[t] = enabledByDefault
  return result
}

const DEFAULT_PREFS: NotificationPrefs = {
  inbox: makeDefaultChannelPrefs(true),
  desktop: {
    ...makeDefaultChannelPrefs(false),
    'session-complete': true,
    'permission-request': true,
    'budget-alert': true,
    'security-event': true,
    'policy-violation': true,
    'error': true,
  } as Record<NotificationType, boolean>,
  webhook: makeDefaultChannelPrefs(false),
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
}

function normalizeChannel(
  raw: Partial<Record<NotificationType, boolean>> | undefined,
  defaults: Record<NotificationType, boolean>
): Record<NotificationType, boolean> {
  const result = {} as Record<NotificationType, boolean>
  for (const t of ALL_NOTIFICATION_TYPES) {
    result[t] = raw?.[t] ?? defaults[t]
  }
  return result
}

function normalizePrefs(raw: Partial<NotificationPrefs>): NotificationPrefs {
  return {
    inbox: normalizeChannel(raw.inbox, DEFAULT_PREFS.inbox),
    desktop: normalizeChannel(raw.desktop, DEFAULT_PREFS.desktop),
    webhook: normalizeChannel(raw.webhook, DEFAULT_PREFS.webhook),
    quietHoursEnabled: raw.quietHoursEnabled ?? DEFAULT_PREFS.quietHoursEnabled,
    quietHoursStart: raw.quietHoursStart ?? DEFAULT_PREFS.quietHoursStart,
    quietHoursEnd: raw.quietHoursEnd ?? DEFAULT_PREFS.quietHoursEnd,
  }
}

export default function NotificationPreferences(): JSX.Element {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const p = await window.electronAPI.invoke('notifications:get-prefs') as Partial<NotificationPrefs> | null
    setPrefs(normalizePrefs(p ?? {}))
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (updated: NotificationPrefs) => {
    setSaving(true)
    await window.electronAPI.invoke('notifications:set-prefs', { prefs: updated })
    setPrefs(updated)
    setSaving(false)
  }

  const toggle = (channel: 'inbox' | 'desktop' | 'webhook', type: NotificationType) => {
    if (!prefs) return
    const updated = { ...prefs, [channel]: { ...prefs[channel], [type]: !prefs[channel][type] } }
    void save(updated)
  }

  if (!prefs) return <div className="py-8 text-center text-gray-400 text-sm">Loading preferences...</div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Notification Preferences</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Control how each notification type is delivered
        </p>
      </div>

      {/* Toggles table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium text-center w-24">Inbox</th>
              <th className="pb-2 font-medium text-center w-24">Desktop</th>
              <th className="pb-2 font-medium text-center w-24">Webhook</th>
            </tr>
          </thead>
          <tbody>
            {ALL_NOTIFICATION_TYPES.map((type) => (
              <tr key={type} className="border-b border-gray-50">
                <td className="py-2.5 text-gray-700">{TYPE_LABELS[type]}</td>
                {(['inbox', 'desktop', 'webhook'] as const).map((ch) => (
                  <td key={ch} className="py-2.5 text-center">
                    <button
                      onClick={() => toggle(ch, type)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        prefs[ch][type] ? 'bg-indigo-600' : 'bg-gray-300'
                      }`}
                      role="switch"
                      aria-checked={!!prefs[ch][type]}
                      aria-label={`Toggle ${TYPE_LABELS[type]} ${ch}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        prefs[ch][type] ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quiet Hours */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-800">Quiet Hours</span>
            <p className="text-xs text-gray-500 mt-0.5">
              During quiet hours, only critical notifications trigger desktop push
            </p>
          </div>
          <button
            onClick={() => void save({ ...prefs, quietHoursEnabled: !prefs.quietHoursEnabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              prefs.quietHoursEnabled ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
            role="switch"
            aria-checked={prefs.quietHoursEnabled}
            aria-label="Toggle Quiet Hours"
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              prefs.quietHoursEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {prefs.quietHoursEnabled && (
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start</label>
              <input type="time" value={prefs.quietHoursStart}
                onChange={(e) => void save({ ...prefs, quietHoursStart: e.target.value })}
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
            </div>
            <span className="text-gray-400 mt-4">to</span>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End</label>
              <input type="time" value={prefs.quietHoursEnd}
                onChange={(e) => void save({ ...prefs, quietHoursEnd: e.target.value })}
                className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
