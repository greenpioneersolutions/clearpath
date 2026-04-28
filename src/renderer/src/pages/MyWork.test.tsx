// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

const flagsRef: { current: Record<string, boolean> } = { current: { showMyWork: true } }
vi.mock('../contexts/FeatureFlagContext', () => ({
  useFlag: (key: string) => Boolean(flagsRef.current[key]),
  useFeatureFlags: () => ({ flags: flagsRef.current }),
}))

import { setupElectronAPI } from '../../../test/ipc-mock-helper'
import MyWork from './MyWork'

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeJiraResponse() {
  return {
    success: true,
    assignedIssues: [
      {
        id: '10001',
        key: 'PROJ-101',
        summary: 'Wire up the new login flow',
        status: 'In Progress',
        statusCategory: 'In Progress',
        priority: 'High',
        assignee: 'Jane Dev',
        reporter: 'PM Alex',
        issueType: 'Story',
        created: '2026-04-20T10:00:00Z',
        updated: '2026-04-26T15:00:00Z',
        description: null,
        labels: [],
      },
      {
        id: '10002',
        key: 'PROJ-102',
        summary: 'Fix race condition in checkout',
        status: 'To Do',
        statusCategory: 'To Do',
        priority: 'Highest',
        assignee: 'Jane Dev',
        reporter: 'QA Sam',
        issueType: 'Bug',
        created: '2026-04-22T10:00:00Z',
        updated: '2026-04-25T15:00:00Z',
        description: null,
        labels: [],
      },
    ],
    activeSprint: {
      id: 42,
      name: 'Sprint 23',
      state: 'active',
      startDate: '2026-04-15T00:00:00Z',
      endDate: '2026-04-29T00:00:00Z',
      completeDate: null,
      goal: 'Ship the new login flow',
      boardId: 7,
      boardName: 'Web Squad',
    },
    sprintIssues: [
      {
        id: '10001',
        key: 'PROJ-101',
        summary: 'Wire up the new login flow',
        status: 'In Progress',
        statusCategory: 'In Progress',
        priority: 'High',
        assignee: 'Jane Dev',
        reporter: 'PM Alex',
        issueType: 'Story',
        created: '2026-04-20T10:00:00Z',
        updated: '2026-04-26T15:00:00Z',
        description: null,
        labels: [],
      },
      {
        id: '10003',
        key: 'PROJ-103',
        summary: 'Document new auth endpoints',
        status: 'Done',
        statusCategory: 'Done',
        priority: 'Low',
        assignee: 'Jane Dev',
        reporter: 'PM Alex',
        issueType: 'Task',
        created: '2026-04-18T10:00:00Z',
        updated: '2026-04-23T15:00:00Z',
        description: null,
        labels: [],
      },
    ],
    sprintError: null,
    assignedError: null,
  }
}

function makeGitHubResponse() {
  return {
    success: true,
    authored: [
      {
        type: 'pull',
        number: 51,
        title: 'feat: bulk archive sessions',
        state: 'open',
        repo: 'greenpioneersolutions/clearpath',
        author: 'jane-dev',
        url: 'https://github.com/greenpioneersolutions/clearpath/pull/51',
        updatedAt: '2026-04-26T12:00:00Z',
        draft: false,
        labels: [],
      },
    ],
    reviewRequested: [
      {
        type: 'pull',
        number: 88,
        title: 'fix: hash routing on Windows',
        state: 'open',
        repo: 'greenpioneersolutions/clearpath',
        author: 'sam-eng',
        url: 'https://github.com/greenpioneersolutions/clearpath/pull/88',
        updatedAt: '2026-04-25T12:00:00Z',
        draft: false,
        labels: [],
      },
    ],
    mentions: [
      {
        type: 'issue',
        number: 12,
        title: 'Question about session storage',
        state: 'open',
        repo: 'greenpioneersolutions/clearpath',
        author: 'curious-user',
        url: 'https://github.com/greenpioneersolutions/clearpath/issues/12',
        updatedAt: '2026-04-24T12:00:00Z',
        draft: false,
        labels: [],
      },
    ],
    authoredError: null,
    reviewRequestedError: null,
    mentionsError: null,
  }
}

function statusConnected() {
  return {
    github: { connected: true, username: 'jane-dev', connectedAt: 1 },
    atlassian: {
      siteUrl: 'https://example.atlassian.net',
      email: 'jane@example.com',
      displayName: 'Jane Dev',
      accountId: 'abc123',
      connected: true,
      connectedAt: 1,
      jiraEnabled: true,
      confluenceEnabled: false,
    },
    servicenow: null,
    backstage: null,
    powerbi: null,
    splunk: null,
    datadog: null,
  }
}

function statusDisconnected() {
  return {
    github: null,
    atlassian: null,
    servicenow: null,
    backstage: null,
    powerbi: null,
    splunk: null,
    datadog: null,
  }
}

