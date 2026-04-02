import { useState, useEffect } from 'react'
import ConfigBundlePanel from '../components/team/ConfigBundlePanel'
import SharedFolderSync from '../components/team/SharedFolderSync'
import SetupWizard from '../components/team/SetupWizard'
import AgentMarketplace from '../components/team/AgentMarketplace'
import ActivityFeed from '../components/team/ActivityFeed'

type Tab = 'bundle' | 'sync' | 'wizard' | 'marketplace' | 'activity'

const TABS: { key: Tab; label: string }[] = [
  { key: 'bundle', label: 'Config Bundle' },
  { key: 'sync', label: 'Shared Folder' },
  { key: 'wizard', label: 'Setup Wizard' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'activity', label: 'Activity' },
]

export default function TeamHub(): JSX.Element {
  const [tab, setTab] = useState<Tab>('bundle')
  const [cwd, setCwd] = useState('.')

  useEffect(() => {
    void (window.electronAPI.invoke('app:get-cwd') as Promise<string>).then(setCwd)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Hub</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Share configurations, browse the marketplace, and onboard new team members
        </p>
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {tab === 'bundle' && <ConfigBundlePanel />}
        {tab === 'sync' && <SharedFolderSync />}
        {tab === 'wizard' && <SetupWizard />}
        {tab === 'marketplace' && <AgentMarketplace />}
        {tab === 'activity' && <ActivityFeed workingDirectory={cwd} />}
      </div>
    </div>
  )
}
