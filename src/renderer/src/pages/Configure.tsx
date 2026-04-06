import { useState, useEffect, useCallback } from 'react'
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
import { useFeatureFlags } from '../contexts/FeatureFlagContext'

type Tab = 'setup' | 'accessibility' | 'settings' | 'policies' | 'integrations' | 'memory' | 'agents' | 'skills' | 'wizard' | 'workspaces' | 'team' | 'scheduler' | 'branding'

const TABS: { key: Tab; label: string }[] = [
  { key: 'setup', label: 'Setup Wizard' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'settings', label: 'Settings' },
  { key: 'policies', label: 'Policies' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'memory', label: 'Memory' },
  { key: 'agents', label: 'Agents' },
  { key: 'skills', label: 'Skills' },
  { key: 'wizard', label: 'Session Wizard' },
  { key: 'workspaces', label: 'Workspaces' },
  { key: 'team', label: 'Team Hub' },
  { key: 'scheduler', label: 'Scheduler' },
  { key: 'branding', label: 'White Label' },
]

// ── Integrations Tab ─────────────────────────────────────────────────────────

interface GitHubStatus {
  connected: boolean
  username: string
  connectedAt: number
}

function IntegrationsTab(): JSX.Element {
  const { flags, setFlag } = useFeatureFlags()
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null)
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)

  const loadStatus = useCallback(async () => {
    const status = await window.electronAPI.invoke('integration:get-status') as { github: GitHubStatus | null }
    setGithubStatus(status.github)
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  const handleConnect = async () => {
    if (!token.trim()) { setError('Please enter a token'); return }
    setConnecting(true)
    setError('')
    const result = await window.electronAPI.invoke('integration:github-connect', { token: token.trim() }) as { success: boolean; username?: string; error?: string }
    setConnecting(false)
    if (result.success) {
      setToken('')
      setShowTokenInput(false)
      void loadStatus()
    } else {
      setError(result.error ?? 'Connection failed')
    }
  }

  const handleDisconnect = async () => {
    await window.electronAPI.invoke('integration:github-disconnect')
    setGithubStatus(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-500 mt-0.5">Connect external services to pull data into your AI sessions</p>
      </div>

      {/* GitHub */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">GitHub</h3>
              <p className="text-xs text-gray-500">Pull requests, issues, and repository data</p>
            </div>
          </div>
          {githubStatus?.connected ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-xs text-gray-600">Connected as <strong>{githubStatus.username}</strong></span>
              </div>
              <button onClick={() => void handleDisconnect()}
                className="text-xs text-red-500 hover:text-red-400 transition-colors">Disconnect</button>
            </div>
          ) : (
            <span className="text-xs text-gray-400">Not connected</span>
          )}
        </div>

        <div className="px-5 py-4">
          {githubStatus?.connected ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                GitHub is connected. You can now reference pull requests and issues in your Work sessions.
                Try asking: <em className="text-gray-800">"Pull my recent PRs"</em> or <em className="text-gray-800">"Show open issues in owner/repo"</em>
              </p>
              <div className="text-xs text-gray-400">
                Connected {new Date(githubStatus.connectedAt).toLocaleDateString()} · Data is fetched on-demand, nothing is cached or synced automatically
              </div>

              {/* Experimental: PR Scores toggle */}
              {flags.enableExperimentalFeatures && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">PR Scores</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Experimental</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">Score and analyze pull requests with 0-100 ratings</p>
                    </div>
                    <button
                      onClick={() => setFlag('showPrScores', !flags.showPrScores)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        flags.showPrScores ? 'bg-indigo-600' : 'bg-gray-300'
                      }`}
                      role="switch"
                      aria-checked={flags.showPrScores}
                      aria-label="Toggle PR Scores"
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        flags.showPrScores ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : showTokenInput ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Enter a GitHub Personal Access Token (PAT) with <code className="bg-gray-100 px-1 rounded text-xs">repo</code> scope.
                Create one at <span className="text-indigo-600">github.com → Settings → Developer settings → Personal access tokens</span>.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  id="github-token-input"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  aria-label="GitHub personal access token"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  autoFocus
                />
                <button
                  onClick={() => void handleConnect()}
                  disabled={connecting}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >{connecting ? 'Connecting...' : 'Connect'}</button>
                <button
                  onClick={() => { setShowTokenInput(false); setError(''); setToken('') }}
                  className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >Cancel</button>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Connect GitHub to pull PRs, issues, and repo data directly into your AI sessions.
                The AI can review PRs, summarize issues, and work with real project context.
              </p>
              <button
                onClick={() => setShowTokenInput(true)}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
              >Connect GitHub</button>
            </div>
          )}
        </div>
      </div>

      {/* Placeholder integrations */}
      <div className="grid grid-cols-3 gap-4">
        {['Jira', 'Confluence', 'ServiceNow'].map((name) => (
          <div key={name} className="bg-white border border-dashed border-gray-300 rounded-xl p-5 text-center">
            <h3 className="text-sm font-medium text-gray-700">{name}</h3>
            <p className="text-xs text-gray-400 mt-1">Coming Soon</p>
          </div>
        ))}
      </div>
    </div>
  )
}

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
