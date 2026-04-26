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
import Tools from './Tools'

type Tab = 'setup' | 'accessibility' | 'settings' | 'policies' | 'tools' | 'memory' | 'agents' | 'skills' | 'wizard' | 'workspaces' | 'team' | 'scheduler' | 'branding'

type TabGroup = {
  heading: string
  collapsedByDefault?: boolean
  tabs: { key: Tab; label: string }[]
}

const TAB_GROUPS: TabGroup[] = [
  {
    heading: 'Getting Started',
    tabs: [
      { key: 'setup', label: 'Setup Wizard' },
      { key: 'accessibility', label: 'Accessibility' },
    ],
  },
  {
    heading: 'Your AI',
    tabs: [
      { key: 'agents', label: 'Prompts' },
      { key: 'skills', label: 'Playbooks' },
      { key: 'memory', label: 'Notes & Context' },
    ],
  },
  {
    heading: 'Session Defaults',
    tabs: [
      { key: 'settings', label: 'General' },
      { key: 'tools', label: 'Tools & Permissions' },
      { key: 'wizard', label: 'Session Wizard' },
    ],
  },
  {
    heading: 'Advanced',
    collapsedByDefault: true,
    tabs: [
      { key: 'policies', label: 'Policies' },
      { key: 'workspaces', label: 'Workspaces' },
      { key: 'team', label: 'Team Hub' },
      { key: 'scheduler', label: 'Scheduler' },
      { key: 'branding', label: 'Branding' },
    ],
  },
]

const ALL_TABS: { key: Tab; label: string }[] = TAB_GROUPS.flatMap((g) => g.tabs)

// ── Main Configure Component ─────────────────────────────────────────────────

export default function Configure(): JSX.Element {
  const [tab, setTab] = useState<Tab>('settings')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Track which collapsible groups are expanded (Advanced is collapsed by default)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(TAB_GROUPS.map((g) => [g.heading, !g.collapsedByDefault])),
  )

  useEffect(() => {
    const urlTab = searchParams.get('tab') as Tab | null
    if (urlTab && ALL_TABS.some(t => t.key === urlTab)) {
      setTab(urlTab)
      // Expand the group containing the deep-linked tab
      const owningGroup = TAB_GROUPS.find((g) => g.tabs.some((t) => t.key === urlTab))
      if (owningGroup) {
        setExpandedGroups((prev) => ({ ...prev, [owningGroup.heading]: true }))
      }
    }
  }, [searchParams])

  const toggleGroup = (heading: string) => {
    setExpandedGroups((prev) => ({ ...prev, [heading]: !prev[heading] }))
  }

  return (
    <div className="flex h-full">
      {/* Left: vertical grouped tab list */}
      <div className="w-52 flex-shrink-0 bg-gray-900 border-r border-gray-700 py-4 flex flex-col">
        <div className="flex-1 overflow-y-auto" role="tablist" aria-label="Configure sections">
          {TAB_GROUPS.map((group) => {
            const isExpanded = expandedGroups[group.heading]
            const isCollapsible = group.collapsedByDefault
            return (
              <div key={group.heading} className="mb-3">
                {isCollapsible ? (
                  <button
                    onClick={() => toggleGroup(group.heading)}
                    aria-expanded={isExpanded}
                    className="w-full flex items-center justify-between px-5 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <span>{group.heading}</span>
                    <svg
                      className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ) : (
                  <div className="px-5 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    {group.heading}
                  </div>
                )}
                {isExpanded && group.tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    role="tab"
                    aria-selected={tab === t.key}
                    id={`tab-${t.key}`}
                    className={`w-full text-left px-5 py-2 text-sm font-medium transition-colors ${
                      tab === t.key
                        ? 'bg-gray-800 text-indigo-400 border-r-2 border-indigo-500'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )
          })}
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
        {tab === 'tools' && <Tools />}
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
