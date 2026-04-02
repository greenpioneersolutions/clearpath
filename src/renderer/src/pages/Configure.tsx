import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Settings from './Settings'
import Policies from './Policies'
import Memory from './Memory'
import Workspaces from './Workspaces'
import TeamHub from './TeamHub'
import ScheduledTasks from './ScheduledTasks'
import SkillsManagement from './SkillsManagement'

type Tab = 'settings' | 'policies' | 'integrations' | 'memory' | 'skills' | 'workspaces' | 'team' | 'scheduler'

const TABS: { key: Tab; label: string }[] = [
  { key: 'settings', label: 'Settings' },
  { key: 'policies', label: 'Policies' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'memory', label: 'Memory' },
  { key: 'skills', label: 'Skills' },
  { key: 'workspaces', label: 'Workspaces' },
  { key: 'team', label: 'Team Hub' },
  { key: 'scheduler', label: 'Scheduler' },
]

export default function Configure(): JSX.Element {
  const [tab, setTab] = useState<Tab>('settings')
  const navigate = useNavigate()

  return (
    <div className="flex h-full">
      {/* Left: vertical tab list */}
      <div className="w-44 flex-shrink-0 bg-gray-50 border-r border-gray-200 py-4 flex flex-col">
        <div className="flex-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
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
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'settings' && <Settings />}
        {tab === 'policies' && <Policies />}
        {tab === 'integrations' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
              <p className="text-sm text-gray-500 mt-0.5">Connect external services</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {['GitHub', 'Jira', 'Confluence', 'ServiceNow'].map((name) => (
                <div key={name} className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center">
                  <h3 className="text-sm font-medium text-gray-700">{name}</h3>
                  <p className="text-xs text-gray-400 mt-1">Coming Soon</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'memory' && <Memory />}
        {tab === 'skills' && <SkillsManagement />}
        {tab === 'workspaces' && <Workspaces />}
        {tab === 'team' && <TeamHub />}
        {tab === 'scheduler' && <ScheduledTasks />}
      </div>
    </div>
  )
}
