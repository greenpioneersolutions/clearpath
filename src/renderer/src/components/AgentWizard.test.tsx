// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AgentWizard } from './AgentWizard'

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

describe('AgentWizard', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onCreated: vi.fn(),
  }

  beforeEach(() => {
    baseProps.onClose.mockReset()
    baseProps.onCreated.mockReset()
  })

  it('returns null when not open', () => {
    const { container } = render(<AgentWizard {...baseProps} isOpen={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders wizard title on first step', () => {
    render(<AgentWizard {...baseProps} />)
    expect(screen.getByText('Create Agent')).toBeInTheDocument()
  })

  it('renders CLI selector', () => {
    render(<AgentWizard {...baseProps} />)
    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('renders name and description fields', () => {
    render(<AgentWizard {...baseProps} />)
    expect(screen.getByPlaceholderText('e.g. Frontend Reviewer')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Briefly describe what this agent does')).toBeInTheDocument()
  })

  it('can navigate to next step', () => {
    render(<AgentWizard {...baseProps} />)
    // Fill required name field
    fireEvent.change(screen.getByPlaceholderText('e.g. Frontend Reviewer'), { target: { value: 'My Agent' } })
    fireEvent.click(screen.getByText('Next'))
    // Should be on model-tools step — check for the tool options
    expect(screen.getByText(/Allowed Tools/)).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    render(<AgentWizard {...baseProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(baseProps.onClose).toHaveBeenCalledOnce()
  })

  it('uses defaultCli when provided', () => {
    render(<AgentWizard {...baseProps} defaultCli="claude" />)
    // The Claude Code button should have the active styling (orange for claude)
    const claudeBtn = screen.getByText('Claude Code')
    expect(claudeBtn.className).toContain('bg-orange-500')
  })
})
