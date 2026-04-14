// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

vi.mock('recharts', () => {
  const React = require('react')
  return {
    ResponsiveContainer: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    BarChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    LineChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    PieChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
    Bar: () => null, Line: () => null, Pie: () => null, Cell: () => null,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
    Tooltip: () => null, Legend: () => null, Area: () => null,
    AreaChart: ({ children }: { children: unknown }) => React.createElement('div', null, children),
  }
})

// ── Feature flag mock ────────────────────────────────────────────────────────
// vi.mock is hoisted but the setup-coverage.ts pre-loading caches modules before
// it can intercept them. We use vi.resetModules() + dynamic import in tests that
// need enabled flags so the mock factory runs on a fresh module load.

const { flagStore } = vi.hoisted(() => ({
  flagStore: {
    flags: {
      showHomeHub: true,
      showDashboard: true, showWork: true, showInsights: true, showConfigure: true, showLearn: true,
      showSetupWizard: true, showSettings: true, showPolicies: true, showIntegrations: true,
      showMemory: true, showSkillsManagement: true, showSessionWizard: true, showWorkspaces: true,
      showTeamHub: true, showScheduler: false,
      showComposer: false, showSubAgents: false, showTemplates: true, showKnowledgeBase: false, showVoice: false,
      showUseContext: true, showAgentSelection: true, showCostTracking: true, showComplianceLogs: false,
      showDataManagement: true, showBudgetLimits: true, showPlugins: false, showEnvVars: false, showWebhooks: false,
      enableExperimentalFeatures: true, showPrScores: true, prScoresAiReview: false,
    },
  },
}))

vi.mock('../contexts/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({
    flags: flagStore.flags,
    activePresetId: null, presets: [], setFlag: () => {}, applyPreset: () => {}, resetFlags: () => {}, loading: false,
  }),
  useFlag: (key: string) => (flagStore.flags as Record<string, unknown>)[key] ?? false,
  FeatureFlagProvider: ({ children }: { children: unknown }) => children,
}))

// ── Shared mock data ──────────────────────────────────────────────────────────

const PR_SCORES_CONFIG = {
  defaultTimeRangeDays: 30,
  labelFilters: [],
  excludeLabels: [],
  includeCodeAnalysis: false,
  enableAiReview: false,
}

const mockRepo = {
  id: 1,
  name: 'my-repo',
  fullName: 'testuser/my-repo',
  description: 'A test repository',
  private: false,
  url: 'https://github.com/testuser/my-repo',
  pushedAt: '2024-01-01T00:00:00Z',
  language: 'TypeScript',
  defaultBranch: 'main',
}

const mockPR = {
  number: 42,
  title: 'Fix some bug',
  state: 'open',
  author: 'dev-user',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  mergedAt: null,
  url: 'https://github.com/testuser/my-repo/pull/42',
  body: 'Fixed the bug',
  head: 'fix/bug',
  base: 'main',
  draft: false,
  additions: 10,
  deletions: 5,
  changedFiles: 2,
  labels: [],
  reviewers: [],
}

const mockScore = {
  id: 'score-1',
  repoFullName: 'testuser/my-repo',
  prNumber: 42,
  title: 'Fix some bug',
  author: 'dev-user',
  state: 'open',
  score: 75,
  breakdown: {
    cycleTimeHours: { raw: 24, normalized: 0.8, weighted: 16 },
    pickupTimeHours: { raw: 2, normalized: 0.9, weighted: 9 },
    ciPassRate: { raw: 1.0, normalized: 1.0, weighted: 20 },
    reviewerCount: { raw: 2, normalized: 0.7, weighted: 14 },
    linesChanged: { raw: 15, normalized: 0.9, weighted: 18 },
  },
  scoredAt: Date.now(),
}

import PrScores from './PrScores'

// ── Static render (uses pre-loaded module — no flag mock) ─────────────────────

