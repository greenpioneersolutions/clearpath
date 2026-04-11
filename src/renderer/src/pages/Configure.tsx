import { useState, useEffect } from 'react'
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

  useEffect(() => {
    const urlTab = searchParams.get('tab') as Tab | null
    if (urlTab && TABS.some(t => t.key === urlTab)) setTab(urlTab)
  }, [searchParams])

  return (
    <div className="flex h-full">
      {/* Left: vertical tab list */}
      <div className="w-44 flex-shrink-0 bg-gray-50 border-r border-gray-200 py-4 flex flex-col">
        <div className="flex-1" role="tablist" aria-label="Configure sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              role="tab"
              aria-selected={tab === t.key}
              id={`tab-${t.key}`}
              className={`w-full text-left px-5 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-white text-indigo-600 border-r-2 border-indigo-600'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Buried learn link at bottom — safety net for completed users */}
        <div className="px-5 py-3 border-t border-gray-200">
          <button onClick={() => navigate('/learn')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 transition-colors">
            <span>📖</span> Learning Center
          </button>
        </div>
      </div>

      {/* Right: tab content */}
      <div className="flex-1 overflow-y-auto p-6" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'setup' && <SetupWizardFull />}
        {tab === 'accessibility' && <AccessibilitySettings />}
        {tab === 'settings' && <Settings />}
        {tab === 'policies' && <Policies />}
        {tab === 'integrations' && <IntegrationsTab />}
        {tab === 'extensions' && <ExtensionManager />}
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
