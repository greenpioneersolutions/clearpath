// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import InstructionsEditor from './InstructionsEditor'

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

describe('InstructionsEditor', () => {
  const defaultProps = {
    cli: 'claude' as const,
    workingDirectory: '/project',
  }

  it('renders editing path for claude as CLAUDE.md', async () => {
    mockInvoke.mockResolvedValue({ content: '' })
    render(<InstructionsEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('/project/CLAUDE.md')).toBeInTheDocument()
    })
  })

  it('renders editing path for copilot as AGENTS.md', async () => {
    mockInvoke.mockResolvedValue({ content: '' })
    render(<InstructionsEditor {...defaultProps} cli="copilot" />)
    await waitFor(() => {
      expect(screen.getByText('/project/AGENTS.md')).toBeInTheDocument()
    })
  })

  it('renders all category sections', async () => {
    mockInvoke.mockResolvedValue({ content: '' })
    render(<InstructionsEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Code Style')).toBeInTheDocument()
      expect(screen.getByText('Testing')).toBeInTheDocument()
      expect(screen.getByText('Architecture')).toBeInTheDocument()
      expect(screen.getByText('Communication Preferences')).toBeInTheDocument()
      expect(screen.getByText('Review Guidelines')).toBeInTheDocument()
    })
  })

  it('loads and parses existing content into sections', async () => {
    const existingContent = `# Instructions

## Code Style
Use TypeScript strict mode

## Testing
Write unit tests
`
    mockInvoke.mockResolvedValue({ content: existingContent })
    render(<InstructionsEditor {...defaultProps} />)

    await waitFor(() => {
      const textareas = screen.getAllByRole('textbox')
      expect(textareas[0]).toHaveValue('Use TypeScript strict mode')
      expect(textareas[1]).toHaveValue('Write unit tests')
    })
  })

  it('saves content when Save All is clicked', async () => {
    mockInvoke.mockResolvedValue({ content: '' })
    render(<InstructionsEditor {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Save All')).toBeInTheDocument()
    })

    // Type into code style section
    const textareas = screen.getAllByRole('textbox')
    fireEvent.change(textareas[0], { target: { value: 'New style rules' } })

    mockInvoke.mockResolvedValue({ success: true })

    fireEvent.click(screen.getByText('Save All'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('memory:write-file', expect.objectContaining({
        path: '/project/CLAUDE.md',
      }))
    })
  })

  it('shows success message after save', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'memory:read-file') return Promise.resolve({ content: '' })
      if (channel === 'memory:write-file') return Promise.resolve({ success: true })
      return Promise.resolve(undefined)
    })
    render(<InstructionsEditor {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Save All')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Save All'))

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })
  })

  it('shows error message on save failure', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'memory:read-file') return Promise.resolve({ content: '' })
      if (channel === 'memory:write-file') return Promise.resolve({ error: 'Permission denied' })
      return Promise.resolve(undefined)
    })
    render(<InstructionsEditor {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Save All')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Save All'))

    await waitFor(() => {
      expect(screen.getByText('Error: Permission denied')).toBeInTheDocument()
    })
  })

  it('shows helper text about instructions', async () => {
    mockInvoke.mockResolvedValue({ content: '' })
    render(<InstructionsEditor {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/Instructions are written as markdown/)).toBeInTheDocument()
    })
  })
})
