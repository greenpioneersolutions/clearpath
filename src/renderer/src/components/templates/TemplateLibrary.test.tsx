// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import TemplateLibrary from './TemplateLibrary'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TemplateLibrary', () => {
  const mockTemplates = [
    {
      id: 't1', name: 'Bug Fix Template', category: 'Bug Fix', description: 'Fix bugs',
      body: 'Fix {{BUG}}', complexity: 'medium' as const, variables: ['BUG'],
      source: 'user' as const, usageCount: 5, totalCost: 0.25, createdAt: Date.now(),
    },
    {
      id: 't2', name: 'Review Template', category: 'Code Review', description: 'Code review',
      body: 'Review code', complexity: 'low' as const, variables: [],
      source: 'builtin' as const, usageCount: 0, totalCost: 0, createdAt: Date.now(),
    },
  ]

  const defaultProps = {
    onSelect: vi.fn(),
    onEdit: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onSelect.mockReset()
    defaultProps.onEdit.mockReset()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'templates:list') return Promise.resolve(mockTemplates)
      if (channel === 'templates:delete') return Promise.resolve({ success: true })
      if (channel === 'templates:export') return Promise.resolve({ path: '/tmp/template.json' })
      if (channel === 'templates:import') return Promise.resolve({ template: mockTemplates[0] })
      return Promise.resolve(undefined)
    })
  })

  it('renders search input', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    expect(screen.getByPlaceholderText('Search templates...')).toBeInTheDocument()
  })

  it('renders template cards after loading', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Bug Fix Template')).toBeInTheDocument()
      expect(screen.getByText('Review Template')).toBeInTheDocument()
    })
  })

  it('shows complexity badges', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('medium')).toBeInTheDocument()
      expect(screen.getByText('low')).toBeInTheDocument()
    })
  })

  it('shows usage count for used templates', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('used 5x')).toBeInTheDocument()
    })
  })

  it('shows "built-in" label for builtin templates', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('built-in')).toBeInTheDocument()
    })
  })

  it('shows variable count', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('1 variable')).toBeInTheDocument()
    })
  })

  it('calls onSelect when Use is clicked', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Bug Fix Template')).toBeInTheDocument()
    })

    const useButtons = screen.getAllByText('Use')
    fireEvent.click(useButtons[0])
    expect(defaultProps.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))
  })

  it('calls onEdit when Edit is clicked', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Bug Fix Template')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByText('Edit')
    fireEvent.click(editButtons[0])
    expect(defaultProps.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))
  })

  it('shows Delete button only for user templates', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Bug Fix Template')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByText('Delete')
    // Only one Delete button (for user template, not builtin)
    expect(deleteButtons).toHaveLength(1)
  })

  it('deletes template when Delete is confirmed', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Bug Fix Template')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('templates:delete', { id: 't1' })
    })
  })

  it('shows category filter buttons', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Bug Fix')).toBeInTheDocument()
    expect(screen.getByText('Code Review')).toBeInTheDocument()
  })

  it('shows Import button', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    expect(screen.getByText('Import')).toBeInTheDocument()
  })

  it('shows empty state when no templates', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'templates:list') return Promise.resolve([])
      return Promise.resolve(undefined)
    })

    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument()
    })
  })

  it('shows Share button for each template', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      const shareButtons = screen.getAllByText('Share')
      expect(shareButtons.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows success message after export', async () => {
    render(<TemplateLibrary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Bug Fix Template')).toBeInTheDocument()
    })

    const shareButtons = screen.getAllByText('Share')
    fireEvent.click(shareButtons[0])

    await waitFor(() => {
      expect(screen.getByText(/Exported to/)).toBeInTheDocument()
    })
  })
})
