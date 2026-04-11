import { useState, useMemo } from 'react'
import Analytics from './Analytics'
import Compliance from './Compliance'
import UsageAnalytics from './UsageAnalytics'
import { useExtensions } from '../hooks/useExtensions'
import ExtensionHost from '../components/extensions/ExtensionHost'

type Tab = string

interface TabDef {
  key: string
  label: string
  type: 'builtin' | 'extension'
  extensionId?: string
}

const BUILTIN_TABS: TabDef[] = [
  { key: 'analytics', label: 'Analytics', type: 'builtin' },
  { key: 'compliance', label: 'Compliance', type: 'builtin' },
  { key: 'usage', label: 'Usage', type: 'builtin' },
]

export default function Insights(): JSX.Element {
  const [tab, setTab] = useState<Tab>('analytics')
  const { enabledExtensions } = useExtensions()

  // Build the full tab list: builtin + extension-contributed tabs
  const allTabs = useMemo(() => {
    const tabs: TabDef[] = [...BUILTIN_TABS]

    for (const ext of enabledExtensions) {
      const extTabs = ext.manifest.contributes?.tabs
      if (!extTabs) continue
      for (const t of extTabs) {
        if (t.page !== 'insights') continue
        tabs.push({
          key: `ext:${ext.manifest.id}:${t.id}`,
          label: t.label,
          type: 'extension',
          extensionId: ext.manifest.id,
        })
      }
    }

    return tabs
  }, [enabledExtensions])

  // Find the extension for the currently selected extension tab
  const activeExtension = useMemo(() => {
    if (!tab.startsWith('ext:')) return null
    const parts = tab.split(':')
    const extId = parts[1]
    return enabledExtensions.find((e) => e.manifest.id === extId) ?? null
  }, [tab, enabledExtensions])

  return (
    <div className="p-6 space-y-6">
      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {allTabs.map((t) => (
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

      {/* Extension tab content */}
      {activeExtension && (
        <div className="min-h-[400px]">
          <ExtensionHost
            extension={activeExtension}
            className="w-full h-full"
          />
        </div>
      )}
    </div>
  )
}
