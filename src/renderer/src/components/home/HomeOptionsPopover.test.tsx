// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

import HomeOptionsPopover, { backendPillLabel } from './HomeOptionsPopover'

describe('HomeOptionsPopover', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    readyBackends: ['copilot-cli' as const],
    backend: 'copilot-cli' as const,
    model: '',
    agent: '',
    agents: [],
    onBackendChange: vi.fn(),
    onModelChange: vi.fn(),
    onAgentChange: vi.fn(),
  }

  it('returns null when closed', () => {
    const { container } = render(<HomeOptionsPopover {...baseProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Model and Agent rows when only one backend is ready', () => {
    render(<HomeOptionsPopover {...baseProps} />)
    expect(screen.getByLabelText('Model')).toBeInTheDocument()
    expect(screen.getByLabelText('Agent')).toBeInTheDocument()
    expect(screen.queryByLabelText('Backend')).not.toBeInTheDocument()
  })

  it('renders the Backend row when more than one backend is ready', () => {
    render(<HomeOptionsPopover {...baseProps} readyBackends={['copilot-cli', 'claude-cli']} />)
    expect(screen.getByLabelText('Backend')).toBeInTheDocument()
  })

  it('emits onModelChange when the model select changes', () => {
    const onModelChange = vi.fn()
    render(<HomeOptionsPopover {...baseProps} onModelChange={onModelChange} />)
    const select = screen.getByLabelText('Model') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'gpt-4o' } })
    expect(onModelChange).toHaveBeenCalledWith('gpt-4o')
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<HomeOptionsPopover {...baseProps} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('emits onBackendChange when the backend select changes', () => {
    const onBackendChange = vi.fn()
    render(<HomeOptionsPopover {...baseProps} readyBackends={['copilot-cli', 'claude-cli']} onBackendChange={onBackendChange} />)
    const select = screen.getByLabelText('Backend') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'claude-cli' } })
    expect(onBackendChange).toHaveBeenCalledWith('claude-cli')
  })

  it('emits onAgentChange when the agent select changes', () => {
    const agents = [
      { id: 'cop-1', name: 'CopAgent', description: '', source: 'file' as const, cli: 'copilot-cli' as const },
    ]
    const onAgentChange = vi.fn()
    render(<HomeOptionsPopover {...baseProps} agents={agents} onAgentChange={onAgentChange} />)
    const select = screen.getByLabelText('Agent') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'cop-1' } })
    expect(onAgentChange).toHaveBeenCalledWith('cop-1')
  })

  it('exposes the Claude model tiers when backend is a Claude backend', () => {
    render(<HomeOptionsPopover {...baseProps} backend={'claude-cli'} />)
    const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement
    // Claude tier names are different from Copilot's — the latest-auto-update
    // alias 'sonnet' should be available; Copilot's 'gpt-5-mini' should NOT.
    const values = Array.from(modelSelect.options).map((o) => o.value)
    expect(values).toContain('sonnet')
    expect(values).not.toContain('gpt-5-mini')
  })

  it('does NOT close on mousedown inside the popover', () => {
    const onClose = vi.fn()
    render(<HomeOptionsPopover {...baseProps} onClose={onClose} />)
    // Click on the Model label inside the popover — should not trigger onClose.
    fireEvent.mouseDown(screen.getByLabelText('Model'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when a mousedown lands outside the popover', () => {
    const onClose = vi.fn()
    render(
      <div>
        <button data-testid="outside">elsewhere</button>
        <HomeOptionsPopover {...baseProps} onClose={onClose} />
      </div>,
    )
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(onClose).toHaveBeenCalled()
  })

  it('filters agents to the active provider', () => {
    const agents = [
      { id: 'cop-1', name: 'CopilotAgent', description: '', source: 'file' as const, cli: 'copilot-cli' as const },
      { id: 'cl-1', name: 'ClaudeAgent', description: '', source: 'file' as const, cli: 'claude-cli' as const },
    ]
    render(<HomeOptionsPopover {...baseProps} agents={agents} />)
    expect(screen.getByText('CopilotAgent')).toBeInTheDocument()
    expect(screen.queryByText('ClaudeAgent')).not.toBeInTheDocument()
  })
})

describe('backendPillLabel', () => {
  it('formats with model when set', () => {
    expect(backendPillLabel('copilot-cli', 'gpt-4o')).toBe('Copilot CLI · gpt-4o')
  })

  it('omits model when blank', () => {
    expect(backendPillLabel('claude-cli', '')).toBe('Claude CLI')
  })
})
