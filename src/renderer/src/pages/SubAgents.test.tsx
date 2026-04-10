// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']
let mockOn: ReturnType<typeof setupElectronAPI>['mockOn']

beforeEach(() => {
  const api = setupElectronAPI({
    'subagent:list': [],
    'cli:list-sessions': [],
    'subagent:check-queue-installed': { installed: false },
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
})
