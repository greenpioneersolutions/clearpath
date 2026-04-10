// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import TemplateLauncher from './TemplateLauncher'

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

describe('TemplateLauncher', () => {
  const mockTemplates = [
    {
      id: 't1', name: 'Bug Fix', category: 'Bug Fix', description: 'Fix a bug systematically',
      body: 'Fix the bug in {{MODULE}} affecting {{FEATURE}}',
      complexity: 'medium' as const, variables: ['MODULE', 'FEATURE'],
      source: 'builtin' as const, usageCount: 3, totalCost: 0.12, createdAt: Date.now(),
    },
    {
      id: 't2', name: 'Code Review', category: 'Code Review', description: 'Review code changes',
      body: 'Review the recent changes for quality',
      complexity: 'low' as const, variables: [],
      source: 'user' as const, usageCount: 0, totalCost: 0, createdAt: Date.now(),
    },
  ]

  const defaultProps = {
    onStartFromTemplate: vi.fn(),
    onStartFromScratch: vi.fn(),
    onRunNow: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onStartFromTemplate.mockReset()
    defaultProps.onStartFromScratch.mockReset()
    defaultProps.onRunNow.mockReset()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'templates:list') return Promise.resolve(mockTemplates)
      if (channel === 'templates:record-usage') return Promise.resolve(undefined)
      return Promise.resolve(undefined)
    })
  })

  it('renders landing page with heading', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    expect(screen.getByText('Workflow Composer')).toBeInTheDocument()
    expect(screen.getByText('Start from Scratch')).toBeInTheDocument()
  })

  it('calls onStartFromScratch when scratch button is clicked', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    fireEvent.click(screen.getByText('Start from Scratch'))
    expect(defaultProps.onStartFromScratch).toHaveBeenCalled()
  })

  it('loads and displays templates', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Bug Fix')).toBeInTheDocument()
      expect(screen.getByText('Code Review')).toBeInTheDocument()
    })
  })

  // Helper: click the Bug Fix template card (not the category filter button)
  async function clickBugFixTemplate() {
    await waitFor(() => {
      // "Bug Fix" appears in both category filter and template card
      // The template card contains the description text, so find it by description proximity
      expect(screen.getByText('Fix a bug systematically')).toBeInTheDocument()
    })
    // Click the template card button that contains the description
    const descEl = screen.getByText('Fix a bug systematically')
    const templateCard = descEl.closest('button')!
    fireEvent.click(templateCard)
  }

  it('shows template details when a template is clicked', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await clickBugFixTemplate()

    await waitFor(() => {
      expect(screen.getByText('Fill in Variables')).toBeInTheDocument()
      expect(screen.getByText('Run Now')).toBeInTheDocument()
      expect(screen.getByText('Add to Workflow')).toBeInTheDocument()
    })
  })

  it('renders variable input fields for template with variables', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await clickBugFixTemplate()

    await waitFor(() => {
      expect(screen.getByText('MODULE')).toBeInTheDocument()
      expect(screen.getByText('FEATURE')).toBeInTheDocument()
    })
  })

  it('disables Run Now when variables are unfilled', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await clickBugFixTemplate()

    await waitFor(() => {
      expect(screen.getByText('Run Now')).toBeDisabled()
      expect(screen.getByText('Add to Workflow')).toBeDisabled()
    })
  })

  it('enables Run Now when all variables are filled', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await clickBugFixTemplate()

    await waitFor(() => {
      expect(screen.getByPlaceholderText('module')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('module'), { target: { value: 'auth' } })
    fireEvent.change(screen.getByPlaceholderText('feature'), { target: { value: 'login' } })

    expect(screen.getByText('Run Now')).not.toBeDisabled()
  })

  it('calls onRunNow with hydrated prompt', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await clickBugFixTemplate()

    await waitFor(() => {
      expect(screen.getByPlaceholderText('module')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('module'), { target: { value: 'auth' } })
    fireEvent.change(screen.getByPlaceholderText('feature'), { target: { value: 'login' } })

    fireEvent.click(screen.getByText('Run Now'))

    expect(defaultProps.onRunNow).toHaveBeenCalledWith('Fix the bug in auth affecting login')
  })

  it('calls onStartFromTemplate with template and values', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await clickBugFixTemplate()

    await waitFor(() => {
      expect(screen.getByPlaceholderText('module')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('module'), { target: { value: 'auth' } })
    fireEvent.change(screen.getByPlaceholderText('feature'), { target: { value: 'login' } })

    fireEvent.click(screen.getByText('Add to Workflow'))

    expect(defaultProps.onStartFromTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      { MODULE: 'auth', FEATURE: 'login' },
    )
  })

  it('shows preview with hydrated content', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await clickBugFixTemplate()

    await waitFor(() => {
      expect(screen.getByText('Preview')).toBeInTheDocument()
    })
  })

  it('navigates back to list from template details', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await clickBugFixTemplate()

    await waitFor(() => {
      expect(screen.getByText(/Back to templates/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/Back to templates/))

    await waitFor(() => {
      expect(screen.getByText('Workflow Composer')).toBeInTheDocument()
    })
  })

  it('shows search input', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    expect(screen.getByPlaceholderText('Search templates...')).toBeInTheDocument()
  })

  it('enables Run Now for templates with no variables', async () => {
    render(<TemplateLauncher {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Review code changes')).toBeInTheDocument()
    })

    // Click the template card, not the category filter
    const descEl = screen.getByText('Review code changes')
    const templateCard = descEl.closest('button')!
    fireEvent.click(templateCard)

    await waitFor(() => {
      expect(screen.getByText('Run Now')).not.toBeDisabled()
    })
  })
})