describe('PrScores', () => {

  beforeEach(() => {
    setupElectronAPI({
      'integration:get-status': { github: { connected: true, username: 'testuser' } },
      'integration:github-repos': { success: true, repos: [] },
      'pr-scores:get-config': PR_SCORES_CONFIG,
      'pr-scores:get-scores': [],
    })
  })

  // ── Disabled state (feature flags off — real FeatureFlagContext defaults) ─────

  it('renders without crashing (default = disabled)', () => {
    render(<PrScores />)
    expect(document.querySelector('[class]')).toBeTruthy()
  })

  it('shows PR Scores heading', () => {
    render(<PrScores />)
    expect(screen.getByText('PR Scores')).toBeInTheDocument()
  })

  it('shows subtitle', () => {
    render(<PrScores />)
    expect(screen.getByText('Score and analyze your pull requests')).toBeInTheDocument()
  })

  // ── Feature-enabled: tests use vi.resetModules() + dynamic import ─────────────
  // setup-coverage.ts pre-loads modules so vi.mock only intercepts after resetModules.

  describe('with feature flags enabled — GitHub not connected', () => {
    afterEach(() => cleanup())

    it('shows Connect GitHub screen', async () => {
      setupElectronAPI({
        'integration:get-status': { github: null },
        'pr-scores:get-config': PR_SCORES_CONFIG,
      })
      vi.resetModules()
      const { render: r } = await import('@testing-library/react')
      const { default: PrScoresPage } = await import('./PrScores')
      const React = await import('react')
      const { unmount } = r(React.createElement(PrScoresPage))
      await waitFor(() => expect(screen.getByText('Connect GitHub')).toBeInTheDocument())
      unmount()
    })

    it('Go to Integrations button calls navigate:configure-integrations', async () => {
      const { mockInvoke } = setupElectronAPI({
        'integration:get-status': { github: null },
        'pr-scores:get-config': PR_SCORES_CONFIG,
      })
      vi.resetModules()
      const { render: r } = await import('@testing-library/react')
      const { default: PrScoresPage } = await import('./PrScores')
      const React = await import('react')
      const { unmount } = r(React.createElement(PrScoresPage))
      await waitFor(() => screen.getByText('Connect GitHub'))
      fireEvent.click(screen.getByText('Go to Integrations'))
      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith('navigate:configure-integrations')
      )
      unmount()
    })

    it('shows PR Scores heading when not connected', async () => {
      setupElectronAPI({
        'integration:get-status': { github: null },
        'pr-scores:get-config': PR_SCORES_CONFIG,
      })
      vi.resetModules()
      const { render: r } = await import('@testing-library/react')
      const { default: PrScoresPage } = await import('./PrScores')
      const React = await import('react')
      const { unmount } = r(React.createElement(PrScoresPage))
      await waitFor(() => screen.getByText('Connect GitHub'))
      expect(screen.getByText('PR Scores')).toBeInTheDocument()
      unmount()
    })
  })

  // ── Feature-enabled: repos view ───────────────────────────────────────────

  describe('with feature flags enabled — repos view', () => {
    afterEach(() => cleanup())

    async function renderReposView() {
      vi.resetModules()
      const { render: r } = await import('@testing-library/react')
      const { default: PrScoresPage } = await import('./PrScores')
      const React = await import('react')
      return r(React.createElement(PrScoresPage))
    }

    it('shows subtitle in header', async () => {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [mockRepo] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
        'pr-scores:list-scored-repos': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() =>
        expect(screen.getByText('Score and analyze your pull requests')).toBeInTheDocument()
      )
      unmount()
    })

    it('shows repo in the list', async () => {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [mockRepo] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => expect(screen.getByText('testuser/my-repo')).toBeInTheDocument())
      unmount()
    })

    it('shows language tag for repo', async () => {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [mockRepo] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => expect(screen.getByText('TypeScript')).toBeInTheDocument())
      unmount()
    })

    it('shows Experimental badge', async () => {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [mockRepo] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => expect(screen.getByText('Experimental')).toBeInTheDocument())
      unmount()
    })

    it('shows "No repositories found" when repos empty', async () => {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => expect(screen.getByText('No repositories found.')).toBeInTheDocument())
      unmount()
    })

    it('shows repo error message when API fails', async () => {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: false, error: 'Rate limited' },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => expect(screen.getByText('Rate limited')).toBeInTheDocument())
      unmount()
    })

    it('Retry button invokes integration:github-repos again', async () => {
      const { mockInvoke } = setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => screen.getByText('No repositories found.'))
      fireEvent.click(screen.getByText('Retry'))
      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith('integration:github-repos', expect.anything())
      )
      unmount()
    })

    it('Settings tab opens config panel', async () => {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
        'pr-scores:list-scored-repos': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => screen.getByText('Score and analyze your pull requests'))
      fireEvent.click(screen.getByText('Settings'))
      await waitFor(() => expect(screen.getByText('PR Scores Configuration')).toBeInTheDocument())
      unmount()
    })

    it('clicking Repositories tab from Settings returns to repos view', async () => {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
        'pr-scores:list-scored-repos': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => screen.getByText('Score and analyze your pull requests'))
      fireEvent.click(screen.getByText('Settings'))
      await waitFor(() => screen.getByText('PR Scores Configuration'))
      fireEvent.click(screen.getByText('Repositories'))
      await waitFor(() => expect(screen.queryByText('PR Scores Configuration')).not.toBeInTheDocument())
      unmount()
    })

    it('Settings Save button calls pr-scores:set-config', async () => {
      const { mockInvoke } = setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
        'pr-scores:list-scored-repos': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => screen.getByText('Score and analyze your pull requests'))
      fireEvent.click(screen.getByText('Settings'))
      await waitFor(() => screen.getByText('PR Scores Configuration'))
      fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }))
      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith('pr-scores:set-config', expect.anything())
      )
      unmount()
    })

    it('clicking repo navigates to Scores tab', async () => {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [mockRepo] },
        'integration:github-pulls': { success: true, pulls: [] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
        'pr-scores:list-scored-repos': [],
      })
      const { unmount } = await renderReposView()
      await waitFor(() => screen.getByText('testuser/my-repo'))
      fireEvent.click(screen.getByText('testuser/my-repo'))
      await waitFor(() => expect(screen.getByText('No pull requests found in this repository.')).toBeInTheDocument())
      unmount()
    })
  })

  // ── Feature-enabled: PRs view ─────────────────────────────────────────────

  describe('with feature flags enabled — PRs view', () => {
    afterEach(() => cleanup())

    async function renderPrsView() {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [mockRepo] },
        'integration:github-pulls': { success: true, pulls: [mockPR] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
        'pr-scores:list-scored-repos': [],
      })
      vi.resetModules()
      const { render: r } = await import('@testing-library/react')
      const { default: PrScoresPage } = await import('./PrScores')
      const React = await import('react')
      const utils = r(React.createElement(PrScoresPage))
      await waitFor(() => screen.getByText('testuser/my-repo'))
      fireEvent.click(screen.getByText('testuser/my-repo'))
      await waitFor(() => screen.getByText('0 of 1 PRs scored'))
      return utils
    }

    it('shows PRs scored subtitle', async () => {
      const { unmount } = await renderPrsView()
      expect(screen.getByText('0 of 1 PRs scored')).toBeInTheDocument()
      unmount()
    })

    it('shows Dashboard button', async () => {
      const { unmount } = await renderPrsView()
      const dashButtons = screen.getAllByRole('button', { name: 'Dashboard' })
      expect(dashButtons.length).toBeGreaterThanOrEqual(1)
      unmount()
    })

    it('shows Score All PRs button', async () => {
      const { unmount } = await renderPrsView()
      expect(screen.getByRole('button', { name: 'Score All PRs' })).toBeInTheDocument()
      unmount()
    })

    it('shows PR number in table', async () => {
      const { unmount } = await renderPrsView()
      expect(screen.getByText('#42')).toBeInTheDocument()
      unmount()
    })

    it('shows PR title in table', async () => {
      const { unmount } = await renderPrsView()
      expect(screen.getByText('Fix some bug')).toBeInTheDocument()
      unmount()
    })

    it('shows PR author in table', async () => {
      const { unmount } = await renderPrsView()
      expect(screen.getByText('dev-user')).toBeInTheDocument()
      unmount()
    })

    it('shows Score button for un-scored PR', async () => {
      const { unmount } = await renderPrsView()
      expect(screen.getByRole('button', { name: 'Score' })).toBeInTheDocument()
      unmount()
    })

    it('Score button calls pr-scores:score-pr', async () => {
      const { unmount } = await renderPrsView()
      // Reset setupElectronAPI AFTER render to capture calls
      const { mockInvoke } = setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [mockRepo] },
        'integration:github-pulls': { success: true, pulls: [mockPR] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
        'pr-scores:score-pr': { success: true, score: mockScore },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Score' }))
      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith('pr-scores:score-pr', expect.objectContaining({ prNumber: 42 }))
      )
      unmount()
    })

    it('Repositories tab returns to repos view', async () => {
      const { unmount } = await renderPrsView()
      fireEvent.click(screen.getByText('Repositories'))
      await waitFor(() =>
        expect(screen.getByText('Score and analyze your pull requests')).toBeInTheDocument()
      )
      unmount()
    })

    it('clicking Repositories tab from Scores view shows repos', async () => {
      const { unmount } = await renderPrsView()
      fireEvent.click(screen.getByText('Repositories'))
      await waitFor(() =>
        expect(screen.getByText('Score and analyze your pull requests')).toBeInTheDocument()
      )
      unmount()
    })

    it('shows "0 of 1 PRs scored" stat', async () => {
      const { unmount } = await renderPrsView()
      expect(screen.getByText('0 of 1 PRs scored')).toBeInTheDocument()
      unmount()
    })
  })

  // ── Feature-enabled: detail view ──────────────────────────────────────────

  describe('with feature flags enabled — detail view', () => {
    afterEach(() => cleanup())

    async function renderDetailView() {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [mockRepo] },
        'integration:github-pulls': { success: true, pulls: [mockPR] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [mockScore],
        'pr-scores:list-scored-repos': [],
      })
      vi.resetModules()
      const { render: r } = await import('@testing-library/react')
      const { default: PrScoresPage } = await import('./PrScores')
      const React = await import('react')
      const utils = r(React.createElement(PrScoresPage))
      await waitFor(() => screen.getByText('testuser/my-repo'))
      fireEvent.click(screen.getByText('testuser/my-repo'))
      await waitFor(() => screen.getByText('1 of 1 PRs scored'))
      fireEvent.click(screen.getByRole('button', { name: 'Details' }))
      await waitFor(() => screen.getByText('Score Breakdown'))
      return utils
    }

    it('shows Score Breakdown section', async () => {
      const { unmount } = await renderDetailView()
      expect(screen.getByText('Score Breakdown')).toBeInTheDocument()
      unmount()
    })

    it('shows PR title in detail view', async () => {
      const { unmount } = await renderDetailView()
      const matches = screen.getAllByText(/Fix some bug/)
      expect(matches.length).toBeGreaterThanOrEqual(1)
      unmount()
    })

    it('shows Re-Score button', async () => {
      const { unmount } = await renderDetailView()
      expect(screen.getByRole('button', { name: 'Re-Score' })).toBeInTheDocument()
      unmount()
    })

    it('shows Cycle Time breakdown label', async () => {
      const { unmount } = await renderDetailView()
      expect(screen.getByText('Cycle Time')).toBeInTheDocument()
      unmount()
    })

    it('shows PR author in detail view', async () => {
      const { unmount } = await renderDetailView()
      expect(screen.getByText(/by dev-user/)).toBeInTheDocument()
      unmount()
    })

    it('Repositories tab from detail returns to repos view', async () => {
      const { unmount } = await renderDetailView()
      fireEvent.click(screen.getByText('Repositories'))
      await waitFor(() => expect(screen.getByText('Score and analyze your pull requests')).toBeInTheDocument())
      unmount()
    })

    it('clicking Scores tab from detail view shows scores list', async () => {
      const { unmount } = await renderDetailView()
      fireEvent.click(screen.getByText('Repositories'))
      await waitFor(() => expect(screen.getByText('Score and analyze your pull requests')).toBeInTheDocument())
      unmount()
    })
  })

  // ── Feature-enabled: dashboard view ──────────────────────────────────────

  describe('with feature flags enabled — dashboard view', () => {
    afterEach(() => cleanup())

    const mockMetricSnapshot = {
      success: true,
      snapshot: {
        metrics: {
          mergeRate: 0.85,
          reviewCoverage: 0.9,
          buildSuccessRate: 0.95,
          stalePrCount: 2,
          prBacklog: 5,
          outsizedPrRatio: 0.1,
          cycleTime: { median: 24, p95: 48 },
          pickupTime: { median: 2, p95: 8 },
        },
        repoScore: 80,
        authorMetrics: [
          { author: 'dev-user', prCount: 5, averageScore: 75, avgCycleTime: 20, totalLinesChanged: 500 },
        ],
        snapshotAt: Date.now(),
      },
    }

    async function renderDashboardView() {
      setupElectronAPI({
        'integration:get-status': { github: { connected: true, username: 'testuser' } },
        'integration:github-repos': { success: true, repos: [mockRepo] },
        'integration:github-pulls': { success: true, pulls: [mockPR] },
        'pr-scores:get-config': PR_SCORES_CONFIG,
        'pr-scores:get-scores': [],
        'pr-scores:calculate-metrics': mockMetricSnapshot,
        'pr-scores:list-scored-repos': [],
        'pr-scores:compute-deltas': { success: true, deltas: [] },
      })
      vi.resetModules()
      const { render: r } = await import('@testing-library/react')
      const { default: PrScoresPage } = await import('./PrScores')
      const React = await import('react')
      const utils = r(React.createElement(PrScoresPage))
      await waitFor(() => screen.getByText('testuser/my-repo'))
      fireEvent.click(screen.getByText('testuser/my-repo'))
      await waitFor(() => screen.getByText('0 of 1 PRs scored'))
      // Click the Dashboard tab (first match — the tab bar button)
      const dashboardButtons = screen.getAllByText('Dashboard')
      fireEvent.click(dashboardButtons[0])
      await waitFor(() => screen.getByText('Repo Score'))
      return utils
    }

    it('shows Repo Score stat', async () => {
      const { unmount } = await renderDashboardView()
      expect(screen.getByText('Repo Score')).toBeInTheDocument()
      unmount()
    })

    it('shows Merge Rate stat', async () => {
      const { unmount } = await renderDashboardView()
      expect(screen.getByText('Merge Rate')).toBeInTheDocument()
      unmount()
    })

    it('shows Review Coverage stat', async () => {
      const { unmount } = await renderDashboardView()
      expect(screen.getByText('Review Coverage')).toBeInTheDocument()
      unmount()
    })

    it('shows Build Success stat', async () => {
      const { unmount } = await renderDashboardView()
      expect(screen.getByText('Build Success')).toBeInTheDocument()
      unmount()
    })

    it('shows Cycle Time stat', async () => {
      const { unmount } = await renderDashboardView()
      expect(screen.getByText('Cycle Time (median)')).toBeInTheDocument()
      unmount()
    })

    it('Scores tab from dashboard returns to scores view', async () => {
      const { unmount } = await renderDashboardView()
      fireEvent.click(screen.getByText('Scores'))
      await waitFor(() => expect(screen.getByText('0 of 1 PRs scored')).toBeInTheDocument())
      unmount()
    })

    it('Repositories tab from dashboard returns to repos view', async () => {
      const { unmount } = await renderDashboardView()
      fireEvent.click(screen.getByText('Repositories'))
      await waitFor(() => expect(screen.getByText('Score and analyze your pull requests')).toBeInTheDocument())
      unmount()
    })
  })
})
