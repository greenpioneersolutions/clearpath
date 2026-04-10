// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import NewSessionModal from './NewSessionModal'

describe('NewSessionModal', () => {
  const baseProps = {
    onStart: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    baseProps.onStart.mockReset()
    baseProps.onClose.mockReset()
  })

  it('renders the modal title', () => {
    render(<NewSessionModal {...baseProps} />)
    expect(screen.getByText('New Session')).toBeInTheDocument()
  })

  it('renders CLI selector buttons', () => {
    render(<NewSessionModal {...baseProps} />)
    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('renders model selector', () => {
    render(<NewSessionModal {...baseProps} />)
    expect(screen.getByLabelText(/Model/)).toBeInTheDocument()
  })

  it('renders session name input', () => {
    render(<NewSessionModal {...baseProps} />)
    expect(screen.getByLabelText(/Session Name/)).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    render(<NewSessionModal {...baseProps} />)
    fireEvent.click(screen.getByLabelText('Cancel new session'))
    expect(baseProps.onClose).toHaveBeenCalledOnce()
  })

  it('calls onStart and onClose when Start Session is clicked', () => {
    render(<NewSessionModal {...baseProps} />)
    fireEvent.click(screen.getByLabelText('Start new session'))
    expect(baseProps.onStart).toHaveBeenCalledWith({
      cli: 'copilot',
      name: undefined,
      workingDirectory: undefined,
      initialPrompt: undefined,
      model: undefined,
    })
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('uses defaultCli when provided', () => {
    render(<NewSessionModal {...baseProps} defaultCli="claude" />)
    fireEvent.click(screen.getByLabelText('Start new session'))
    expect(baseProps.onStart).toHaveBeenCalledWith(
      expect.objectContaining({ cli: 'claude' }),
    )
  })

  it('has proper dialog role', () => {
    render(<NewSessionModal {...baseProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
