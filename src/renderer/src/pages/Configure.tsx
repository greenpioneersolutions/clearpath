import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Settings from './Settings'
import Policies from './Policies'
import Memory from './Memory'
import Workspaces from './Workspaces'
import TeamHub from './TeamHub'
import ScheduledTasks from './ScheduledTasks'
import SkillsManagement from './SkillsManagement'
import WizardSettings from '../components/wizard/WizardSettings'
import SetupWizardFull from '../components/onboarding/SetupWizardFull'
import WhiteLabel from '../components/settings/WhiteLabel'
import AccessibilitySettings from '../components/settings/AccessibilitySettings'
import Agents from './Agents'
import IntegrationsTab from '../components/integrations/IntegrationsTab'
import ExtensionManager from '../components/extensions/ExtensionManager'

type Tab = 'setup' | 'accessibility' | 'settings' | 'policies' | 'integrations' | 'extensions' | 'memory' | 'agents' | 'skills' | 'wizard' | 'workspaces' | 'team' | 'scheduler' | 'branding'

const TABS: { key: Tab; label: string }[] = [
  { key: 'setup', label: 'Setup Wizard' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'settings', label: 'Settings' },
  { key: 'policies', label: 'Policies' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'extensions', label: 'Extensions' },
  { key: 'memory', label: 'Memory' },
  { key: 'agents', label: 'Agents' },
  { key: 'skills', label: 'Skills' },
  { key: 'wizard', label: 'Session Wizard' },
  { key: 'workspaces', label: 'Workspaces' },
  { key: 'team', label: 'Team Hub' },
  { key: 'scheduler', label: 'Scheduler' },
  { key: 'branding', label: 'White Label' },
]

// ── Main Configure Component ─────────────────────────────────────────────────

export default function Configure(): JSX.Element {
  const [tab, setTab] = useState<Tab>('settings')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Track whether the ExtensionManager has pending changes that need a restart
  const [extensionPendingRestart, setExtensionPendingRestart] = useState(false)
  const [showRestartModal, setShowRestartModal] = useState(false)
  const pendingTabRef = useRef<Tab | null>(null)

  useEffect(() => {
    const urlTab = searchParams.get('tab') as Tab | null
    if (urlTab && TABS.some(t => t.key === urlTab)) setTab(urlTab)
  }, [searchParams])

  const handlePendingRestartChange = useCallback((pending: boolean) => {
    setExtensionPendingRestart(pending)
  }, [])

  function handleRestart() {
    window.electronAPI.invoke('app:restart')
  }

  /** Attempt to switch tabs. If extension changes are pending and we're leaving the
   *  extensions tab, show a confirmation modal instead of switching immediately. */
  function handleTabChange(newTab: Tab) {
    if (extensionPendingRestart && tab === 'extensions' && newTab !== 'extensions') {
      pendingTabRef.current = newTab
      setShowRestartModal(true)
      return
    }
    setTab(newTab)
  }

  /** User chose to continue without restarting — navigate to the pending tab. */
  function handleContinueWithoutRestart() {
    setShowRestartModal(false)
    if (pendingTabRef.current) {
      setTab(pendingTabRef.current)
      pendingTabRef.current = null
    }
  }

  /** User chose to stay on the extensions tab. */
  function handleStayOnExtensions() {
    setShowRestartModal(false)
    pendingTabRef.current = null
  }

  return (
    <div className="flex h-full">
      {/* Restart confirmation modal */}
      {showRestartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Extension changes pending
            </h3>
            <p className="text-sm text-gray-300 mb-6">
              You have extension changes that require a restart to take full effect.
              Would you like to restart now, or continue without restarting?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleStayOnExtensions}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
              >
                Stay here
              </button>
              <button
                onClick={handleContinueWithoutRestart}
                className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 text-gray-200 rounded"
              >
                Continue without restart
              </button>
              <button
                onClick={handleRestart}
                className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded font-medium"
              >
                Restart now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left: vertical tab list */}
      <div className="w-44 flex-shrink-0 bg-gray-900 border-r border-gray-700 py-4 flex flex-col">
        <div className="flex-1" role="tablist" aria-label="Configure sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              role="tab"
              aria-selected={tab === t.key}
              id={`tab-${t.key}`}
              className={`w-full text-left px-5 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-gray-800 text-indigo-400 border-r-2 border-indigo-500'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Buried learn link at bottom — safety net for completed users */}
        <div className="px-5 py-3 border-t border-gray-700">
          <button onClick={() => navigate('/learn')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-400 transition-colors">
            <span>📖</span> Learning Center
          </button>
        </div>
      </div>

      {/* Right: tab content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-900" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'setup' && <SetupWizardFull />}
        {tab === 'accessibility' && <AccessibilitySettings />}
        {tab === 'settings' && <Settings />}
        {tab === 'policies' && <Policies />}
        {tab === 'integrations' && <IntegrationsTab />}
        {tab === 'extensions' && (
          <ExtensionManager onPendingRestartChange={handlePendingRestartChange} />
        )}
        {tab === 'memory' && <Memory />}
        {tab === 'agents' && <Agents />}
        {tab === 'skills' && <SkillsManagement />}
        {tab === 'wizard' && <WizardSettings />}
        {tab === 'workspaces' && <Workspaces />}
        {tab === 'team' && <TeamHub />}
        {tab === 'scheduler' && <ScheduledTasks />}
        {tab === 'branding' && <WhiteLabel />}
      </div>
    </div>
  )
}
