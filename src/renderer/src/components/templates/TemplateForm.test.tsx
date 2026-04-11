// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import TemplateForm from './TemplateForm'

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

describe('TemplateForm', () => {
  const templateWithVars = {
    id: 't1', name: 'Bug Fix', category: 'Bug Fix', description: 'Fix a bug',
    body: 'Fix the bug in {{MODULE}} affecting {{FEATURE}}',
    complexity: 'medium' as const, variables: ['MODULE', 'FEATURE'],
    source: 'user' as const, usageCount: 2, totalCost: 0.05, createdAt: Date.now(),
    recommendedModel: 'sonnet', recommendedPermissionMode: 'plan',
  }

  const templateNoVars = {
    id: 't2', name: 'Code Review', category: 'Code Review', description: 'Review code',
    body: 'Review the latest changes for quality issues',
    complexity: 'low' as const, variables: [],
    source: 'builtin' as const, usageCount: 0, totalCost: 0, createdAt: Date.now(),
  }

  const defaultProps = {
    template: templateWithVars,
    onSend: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onSend.mockReset()
    defaultProps.onCancel.mockReset()
  })

  it('renders template name and description', () => {
    render(<TemplateForm {...defaultProps} />)
    // "Bug Fix" appears as both the name (h3) and category badge (span)
    const bugFixElements = screen.getAllByText('Bug Fix')
    expect(bugFixElements.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Fix a bug')).toBeInTheDocument()
  })

  it('shows category badge', () => {
    render(<TemplateForm {...defaultProps} />)
    // Category badge is a span inside the metadata row
    const bugFixElements = screen.getAllByText('Bug Fix')
    expect(bugFixElements.length).toBeGreaterThanOrEqual(2)
  })

  it('shows recommended model', () => {
    render(<TemplateForm {...defaultProps} />)
    expect(screen.getByText('model: sonnet')).toBeInTheDocument()
  })

  it('shows recommended permission mode', () => {
    render(<TemplateForm {...defaultProps} />)
    expect(screen.getByText('mode: plan')).toBeInTheDocument()
  })

  it('renders variable input fields', () => {
    render(<TemplateForm {...defaultProps} />)
    expect(screen.getByText('Fill in Variables')).toBeInTheDocument()
    expect(screen.getByText('{{MODULE}}')).toBeInTheDocument()
    expect(screen.getByText('{{FEATURE}}')).toBeInTheDocument()
  })

  it('disables Send when variables are unfilled', () => {
    render(<TemplateForm {...defaultProps} />)
    expect(screen.getByText('Send to Active Session')).toBeDisabled()
  })

  it('enables Send when all variables are filled', () => {
    render(<TemplateForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('module'), { target: { value: 'auth' } })
    fireEvent.change(screen.getByPlaceholderText('feature'), { target: { value: 'login' } })

    expect(screen.getByText('Send to Active Session')).not.toBeDisabled()
  })

  it('calls onSend with hydrated prompt', () => {
    render(<TemplateForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('module'), { target: { value: 'auth' } })
    fireEvent.change(screen.getByPlaceholderText('feature'), { target: { value: 'login' } })

    fireEvent.click(screen.getByText('Send to Active Session'))

    expect(defaultProps.onSend).toHaveBeenCalledWith('Fix the bug in auth affecting login')
  })

  it('records template usage on send', () => {
    render(<TemplateForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('module'), { target: { value: 'auth' } })
    fireEvent.change(screen.getByPlaceholderText('feature'), { target: { value: 'login' } })

    fireEvent.click(screen.getByText('Send to Active Session'))

    expect(mockInvoke).toHaveBeenCalledWith('templates:record-usage', { id: 't1' })
  })

  it('calls onCancel when Cancel is clicked', () => {
    render(<TemplateForm {...defaultProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })

  it('shows live preview', () => {
    render(<TemplateForm {...defaultProps} />)
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('enables Send immediately for templates with no variables', () => {
    render(<TemplateForm {...defaultProps} template={templateNoVars} />)
    expect(screen.getByText('Send to Active Session')).not.toBeDisabled()
  })

  it('does not show Fill in Variables section for no-variable templates', () => {
    render(<TemplateForm {...defaultProps} template={templateNoVars} />)
    expect(screen.queryByText('Fill in Variables')).not.toBeInTheDocument()
  })

  it('shows unresolved variables in preview when unfilled', () => {
    render(<TemplateForm {...defaultProps} />)
    // The hydrated preview renders inside a <pre> tag with the original {{VAR}} placeholders
    const preEl = document.querySelector('pre')!
    expect(preEl.textContent).toContain('{{MODULE}}')
  })
})
