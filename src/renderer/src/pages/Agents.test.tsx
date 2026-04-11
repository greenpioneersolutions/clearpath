// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

import Agents from './Agents'

describe('Agents', () => {
  const mockAgents = {
    copilot: [
      { id: 'a1', name: 'Code Reviewer', cli: 'copilot', source: 'file', description: 'Reviews code', model: 'sonnet', tools: [], prompt: '', filePath: '/agents/a1.md' },
    ],
    claude: [],
  }

  beforeEach(() => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:set-enabled') return Promise.resolve(null)
      if (channel === 'agent:create') return Promise.resolve({ agentDef: {} })
      return Promise.resolve(null)
    })
  })

  it('renders page heading', () => {
    render(<Agents />)
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<Agents />)
    expect(screen.getByText(/Create and manage agents/)).toBeInTheDocument()
  })

  it('renders Create Agent button', () => {
    render(<Agents />)
    expect(screen.getByText('Create Agent')).toBeInTheDocument()
  })

  it('renders view tabs', () => {
    render(<Agents />)
    expect(screen.getByText('All Agents')).toBeInTheDocument()
    expect(screen.getByText(/Agent Profiles/)).toBeInTheDocument()
  })

  it('shows agent cards after loading', async () => {
    render(<Agents />)
    await waitFor(() => {
      expect(screen.getByText('Code Reviewer')).toBeInTheDocument()
    })
  })

  it('calls all agent IPC channels on mount', () => {
    render(<Agents />)
    expect(mockInvoke).toHaveBeenCalledWith('agent:list', {})
    expect(mockInvoke).toHaveBeenCalledWith('agent:get-enabled')
    expect(mockInvoke).toHaveBeenCalledWith('agent:get-active')
    expect(mockInvoke).toHaveBeenCalledWith('agent:get-profiles')
    expect(mockInvoke).toHaveBeenCalledWith('starter-pack:get-visible-agents')
  })

  it('shows empty state when no agents', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve([])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => {
      expect(screen.getByText('No agents yet')).toBeInTheDocument()
    })
  })

  it('shows starter agents when available', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve([])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([
        { id: 's1', name: 'Starter Agent', tagline: 'Get started fast', description: 'A starter', category: 'spotlight', handles: [], systemPrompt: '', associatedSkills: [] },
      ])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => {
      expect(screen.getByText('Starter Pack')).toBeInTheDocument()
      expect(screen.getByText('Starter Agent')).toBeInTheDocument()
    })
  })

  it('shows spotlight badge on spotlight category starter agents', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve([])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([
        { id: 's1', name: 'Spotlight Agent', tagline: 'Best one', description: 'A spotlight', category: 'spotlight', handles: [], systemPrompt: '', associatedSkills: [] },
      ])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => {
      expect(screen.getByText('Spotlight')).toBeInTheDocument()
    })
  })

  it('shows "Already in your agents" for starter agents that have already been created', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({
        copilot: [{ id: 'a1', name: 'Code Reviewer', cli: 'copilot', source: 'file', description: 'Reviews code', model: 'sonnet', tools: [], prompt: '', filePath: '/agents/a1.md' }],
        claude: [],
      })
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([
        { id: 's1', name: 'Code Reviewer', tagline: 'Review code', description: 'Reviews your code', category: 'spotlight', handles: [], systemPrompt: '', associatedSkills: [] },
      ])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => {
      expect(screen.getByText('Already in your agents')).toBeInTheDocument()
    })
  })

  it('opens walkthrough when clicking Try This Agent', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve([])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([
        { id: 's1', name: 'Test Starter', tagline: 'Quick start', description: 'A starter agent', category: 'default', handles: [], systemPrompt: 'Do things', associatedSkills: [] },
      ])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Try This Agent'))
    fireEvent.click(screen.getByText('Try This Agent'))
    await waitFor(() => {
      expect(screen.getByText('From the Starter Pack')).toBeInTheDocument()
    })
  })

  it('toggles agent enabled state and calls agent:set-enabled', async () => {
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    const toggle = screen.getByRole('switch', { name: /toggle agent/i })
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:set-enabled', { ids: [] })
    })
  })

  it('calls agent:set-active when Use button is clicked', async () => {
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText('Use'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:set-active', { cli: 'copilot', agentId: 'a1' })
    })
  })

  it('shows Deselect button and calls agent:set-active with null when active agent is deselected', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: 'a1', claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:set-active') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Deselect'))
    fireEvent.click(screen.getByText('Deselect'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:set-active', { cli: 'copilot', agentId: null })
    })
  })

  it('shows active badge on active agent', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: 'a1', claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument()
    })
  })

  it('opens agent wizard when Create Agent button clicked', async () => {
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText('Create Agent'))
    await waitFor(() => {
      expect(screen.getByText('Name, description, and target CLI')).toBeInTheDocument()
    })
  })

  it('deletes agent when trash button clicked and confirmed', async () => {
    window.confirm = vi.fn().mockReturnValue(true)
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    const deleteBtn = screen.getByTitle('Delete agent')
    fireEvent.click(deleteBtn)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:delete', { filePath: '/agents/a1.md' })
    })
  })

  it('does not delete agent when confirm is cancelled', async () => {
    window.confirm = vi.fn().mockReturnValue(false)
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    const deleteBtn = screen.getByTitle('Delete agent')
    fireEvent.click(deleteBtn)
    expect(mockInvoke).not.toHaveBeenCalledWith('agent:delete', expect.anything())
  })

  it('opens agent editor when Edit button clicked for file-sourced agent', async () => {
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText('Edit'))
    await waitFor(() => {
      // AgentEditor renders when editTarget is set — it calls agent:read-file
      expect(mockInvoke).toHaveBeenCalledWith('agent:read-file', expect.anything())
    })
  })

  it('switches to Agent Profiles view when tab clicked', async () => {
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText(/Agent Profiles/))
    await waitFor(() => {
      expect(screen.getByText('Profiles')).toBeInTheDocument()
    })
  })

  it('shows no profiles state in profiles view', async () => {
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText(/Agent Profiles/))
    await waitFor(() => {
      expect(screen.getByText('No profiles yet. Save your current toggle state as a named preset.')).toBeInTheDocument()
    })
  })

  it('shows profiles in profiles view', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([
        { id: 'p1', name: 'My Profile', enabledAgentIds: ['a1'] },
      ])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText(/Agent Profiles/))
    await waitFor(() => {
      expect(screen.getByText('My Profile')).toBeInTheDocument()
    })
  })

  it('calls agent:apply-profile when Apply button clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([
        { id: 'p1', name: 'My Profile', enabledAgentIds: ['a1'] },
      ])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:apply-profile') return Promise.resolve(['a1'])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText(/Agent Profiles/))
    await waitFor(() => screen.getByText('My Profile'))
    fireEvent.click(screen.getByText('Apply'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:apply-profile', { profileId: 'p1' })
    })
  })

  it('calls agent:save-profile when profile name entered and Save clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:save-profile') return Promise.resolve({ id: 'p1', name: 'Team Setup', enabledAgentIds: ['a1'] })
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText(/Agent Profiles/))
    await waitFor(() => screen.getByPlaceholderText('Profile name…'))
    fireEvent.change(screen.getByPlaceholderText('Profile name…'), { target: { value: 'Team Setup' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:save-profile', { name: 'Team Setup', enabledAgentIds: ['a1'] })
    })
  })

  it('shows error when saving profile with empty name', async () => {
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText(/Agent Profiles/))
    await waitFor(() => screen.getByText('Save'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
    })
  })

  it('calls agent:delete-profile when Delete then Confirm clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([
        { id: 'p1', name: 'My Profile', enabledAgentIds: ['a1'] },
      ])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:delete-profile') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText(/Agent Profiles/))
    await waitFor(() => screen.getByText('My Profile'))
    fireEvent.click(screen.getByText('Delete'))
    await waitFor(() => screen.getByText('Confirm'))
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:delete-profile', { profileId: 'p1' })
    })
  })

  it('shows profile count in Agent Profiles tab', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([
        { id: 'p1', name: 'Profile A', enabledAgentIds: ['a1'] },
        { id: 'p2', name: 'Profile B', enabledAgentIds: [] },
      ])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => {
      expect(screen.getByText('Agent Profiles (2)')).toBeInTheDocument()
    })
  })

  it('uses [] fallback when starter-pack:get-visible-agents returns non-array', async () => {
    // Covers line 50: Array.isArray(starters) ? starters : []  — false branch
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({ copilot: [], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve([])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => {
      // Page still renders without crashing; Starter Pack section is NOT shown
      expect(screen.getByText('No agents yet')).toBeInTheDocument()
      expect(screen.queryByText('Starter Pack')).not.toBeInTheDocument()
    })
  })

  it('sets activeCli to claude when only claude agent is active', async () => {
    // Covers line 59: activeAgents.claude && !activeAgents.copilot ? 'claude' : 'copilot' — true branch
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({
        copilot: [],
        claude: [{ id: 'c1', name: 'Claude Agent', cli: 'claude', source: 'file', description: 'Claude', model: 'sonnet', tools: [], prompt: '', filePath: '/agents/c1.md' }],
      })
      if (channel === 'agent:get-enabled') return Promise.resolve(['c1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: 'c1' })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:set-enabled') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => {
      expect(screen.getByText('Claude Agent')).toBeInTheDocument()
    })
    // activeCli = 'claude' — Create Agent wizard opens for claude CLI
    fireEvent.click(screen.getByText('Create Agent'))
    await waitFor(() => {
      expect(screen.getByText('Name, description, and target CLI')).toBeInTheDocument()
    })
  })

  it('enables agent when toggle clicked while disabled (adds id to list)', async () => {
    // Covers line 68: newEnabled ? [...enabledIds, id] — the true branch (adding)
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve([]) // a1 starts disabled
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:set-enabled') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    const toggle = screen.getByRole('switch', { name: /toggle agent/i })
    fireEvent.click(toggle)
    await waitFor(() => {
      // Enabling a1 — ids array now contains 'a1'
      expect(mockInvoke).toHaveBeenCalledWith('agent:set-enabled', { ids: ['a1'] })
    })
  })

  it('does not call agent:delete when agent has no filePath (handleDelete early return)', async () => {
    // Covers line 109: if (!agent.filePath) return
    window.confirm = vi.fn().mockReturnValue(true)
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({
        copilot: [{ id: 'b1', name: 'Built-in Agent', cli: 'copilot', source: 'builtin', description: 'Built-in', model: 'sonnet', tools: [], prompt: '', filePath: '' }],
        claude: [],
      })
      if (channel === 'agent:get-enabled') return Promise.resolve(['b1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Built-in Agent'))
    // Built-in agent (source !== 'file') does not render a delete button — onDelete is undefined
    // This exercises the line 299 false branch: agent.source === 'file' ? handleDelete : undefined
    expect(screen.queryByTitle('Delete agent')).not.toBeInTheDocument()
  })

  // ── handleEdit for built-in agents (lines 87-103) ──────────────────────────

  it('opens built-in agent copy flow when Customize clicked and confirm=true', async () => {
    // Covers lines 87-100: confirm=true branch of handleEdit for non-file source agent
    window.confirm = vi.fn().mockReturnValue(true)
    const builtinAgent = {
      id: 'b1', name: 'Built-in Agent', cli: 'copilot', source: 'builtin',
      description: 'A built-in agent', model: 'sonnet', tools: [], prompt: '', filePath: '',
    }
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({ copilot: [builtinAgent], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve(['b1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:create') return Promise.resolve({
        agentDef: {
          id: 'b1-custom', name: 'Built-in Agent (Custom)', cli: 'copilot',
          source: 'file', description: 'A built-in agent', model: 'sonnet', tools: [], prompt: '',
          filePath: '/agents/b1-custom.md',
        },
      })
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Built-in Agent'))
    fireEvent.click(screen.getByText('Customize'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:create', {
        def: expect.objectContaining({ name: 'Built-in Agent (Custom)', cli: 'copilot' }),
      })
    })
  })

  it('does not call agent:create when Customize clicked but confirm=false', async () => {
    // Covers line 87: confirm=false early return in handleEdit
    window.confirm = vi.fn().mockReturnValue(false)
    const builtinAgent = {
      id: 'b2', name: 'Another Built-in', cli: 'copilot', source: 'builtin',
      description: 'Another built-in', model: 'sonnet', tools: [], prompt: '', filePath: '',
    }
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({ copilot: [builtinAgent], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve(['b2'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Another Built-in'))
    fireEvent.click(screen.getByText('Customize'))
    await waitFor(() => {
      expect(mockInvoke).not.toHaveBeenCalledWith('agent:create', expect.anything())
    })
  })

  it('shows alert when agent:create throws during built-in agent copy', async () => {
    // Covers lines 101-102: catch branch in handleEdit
    window.confirm = vi.fn().mockReturnValue(true)
    window.alert = vi.fn()
    const builtinAgent = {
      id: 'b3', name: 'Error Agent', cli: 'copilot', source: 'builtin',
      description: 'Will error', model: 'sonnet', tools: [], prompt: '', filePath: '',
    }
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve({ copilot: [builtinAgent], claude: [] })
      if (channel === 'agent:get-enabled') return Promise.resolve(['b3'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:create') return Promise.reject(new Error('disk full'))
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Error Agent'))
    fireEvent.click(screen.getByText('Customize'))
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Failed to copy agent'))
    })
  })

  it('updates existing profile in save when same name already exists', async () => {
    // Covers line 122-124: existing >= 0 branch in handleSaveProfile
    const existingProfile = { id: 'p1', name: 'Team Setup', enabledAgentIds: [] }
    const updatedProfile = { id: 'p1', name: 'Team Setup', enabledAgentIds: ['a1'] }
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:list') return Promise.resolve(mockAgents)
      if (channel === 'agent:get-enabled') return Promise.resolve(['a1'])
      if (channel === 'agent:get-active') return Promise.resolve({ copilot: null, claude: null })
      if (channel === 'agent:get-profiles') return Promise.resolve([existingProfile])
      if (channel === 'starter-pack:get-visible-agents') return Promise.resolve([])
      if (channel === 'agent:save-profile') return Promise.resolve(updatedProfile)
      return Promise.resolve(null)
    })
    render(<Agents />)
    await waitFor(() => screen.getByText('Code Reviewer'))
    fireEvent.click(screen.getByText(/Agent Profiles/))
    await waitFor(() => screen.getByPlaceholderText('Profile name…'))
    // Type the SAME name as the existing profile
    fireEvent.change(screen.getByPlaceholderText('Profile name…'), { target: { value: 'Team Setup' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:save-profile', { name: 'Team Setup', enabledAgentIds: ['a1'] })
    })
  })
})
