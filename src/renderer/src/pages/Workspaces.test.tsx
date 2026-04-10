// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

beforeEach(() => {
  const api = setupElectronAPI({
    'workspace:list': [
      { id: 'ws-1', name: 'Test Workspace', description: 'A test workspace', repoPaths: [], createdAt: Date.now() },
    ],
    'workspace:get-active': 'ws-1',
    'workspace:get-repo-info': [],
    'workspace:activity-feed': [],
  })
  mockInvoke = api.mockInvoke
})

import Workspaces from './Workspaces'

describe('Workspaces', () => {
  it('renders page heading', () => {
    render(<Workspaces />)
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
  })

  it('calls workspace IPC channels on mount', () => {
    render(<Workspaces />)
    expect(mockInvoke).toHaveBeenCalledWith('workspace:list')
    expect(mockInvoke).toHaveBeenCalledWith('workspace:get-active')
  })

  it('renders content after loading', async () => {
    render(<Workspaces />)
    await waitFor(() => {
      expect(screen.getByText('Test Workspace')).toBeInTheDocument()
    })
  })

  it('shows new workspace button', () => {
    render(<Workspaces />)
    expect(screen.getByText('+ New')).toBeInTheDocument()
  })

  it('renders tab buttons when active workspace exists', async () => {
    render(<Workspaces />)
    await waitFor(() => {
      // Tab labels include dynamic count: "Repos (0)"
      expect(screen.getByText(/Repos/)).toBeInTheDocument()
    })
    expect(screen.getByText('Broadcast')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
