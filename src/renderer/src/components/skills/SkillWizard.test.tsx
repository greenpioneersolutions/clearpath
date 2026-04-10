// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import SkillWizard from './SkillWizard'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'skills:get-starters') return Promise.resolve([])
    if (channel === 'app:get-cwd') return Promise.resolve('/project')
    if (channel === 'skills:save') return Promise.resolve({ success: true })
    return Promise.resolve(undefined)
  })
})

describe('SkillWizard', () => {
  const defaultProps = {
    onSaved: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onSaved.mockReset()
    defaultProps.onCancel.mockReset()
  })

  it('renders "Create Skill" heading', () => {
    render(<SkillWizard {...defaultProps} />)
    expect(screen.getByText('Create Skill')).toBeInTheDocument()
  })

  it('shows step indicators (1-4)', () => {
    render(<SkillWizard {...defaultProps} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows Step 1 fields: name, description, scope, cli', () => {
    render(<SkillWizard {...defaultProps} />)
    expect(screen.getByText('Skill Name')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Scope')).toBeInTheDocument()
    expect(screen.getByText('CLI Target')).toBeInTheDocument()
  })

  it('disables Next when name is empty', () => {
    render(<SkillWizard {...defaultProps} />)
    const nextBtn = screen.getByText('Next: Content')
    expect(nextBtn).toBeDisabled()
  })

  it('enables Next when name is filled', () => {
    render(<SkillWizard {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), {
      target: { value: 'My Skill' },
    })
    expect(screen.getByText('Next: Content')).not.toBeDisabled()
  })

  it('shows slug preview when name is entered', () => {
    render(<SkillWizard {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), {
      target: { value: 'My Cool Skill' },
    })
    expect(screen.getByText(/my-cool-skill\/SKILL\.md/)).toBeInTheDocument()
  })

  it('advances to Step 2 on Next click', () => {
    render(<SkillWizard {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), {
      target: { value: 'Test Skill' },
    })
    fireEvent.click(screen.getByText('Next: Content'))

    expect(screen.getByText('Skill Content')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Write your skill instructions/)).toBeInTheDocument()
  })

  it('disables Next on Step 2 when body is empty', () => {
    render(<SkillWizard {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), {
      target: { value: 'Test Skill' },
    })
    fireEvent.click(screen.getByText('Next: Content'))

    const nextBtn = screen.getByText('Next: Options')
    expect(nextBtn).toBeDisabled()
  })

  it('advances to Step 3 with content filled', () => {
    render(<SkillWizard {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), {
      target: { value: 'Test Skill' },
    })
    fireEvent.click(screen.getByText('Next: Content'))

    fireEvent.change(screen.getByPlaceholderText(/Write your skill instructions/), {
      target: { value: 'Check for security issues' },
    })
    fireEvent.click(screen.getByText('Next: Options'))

    expect(screen.getByText(/Auto-invoke this skill/)).toBeInTheDocument()
  })

  it('shows auto-invoke toggle on Step 3', () => {
    render(<SkillWizard {...defaultProps} />)
    // Navigate to step 3
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByText('Next: Content'))
    fireEvent.change(screen.getByPlaceholderText(/Write your skill instructions/), { target: { value: 'Content' } })
    fireEvent.click(screen.getByText('Next: Options'))

    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('advances to Step 4 (Review) and shows summary', () => {
    render(<SkillWizard {...defaultProps} />)
    // Navigate to step 4
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), { target: { value: 'Test Skill' } })
    fireEvent.click(screen.getByText('Next: Content'))
    fireEvent.change(screen.getByPlaceholderText(/Write your skill instructions/), { target: { value: 'Do the thing' } })
    fireEvent.click(screen.getByText('Next: Options'))
    fireEvent.click(screen.getByText('Next: Review'))

    expect(screen.getByText('Test Skill')).toBeInTheDocument()
    expect(screen.getByText('Save Skill')).toBeInTheDocument()
  })

  it('saves skill on Step 4 Save click', async () => {
    render(<SkillWizard {...defaultProps} />)
    // Navigate to step 4
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), { target: { value: 'Test Skill' } })
    fireEvent.click(screen.getByText('Next: Content'))
    fireEvent.change(screen.getByPlaceholderText(/Write your skill instructions/), { target: { value: 'Do the thing' } })
    fireEvent.click(screen.getByText('Next: Options'))
    fireEvent.click(screen.getByText('Next: Review'))

    fireEvent.click(screen.getByText('Save Skill'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('skills:save', expect.objectContaining({
        name: 'Test Skill',
        body: 'Do the thing',
      }))
      expect(defaultProps.onSaved).toHaveBeenCalled()
    })
  })

  it('navigates back from Step 2 to Step 1', () => {
    render(<SkillWizard {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByText('Next: Content'))

    expect(screen.getByText('Skill Content')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))

    expect(screen.getByText('Skill Name')).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', () => {
    render(<SkillWizard {...defaultProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })

  it('uses initialContent when provided', () => {
    render(<SkillWizard {...defaultProps} initialContent="Pre-filled instructions" />)
    // Navigate to step 2
    fireEvent.change(screen.getByPlaceholderText('e.g. Code Review Checklist'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByText('Next: Content'))

    expect(screen.getByDisplayValue('Pre-filled instructions')).toBeInTheDocument()
  })
})
