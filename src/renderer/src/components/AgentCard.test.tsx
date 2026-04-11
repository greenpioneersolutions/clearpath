// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AgentCard } from './AgentCard'
import type { AgentDef } from '../types/ipc'

const makeAgent = (overrides: Partial<AgentDef> = {}): AgentDef => ({
  id: 'agent-1',
  cli: 'copilot',
  name: 'Test Agent',
  description: 'A test agent for unit tests',
  source: 'user',
  filePath: '/path/to/agent.md',
  model: 'gpt-5',
  tools: ['shell', 'read_file', 'write_file', 'create_file', 'delete_file'],
  ...overrides,
})

describe('AgentCard', () => {
  const baseProps = {
    agent: makeAgent(),
    enabled: true,
    isActive: false,
    onToggle: vi.fn(),
    onSetActive: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }

  beforeEach(() => {
    baseProps.onToggle.mockReset()
    baseProps.onSetActive.mockReset()
    baseProps.onEdit.mockReset()
    baseProps.onDelete.mockReset()
  })

  it('renders agent name', () => {
    render(<AgentCard {...baseProps} />)
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
  })

  it('renders agent description', () => {
    render(<AgentCard {...baseProps} />)
    expect(screen.getByText('A test agent for unit tests')).toBeInTheDocument()
  })

  it('renders model badge', () => {
    render(<AgentCard {...baseProps} />)
    expect(screen.getByText('gpt-5')).toBeInTheDocument()
  })

  it('renders tools with limit of 4 visible', () => {
    render(<AgentCard {...baseProps} />)
    expect(screen.getByText('shell')).toBeInTheDocument()
    expect(screen.getByText('read_file')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('shows built-in badge for builtin agents', () => {
    render(<AgentCard {...baseProps} agent={makeAgent({ source: 'builtin' })} />)
    expect(screen.getByText('built-in')).toBeInTheDocument()
  })

  it('shows active badge when active', () => {
    render(<AgentCard {...baseProps} isActive={true} />)
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('calls onToggle when switch is clicked', () => {
    render(<AgentCard {...baseProps} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(baseProps.onToggle).toHaveBeenCalledWith('agent-1', false)
  })

  it('calls onSetActive when Use button is clicked', () => {
    render(<AgentCard {...baseProps} />)
    fireEvent.click(screen.getByText('Use'))
    expect(baseProps.onSetActive).toHaveBeenCalledWith('agent-1')
  })

  it('shows Deselect when active', () => {
    render(<AgentCard {...baseProps} isActive={true} />)
    expect(screen.getByText('Deselect')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Deselect'))
    expect(baseProps.onSetActive).toHaveBeenCalledWith(null)
  })

  it('calls onEdit when edit button is clicked', () => {
    render(<AgentCard {...baseProps} />)
    fireEvent.click(screen.getByText('Edit'))
    expect(baseProps.onEdit).toHaveBeenCalledWith(baseProps.agent)
  })

  it('shows Customize for builtin agents', () => {
    render(<AgentCard {...baseProps} agent={makeAgent({ source: 'builtin' })} />)
    expect(screen.getByText('Customize')).toBeInTheDocument()
  })

  it('does not show delete button for builtin agents', () => {
    render(<AgentCard {...baseProps} agent={makeAgent({ source: 'builtin' })} />)
    expect(screen.queryByTitle('Delete agent')).not.toBeInTheDocument()
  })

  it('shows delete button for user agents', () => {
    render(<AgentCard {...baseProps} />)
    expect(screen.getByTitle('Delete agent')).toBeInTheDocument()
  })
})
