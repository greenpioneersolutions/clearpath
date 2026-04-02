import { useState, useEffect, useCallback } from 'react'
import type { AppSettings } from '../types/settings'
import { DEFAULT_SETTINGS } from '../types/settings'
import FlagBuilder from '../components/settings/FlagBuilder'
import ModelSelector from '../components/settings/ModelSelector'
import BudgetLimits from '../components/settings/BudgetLimits'
import PluginManager from '../components/settings/PluginManager'
import ConfigProfiles from '../components/settings/ConfigProfiles'
import LaunchCommandPreview from '../components/settings/LaunchCommandPreview'
import EnvVarsEditor from '../components/settings/EnvVarsEditor'
import NotificationPreferences from '../components/notifications/NotificationPreferences'
import WebhookManager from '../components/notifications/WebhookManager'

type Tab = 'flags' | 'model' | 'budget' | 'plugins' | 'profiles' | 'env' | 'notifications' | 'webhooks'

const TABS: { key: Tab; label: string }[] = [
  { key: 'flags', label: 'CLI Flags' },
  { key: 'model', label: 'Model' },
  { key: 'budget', label: 'Budget & Limits' },
  { key: 'plugins', label: 'Plugins' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'env', label: 'Environment' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'webhooks', label: 'Webhooks' },
]

export default function Settings(): JSX.Element {
  const [tab, setTab] = useState<Tab>('flags')
  const [cli, setCli] = useState<'copilot' | 'claude'>('copilot')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  // ── Load settings from electron-store ─────────────────────────────────────

  const loadSettings = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('settings:get') as AppSettings
    setSettings(result)
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

  const setBudget = async (updates: Partial<Pick<AppSettings, 'maxBudgetUsd' | 'maxTurns' | 'verbose'>>) => {
    const merged = {
      maxBudgetUsd: updates.maxBudgetUsd !== undefined ? updates.maxBudgetUsd : settings.maxBudgetUsd,
      maxTurns: updates.maxTurns !== undefined ? updates.maxTurns : settings.maxTurns,
      verbose: updates.verbose !== undefined ? updates.verbose : settings.verbose,
    }
    const result = await window.electronAPI.invoke('settings:set-budget', merged) as AppSettings
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

        {/* CLI selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">CLI:</span>
          {(['copilot', 'claude'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCli(c)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                cli === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {c === 'copilot' ? 'Copilot' : 'Claude'}
            </button>
          ))}
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
          <ModelSelector
            cli={cli}
            selectedModel={settings.model[cli]}
            onModelChange={(m) => void setModel(m)}
          />
        )}

        {tab === 'budget' && (
          <BudgetLimits
            maxBudgetUsd={settings.maxBudgetUsd}
            maxTurns={settings.maxTurns}
            verbose={settings.verbose}
            onBudgetChange={(v) => void setBudget({ maxBudgetUsd: v })}
            onTurnsChange={(v) => void setBudget({ maxTurns: v })}
            onVerboseChange={(v) => void setBudget({ verbose: v })}
          />
        )}

        {tab === 'plugins' && <PluginManager cli={cli} />}

        {tab === 'profiles' && <ConfigProfiles onApply={() => void loadSettings()} />}

        {tab === 'env' && <EnvVarsEditor cli={cli} />}

        {tab === 'notifications' && <NotificationPreferences />}

        {tab === 'webhooks' && <WebhookManager />}
      </div>

      {/* Launch Command Preview — always visible at bottom */}
      <LaunchCommandPreview cli={cli} settings={settings} />
    </div>
  )
}
