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
})