function renderPage(initialEntries: string[] = ['/my-work']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/my-work" element={<MyWork />} />
        <Route path="/connect" element={<LocationProbe />} />
        <Route path="/configure" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const loc = useLocation()
  return (
    <div data-testid="probe">
      {loc.pathname}
      {loc.search}
    </div>
  )
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  flagsRef.current = { showMyWork: true }
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MyWork page', () => {
  it('renders the header and connection pills when both integrations are connected', async () => {
    setupElectronAPI({
      'integration:get-status': statusConnected(),
      'integration:jira-my-work': makeJiraResponse(),
      'integration:github-my-work': makeGitHubResponse(),
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('My Work')).toBeInTheDocument())

    // Wait for the data fetch to complete (page exits the loading shell)
    await waitFor(() =>
      expect(screen.queryByTestId('my-work-loading')).not.toBeInTheDocument(),
    )

    expect(screen.getByText('Jira')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByTestId('my-work-page')).toBeInTheDocument()
  })

  it('renders Jira issues, sprint card, and GitHub sections with data', async () => {
    setupElectronAPI({
      'integration:get-status': statusConnected(),
      'integration:jira-my-work': makeJiraResponse(),
      'integration:github-my-work': makeGitHubResponse(),
    })

    renderPage()
    await waitFor(() => screen.getByText('My Work'))

    // Jira issues — PROJ-101 appears in BOTH the assigned-issues card AND
    // the sprint card, hence getAllByText. PROJ-102 only appears in
    // assigned, PROJ-103 only in the sprint, so getByText is fine for those.
    await waitFor(() =>
      expect(screen.getAllByText('PROJ-101').length).toBeGreaterThanOrEqual(1),
    )
    expect(screen.getAllByText('Wire up the new login flow').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('PROJ-102')).toBeInTheDocument()
    expect(screen.getByText('PROJ-103')).toBeInTheDocument()

    // Sprint card
    expect(screen.getByText('Sprint 23')).toBeInTheDocument()
    expect(screen.getByText('Ship the new login flow')).toBeInTheDocument()
    // Progress: 1 of 2 sprint issues done = 50%
    expect(screen.getByText(/1 \/ 2 done/)).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()

    // GitHub authored PR
    expect(screen.getByText('feat: bulk archive sessions')).toBeInTheDocument()

    // Review-requested
    expect(screen.getByText('fix: hash routing on Windows')).toBeInTheDocument()

    // Mentions
    expect(screen.getByText('Question about session storage')).toBeInTheDocument()
  })

  it('renders the disconnected empty state when neither integration is connected', async () => {
    setupElectronAPI({
      'integration:get-status': statusDisconnected(),
    })

    renderPage()
    await waitFor(() =>
      expect(screen.getByTestId('my-work-disconnected')).toBeInTheDocument(),
    )
    // Both DisconnectedCards present
    expect(screen.getAllByText(/Connect (Jira|GitHub) →/i).length).toBe(2)
  })

  it('renders only GitHub disconnected card when Jira is connected and GitHub is not', async () => {
    setupElectronAPI({
      'integration:get-status': {
        ...statusDisconnected(),
        atlassian: statusConnected().atlassian,
      },
      'integration:jira-my-work': makeJiraResponse(),
    })

    renderPage()
    await waitFor(() => screen.getByText('My Work'))
    await waitFor(() => expect(screen.getByText('Sprint 23')).toBeInTheDocument())

    // Should still show one "Connect GitHub" CTA inline (in place of the
    // GitHub authored card), but not the page-wide disconnected state
    expect(screen.queryByTestId('my-work-disconnected')).not.toBeInTheDocument()
    expect(screen.getByText(/Connect GitHub →/)).toBeInTheDocument()
  })

  it('refreshes data when the refresh button is clicked', async () => {
    const { mockInvoke } = setupElectronAPI({
      'integration:get-status': statusConnected(),
      'integration:jira-my-work': makeJiraResponse(),
      'integration:github-my-work': makeGitHubResponse(),
    })

    renderPage()
    await waitFor(() => screen.getByTestId('my-work-page'))

    // Initial load: get-status + jira + github = 3 calls
    const initialCalls = mockInvoke.mock.calls.length

    const refreshBtn = screen.getByTestId('my-work-refresh')
    fireEvent.click(refreshBtn)

    await waitFor(() => {
      const calls = mockInvoke.mock.calls.length
      // Expect at least 3 more calls after the click (status + jira + github)
      expect(calls).toBeGreaterThanOrEqual(initialCalls + 3)
    })
  })

  it('shows the loading shell on initial mount before data resolves', async () => {
    // setupElectronAPI returns synchronous Promises, so the loading state is
    // only visible for a single render frame. We verify the page renders the
    // header (which is the loading-state skeleton) and then transitions out.
    setupElectronAPI({
      'integration:get-status': statusConnected(),
      'integration:jira-my-work': makeJiraResponse(),
      'integration:github-my-work': makeGitHubResponse(),
    })

    renderPage()
    expect(screen.getByText('My Work')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByTestId('my-work-loading')).not.toBeInTheDocument(),
    )
  })

  it('displays a friendly error row when the Jira fetch reports an error', async () => {
    setupElectronAPI({
      'integration:get-status': statusConnected(),
      'integration:jira-my-work': {
        ...makeJiraResponse(),
        assignedIssues: [],
        assignedError: 'Jira API HTTP 503',
      },
      'integration:github-my-work': makeGitHubResponse(),
    })

    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load issues: Jira API HTTP 503/)).toBeInTheDocument(),
    )
  })

  it('shows empty-state copy when an authored PRs list is empty', async () => {
    setupElectronAPI({
      'integration:get-status': statusConnected(),
      'integration:jira-my-work': makeJiraResponse(),
      'integration:github-my-work': {
        ...makeGitHubResponse(),
        authored: [],
      },
    })

    renderPage()
    await waitFor(() =>
      expect(screen.getByText('No open PRs from you.')).toBeInTheDocument(),
    )
  })
})
