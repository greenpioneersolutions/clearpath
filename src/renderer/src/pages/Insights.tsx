import { useState } from 'react'
import Analytics from './Analytics'
import Compliance from './Compliance'
import UsageAnalytics from './UsageAnalytics'

type Tab = 'analytics' | 'compliance' | 'usage'

const TABS: { key: Tab; label: string }[] = [
  { key: 'analytics', label: 'Analytics' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'usage', label: 'Usage' },
]

export default function Insights(): JSX.Element {
  const [tab, setTab] = useState<Tab>('analytics')

  return (
    <div className="p-6 space-y-6">
      {/* Tab bar */}
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
      {tab === 'analytics' && <Analytics />}
      {tab === 'compliance' && <Compliance />}
      {tab === 'usage' && <UsageAnalytics />}
    </div>
  )
}
