// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import NewFileWizard from './NewFileWizard'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

describe('NewFileWizard', () => {
  const defaultProps = {
    workingDirectory: '/project',
    onCreated: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onCreated.mockReset()
    defaultProps.onCancel.mockReset()
  })

  it('renders template list on initial load', () => {
    render(<NewFileWizard {...defaultProps} />)
    expect(screen.getByText('Choose a Template')).toBeInTheDocument()
  })

  it('shows filter buttons (All, Claude, Copilot)', () => {
    render(<NewFileWizard {...defaultProps} />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Copilot')).toBeInTheDocument()
  })

  it('renders template names and descriptions', () => {
    render(<NewFileWizard {...defaultProps} />)
    expect(screen.getByText('Project Instructions (CLAUDE.md)')).toBeInTheDocument()
    expect(screen.getByText(/Root-level instructions/)).toBeInTheDocument()
  })

  it('filters templates when Claude filter is clicked', () => {
    render(<NewFileWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Copilot'))

    // Should show copilot-specific templates
    expect(screen.getByText('Project Agents (AGENTS.md)')).toBeInTheDocument()
    // Should not show claude-only templates
    expect(screen.queryByText('Global Instructions (~/.claude/CLAUDE.md)')).not.toBeInTheDocument()
  })

  it('shows template form when a template is selected', () => {
    render(<NewFileWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Project Instructions (CLAUDE.md)'))

    expect(screen.getByText('File path')).toBeInTheDocument()
    expect(screen.getByText('Content (editable)')).toBeInTheDocument()
    expect(screen.getByText('Create File')).toBeInTheDocument()
  })

  it('populates suggested path when template is selected', () => {
    render(<NewFileWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Project Instructions (CLAUDE.md)'))

    const pathInput = screen.getByDisplayValue('/project/CLAUDE.md')
    expect(pathInput).toBeInTheDocument()
  })

  it('calls onCreated after successful file creation', async () => {
    mockInvoke.mockResolvedValue({ success: true })
    render(<NewFileWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Project Instructions (CLAUDE.md)'))

    fireEvent.click(screen.getByText('Create File'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('memory:write-file', expect.objectContaining({
        path: '/project/CLAUDE.md',
      }))
      expect(defaultProps.onCreated).toHaveBeenCalledWith('/project/CLAUDE.md')
    })
  })

  it('shows error when creation fails', async () => {
    mockInvoke.mockResolvedValue({ error: 'Path blocked' })
    render(<NewFileWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Project Instructions (CLAUDE.md)'))

    fireEvent.click(screen.getByText('Create File'))

    await waitFor(() => {
      expect(screen.getByText('Path blocked')).toBeInTheDocument()
    })
  })

  it('shows error when path is empty', async () => {
    render(<NewFileWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Project Instructions (CLAUDE.md)'))

    // Clear the path
    const pathInput = screen.getByDisplayValue('/project/CLAUDE.md')
    fireEvent.change(pathInput, { target: { value: '' } })

    fireEvent.click(screen.getByText('Create File'))

    await waitFor(() => {
      expect(screen.getByText('File path is required')).toBeInTheDocument()
    })
  })

  it('navigates back from template form to list', () => {
    render(<NewFileWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Project Instructions (CLAUDE.md)'))

    expect(screen.getByText('Create File')).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Back/))

    expect(screen.getByText('Choose a Template')).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked in list view', () => {
    render(<NewFileWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })

  it('calls onCancel when Cancel is clicked in form view', () => {
    render(<NewFileWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Project Instructions (CLAUDE.md)'))

    // Cancel button in template form
    const cancelButtons = screen.getAllByText('Cancel')
    fireEvent.click(cancelButtons[0])
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })
})
