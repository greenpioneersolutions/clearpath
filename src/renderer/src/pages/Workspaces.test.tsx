// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

let mockInvoke: ReturnType<typeof setupElectronAPI>['mockInvoke']

const BASE_WS = { id: 'ws-1', name: 'Test Workspace', description: 'A test workspace', repoPaths: [], createdAt: 1700000000000 }
const WS_WITH_REPOS = { id: 'ws-1', name: 'Test Workspace', description: 'A test workspace', repoPaths: ['/path/to/repo'], createdAt: 1700000000000 }
const REPO_INFO = [{ path: '/path/to/repo', name: 'my-repo', branch: 'main', lastCommit: 'Initial commit', lastAuthor: 'Alice', uncommittedCount: 0 }]
const ACTIVITY = [{ hash: 'abc123', message: 'Fix bug', author: 'Bob', date: '2024-01-01T00:00:00Z', repo: 'my-repo' }]

function setupDefault(ws = BASE_WS) {
  const api = setupElectronAPI({
    'workspace:list': [ws],
    'workspace:get-active': 'ws-1',
    'workspace:get-repo-info': REPO_INFO,
    'workspace:activity-feed': ACTIVITY,
    'workspace:create': { id: 'ws-new', name: 'New WS', description: '', repoPaths: [], createdAt: Date.now() },
    'workspace:set-active': null,
    'workspace:add-repo': null,
    'workspace:clone-repo': { success: true, path: '/path/to/repo' },
    'workspace:remove-repo': null,
    'workspace:delete': null,
    'workspace:update': null,
    'subagent:spawn': { id: 'sa-1' },
    'cli:start-session': null,
  })
  mockInvoke = api.mockInvoke
  return api
}

