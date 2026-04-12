import { Component, type ReactNode } from 'react'
import { PrScoresProvider, usePrScores, type PrScoresTab } from '../contexts/PrScoresContext'
import RepositoriesTab from '../components/pr-scores/RepositoriesTab'
import ScoresTab from '../components/pr-scores/ScoresTab'
import DashboardTab from '../components/pr-scores/DashboardTab'
import AuthorsTab from '../components/pr-scores/AuthorsTab'
import SettingsTab from '../components/pr-scores/SettingsTab'

const TABS: { key: PrScoresTab; label: string }[] = [
  { key: 'repositories', label: 'Repositories' },
  { key: 'scores', label: 'Scores' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'authors', label: 'Authors' },
  { key: 'settings', label: 'Settings' },
]

/** Error boundary that catches crashes in individual tabs and shows a recovery UI. */
class TabErrorBoundary extends Component<
  { tabName: string; onReset: () => void; children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { tabName: string; onReset: () => void; children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            {this.props.tabName} encountered an error
          </h2>
          <p className="text-sm text-gray-500 mt-1 max-w-md">{this.state.error}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: '' })
              this.props.onReset()
            }}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function PrScoresContent(): JSX.Element {
  const { activeTab, setActiveTab, githubConnected } = usePrScores()

  // ── GitHub not connected prompt ─────────────────────────────────────────

  if (!githubConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PR Scores</h1>
          <p className="text-sm text-gray-500 mt-0.5">Score and analyze your pull requests</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Connect GitHub</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            PR Scores requires a GitHub connection to fetch repositories and pull requests.
            Connect your account in Settings &gt; Integrations.
          </p>
          <button
            onClick={() => window.electronAPI.invoke('navigate:configure-integrations')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go to Integrations
          </button>
        </div>
      </div>
    )
  }

  // ── Main layout with tabs ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PR Scores</h1>
          <p className="text-sm text-gray-500 mt-0.5">Score and analyze your pull requests</p>
        </div>
        <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
          Experimental
        </span>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content — each wrapped in an error boundary */}
      {activeTab === 'repositories' && (
        <TabErrorBoundary tabName="Repositories" onReset={() => setActiveTab('repositories')}>
          <RepositoriesTab />
        </TabErrorBoundary>
      )}
      {activeTab === 'scores' && (
        <TabErrorBoundary tabName="Scores" onReset={() => setActiveTab('scores')}>
          <ScoresTab />
        </TabErrorBoundary>
      )}
      {activeTab === 'dashboard' && (
        <TabErrorBoundary tabName="Dashboard" onReset={() => setActiveTab('dashboard')}>
          <DashboardTab />
        </TabErrorBoundary>
      )}
      {activeTab === 'authors' && (
        <TabErrorBoundary tabName="Authors" onReset={() => setActiveTab('authors')}>
          <AuthorsTab />
        </TabErrorBoundary>
      )}
      {activeTab === 'settings' && (
        <TabErrorBoundary tabName="Settings" onReset={() => setActiveTab('settings')}>
          <SettingsTab />
        </TabErrorBoundary>
      )}
    </div>
  )
}

export default function PrScores(): JSX.Element {
  return (
    <PrScoresProvider>
      <PrScoresContent />
    </PrScoresProvider>
  )
}
