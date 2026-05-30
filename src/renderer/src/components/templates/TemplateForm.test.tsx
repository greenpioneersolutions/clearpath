// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import TemplateForm from './TemplateForm'
import type { PromptTemplate } from '../../types/template'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset().mockResolvedValue({})
  mockOn.mockReset().mockReturnValue(vi.fn())
})

describe('TemplateForm', () => {
  const templateWithVars: PromptTemplate = {
    id: 't1', name: 'Bug Fix', category: 'Bug Fix', description: 'Fix a bug',
    body: 'Fix the bug in {{MODULE}} affecting {{FEATURE}}',
    complexity: 'medium', variables: [
      { name: 'MODULE', type: 'text' },
      { name: 'FEATURE', type: 'text' },
    ],
    source: 'user', usageCount: 2, totalCost: 0.05, createdAt: Date.now(),
    recommendedModel: 'sonnet', recommendedPermissionMode: 'plan',
  }

  const templateNoVars: PromptTemplate = {
    id: 't2', name: 'Code Review', category: 'Code Review', description: 'Review code',
    body: 'Review the latest changes for quality issues',
    complexity: 'low', variables: [],
    source: 'builtin', usageCount: 0, totalCost: 0, createdAt: Date.now(),
  }

  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  const defaultProps = {
    template: templateWithVars,
    cli: 'copilot-cli' as const,
    context: 'session' as const,
    onSubmit,
    onCancel,
  }

  beforeEach(() => {
    onSubmit.mockReset()
    onCancel.mockReset()
  })

  it('renders template name and description', () => {
    render(<TemplateForm {...defaultProps} />)
    const bugFixElements = screen.getAllByText('Bug Fix')
    expect(bugFixElements.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Fix a bug')).toBeInTheDocument()
  })

  it('shows recommended model and permission mode', () => {
    render(<TemplateForm {...defaultProps} />)
    expect(screen.getByText('model: sonnet')).toBeInTheDocument()
    expect(screen.getByText('mode: plan')).toBeInTheDocument()
  })

  it('renders a labeled field per variable', () => {
    render(<TemplateForm {...defaultProps} />)
    expect(screen.getByText('Fill in Variables')).toBeInTheDocument()
    expect(screen.getByText('Module')).toBeInTheDocument()
    expect(screen.getByText('Feature')).toBeInTheDocument()
  })

  it('disables Send when required variables are unfilled', () => {
    render(<TemplateForm {...defaultProps} />)
    expect(screen.getByText('Send to Active Session')).toBeDisabled()
  })

  it('enables Send when all variables are filled', () => {
    render(<TemplateForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('module'), { target: { value: 'auth' } })
    fireEvent.change(screen.getByPlaceholderText('feature'), { target: { value: 'login' } })
    expect(screen.getByText('Send to Active Session')).not.toBeDisabled()
  })

  it('calls onSubmit with hydrated prompt + empty patch', () => {
    render(<TemplateForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('module'), { target: { value: 'auth' } })
    fireEvent.change(screen.getByPlaceholderText('feature'), { target: { value: 'login' } })
    fireEvent.click(screen.getByText('Send to Active Session'))
    expect(onSubmit).toHaveBeenCalledWith({ prompt: 'Fix the bug in auth affecting login', patch: {} })
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
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows live preview', () => {
    render(<TemplateForm {...defaultProps} />)
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('uses the launch label and enables Send for no-variable templates', () => {
    render(<TemplateForm {...defaultProps} template={templateNoVars} context="launch" />)
    expect(screen.getByText('Use Template')).not.toBeDisabled()
    expect(screen.queryByText('Fill in Variables')).not.toBeInTheDocument()
  })

  it('shows unresolved variables in preview when unfilled', () => {
    render(<TemplateForm {...defaultProps} />)
    const preEl = document.querySelector('pre')!
    expect(preEl.textContent).toContain('{{MODULE}}')
  })

  it('a model-typed variable configures the patch instead of the prompt', () => {
    const tpl: PromptTemplate = {
      ...templateNoVars,
      id: 't3', name: 'Preset', body: 'Do the thing.\n\n{{MODEL:model}}',
      variables: [{ name: 'MODEL', type: 'model' }],
    }
    render(<TemplateForm {...defaultProps} template={tpl} context="launch" />)
    // The MODEL token is stripped from the preview (it configures the session).
    const preEl = document.querySelector('pre')!
    expect(preEl.textContent).not.toContain('{{MODEL}}')
    expect(preEl.textContent).toContain('Do the thing.')
  })
})