beforeEach(() => {
  setupDefault()
  window.confirm = vi.fn().mockReturnValue(true)
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
      expect(screen.getByText(/Repos/)).toBeInTheDocument()
    })
    expect(screen.getByText('Broadcast')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows create workspace form when no workspaces exist', async () => {
    const api = setupElectronAPI({
      'workspace:list': [],
      'workspace:get-active': null,
      'workspace:create': { id: 'ws-new', name: 'New WS', description: '', repoPaths: [], createdAt: Date.now() },
      'workspace:set-active': null,
    })
    mockInvoke = api.mockInvoke
    render(<Workspaces />)
    await waitFor(() => {
      expect(screen.getByText('Create a Workspace')).toBeInTheDocument()
    })
  })

  it('shows create form when + New button clicked', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ New'))
    expect(screen.getByText('Create a Workspace')).toBeInTheDocument()
  })

  it('hides create form when Cancel clicked', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ New'))
    expect(screen.getByText('Create a Workspace')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Create a Workspace')).not.toBeInTheDocument()
  })

  it('creates a workspace by filling name and clicking Create', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ New'))
    const nameInput = screen.getAllByPlaceholderText(/e\.g\., Backend/)[0]
    fireEvent.change(nameInput, { target: { value: 'My New Workspace' } })
    fireEvent.click(screen.getByText('Create Workspace'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('workspace:create', expect.objectContaining({ name: 'My New Workspace' }))
    })
  })

  it('switches workspace via dropdown select', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'ws-1' } })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('workspace:set-active', { id: 'ws-1' })
    })
  })

  it('switches to Broadcast tab', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Broadcast'))
    expect(screen.getByText('Broadcast Task')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Describe the task/)).toBeInTheDocument()
  })

  it('switches to Activity tab and shows empty state', async () => {
    const api = setupElectronAPI({
      'workspace:list': [BASE_WS],
      'workspace:get-active': 'ws-1',
      'workspace:get-repo-info': [],
      'workspace:activity-feed': [],
    })
    mockInvoke = api.mockInvoke
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Activity'))
    await waitFor(() => {
      expect(screen.getByText(/No recent activity/)).toBeInTheDocument()
    })
  })

  it('switches to Settings tab and shows workspace details form', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Settings'))
    await waitFor(() => {
      expect(screen.getByText('Workspace Details')).toBeInTheDocument()
      expect(screen.getByText('Danger Zone')).toBeInTheDocument()
      expect(screen.getByText('Delete Workspace')).toBeInTheDocument()
    })
  })

  it('saves settings changes when name is edited', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Settings'))
    await waitFor(() => expect(screen.getByText('Workspace Details')).toBeInTheDocument())
    // Find the name input in Settings (not the create form)
    const inputs = screen.getAllByRole('textbox')
    // First input in settings form is the name
    const nameInput = inputs.find(i => (i as HTMLInputElement).value === 'Test Workspace')!
    fireEvent.change(nameInput, { target: { value: 'Renamed Workspace' } })
    await waitFor(() => expect(screen.getByText('Save Changes')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save Changes'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('workspace:update', expect.objectContaining({ name: 'Renamed Workspace' }))
    })
  })

  it('deletes workspace when Delete clicked and confirmed', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Settings'))
    await waitFor(() => expect(screen.getByText('Delete Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Delete Workspace'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('workspace:delete', { id: 'ws-1' })
    })
  })

  it('shows Repos empty state when workspace has no repos', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    // Default workspace has repoPaths: [] so repos tab shows empty state
    expect(screen.getByText('No repositories in this workspace yet')).toBeInTheDocument()
  })

  it('shows Add Local Folder and Clone from URL buttons in Repos tab', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    expect(screen.getByText('Add Local Folder')).toBeInTheDocument()
    expect(screen.getByText('Clone from URL')).toBeInTheDocument()
  })

  it('toggles clone URL input when Clone from URL clicked', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Clone from URL'))
    expect(screen.getByPlaceholderText(/https:\/\/github\.com/)).toBeInTheDocument()
    // Click again to toggle off
    fireEvent.click(screen.getByText('Clone from URL'))
    expect(screen.queryByPlaceholderText(/https:\/\/github\.com/)).not.toBeInTheDocument()
  })

  it('clones a repo when URL input and Clone button clicked', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Clone from URL'))
    const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
    fireEvent.change(urlInput, { target: { value: 'https://github.com/org/repo.git' } })
    fireEvent.click(screen.getByText('Clone'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('workspace:clone-repo', expect.objectContaining({ url: 'https://github.com/org/repo.git' }))
    })
  })

  it('shows clone error on failed clone', async () => {
    const api = setupElectronAPI({
      'workspace:list': [BASE_WS],
      'workspace:get-active': 'ws-1',
      'workspace:get-repo-info': [],
      'workspace:activity-feed': [],
      'workspace:clone-repo': { success: false, error: 'Authentication failed' },
    })
    mockInvoke = api.mockInvoke
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Clone from URL'))
    const urlInput = screen.getByPlaceholderText(/https:\/\/github\.com/)
    fireEvent.change(urlInput, { target: { value: 'https://github.com/org/repo.git' } })
    fireEvent.click(screen.getByText('Clone'))
    await waitFor(() => {
      expect(screen.getByText('Authentication failed')).toBeInTheDocument()
    })
  })

  it('adds local repo folder when Add Local Folder clicked', async () => {
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Add Local Folder'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('workspace:add-repo', { workspaceId: 'ws-1' })
    })
  })

  it('shows repos when workspace has repoPaths', async () => {
    setupDefault(WS_WITH_REPOS)
    render(<Workspaces />)
    await waitFor(() => {
      expect(screen.getByText('my-repo')).toBeInTheDocument()
    })
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows Launch Session button for each repo', async () => {
    setupDefault(WS_WITH_REPOS)
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('my-repo')).toBeInTheDocument())
    expect(screen.getByText('Launch Session')).toBeInTheDocument()
  })

  it('launches a session for a repo', async () => {
    setupDefault(WS_WITH_REPOS)
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('my-repo')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Launch Session'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cli:start-session', expect.objectContaining({ workingDirectory: '/path/to/repo', name: 'my-repo' }))
    })
  })

  it('removes a repo when X button clicked and confirmed', async () => {
    setupDefault(WS_WITH_REPOS)
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('my-repo')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Remove from workspace'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('workspace:remove-repo', { workspaceId: 'ws-1', path: '/path/to/repo' })
    })
  })

  it('shows activity when activity tab active and entries exist', async () => {
    setupDefault(WS_WITH_REPOS)
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Activity'))
    await waitFor(() => {
      expect(screen.getByText('Fix bug')).toBeInTheDocument()
    })
    expect(screen.getByText(/Bob/)).toBeInTheDocument()
  })

  it('shows uncommitted changes count in repo card', async () => {
    const wsWithDirtyRepo = { ...WS_WITH_REPOS }
    const api = setupElectronAPI({
      'workspace:list': [wsWithDirtyRepo],
      'workspace:get-active': 'ws-1',
      'workspace:get-repo-info': [{ ...REPO_INFO[0], uncommittedCount: 3 }],
      'workspace:activity-feed': [],
    })
    mockInvoke = api.mockInvoke
    render(<Workspaces />)
    await waitFor(() => {
      expect(screen.getByText('3 uncommitted changes')).toBeInTheDocument()
    })
  })

  it('broadcasts prompt to repos', async () => {
    setupDefault(WS_WITH_REPOS)
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Broadcast'))
    const textarea = screen.getByPlaceholderText(/Describe the task/)
    fireEvent.change(textarea, { target: { value: 'Update all README files' } })
    // Select repo checkbox
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    const broadcastBtn = screen.getByText(/Broadcast to/)
    fireEvent.click(broadcastBtn)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('subagent:spawn', expect.objectContaining({ prompt: 'Update all README files' }))
    })
  })

  it('select all repos button in broadcast tab', async () => {
    setupDefault(WS_WITH_REPOS)
    render(<Workspaces />)
    await waitFor(() => expect(screen.getByText('Test Workspace')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Broadcast'))
    await waitFor(() => expect(screen.getByText('Select all')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Select all'))
    // Checkbox should now be checked
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
  })
})
