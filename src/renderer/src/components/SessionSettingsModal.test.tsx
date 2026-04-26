// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import SessionSettingsModal from './SessionSettingsModal'
import type { SessionInfo } from '../types/ipc'

const EXISTING: SessionInfo = {
  sessionId: 's-1',
  name: 'Fix auth bug',
  cli: 'claude-cli',
  status: 'running',
  startedAt: Date.now(),
}

describe('SessionSettingsModal — create mode (default)', () => {
  const baseProps = {
    onStart: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    baseProps.onStart.mockReset()
    baseProps.onClose.mockReset()
  })

  it('renders the create-mode title', () => {
    render(<SessionSettingsModal {...baseProps} />)
    expect(screen.getByText('New session')).toBeInTheDocument()
  })

  it('renders CLI selector buttons', () => {
    render(<SessionSettingsModal {...baseProps} />)
    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('renders model selector', () => {
    render(<SessionSettingsModal {...baseProps} />)
    expect(screen.getByLabelText(/Model/)).toBeInTheDocument()
  })

  it('renders session name input', () => {
    render(<SessionSettingsModal {...baseProps} />)
    expect(screen.getByLabelText(/Session Name/)).toBeInTheDocument()
  })

  it('renders initial prompt field', () => {
    render(<SessionSettingsModal {...baseProps} />)
    expect(screen.getByLabelText(/Initial Prompt/)).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    render(<SessionSettingsModal {...baseProps} />)
    fireEvent.click(screen.getByLabelText('Cancel new session'))
    expect(baseProps.onClose).toHaveBeenCalledOnce()
  })

  it('calls onStart and onClose when Start Session is clicked', () => {
    render(<SessionSettingsModal {...baseProps} />)
    fireEvent.click(screen.getByLabelText('Start new session'))
    expect(baseProps.onStart).toHaveBeenCalledWith({
      cli: 'copilot-cli',
      name: undefined,
      workingDirectory: undefined,
      initialPrompt: undefined,
      model: undefined,
    })
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('uses defaultCli when provided', () => {
    render(<SessionSettingsModal {...baseProps} defaultCli="claude-cli" />)
    fireEvent.click(screen.getByLabelText('Start new session'))
    expect(baseProps.onStart).toHaveBeenCalledWith(
      expect.objectContaining({ cli: 'claude-cli' }),
    )
  })

  it('has proper dialog role', () => {
    render(<SessionSettingsModal {...baseProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('SessionSettingsModal — edit mode', () => {
  const baseProps = {
    mode: 'edit' as const,
    existingSession: EXISTING,
    currentModel: 'sonnet',
    onSave: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    baseProps.onSave.mockReset()
    baseProps.onClose.mockReset()
  })

  it('renders the edit-mode title', () => {
    render(<SessionSettingsModal {...baseProps} />)
    expect(screen.getByText('Edit session')).toBeInTheDocument()
  })

  it('disables the CLI selector buttons', () => {
    render(<SessionSettingsModal {...baseProps} />)
    const copilotBtn = screen.getByText('GitHub Copilot').closest('button')!
    const claudeBtn = screen.getByText('Claude Code').closest('button')!
    expect(copilotBtn).toBeDisabled()
    expect(claudeBtn).toBeDisabled()
  })

  it('disables the working directory input', () => {
    render(<SessionSettingsModal {...baseProps} />)
    const workingDir = screen.getByLabelText(/Working Directory/) as HTMLInputElement
    expect(workingDir).toBeDisabled()
  })

  it('does not render the Initial Prompt field', () => {
    render(<SessionSettingsModal {...baseProps} />)
    expect(screen.queryByLabelText(/Initial Prompt/)).not.toBeInTheDocument()
  })

  it('keeps the session name field editable and pre-filled', () => {
    render(<SessionSettingsModal {...baseProps} />)
    const nameInput = screen.getByLabelText(/Session Name/) as HTMLInputElement
    expect(nameInput).not.toBeDisabled()
    expect(nameInput.value).toBe('Fix auth bug')
  })

  it('shows the Save changes button', () => {
    render(<SessionSettingsModal {...baseProps} />)
    expect(screen.getByLabelText('Save session changes')).toBeInTheDocument()
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })

  it('submits only changed fields via onSave', () => {
    render(<SessionSettingsModal {...baseProps} />)
    // Change the name
    const nameInput = screen.getByLabelText(/Session Name/) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Renamed session' } })
    fireEvent.click(screen.getByLabelText('Save session changes'))
    expect(baseProps.onSave).toHaveBeenCalledWith({ name: 'Renamed session' })
  })

  it('submits an empty diff when nothing changed', () => {
    render(<SessionSettingsModal {...baseProps} />)
    fireEvent.click(screen.getByLabelText('Save session changes'))
    expect(baseProps.onSave).toHaveBeenCalledWith({})
  })

  it('submits a model change diff', () => {
    render(<SessionSettingsModal {...baseProps} />)
    const modelSelect = screen.getByLabelText(/Model/) as HTMLSelectElement
    fireEvent.change(modelSelect, { target: { value: 'opus' } })
    fireEvent.click(screen.getByLabelText('Save session changes'))
    expect(baseProps.onSave).toHaveBeenCalledWith({ model: 'opus' })
  })

  it('calls onClose when Cancel is clicked', () => {
    render(<SessionSettingsModal {...baseProps} />)
    fireEvent.click(screen.getByLabelText('Cancel session edit'))
    expect(baseProps.onClose).toHaveBeenCalledOnce()
  })
})
