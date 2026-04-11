// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

vi.mock('react-grid-layout', () => {
  const React = require('react')
  const RGL = ({ children }: { children: unknown }) => React.createElement('div', { 'data-testid': 'grid-layout' }, children)
  return { default: RGL, WidthProvider: (C: unknown) => C, Responsive: RGL }
})

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

const EMPTY_LAYOUT = { id: 'default', name: 'Default', widgets: [] }
const WIDGET_LAYOUT = {
  id: 'default',
  name: 'Default',
  widgets: [
    { i: 'w1', type: 'quick-prompt', x: 0, y: 0, w: 6, h: 2, config: {} },
  ],
}

function setupDefault(activeLayout = WIDGET_LAYOUT) {
  const api = setupElectronAPI({
    'dashboard:get-active-layout': activeLayout,
    'dashboard:list-layouts': [
      { id: 'default', name: 'Default', widgets: [] },
      { id: 'compact', name: 'Compact', widgets: [] },
    ],
    'dashboard:set-active': null,
    'dashboard:save-layout': null,
    'cli:start-session': null,
    'learn:get-progress': null,
  })
  mockInvoke = api.mockInvoke
  return api
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <CustomDashboard />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setupDefault()
})

import CustomDashboard from './CustomDashboard'

describe('CustomDashboard', () => {
  it('shows loading state initially', () => {
    renderDashboard()
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
  })

  it('calls dashboard IPC channels on mount', () => {
    renderDashboard()
    expect(mockInvoke).toHaveBeenCalledWith('dashboard:get-active-layout')
    expect(mockInvoke).toHaveBeenCalledWith('dashboard:list-layouts')
  })

  it('renders dashboard layout name after loading', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Default')).toBeInTheDocument()
    })
  })

  it('renders add widget button after loading', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/Add Widget/i)).toBeInTheDocument()
    })
  })

  it('shows empty state when no widgets in layout', async () => {
    setupDefault(EMPTY_LAYOUT)
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Dashboard is empty')).toBeInTheDocument()
    })
  })

  it('renders widget picker when + Add Widget clicked', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('+ Add Widget')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Add Widget'))
    await waitFor(() => {
      expect(screen.getByText('Available Widgets')).toBeInTheDocument()
      expect(screen.getByText('Cost Summary')).toBeInTheDocument()
    })
  })

  it('hides widget picker when + Add Widget clicked again', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('+ Add Widget')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Add Widget'))
    await waitFor(() => expect(screen.getByText('Available Widgets')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Add Widget'))
    await waitFor(() => {
      expect(screen.queryByText('Available Widgets')).not.toBeInTheDocument()
    })
  })

  it('adds a widget from the picker', async () => {
    setupDefault(EMPTY_LAYOUT)
    renderDashboard()
    await waitFor(() => expect(screen.getByText('+ Add Widget')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Add Widget'))
    await waitFor(() => expect(screen.getByText('Running Agents')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Running Agents'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dashboard:save-layout', expect.objectContaining({
        widgets: expect.arrayContaining([expect.objectContaining({ type: 'running-agents' })]),
      }))
    })
  })

  it('removes a widget when x button clicked', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Quick Prompt')).toBeInTheDocument())
    fireEvent.click(screen.getByText('x'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dashboard:save-layout', expect.objectContaining({
        widgets: [],
      }))
    })
  })

  it('switches layout via dropdown', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'compact' } })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dashboard:set-active', { id: 'compact' })
    })
  })

  it('renders quick-prompt widget with input and Go button', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask anything...')).toBeInTheDocument()
      expect(screen.getByText('Go')).toBeInTheDocument()
    })
  })

  it('sends quick prompt when Go button clicked', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByPlaceholderText('Ask anything...')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Ask anything...'), { target: { value: 'write unit tests' } })
    fireEvent.click(screen.getByText('Go'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:start-session', expect.objectContaining({ prompt: 'write unit tests' }))
    })
  })

  it('shows "Added" label for widget types already in layout', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('+ Add Widget')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ Add Widget'))
    await waitFor(() => {
      // quick-prompt is already in layout
      expect(screen.getByText('Added')).toBeInTheDocument()
    })
  })

  it('renders cost-summary widget with correct IPC call', async () => {
    setupDefault({
      id: 'default', name: 'Default',
      widgets: [{ i: 'cost-1', type: 'cost-summary', x: 0, y: 0, w: 4, h: 2, config: {} }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cost:summary')
    })
  })

  it('renders cost-summary widget content when data is available', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'cost-1', type: 'cost-summary', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'cost:summary': { todaySpend: 0.05, weekSpend: 0.25, monthSpend: 1.20, totalTokens: 10000, todayTokens: 500 },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument()
    })
  })

  it('renders running-agents widget and calls subagent:list', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'agents-1', type: 'running-agents', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'subagent:list': [{ id: 'a1', name: 'Test Agent', status: 'running' }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('subagent:list')
    })
  })

  it('renders running-agents widget showing agent name', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'agents-1', type: 'running-agents', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'subagent:list': [{ id: 'a1', name: 'MyAgent', status: 'running' }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('MyAgent')).toBeInTheDocument()
    })
  })

  it('renders running-agents empty state when no agents running', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'agents-1', type: 'running-agents', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'subagent:list': [{ id: 'a1', name: 'IdleAgent', status: 'stopped' }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('No running agents')).toBeInTheDocument()
    })
  })

  it('renders recent-sessions widget and calls cli:get-persisted-sessions', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sess-1', type: 'recent-sessions', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'Work Session', startedAt: Date.now() - 1000, messageLog: [] },
      ],
      'cli:list-sessions': [],
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('cli:get-persisted-sessions')
    })
  })

  it('renders recent-sessions widget showing session name', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sess-1', type: 'recent-sessions', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'cli:get-persisted-sessions': [
        { sessionId: 's1', cli: 'copilot', name: 'My Work', startedAt: Date.now() - 1000, messageLog: [{}] },
      ],
      'cli:list-sessions': [],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('My Work')).toBeInTheDocument()
    })
  })

  it('renders notification-feed widget and calls notifications:list', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'notif-1', type: 'notification-feed', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'notifications:list': [{ id: 'n1', title: 'Build failed', severity: 'error', timestamp: Date.now() - 60000 }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('notifications:list', { limit: 5 })
    })
  })

  it('renders notification-feed showing notification title', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'notif-1', type: 'notification-feed', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'notifications:list': [{ id: 'n1', title: 'Build failed', severity: 'error', timestamp: Date.now() - 60000 }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Build failed')).toBeInTheDocument()
    })
  })

  it('renders schedule-overview widget and calls scheduler:list', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sched-1', type: 'schedule-overview', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'scheduler:list': [{ id: 'j1', name: 'Daily Build', cronExpression: '0 9 * * *', enabled: true, executions: [] }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('scheduler:list')
    })
  })

  it('renders schedule-overview showing job name', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sched-1', type: 'schedule-overview', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'scheduler:list': [{ id: 'j1', name: 'Daily Build', cronExpression: '0 9 * * *', enabled: true, executions: [] }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Daily Build')).toBeInTheDocument()
    })
  })

  it('renders policy-status widget and shows policy name', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'policy-1', type: 'policy-status', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'policy:get-active': { presetName: 'Standard', mode: 'enforcing' },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Standard')).toBeInTheDocument()
    })
  })

  it('renders token-usage widget and calls cost:summary', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'tokens-1', type: 'token-usage', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'cost:summary': { totalTokens: 5000, todayTokens: 200, todaySpend: 0.01, totalCost: 0.5 },
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('cost:summary')
    })
  })

  it('renders workspace-activity widget and calls workspace:list', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'ws-1', type: 'workspace-activity', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'workspace:list': [{ id: 'w1', name: 'My Project', path: '/projects/mine', status: 'active', lastActivity: Date.now() }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('workspace:list')
    })
  })

  it('renders continue-learning widget and calls learn:get-progress', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'learn-1', type: 'continue-learning', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'learn:get-progress': { completed: 2, total: 10, percentage: 20, nextLesson: { title: 'Next Lesson', estimatedMinutes: 5 } },
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('learn:get-progress')
    })
  })

  it('renders continue-learning widget showing next lesson', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'learn-1', type: 'continue-learning', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'learn:get-progress': { completed: 2, total: 10, percentage: 20, nextLesson: { title: 'Agents Intro', estimatedMinutes: 5 } },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Agents Intro')).toBeInTheDocument()
    })
  })

  it('renders quick-launch widget with action buttons', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'launch-1', type: 'quick-launch', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeInTheDocument()
    })
  })

  it('renders repo-status widget and calls git:status', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'git-1', type: 'repo-status', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'git:status': null,
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('git:status')
    })
  })

  it('renders security-events widget and calls compliance:recent-events', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sec-1', type: 'security-events', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'compliance:recent-events': null,
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('compliance:recent-events', { limit: 5 })
    })
  })

  it('renders setup-wizard widget and calls setup-wizard:get-state', async () => {
    const { mockInvoke: localMock } = setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'wizard-1', type: 'setup-wizard', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'setup-wizard:get-state': null,
    })
    renderDashboard()
    await waitFor(() => {
      expect(localMock).toHaveBeenCalledWith('setup-wizard:get-state')
    })
  })

  it('renders unknown widget type with default empty state', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'unknown-1', type: 'some-unknown-type', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('some-unknown-type widget')).toBeInTheDocument()
    })
  })

  it('running-agents shows +N more when more than 5 agents are running', async () => {
    const manyAgents = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, name: `Agent ${i}`, status: 'running' }))
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'agents-1', type: 'running-agents', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'subagent:list': manyAgents,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('+2 more')).toBeInTheDocument()
    })
  })

  it('schedule-overview shows disabled count when some schedules are paused', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sched-1', type: 'schedule-overview', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'scheduler:list': [
        { id: 'j1', name: 'Active Job', cronExpression: '0 9 * * *', enabled: true, executions: [] },
        { id: 'j2', name: 'Paused Job', cronExpression: '0 17 * * 5', enabled: false, executions: [] },
      ],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/1 paused schedule/)).toBeInTheDocument()
    })
  })

  it('token-usage renders progress bar when totalTokens > 0', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'tokens-1', type: 'token-usage', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'cost:summary': { totalTokens: 8000, totalInputTokens: 5000, totalOutputTokens: 3000, sessionCount: 4 },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Total Tokens')).toBeInTheDocument()
      expect(screen.getByText('Input')).toBeInTheDocument()
      expect(screen.getByText('Output')).toBeInTheDocument()
    })
  })

  it('repo-status renders branch name and file counts when git data is available', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'git-1', type: 'repo-status', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'git:status': { branch: 'feature/test', staged: ['a.ts'], modified: ['b.ts'], untracked: [], ahead: 2, behind: 1 },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('feature/test')).toBeInTheDocument()
      expect(screen.getByText(/2 commits ahead/)).toBeInTheDocument()
      expect(screen.getByText(/1 commit behind/)).toBeInTheDocument()
    })
  })

  it('repo-status shows Working tree clean when no changes', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'git-1', type: 'repo-status', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'git:status': { branch: 'main', staged: [], modified: [], untracked: [], ahead: 0, behind: 0 },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Working tree clean')).toBeInTheDocument()
    })
  })

  it('security-events renders event messages when events are present', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sec-1', type: 'security-events', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'compliance:recent-events': [
        { id: 'e1', type: 'file-access', message: 'Sensitive file accessed', severity: 'warning', timestamp: Date.now() - 120000 },
      ],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Sensitive file accessed')).toBeInTheDocument()
    })
  })

  it('workspace-activity shows empty state when no workspaces configured', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'ws-1', type: 'workspace-activity', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'workspace:list': [],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('No workspaces configured')).toBeInTheDocument()
    })
  })

  it('workspace-activity shows workspace names when workspaces exist', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'ws-1', type: 'workspace-activity', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'workspace:list': [
        { id: 'w1', name: 'Frontend', repos: ['repo1', 'repo2'] },
        { id: 'w2', name: 'Backend', repos: [] },
      ],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Frontend')).toBeInTheDocument()
      expect(screen.getByText('2 repos')).toBeInTheDocument()
    })
  })

  it('workspace-activity shows +N more when more than 4 workspaces', async () => {
    const manyWorkspaces = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, name: `Workspace ${i}`, repos: [] }))
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'ws-1', type: 'workspace-activity', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'workspace:list': manyWorkspaces,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('+2 more')).toBeInTheDocument()
    })
  })

  it('setup-wizard shows Setup Complete when completedAt is set', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'wizard-1', type: 'setup-wizard', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'setup-wizard:get-state': { completedAt: Date.now() - 86400000, cliInstalled: true, authenticated: true, agentCreated: true, skillCreated: true, memoryCreated: true, triedWizard: true },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Setup Complete')).toBeInTheDocument()
    })
  })

  it('continue-learning shows Learning Complete when at 100%', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'learn-1', type: 'continue-learning', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'learn:get-progress': { completed: 10, total: 10, percentage: 100, nextLesson: null },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Learning Complete')).toBeInTheDocument()
    })
  })

  it('continue-learning shows welcome message when no lessons completed', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'learn-1', type: 'continue-learning', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'learn:get-progress': { completed: 0, total: 10, percentage: 0, nextLesson: { title: 'Intro to CLI', estimatedMinutes: 3 } },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Welcome to ClearPathAI')).toBeInTheDocument()
    })
  })

  it('recent-sessions shows No sessions yet when sessions list is empty', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sess-1', type: 'recent-sessions', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'cli:get-persisted-sessions': [],
      'cli:list-sessions': [],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    })
  })

  it('notification-feed shows No notifications when list is empty', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'notif-1', type: 'notification-feed', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'notifications:list': [],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument()
    })
  })

  it('schedule-overview shows No scheduled tasks when list is empty', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sched-1', type: 'schedule-overview', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'scheduler:list': [],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('No scheduled tasks')).toBeInTheDocument()
    })
  })

  it('security-events shows All Clear when no events', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sec-1', type: 'security-events', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'compliance:recent-events': [],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('All Clear')).toBeInTheDocument()
    })
  })

  it('cronToHuman formats known cron expressions to readable labels', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sched-1', type: 'schedule-overview', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'scheduler:list': [
        { id: 'j1', name: 'Hourly Job', cronExpression: '0 * * * *', enabled: true, executions: [] },
      ],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Hourly')).toBeInTheDocument()
    })
  })

  it('cost-summary shows No cost data yet when data is null', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'cost-1', type: 'cost-summary', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'cost:summary': null,
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('No cost data yet')).toBeInTheDocument()
    })
  })

  it('notification-feed shows hours-ago timestamp for notifications hours old', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'notif-1', type: 'notification-feed', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'notifications:list': [
        { id: 'n1', title: 'Hours Old Notice', severity: 'info', timestamp: Date.now() - 7200000 }, // 2h ago
      ],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('2h ago')).toBeInTheDocument()
    })
  })

  it('notification-feed shows days-ago timestamp for notifications days old', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'notif-1', type: 'notification-feed', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'notifications:list': [
        { id: 'n1', title: 'Old Notice', severity: 'info', timestamp: Date.now() - 172800000 }, // 2d ago
      ],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('2d ago')).toBeInTheDocument()
    })
  })

  it('token-usage shows M suffix for million+ tokens', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'tokens-1', type: 'token-usage', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'cost:summary': { totalTokens: 2500000, totalInputTokens: 1500000, totalOutputTokens: 1000000, sessionCount: 50 },
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('2.5M')).toBeInTheDocument()
    })
  })

  it('cronToHuman returns raw expression for unknown cron format', async () => {
    setupElectronAPI({
      'dashboard:get-active-layout': {
        id: 'default', name: 'Default',
        widgets: [{ i: 'sched-1', type: 'schedule-overview', x: 0, y: 0, w: 4, h: 2, config: {} }],
      },
      'dashboard:list-layouts': [{ id: 'default', name: 'Default', widgets: [] }],
      'scheduler:list': [
        { id: 'j1', name: 'Custom Job', cronExpression: '15 10 * * 3', enabled: true, executions: [] },
      ],
    })
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('15 10 * * 3')).toBeInTheDocument()
    })
  })
})
