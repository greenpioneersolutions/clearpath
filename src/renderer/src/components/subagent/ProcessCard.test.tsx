// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ProcessCard from './ProcessCard'
import type { SubAgentInfo } from '../../types/subagent'

describe('ProcessCard', () => {
  const runningAgent: SubAgentInfo = {
    id: 'sa-1',
    name: 'Fix auth bug',
    cli: 'copilot',
    status: 'running',
    prompt: 'Fix the authentication bug in login.ts',
    model: 'claude-sonnet-4.5',
    startedAt: Date.now() - 60000,
    pid: 12345,
  }

  const completedAgent: SubAgentInfo = {
    id: 'sa-2',
    name: 'Generate docs',
    cli: 'claude',
    status: 'completed',
    prompt: 'Generate API docs',
    startedAt: Date.now() - 120000,
    endedAt: Date.now() - 30000,
  }

  const defaultHandlers = {
    onToggleExpand: vi.fn(),
    onKill: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onPopOut: vi.fn(),
  }

  beforeEach(() => {
    Object.values(defaultHandlers).forEach((fn) => fn.mockReset())
  })

  it('renders agent name and status', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    expect(screen.getByText('Fix auth bug')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('Copilot')).toBeInTheDocument()
  })

  it('renders prompt text', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    expect(screen.getByText('Fix the authentication bug in login.ts')).toBeInTheDocument()
  })

  it('shows Kill and Pause buttons for running agents', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    expect(screen.getByText('Kill')).toBeInTheDocument()
    expect(screen.getByText('Pause')).toBeInTheDocument()
    expect(screen.queryByText('Resume')).not.toBeInTheDocument()
  })

  it('shows Resume button for completed agents', () => {
    render(
      <ProcessCard agent={completedAgent} isExpanded={false} {...defaultHandlers} />,
    )
    expect(screen.getByText('Resume')).toBeInTheDocument()
    expect(screen.queryByText('Kill')).not.toBeInTheDocument()
    expect(screen.queryByText('Pause')).not.toBeInTheDocument()
  })

  it('always shows Pop Out button', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    expect(screen.getByText('Pop Out')).toBeInTheDocument()
  })

  it('calls onKill when Kill is clicked', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    fireEvent.click(screen.getByText('Kill'))
    expect(defaultHandlers.onKill).toHaveBeenCalledOnce()
  })

  it('calls onPause when Pause is clicked', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    fireEvent.click(screen.getByText('Pause'))
    expect(defaultHandlers.onPause).toHaveBeenCalledOnce()
  })

  it('calls onResume when Resume is clicked', () => {
    render(
      <ProcessCard agent={completedAgent} isExpanded={false} {...defaultHandlers} />,
    )
    fireEvent.click(screen.getByText('Resume'))
    expect(defaultHandlers.onResume).toHaveBeenCalledOnce()
  })

  it('calls onPopOut when Pop Out is clicked', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    fireEvent.click(screen.getByText('Pop Out'))
    expect(defaultHandlers.onPopOut).toHaveBeenCalledOnce()
  })

  it('calls onToggleExpand when agent name area is clicked', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    fireEvent.click(screen.getByText('Fix auth bug'))
    expect(defaultHandlers.onToggleExpand).toHaveBeenCalledOnce()
  })

  it('renders children when expanded', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={true} {...defaultHandlers}>
        <div>Output content here</div>
      </ProcessCard>,
    )
    expect(screen.getByText('Output content here')).toBeInTheDocument()
  })

  it('does not render children when collapsed', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers}>
        <div>Hidden content</div>
      </ProcessCard>,
    )
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
  })

  it('shows model info when available', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    expect(screen.getByText('model: claude-sonnet-4.5')).toBeInTheDocument()
  })

  it('shows pid when available', () => {
    render(
      <ProcessCard agent={runningAgent} isExpanded={false} {...defaultHandlers} />,
    )
    expect(screen.getByText('pid: 12345')).toBeInTheDocument()
  })

  it('shows Claude badge for claude CLI', () => {
    render(
      <ProcessCard agent={completedAgent} isExpanded={false} {...defaultHandlers} />,
    )
    expect(screen.getByText('Claude')).toBeInTheDocument()
  })
})
