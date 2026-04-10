// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import TemplateEditor from './TemplateEditor'

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

describe('TemplateEditor', () => {
  const defaultProps = {
    onSaved: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onSaved.mockReset()
    defaultProps.onCancel.mockReset()
  })

  it('renders "Create Template" heading when no template provided', () => {
    render(<TemplateEditor {...defaultProps} />)
    expect(screen.getByText('Create Template')).toBeInTheDocument()
  })

  it('renders "Edit Template" heading when template is provided', () => {
    const template = {
      id: 't1', name: 'Existing', category: 'Bug Fix', description: 'Desc',
      body: 'Fix {{BUG}}', complexity: 'medium' as const, variables: ['BUG'],
      source: 'user' as const, usageCount: 0, totalCost: 0, createdAt: Date.now(),
    }
    render(<TemplateEditor {...defaultProps} template={template} />)
    expect(screen.getByText('Edit Template')).toBeInTheDocument()
  })

  it('populates form fields from existing template', () => {
    const template = {
      id: 't1', name: 'My Template', category: 'Testing', description: 'Test desc',
      body: 'Run tests on {{MODULE}}', complexity: 'high' as const, variables: ['MODULE'],
      source: 'user' as const, usageCount: 0, totalCost: 0, createdAt: Date.now(),
      recommendedModel: 'sonnet',
    }
    render(<TemplateEditor {...defaultProps} template={template} />)
    expect(screen.getByDisplayValue('My Template')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Test desc')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Run tests on {{MODULE}}')).toBeInTheDocument()
    expect(screen.getByDisplayValue('sonnet')).toBeInTheDocument()
  })

  it('detects variables from body and shows them', () => {
    render(<TemplateEditor {...defaultProps} />)
    const bodyTextarea = screen.getByPlaceholderText('Write your prompt template...')
    fireEvent.change(bodyTextarea, { target: { value: 'Fix {{BUG_ID}} in {{MODULE}}' } })

    expect(screen.getByText('{{BUG_ID}}')).toBeInTheDocument()
    expect(screen.getByText('{{MODULE}}')).toBeInTheDocument()
  })

  it('disables save when name is filled but body is empty', () => {
    render(<TemplateEditor {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Fix auth bug'), { target: { value: 'My Name' } })
    // Body is still empty, so Save should remain disabled
    expect(screen.getByText('Save Template')).toBeDisabled()
  })

  it('disables save button when name is empty', () => {
    render(<TemplateEditor {...defaultProps} />)
    expect(screen.getByText('Save Template')).toBeDisabled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    render(<TemplateEditor {...defaultProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })

  it('saves template and calls onSaved', async () => {
    const savedTemplate = {
      id: 'new-1', name: 'Test', category: 'Custom', description: '',
      body: 'Hello', complexity: 'medium', variables: [],
      source: 'user', usageCount: 0, totalCost: 0, createdAt: Date.now(),
    }
    mockInvoke.mockResolvedValue(savedTemplate)

    render(<TemplateEditor {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText('e.g. Fix auth bug'), { target: { value: 'Test' } })
    fireEvent.change(screen.getByPlaceholderText('Write your prompt template...'), { target: { value: 'Hello' } })

    fireEvent.click(screen.getByText('Save Template'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('templates:save', expect.objectContaining({
        name: 'Test',
        body: 'Hello',
      }))
      expect(defaultProps.onSaved).toHaveBeenCalledWith(savedTemplate)
    })
  })

  it('shows "Update Template" button for existing templates', () => {
    const template = {
      id: 't1', name: 'Existing', category: 'Bug Fix', description: '',
      body: 'Fix it', complexity: 'medium' as const, variables: [],
      source: 'user' as const, usageCount: 0, totalCost: 0, createdAt: Date.now(),
    }
    render(<TemplateEditor {...defaultProps} template={template} />)
    expect(screen.getByText('Update Template')).toBeInTheDocument()
  })

  it('uses initialBody when provided', () => {
    render(<TemplateEditor {...defaultProps} initialBody="Pre-filled body content" />)
    expect(screen.getByDisplayValue('Pre-filled body content')).toBeInTheDocument()
  })

  it('renders complexity selector', () => {
    render(<TemplateEditor {...defaultProps} />)
    expect(screen.getByText('Complexity')).toBeInTheDocument()
  })

  it('renders category selector with TEMPLATE_CATEGORIES', () => {
    render(<TemplateEditor {...defaultProps} />)
    expect(screen.getByText('Category')).toBeInTheDocument()
  })
})
