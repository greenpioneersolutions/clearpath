import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppSettings } from '../types/settings'
import type { AuthState } from '../types/ipc'
import { DEFAULT_SETTINGS } from '../types/settings'
import FlagBuilder from '../components/settings/FlagBuilder'
import ModelSelector from '../components/settings/ModelSelector'
import { DefaultBackendSelector } from '../components/settings/DefaultBackendSelector'
import SessionLimits from '../components/settings/SessionLimits'
import ConfigProfiles from '../components/settings/ConfigProfiles'
import LaunchCommandPreview from '../components/settings/LaunchCommandPreview'
import NotificationPreferences from '../components/notifications/NotificationPreferences'
import DataManagement from '../components/settings/DataManagement'
import FeatureFlagSettings from '../components/settings/FeatureFlagSettings'
import RoutingSettings from '../components/settings/RoutingSettings'
import { useFlag } from '../contexts/FeatureFlagContext'
import { providerOf } from '../../../shared/backends'

type Tab = 'flags' | 'model' | 'limits' | 'profiles' | 'notifications' | 'data' | 'features' | 'routing'

const BASE_TABS: { key: Tab; label: string }[] = [
  { key: 'flags', label: 'CLI Flags' },
  { key: 'model', label: 'Model' },
  { key: 'limits', label: 'Session Limits' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'data', label: 'Data Management' },
  { key: 'features', label: 'Feature Flags' },
]

export default function Settings(): JSX.Element {
  const [tab, setTab] = useState<Tab>('flags')
  const [cli, setCli] = useState<'copilot' | 'claude'>('copilot')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const showModelRouting = useFlag('showModelRouting')

  // Routing tab is appended only when the flag is on. The Settings tabs row
  // already collapses gracefully, so this is safe — but we keep the order
  // stable so muscle-memory clicks still land in the right place.
  const TABS = showModelRouting
    ? [...BASE_TABS, { key: 'routing' as const, label: 'Routing' }]
    : BASE_TABS

  // ── Load settings from electron-store ─────────────────────────────────────

  // On first load only, point the CLI toggle at a provider that's actually
  // usable so a Claude-primary user (Copilot never installed) doesn't land on a
  // hardcoded Copilot tab. Priority: an explicitly-saved preferred backend wins;
  // otherwise fall back to whichever provider is installed — Copilot if present
  // (or if both are absent), else Claude. A ref guard keeps later reloads (e.g.
  // applying a profile) from yanking the toggle back mid-configuration.
  const cliInitialized = useRef(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    const [result, auth] = await Promise.all([
      window.electronAPI.invoke('settings:get') as Promise<AppSettings>,
      window.electronAPI.invoke('auth:get-status') as Promise<AuthState>,
    ])
    setSettings(result)
    if (!cliInitialized.current) {
      cliInitialized.current = true
      if (result.preferredBackend) {
        setCli(providerOf(result.preferredBackend))
      } else {
        // A provider counts as "available" if either transport (CLI or SDK) is
        // installed. Copilot is the default unless it's absent and Claude isn't.
        // Guard against a missing/partial auth response — settings must still
        // load (defaulting to Copilot) even if the auth probe is unavailable.
        const copilotAvailable = !!(auth?.copilot?.cli?.installed || auth?.copilot?.sdk?.installed)
        const claudeAvailable = !!(auth?.claude?.cli?.installed || auth?.claude?.sdk?.installed)
        if (!copilotAvailable && claudeAvailable) setCli('claude')
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { void loadSettings() }, [loadSettings])

  // ── Persist helpers ───────────────────────────────────────────────────────

  const updateFlag = async (key: string, value: unknown) => {
    const result = await window.electronAPI.invoke('settings:update-flag', { key, value }) as AppSettings
    setSettings(result)
  }

  const resetFlag = async (key: string) => {
    const result = await window.electronAPI.invoke('settings:reset-flag', { key }) as AppSettings
    setSettings(result)
  }

  const resetAll = async () => {
    if (!confirm('Reset all settings to defaults?')) return
    const result = await window.electronAPI.invoke('settings:reset-all') as AppSettings
    setSettings(result)
  }

  const setModel = async (model: string) => {
    const result = await window.electronAPI.invoke('settings:set-model', { cli, model }) as AppSettings
    setSettings(result)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure CLI flags, models, plugins, and environment
          </p>
        </div>

        {/* CLI selector — scopes the Flags, Model, and Launch Preview below to
            the chosen backend. Promoted to a labelled segmented control so the
            (full) Claude configuration surface is obvious, not hidden. */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs font-medium text-gray-500">Configuring</span>
          <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-0.5">
            {(['copilot', 'claude'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCli(c)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  cli === c
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {c === 'copilot' ? 'Copilot' : 'Claude'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {tab === 'flags' && (
          <FlagBuilder
            cli={cli}
            values={settings.flags}
            onChange={(key, value) => void updateFlag(key, value)}
            onReset={(key) => void resetFlag(key)}
            onResetAll={() => void resetAll()}
          />
        )}

        {tab === 'model' && (
          <div className="space-y-4">
            <DefaultBackendSelector />
            <ModelSelector
              cli={cli}
              selectedModel={settings.model[cli]}
              onModelChange={(m) => void setModel(m)}
            />
          </div>
        )}

        {tab === 'limits' && (
          <SessionLimits
            onOpenFlags={() => { setCli('claude'); setTab('flags') }}
          />
        )}

        {tab === 'profiles' && <ConfigProfiles onApply={() => void loadSettings()} />}

        {tab === 'notifications' && <NotificationPreferences />}

        {tab === 'data' && <DataManagement />}

        {tab === 'features' && <FeatureFlagSettings />}

        {tab === 'routing' && showModelRouting && <RoutingSettings />}
      </div>

      {/* Launch Command Preview — always visible at bottom */}
      <LaunchCommandPreview cli={cli} settings={settings} />
    </div>
  )
}
