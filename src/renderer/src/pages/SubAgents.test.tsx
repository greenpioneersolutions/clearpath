// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']
let mockOn: ReturnType<typeof setupElectronAPI>['mockOn']

const mockAgent = {
  id: 'sa1',
  name: 'Background Task',
  cli: 'copilot' as const,
  status: 'running' as const,
  prompt: 'Analyze the codebase',
  model: 'claude-sonnet-4-5',
  startedAt: Date.now() - 5000,
}

const completedAgent = {
  ...mockAgent,
  id: 'sa2',
  name: 'Done Task',
  status: 'completed' as const,
  endedAt: Date.now() - 1000,
}

beforeEach(() => {
  window.confirm = vi.fn().mockReturnValue(true)
  const api = setupElectronAPI({
    'subagent:list': [],
    'cli:list-sessions': [],
    'subagent:check-queue-installed': { installed: false },
    'subagent:get-output': [],
  })
  mockInvoke = api.mockInvoke
  mockOn = api.mockOn
})

import SubAgents from './SubAgents'

describe('SubAgents', () => {
  it('renders page heading', () => {
    render(<SubAgents />)
    expect(screen.getByText('Sub-Agent Monitor')).toBeInTheDocument()
  })

  it('renders tab buttons', async () => {
    render(<SubAgents />)
    await waitFor(() => {
      expect(screen.getByText('Process Dashboard')).toBeInTheDocument()
    })
    // "Delegate Task" appears in both tab and action button — use getAllByText
    const delegateItems = screen.getAllByText('Delegate Task')
    expect(delegateItems.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Task Queue')).toBeInTheDocument()
    expect(screen.getByText('Fleet Status')).toBeInTheDocument()
  })

  it('calls subagent:list on mount', () => {
    render(<SubAgents />)
    expect(mockInvoke).toHaveBeenCalledWith('subagent:list')
  })

  it('subscribes to subagent events', () => {
    render(<SubAgents />)
    expect(mockOn).toHaveBeenCalledWith('subagent:spawned', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('subagent:status-changed', expect.any(Function))
  })

  it('shows empty dashboard message when no agents', async () => {
    render(<SubAgents />)
    await waitFor(() => {
      expect(screen.getByText('No processes')).toBeInTheDocument()
    })
  })

  it('shows agent count in subtitle', async () => {
    const api = setupElectronAPI({
      'subagent:list': [mockAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => {
      expect(screen.getByText(/1 process/)).toBeInTheDocument()
    })
  })

  it('shows running count in subtitle when agents are running', async () => {
    const api = setupElectronAPI({
      'subagent:list': [mockAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => {
      expect(screen.getByText(/1 running/)).toBeInTheDocument()
    })
  })

  it('shows Kill All button when running agents present', async () => {
    const api = setupElectronAPI({
      'subagent:list': [mockAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
      'subagent:kill-all': null,
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => {
      expect(screen.getByText(/Kill All/)).toBeInTheDocument()
    })
  })

  it('calls subagent:kill-all when Kill All confirmed', async () => {
    const api = setupElectronAPI({
      'subagent:list': [mockAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
      'subagent:kill-all': null,
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => screen.getByText(/Kill All/))
    fireEvent.click(screen.getByText(/Kill All/))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('subagent:kill-all')
    })
  })

  it('shows Process Card when agents are present', async () => {
    const api = setupElectronAPI({
      'subagent:list': [completedAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => {
      expect(screen.getByText('Done Task')).toBeInTheDocument()
    })
  })

  it('switches to Delegate Task tab and renders form', async () => {
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Process Dashboard'))
    // Click the tab (not the action button in empty state)
    const delegateTabBtn = screen.getAllByText('Delegate Task')[0]
    fireEvent.click(delegateTabBtn)
    await waitFor(() => {
      expect(screen.getByText('Spawn a background CLI process to work on a task independently')).toBeInTheDocument()
    })
  })

  it('switches to Task Queue tab', async () => {
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Task Queue'))
    fireEvent.click(screen.getByText('Task Queue'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('subagent:check-queue-installed')
    })
  })

  it('shows not installed message on Task Queue tab when queue not installed', async () => {
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Task Queue'))
    fireEvent.click(screen.getByText('Task Queue'))
    await waitFor(() => {
      expect(screen.getByText('claude-code-queue not installed')).toBeInTheDocument()
    })
  })

  it('switches to Fleet Status tab and renders fleet panel', async () => {
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Fleet Status'))
    fireEvent.click(screen.getByText('Fleet Status'))
    await waitFor(() => {
      expect(screen.getByText(/Copilot coordinated sub-agent activity/)).toBeInTheDocument()
    })
  })

  it('submit button is disabled in delegate form when no prompt entered', async () => {
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Process Dashboard'))
    const delegateTabBtn = screen.getAllByText('Delegate Task')[0]
    fireEvent.click(delegateTabBtn)
    await waitFor(() => screen.getByPlaceholderText('Describe the task...'))
    // Submit button is disabled when prompt is empty (disabled={!prompt.trim()})
    const allDelegateButtons = screen.getAllByText('Delegate Task')
    const submitButton = allDelegateButtons[allDelegateButtons.length - 1]
    expect(submitButton).toBeDisabled()
  })

  it('does not show Kill All button when no running agents', async () => {
    const api = setupElectronAPI({
      'subagent:list': [completedAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Done Task'))
    expect(screen.queryByText(/Kill All/)).not.toBeInTheDocument()
  })

  it('filters copilot sessions from cli:list-sessions (ignores non-copilot)', async () => {
    const claudeSession = { id: 'sess-c1', cli: 'claude', title: 'Claude Session', createdAt: Date.now() }
    const copilotSession = { id: 'sess-p1', cli: 'copilot', title: 'Copilot Session', createdAt: Date.now() }
    const api = setupElectronAPI({
      'subagent:list': [],
      'cli:list-sessions': [claudeSession, copilotSession],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    // Switch to Fleet tab to verify copilotSessions was filtered
    await waitFor(() => screen.getByText('Fleet Status'))
    fireEvent.click(screen.getByText('Fleet Status'))
    await waitFor(() => {
      expect(api.mockInvoke).toHaveBeenCalledWith('cli:list-sessions')
    })
  })

  it('calls subagent:kill when Kill button is clicked on running agent', async () => {
    const api = setupElectronAPI({
      'subagent:list': [mockAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
      'subagent:kill': null,
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Kill'))
    fireEvent.click(screen.getByText('Kill'))
    await waitFor(() => {
      expect(api.mockInvoke).toHaveBeenCalledWith('subagent:kill', { id: 'sa1' })
    })
  })

  it('calls subagent:pause when Pause button is clicked on running agent', async () => {
    const api = setupElectronAPI({
      'subagent:list': [mockAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
      'subagent:pause': null,
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Pause'))
    fireEvent.click(screen.getByText('Pause'))
    await waitFor(() => {
      expect(api.mockInvoke).toHaveBeenCalledWith('subagent:pause', { id: 'sa1' })
    })
  })

  it('calls subagent:resume when Resume button is clicked on completed agent', async () => {
    const api = setupElectronAPI({
      'subagent:list': [completedAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
      'subagent:resume': null,
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Resume'))
    fireEvent.click(screen.getByText('Resume'))
    await waitFor(() => {
      expect(api.mockInvoke).toHaveBeenCalledWith('subagent:resume', { id: 'sa2' })
    })
  })

  it('calls subagent:pop-out when Pop Out button is clicked', async () => {
    const api = setupElectronAPI({
      'subagent:list': [mockAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
      'subagent:pop-out': null,
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Pop Out'))
    fireEvent.click(screen.getByText('Pop Out'))
    await waitFor(() => {
      expect(api.mockInvoke).toHaveBeenCalledWith('subagent:pop-out', { id: 'sa1', name: 'Background Task' })
    })
  })

  it('shows dashboard tab badge with running count when agents are running', async () => {
    const api = setupElectronAPI({
      'subagent:list': [mockAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => {
      // The badge showing runningCount appears inside the Process Dashboard tab button
      const badge = screen.getByText('1', { selector: 'span' })
      expect(badge).toBeInTheDocument()
    })
  })

  it('handleKillAll does not call subagent:kill-all when no running agents (confirm not shown)', async () => {
    // completedAgent has status 'completed', so running.length === 0
    // handleKillAll early returns before confirm()
    const api = setupElectronAPI({
      'subagent:list': [completedAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
      'subagent:kill-all': null,
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Done Task'))
    // Kill All button is not shown when no running agents
    expect(screen.queryByText(/Kill All/)).not.toBeInTheDocument()
    // Confirm and subagent:kill-all should not have been called
    expect(window.confirm).not.toHaveBeenCalled()
    expect(api.mockInvoke).not.toHaveBeenCalledWith('subagent:kill-all')
  })

  it('shows plural "processes" in Kill All confirm when multiple agents running', async () => {
    const secondRunningAgent = { ...mockAgent, id: 'sa3', name: 'Second Task' }
    window.confirm = vi.fn().mockReturnValue(true)
    const api = setupElectronAPI({
      'subagent:list': [mockAgent, secondRunningAgent],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
      'subagent:kill-all': null,
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => screen.getByText(/Kill All/))
    fireEvent.click(screen.getByText(/Kill All/))
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining('processes')
      )
    })
  })

  it('switches to dashboard tab and sets expandedId after DelegateTaskForm spawns agent', async () => {
    // DelegateTaskForm calls onSpawned(info) which sets tab to 'dashboard' and expandedId to info.id
    const newAgent: typeof mockAgent = {
      ...mockAgent,
      id: 'sa-new',
      name: 'Newly Spawned',
    }
    const api = setupElectronAPI({
      'subagent:list': [],
      'cli:list-sessions': [],
      'subagent:check-queue-installed': { installed: false },
      'subagent:get-output': [],
      'subagent:spawn': newAgent,
    })
    mockInvoke = api.mockInvoke
    render(<SubAgents />)
    await waitFor(() => screen.getByText('Process Dashboard'))

    // Navigate to Delegate Task tab
    const delegateTabBtn = screen.getAllByText('Delegate Task')[0]
    fireEvent.click(delegateTabBtn)
    await waitFor(() => screen.getByPlaceholderText('Describe the task...'))

    // Type a prompt and submit
    fireEvent.change(screen.getByPlaceholderText('Describe the task...'), {
      target: { value: 'Run some analysis' },
    })
    // Click the submit button (last 'Delegate Task' button = submit)
    const allDelegateButtons = screen.getAllByText('Delegate Task')
    const submitButton = allDelegateButtons[allDelegateButtons.length - 1]
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(api.mockInvoke).toHaveBeenCalledWith('subagent:spawn', expect.any(Object))
    })
    // After spawn, tab switches to dashboard
    await waitFor(() => {
      expect(screen.getByText('Process Dashboard')).toBeInTheDocument()
    })
  })
})
