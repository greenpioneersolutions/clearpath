/**
 * SDK Example — Main App Component
 *
 * Renders a tabbed interface where each tab exercises a different SDK namespace.
 * Uses inline styles since the sandboxed iframe does not have Tailwind.
 */

import React, { useState } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import { OverviewTab } from './components/OverviewTab'
import { StorageTab } from './components/StorageTab'
import { NotificationsTab } from './components/NotificationsTab'
import { EnvironmentTab } from './components/EnvironmentTab'
import { HttpTab } from './components/HttpTab'
import { ThemeTab } from './components/ThemeTab'
import { SessionsTab } from './components/SessionsTab'
import { CostTab } from './components/CostTab'
import { FeatureFlagsTab } from './components/FeatureFlagsTab'
import { LocalModelsTab } from './components/LocalModelsTab'
import { ContextTab } from './components/ContextTab'
import { GitHubTab } from './components/GitHubTab'
import { EventsTab } from './components/EventsTab'
import { NavigationTab } from './components/NavigationTab'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'storage', label: 'Storage' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'environment', label: 'Environment' },
  { id: 'http', label: 'HTTP' },
  { id: 'theme', label: 'Theme' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'cost', label: 'Cost' },
  { id: 'featureFlags', label: 'Feature Flags' },
  { id: 'localModels', label: 'Local Models' },
  { id: 'context', label: 'Context' },
  { id: 'github', label: 'GitHub' },
  { id: 'events', label: 'Events' },
  { id: 'navigation', label: 'Navigation' },
] as const

type TabId = (typeof TABS)[number]['id']

const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
  overview: OverviewTab,
  storage: StorageTab,
  notifications: NotificationsTab,
  environment: EnvironmentTab,
  http: HttpTab,
  theme: ThemeTab,
  sessions: SessionsTab,
  cost: CostTab,
  featureFlags: FeatureFlagsTab,
  localModels: LocalModelsTab,
  context: ContextTab,
  github: GitHubTab,
  events: EventsTab,
  navigation: NavigationTab,
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#e2e8f0',
    backgroundColor: '#0f172a',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#f8fafc',
    margin: 0,
  },
  badge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '9999px',
    backgroundColor: '#5B4FC4',
    color: '#fff',
  },
  tabBar: {
    display: 'flex',
    overflowX: 'auto' as const,
    borderBottom: '1px solid #1e293b',
    padding: '0 12px',
    gap: '0',
    scrollbarWidth: 'thin' as const,
  },
  tab: (active: boolean) => ({
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    color: active ? '#7F77DD' : '#94a3b8',
    borderBottom: active ? '2px solid #7F77DD' : '2px solid transparent',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'color 0.15s, border-color 0.15s',
  }),
  content: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto' as const,
  },
}

export function App(): React.ReactElement {
  const sdk = useSDK()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const ActiveComponent = TAB_COMPONENTS[activeTab]

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>SDK Example Extension</h1>
        <span style={styles.badge}>v1.0.0</span>
        <span style={{ ...styles.badge, backgroundColor: '#1D9E75' }}>{sdk.extensionId}</span>
      </div>

      <div style={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={styles.tab(activeTab === tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        <ActiveComponent />
      </div>
    </div>
  )
}
